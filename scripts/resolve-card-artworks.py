#!/usr/bin/env python3
"""Resolve card fallbacks through verified MediaWiki files, preserving artwork IDs.
Discovery writes only a temporary manifest/assets; --apply uses the reviewed manifest.
Requires Pillow. CSV is read-only; user-entered links are never overwritten.
"""
import argparse, csv, json, subprocess, concurrent.futures, urllib.parse, shutil, hashlib
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--csv', default=str(ROOT/'docs/card-artwork-fallbacks.csv'))
p.add_argument('--cache', default='/tmp/chinjufu-card-resolution')
p.add_argument('--apply', action='store_true')
args = p.parse_args()
cache = Path(args.cache); cache.mkdir(parents=True, exist_ok=True)
catalog_path = ROOT/'public/data/artworks.json'
catalog = json.loads(catalog_path.read_text())
manifest_path = cache/'manifest.json'

def fetch(url, destination):
    if not destination.exists():
        subprocess.run(['curl','-fsSL','--retry','2','--max-time','45',url,'-o',str(destination)], check=True)
    return destination

def file_title(url):
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    return 'File:' + (path.split('File:',1)[1] if 'File:' in path else path.rsplit('/',1)[-1])

if args.apply:
    records = json.loads(manifest_path.read_text())
    overrides_path = ROOT/'scripts/artwork-source-overrides.json'
    overrides = json.loads(overrides_path.read_text())
    by_id = {art['id']:art for art in catalog['artworks']}
    applied = 0
    for item in records:
        if item['status'] != 'verified': continue
        art = by_id[item['id']]
        update = {key:art[key] for key in ['shipId','variantId','damage','image']}
        update.update(source=item['source'], sourceImage=item['sourceImage'], sourceCaption=item['name']+' '+('中破' if art['damage']=='damaged' else '正常')+'全身图')
        if item.get('sharedVariantSource'): update['sharedVariantSource'] = item['sharedVariantSource']
        shutil.copyfile(cache/item['webp'], ROOT/'public'/art['image'].lstrip('/'))
        art.update(update); overrides[art['id']] = update; applied += 1
    overrides_path.write_text(json.dumps(overrides,ensure_ascii=False,indent=2)+'\n')
    catalog_path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'docs/artwork-resolution.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    print(f'Applied {applied} verified full illustrations; IDs and asset paths preserved.')
    raise SystemExit()

rows = list(csv.DictReader(Path(args.csv).open(encoding='utf-8-sig')))
provided = {r['立绘 ID']:list(r.values())[-1].strip() for r in rows if list(r.values())[-1].strip()}
ships = json.loads((ROOT/'public/data/ships.json').read_text())['ships']
forms = {v['id']:v for s in ships for v in [s,*s.get('variants',[])]}
cards = [a for a in catalog['artworks'] if '图鉴立绘' in a.get('sourceCaption','')]
candidates = {}
for art in cards:
    form = forms[art['variantId']]
    state = 'Dmg' if art['damage']=='damaged' else ''
    titles = [f'File:KanMusu{form["wikiId"]}{hd}{state}Illust.png' for hd in ['HD','']]
    if art['id'] in provided: titles.insert(0,file_title(provided[art['id']]))
    candidates[art['id']] = list(dict.fromkeys(titles))
titles = list(dict.fromkeys(t for ts in candidates.values() for t in ts))
batches = [titles[i:i+40] for i in range(0,len(titles),40)]
def query(batch):
    index, titles = batch
    url = 'https://zh.kcwiki.cn/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','prop':'imageinfo','iiprop':'url|size','titles':'|'.join(titles)})
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    result = json.loads(fetch(url,cache/f'api-{key}.json').read_text())
    if 'error' in result: raise RuntimeError(result['error'])
    return {page['title']:page['imageinfo'][0] for page in result['query']['pages'].values() if page.get('imageinfo')}
known = {}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for found in pool.map(query,enumerate(batches)): known.update(found)
print(f'{len(known)}/{len(titles)} candidate files exist; {len(provided)} user links.',flush=True)

def resolve_art(art):
    form = forms[art['variantId']]
    record = {'id':art['id'],'name':form['names']['zh'],'wikiId':form['wikiId'],'damage':art['damage'],'image':art['image'],'status':'missing','candidates':candidates[art['id']]}
    rejected=[]
    for title in candidates[art['id']]:
        info = known.get(title)
        if not info: continue
        try:
            raw = fetch(info['url'],cache/(title.removeprefix('File:')))
            im = Image.open(raw).convert('RGBA')
            alpha = im.getchannel('A'); lo,hi = alpha.getextrema()
            transparent = alpha.histogram()[0]/(im.width*im.height)
            if lo != 0 or hi != 255 or transparent < .02 or alpha.getbbox() is None:
                rejected.append({'title':title,'reason':'No substantial transparent background','alpha':[lo,hi]}); continue
            im.thumbnail((1000,1000),Image.Resampling.LANCZOS)
            webp=art['id']+'.webp'; im.save(cache/webp,'WEBP',quality=88,method=4)
            record.update(status='verified',source=info['descriptionurl'],sourceImage=info['url'],size=list(im.size),transparentFraction=round(transparent,3),webp=webp)
            break
        except Exception as error: rejected.append({'title':title,'reason':str(error)})
    record['rejected']=rejected
    return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    records=[]
    for record in pool.map(resolve_art,cards):
        records.append(record)
        if len(records)%20==0: print(f'{len(records)}/{len(cards)} checked',flush=True)
manifest_path.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
verified=[r for r in records if r['status']=='verified']
for start in range(0,len(verified),40):
    subset=verified[start:start+40]; sheet=Image.new('RGB',(1200,((len(subset)+7)//8)*240),'#d9e8ed'); draw=ImageDraw.Draw(sheet)
    for i,r in enumerate(subset):
        im=Image.open(cache/r['webp']).convert('RGBA'); im.thumbnail((146,208))
        x=i%8*150;y=i//8*240
        sheet.paste(im,(x+(150-im.width)//2,y),im)
        draw.text((x+3,y+210),r['wikiId']+' '+r['damage'],fill='#17283e')
        draw.text((x+3,y+224),r['id'].rsplit('-',1)[-1],fill='#17283e')
    sheet.save(cache/f'review-{start//40:02}.jpg',quality=92)
print(f'{len(verified)} verified; {len(records)-len(verified)} unresolved. Review {cache}/review-*.jpg before --apply.',flush=True)
