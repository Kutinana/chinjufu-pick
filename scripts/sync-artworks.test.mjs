import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const ships = JSON.parse(await readFile(resolve(root, 'public/data/ships.json'), 'utf8')).ships;
const catalog = JSON.parse(await readFile(resolve(root, 'public/data/artworks.json'), 'utf8'));
const temporary = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

async function fixture(artworks) {
  const directory = await mkdtemp(resolve(tmpdir(), 'chinjufu-sync-test-'));
  temporary.push(directory);
  const input = resolve(directory, 'input.json');
  const output = resolve(directory, 'output.json');
  const cache = resolve(directory, 'cache');
  const assets = resolve(directory, 'assets');
  await mkdir(cache); await mkdir(assets);
  await writeFile(input, JSON.stringify({ ...catalog, artworks }));
  const invoke = (args, preload) => run(process.execPath, [
    ...(preload ? ['--import', preload] : []), resolve(root, 'scripts/sync-artworks.mjs'),
    `--catalog=${input}`, `--output=${output}`, `--cache=${cache}`, `--assets=${assets}`, ...args,
  ]);
  return { directory, input, output, cache, assets, invoke };
}

describe('combined artwork synchronization', () => {
  it('retains corrected sources and saved artwork IDs when a gallery combines forms', async () => {
    const ship = ships[0];
    const variant = ship.variants[0];
    const corrected = { ...catalog.artworks[0], id: `art-${ship.id}-aaaaaaaaaaaa`, shipId: ship.id, variantId: variant.id, variantIds: [variant.id],
      image: '/artworks/aaaaaaaaaaaa.webp', sourceLocked: true, sourceImage: 'https://uploads.kcwiki.cn/verified.png' };
    const other = catalog.artworks.find((artwork) => artwork.shipId !== ship.id);
    const test = await fixture([corrected, { ...other, sourceLocked: true }]);
    const filename = `KanMusu${ship.wikiId}${corrected.damage === 'damaged' ? 'Dmg' : ''}Illust.png`;
    await writeFile(resolve(test.cache, `page-${ship.id}.html`), `<li class="gallerybox"><a href="/wiki/File:${filename}"><img src="https://uploads.kcwiki.cn/commons/a/ab/${filename}"></a><div class="gallerytext">${ship.names.zh}/${variant.names.zh} ${corrected.damage === 'damaged' ? '中破' : '正常'}全身图</div></li>`);
    await test.invoke(['--limit=1', '--metadata-only']);
    const result = JSON.parse(await readFile(test.output, 'utf8')).artworks;
    expect(result.find((artwork) => artwork.id === corrected.id)).toEqual(corrected);
    expect(result.every((artwork) => artwork.shipId === ship.id)).toBe(true);
    expect(result.filter((artwork) => artwork.id !== corrected.id).some((artwork) => artwork.variantIds.includes(variant.id))).toBe(false);
  });

  it('keeps source locks in the catalog when an image download fails', async () => {
    const ship = ships[0];
    const corrected = { ...catalog.artworks[0], shipId: ship.id, variantId: ship.id, variantIds: [ship.id], sourceLocked: true };
    const test = await fixture([corrected]);
    await writeFile(resolve(test.cache, `page-${ship.id}.html`), '<html>No gallery</html>');
    const preload = resolve(test.directory, 'offline.mjs');
    await writeFile(preload, `globalThis.fetch = async () => { throw new Error('Offline fixture'); };`);
    await test.invoke(['--limit=1'], preload);
    const result = JSON.parse(await readFile(test.output, 'utf8'));
    expect(result.artworks).toEqual([corrected]);
    expect(result.coverage.imageFailures).toHaveLength(1);
  });

  it('applies reviewed artwork into the catalog without changing IDs or local asset paths', async () => {
    const artwork = { ...catalog.artworks[0], sourceCaption: '测试 图鉴立绘' };
    const test = await fixture([artwork]);
    const bytes = await readFile(resolve(root, 'public', artwork.image.slice(1)));
    await writeFile(resolve(test.cache, 'reviewed.webp'), bytes);
    await writeFile(resolve(test.cache, 'manifest.json'), JSON.stringify([
      { id: artwork.id, name: '测试', damage: artwork.damage, image: artwork.image, status: 'verified', webp: 'reviewed.webp',
        source: 'https://zh.kcwiki.cn/wiki/File:Verified.png', sourceImage: 'https://uploads.kcwiki.cn/Verified.png' },
    ]));
    await test.invoke(['--resolve-cards', '--apply']);
    const result = JSON.parse(await readFile(test.output, 'utf8')).artworks[0];
    expect(result).toMatchObject({ id: artwork.id, image: artwork.image, variantIds: artwork.variantIds, sourceLocked: true,
      sourceImage: 'https://uploads.kcwiki.cn/Verified.png', sourceCaption: `测试 ${artwork.damage === 'damaged' ? '中破' : '正常'}全身图` });
    expect(await readFile(resolve(test.assets, artwork.image.split('/').at(-1)))).toEqual(bytes);
    expect(JSON.parse(await readFile(test.input, 'utf8')).artworks[0]).toEqual(artwork);
  });

  it('rejects a stale review before writing the catalog or assets', async () => {
    const artwork = catalog.artworks[0];
    const test = await fixture([artwork]);
    await writeFile(resolve(test.cache, 'manifest.json'), JSON.stringify([
      { id: artwork.id, image: '/artworks/stale.webp', damage: artwork.damage, status: 'verified' },
    ]));
    await expect(test.invoke(['--resolve-cards', '--apply'])).rejects.toThrow('Stale review record');
    await expect(readFile(test.output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.skipIf(!process.env.CHINJUFU_TEST_PYTHON)('finds full illustrations through the API, rejects opaque cards and produces review sheets', async () => {
    const artwork = { ...catalog.artworks[0], sourceCaption: '测试 图鉴立绘' };
    const test = await fixture([artwork]);
    const python = process.env.CHINJUFU_TEST_PYTHON;
    await run(python, ['-c', `
from PIL import Image
import random, sys
rng = random.Random(1)
for transparent, name in [(False, 'opaque'), (True, 'full')]:
    image = Image.new('RGBA', (100, 100))
    image.putdata([(rng.randrange(256), rng.randrange(256), rng.randrange(256), 0 if transparent and y < 30 else 255) for y in range(100) for x in range(100)])
    image.save(sys.argv[1] + '/' + name + '.png')
`, test.directory]);
    const preload = resolve(test.directory, 'fetch.mjs');
    await writeFile(preload, `
import { readFile } from 'node:fs/promises';
globalThis.fetch = async (value) => {
  const url = new URL(value);
  if (url.pathname === '/api.php') {
    const titles = url.searchParams.get('titles').split('|');
    return new Response(JSON.stringify({ query: { pages: Object.fromEntries(titles.map((title, index) => [index, {
      title, imageinfo: [{ descriptionurl: 'https://zh.kcwiki.cn/wiki/' + title, url: 'https://uploads.kcwiki.cn/' + (title.includes('HD') ? 'opaque' : 'full') + '.png' }],
    }])) } }));
  }
  if (url.origin === 'https://uploads.kcwiki.cn') return new Response(await readFile(${JSON.stringify(test.directory)} + url.pathname));
  throw new Error('Unexpected network request: ' + url.href);
};`);
    const csv = resolve(test.directory, 'links.csv');
    await writeFile(csv, `\uFEFF舰娘,立绘 ID,正确透明立绘链接（待填写）\r\n"测试,\n""舰娘""",${artwork.id},https://zh.kcwiki.cn/wiki/File:ManualHDIllust.png\r\n`);
    await test.invoke(['--resolve-cards', `--python=${python}`, `--csv=${csv}`], preload);
    const records = JSON.parse(await readFile(resolve(test.cache, 'manifest.json'), 'utf8'));
    expect(records[0]).toMatchObject({ id: artwork.id, status: 'verified', transparentFraction: 0.3 });
    expect(records[0].candidates[0]).toBe('File:ManualHDIllust.png');
    expect(records[0].rejected).toHaveLength(2);
    expect(records[0].rejected.every((record) => record.reason === 'No substantial transparent background')).toBe(true);
    expect((await readFile(resolve(test.cache, 'review-00.jpg'))).length).toBeGreaterThan(1000);
    expect(JSON.parse(await readFile(test.input, 'utf8')).artworks[0]).toEqual(artwork);
    await expect(readFile(test.output)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
