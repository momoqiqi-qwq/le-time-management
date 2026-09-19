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
#stamp{position:absolute;left:1520px;top:214px;width:186px;height:186px;border:6px solid rgba(184,94,94,.62);border-radius:50%;
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
  chap: 'S3 / 番茄专注', src: '自定义时长精确到秒 · 最短 1 秒 · 结束音为内置提示音', srcTop: true,
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
#dial{position:absolute;left:60px;top:56px;width:488px;height:488px;display:flex;flex-direction:column;align-items:center;justify-content:center}
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
on(5300,()=>{ms.textContent='0.00';prog.style.strokeDashoffset=L;                       // 归零
  $('#done').classList.add('in');$('#slowtag').classList.remove('on');
  document.getElementById('stage').classList.remove('letter');
  camFocus(960,540,1.24,.5);__sfx.ding(1.2);after(120,()=>__sfx.ding(.9));after(260,()=>__sfx.ding(.7))});
on(5900,()=>camFocus(960,540,1.1,1.1));                             // 冲击后拉回
on(6600,()=>{$('#pc').textContent='10';$('#pm').textContent='5.4';$('#prize').classList.add('in');__sfx.pop(.6)});  // 奖池 +1
on(7400,()=>{for(let i=0;i<9;i++)after(i*70,()=>__sfx.type(.3))});  // 计数连击
on(8600,()=>camTo(0,0,1,1.4));                                      // 全景定格
on(10200,()=>{camFocus(960,600,1.12,1.8)});                         // 结尾轻推
on(12600,()=>{$('#done').classList.remove('in')});`,
});

/* 只生成命令行点名的镜头，方便单镜迭代 */
const want = process.argv.slice(2);
PAGES.filter(p => !want.length || want.includes(p.file.slice(5, 7))).forEach(page);
