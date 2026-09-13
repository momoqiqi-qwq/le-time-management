from pathlib import Path
import urllib.request,json,concurrent.futures,io,hashlib
from PIL import Image
items=[('quadrant','dashboard',9422920,'Freepik'),('timeblock','calendar',3229706,'wanicon'),('market','puzzle',5726256,'Freepik'),('settings','settings',4677636,'Good Ware'),('pomodoro','stopwatch',1527068,'Freepik'),('weekly-report','business-report',3094836,'Freepik'),('gx-news','trophy',2617955,'Freepik'),('chaoxing-notify','reading-book',4598885,'Freepik'),('cppu-notify','shield',1322221,'Freepik'),('wechat-push','notification',4611672,'Smashicons'),('capture','microphone',3712181,'Freepik')]
out=Path('le-time-management/public/icons');out.mkdir(exist_ok=True)
mini=Path('miniprogram/images/tab')
def fetch(item):
 name,slug,num,author=item
 url=f'https://cdn-icons-png.magnific.com/512/{num//1000}/{num}.png'
 data=urllib.request.urlopen(url,timeout=25).read()
 im=Image.open(io.BytesIO(data)).convert('RGBA');im.resize((128,128),Image.Resampling.LANCZOS).save(out/f'{name}.png')
 if name in ['quadrant','timeblock','settings','capture']:
  for suffix in ['', '-on']:
   icon=im.resize((70,70),Image.Resampling.LANCZOS);canvas=Image.new('RGBA',(81,81));canvas.alpha_composite(icon,(5,5));canvas.save(mini/f'{name}{suffix}.png')
 return dict(key=name,author=author,source=f'https://www.magnific.com/icon/{slug}_{num}',cdn=url,sha256=hashlib.sha256((out/f'{name}.png').read_bytes()).hexdigest())
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: records=list(pool.map(fetch,items))
(out/'credits.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
credits='# 图标来源与署名\n\n图标来自 Magnific（formerly Freepik）Lineal Color 素材库，PNG 随应用离线打包。作者署名保留在设置页。\n\n'+ '\n'.join(f"- {r['key']}: [{r['author']}]({r['source']})" for r in records)+'\n\n素材使用遵循原作者与平台许可，素材不得作为独立图标库转售。\n'
(out/'ATTRIBUTION.md').write_text(credits,encoding='utf-8')
print('Downloaded and bundled',len(records),'icons; mini tab icons synchronized.')
