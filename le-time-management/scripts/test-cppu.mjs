import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/plugins/cppu-notify/main.js',import.meta.url),'utf8');
let response, calls=[], vaultData={};
const context = vm.createContext({URL,Set,Map,Date,console,setTimeout,clearTimeout,setInterval,clearInterval,
  document:{createElement:()=>({set innerHTML(x){this.value=x;}})},
  tide:{ui:{registerView(){}},http:{session:async()=>'s1',restoreCookies:async(dump)=>{calls.push(['restore',dump]);return 'restored-sid';},fetch:async(...args)=>{calls.push(args);return typeof response==='function'?response(...args):response;}},storage:{set:async()=>{},get:async()=>null},vault:{get:async(key)=>vaultData[key]||null,set:async(key,value)=>{vaultData[key]=value;}}}
});
vm.runInContext(source.replace('  tide.ui.registerView({','  globalThis.testApi = {state,cardHtml,loadDetail,loadPage,newSession,cleanText,OCR,restoreCookies,silentRenew,submitLogin,finishPortalLogin};\n  tide.ui.registerView({'),context);
const {state,cardHtml,loadDetail,loadPage,newSession,cleanText,OCR,restoreCookies,silentRenew,submitLogin}=context.testApi;
const item={RESOURCE_ID:'test',PIM_TITLE:'Test <notice>',CREATE_TIME:1};
assert.match(cardHtml(item),/展开正文/);
assert.match(cardHtml(item),/class="pp-detail-shell" aria-hidden="true"/);
assert.doesNotMatch(cardHtml(item),/class="pp-card open"/);
state.expanded.add('test');
assert.match(cardHtml(item),/aria-expanded="true"/);
assert.match(cardHtml(item),/正在加载正文/);
let release;
response=()=>new Promise(resolve=>{release=resolve;});
const pending=loadDetail('test');
state.expanded.delete('test');
release({status:200,body:JSON.stringify([{PIM_CONTENT:'First<br><br>Second'}])});
await pending;
assert.match(cardHtml(item),/class="pp-detail-shell" aria-hidden="true"/,'Late response must keep collapsed card closed');
assert.doesNotMatch(cardHtml(item),/class="pp-card open"/,'Late response must not reopen collapsed card');
state.expanded.add('test');
assert.match(cardHtml(item),/First\n\nSecond/);
const count=calls.length;
await loadDetail('test');
assert.equal(calls.length,count,'Reopen uses cached content');
assert.match(calls[0][2],/\/tp_up\/up\/pim\/showpim\//);
assert.equal(cleanText('First<br><br>Second'),'First\n\nSecond');
state.details.test={error:'network unavailable'};
assert.match(cardHtml(item),/重试加载正文/);
response={status:200,body:'{"list":[]}'};
await loadPage(1);
assert.match(calls.at(-1)[2],/\/tp_up\/up\/pim\/allpim\//);
state.token='test-token';calls=[];
response=(sid,method,url)=>url.includes('allpim')?{status:503,body:''}:{status:200,body:'',finalUrl:'https://portal-jw.cppu.edu.cn/tp_up/view;tp_up=renewed?m=up'};
await loadPage(1);
assert.equal(calls.filter(c=>c[2].includes('allpim')).length,2,'Only one renewal retry');
assert.equal(state.fetching,false);
await newSession();const sid=state.sid;await newSession();assert.equal(state.sid,sid);
assert.ok(source.includes('if (!e.target.closest("[data-toggle]")) return;'),'Selecting body text must not collapse');

// 重启后应同时恢复 Cookie Jar 与门户 tp_up，优先复用现成门户会话。
state.sid=null;state.token='';calls=[];
vaultData.cookies=JSON.stringify([{url:'https://portal-jw.cppu.edu.cn',cookie:'CASTGC=tgt; tp_up=saved-token; theme=light'}]);
assert.equal(await restoreCookies(),true);
assert.equal(state.sid,'restored-sid');
assert.equal(state.token,'saved-token');
assert.equal(calls[0][0],'restore');
assert.ok(source.includes('if (await loadPage(1)) { buildMain(el); return true; }'), '恢复的门户票据必须先验证，失效后继续走密码兜底');
assert.ok(!source.includes('if (state.token) { buildMain(el); return; }'), '每次重新进入插件都必须验证内存票据，不能直接信任旧 token');

// 只有主 SSO CASTGC 可用时，应逐段走完主 SSO → bridge → sso-jw → portal。
state.token='';calls=[];let renewStep=0;
response=()=>{
  renewStep++;
  if(renewStep===1) return {status:200,body:'<html>sso-jw login</html>',finalUrl:'https://sso-jw.cppu.edu.cn/tpass/login',location:'',cookies:[]};
  if(renewStep===2) return {status:302,body:'',finalUrl:'https://sso.cppu.edu.cn/tpass/login',location:'https://sso-jw.cppu.edu.cn/tpass/bridge?ticket=ST-main',cookies:[]};
  if(renewStep===3) return {status:200,body:'bridge ok',finalUrl:'https://sso-jw.cppu.edu.cn/tpass/bridge?ticket=ST-main',location:'',cookies:['CASTGC=TGT']};
  if(renewStep===4) return {status:302,body:'',finalUrl:'https://sso-jw.cppu.edu.cn/tpass/login',location:'https://portal-jw.cppu.edu.cn/tp_up/view?ticket=ST-portal',cookies:[]};
  return {status:302,body:'',finalUrl:'https://portal-jw.cppu.edu.cn/tp_up/view?ticket=ST-portal',location:'/tp_up/view;tp_up=bridge-token?m=up',cookies:['tp_up=bridge-token; Path=/tp_up']};
};
assert.equal(await silentRenew(),true);
assert.equal(state.token,'bridge-token');
assert.equal(calls.length,5,'主 SSO 票据恢复必须显式补走完整 bridge 换票链路');
assert.ok(calls.every(c=>c[3].followRedirects===false),'静默续期每段都必须禁止自动重定向');

// 密码登录必须禁止自动重定向，并按原 skill 的四段链路逐个消费一次性 ticket。
state.sid='sso-test';state.token='';calls=[];state.pending={username:'student',password:'secret',execution:'exec-1'};
response=(sid,method,url,opts)=>{
  if(method==='POST') return {status:302,body:'',finalUrl:url,location:'https://sso-jw.cppu.edu.cn/tpass/bridge?ticket=ST-1',cookies:[]};
  if(url.includes('/tpass/bridge?ticket=')) return {status:200,body:'bridge ok',finalUrl:url,location:'',cookies:['CASTGC=TGT']};
  if(url.includes('sso-jw.cppu.edu.cn/tpass/login')) return {status:302,body:'',finalUrl:url,location:'https://portal-jw.cppu.edu.cn/tp_up/view?ticket=ST-2',cookies:[]};
  return {status:302,body:'',finalUrl:url,location:'/tp_up/view;tp_up=portal-token?m=up',cookies:['tp_up=portal-token; Path=/tp_up']};
};
await submitLogin('1234');
assert.equal(state.token,'portal-token');
assert.equal(calls.length,4,'密码登录应显式完成主 SSO、bridge、门户换票和门户落票四段请求');
assert.equal(calls[0][1],'POST');
assert.equal(calls[0][3].followRedirects,false,'登录 POST 禁止自动跨域重定向');
assert.ok(calls.slice(1).every(c=>c[3].followRedirects===false),'一次性 ticket 的每段 GET 都禁止自动重定向');

/* ── 8. 自动登录：加密凭据、会话恢复、验证码识别重试链路 ── */
assert.ok(source.includes('tide.vault'), '插件必须通过 tide.vault 存取加密凭据');
assert.ok(source.includes('exportCookies') && source.includes('restoreCookies'), '登录态必须能导出/恢复以跨重启');
assert.ok(source.includes('AUTO_ATTEMPTS'), '验证码识别失败必须有换图重试');
assert.ok(source.includes('验证码自动识别 ✓'), '登录界面自动登录状态必须如实展示');
const cppuManifest = JSON.parse(fs.readFileSync(new URL('../public/plugins/cppu-notify/manifest.json', import.meta.url), 'utf8'));
assert.equal(cppuManifest.version, '1.5.0');
assert.ok((cppuManifest.permissions || []).includes('vault'), 'manifest 必须声明 vault 权限才能用密钥库');
assert.ok((cppuManifest.permissions || []).includes('openUrl'), 'manifest 必须声明 openUrl 权限才能打开校园服务链接');
const catalogSrc = fs.readFileSync(new URL('../src/pluginCatalog.js', import.meta.url), 'utf8');
const cppuEntry = catalogSrc.slice(catalogSrc.indexOf('"id": "cppu-notify"'));
const cppuBlock = cppuEntry.slice(0, cppuEntry.indexOf('},\n  {'));
assert.match(cppuBlock, /"1\.5\.0"/, 'pluginCatalog 必须同步插件新版本号');
assert.match(cppuBlock, /"vault"/, 'pluginCatalog 必须同步 vault 权限');
assert.match(cppuBlock, /"openUrl"/, 'pluginCatalog 必须同步 openUrl 权限');

/* ── 左侧校园服务栏：四个入口 + 标题/图标自动识别 ── */
for (const url of ['https://webvpn.cppu.edu.cn/', 'https://mail.cppu.edu.cn/', 'https://jw.cppu.edu.cn/index.html', 'https://xg.cppu.edu.cn/XGPhone/Phone/index.html']) {
  assert.ok(source.includes(url), `校园服务栏必须包含 ${url}`);
}
assert.ok(source.includes('data-side') && source.includes('data-goto'), '校园服务栏必须渲染成可点击的入口');
assert.ok(source.includes('tide.util.web.parseSiteMeta'), '标题必须来自网页元信息自动识别');
assert.ok(source.includes('/icons/fontawesome/solid.svg#'), '图标必须使用应用内的 Font Awesome 字形兜底');
assert.ok(source.includes('LINK_META_TTL') && source.includes('quickLinkMeta'), '识别结果必须本地缓存，避免每次进插件都抓四个站点');
assert.ok(source.includes('bindSide') && source.includes('loadLinkMeta(el)'), '侧栏必须同时绑定在登录页与通知列表页');
assert.ok(source.includes('AUTO_REFRESH_MS') && source.includes('data-ar'), '插件必须提供低打扰的定时自动刷新开关');
const hostSrc = fs.readFileSync(new URL('../src/pluginHost.js', import.meta.url), 'utf8');
assert.ok(hostSrc.includes('vault: "加密密钥库'), '插件宿主必须定义 vault 权限标签');
assert.ok(hostSrc.includes('requirePermission(man, pid, "vault")'), 'tide.vault 必须走权限校验');
assert.ok(hostSrc.includes('?v=${encodeURIComponent(version)}') && hostSrc.includes('cache: "no-cache"'), '内置插件入口必须按版本破缓存，避免升级后仍运行旧代码');
const apiSrc = fs.readFileSync(new URL('../src/api.js', import.meta.url), 'utf8');
assert.ok(apiSrc.includes('plugin_vault_get') && apiSrc.includes('http_session_restore'), 'api 层必须接通密钥库与会话恢复命令');
assert.ok(apiSrc.includes('followRedirects: opts.followRedirects'), 'api 层必须把重定向策略传给 Rust HTTP 会话');
const libSrc = fs.readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
assert.ok(libSrc.includes('fn http_session_export') && libSrc.includes('fn plugin_vault_set'), 'Rust 侧必须提供会话导出与密钥库命令');
assert.ok(libSrc.includes('Policy::none()') && libSrc.includes('follow_redirects'), 'Rust HTTP 会话必须支持禁止自动重定向');
assert.ok(libSrc.includes('reqwest::header::LOCATION'), 'Rust HTTP 响应必须把 Location 暴露给插件逐段换票');

/* ── 9. OCR 纯函数：相似度 / 分类 / 分组 / 归一化 / 阈值 ── */
const bitsA = new Array(256).fill(0);   // 「实心环」图案，代表数字 A
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
  const edge = x < 3 || x > 12 || y < 3 || y > 12;
  const hole = x > 5 && x < 10 && y > 5 && y < 10;
  bitsA[y * 16 + x] = edge && !hole ? 1 : 0;
}
assert.equal(OCR.similarity(bitsA, bitsA), 1, '同位图相似度必须为 1');
const noisy = [...bitsA];
for (let i = 0; i < 8; i++) noisy[40 + i * 7] ^= 1;
assert.ok(OCR.similarity(bitsA, noisy) > 0.9, '轻微噪点相似度必须接近 1');
const bitsB = new Array(256).fill(0);   // 「左半实心」图案，代表数字 B
for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) bitsB[y * 16 + x] = 1;
const lib = [{ d: 3, bits: bitsB }, { d: 8, bits: bitsA }];
assert.equal(OCR.classify(noisy, lib, []).d, 8, '带噪样本必须归类到最优模板');
assert.equal(OCR.classify(bitsB, lib, [{ b: bitsB.join(''), d: 1 }]).d, 1, '历史样本可以覆盖内置模板');
assert.equal(OCR.normalizeRegion(16, () => true, 0, 0, 16, 16).reduce((a, b) => a + b, 0), 256, '全墨区域归一化后应全为 1');
const leftHalf = OCR.normalizeRegion(16, (x) => x < 8, 0, 0, 16, 16);
assert.equal(leftHalf.filter(Boolean).length, 128, '左半墨区域归一化后应恰好一半为 1');
const g1 = OCR.groupByX([{ pix: [0, 1, 2], minX: 0, maxX: 2, minY: 0, maxY: 1, size: 3 }]);
const g2 = OCR.groupByX([
  { pix: [0], minX: 0, maxX: 0, minY: 0, maxY: 0, size: 1 },
  { pix: [1], minX: 0, maxX: 1, minY: 1, maxY: 1, size: 1 },
  { pix: [9], minX: 9, maxX: 9, minY: 0, maxY: 0, size: 1 },
]);
assert.equal(g1.length, 1);
assert.equal(g2.length, 2, 'x 不重叠的连通域不能合并');
const getMask = (x, y) => (x === y && x < 3) || (x === 3 && y < 3); // 一条 5 像素折线
assert.equal(OCR.components(5, 5, getMask).length, 1, '连通像素必须归为一个连通域');
const hist = new Array(256).fill(0);
for (let i = 0; i < 100; i++) { hist[30]++; hist[220]++; } // 双峰直方图
const th = OCR.otsu(hist, 200);
assert.ok(th > 30 && th <= 220, 'Otsu 阈值必须落在两峰之间（暗峰右移一位）');

console.log('PASS: expand/collapse, loading, late response, cache, retry, paragraph preservation, API paths and bounded renewal');
