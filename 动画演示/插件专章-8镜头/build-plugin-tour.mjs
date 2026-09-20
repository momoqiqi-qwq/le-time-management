/* 插件专章 · 分镜页生成器
   读技能模板，按标记区替换出各镜页面。改画面只改下面 PAGES 里的内容。
   用法：node build-plugin-tour.mjs [镜头id ...]   不传参数则生成全部
   事实源：模板在 ~/.qoder/skills/video-shot-demos/assets/template.html */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const TPL = path.join(os.homedir(), '.qoder/skills/video-shot-demos/assets/template.html');
const OUT = path.dirname(fileURLToPath(import.meta.url));

/* 标记区：[起点, 终点] 之间的内容整段换掉 */
const SPANS = {
  css: ['#title{position:absolute;left:64px;top:46px', '#mascot.show .say{opacity:1;transform:scale(1);transition-delay:.45s}'],
  html: ['<!-- [改这里] 全部画面内容包进 #cam -->', '\n  <div id="dim"></div>'],
  cues: ['/* ────────────────────────────────────────────────\n   [改这里] 本镜头的叙事 cue', 'on(9500,()=>__sfx.pop(0.6));'],
};
const cut = (s, key, text) => {
  const [a, b] = SPANS[key];
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < 0) throw new Error(`模板里找不到 ${key} 区`);
  return s.slice(0, i) + text + s.slice(j + b.length);
};

function page(p) {
  /* 模板是 CRLF，标记锚点按 \n 写；读入时统一换行，写出也统一 */
  let s = fs.readFileSync(TPL, 'utf8').replace(/\r\n/g, '\n');
  s = s.replace('<title>镜头 X-X · 【改成镜头标题】</title>', `<title>${p.title}</title>`);
  s = s.replace(
    /<!-- \[改这里\] 字体[\s\S]*?Share\+Tech\+Mono&display=swap" rel="stylesheet">/,
    `<!-- 风格：${p.style} -->\n<link href="https://fonts.googleapis.com/css2?${p.fonts}&display=swap" rel="stylesheet">`
  );
  s = s.replace(
    /\/\* \[改这里\] 舞台底色[\s\S]*?rgba\(60,40,10,\.25\)\}/,
    `/* ${p.bgNote} */\n#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%);overflow:hidden;${p.bg}}`
  );
  s = cut(s, 'css', p.css);
  s = cut(s, 'html', p.html);
  s = cut(s, 'cues', p.cues);
  s = s.replace('const DUR=12000;                       /* [改这里] = 本镜头规定时长(ms) */', `const DUR=${p.dur};`);
  s = s.replace('镜头 X-X · 标题 · 12s', p.hud);
  s = s.replace('>0X / 章节名<', `>${p.chap}<`).replace('>数据出处 · 日期<', `>${p.src}<`);
  if (p.srcTop) s = s.replace('<div class="corner" id="src">', '<div class="corner" id="src" style="top:56px;bottom:auto">');
  fs.writeFileSync(path.join(OUT, p.file), s);
  console.log('✓', p.file, `${p.dur}ms`, p.style);
}

/* ── 全章锁色：同一插件在任何镜头里都是同一个颜色 ── */
const C = {
  notice: '#B85E5E', schedule: '#607D8B', pomodoro: '#C86A2E', push: '#3FA45B', chaoxing: '#3D6E9C',
  cppu: '#2F4858', contest: '#A9853B', holiday: '#B03A48', exam: '#8B6D3F', duty: '#5F8378',
  drop: '#6B7A8F', web: '#2E8B8B', rss: '#7A5C8E', weekly: '#716B83', guide: '#4C5550',
};

const PAGES = [];

/* ══════════ S2 · 课程表 · 手账拼贴日历 ══════════ */
PAGES.push({
  file: 'shot-s2_课程表.html', style: '手账拼贴日历（和纸胶带 + 格子本 + 手写课程块）',
  title: '镜头 S2 · 教务系统里的课表，撕下来贴进手账', hud: '镜头 S2 · 课程表 · 26s', dur: 26000,
  chap: 'S2 / 课程表', src: '课表数据：中国人民警察大学教务导入 · 20262027-1 学期 · 38 门课', srcTop: true,
  fonts: 'family=ZCOOL+KuaiLe&family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;700;900&family=IBM+Plex+Mono:wght@400;600',
  bgNote: '和纸本页面：米白横格 + 装订孔 + 咖啡渍',
  bg: `background:linear-gradient(180deg,#FBF7EC,#F3ECDC);box-shadow:inset 0 0 200px rgba(150,120,70,.16)`,
  css: `/* 相机初始：搜索条特写 */
#cam{transform:scale(1.18)}
#paper{position:absolute;inset:0;background-image:repeating-linear-gradient(180deg,transparent 0 43px,rgba(120,110,90,.11) 43px 44px);pointer-events:none}
#holes{position:absolute;left:44px;top:0;bottom:0;width:26px;pointer-events:none;
  background-image:radial-gradient(circle at 13px 60px,rgba(90,80,60,.2) 7px,transparent 8px);background-size:26px 150px}

/* ── 顶部：拟真的「教务导入 → 选学校」条，撕开之后才露出手账 ── */
#import{position:absolute;left:120px;top:44px;width:1680px;height:118px;background:#fff;border:1px solid #DCDDDC;border-radius:14px;
  box-shadow:0 12px 30px rgba(90,80,50,.13);padding:14px 18px;opacity:0;transform:translateY(-14px);
  transition:opacity .5s ease,transform .6s cubic-bezier(.16,1,.3,1),clip-path .9s cubic-bezier(.7,0,.3,1)}
#import.in{opacity:1;transform:none}
#import.torn{clip-path:polygon(0 0,100% 0,100% 6%,0 14%)}
#import .row{display:flex;align-items:center;gap:12px}
#import .cap{font-size:12px;letter-spacing:3px;color:#9CA2A5;font-family:'IBM Plex Mono'}
#import .sch{font-family:'Noto Sans SC';font-size:19px;font-weight:900;color:#25282A}
#import .srch{margin-left:auto;display:flex;align-items:center;gap:8px;height:40px;width:420px;border:1.5px solid #5F8378;
  border-radius:10px;background:#F7F7F5;padding:0 12px;font-size:15px;color:#25282A;font-weight:700}
#import .srch span{clip-path:inset(0 100% 0 0);transition:clip-path .7s steps(3,end)}
#import .srch span.on{clip-path:inset(0 0 0 0)}
#import .hit{margin-top:10px;display:flex;align-items:center;gap:10px;font-size:13px;color:#6C7377}
#import .hit b{color:#25282A;font-weight:900;font-size:15px}
#import .pill{border-radius:7px;padding:3px 9px;background:rgba(96,125,139,.14);color:#607D8B;font-size:11px;font-weight:700}
#arrow{position:absolute;left:960px;top:172px;width:0;height:0;opacity:0;transition:opacity .4s}
#arrow.show{opacity:1}
#arrow i{position:absolute;left:0;top:0;width:190px;height:5px;background:#C86A2E;border-radius:3px;transform:rotate(38deg);transform-origin:0 50%}
#arrow i::after{content:'';position:absolute;right:-3px;top:-7px;border:9px solid transparent;border-left:13px solid #C86A2E}

/* ── 手账主标题 ── */
#title{position:absolute;left:120px;top:206px;opacity:0;transform:translateY(16px) rotate(-1.4deg);transition:all .7s cubic-bezier(.16,1,.3,1);z-index:20}
#title.show{opacity:1;transform:rotate(-1.4deg)}
#title h1{font-family:'Ma Shan Zheng';font-size:56px;color:#2F4858;letter-spacing:2px;line-height:1}
#title .sub{font-family:'ZCOOL KuaiLe';font-size:19px;color:#8B7B5E;letter-spacing:2px;margin-top:8px}
#title .sub em{font-style:normal;color:#B85E5E}
#stamp{position:absolute;left:1424px;top:126px;width:186px;height:186px;border:6px solid rgba(184,94,94,.62);border-radius:50%;
  display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(184,94,94,.72);font-weight:900;
  transform:rotate(-14deg) scale(2.4);opacity:0;transition:all .5s cubic-bezier(.2,1.5,.4,1);z-index:21}
#stamp.hit{opacity:1;transform:rotate(-14deg) scale(1)}
#stamp .a{font-size:26px;letter-spacing:3px}#stamp .b{font-size:13px;letter-spacing:2px;margin-top:5px;font-family:'IBM Plex Mono'}

/* ── 周视图格子本 ── */
#book{position:absolute;left:120px;top:326px;width:1680px;height:640px;opacity:0;transform:translateY(26px);
  transition:opacity .6s ease,transform .8s cubic-bezier(.16,1,.3,1)}
#book.in{opacity:1;transform:none}
#book .sheet{position:absolute;inset:0;background:#FFFDF6;border:1.5px solid #E2D9C4;border-radius:6px;
  box-shadow:0 16px 34px rgba(120,100,60,.13)}
#grid{position:absolute;left:96px;top:56px;right:26px;bottom:22px;display:grid;grid-template-columns:repeat(7,1fr);gap:0 8px}
.col{position:relative;border-left:1.5px dashed rgba(120,110,90,.24)}
.col:first-child{border-left:0}
.col .dh{position:absolute;left:0;right:0;top:-42px;text-align:center;font-family:'ZCOOL KuaiLe';font-size:19px;color:#6C7377;letter-spacing:2px}
.col .dh em{font-style:normal;color:#B85E5E}
#times{position:absolute;left:14px;top:56px;width:70px;bottom:22px}
#times b{position:absolute;left:0;width:70px;text-align:right;font-family:'IBM Plex Mono';font-size:11px;color:#A79C86;font-weight:400}
#times i{position:absolute;left:-84px;right:-1424px;height:1px;background:rgba(120,110,90,.13)}
.blk{position:absolute;left:3px;right:3px;border-radius:7px;padding:7px 8px;overflow:hidden;opacity:0;transform:translateY(-10px) rotate(var(--r));
  transition:opacity .34s ease,transform .46s cubic-bezier(.2,1.4,.4,1);box-shadow:2px 3px 0 rgba(120,100,60,.13)}
.blk.in{opacity:1;transform:rotate(var(--r))}
.blk b{display:block;font-size:14.5px;font-weight:900;color:#25282A;line-height:1.22;letter-spacing:.2px}
.blk s{display:block;text-decoration:none;font-family:'IBM Plex Mono';font-size:10.5px;color:rgba(37,40,42,.6);margin-top:3px}
.blk .tape{position:absolute;left:50%;top:-9px;width:64px;height:19px;margin-left:-32px;background:rgba(255,255,255,.5);
  border-left:1px dashed rgba(150,140,110,.4);border-right:1px dashed rgba(150,140,110,.4);transform:rotate(-2deg)}
.blk.hot{outline:2.5px solid #B85E5E;outline-offset:2px}
#legend{position:absolute;left:120px;top:984px;display:flex;gap:18px;align-items:center;font-size:13px;color:#8B7B5E;font-family:'ZCOOL KuaiLe';letter-spacing:1px}
#legend i{display:inline-block;width:13px;height:13px;border-radius:4px;background:#607D8B;margin-right:6px;vertical-align:-1px}
#legend .n{font-family:'IBM Plex Mono';font-size:26px;font-weight:600;color:#B85E5E;letter-spacing:0}
#note{position:absolute;left:1250px;top:978px;font-family:'Ma Shan Zheng';font-size:23px;color:#5F8378;transform:rotate(-2deg);opacity:0;transition:opacity .6s}
#note.in{opacity:1}`,
  html: `
  <div id="cam">
    <div id="paper"></div><div id="holes"></div>

    <div id="import">
      <div class="row"><span class="cap">SCHOOL IMPORT</span><span class="sch">选择学校并登录教务</span>
        <span class="srch">🔍 <span id="q">警察</span></span></div>
      <div class="hit"><span class="pill">209 所 · 按拼音首字母分组</span>命中 <b>中国人民警察大学</b>
        <span class="pill">正方教务 · 适配已就绪</span><span>登录后可一键导入当前课表</span></div>
    </div>
    <div id="arrow"><i></i></div>

    <div id="title"><h1>我的课表 · 第 8 周</h1><div class="sub">教务导入 · <em>38 门课</em> · 20262027-1 · 周一到周日 10 节</div></div>
    <div id="stamp"><div class="a">已导入</div><div class="b">CPPU · 2026.09</div></div>

    <div id="book"><div class="sheet"></div><div id="times"></div><div id="grid"></div></div>
    <div id="legend"><span><i></i>中国人民警察大学</span><span class="n">38</span><span>门课 · 10 个节次 · 08:00–20:40</span></div>
    <div id="note">彩色块默认开，一眼分得清</div>
  </div>`,
  cues: `/* 真实课表：警察大学 20262027-1 学期第 8 周（教务导入原样，节次 1-10） */
const SECTIONS=[['08:00','08:45'],['08:55','09:40'],['10:00','10:45'],['10:55','11:40'],['14:00','14:45'],
  ['14:55','15:40'],['16:00','16:45'],['16:55','17:40'],['19:00','19:45'],['19:55','20:40']];
/* [星期, 起节, 止节, 课程, 教室, 教师] —— 第 8 周实际有课的行 */
const CS=[[1,1,2,'数字电子技术','A102','刘晓军'],[1,3,4,'毛泽东思想和中国特色社会主义理论体系概论','A207','范博群'],
 [1,5,6,'线性代数A','A103','邵红梅'],[1,7,8,'模拟电子技术','C204','雷朝军'],[1,9,10,'反邪教研究','A204','车强'],
 [2,1,2,'机器人操控基础','消训楼411','曹琪'],[2,3,4,'C语言程序设计A','C503','邱宏'],[2,5,6,'多旋翼无人机组装与调试','消训楼410','马曙光'],
 [2,7,8,'固定翼无人机模拟驾驶','科508','贾春雷'],[2,9,10,'"一带一路"倡议：理论、实践与安全治理','A104','王玉爽'],
 [3,1,2,'模拟电子技术','C204','雷朝军'],[3,3,4,'复变函数与积分变换','A201','陈广雷'],[3,5,6,'数字电子技术','A102','刘晓军'],
 [3,7,8,'马克思主义基本原理','A207','张超'],[3,9,10,'反邪教研究','A204','车强'],
 [4,3,4,'智慧消防专业英语','535','雷蕾'],[4,5,6,'C语言程序设计A','B501','邱宏'],[4,7,8,'模拟电子技术','一实104','薛彩姣'],
 [4,9,10,'"一带一路"倡议：理论、实践与安全治理','A104','王玉爽'],
 [5,1,2,'马克思主义基本原理','A207','张超'],[6,5,6,'形势与政策3','一阶梯','於素兰'],[7,1,2,'多旋翼无人机组装与调试','消训楼410 库房','马曙光']];
const DAYS=['周一','周二','周三','周四','周五','周六','周日'],TINT=['#DCE8EF','#F6E6C8','#E3DCEA','#D7E7DF','#F1DCDC','#E6E1D3','#DDE6EF'];
const grid=$('#grid');
grid.innerHTML=DAYS.map((d,c)=>'<div class="col"><div class="dh">'+(c===0?'<em>'+d+'</em>':d)+'</div></div>').join('');
const cols=[...grid.children],H=584,SLOT=H/10,blocks=[];
CS.forEach((k,i)=>{const[,s,e,nm,pos,te]=k;
  const b=document.createElement('div');b.className='blk';
  b.style.top=((s-1)*SLOT+2)+'px';b.style.height=((e-s+1)*SLOT-6)+'px';
  b.style.background=TINT[(s+e)%7];b.style.setProperty('--r',(i%3-1)*.5+'deg');
  b.innerHTML='<span class="tape"></span><b>'+nm+'</b><s>'+pos+' · '+te+'</s>';
  cols[k[0]-1].appendChild(b);blocks.push(b)});
$('#times').innerHTML=SECTIONS.map((t,i)=>'<b style="top:'+(i*SLOT+SLOT/2-7)+'px">'+(i+1)+'节 '+t[0]+'</b>'+
  '<i style="top:'+(i*SLOT)+'px"></i>').join('');

on(300,()=>camTo(0,0,1,2.2));                                       // 开场拉镜
on(420,()=>$('#import').classList.add('in'));                       // 教务导入条先站住
on(1100,()=>{$('#q').classList.add('on');__sfx.type(.4);after(120,()=>__sfx.type(.35))});  // 搜索框敲「警察」
on(2100,()=>{camFocus(1400,100,1.16,1.0);__sfx.ding(.8)});          // 命中警察大学
on(3300,()=>{camTo(0,0,1,1.1);$('#arrow').classList.add('show')});
on(4100,()=>{$('#import').classList.add('torn');__sfx.swipe(.7)});  // 撕开：从教务系统撕进手账
on(4500,()=>$('#arrow').classList.remove('show'));                  // 撕完收起箭头
on(4700,()=>{$('#title').classList.add('show');$('#book').classList.add('in');__sfx.pop(.5)});
for(let i=0;i<blocks.length;i++)on(5300+i*68,()=>{blocks[i].classList.add('in');__sfx.type(.26)});  // 38 门课逐块贴上
on(7600,()=>{blocks[0].classList.add('hot');__sfx.ding(.85)});      // 周一第一节高亮
on(8400,()=>{camFocus(327,411,1.3,1.1);__sfx.whoosh(1.1,.5)});      // 推到那块课
on(11000,()=>camFocus(500,600,1.16,1.2));                           // 顺着一列往下读
on(13600,()=>camFocus(1200,620,1.16,1.2));                          // 摇到右边几天
on(16200,()=>camTo(0,0,1,1.4));                                     // 拉回全景
on(17600,()=>{$('#stamp').classList.add('hit');__sfx.thud(1)});     // 盖章：已导入
on(19200,()=>$('#note').classList.add('in'));                       // 手写批注
on(20600,()=>{const[x,y]=[960,650];camFocus(x,y,1.1,1.6)});         // 结尾轻推
on(23600,()=>camTo(0,0,1,1.4));
/* 音效 */
on(300,()=>__sfx.swipe(.5));
on(4700,()=>__sfx.pop(.55));`,
});

/* ══════════ S3 · 番茄专注 · 嘉年华老虎机 ══════════ */
PAGES.push({
  file: 'shot-s3_番茄专注.html', style: '嘉年华老虎机（深蓝机身 + 灯泡跑马 + 电青表盘 + 毫秒慢放）',
  title: '镜头 S3 · 一秒也算一个番茄', hud: '镜头 S3 · 番茄专注 · 14s', dur: 14000,
  chap: 'S3 / 番茄专注', src: '自定义时长精确到秒 · 最短 1 秒 · 结束音为内置提示音',
  fonts: 'family=Bungee&family=Noto+Sans+SC:wght@400;700;900&family=Share+Tech+Mono',
  bgNote: '游乐场机身：深蓝底 + 顶部灯泡拱 + 地面反光',
  bg: `background:radial-gradient(1200px 700px at 50% 34%,#16234a,#0b1020 74%);box-shadow:inset 0 0 260px rgba(0,0,0,.75)`,
  css: `/* 相机初始：表盘特写 */
#cam{transform:scale(1.26)}
/* 跑马灯泡拱 */
.bulbs{position:absolute;left:0;right:0;display:flex;justify-content:space-between;padding:0 60px;pointer-events:none}
.bulbs i{width:16px;height:16px;border-radius:50%;background:#3a2f12;box-shadow:0 0 0 2px rgba(255,210,63,.22)}
.bulbs.on i{animation:bulb 1s steps(1) infinite}
.bulbs.on i:nth-child(2n){animation-delay:.25s}.bulbs.on i:nth-child(3n){animation-delay:.5s}.bulbs.on i:nth-child(4n){animation-delay:.75s}
@keyframes bulb{0%,49%{background:#ffd23f;box-shadow:0 0 18px 4px rgba(255,210,63,.6)}50%,100%{background:#4a3c14;box-shadow:0 0 0 rgba(0,0,0,0)}}
#bT{top:34px}#bB{bottom:34px}
#bL{top:0;bottom:0;left:34px;flex-direction:column;padding:60px 0}
#bR{top:0;bottom:0;right:34px;left:auto;flex-direction:column;padding:60px 0}

/* 机身招牌 */
#marquee{position:absolute;left:50%;top:78px;transform:translateX(-50%);text-align:center;opacity:0;transition:all .6s cubic-bezier(.16,1,.3,1)}
#marquee.in{opacity:1}
#marquee .t{font-family:'Bungee';font-size:20px;letter-spacing:9px;color:#ffd23f;text-shadow:0 0 22px rgba(255,210,63,.5)}
#marquee h1{font-family:'Bungee','Noto Sans SC';font-weight:900;font-size:60px;letter-spacing:5px;color:#fff;margin-top:6px;
  text-shadow:0 5px 0 #ff4d6d,0 10px 26px rgba(0,0,0,.5)}
#marquee .s{font-size:15px;letter-spacing:6px;color:#7f93c9;margin-top:12px}

/* 中央机身 */
#cab{position:absolute;left:50%;top:300px;transform:translateX(-50%);width:1120px;height:600px;border-radius:34px;
  background:linear-gradient(180deg,#1b2a55,#111a38);border:3px solid #2dd4ee;box-shadow:0 0 0 8px rgba(45,212,238,.09),0 40px 90px rgba(0,0,0,.6);
  opacity:0;transition:opacity .6s ease,transform .7s cubic-bezier(.16,1,.3,1)}
#cab.in{opacity:1}
#ring{position:absolute;left:60px;top:56px;width:488px;height:488px}
#ring circle{fill:none;stroke-linecap:round}
#ring .track{stroke:rgba(45,212,238,.14);stroke-width:26}
#ring .prog{stroke:#ff4d6d;stroke-width:26;stroke-dasharray:1400;stroke-dashoffset:0;transition:stroke-dashoffset 1s linear}
#dial{position:absolute;left:60px;top:56px;width:488px;height:488px;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .3s}
#dial .ms{font-family:'Share Tech Mono';font-size:104px;color:#fff;line-height:1;letter-spacing:2px;text-shadow:0 0 30px rgba(45,212,238,.55)}
#dial .lab{font-family:'Bungee';font-size:16px;letter-spacing:7px;color:#2dd4ee;margin-top:16px}
#dial .mode{font-size:14px;letter-spacing:4px;color:#7f93c9;margin-top:8px}

/* 右侧：分/秒两个输入格（老虎机转轮） */
#slots{position:absolute;right:60px;top:70px;width:470px}
#slots .cap{font-family:'Bungee';font-size:15px;letter-spacing:6px;color:#ffd23f;margin-bottom:16px}
.slotrow{display:flex;gap:16px;align-items:flex-end}
.slot{flex:1;text-align:center}
.slot .box{height:150px;border-radius:14px;background:linear-gradient(180deg,#0a1226,#0f1a35);border:2px solid #24365f;
  display:flex;align-items:center;justify-content:center;
  font-family:'Share Tech Mono';font-size:92px;color:#2dd4ee;box-shadow:inset 0 0 40px rgba(0,0,0,.7);overflow:hidden;position:relative}
.slot .box::after{content:'';position:absolute;left:0;right:0;top:0;height:34%;background:linear-gradient(180deg,rgba(255,255,255,.1),transparent)}
.slot .u{font-size:14px;letter-spacing:4px;color:#7f93c9;margin-top:12px}
.slot.spin .box{animation:reel .5s cubic-bezier(.3,.9,.3,1)}
@keyframes reel{0%{transform:translateY(38%);filter:blur(6px)}100%{transform:none;filter:none}}
#startBtn{margin-top:30px;width:100%;height:86px;border-radius:16px;background:linear-gradient(180deg,#ff6b85,#ff4d6d);
  border:0;color:#fff;font-family:'Bungee','Noto Sans SC';font-weight:900;font-size:31px;letter-spacing:8px;
  box-shadow:0 10px 0 #a8243c,0 20px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(18px);transition:all .5s cubic-bezier(.16,1,.3,1)}
#startBtn.in{opacity:1;transform:none}
#startBtn.press{transform:translateY(10px);box-shadow:0 2px 0 #a8243c}

/* 底部奖池跑马 */
#prize{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);display:flex;gap:34px;align-items:center;
  font-family:'Share Tech Mono';font-size:17px;color:#8fa3d8;letter-spacing:2px;opacity:0;transition:opacity .6s}
#prize.in{opacity:1}
#prize b{color:#ffd23f;font-size:30px;font-weight:400}
#done{position:absolute;left:704px;top:600px;transform:translate(-50%,-50%) scale(.5);text-align:center;opacity:0;
  transition:all .55s cubic-bezier(.2,1.6,.4,1);pointer-events:none;z-index:26}
#done.in{opacity:1;transform:translate(-50%,-50%) scale(1)}
#done .big{font-family:'Bungee';font-size:88px;color:#ffd23f;letter-spacing:3px;line-height:1;
  text-shadow:0 6px 0 #ff4d6d,0 0 50px rgba(255,210,63,.65)}
#done .sm{font-size:17px;letter-spacing:4px;color:#fff;margin-top:16px}
#slowtag{position:absolute;left:50%;top:236px;transform:translateX(-50%);border-radius:999px;padding:7px 20px;
  background:rgba(255,77,109,.16);border:1px solid rgba(255,77,109,.5);color:#ff9fb0;font-family:'Share Tech Mono';
  font-size:14px;letter-spacing:3px;opacity:0;transition:opacity .35s;z-index:26}
#slowtag.on{opacity:1}`,
  html: `
  <div id="cam">
    <div class="bulbs" id="bT"></div><div class="bulbs" id="bB"></div>
    <div class="bulbs" id="bL"></div><div class="bulbs" id="bR"></div>

    <div id="marquee"><div class="t">POMODORO</div><h1>一秒也算一个番茄</h1>
      <div class="s">自 定 义 时 长 · 精 确 到 秒</div></div>

    <div id="cab">
      <svg id="ring" viewBox="0 0 488 488"><circle class="track" cx="244" cy="244" r="223"/>
        <circle class="prog" id="prog" cx="244" cy="244" r="223" transform="rotate(-90 244 244)"/></svg>
      <div id="dial"><div class="ms" id="ms">1.00</div><div class="lab">FOCUS</div><div class="mode">自定义 · 0 分 1 秒</div></div>
      <div id="slots">
        <div class="cap">SET THE TIMER</div>
        <div class="slotrow">
          <div class="slot" id="sMin"><div class="box">0</div><div class="u">分</div></div>
          <div class="slot" id="sSec"><div class="box">1</div><div class="u">秒</div></div>
        </div>
        <div id="startBtn">开 始</div>
      </div>
    </div>

    <div id="prize"><span>已完成番茄</span><b id="pc">9</b><span>个</span><span style="opacity:.4">|</span>
      <span>累计专注</span><b id="pm">5.4</b><span>分钟</span></div>
    <div id="slowtag">SLOW MOTION · 归零瞬间</div>
    <div id="done"><div class="big">DING!</div><div class="sm">提示音已响 · 计入统计</div></div>
  </div>`,
  cues: `const bulbs=n=>{const e=$('#'+n);e.innerHTML='<i></i>'.repeat(n==='bL'||n==='bR'?15:26)};
['bT','bB','bL','bR'].forEach(bulbs);
const prog=$('#prog'),L=2*Math.PI*223;prog.style.strokeDasharray=L;prog.style.strokeDashoffset=0;
const ms=$('#ms');

on(300,()=>camTo(0,0,1,2.0));                                       // 开场拉镜：表盘特写 → 机身全景
on(500,()=>{$('#marquee').classList.add('in');__sfx.swipe(.55)});
on(1000,()=>{$('#cab').classList.add('in');$('#startBtn').classList.add('in');__sfx.pop(.6)});
on(1400,()=>{$('#bT').classList.add('on');$('#bB').classList.add('on');$('#bL').classList.add('on');$('#bR').classList.add('on')});  // 灯泡跑马点亮
on(2000,()=>{$('#sMin').classList.add('spin');__sfx.type(.45)});    // 分：拨到 0
on(2500,()=>{$('#sSec').classList.add('spin');__sfx.type(.5)});     // 秒：拨到 1
on(3200,()=>camFocus(1450,760,1.14,1.0));                           // 对准开始键
on(3600,()=>{$('#startBtn').classList.add('press');__sfx.thud(.9)});  // 按下「开始」
on(4000,()=>{$('#startBtn').classList.remove('press');$('#slowtag').classList.add('on');
  document.getElementById('stage').classList.add('letter');__sfx.whoosh(1,.55)});  // 慢放段：加黑边
on(4200,()=>{ms.textContent='0.60';prog.style.strokeDashoffset=L*.4;__sfx.type(.5)});
on(4600,()=>{ms.textContent='0.30';prog.style.strokeDashoffset=L*.7;__sfx.type(.5)});
on(5000,()=>{ms.textContent='0.08';prog.style.strokeDashoffset=L*.92;__sfx.type(.6)});
on(5300,()=>{prog.style.strokeDashoffset=L;$('#dial').style.opacity='0';               // 归零：读数让位给 DING
  $('#done').classList.add('in');$('#slowtag').classList.remove('on');
  document.getElementById('stage').classList.remove('letter');
  camFocus(960,540,1.24,.5);__sfx.ding(1.2)});
on(5420,()=>__sfx.ding(.9));on(5560,()=>__sfx.ding(.7));                               // 提示音三连
on(5900,()=>camFocus(960,540,1.1,1.1));                             // 冲击后拉回
on(6600,()=>{$('#pc').textContent='10';$('#pm').textContent='5.4';$('#prize').classList.add('in');__sfx.pop(.6)});  // 奖池 +1
on(7400,()=>{for(let i=0;i<9;i++)after(i*70,()=>__sfx.type(.3))});  // 计数连击
on(8600,()=>camTo(0,0,1,1.4));                                      // 全景定格
on(10200,()=>{camFocus(960,600,1.12,1.8)});                         // 结尾轻推
on(12600,()=>{$('#done').classList.remove('in')});`,
});

/* ── 拟真录屏共用外壳：U-Time 桌面窗口（S4 / S6 复用） ── */
const SHELL = `#win{position:absolute;left:90px;top:54px;width:1740px;height:942px;background:var(--bg);border:1px solid #C9CDCE;border-radius:14px;
  overflow:hidden;opacity:0;transform:translateY(16px) scale(.992);transition:opacity .6s ease,transform .85s cubic-bezier(.16,1,.3,1),background .7s,border-color .7s;
  box-shadow:0 30px 70px rgba(40,50,56,.32),inset 0 1px 0 rgba(255,255,255,.7)}
#win.in{opacity:1;transform:none}
#tbar{position:absolute;left:0;right:0;top:0;height:38px;background:var(--paper);border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 12px;transition:background .7s,border-color .7s}
#tbar .dot{width:15px;height:15px;border-radius:4px;background:var(--deep);margin-right:9px;transition:background .7s}
#tbar .wt{font-size:12.5px;color:var(--ink-2);transition:color .7s}
#tbar .wbtns{margin-left:auto;display:flex;gap:2px}
#tbar .wb{width:42px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center}
#tbar .wb svg{width:12px;height:12px;stroke:var(--ink-2);stroke-width:1.5;fill:none}
#rail{position:absolute;left:0;top:38px;bottom:0;width:214px;background:var(--paper);border-right:1px solid var(--line);padding:14px 10px;transition:background .7s,border-color .7s}
#rail .brand{font-size:17px;font-weight:900;color:var(--ink);letter-spacing:.4px;padding:2px 8px 12px;transition:color .7s}
.nav{display:flex;align-items:center;gap:9px;height:34px;padding:0 8px;border-radius:9px;font-size:13px;color:var(--ink-2);transition:color .7s,background .7s}
.nav svg{width:14px;height:14px;stroke:var(--ink-3);stroke-width:1.7;fill:none;flex:none}
.nav.act{background:var(--panel);color:var(--ink);font-weight:700;box-shadow:0 1px 4px rgba(40,46,49,.09)}
#rail .cap{margin:14px 8px 6px;font-size:10.5px;letter-spacing:1.4px;color:var(--ink-3)}
.pl{display:flex;align-items:center;gap:8px;height:31px;padding:0 8px;border-radius:8px;font-size:12.5px;color:var(--ink-2);position:relative;transition:color .7s,background .7s}
.pl i{width:15px;height:15px;border-radius:5px;background:var(--c);flex:none}
.pl.act{background:var(--panel);color:var(--ink);font-weight:700;box-shadow:0 1px 4px rgba(40,46,49,.1)}
.pl.act::before{content:'';position:absolute;left:-10px;top:7px;bottom:7px;width:3px;border-radius:2px;background:#B85E5E}
#rail .foot{position:absolute;left:10px;right:10px;bottom:12px}
#view{position:absolute;left:214px;top:38px;right:0;bottom:0;overflow:hidden}
#doc{position:absolute;left:50%;top:16px;width:1120px;margin-left:-560px;transition:transform .65s cubic-bezier(.2,.8,.2,1)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:12px;transition:background .7s,border-color .7s}
.btn{min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);padding:7px 13px;font-weight:650;
  font-size:13px;display:flex;align-items:center;gap:7px;white-space:nowrap;transition:background .7s,color .7s,border-color .7s,box-shadow .3s}
.btn.pri{background:var(--deep);border-color:var(--deep);color:#fff}
.inp{height:40px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);padding:0 11px;font-size:13px;display:flex;align-items:center;font-family:'IBM Plex Mono',monospace}
#cur{position:absolute;left:0;top:0;width:26px;height:30px;z-index:36;transform:translate(-90px,-90px);
  transition:transform .66s cubic-bezier(.3,.85,.3,1);filter:drop-shadow(0 3px 7px rgba(0,0,0,.4))}
#cur svg{width:26px;height:30px;display:block}
#cur.slow{transition-duration:1.1s}
#rip{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50px;border:2.5px solid #40484C;opacity:0;z-index:35;transform:scale(.4)}
#rip.go{animation:rip .52s ease-out}
@keyframes rip{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
#toast{position:absolute;right:88px;bottom:88px;background:#282E31;color:#F7F7F5;font-size:13px;font-weight:700;padding:11px 16px;
  border-radius:12px;box-shadow:0 12px 30px rgba(20,26,30,.35);opacity:0;transform:translateY(16px);z-index:37;
  display:flex;gap:9px;align-items:center;transition:opacity .3s,transform .45s cubic-bezier(.16,1,.3,1)}
#toast.in{opacity:1;transform:none}
#toast i{width:7px;height:7px;border-radius:50%;background:#5F8378}`;

/* 拟真录屏的"手"：指针与点击波纹（放进 cues 区，不是 CSS 区） */
const SHELLJS = `
function at(el,fx=.5,fy=.5){let x=0,y=0,n=el;while(n&&n!==cam){x+=n.offsetLeft;y+=n.offsetTop;n=n.offsetParent}
  return[x+el.offsetWidth*fx,y+el.offsetHeight*fy]}
const curEl=$('#cur'),ripEl=$('#rip');
function curTo(el,fx,fy,cls=''){const[x,y]=at(el,fx,fy);curEl.className=cls;
  curEl.style.transform=\`translate(\${x-3}px,\${y-2}px)\`;ripEl.style.transform=\`translate(\${x}px,\${y}px) scale(.4)\`}
const click=()=>{ripEl.classList.remove('go');void ripEl.offsetWidth;ripEl.classList.add('go');__sfx.pop(.5)};`;

/* 窗口外壳的 HTML（rail 的 active 索引可变） */
const winOpen=(act)=>`
  <div id="cam">
    <div id="win">
      <div id="tbar"><span class="dot"></span><span class="wt">U-Time · 时间块与四象限</span>
        <span class="wbtns">
          <span class="wb"><svg viewBox="0 0 12 12"><path d="M1.5 6h9"/></svg></span>
          <span class="wb"><svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1"/></svg></span>
          <span class="wb"><svg viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg></span>
        </span></div>
      <div id="rail"><div class="brand">U-Time</div>
        <div class="nav${act==='quadrant'?' act':''}"><svg viewBox="0 0 14 14"><rect x="1" y="1" width="12" height="12" rx="2"/><path d="M7 1v12M1 7h12"/></svg>任务表</div>
        <div class="nav"><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.6"/><path d="M7 4v3.4l2.2 1.4"/></svg>时间块</div>
        <div class="nav"><svg viewBox="0 0 14 14"><path d="M1.4 8.6L3.2 3h7.6l1.8 5.6v3.4H1.4z"/></svg>收件箱</div>
        <div class="nav${act==='market'?' act':''}"><svg viewBox="0 0 14 14"><path d="M5.4 1.6h3.2v2a1.4 1.4 0 002.8 0h1v6.8H1.6V5.6h1a1.4 1.4 0 002.8 0z"/></svg>插件</div>
        <div class="cap">已启用插件</div><div id="plList"></div>
        <div class="foot"><div class="nav${act==='settings'?' act':''}"><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="2.2"/><path d="M7 .9l1 2.1h2.3l-.6 2.2L11 6.8l-2 1.2.3 2.3-2-.9-2 .9.3-2.3L1.6 6.8l1.3-.5-.6-2.2h2.3z"/></svg>设置</div></div>
      </div>
      <div id="view"><div id="doc">`;
const winClose=`</div></div>
      <div id="toast"><i></i><span id="toastTxt"></span></div>
    </div>
    <div id="rip"></div>
    <div id="cur"><svg viewBox="0 0 26 30"><path d="M3 1.6l18.4 11.2-7.7 1.5 4.3 9.2-3.2 1.5-4.3-9.2-5.2 6z" fill="#fff" stroke="#25282A" stroke-width="1.7" stroke-linejoin="round"/></svg></div>`;
const PLROWS=`const PL=[["学校通知网站","#B85E5E"],["课程表","#607D8B"],["番茄专注","#C86A2E"],["微信提醒推送","#3FA45B"],
  ["学习通","#3D6E9C"],["警大门户通知","#2F4858"],["竞赛消息雷达","#A9853B"],["中国节假日","#B03A48"],
  ["考试日历","#8B6D3F"],["轮换值日","#5F8378"],["拖入消息收纳","#6B7A8F"],["网页收集","#2E8B8B"],
  ["RSS 信息流","#7A5C8E"],["周度报告","#716B83"],["插件使用说明","#4C5550"]];
$('#plList').innerHTML=PL.map((p,i)=>\`<div class="pl\${i===ACT?' act':''}" style="--c:\${p[1]}"><i></i>\${p[0]}</div>\`).join('');`;
const TICK='<svg viewBox="0 0 12 12"><path d="M2 6.4l2.6 2.6L10 3.4"/></svg>';

/* ══════════ S4 · 微信提醒推送 · 拟真录屏 ══════════ */
PAGES.push({
  file: 'shot-s4_微信推送.html', style: '拟真录屏（推送内容下拉逐格点亮）',
  title: '镜头 S4 · 能推到微信的，全在这格里', hud: '镜头 S4 · 微信提醒推送 · 16s', dur: 16000,
  chap: 'S4 / 微信提醒推送', src: '推送内容取自应用内实际勾选项 · PushPlus 通道',
  fonts: 'family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700;900',
  bgNote: '桌面底：浅灰渐变', bg: `background:radial-gradient(1600px 900px at 50% 46%,#E9EBEC,#D6DADC 100%);box-shadow:inset 0 0 240px rgba(70,80,86,.2)`,
  css: `#cam{transform:scale(1.1);--bg:#EFEFEE;--paper:#F7F7F5;--panel:#fff;--ink:#25282A;--ink-2:#6C7377;--ink-3:#9CA2A5;--line:#DCDDDC;--deep:#40484C}
${SHELL}
.wp-h{font-size:11px;letter-spacing:.3em;color:var(--ink-2);margin:2px 0 12px}
.wp-t{font-size:15px;font-weight:900;color:var(--ink)}
.wp-note{font-size:12px;color:var(--ink-2);line-height:1.75;margin-top:8px}
.wp-docs{font-size:11.5px;color:var(--ink-3);margin-top:10px}
.wp-docs b{color:#607D8B;font-weight:600;border-bottom:1px dashed rgba(96,125,139,.5)}
.wp-prov{display:flex;gap:8px;margin-top:14px}
.wp-prov .btn{min-height:36px;font-size:12.5px}
.wp-prov .btn.on{background:var(--deep);border-color:var(--deep);color:#fff}
.wp-field{margin-top:14px}
.wp-field label{display:block;font-size:11px;color:var(--ink-2);margin-bottom:6px}
.wp-field .inp{width:420px;letter-spacing:2px}
.wp-row{display:flex;gap:14px;align-items:center;margin-top:16px}
.sw{width:44px;height:25px;border-radius:999px;background:#C6CACB;position:relative;flex:none;transition:background .35s}
.sw::after{content:'';position:absolute;left:3px;top:3px;width:19px;height:19px;border-radius:50%;background:#fff;
  box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .35s cubic-bezier(.3,1.4,.5,1)}
.sw.on{background:#3FA45B}.sw.on::after{transform:translateX(19px)}
.wp-ms .btn{min-height:38px;border-color:#3FA45B}
.wp-ms .btn b{color:#2E8B4E;font-weight:800}
.wp-ms .btn .car{color:var(--ink-3);transition:transform .35s}
.wp-ms .btn.open{box-shadow:0 0 0 3px rgba(63,164,91,.16)}
.wp-ms .btn.open .car{transform:rotate(180deg)}
#panel{height:0;overflow:hidden;opacity:0;background:var(--paper);border:1px solid transparent;border-radius:14px;
  transition:height .5s cubic-bezier(.2,.8,.2,1),opacity .35s,margin .4s,border-color .4s,padding .4s;margin-top:0;padding:0 14px}
#panel.in{height:322px;opacity:1;margin-top:14px;border-color:var(--line);padding:4px 14px 14px}
.pn-cap{font-size:10.5px;letter-spacing:2px;color:var(--ink-3);margin:12px 0 8px}
.pn-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.pn-grid.five{grid-template-columns:repeat(5,1fr)}
.ck{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;background:var(--panel);
  padding:9px 11px;font-size:12.5px;color:var(--ink-2);transition:border-color .3s,background .3s,color .3s,box-shadow .3s}
.ck i{width:16px;height:16px;border-radius:5px;border:1.6px solid var(--line);background:var(--panel);flex:none;
  display:flex;align-items:center;justify-content:center;transition:background .25s,border-color .25s}
.ck i svg{width:11px;height:11px;stroke:#fff;stroke-width:2.6;fill:none;opacity:0;transition:opacity .2s}
.ck.on{border-color:#3FA45B;background:rgba(63,164,91,.09);color:var(--ink);font-weight:700}
.ck.on i{background:#3FA45B;border-color:#3FA45B}.ck.on i svg{opacity:1}
.ck.pop{box-shadow:0 0 0 5px rgba(63,164,91,.16)}
.pn-note{font-size:11.5px;color:var(--ink-2);line-height:1.75;margin-top:14px;border-radius:10px;padding:9px 11px;transition:background .6s}
.pn-note.hi{background:rgba(169,133,59,.18)}
.wp-log{margin-top:14px;border-top:1px dashed var(--line);padding-top:10px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--ink-2);line-height:1.9}
.wp-log b{color:#3FA45B;font-weight:500}`,
  html: `${winOpen('market')}
  <div class="wp-h">微 信 信 息 推 送 · P U S H P L U S</div>
  <div class="card">
    <div class="wp-t">微信推送通道</div>
    <div class="wp-note">推荐使用 PushPlus：点「一键获取 Token」打开一对一消息页，微信扫码登录后复制页面上的 Token 粘贴回来。默认通过微信公众号渠道发送。</div>
    <div class="wp-docs">官方文档：<b>PushPlus 用户手册</b> · <b>微信公众号后台</b></div>
    <div class="wp-prov"><div class="btn on">PushPlus（推荐）</div><div class="btn">Server酱（兼容）</div></div>
    <div class="wp-field"><label>PushPlus Token</label><div class="inp">•••••••••••••••••••••••••••</div></div>
    <div class="wp-row"><span class="sw on" id="swMain"></span><span style="font-size:13px;font-weight:700;color:var(--ink)">启用微信推送</span>
      <div class="wp-ms" style="margin-left:auto"><div class="btn" id="msBtn">推送内容：<b id="msLab">未选</b> <span class="car">▾</span></div></div></div>

    <div id="panel">
      <div class="pn-cap">应 用 内 提 醒</div>
      <div class="pn-grid">
        <div class="ck" id="ckBlock"><i>${TICK}</i>时间块提醒</div>
        <div class="ck" id="ckTask"><i>${TICK}</i>任务截止提醒</div>
      </div>
      <div class="pn-cap">插 件 收 集 的 新 消 息</div>
      <div class="ck" id="ckAll" style="margin-bottom:8px"><i>${TICK}</i>总开关</div>
      <div class="pn-grid five">
        <div class="ck" id="ckCx"><i>${TICK}</i>学习通</div>
        <div class="ck" id="ckCppu"><i>${TICK}</i>警大门户</div>
        <div class="ck" id="ckGx"><i>${TICK}</i>竞赛消息</div>
        <div class="ck" id="ckRss"><i>${TICK}</i>RSS</div>
        <div class="ck" id="ckSn"><i>${TICK}</i>学校通知</div>
      </div>
      <div class="pn-note" id="pnNote">先攒 2 分钟，再把队列里全部待发消息合并成一条推送，尽量少占 PushPlus 频次额度（相同内容 1 小时限 3 条、每分钟限 5 次）。只想收某几个插件的消息，在上面的格子里取消勾选即可。</div>
    </div>

    <div class="wp-row" style="margin-top:16px">
      <span style="font-size:12px;color:var(--ink-2)">时间块提前</span><div class="btn" style="min-height:34px;font-size:12px">5 分钟</div>
      <span style="flex:1"></span><div class="btn" style="min-height:34px;font-size:12px">显示/隐藏凭据</div>
      <div class="btn pri" style="min-height:34px;font-size:12px">发送测试消息</div>
    </div>
    <div class="wp-log"><b>✓</b> 07:12:04 · 学校通知 · 已提交（1 条公告）<br><b>✓</b> 07:05:31 · 时间块 · 已提交（智慧消防专业英语 提前 5 分钟）</div>
  </div>
  ${winClose}`,
  cues: `${SHELLJS}
const ACT=3;
${PLROWS}
const lab=$('#msLab'),sets=[['ckBlock','时间块'],['ckTask','任务'],['ckAll','插件'],['ckCx','学习通'],['ckCppu','警大'],['ckGx','竞赛'],['ckRss','RSS'],['ckSn','通知']];
let picked=[];
const on_=(id,name)=>{const e=$('#'+id);e.classList.add('on');
  if(!picked.includes(name))picked.push(name);
  lab.textContent=picked.slice(0,3).join(' · ')+(picked.length>3?' 等':'')};

on(300,()=>camTo(0,0,1,2.2));                                       // 开场拉镜
on(420,()=>$('#win').classList.add('in'));
on(1050,()=>curTo($('#msBtn'),.5,.5,'slow'));                       // 手伸向「推送内容」
on(1900,()=>{click();$('#panel').classList.add('in');$('#msBtn').classList.add('open');__sfx.swipe(.6)});  // 下拉展开
on(2500,()=>{curTo($('#ckBlock'),.5,.5);$('#doc').style.transform='translateY(-96px)'});
on(3000,()=>{on_('ckBlock','时间块');__sfx.type(.5)});
on(3500,()=>{curTo($('#ckTask'),.5,.5);__sfx.type(.4)});
on(3900,()=>{on_('ckTask','任务截止');__sfx.type(.5)});
on(4400,()=>{curTo($('#ckAll'),.5,.5)});
on(4800,()=>{on_('ckAll','插件消息');__sfx.type(.55)});
for(let i=0;i<5;i++){const t=5400+i*420;
  on(t,()=>curTo($('#'+sets[3+i][0]),.5,.5));                       // 手先移过去
  on(t+300,()=>{on_(sets[3+i][0],sets[3+i][1]);__sfx.type(.45)})}   // 再勾上（绝对时间，便于无头定格）
on(7700,()=>{const e=$('#ckSn');const[x,y]=at(e,.5,.5);camFocus(x,y-40,1.24,1.1);__sfx.whoosh(1.1,.5)});  // 推到"细到单个插件"
on(9400,()=>{$('#pnNote').classList.add('hi');__sfx.ding(.75)});    // 攒 2 分钟合并那条说明
on(10600,()=>{const e=$('#ckRss');e.classList.remove('on');picked=picked.filter(x=>x!=='RSS');
  lab.textContent=picked.slice(0,3).join(' · ')+' 等';__sfx.pop(.45)});  // 取消一个：真能单独关
on(11600,()=>{on_('ckRss','RSS');__sfx.ding(.6)});                  // 再勾回来
on(12600,()=>{$('#pnNote').classList.remove('hi');camTo(0,0,1,1.4)});  // 拉回全景
on(14200,()=>camFocus(960,560,1.1,1.6));                            // 结尾轻推
/* 音效 */
on(300,()=>__sfx.swipe(.5));
on(420,()=>__sfx.pop(.35));`,
});

/* ══════════ S5 · 一遍过蒙太奇 · 集换式卡牌卡册 ══════════ */
PAGES.push({
  file: 'shot-s5_一遍过蒙太奇.html', style: '集换式卡牌卡册（活页环 + 卡槽 + 闪卡翻页）',
  title: '镜头 S5 · 剩下十一张卡，每张一秒', hud: '镜头 S5 · 消息收集类插件 · 18s', dur: 18000,
  chap: 'S5 / 其余 11 个插件', src: '条数为应用内实际缓存量 · 2026-09-20',
  fonts: 'family=Bungee&family=ZCOOL+KuaiLe&family=Noto+Sans+SC:wght@400;700;900&family=Share+Tech+Mono',
  bgNote: '卡册内页：深绿卡纸 + 压纹 + 活页环阴影',
  bg: `background:radial-gradient(1300px 800px at 50% 42%,#20302c,#111a18 78%);box-shadow:inset 0 0 240px rgba(0,0,0,.62)`,
  css: `#cam{transform:scale(1.16)}
/* 卡册背板 */
#binder{position:absolute;left:120px;top:96px;width:1680px;height:830px;border-radius:26px;
  background:linear-gradient(150deg,#2b3d38,#1b2724 62%);border:2px solid rgba(255,255,255,.07);
  box-shadow:0 40px 90px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.07)}
#binder::before{content:'';position:absolute;inset:0;border-radius:26px;pointer-events:none;
  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.022) 0 6px,transparent 6px 12px)}
.ring{position:absolute;left:-26px;top:150px;width:52px;height:52px;border-radius:50%;
  border:9px solid #b9a44f;box-shadow:0 0 0 3px rgba(0,0,0,.5),0 6px 14px rgba(0,0,0,.5)}
.ring.r2{top:390px}.ring.r3{top:630px}
#tabs{position:absolute;left:50%;top:132px;transform:translateX(-50%);font-family:'Bungee';font-size:15px;letter-spacing:8px;color:#b9a44f}
#cap{position:absolute;left:50%;bottom:130px;transform:translateX(-50%);text-align:center;font-family:'ZCOOL KuaiLe';
  font-size:22px;letter-spacing:5px;color:#7f9a90}
#cap b{color:#ffd23f;font-weight:400;font-family:'Share Tech Mono';font-size:30px;letter-spacing:1px}

/* 当前卡 */
#card{position:absolute;left:50%;top:486px;width:520px;height:600px;margin-left:-260px;margin-top:-300px;
  border-radius:22px;background:#f6f3ea;border:3px solid #0d1512;overflow:hidden;transform-origin:50% 50%;
  box-shadow:0 30px 70px rgba(0,0,0,.6),inset 0 0 0 6px rgba(255,255,255,.5);
  transform:translateX(-50%) rotateY(90deg);opacity:0;transition:transform .42s cubic-bezier(.2,1.2,.4,1),opacity .3s}
#card.in{transform:rotateY(0);opacity:1}
#card.out{transform:rotateY(-90deg) translateX(60px);opacity:0}
#card .band{height:104px;background:var(--c);display:flex;align-items:center;padding:0 24px;position:relative;overflow:hidden}
#card .band::after{content:'';position:absolute;inset:-40% -20%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent);
  transform:translateX(-70%);animation:shine 2.6s ease-in-out infinite}
@keyframes shine{0%,55%{transform:translateX(-70%)}100%{transform:translateX(80%)}}
#card .band .no{font-family:'Bungee';font-size:15px;letter-spacing:3px;color:rgba(0,0,0,.42)}
#card .band .cat{margin-left:auto;font-size:12px;letter-spacing:3px;color:rgba(0,0,0,.5);font-weight:900}
#card .glyph{height:236px;display:flex;align-items:center;justify-content:center;background:#fffdf6}
#card .glyph svg{width:132px;height:132px;stroke:var(--c);stroke-width:5;fill:none;stroke-linecap:round;stroke-linejoin:round}
#card .nm{font-family:'Noto Sans SC';font-size:34px;font-weight:900;color:#12211d;text-align:center;margin-top:26px;letter-spacing:1px}
#card .fn{font-size:16px;color:#5c6b66;text-align:center;margin-top:12px;line-height:1.6;padding:0 30px}
#card .stat{position:absolute;left:24px;right:24px;bottom:26px;display:flex;align-items:baseline;gap:10px;
  border-top:2px dashed rgba(18,33,29,.18);padding-top:16px}
#card .stat b{font-family:'Share Tech Mono';font-size:52px;color:var(--c);line-height:1}
#card .stat s{text-decoration:none;font-size:14px;color:#5c6b66;letter-spacing:2px}
#card .rarity{position:absolute;right:22px;top:120px;font-family:'Bungee';font-size:13px;letter-spacing:2px;color:#b9a44f}
/* 身后叠着的下一批卡 */
.stack{position:absolute;left:50%;top:486px;width:520px;height:600px;margin:-300px 0 0 -250px;border-radius:22px;
  background:#e7e2d5;border:3px solid #0d1512;opacity:0;transition:all .5s cubic-bezier(.16,1,.3,1)}
.stack.in{opacity:1}
.s1{transform:translate(26px,18px) scale(.97)}.s2{transform:translate(52px,36px) scale(.94)}
/* 计数 */
#count{position:absolute;right:150px;top:150px;font-family:'Share Tech Mono';font-size:64px;color:#ffd23f;letter-spacing:2px;opacity:.9}
#count s{text-decoration:none;font-size:22px;color:#7f9a90}
/* 角色 */
#anan{position:absolute;left:-4px;bottom:-14px;width:320px;z-index:28;opacity:0;transition:opacity .9s ease;
  filter:drop-shadow(0 14px 30px rgba(0,0,0,.5))}
#anan.show{opacity:1}
#anan img{width:100%;display:block;animation:bob 3.2s ease-in-out infinite alternate}
@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-12px)}}
#anan .say{position:absolute;right:-200px;top:80px;width:220px;background:#1d2b27;border-radius:16px;padding:13px 17px;
  font-size:23px;font-weight:900;color:#eef4f1;line-height:1.45;opacity:0;transform:scale(.6);transition:all .45s cubic-bezier(.34,1.6,.64,1);box-shadow:0 12px 34px rgba(0,0,0,.45)}
#anan .say::after{content:'';position:absolute;left:24px;bottom:-18px;border:9px solid transparent;border-top:11px solid #1d2b27}
#anan .say b{color:#ffd23f}
#anan.show .say{opacity:1;transform:scale(1);transition-delay:.45s}`,
  html: `
  <div id="cam">
    <div id="binder"><span class="ring"></span><span class="ring r2"></span><span class="ring r3"></span></div>
    <div id="tabs">C O L L E C T I O N &nbsp;B O O K</div>
    <div class="stack s2" id="stk2"></div><div class="stack s1" id="stk1"></div>
    <div id="card"><div class="band"><span class="no" id="cno">No.01</span><span class="cat" id="ccat">消息收集</span></div>
      <div class="rarity">COMMON</div><div class="glyph" id="cglyph"></div>
      <div class="nm" id="cnm"></div><div class="fn" id="cfn"></div>
      <div class="stat"><b id="cnum">0</b><s id="cunit">条消息</s></div></div>
    <div id="count"><span id="ci">01</span><s>/11</s></div>
    <div id="cap">十一张卡，各收各的消息 · 一共 <b id="total">0</b> 条</div>
    <div id="anan"><div class="say">翻得比<b>手速</b>还快。</div>
      <img src="anan - emotion rename/08_倦眼半阖_慵懒无力.png" alt="安安"></div>
  </div>`,
  cues: `/* 11 个一遍过的插件：名称 / 主色 / 收什么 / 数量 / 图标 */
const CARDS=[
 ["轮换值日","${C.duty}","宿舍值日表自动轮到今天谁",3,"组","users","M4 20v-2a4 4 0 014-4h4a4 4 0 014 4v2M10 10a4 4 0 100-8 4 4 0 000 8M18 20v-2a4 4 0 00-3-3.9M14 3.1a4 4 0 010 7.8"],
 ["竞赛消息雷达","${C.contest}","报名截止与材料清单自动盯梢",3,"场","radar","M12 3a9 9 0 109 9M12 12l7-5M12 12a4 4 0 100 8 4 4 0 000-8"],
 ["学习通","${C.chaoxing}","通知 · 作业 · 考试三类消息",239,"条","book","M3 5.5A2.5 2.5 0 015.5 3H12v18H5.5A2.5 2.5 0 013 18.5zM12 3h6.5A2.5 2.5 0 0121 5.5v13A2.5 2.5 0 0118.5 21H12"],
 ["中国节假日","${C.holiday}","放假与调休提前算清",2026,"年","cal","M3 5.5A2.5 2.5 0 015.5 3h13A2.5 2.5 0 0121 5.5v13A2.5 2.5 0 0118.5 21h-13A2.5 2.5 0 013 18.5zM3 8h18M8 3v5M16 3v5"],
 ["周度报告","${C.weekly}","这一周的时间去哪儿了",1,"份","chart","M4 20V9M10 20V4M16 20v-8M22 20H2"],
 ["网页收集","${C.web}","看到的内容折成自己的卡片",3,"张","globe","M12 3a9 9 0 100 18 9 9 0 000-18M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"],
 ["警大门户通知","${C.cppu}","校内门户与校园服务直达",50,"条","shield","M12 3l7 3v6c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6zM9 12l2.2 2.2L15.5 10"],
 ["考试日历","${C.exam}","从报名到开考全程倒数",17,"场","clock","M12 3a9 9 0 100 18 9 9 0 000-18M12 7v5.4l3.6 2.2"],
 ["拖入消息收纳","${C.drop}","拖进来的东西都有入口",2,"件","box","M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8"],
 ["RSS 信息流","${C.rss}","分散的更新收成一份报纸",56,"条","rss","M5 19a2 2 0 100-4 2 2 0 000 4M5 11a8 8 0 018 8M5 4c8.3 0 15 6.7 15 15"],
 ["插件使用说明","${C.guide}","每项能力都有路线图",15,"篇","doc","M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"],
];
const card=$('#card');
function show(i){const c=CARDS[i];
  card.style.setProperty('--c',c[1]);
  $('#cno').textContent='No.'+String(i+1).padStart(2,'0');
  $('#cnm').textContent=c[0];$('#cfn').textContent=c[2];
  $('#cnum').textContent=c[3];$('#cunit').textContent=c[4];
  $('#cglyph').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><title>'+c[5]+'</title><path d="'+c[6]+'"/></svg>';
  $('#ci').textContent=String(i+1).padStart(2,'0')}
show(0);
const flipOut=()=>{card.classList.remove('in');card.classList.add('out')};
const flipIn=i=>{show(i);card.classList.remove('out');card.classList.add('in');__sfx.swipe(.5);__sfx.pop(.4)};
on(300,()=>camTo(0,0,1,2.0));                                       // 开场拉镜
on(500,()=>{$('#stk1').classList.add('in');$('#stk2').classList.add('in')});
on(700,()=>{card.classList.add('in');__sfx.pop(.6)});
for(let i=1;i<11;i++){const t=1500+(i-1)*1400;                     // 11 张卡逐张翻
  on(t,flipOut);on(t+220,()=>flipIn(i))}
on(2000,()=>camFocus(960,470,1.1,1.4));
on(7000,()=>{$('#anan .say').innerHTML='十一张卡，<br>全是<b>收消息</b>的。';
  $('#anan img').src='anan - emotion rename/09_垂眸出神_淡然凝思.png';$('#anan').classList.remove('show')});  // 中段快闪
on(7160,()=>{$('#anan').classList.add('show');__sfx.pop(.5)});
on(16200,()=>{$('#anan .say').innerHTML='每张一秒，<b>够看清</b>。';
  $('#anan img').src='anan - emotion rename/04_闭目莞尔_温柔娇羞.png';$('#anan').classList.remove('show')}); // 结尾定场
on(16360,()=>$('#anan').classList.add('show'));
on(16400,()=>{$('#total').textContent=CARDS.reduce((a,c)=>a+c[3],0);__sfx.ding(.9)});  // 合计条数（直接落值，不用补间）
on(17200,()=>camTo(0,0,1,1.2));
/* 音效 */
on(300,()=>__sfx.swipe(.5));`,
});

/* ══════════ S6 · 深色模式 · 拟真录屏 ══════════ */
PAGES.push({
  file: 'shot-s6_深色模式.html', style: '拟真录屏（同一套界面整场换色板）',
  title: '镜头 S6 · 一句话，整套色板跟着换', hud: '镜头 S6 · 深色模式 · 8s', dur: 8000,
  chap: 'S6 / 深色模式', src: '深色由浅色令牌按 WCAG 反解派生 · 与主题正交',
  fonts: 'family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500;700;900',
  bgNote: '桌面底随主题一起变',
  bg: `background:radial-gradient(1600px 900px at 50% 46%,#E9EBEC,#D6DADC 100%);box-shadow:inset 0 0 240px rgba(70,80,86,.2);transition:background .8s ease`,
  css: `#cam{transform:scale(1.08);--bg:#EFEFEE;--paper:#F7F7F5;--panel:#fff;--ink:#25282A;--ink-2:#6C7377;--ink-3:#9CA2A5;--line:#DCDDDC;--deep:#40484C;
  --q1:#A84D4D;--q1b:#EAB9BA;--q2:#9A7937;--q2b:#E0CCA1;--q3:#626C9B;--q3b:#C3C8E4;--q4:#5E786E;--q4b:#BED0C9}
#cam.dark{--bg:#12171C;--paper:#17212B;--panel:#1C2733;--ink:#E7EEF2;--ink-2:#9DAFB9;--ink-3:#65798A;--line:#2A3742;--deep:#8FA6B5;
  --q1b:#4A2C2E;--q2b:#453A20;--q3b:#2C3350;--q4b:#25403A}
${SHELL}
#stage{transition:background .8s ease}
#tbar .mode{margin-left:14px;display:flex;align-items:center;gap:8px;height:26px;padding:0 10px;border-radius:7px;
  border:1px solid var(--line);background:var(--panel);font-size:11.5px;color:var(--ink-2);transition:all .7s}
#tbar .mode svg{width:13px;height:13px;stroke:var(--ink-2);stroke-width:1.7;fill:none;transition:stroke .7s}
#tbar .mode .sw{width:32px;height:18px;border-radius:999px;background:#C6CACB;position:relative;transition:background .5s}
#tbar .mode .sw::after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#fff;
  box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .45s cubic-bezier(.3,1.5,.5,1)}
#cam.dark #tbar .mode .sw{background:#8FA6B5}#cam.dark #tbar .mode .sw::after{transform:translateX(14px)}
.vh{display:flex;align-items:baseline;gap:12px;margin:2px 0 14px}
.vh h2{font-size:19px;font-weight:900;color:var(--ink);transition:color .7s}
.vh .sm{font-size:11.5px;color:var(--ink-3);transition:color .7s}
#quad{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.q{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px;min-height:520px;
  transition:background .7s,border-color .7s,box-shadow .7s}
.q h3{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:900;color:var(--ink);transition:color .7s}
.q h3 i{width:9px;height:9px;border-radius:3px;background:var(--qc);flex:none}
.q .n{margin-left:auto;font-family:'IBM Plex Mono';font-size:11px;color:var(--ink-3)}
.task{margin-top:10px;border-radius:11px;padding:10px 11px;background:var(--qb);transition:background .7s,transform .4s,box-shadow .4s}
.task b{display:block;font-size:12.5px;font-weight:700;color:#22282b;transition:color .7s}
.task s{display:block;text-decoration:none;font-family:'IBM Plex Mono';font-size:10px;color:rgba(34,40,44,.6);margin-top:4px;transition:color .7s}
#cam.dark .task b{color:#F2F7F9}
#cam.dark .task s{color:rgba(242,247,249,.6)}
.task:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.12)}
.task.new{animation:pop .5s cubic-bezier(.2,1.5,.4,1)}
@keyframes pop{60%{transform:scale(1.03)}}
#veil{position:absolute;inset:0;background:#0d1319;opacity:0;pointer-events:none;z-index:33;transition:opacity .34s ease}
#veil.flash{opacity:.34}`,
  html: `${winOpen('quadrant')}
  <div class="vh"><h2>任务表</h2><span class="sm">先决定，再动手 · 37 项</span></div>
  <div id="quad"></div>
  ${winClose}
  <div id="veil"></div>`,
  cues: `${SHELLJS}
const ACT=-1;
${PLROWS}
/* 浅色令牌按 WCAG 反解出深色：这里直接换 CSS 变量，整场一起过渡 */
const Q=[['重要且紧急','${C.q1}','var(--q1b)',[['交无人机装配报告','今天 14:00'],['消训楼 410 借钥匙','明天 08:00']]],
 ['重要不紧急','${C.q2}','var(--q2b)',[['复习线性代数A 第 3 章','本周'],['准备电子设计竞赛','下周'],['投英语竞赛稿','9 月 30 日']]],
 ['紧急不重要','${C.q3}','var(--q3b)',[['宿舍值日','今天'],['填实践表','周五前']]],
 ['不重要不紧急','${C.q4}','var(--q4b)',[['整理旧照片','随时']]]];
$('#quad').innerHTML=Q.map(q=>'<div class="q" style="--qc:'+q[1]+';--qb:'+q[2]+'"><h3><i></i>'+q[0]+'<span class="n">'+q[3].length+'</span></h3>'+
  q[3].map(t=>'<div class="task"><b>'+t[0]+'</b><s>'+t[1]+'</s></div>').join('')+'</div>').join('');
const modeBtn='<div class="mode" id="modeBtn"><svg viewBox="0 0 14 14"><path d="M11.6 8.8A5.2 5.2 0 015.2 2.4 5.2 5.2 0 108.8 11.6z"/></svg>深色模式<span class="sw"></span></div>';
$('#tbar .wbtns').insertAdjacentHTML('beforebegin',modeBtn);

on(300,()=>camTo(0,0,1,1.8));                                       // 开场拉镜
on(400,()=>$('#win').classList.add('in'));
on(900,()=>curTo($('#modeBtn'),.5,.5,.7));                          // 手伸向深色模式
on(1500,()=>{click();$('#veil').classList.add('flash')});           // 第一下：整场换深色
on(1820,()=>{$('#veil').classList.remove('flash');$('#cam').classList.add('dark');__sfx.whoosh(1,.7)});
on(2600,()=>camFocus(960,520,1.1,1.2));                             // 深色态下读一眼四象限
on(4200,()=>{curTo($('#modeBtn'),.5,.5,.7);camTo(0,0,1,1.1)});
on(4900,()=>{click();$('#veil').classList.add('flash')});           // 第二下：回到浅色
on(5220,()=>{$('#veil').classList.remove('flash');$('#cam').classList.remove('dark');__sfx.whoosh(1,.7)});
on(6100,()=>camFocus(700,420,1.12,1.5));                            // 结尾轻推定格
/* 音效 */
on(300,()=>__sfx.swipe(.45));
on(400,()=>__sfx.pop(.3));`,
});

/* ══════════ S7 · 设置 · 浅色 SaaS 仪表盘 ══════════ */
PAGES.push({
  file: 'shot-s7_设置与文字大小.html', style: '浅色 SaaS 仪表盘（白卡片柔投影 + 侧栏清单）',
  title: '镜头 S7 · 设置里能改的，一屏念完', hud: '镜头 S7 · 设置 · 26s', dur: 26000,
  chap: 'S7 / 设置', src: '分类与副标题取自应用内设置侧栏实际条目',
  fonts: 'family=Manrope:wght@500;700;800&family=Noto+Sans+SC:wght@400;700;900&family=IBM+Plex+Mono:wght@400;600',
  bgNote: '仪表盘底：冷灰蓝渐变 + 极淡网格',
  bg: `background:linear-gradient(160deg,#F2F4F6,#E6EAEE 60%,#DFE4E9);box-shadow:inset 0 0 200px rgba(90,105,115,.14)`,
  css: `#cam{transform:scale(1.12)}
#head{position:absolute;left:120px;top:56px;opacity:0;transform:translateY(-14px);transition:all .6s cubic-bezier(.16,1,.3,1)}
#head.in{opacity:1;transform:none}
#head .k{font-family:'Manrope';font-weight:800;font-size:12px;letter-spacing:6px;color:#7E8B94}
#head h1{font-family:'Manrope','Noto Sans SC';font-weight:800;font-size:44px;letter-spacing:1px;color:#25282A;margin-top:8px}
#head .s{font-size:14px;color:#7E8B94;margin-top:6px;letter-spacing:1px}
/* 左：侧栏清单 */
#list{position:absolute;left:120px;top:210px;width:520px}
.row{display:flex;align-items:center;gap:14px;padding:13px 16px;border-radius:14px;background:rgba(255,255,255,.62);
  border:1px solid rgba(255,255,255,.9);margin-bottom:7px;opacity:0;transform:translateX(-22px);
  transition:opacity .4s ease,transform .5s cubic-bezier(.16,1,.3,1),background .35s,box-shadow .35s;
  box-shadow:0 1px 3px rgba(60,75,85,.05)}
.row.in{opacity:1;transform:none}
.row.on{background:#fff;box-shadow:0 8px 22px rgba(60,75,85,.13);transform:translateX(8px)}
.row .ic{width:34px;height:34px;border-radius:10px;background:#EEF1F4;display:flex;align-items:center;justify-content:center;flex:none;transition:background .35s}
.row.on .ic{background:#40484C}
.row .ic svg{width:16px;height:16px;stroke:#6C7377;stroke-width:1.7;fill:none;transition:stroke .35s}
.row.on .ic svg{stroke:#fff}
.row .lb{font-size:15.5px;font-weight:900;color:#25282A;letter-spacing:.4px}
.row .ht{font-family:'IBM Plex Mono';font-size:10.5px;color:#9CA2A5;margin-top:3px;letter-spacing:.4px}
/* 右：详情大卡 */
#detail{position:absolute;left:690px;top:210px;width:1110px;height:700px;background:#fff;border-radius:22px;
  border:1px solid #E6E9EC;box-shadow:0 22px 50px rgba(60,75,85,.13);padding:34px 38px;opacity:0;transform:translateY(20px);
  transition:opacity .5s ease,transform .6s cubic-bezier(.16,1,.3,1)}
#detail.in{opacity:1;transform:none}
#detail .dk{font-family:'Manrope';font-weight:800;font-size:11px;letter-spacing:5px;color:#9CA2A5}
#detail h2{font-size:34px;font-weight:900;color:#25282A;margin-top:10px;letter-spacing:1px}
#detail .dd{font-size:15px;color:#6C7377;line-height:1.9;margin-top:14px;max-width:940px}
#detail .dd b{color:#25282A}
#detail .swap{opacity:0;transition:opacity .3s}
#detail .swap.in{opacity:1}
/* 文字大小那一屏 */
#scale{position:absolute;left:38px;right:38px;top:250px;opacity:0;transform:translateY(18px);transition:all .55s cubic-bezier(.16,1,.3,1)}
#scale.in{opacity:1;transform:none}
#scale .cap{display:flex;align-items:baseline;gap:12px}
#scale .cap b{font-size:17px;font-weight:900;color:#25282A}
#scale .cap s{text-decoration:none;font-family:'IBM Plex Mono';font-size:26px;color:#40484C;font-weight:600}
#track2{position:relative;margin-top:26px;height:44px}
#track2 .rail{position:absolute;left:0;right:0;top:20px;height:6px;border-radius:4px;background:#E6E9EC}
#track2 .fill{position:absolute;left:0;top:20px;width:31%;height:6px;border-radius:4px;background:#40484C;transition:width .18s linear}
#thumb{position:absolute;left:31%;top:12px;width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid #40484C;
  box-shadow:0 3px 10px rgba(40,48,52,.28);transition:left .18s linear}
#ticks{position:absolute;left:0;right:0;top:40px;height:16px;font-family:'IBM Plex Mono';font-size:10.5px;color:#9CA2A5}
#ticks span{position:absolute;transform:translateX(-50%)}
#ticks span:first-child{transform:none}#ticks span:last-child{transform:translateX(-100%)}
#preview{margin-top:46px;border-top:1px dashed #E6E9EC;padding-top:26px}
#preview .pv{color:#25282A;font-weight:700;line-height:1.5;transition:font-size .2s linear}
#preview .pv2{color:#6C7377;line-height:1.7;margin-top:12px;transition:font-size .2s linear}
#stdBtn{position:absolute;right:0;top:0;display:flex;align-items:center;gap:8px}
#stdBtn .cap2{font-size:11px;letter-spacing:2px;color:#9CA2A5;margin-right:4px}
#stdBtn .p{min-height:36px;padding:6px 16px;border-radius:10px;border:1px solid #E6E9EC;background:#F7F7F5;
  font-size:13px;font-weight:700;color:#6C7377;transition:all .35s}
#stdBtn .p.on{background:#40484C;border-color:#40484C;color:#fff;box-shadow:0 6px 16px rgba(40,48,52,.24)}
#foot{position:absolute;left:690px;top:930px;font-size:12.5px;color:#7E8B94;letter-spacing:1px;opacity:0;transition:opacity .5s}
#foot.in{opacity:1}
#foot b{color:#40484C}`,
  html: `
  <div id="cam">
    <div id="head"><div class="k">SETTINGS</div><h1>设置里能改的，一屏念完</h1>
      <div class="s">十类配置 · 全部存在本机 · 不上传</div></div>
    <div id="list"></div>
    <div id="detail">
      <div class="dk" id="dK">SECTION 01</div><h2 id="dH">界面与交互</h2>
      <div class="dd" id="dD"></div>
      <div id="scale">
        <div id="stdBtn"><span class="cap2">界面缩放</span><div class="p">小</div><div class="p on" id="stdP">标准</div><div class="p">大</div></div>
        <div class="cap"><b>文字大小</b><s id="pct">100%</s></div>
        <div id="track2"><div class="rail"></div><div class="fill" id="fill"></div><div id="thumb"></div>
          <div id="ticks"><span style="left:0">80%</span><span style="left:14.3%">90%</span><span style="left:28.6%">100%</span><span style="left:57.1%">120%</span><span style="left:100%">150%</span></div></div>
        <div id="preview"><div class="pv" id="pv1">北京大学2026年招收台湾高中毕业生初审结果查询通知</div>
          <div class="pv2" id="pv2">周一 第 1-2 节 · 数字电子技术 · A102 · 刘晓军</div></div>
      </div>
    </div>
    <div id="foot">看不清就拖这里 —— <b>文字大小</b>只管字，<b>界面缩放</b>管整页</div>
  </div>`,
  cues: `/* 应用内设置侧栏的真实条目（label + hint） */
const SEC=[
 ["界面与交互","密度 / 字号 / 缩放 / 动效 / 窗口","调<b>界面密度</b>、<b>文字大小</b>、<b>界面缩放</b>，还有动效开关、启动页、窗口大小与托盘行为。"],
 ["主题","配色与阅读模式","六套主题配色，深浅色是<b>两个正交属性</b>：主题管颜色，深色模式管明暗。"],
 ["任务提醒","预警时间与提示音","任务截止前多久提醒、用什么提示音，音量单独可调。"],
 ["数据中心","备份 / 恢复 / 交换","JSON、CSV、Excel、ICS 全支持，还有自动恢复点，误删能退回去。"],
 ["可选同步","网盘快照 / 一键配置引导","WebDAV 快照同步，换手机换电脑时一键把配置搬过去。"],
 ["AI 与自动任务","Base / API Key / 安全边界","填模型 Base 与 Key，Key 存在系统密钥库里；自动任务的边界写得很清楚。"],
 ["全局快捷键","命令面板 / 快速捕获 / 插件快捷键","命令面板、快速捕获，以及每个插件的字母快捷键（按拼音首字母自动分配）。"],
 ["局域网联动","手机联动与二维码","同一 WiFi 下扫码配对，手机和桌面互传。"],
 ["插件管理","启用 / 导入 / 导出","十五个内置插件的启停、权限，也能导入导出 ZIP。"],
 ["关于","版本 / 软件更新 / 开源信息","当前版本、检查更新、开源框架清单。"]];
$('#list').innerHTML=SEC.map((s,i)=>'<div class="row" id="r'+i+'"><span class="ic"><svg viewBox="0 0 16 16"><rect x="2" y="2.5" width="12" height="11" rx="2.4"/><path d="M2 6.5h12"/></svg></span>'+
  '<span><span class="lb">'+s[0]+'</span><span class="ht">'+s[1]+'</span></span></div>').join('');
const rows=[...document.querySelectorAll('.row')];
function pick(i){rows.forEach((r,j)=>r.classList.toggle('on',j===i));
  $('#dK').textContent='SECTION '+String(i+1).padStart(2,'0');
  $('#dH').textContent=SEC[i][0];$('#dD').innerHTML=SEC[i][2]}
pick(0);
/* 滑杆：80% → 150% → 回到标准 100% */
const pos=v=>(v-80)/70*100;
function setScale(v){$('#pct').textContent=v+'%';$('#fill').style.width=pos(v)+'%';$('#thumb').style.left=pos(v)+'%';
  $('#pv1').style.fontSize=(15*v/100)+'px';$('#pv2').style.fontSize=(13*v/100)+'px'}
setScale(100);

on(300,()=>camTo(0,0,1,2.0));                                       // 开场拉镜
on(500,()=>$('#head').classList.add('in'));
on(900,()=>$('#detail').classList.add('in'));
for(let i=0;i<10;i++)on(1300+i*430,()=>{rows[i].classList.add('in');__sfx.type(.3)});  // 侧栏逐条落位
for(let i=0;i<10;i++)on(5900+i*620,()=>{pick(i);__sfx.pop(.34)});   // 逐类念过去
on(12300,()=>{pick(0);camFocus(1250,420,1.16,1.1);__sfx.whoosh(1.1,.5)});  // 回到「界面与交互」
on(13400,()=>{$('#dD').innerHTML='「文字大小」这一行 —— <b>拖一下，全部文字跟着长</b>。';
  $('#scale').classList.add('in');$('#stdP').classList.add('on')});
on(14600,()=>{setScale(80);$('#stdP').classList.remove('on');__sfx.pop(.4)});  // 先压到最小：「标准」高亮随之取消
[92,104,116,128,140,150].forEach((v,i)=>on(15400+i*250,()=>{setScale(v);__sfx.type(.18)}));  // 一格一格拖到 150%
on(18600,()=>camFocus(1250,520,1.2,1.1));                           // 推到放大后的预览文字
on(20600,()=>{$('#foot').classList.add('in');__sfx.ding(.7)});
[132,118,106,100].forEach((v,i)=>on(21600+i*220,()=>{setScale(v);__sfx.type(.16)}));  // 拖回标准
on(23400,()=>{setScale(100);$('#stdP').classList.add('on');__sfx.ding(.85)});
on(24400,()=>camTo(0,0,1,1.4));                                     // 拉回全景定格
/* 音效 */
on(300,()=>__sfx.swipe(.5));`,
});

/* 只生成命令行点名的镜头，方便单镜迭代 */
const want = process.argv.slice(2);
PAGES.filter(p => !want.length || want.includes(p.file.slice(5, 7))).forEach(page);
