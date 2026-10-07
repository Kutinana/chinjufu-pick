#!/usr/bin/env python3
"""Generate face crop coordinates only. No production avatar image is written.
Requires Python + Pillow + OpenCV 4 + ONNX Runtime. Pass --onnx=/path/model.onnx.
The legacy --cascade option is available for diagnostics.
Optional --review-dir creates temporary contact sheets for human QA.
"""
import argparse, json, math, concurrent.futures, threading, hashlib
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--cascade');p.add_argument('--onnx');p.add_argument('--workers',type=int,default=6);p.add_argument('--review-dir');p.add_argument('--retry',action='store_true');p.add_argument('--force',action='store_true');args=p.parse_args()
if not args.onnx and not args.cascade:p.error('Pass --onnx=/path/model.onnx or --cascade=/path/model.xml')
cv2.setNumThreads(1)
local=threading.local()
artworks=json.loads((ROOT/'public/data/artworks.json').read_text())['artworks']
images=list(dict.fromkeys(a['image'] for a in artworks))
output=ROOT/'public/data/avatar-crops.json'
previous=json.loads(output.read_text()).get('images',{}) if output.exists() else {}
override_path=ROOT/'scripts/avatar-crop-overrides.json'
overrides=json.loads(override_path.read_text()) if override_path.exists() else {}

def square(cx,cy,side,w,h):
 side=min(round(side),w,h);x=max(0,min(w-side,round(cx-side/2)));y=max(0,min(h-side,round(cy-side/2)))
 return [x,y,side,side]

def detect(path):
 if not args.force and path in previous and previous[path].get('sha256')==hashlib.sha256((ROOT/'public'/path.lstrip('/')).read_bytes()).hexdigest() and path not in overrides and ((args.onnx and previous[path]['method'] in ['yolo','yolo-low']) or not args.onnx) and not (args.retry and previous[path]['method']=='unresolved'):return path,previous[path]
 if args.cascade and not hasattr(local,'cascade'):local.cascade=cv2.CascadeClassifier(args.cascade)
 src=Image.open(ROOT/'public'/path.lstrip('/')).convert('RGBA');w,h=src.size
 if path in overrides:return path,{'size':[w,h],'rect':overrides[path],'method':'manual','score':1}
 raw=np.array(src);alpha=raw[:,:,3:]/255;rgb=(raw[:,:,:3]*alpha+255*(1-alpha)).astype('uint8')
 if args.onnx:
  import onnxruntime as ort
  if not hasattr(local,'net'):
   opt=ort.SessionOptions();opt.intra_op_num_threads=1;opt.inter_op_num_threads=1
   local.net=ort.InferenceSession(args.onnx,opt,providers=['CPUExecutionProvider'])
  factor=640/max(w,h);nw,nh=round(w*factor),round(h*factor);px,py=(640-nw)//2,(640-nh)//2
  canvas=np.full((640,640,3),114,dtype='uint8');canvas[py:py+nh,px:px+nw]=cv2.resize(rgb,(nw,nh))
  tensor=canvas.transpose(2,0,1)[None].astype('float32')/255
  rows=local.net.run(None,{local.net.get_inputs()[0].name:tensor})[0][0].T
  rows=rows[rows[:,4]>=.25]
  if not len(rows):return path,{'size':[w,h],'rect':None,'method':'unresolved','score':0}
  boxes=[[float(cx-bw/2),float(cy-bh/2),float(bw),float(bh)] for cx,cy,bw,bh,score in rows]
  selected=cv2.dnn.NMSBoxes(boxes,rows[:,4].tolist(),.25,.5)
  row=max((rows[int(i)] for i in np.asarray(selected).reshape(-1)),key=lambda r:max(r[2],r[3])*(.6+r[4]))
  cx,cy,bw,bh,score=map(float,row);cx=(cx-px)/factor;cy=(cy-py)/factor;side=max(bw,bh)/factor*2
  return path,{'size':[w,h],'rect':square(cx,cy-side*.025,side,w,h),'method':'yolo' if score>=.6 else 'yolo-low','score':round(score,3)}
 gray=cv2.equalizeHist(cv2.cvtColor(rgb,cv2.COLOR_RGB2GRAY))
 def find(angle,neighbors):
  mat=cv2.getRotationMatrix2D((w/2,h/2),angle,1);rot=gray if angle==0 else cv2.warpAffine(gray,mat,(w,h),borderValue=255)
  boxes,_,scores=local.cascade.detectMultiScale3(rot,scaleFactor=1.075,minNeighbors=neighbors,minSize=(24,24),outputRejectLevels=True)
  results=[]
  for (x,y,bw,bh),score in zip(boxes,scores):
   # Prefer the principal, larger face over accompanying tiny fairies.
   center=np.array([x+bw/2,y+bh/2,1]);cx,cy=cv2.invertAffineTransform(mat)@center
   if not (0<=cx<w and 0<=cy<h):continue
   size=max(bw,bh);priority=size*(1+max(0,float(score))*.09)
   results.append((priority,cx,cy,size,float(score)))
  return sorted(results,reverse=True)
 results=find(0,4);method='detected'
 if not results:
  method='rotated';results=[r for angle in [-15,15,-30,30] for r in find(angle,4)]
 if not results:
  method='weak';results=[r for angle in [0,-20,20,-40,40] for r in find(angle,2)]
 if not results:return path,{'size':[w,h],'rect':None,'method':'unresolved','score':0}
 _,cx,cy,side,score=max(results)
 return path,{'size':[w,h],'rect':square(cx,cy,side*1.55,w,h),'method':method,'score':round(score,3)}

records={}
with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
 for i,(path,record) in enumerate(pool.map(detect,images)):
  records[path]=record
  if (i+1)%250==0:print(f'{i+1}/{len(images)} located; unresolved {sum(r["method"]=="unresolved" for r in records.values())}',flush=True)
for path,record in records.items(): record['sha256']=hashlib.sha256((ROOT/'public'/path.lstrip('/')).read_bytes()).hexdigest()
counts={m:sum(r['method']==m for r in records.values()) for m in sorted(set(r['method'] for r in records.values()))}
document={'version':1,'coordinateSystem':'original image pixels: [x,y,width,height]','model':{'source':'https://huggingface.co/deepghs/anime_face_detection/tree/784dc4c0bb692351ddcdbe6131a050b17d3025d5/face_detect_v1.4_s' if args.onnx else 'https://github.com/nagadomi/lbpcascade_animeface','sha256':hashlib.sha256(Path(args.onnx or args.cascade).read_bytes()).hexdigest(),'license':'MIT'},'coverage':counts,'images':records}
header=json.dumps({key:value for key,value in document.items() if key!='images'},ensure_ascii=False,indent=2)
rows=',\n'.join('    '+json.dumps(path)+': '+json.dumps(record,separators=(',',':')) for path,record in records.items())
output.write_text(header[:-2]+',\n  "images": {\n'+rows+'\n  }\n}\n')
print(counts,flush=True)
if args.review_dir:
 folder=Path(args.review_dir);folder.mkdir(parents=True,exist_ok=True)
 for category in ['unresolved','yolo-low','yolo','manual']:
  paths=[s for s in images if records[s]['method']==category]
  for start in range(0,len(paths),100):
   subset=paths[start:start+100];sheet=Image.new('RGB',(1200,math.ceil(len(subset)/10)*144),'#edf3f7');draw=ImageDraw.Draw(sheet)
   for index,path in enumerate(subset):
    rec=records[path];im=Image.open(ROOT/'public'/path.lstrip('/')).convert('RGBA');x=index%10*120;y=index//10*144
    if rec['rect']:
     a,b,c,d=rec['rect'];im=im.crop((a,b,a+c,b+d));im.thumbnail((116,116))
    else:im.thumbnail((116,116))
    sheet.paste(im,(x+(120-im.width)//2,y),im);draw.text((x+3,y+119),Path(path).stem,fill='#17283e')
   sheet.save(folder/f'{category}-{start//100:02}.jpg',quality=88)
