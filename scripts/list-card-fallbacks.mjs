#!/usr/bin/env node
// Review inventory only; generated files stay outside the deployed public assets.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { ships } = JSON.parse(await readFile(resolve(root, 'public/data/ships.json'), 'utf8'));
const { artworks } = JSON.parse(await readFile(resolve(root, 'public/data/artworks.json'), 'utf8'));
const forms = new Map(ships.flatMap(ship => [ship, ...(ship.variants ?? [])].map(form => [form.id, { ...form, ship }])));
const cards = artworks.filter(art => art.sourceCaption?.includes('图鉴立绘'));
const grouped = new Map();
for (const art of cards) {
  const form = forms.get(art.variantId);
  if (!grouped.has(form.id)) grouped.set(form.id, { form, cards: [] });
  grouped.get(form.id).cards.push(art);
}
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const header = ['舰娘', '改装形态（中文）', '改装形态（日文）', '游戏形态 ID', '图鉴编号', '状态', '立绘 ID', '当前卡面原图', '百科条目', '正确透明立绘链接（待填写）'];
const rows = cards.map(art => {
  const form = forms.get(art.variantId);
  return [form.ship.names.zh, form.names.zh, form.names.ja, form.id, form.wikiId, art.damage === 'normal' ? '正常' : '中破', art.id, art.sourceImage, art.source, ''];
});
const existingCsv = await readFile(resolve(root, 'docs/card-artwork-fallbacks.csv'), 'utf8').catch(() => null);
const writeCsv = !process.argv.includes('--html-only') && (existingCsv === null || process.argv.includes('--write-csv'));
if (writeCsv) await writeFile(resolve(root, 'docs/card-artwork-fallbacks.csv'), '\uFEFF' + [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n');

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const count = new Set(cards.map(art => art.shipId)).size;
const sections = [...grouped.values()].map(({ form, cards }, index) => {
  const cell = damage => {
    const art = cards.find(art => art.damage === damage);
    return art ? `<a class="card" href="${esc(art.sourceImage)}" target="_blank" rel="noreferrer"><img loading="lazy" src="../public${esc(art.image)}" alt="${esc(form.names.zh)} ${damage === 'normal' ? '正常' : '中破'}当前卡面"><span>${esc(art.sourceImage.split('/').pop())}</span></a>` : '<span class="ok">已有全身立绘</span>';
  };
  return `<tr data-search="${esc([form.ship.names.zh, form.names.zh, form.names.ja, form.names.en, form.wikiId, form.id].join(' ').toLowerCase())}"><td>${index + 1}</td><td><strong>${esc(form.names.zh)}</strong><small>${esc(form.names.ja)} · ${esc(form.names.en)}</small><small>形态 ID ${esc(form.id)} · 图鉴 ${esc(form.wikiId)}</small><a href="${esc(form.ship.wikiUrl || cards[0].source)}" target="_blank" rel="noreferrer">百科条目 ↗</a></td><td>${cell('normal')}</td><td>${cell('damaged')}</td></tr>`;
}).join('\n');
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>待替换的图鉴卡面清单</title><style>
*{box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#f3f6f9;color:#203247;margin:0;padding:32px}main{max-width:1100px;margin:auto}h1{font-size:26px}p{line-height:1.7;color:#526579}a{color:#126b99}input{padding:12px 16px;border:1px solid #becbd5;border-radius:8px;width:100%;margin:14px 0 22px;font:inherit}table{width:100%;border-collapse:collapse;background:white}th{background:#203247;color:white;text-align:left;position:sticky;top:0}th,td{padding:15px;border-bottom:1px solid #e4eaf0;vertical-align:top}small{display:block;color:#64778a;margin:8px 0}.card{display:flex;gap:12px;align-items:center;text-decoration:none;font-size:12px;overflow-wrap:anywhere}.card img{width:90px;height:124px;object-fit:contain;background:#edf3f6}.card span{max-width:150px}.ok{color:#788c79;font-size:13px}[hidden]{display:none}@media(max-width:700px){body{padding:15px}th,td{padding:8px}.card{display:block}.card img{width:70px;height:96px}h1{font-size:22px}}
</style><main><h1>待替换的图鉴卡面清单</h1><p>共 ${cards.length} 张卡面，涉及 ${grouped.size} 个改装形态、${count} 位舰娘。${cards.length ? '正常和中破分别列出；点击缩略图可打开当前卡面原图。' : '原先补齐的 186 张卡面已全部替换为透明全身立绘。'}</p><p>${cards.length ? '请提供舰娘形态、状态和正确图片或文件页链接；也可在 <a href="card-artwork-fallbacks.csv">CSV 清单</a>的最后一列填写。清单中的“已有全身立绘”仅表示该状态未使用卡面补齐。' : '<a href="artwork-resolution.json">查看来源核实与替换记录</a>。<a href="card-artwork-fallbacks.csv">原 CSV</a>保留为历史清单。'}</p><input type="search" aria-label="搜索舰娘或图鉴编号" placeholder="搜索舰娘、改装形态或图鉴编号…"><table><thead><tr><th>#</th><th>舰娘形态</th><th>正常版</th><th>中破版</th></tr></thead><tbody>${sections}</tbody></table></main><script>document.querySelector('input').addEventListener('input',event=>{const query=event.target.value.trim().toLowerCase();for(const row of document.querySelectorAll('tbody tr'))row.hidden=!row.dataset.search.includes(query)});</script></html>`;
await writeFile(resolve(root, 'docs/card-artwork-fallbacks.html'), html);
console.log(`${cards.length} card illustrations, ${grouped.size} forms, ${count} shipgirls; ${writeCsv ? 'HTML and CSV saved' : 'HTML updated; CSV preserved'} in docs/.`);
