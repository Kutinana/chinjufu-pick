#!/usr/bin/env node
/**
 * Refresh the locally bundled KanColle catalog and portraits.
 * Usage: node scripts/sync-ships.mjs [--skip-images] [--source-dir=/path]
 * --source-dir accepts ship.json, en-ships.json, zh-ships.json,
 * en-affix.json and zh-affix.json for an offline/catalog-only rebuild.
 * Downloads are build-time only: the deployed site never calls a wiki API.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = resolve(root, 'public/data');
const imageDir = resolve(root, 'public/ships');
const args = process.argv.slice(2);
const skipImages = args.includes('--skip-images');
const sourceDir = args.find((arg) => arg.startsWith('--source-dir='))?.slice(13);
const portraitRevision = '6b0534d291c27220da1b6fe454e91fc96a6a7b27';
const translationRevision = '208d8d8ae87ab90c51dee4ae3021ecf9afe5e2fa';
const translationRoot = `https://raw.githubusercontent.com/KC3Kai/kc3-translations/${translationRevision}/data`;
const portraitRoot = `https://raw.githubusercontent.com/KC3Kai/KC3Kai/${portraitRevision}/src/assets/img/ships`;
const sources = [
  { name: '舰娘百科 · kcdata ship catalog', url: 'https://kcwikizh.github.io/kcdata/ship/ship.json', reference: 'https://zh.kcwiki.cn/wiki/舰娘百科' },
  { name: 'KC3改 English ship names', url: `${translationRoot}/en/ships.json`, revision: translationRevision, license: 'MIT' },
  { name: 'KC3改 Simplified Chinese ship names', url: `${translationRoot}/scn/ships.json`, revision: translationRevision, license: 'MIT' },
  { name: '舰级名称 · KC3改 / kcwiki', url: `${translationRoot}/en/ctype.json`, revision: translationRevision },
  { name: 'KC3改 ship portraits', url: `https://github.com/KC3Kai/KC3Kai/tree/${portraitRevision}/src/assets/img/ships`, revision: portraitRevision },
];
const typeMap = { 1: 'DE', 2: 'DD', 3: 'CL', 4: 'CLT', 5: 'CA', 6: 'CAV', 7: 'CVL', 8: 'BB', 9: 'BB', 10: 'BBV', 11: 'CV', 12: 'BB', 13: 'SS', 14: 'SSV', 16: 'AV', 17: 'LHA', 18: 'CVB', 19: 'AR', 20: 'AS', 21: 'CT', 22: 'AO' };
// The kcdata catalog still uses Jervis's older transliteration; the full wiki
// article and its galleries are maintained under 杰维斯.
const chineseNameOverrides = { Jervis: '杰维斯', Jervis改: '杰维斯改' };

function chineseName(ship) {
  return chineseNameOverrides[ship.name] || ship.chinese_name || translatedName(ship, zh.value, zhAffix.value);
}

async function download(url, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000), headers: { 'User-Agent': 'ChinjufuPick/1.0 (public KanColle fan catalog)' } });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((done) => setTimeout(done, attempt * 500));
    }
  }
}

async function jsonSource(filename, url) {
  const buffer = sourceDir ? await readFile(resolve(sourceDir, filename)) : await download(url);
  const value = JSON.parse(buffer.toString('utf8'));
  return { value, sha256: createHash('sha256').update(buffer).digest('hex') };
}

await mkdir(dataDir, { recursive: true });
await mkdir(imageDir, { recursive: true });
const [master, en, zh, enAffix, zhAffix] = await Promise.all([
  jsonSource('ship.json', sources[0].url),
  jsonSource('en-ships.json', sources[1].url),
  jsonSource('zh-ships.json', sources[2].url),
  jsonSource('en-affix.json', `${translationRoot}/en/ship_affix.json`),
  jsonSource('zh-affix.json', `${translationRoot}/scn/ship_affix.json`),
]);

const classCatalog = JSON.parse(await readFile(resolve(dataDir, 'ship-classes.json'), 'utf8'));
const classesById = new Map(classCatalog.classes.map((item) => [Number(item.id), item]));

const forms = master.value.filter((ship) => ship.sort_no > 0 && typeMap[ship.stype]);
const byId = new Map(forms.map((ship) => [ship.id, ship]));
const parents = new Map(forms.map((ship) => [ship.id, ship.id]));
const incoming = new Map();
function find(id) {
  if (parents.get(id) !== id) parents.set(id, find(parents.get(id)));
  return parents.get(id);
}
for (const ship of forms) {
  const next = Number(ship.after_ship_id);
  if (byId.has(next)) {
    parents.set(find(next), find(ship.id));
    incoming.set(next, (incoming.get(next) ?? 0) + 1);
  }
}
const groups = new Map();
for (const ship of forms) {
  const id = find(ship.id);
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(ship);
}

function translatedName(ship, dictionary, affixes) {
  if (affixes.byId?.[ship.id]) return affixes.byId[ship.id];
  if (dictionary[ship.name]) return dictionary[ship.name];
  const base = Object.keys(dictionary).sort((a, b) => b.length - a.length).find((name) => ship.name.startsWith(name));
  if (!base) throw new Error(`Missing name translation: ${ship.id} ${ship.name}`);
  let suffix = ship.name.slice(base.length);
  const translated = [];
  const suffixes = Object.entries(affixes.suffixes ?? {}).sort(([a], [b]) => b.length - a.length);
  while (suffix) {
    const match = suffixes.find(([from]) => suffix.startsWith(from));
    if (!match) { translated.push(suffix); break; }
    translated.push(match[1]);
    suffix = suffix.slice(match[0].length);
  }
  return dictionary[base] + translated.join('');
}

function record(ship) {
  return {
    id: String(ship.id),
    names: { zh: chineseName(ship), ja: ship.name, en: translatedName(ship, en.value, enAffix.value) },
    typeId: typeMap[ship.stype],
    image: `/ships/${ship.id}.png`,
    wikiId: ship.wiki_id,
  };
}

const ships = [...groups.values()].map((group) => {
  // Souya's three interchangeable forms are a cycle, so the original ASU is explicit.
  const base = group.find((ship) => !incoming.has(ship.id)) ?? group.find((ship) => ship.id === 699) ?? [...group].sort((a, b) => a.sort_no - b.sort_no || a.id - b.id)[0];
  const depths = new Map([[base.id, 0]]);
  let current = base;
  while (current && byId.has(Number(current.after_ship_id)) && !depths.has(Number(current.after_ship_id))) {
    const next = Number(current.after_ship_id);
    depths.set(next, depths.get(current.id) + 1);
    current = byId.get(next);
  }
  const variants = group.filter((ship) => ship.id !== base.id).sort((a, b) => (depths.get(a.id) ?? 99) - (depths.get(b.id) ?? 99) || a.sort_no - b.sort_no || a.id - b.id).map(record);
  const shipClass = classesById.get(base.ctype);
  if (!shipClass) throw new Error(`Missing localized class ${base.ctype}; update public/data/ship-classes.json first.`);
  return { ...record(base), classId: shipClass.id, classNumber: base.cnum, className: shipClass.names, sortNo: base.sort_no, wikiUrl: `https://zh.kcwiki.cn/wiki/${encodeURIComponent(chineseName(base))}`, variants };
}).sort((a, b) => a.sortNo - b.sortNo || Number(a.id) - Number(b.id));

const fingerprints = { shipCatalog: master.sha256, enNames: en.sha256, zhNames: zh.sha256, enAffixes: enAffix.sha256, zhAffixes: zhAffix.sha256 };
const manifest = {
  updatedAt: new Date().toISOString(),
  sources,
  stats: { ships: ships.length, forms: forms.length, shipTypes: new Set(Object.values(typeMap)).size },
  grouping: 'Playable ships only. Remodel-connected forms belong to one ship. Type-changing remodels are available under each form’s ship type. Fast and slow battleships share BB.',
  ships,
};
await writeFile(resolve(dataDir, 'ships.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(resolve(root, 'public/data-sources.json'), `${JSON.stringify({ updatedAt: manifest.updatedAt, sources, fingerprints, notes: ['Ship names and remodel links come from kcwiki’s public game master catalog.', 'English names use KC3改 translations; Chinese names prefer kcwiki labels.', 'Normal portrait artwork belongs to the original KanColle rights holders (DMM / C2 / KADOKAWA). Source repository licensing does not transfer artwork copyright.', 'Game artwork is bundled locally so the deployed site has no runtime wiki or image-host dependency.'] }, null, 2)}\n`);
console.log(`Catalog written: ${ships.length} shipgirls, ${forms.length} forms.`);

if (!skipImages) {
  let position = 0;
  let downloaded = 0;
  const errors = [];
  const workers = Array.from({ length: 10 }, async () => {
    while (position < forms.length) {
      const ship = forms[position++];
      const target = resolve(imageDir, `${ship.id}.png`);
      try { if ((await stat(target)).size > 1000) continue; } catch { /* not downloaded yet */ }
      try {
        const buffer = await download(`${portraitRoot}/${ship.id}.png`);
        if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Expected PNG image');
        await writeFile(target, buffer);
        downloaded += 1;
        if (downloaded % 100 === 0) console.log(`Downloaded ${downloaded} portraits.`);
      } catch (error) { errors.push(`${ship.id} ${ship.name}: ${error.message}`); }
    }
  });
  await Promise.all(workers);
  if (errors.length) throw new Error(`Portrait downloads failed:\n${errors.join('\n')}`);
  console.log(`Portraits ready: ${forms.length} local PNGs (${downloaded} downloaded).`);
}
