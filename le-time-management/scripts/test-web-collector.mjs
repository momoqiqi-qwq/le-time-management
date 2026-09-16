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
const ctx = vm.createContext({
  console,
  tide: {
    storage: {
      async get(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
      async set(key, value) { storage.set(key, value); },
    },
    notify: () => {},
    ui: { registerView: () => {} },
  },
});

vm.runInContext(
  src.replace(
    'tide.ui.registerView({',
    '  globalThis.__fx = { migrateNotes, ensureDefaults, DEFAULT_ITEMS, LEGACY_NOTE_PREFIX,\n'
    + '    get items() { return items; }, set items(v) { items = v; } };\n'
    + '  tide.ui.registerView({',
  ),
  ctx,
);
const fx = ctx.__fx;

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
// 1.1.2 → 编辑框字号自适应；1.2.0 → 拆出「自动获取网站图标」与「换图标」两个入口。
// 这条断言的作用是「改了行为就必须动版本号」，所以每加一批行为就往上抬一格，别删。
assert.equal(manifest.version, '1.2.0', '编辑框字号自适应之后必须升插件版本');
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
// fetchIcon 只回两个字段 —— 这是「不误伤标题」的契约，多回一个就可能被 Object.assign 覆盖
assert.match(src, /return \{ iconUrl, iconName: iconName \|\| "globe" \};/,
  'fetchIcon 必须只回 { iconUrl, iconName }，否则会覆盖用户手改的标题');
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

console.log('PASS: web-collector 默认条目文案（默认收集 → 默认）、老数据一次性迁移、卡片编辑框宽度约束与图标单独获取');
