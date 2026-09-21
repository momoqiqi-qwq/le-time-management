// 网页收集（web-collector）的默认条目文案与老数据迁移。
//
// 背景：默认条目的备注前缀在 v1.1.0 由「默认收集：」改为「默认：」。老用户的条目
// 早已存进 tide.storage，只改 DEFAULT_ITEMS 不会生效 —— 必须有一次性改写兜住老数据。
//
// 插件源码是 IIFE，这里用 vm 注入 fixture 把内部的 migrateNotes / DEFAULT_ITEMS 暴露出来，
// 直接跑真源码 —— 比读源码猜行为可靠。
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../public/plugins/web-collector/main.js', import.meta.url), 'utf8');

const storage = new Map();
const makeCtx = (protocol) => vm.createContext({
  console,
  // 插件用 location.protocol 判「页面来源是不是 https」（决定 http 的 iframe 会不会被
  // 当混合内容拦掉），所以 fixture 必须给一个真的 location。
  location: { protocol },
  tide: {
    storage: {
      async get(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
      async set(key, value) { storage.set(key, value); },
    },
    notify: () => {},
    ui: { registerView: () => {} },
  },
});

/* 跑两遍（页面来源 http: / https:）—— 桌面端是前者、APK 是后者。
   只做字符串断言的话，「条件少写一个」也能骗过去，所以这里直接跑真源码验真值表。 */
function loadPlugin(protocol) {
  const ctx = makeCtx(protocol);
  vm.runInContext(
    src.replace(
      'tide.ui.registerView({',
      '  globalThis.__fx = { migrateNotes, ensureDefaults, DEFAULT_ITEMS, LEGACY_NOTE_PREFIX, DEFAULT_OPEN_MODE, cleartextBlocked,\n'
      + '    get items() { return items; }, set items(v) { items = v; } };\n'
      + '  tide.ui.registerView({',
    ),
    ctx,
  );
  return ctx.__fx;
}
const fx = loadPlugin("http:");

/* ── 〇、cleartextBlocked 真值表（v1.2.4）──
   同一个混合内容根因的第三个受害者：APK 上页面来源是 https，http 的 iframe 被静默拦掉
   ⇒ 「应用内显示」一片空白。判据必须**同时**要求「页面是 https」且「地址是 http」：
   少写前者，桌面端也被误伤（桌面端页面来源是 http，http 地址本来嵌得出来）；
   少写后者，https 地址会被无辜降级。 */
{
  const onHttp = loadPlugin("http:");    // 桌面端：http://tauri.localhost
  const onHttps = loadPlugin("https:");  // Android：https://tauri.localhost
  assert.equal(onHttp.cleartextBlocked("http://daxue.qiyemulu.cn/"), false,
    '桌面端页面来源是 http，http 地址嵌得出来，不许降级');
  assert.equal(onHttp.cleartextBlocked("https://a.edu.cn/"), false, '桌面端 https 地址当然也行');
  assert.equal(onHttps.cleartextBlocked("http://daxue.qiyemulu.cn/"), true,
    'https 页面里的 http 地址 = 混合内容，必被 WebView 拦掉');
  assert.equal(onHttps.cleartextBlocked("https://a.edu.cn/"), false, 'https 页面里的 https 地址不受影响');
  assert.equal(onHttps.cleartextBlocked(""), false, '空地址不能判成被拦');
  assert.equal(onHttps.cleartextBlocked(undefined), false, 'undefined 不能抛也不能判成被拦');
  assert.equal(onHttps.cleartextBlocked("HTTP://A.EDU.CN/"), true, '大小写不敏感，别被大写绕过');
}

/* ── 一、默认条目的文案 ── */
assert.equal(fx.DEFAULT_ITEMS.length, 2, '默认条目应仍是两条');
for (const item of fx.DEFAULT_ITEMS) {
  assert.ok(item.note.startsWith('默认：'), `默认条目备注应以「默认：」开头，实际「${item.note}」`);
  assert.ok(!item.note.includes('默认收集'), `默认条目不该再出现「默认收集」，实际「${item.note}」`);
}
assert.equal(fx.LEGACY_NOTE_PREFIX, '默认收集：', '迁移用的旧前缀常量必须与已落库的老数据一致');

/* ── 二、老数据迁移 ── */
storage.clear();
fx.items = [
  { id: 'a', url: 'http://daxue.qiyemulu.cn/', note: '默认收集：大学名录' },
  { id: 'b', url: 'https://www.resource.edu.cn/', note: '默认收集：教育资源入口' },
  // 用户自己写的备注：即便碰巧以同样文字开头，也不该被改写
  { id: 'c', url: 'https://example.com/', note: '默认收集：我自己的备注' },
  { id: 'd', url: 'https://other.com/', note: '普通备注' },
  { id: 'e', url: 'http://daxue.qiyemulu.cn', note: '默认收集：大学名录' }, // 无尾斜杠也算同一条
];
await fx.migrateNotes();
const noteOf = (id) => fx.items.find((x) => x.id === id).note;
assert.equal(noteOf('a'), '默认：大学名录');
assert.equal(noteOf('b'), '默认：教育资源入口');
assert.equal(noteOf('e'), '默认：大学名录', 'URL 尾部斜杠差异不该影响识别');
assert.equal(noteOf('c'), '默认收集：我自己的备注', '非默认条目绝不能被改写');
assert.equal(noteOf('d'), '普通备注');
assert.ok(storage.has('items'), '迁移后必须落盘，否则下次进来又是旧文案');

/* ── 三、没有老数据时不写盘（避免每次进插件都无谓落库）── */
storage.clear();
await fx.migrateNotes();
assert.equal(storage.has('items'), false, '没有需要迁移的条目就不该写盘');

/* ── 四、ensureDefaults 补进来的默认条目用新文案 ── */
storage.clear();
fx.items = [];
await fx.ensureDefaults();
assert.equal(fx.items.length, 2);
for (const item of fx.items) assert.ok(item.note.startsWith('默认：'), item.note);

/* ── 五、已存在的默认条目不该被重复补（缺的那条仍要补上）── */
fx.items = [
  { id: 'x', url: 'http://daxue.qiyemulu.cn/', note: '默认：大学名录' },
  { id: 'y', url: 'https://www.resource.edu.cn', note: '默认：教育资源入口' }, // 无尾斜杠也要认作同一条
];
await fx.ensureDefaults();
assert.equal(fx.items.length, 2, '两条默认都已存在时不该再补');

fx.items = [{ id: 'x', url: 'http://daxue.qiyemulu.cn/', note: '默认：大学名录' }];
await fx.ensureDefaults();
assert.equal(fx.items.length, 2, '缺的那条默认仍要补上');
assert.ok(fx.items.some((x) => x.url === 'https://www.resource.edu.cn/'), '补的应该是缺的那条');

/* ── 六、render 必须真的接上迁移，否则老用户永远看不到新文案 ── */
assert.match(src, /await ensureDefaults\(\);\s*await migrateNotes\(\);/, 'render 里必须调用 migrateNotes');

/* ── 七、卡片编辑框不许把卡片撑爆（长标题/长备注溢出，用户实测截图）── */
const manifest = JSON.parse(fs.readFileSync(new URL('../public/plugins/web-collector/manifest.json', import.meta.url), 'utf8'));
// 1.1.2 → 编辑框字号自适应；1.2.0 → 拆出「自动获取网站图标」与「换图标」两个入口；
// 1.2.1 → manifest 补 notify 权限（此前 tide.notify 每次都抛权限错，收藏/失败提示全被吞掉）；
// 1.2.2 → 打开方式默认由「浏览器打开」改为「应用内显示」；
// 1.2.3 → 图标改走原生侧抓成 data URL（APK 上页面来源是 https，WebView 禁混合内容，
//          内置预置条目的 http 图标直连会被静默拦掉）；
// 1.2.4 → 「应用内显示」碰到 http 明文站点不再挂一个注定空白的 iframe，改成给原因 + 出口
//          （同一个混合内容根因的第三个受害者，见下面第七之二节）。
// 这条断言的作用是「改了行为就必须动版本号」，所以每加一批行为就往上抬一格，别删。
assert.equal(manifest.version, '1.3.0', '增加小程序原生收藏适配必须升版本号');
assert.equal(manifest.platforms.miniprogram, 'native', '原生收藏管理已实现，任意网站内嵌不在适配范围');

/* ── 七之二、明文 http 站点在「应用内显示」里不许挂空 iframe（v1.2.4）──
   APK 上页面来源是 https（WebViewAssetLoader 默认 scheme），http 的 iframe 会被当
   **混合内容**静默拦掉 ⇒ 面板一片空白，看起来就是「插件坏了」。桌面端页面来源是 http，
   同一个地址嵌得出来 —— 又是那个「只看桌面端永远复现不了」的签名。
   🔴 判据必须是「页面自己是不是 https」，不能写成「是不是 Android」：
   后者是平台代理，Tauri 一改 scheme 就失效；前者就是混合内容的定义本身。 */
assert.ok(src.includes('const PAGE_IS_HTTPS = location.protocol === "https:"'),
  '判据要用页面来源的协议，不是平台名');
assert.ok(src.includes('const cleartextBlocked = (url) => PAGE_IS_HTTPS && /^http:\\/\\//i.test(String(url || ""));'),
  'cleartextBlocked 必须**同时**要求「页面是 https」且「地址是 http」—— 少一个条件就会误伤');
// 两个分支都要在：降级面板（嵌不出来）与 iframe（嵌得出来）
assert.ok(src.includes('const body = cleartextBlocked(item.url)'),
  'openInside 必须按 cleartextBlocked 分流，不能无条件挂 iframe');
assert.ok(src.includes('? `<div class="wc-web-blocked">'),
  '嵌不出来的地址要渲染降级面板，把原因和出口摆出来');
assert.ok(src.includes(': `<iframe src="${esc(item.url)}"'),
  '嵌得出来的地址仍要照常挂 iframe —— 桌面端就是这么工作的，别一刀切');
// 降级面板里的「浏览器打开」也要接上：原来只 querySelector 了头部那一个
assert.ok(src.includes('panel.querySelectorAll("[data-web-external]").forEach'),
  '两个「浏览器打开」按钮都要接线（querySelector 只会接上头部那个，降级面板里的点了没反应）');
assert.ok(!src.includes('panel.querySelector("[data-web-external]")'),
  '旧的单选写法必须消失 —— 留着一个 querySelector 就等于降级面板里的按钮是死的');
assert.ok(src.includes('.wc-web-blocked{flex:1;display:grid;place-content:center'),
  '降级面板要有居中样式，否则提示文字挤在角落');
assert.match(src, /\.wc-edit\{[^}]*minmax\(0,1fr\)[^}]*\}/, '.wc-edit 两列轨道必须 minmax(0,1fr) —— 1fr 的下限是 min-content，会被长值撑破卡片');
assert.match(src, /\.wc-edit input\{[^}]*min-width:0[^}]*\}/, '.wc-edit input 必须 min-width:0，否则输入框固有宽度把卡片顶破');
assert.match(src, /\.wc-edit input\{[^}]*width:100%[^}]*\}/, '.wc-edit input 必须 width:100% 才会老老实实缩进轨道里');

/* ── 八、超长文字自动缩字号（用户反馈：字超出框了要自动缩小，但不能小到看不清）── */
assert.match(src, /function fitInputFonts\(\)/, '必须提供 fitInputFonts 字号自适应');
assert.match(src, /const MAX = 13, MIN = 11;/, '字号上限 13px、下限 11px —— 下限太小学起来难受');
assert.match(src, /input\.scrollWidth > input\.clientWidth/, '缩字判定必须基于真实溢出（scrollWidth vs clientWidth）');
assert.match(src, /fitInputFonts\(\);\s*\n?\s*\}/, 'paint() 末尾必须调用 fitInputFonts');

/* ── 九、图标要能单独获取/更换，不能和「识别标题」绑死 ──
   用户需求原文：「自动获取网站图标 添加1个变成插件按钮」。
   核心是拆开：抓图标只回写 iconUrl / iconName，不许碰用户改过的标题。 */
assert.match(src, /async function fetchIcon\(/, '必须单独提供 fetchIcon(url)，只取图标');
assert.match(src, /async function probeIcon\(/, '顶栏「自动获取网站图标」要有对应处理函数');
assert.match(src, /async function refreshIcon\(id\)/, '卡片「换图标」要有对应处理函数');
// fetchIcon 的回写字段只许「图标三件套」—— 这是「不误伤标题」的契约：
// refreshIcon 里是 Object.assign(item, got)，多回一个 title/note 就会覆盖用户手改的内容。
// iconData 是 v0.73.0 加的（APK 上 http favicon 直连被 WebView 静默拦掉，改原生侧抓成 data URL），
// 它只落在图标上，不碰标题。
assert.match(src, /return \{ iconUrl, iconName: iconName \|\| "globe", iconData: await fetchIconData\(iconUrl\) \};/,
  'fetchIcon 必须回 { iconUrl, iconName, iconData } 三件套');
assert.doesNotMatch(src, /return \{ iconUrl[^}]*\b(title|note|host)\b/,
  'fetchIcon 不许回 title/note/host —— Object.assign 会覆盖用户手改的内容');
// 顶栏与卡片按钮的 data 标记必须不同，否则事件委托里顶栏分支会抢走卡片的点击
assert.match(src, /data-probe-icon/, '顶栏按钮用 data-probe-icon');
assert.match(src, /data-fetch-icon/, '卡片按钮用 data-fetch-icon');
assert.match(src, /closest\("\[data-probe-icon\]"\)[\s\S]*?closest\("\[data-id\]"\)/,
  '顶栏 data-probe-icon 分支必须在 closest("[data-id]") 之前 —— '
  + '两者若同名，卡片「换图标」永远拿不到条目 id');
assert.match(src, /data-fetch-icon[^>]*title=/, '卡片「换图标」要有 title 说明它和「刷新名称/图标」的区别');
// 预览条里的图标地址：长 URL 必须保持一行 + 横向滚动
// （实测用 word-break:break-all 会在 390px 窄屏把 .../favicon.ico 折成 4 行竖排，几乎读不出来）
assert.match(src, /\.wc-preview-text code\{[^}]*white-space:nowrap/, '图标地址要 nowrap，不能逐字符折行');
assert.doesNotMatch(src, /\.wc-preview-text code\{[^}]*word-break:break-all/,
  '图标地址不能用 word-break:break-all —— 窄屏会把 URL 折成竖排');
assert.match(src, /@media\(max-width:640px\)\{[\s\S]*?\.wc-preview-text\{flex-basis:100%\}/,
  '窄屏下图标地址要独占一行（否则按钮挤占宽度，URL 只剩十几个字符可见）');

/* ── 十、打开方式默认「应用内显示」──
   用户要求：点卡片「打开」默认在本应用的面板里加载，不再跳出到系统浏览器。
   三处默认值（模块初始化 / storage 读取 fallback / 脏值兜底）必须全部指向同一个常量 ——
   漏改任何一处，就会在「storage 里没有 openMode」或「存了脏值」这两条路径上退回浏览器打开。 */
assert.equal(fx.DEFAULT_OPEN_MODE, 'inside', '默认打开方式必须是应用内显示');
assert.match(src, /openMode = DEFAULT_OPEN_MODE, iconPreview/,
  '模块初始化必须用 DEFAULT_OPEN_MODE，不能写死 external');
assert.match(src, /openMode = await tide\.storage\.get\("openMode", DEFAULT_OPEN_MODE\)/,
  'storage 读取的 fallback 必须是 DEFAULT_OPEN_MODE，且读到的值要原样赋给 openMode（尊重用户已存的选择）');
assert.match(src, /!\["external", "inside"\]\.includes\(openMode\)\) openMode = DEFAULT_OPEN_MODE/,
  '脏值兜底也要落回 DEFAULT_OPEN_MODE');
assert.match(src, /if \(openMode === "inside"\) openInside\(item\);/, 'openItem 仍以 openMode 为准');
// 下拉框的选中态必须跟 openMode 走 —— 默认 inside ⇒ 打开插件第一眼看到的就是「应用内显示」
assert.match(src, /<option value="inside"\$\{openMode === "inside" \? " selected" : ""\}>应用内显示<\/option>/,
  '「应用内显示」选项必须在 openMode === "inside" 时选中');
assert.match(src, /<option value="external"\$\{openMode === "external" \? " selected" : ""\}>浏览器打开<\/option>/,
  '「浏览器打开」选项必须在 openMode === "external" 时选中（两条一起钉住方向，反转会被抓到）');
// 反面：任何一处把 external 写死成默认/兜底都算漏改
assert.doesNotMatch(src, /"openMode",\s*"external"/, '不该再有把 external 当 fallback 的写法');
assert.doesNotMatch(src, /openMode = "external"/, '不该再有把 external 写死为默认值的写法');

console.log('PASS: web-collector 默认条目文案（默认收集 → 默认）、老数据一次性迁移、卡片编辑框宽度约束与图标单独获取、打开方式默认应用内显示');
