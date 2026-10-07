import { createHash } from 'node:crypto';
import { readFile, open } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'public');
const ships = JSON.parse(await readFile(resolve(publicDir, 'data/ships.json'), 'utf8')).ships;
const catalog = JSON.parse(await readFile(resolve(publicDir, 'data/artworks.json'), 'utf8'));
const avatarCrops = JSON.parse(await readFile(resolve(publicDir, 'data/avatar-crops.json'), 'utf8'));
const issues = [];
const files = new Set();
const forms = new Map();
for (const ship of ships) {
  if (!ship.classId) issues.push(`Missing class ID: ${ship.id}`);
  for (const language of ['zh', 'ja', 'en']) if (!ship.className?.[language]?.trim()) issues.push(`Missing ${language} class name: ${ship.id}`);
  for (const form of [ship, ...(ship.variants ?? [])]) {
    if (forms.has(form.id)) issues.push(`Duplicate form: ${form.id}`);
    forms.set(form.id, { ...form, shipId: ship.id });
    for (const language of ['zh', 'ja', 'en']) if (!form.names?.[language]?.trim()) issues.push(`Missing ${language} name: ${form.id}`);
    files.add(form.image);
  }
}
const artIds = new Set();
for (const art of catalog.artworks) {
  if (artIds.has(art.id)) issues.push(`Duplicate artwork: ${art.id}`);
  artIds.add(art.id);
  for (const id of art.variantIds ?? [art.variantId]) if (forms.get(id)?.shipId !== art.shipId) issues.push(`Invalid artwork form mapping: ${art.id}/${id}`);
  for (const language of ['zh', 'ja', 'en']) if (!art.names?.[language]?.trim()) issues.push(`Missing ${language} artwork name: ${art.id}`);
  const crop = avatarCrops.images?.[art.image];
  if (!crop?.rect || !crop.size || crop.method === 'unresolved') issues.push(`Missing avatar coordinates: ${art.id}`);
  else {
    const [x, y, w, h] = crop.rect;
    const [iw, ih] = crop.size;
    if (![x, y, w, h, iw, ih].every(Number.isInteger) || x < 0 || y < 0 || w <= 0 || h <= 0 || w !== h || x + w > iw || y + h > ih) issues.push(`Invalid avatar rectangle: ${art.id}`);
    if (crop.sha256 !== createHash('sha256').update(await readFile(resolve(publicDir, art.image.slice(1)))).digest('hex')) issues.push(`Stale avatar coordinates: ${art.id}`);
  }
  files.add(art.image);
}
for (const path of files) {
  const absolute = resolve(publicDir, String(path).replace(/^\//, ''));
  if (!absolute.startsWith(publicDir + sep)) { issues.push(`Invalid asset path: ${path}`); continue; }
  try {
    const file = await open(absolute, 'r');
    const bytes = Buffer.alloc(12);
    await file.read(bytes, 0, 12, 0); await file.close();
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !webp && !jpeg) issues.push(`Invalid image: ${path}`);
  } catch { issues.push(`Missing image: ${path}`); }
}
if (catalog.coverage?.syncing) issues.push('Artwork synchronization is still running.');
if (issues.length) {
  console.error(issues.join('\n')); process.exitCode = 1;
} else {
  console.log(`Data verified: ${ships.length} shipgirls, ${forms.size} forms, ${catalog.artworks.length} illustrations, ${files.size} local images, ${Object.keys(avatarCrops.images).length} avatar rectangles.`);
}
