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
assert.equal(manifest.version, '1.1.2', '编辑框字号自适应之后必须升插件版本');
assert.match(src, /\.wc-edit\{[^}]*minmax\(0,1fr\)[^}]*\}/, '.wc-edit 两列轨道必须 minmax(0,1fr) —— 1fr 的下限是 min-content，会被长值撑破卡片');
assert.match(src, /\.wc-edit input\{[^}]*min-width:0[^}]*\}/, '.wc-edit input 必须 min-width:0，否则输入框固有宽度把卡片顶破');
assert.match(src, /\.wc-edit input\{[^}]*width:100%[^}]*\}/, '.wc-edit input 必须 width:100% 才会老老实实缩进轨道里');

/* ── 八、超长文字自动缩字号（用户反馈：字超出框了要自动缩小，但不能小到看不清）── */
assert.match(src, /function fitInputFonts\(\)/, '必须提供 fitInputFonts 字号自适应');
assert.match(src, /const MAX = 13, MIN = 11;/, '字号上限 13px、下限 11px —— 下限太小学起来难受');
assert.match(src, /input\.scrollWidth > input\.clientWidth/, '缩字判定必须基于真实溢出（scrollWidth vs clientWidth）');
assert.match(src, /fitInputFonts\(\);\s*\n?\s*\}/, 'paint() 末尾必须调用 fitInputFonts');

console.log('PASS: web-collector 默认条目文案（默认收集 → 默认）、老数据一次性迁移与卡片编辑框宽度约束');
