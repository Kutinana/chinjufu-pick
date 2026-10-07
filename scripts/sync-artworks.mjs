#!/usr/bin/env node
/**
 * Collect verified ship illustrations from the public galleries on kcwiki.
 * No inferred image URLs are published: every entry comes from a gallery image
 * or an existing standard card in the source page, and downloaded images are
 * checked for their file signature. Local assets keep canvas export same-origin.
 *
 * node scripts/sync-artworks.mjs [--limit=10] [--concurrency=4]
 *   [--no-download] [--metadata-only] [--refresh]
 *   [--python=/path/to/python-with-pillow] [--max-size=1000]
 *   [--output=/tmp/catalog.json] [--cache=/tmp/chinjufu-artwork-cache]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, unlink, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.length ? value.join('=') : true];
}));
const cacheDir = String(args.get('cache') || '/tmp/chinjufu-artwork-cache');
const concurrency = Math.max(1, Math.min(8, Number(args.get('concurrency') || 4)));
const metadataOnly = args.has('metadata-only');
const download = !args.has('no-download') && !metadataOnly;
const refresh = args.has('refresh');
const python = args.get('python');
const maxSize = Math.max(600, Number(args.get('max-size') || 1000));
const runFile = promisify(execFile);
const outputDir = resolve(root, 'public/artworks');
const outputPath = args.get('output') ? resolve(String(args.get('output'))) : resolve(root, 'public/data/artworks.json');
// The older kcdata spelling has a short stub; the English redirect reaches the
// complete current gallery and avoids guessing a Chinese transliteration.
const wikiPageOverrides = { '519': 'Jervis' };
const sharedStandardForms = {
  '743': { original: '543', source: 'https://wikiwiki.jp/kancolle/長波改二補' },
};
// Explicit, verified corrections retain artwork IDs so saved boards keep working.
const sourceOverrides = JSON.parse(await readFile(resolve(root, 'scripts/artwork-source-overrides.json'), 'utf8'));
const shipsDocument = JSON.parse(await readFile(resolve(root, 'public/data/ships.json'), 'utf8'));
const allShips = shipsDocument.ships;
const ships = args.has('limit') ? allShips.slice(0, Number(args.get('limit'))) : allShips;
await mkdir(cacheDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const entity = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const text = (html) => entity(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim();
const normalizeName = (name) => name.normalize('NFKC').replace(/\s+/g, '');
const attrs = (html) => Object.fromEntries([...html.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], entity(m[2])]));
const validImage = (bytes) => bytes.length > 1000 && (
  bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
  bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
  (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
);

async function request(url, binary = false) {
  let error;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(35_000),
        headers: { 'User-Agent': 'ChinjufuPick/1.0 (non-commercial fan artwork catalog; source attribution retained)' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = Buffer.from(await response.arrayBuffer());
      if (binary && !validImage(result)) throw new Error('Response is not a supported image');
      return binary ? result : result.toString('utf8');
    } catch (caught) {
      error = caught;
      await sleep(400 * (attempt + 1));
    }
  }
  throw new Error(`${url}: ${error.message}`);
}

async function pool(items, callback) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await callback(items[index], index);
    }
  }));
}

function originalUrl(url) {
  // MediaWiki gallery previews put the actual filename before /120px-...
  return entity(url).replace('/commons/thumb/', '/commons/').replace(/\/(?:\d+px-|lossy-page\d+-)[^/]+$/, '');
}

const seasons = [
  [/WhiteDay|白色情人|ホワイトデー/i, '白色情人节', 'ホワイトデー', 'White Day'],
  [/Valentine|情人节|情人節|バレンタイン/i, '情人节', 'バレンタイン', "Valentine’s Day"],
  [/Shinnen|NewYear|新年|新春|正月/i, '新年', '新年', 'New Year'],
  [/Setsubun|Setubunn|节分|節分/i, '节分', '節分', 'Setsubun'],
  [/Xmas|Christmas|圣诞|聖誕|クリスマス/i, '圣诞节', 'クリスマス', 'Christmas'],
  [/Halloween|万圣|萬聖|ハロウィン/i, '万圣节', 'ハロウィン', 'Halloween'],
  [/Tsuyu|Rainy|梅雨/i, '梅雨', '梅雨', 'Rainy Season'],
  [/Yukata|浴衣/i, '浴衣', '浴衣', 'Yukata'],
  [/Swimsuit|Summer|Mizugi|Seika|Shoka|盛夏|夏季|夏日|初夏|水着|泳装|泳裝/i, '夏季', '夏季', 'Summer'],
  [/Autumn|Fall|Shoshuu|秋季|初秋/i, '秋季', '秋季', 'Autumn'],
  [/Hinamatsuri|Hinamaturi|女儿节|女兒節|ひな祭り/i, '女儿节', 'ひな祭り', 'Hinamatsuri'],
  [/Saury|Sanma|秋刀鱼|秋刀魚/i, '秋刀鱼祭', '秋刀魚祭り', 'Saury Festival'],
  [/Otsukimi|Tsukimi|赏月|賞月|お月見/i, '赏月', 'お月見', 'Moon Viewing'],
  [/Spring|Haru|春季/i, '春季', '春季', 'Spring'],
  [/Anniversary|Shunen|周年/i, '周年纪念', '周年記念', 'Anniversary'],
  [/Oktoberfest|啤酒节|啤酒節/i, '啤酒节', 'オクトーバーフェスト', 'Oktoberfest'],
  [/EveOfBattle|决战|決戰|決戦/i, '决战', '決戦', 'Decisive Battle'],
  [/Nenmatsu|年末/i, '年末', '年末', 'Year End'],
  [/Sakura|樱花|櫻花|桜/i, '樱花季', '桜', 'Cherry Blossoms'],
  [/Nakau|なか卯|中卯/i, 'なか卯联动', 'なか卯コラボ', 'Nakau Collaboration'],
  [/Sukiya|食其家|すき家/i, '食其家联动', 'すき家コラボ', 'Sukiya Collaboration'],
  [/WinterUniform|冬服|冬季制服/i, '冬季制服', '冬服', 'Winter Uniform'],
  [/uchiage|烟火|煙火|焰火|花火/i, '烟火', '打ち上げ花火', 'Fireworks'],
];

function namesFor(caption, file, variant, kind) {
  if (kind === 'standard') return {
    zh: `${variant.names.zh} · 原版立绘`,
    ja: `${variant.names.ja} · 通常立ち絵`,
    en: `${variant.names.en} · Standard artwork`,
  };
  const sourceEvent = caption.replaceAll(variant.names.zh, '').replaceAll(variant.names.ja, '').replaceAll(variant.names.en, '');
  const sourceMatch = seasons.find(([pattern]) => pattern.test(sourceEvent));
  // Gallery captions take precedence over legacy filenames: some Nakau
  // collaboration art is historically named Sukiya2016 in the wiki files.
  // Unknown collaborations keep the generic translated label rather than
  // assigning the event named by a contradictory filename.
  const matched = sourceMatch || (!/联动|聯動|コラボ/.test(sourceEvent) ? seasons.find(([pattern]) => pattern.test(file)) : undefined);
  // When the source has no recognized event label, preserve its title rather
  // than invent a translation or a date.
  if (!matched) return {
    zh: caption,
    ja: `${variant.names.ja} · 限定立ち絵`,
    en: `${variant.names.en} · Limited artwork`,
  };
  const year = caption.match(/20\d{2}/)?.[0] || file.match(/20\d{2}/)?.[0] || '';
  return {
    zh: caption,
    ja: `${variant.names.ja} · ${year ? `${year}年 ` : ''}${matched[2]}`,
    en: `${variant.names.en} · ${matched[3]}${year ? ` ${year}` : ''}`,
  };
}

function imagesFromPage(html) {
  const found = [];
  for (const block of html.matchAll(/<li class="gallerybox"[\s\S]*?<\/li>/g)) {
    const file = block[0].match(/href="\/wiki\/(?:File|文件):([^"]+)"/i)?.[1];
    const caption = text(block[0].match(/<div class="gallerytext">([\s\S]*?)<\/div>/)?.[1] || '');
    const image = attrs(block[0].match(/<img\b[^>]*>/)?.[0] || '');
    if (!file || !caption) continue;
    // Newer galleries also use the game's 0651_3753_... filenames. Matching
    // their source captions to known ship forms happens below.
    if (/Banner|Card|Icon|Logo/i.test(file)) continue;
    const raw = image['data-url'] || image.src || '';
    if (!raw.startsWith('https://uploads.kcwiki.cn/')) continue;
    found.push({ file: decodeURIComponent(entity(file)), caption, url: originalUrl(raw) });
  }
  return found;
}

const artworks = [];
const pageFailures = [];
let processed = 0;
await pool(ships, async (ship) => {
  const source = wikiPageOverrides[ship.id] ? `https://zh.kcwiki.cn/wiki/${encodeURIComponent(wikiPageOverrides[ship.id])}` : (ship.wikiUrl || `https://zh.kcwiki.cn/wiki/${encodeURIComponent(ship.names.zh)}`);
  const pageCache = resolve(cacheDir, `page-${ship.id}.html`);
  try {
    let html;
    try { if (!refresh) html = await readFile(pageCache, 'utf8'); } catch {}
    if (!html || (wikiPageOverrides[ship.id] && !html.includes('gallerybox'))) { html = await request(source); await writeFile(pageCache, html); }
    const variants = [ship, ...(ship.variants || [])];
    const files = new Map(imagesFromPage(html).map((image) => [image.file, image]));
    for (const image of files.values()) {
      const wikiId = image.file.match(/^KanMusu(\d+[a-z]?)(?=HD|Dmg|Illust|Portrait)/i)?.[1];
      const apiId = image.file.match(/^(\d{4})_\d+_[a-z]+\./i)?.[1];
      const applicable = variants.filter((v) => Object.values(v.names).some((name) => {
        const escaped = [...normalizeName(name)].map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
        return new RegExp(`(?:^|[/／、])\\s*${escaped}(?=\\s|[/／、・·]|全身|中破|大破|正常|立绘|立繪|限定|$)`).test(image.caption.normalize('NFKC'));
      }));
      const direct = variants.find((v) => (wikiId && v.wikiId === wikiId) || (apiId && Number(v.id) === Number(apiId))) || applicable[0];
      if (!direct) continue;
      if (/KanMusu/i.test(image.file) && !/Illust|Portrait/i.test(image.file)) continue;
      // Nonstandard filenames are accepted only when the gallery explicitly
      // names a known ship form; this excludes miscellaneous reference photos.
      if (!/KanMusu/i.test(image.file) && !applicable.length) continue;
      const variantIds = [...new Set([direct.id, ...applicable.map((v) => v.id)])];
      const damage = /Dmg|中破|大破|Damaged/i.test(`${image.file} ${image.caption}`) ? 'damaged' : 'normal';
      const suffix = /^KanMusu/i.test(image.file) ? image.file.replace(/^KanMusu\d+[a-z]?(?:HD)?(?:Dmg)?(?:Illust|Portrait)/i, '').replace(/\.[^.]+$/, '').replace(/^HD$/i, '') : '';
      let captionRemainder = normalizeName(image.caption);
      const sourceNames = [...new Set(variants.flatMap((v) => Object.values(v.names).map(normalizeName)))].sort((a, b) => b.length - a.length);
      for (const name of sourceNames) captionRemainder = captionRemainder.replaceAll(name, '');
      captionRemainder = captionRemainder.replace(/中破|大破|正常|通常|全身图|全身圖|全身|立绘图|立繪圖|立绘|立繪|立ち絵|原版|标准|標準|[\s/／、・·]/g, '');
      const kind = suffix || captionRemainder ? 'seasonal' : 'standard';
      const key = createHash('sha1').update(image.file).digest('hex').slice(0, 12);
      const extension = python ? '.webp' : (extname(image.file).toLowerCase() || '.png');
      const record = {
        id: `art-${ship.id}-${key}`,
        shipId: ship.id,
        variantId: direct.id,
        variantIds,
        names: namesFor(image.caption, image.file, direct, kind),
        kind,
        damage,
        image: `/artworks/${key}${extension}`,
        source,
        sourceImage: image.url,
        sourceCaption: image.caption,
      };
      artworks.push(record);
    }
  } catch (error) { pageFailures.push({ shipId: ship.id, source, error: error.message }); }
  processed += 1;
  if (processed % 20 === 0 || processed === ships.length) console.log(`Pages ${processed}/${ships.length}; found ${artworks.length} verified illustrations`);
});

// The 2026 reinforcing remodel retains Naganami Kai Ni's graphics. The shared
// mapping is backed by the linked Japanese wiki's update notes, rather than a
// synthesized file URL or a fabricated new illustration.
for (const artwork of artworks) if (artwork.kind === 'standard') {
  for (const [formId, shared] of Object.entries(sharedStandardForms)) if (artwork.variantIds.includes(shared.original)) {
    artwork.variantIds.push(formId);
    artwork.sharedVariantSource = shared.source;
  }
}

// Prefer full illustrations even when they are outside the gallery. Card-only
// fallbacks are tracked separately in docs/card-artwork-fallbacks.html for review.
for (const ship of ships) {
  let html;
  try { html = await readFile(resolve(cacheDir, `page-${ship.id}.html`), 'utf8'); } catch { continue; }
  for (const variant of [ship, ...(ship.variants || [])]) {
    for (const damage of ['normal', 'damaged']) {
      if (artworks.some((a) => a.shipId === ship.id && a.kind === 'standard' && a.damage === damage && a.variantIds.includes(variant.id))) continue;
      if (!variant.wikiId) continue;
      const stem = `KanMusu${variant.wikiId}`;
      const state = damage === 'damaged' ? 'Dmg' : '';
      const candidates = [`${stem}HD${state}Illust.png`, `${stem}${state}Illust.png`, `${stem}HD${state}.png`, `${stem}${state}.png`];
      for (const filename of candidates) {
        const encoded = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const image = html.match(new RegExp(`<img\\b(?=[^>]*alt="${encoded}")[^>]*>`, 'i'))?.[0];
        if (!image) continue;
        const attr = attrs(image);
        const raw = attr['data-url'] || attr.src || '';
        if (!raw.startsWith('https://uploads.kcwiki.cn/')) continue;
        const key = createHash('sha1').update(filename).digest('hex').slice(0, 12);
        artworks.push({
          id: `art-${ship.id}-${key}`, shipId: ship.id, variantId: variant.id, variantIds: [variant.id],
          names: namesFor('', filename, variant, 'standard'), kind: 'standard', damage,
          image: `/artworks/${key}${python ? '.webp' : '.png'}`, source: ship.wikiUrl || `https://zh.kcwiki.cn/wiki/${encodeURIComponent(ship.names.zh)}`,
          sourceImage: originalUrl(raw), sourceCaption: `${variant.names.zh} ${damage === 'damaged' ? '中破' : '正常'}${filename.includes('Illust') ? '全身图' : '图鉴立绘'}`,
        });
        break;
      }
    }
  }
}

const correctedImages = new Set();
for (const [id, correction] of Object.entries(sourceOverrides)) {
  let artwork = artworks.find((artwork) => artwork.id === id) || artworks.find((artwork) => artwork.kind === 'standard' && artwork.shipId === correction.shipId && artwork.damage === correction.damage && artwork.variantId === correction.variantId);
  if (!artwork) {
    // Keep a separate stable record for each corrected saved selection, even
    // when the wiki gallery later combines several forms under one image.
    const shared = artworks.find((artwork) => artwork.kind === 'standard' && artwork.shipId === correction.shipId && artwork.damage === correction.damage && artwork.variantIds.includes(correction.variantId));
    if (shared) {
      artwork = { ...shared, variantIds: [correction.variantId] };
      shared.variantIds = shared.variantIds.filter((variantId) => variantId !== correction.variantId);
    }
    else {
      const ship = allShips.find((ship) => ship.id === correction.shipId);
      const variant = [ship, ...(ship?.variants || [])].find((variant) => variant?.id === correction.variantId);
      if (variant) artwork = { kind: 'standard', variantIds: [correction.variantId], names: namesFor('', '', variant, 'standard') };
    }
    if (artwork) artworks.push(artwork);
  }
  if (artwork) {
    Object.assign(artwork, correction, { id });
    correctedImages.add(artwork.image);
  }
}

const uniqueImages = [...new Map(artworks.map((a) => [a.image, a])).values()];
const failedImages = new Set();
const imageFailures = [];
const confirmedImages = new Set();
let completed = 0;
if (download) await pool(uniqueImages, async (artwork) => {
  const destination = resolve(outputDir, basename(artwork.image));
  try {
    let exists = false;
    try { exists = (await stat(destination)).size > 1000; } catch {}
    if (!exists || correctedImages.has(artwork.image)) {
      if (python) {
        const originalPath = resolve(cacheDir, `image-${basename(artwork.image, '.webp')}.png`);
        let originalExists = false;
        try { originalExists = (await stat(originalPath)).size > 1000; } catch {}
        if (!originalExists || correctedImages.has(artwork.image)) await writeFile(originalPath, await request(artwork.sourceImage, true));
        await runFile(String(python), ['-c', 'from PIL import Image; import sys; im=Image.open(sys.argv[1]); im.thumbnail((int(sys.argv[3]), int(sys.argv[3])), Image.Resampling.LANCZOS); im.save(sys.argv[2], "WEBP", quality=88, method=4)', originalPath, destination, String(maxSize)]);
      } else await writeFile(destination, await request(artwork.sourceImage, true));
    }
    confirmedImages.add(artwork.image);
  } catch (error) {
    failedImages.add(artwork.image);
    imageFailures.push({ image: artwork.image, sourceImage: artwork.sourceImage, error: error.message });
  }
  completed += 1;
  if (completed % 100 === 0 || completed === uniqueImages.length) {
    console.log(`Images ${completed}/${uniqueImages.length}; unavailable ${failedImages.size}`);
    if (completed < uniqueImages.length) {
      await writeFile(outputPath, `${JSON.stringify(makeDocument(artworks.filter((a) => confirmedImages.has(a.image)), true), null, 2)}\n`);
    }
  }
});

const available = artworks.filter((a) => !failedImages.has(a.image)).map((a) => download || metadataOnly ? a : { ...a, image: a.sourceImage });
available.sort((a, b) => Number(a.shipId) - Number(b.shipId) || Number(a.variantId) - Number(b.variantId) || (a.kind === b.kind ? 0 : a.kind === 'standard' ? -1 : 1) || a.names.zh.localeCompare(b.names.zh, 'zh') || a.damage.localeCompare(b.damage));
function makeDocument(available, syncing = false) {
  const forms = new Set(ships.flatMap((ship) => [ship, ...(ship.variants || [])].map((variant) => `${ship.id}:${variant.id}`)));
  const coveredForms = (damage) => new Set(available.filter((artwork) => artwork.kind === 'standard' && artwork.damage === damage).flatMap((artwork) => artwork.variantIds.map((variantId) => `${artwork.shipId}:${variantId}`)).filter((form) => forms.has(form))).size;
  return {
  updatedAt: new Date().toISOString(),
  sources: [
    { name: '舰娘百科 · 公开舰娘条目立绘画廊', url: 'https://zh.kcwiki.cn/wiki/舰娘百科' },
    { name: 'kcwiki 中文舰娘数据 · 图鉴编号映射', url: 'https://kcwikizh.github.io/kcdata/ship/ship.json' },
  ],
  coverage: {
    syncing,
    ships: ships.length,
    shipsWithArt: new Set(available.map((a) => a.shipId)).size,
    forms: forms.size,
    formsWithStandardNormal: coveredForms('normal'),
    formsWithStandardDamaged: coveredForms('damaged'),
    artworks: available.length,
    standard: available.filter((a) => a.kind === 'standard').length,
    seasonal: available.filter((a) => a.kind === 'seasonal').length,
    normal: available.filter((a) => a.damage === 'normal').length,
    damaged: available.filter((a) => a.damage === 'damaged').length,
    pageFailures, imageFailures,
  },
  artworks: available,
}; }
const document = makeDocument(available);
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
if (python && download) for (const artwork of available) {
  // The manifest now refers to WebP, so matching legacy PNG copies can safely
  // be removed. Wiki originals remain in the cache for reproducible conversion.
  try { await unlink(resolve(outputDir, `${basename(artwork.image, '.webp')}.png`)); } catch {}
}
if (download && !args.has('limit') && !args.has('no-prune')) {
  const keep = new Set(available.map((artwork) => basename(artwork.image)));
  for (const filename of await readdir(outputDir)) {
    // Only this script's hash-named assets are owned here. Leave unrelated files
    // untouched even when they happen to live in the same directory.
    if (/^[a-f0-9]{12}\.(?:png|jpe?g|webp)$/i.test(filename) && !keep.has(filename)) await unlink(resolve(outputDir, filename));
  }
}
console.log(JSON.stringify(document.coverage, null, 2));
