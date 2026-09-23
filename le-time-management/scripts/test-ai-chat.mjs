/* AI 对话插件守卫（public/plugins/ai-chat）。
 *
 * 这个插件的风险不在「界面画得对不对」，而在三件事：
 *   ① 它会把用户本机的任务与时间块**发给外部模型** —— 所以「带本机数据」必须是一个
 *      看得见、可关掉、关掉后真的不发数据的开关；
 *   ② 它会把模型返回的东西**写进本机数据** —— 所以每条建议必须过白名单校验，
 *      且写库前由用户逐条勾选，写完还能撤销；
 *   ③ 模型会编造 —— 所以快照里必须带真实 id，校验必须拿快照里的 id 去比对，
 *      对不上的那条要当场标成不可写，而不是等用户点了才发现写坏。
 * 静态接线 + 真跑一遍解析/落库/撤销，缺一条都会红。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const mainSrc = read("../public/plugins/ai-chat/main.js");
const manifest = JSON.parse(read("../public/plugins/ai-chat/manifest.json"));
const host = read("../src/pluginHost.js");
const api = read("../src/api.js");
const catalog = read("../src/pluginCatalog.js");
const miniCatalog = read("../../miniprogram/core/pluginCatalog.js");
const doc = read("../public/plugins/plugin-guide/plugin-development.md");

/* ───────── 一、宿主侧：tide.ai 是新开的口子，权限闸门必须一起到位 ───────── */

assert.match(host, /ai: "AI 对话（/, "PLUGIN_PERMISSION_LABELS 必须有 ai 条目，否则报错文案只剩英文 ai");
assert.match(host, /ai: \{[\s\S]{0,900}requirePermission\(man, pid, "ai"\)[\s\S]{0,400}requirePermission\(man, pid, "ai"\)/,
  "tide.ai 的 chat 与 status 两个方法都必须过权限闸门，漏一个就是未声明也能调");
assert.match(host, /return api\.aiChat\(messages, opts\.temperature\)/, "chat 必须复用 api.aiChat（凭据只在 Rust 侧）");
assert.match(host, /return api\.aiVaultStatus\(\)/, "status 必须复用 api.aiVaultStatus，插件才有「配没配」可判");
assert.match(api, /async aiChat\(messages, temperature = 0\.2\)/, "api.aiChat 的默认温度不能悄悄改掉");
assert.match(host, /非流式/, "宿主注释必须写明上游非流式，否则下一个写插件的人会以为能拿增量");

/* 跨插件消息：宿主在 emit 处抄收，读口单独一道权限 */
assert.match(host, /messages: "读取其他插件推来的消息"/, "PLUGIN_PERMISSION_LABELS 必须有 messages 条目");
assert.match(host, /messages: \{[\s\S]{0,200}requirePermission\(man, pid, "messages"\)/,
  "tide.messages.list 必须过权限闸门，未声明就读不到别的插件推了什么");
assert.match(host, /if \(name === "notice:new"\) collectNotice\(data, pid\)/,
  "抄收必须挂在 events.emit 上：这样与谁在监听、谁先加载都无关");
assert.match(host, /只存内存/, "宿主注释要写清这份队列只在运行期，避免有人以为它能跨重启");
assert.match(doc, /tide\.messages\.list\(/, "插件开发文档必须写清怎么读其他插件的消息");
assert.match(doc, /source\|time\|title/, "文档要写明去重键，插件侧才知道重复推送会合并");

/* ───────── 二、清单与三端产物 ───────── */

assert.equal(manifest.id, "ai-chat", "manifest.id 必须与目录名一致");
for (const need of ["ai", "ui", "storage", "tasks", "blocks", "messages"]) {
  assert.ok(manifest.permissions.includes(need), `manifest.permissions 缺 ${need}`);
}
assert.equal(manifest.platforms.windows, "full");
assert.equal(manifest.platforms.android, "full");
assert.equal(manifest.platforms.miniprogram, "unavailable",
  "小程序没有 AI 配置面与 tide.ai，声明成 unavailable 而不是硬凑一个假页");
assert.ok(catalog.includes('"ai-chat"') || catalog.includes("'ai-chat'"), "桌面 pluginCatalog.js 未收录（跑 node tools/sync-plugins.js）");
assert.ok(miniCatalog.includes('"ai-chat"') || miniCatalog.includes("'ai-chat'"), "小程序 pluginCatalog.js 未收录");

const orders = fs.readdirSync(new URL("../public/plugins/", import.meta.url))
  .filter((d) => fs.existsSync(new URL(`../public/plugins/${d}/manifest.json`, import.meta.url)))
  .map((d) => JSON.parse(read(`../public/plugins/${d}/manifest.json`)).order)
  .filter((o) => o != null);
assert.equal(new Set(orders).size, orders.length, "内置插件的 order 必须互不相同，否则侧栏顺序随文件系统变化");

/* 图标三端同源（单一事实源在小程序目录，桌面是生成副本） */
const miniIcon = new URL("../../miniprogram/images/plugins/ai-chat.png", import.meta.url);
const deskIcon = new URL("../public/icons/plugins/ai-chat.png", import.meta.url);
assert.ok(fs.existsSync(miniIcon), "缺少插件图标事实源 miniprogram/images/plugins/ai-chat.png（tools/gen-plugin-icons.py 生成）");
assert.ok(fs.existsSync(deskIcon), "缺少桌面插件图标 public/icons/plugins/ai-chat.png");
assert.deepEqual(Array.from(fs.readFileSync(deskIcon).subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "桌面图标不是合法 PNG");
assert.ok(fs.readFileSync(deskIcon).equals(fs.readFileSync(miniIcon)), "桌面与小程序图标必须字节一致");

/* ───────── 三、对外文档与页面纪律 ───────── */

assert.match(doc, /tide\.ai\.chat\(/, "插件开发文档必须写清 tide.ai.chat 怎么用");
assert.match(doc, /24 条消息/, "文档必须写明一次 24 条消息的上限（Rust 侧硬限制）");
assert.match(doc, /60000 字符/, "文档必须写明 60000 字符总量上限");
assert.match(doc, /非流式/, "文档必须写明非流式，插件要自己画等待态");

// 吸底输入框靠 .plugview 的满高 flex 列实现：不建浮层、不往宿主容器外挂节点、不按视口尺寸定位。
// 这三条正是 test-plugin-safe-area 的判定条件（它按字面量扫，注释里出现同样会中招），
// 所以在这里把它们钉成断言，而不是等那个测试报一句看不懂的"有浮层却没提宿主变量"。
for (const banned of ["position:fixed", "document.body.append", "innerWidth", "innerHeight"]) {
  assert.ok(!mainSrc.includes(banned), `插件源码里不该出现 ${banned}（安全区由宿主 .view 负责）`);
}
assert.match(mainSrc, /!e\.isComposing/, "回车发送必须避开中文输入法的选词回车");
assert.match(mainSrc, /带本机数据/, "「带本机数据」开关要在界面上看得见 —— 这是数据外发的唯一闸口");

/* ───────── 四、真跑：解析、校验、落库、撤销 ───────── */

const TODAY = "2026-09-23";
const addDays = (ds, n) => {
  const [y, m, d] = ds.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const storage = new Map();
const toasts = [];
const calls = { created: [], updated: [], removedTasks: [], removedBlocks: [], smart: [], chat: [] };
let tasks = [
  { id: "t_1", title: "交报告", done: false, due: "2026-09-20", dueTime: "18:00", quad: 1, estMin: 30, note: "" },
  { id: "t_2", title: "取快递", done: false, due: TODAY, dueTime: "23:59", quad: 4, estMin: 10, note: "" },
  { id: "t_3", title: "写周报", done: true, due: null, dueTime: "23:59", quad: 2, estMin: 20, note: "" },
];

const sandbox = {
  console,
  Date,
  JSON,
  Math,
  Number,
  Object,
  Array,
  String,
  RegExp,
  Set,
  encodeURIComponent,
  setTimeout,
  document: {
    getElementById: () => null,
    head: { append() {} },
    createElement: () => ({
      className: "", innerHTML: "", textContent: "", style: {}, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, append() {}, addEventListener() {},
      querySelector: () => null, querySelectorAll: () => [],
    }),
  },
  window: { dispatchEvent() {} },
  CustomEvent: class { constructor(name, opts) { this.name = name; Object.assign(this, opts); } },
  tide: {
    storage: {
      async get(key, fallback = null) { return storage.has(key) ? storage.get(key) : fallback; },
      async set(key, value) { storage.set(key, JSON.parse(JSON.stringify(value))); },
    },
    notify: (msg, opts) => toasts.push({ msg, opts }),
    ui: { registerView() {} },
    util: { today: () => TODAY, addDays, guessQuad: () => 2, guessCategory: () => "work" },
    tasks: {
      list: () => JSON.parse(JSON.stringify(tasks)),
      create: (patch) => { const t = { id: `t_${calls.created.length + 9}`, ...patch }; calls.created.push(t); return t; },
      update: (id, patch) => { const t = tasks.find((x) => x.id === id); Object.assign(t, patch); return t; },
      remove: (id) => { calls.removedTasks.push(id); },
    },
    blocks: {
      list: (date) => (date === TODAY
        ? [{ id: "b_1", date, start: "10:00", durMin: 90, title: "高数", cat: "study", taskId: null }]
        : []),
      createSmart: (patch) => {
        calls.smart.push(patch);
        const moved = patch.start === "10:00";
        return { block: { id: `b_${calls.smart.length + 5}`, ...patch, start: moved ? "11:30" : patch.start }, moved };
      },
      remove: (id) => { calls.removedBlocks.push(id); },
    },
    ai: {
      status: async () => ({ configured: true, model: "gpt-4o-mini", baseUrl: "", keyMasked: "" }),
      chat: async (messages, opts) => { calls.chat.push({ messages, opts }); return sandbox.__reply || "好的"; },
    },
    messages: { list: (limit = 30) => (sandbox.__feed || []).slice(-limit).reverse() },
  },
};
const ctx = vm.createContext(sandbox);
vm.runInContext(
  mainSrc.replace(
    "  tide.ui.registerView({",
    "  globalThis.__fx = {\n"
    + "    parseReply, normalizeSuggestion, snapshot, systemPrompt, buildMessages, describe,\n"
    + "    applySuggestions, undoRecord, taskPatch, md, ask, CHIPS, SEND_TURNS, KEEP, ACTIONS,\n"
    + "    get thread() { return thread; }, set thread(v) { thread = v; },\n"
    + "    get notices() { return notices; }, set notices(v) { notices = v; },\n"
    + "    syncNotices, noticeBlock,\n"
    + "    get withContext() { return withContext; }, set withContext(v) { withContext = v; },\n"
    + "  };\n"
    + "  tide.ui.registerView({",
  ),
  ctx,
);
const fx = ctx.__fx;
assert.ok(fx && typeof fx.parseReply === "function", "插件源码没暴露内部函数 —— 注入点被改动了？");

/* 1. 回复解析：建议块只取最后一个能解析的，正文里不留代码块残渣 */
{
  const r = fx.parseReply('先说结论。\n```json\n{"suggestions":[{"action":"create-task","title":"A"}]}\n```');
  assert.equal(r.body, "先说结论。", "正文必须切掉建议块");
  assert.equal(r.suggestions.length, 1);
  assert.equal(fx.parseReply("只有散文，没有代码块").suggestions.length, 0, "没给建议块要正常返回空");
  assert.equal(fx.parseReply('{"suggestions": 不是 JSON}').suggestions.length, 0, "坏 JSON 不能抛异常");
  const two = fx.parseReply('a\n```json\n{"suggestions":[{"action":"nope"}]}\n```\nb\n```json\n{"suggestions":[{"action":"done-task","id":"t_2"}]}\n```');
  assert.equal(two.suggestions.length, 1, "多个代码块只认最后一个");
  assert.equal(two.suggestions[0].action, "done-task");
  assert.equal(two.body, 'a\n```json\n{"suggestions":[{"action":"nope"}]}\n```\nb',
    "只切掉能解析的那块及其之后的内容，前面解析不了的原样留着给用户看");
}

/* 2. 白名单校验：模型编出来的东西一律拦下 */
{
  assert.equal(fx.normalizeSuggestion({ action: "delete-task", title: "x" }), null, "action 不在白名单里直接丢");
  assert.equal(fx.normalizeSuggestion("不是对象"), null);
  assert.match(fx.normalizeSuggestion({ action: "create-task" }).reason, /缺任务标题/);
  assert.match(fx.normalizeSuggestion({ action: "create-block", title: "只有标题" }).reason, /缺 date\/start\/title/,
    "时间块缺了 date/start 就落不了地，要在勾选阶段就标红");
  assert.match(fx.normalizeSuggestion({ action: "done-task" }).reason, /缺任务 id/);
  const bad = fx.normalizeSuggestion({ action: "update-task", id: "t_999", title: "x" });
  assert.match(bad.reason, /不在本机任务里/, "编造的 id 必须当场标出来，不能等写库");
  assert.equal(fx.normalizeSuggestion({ action: "update-task", id: "t_1", title: "x" }).reason, undefined, "真实 id 不该被拦");
  assert.ok(!("title" in fx.normalizeSuggestion({ action: "update-task", id: "t_1", due: "2026-09-30" })),
    "模型没给 title 时不能挂一个空串下去，否则写库会把任务标题清空");
  const s = fx.normalizeSuggestion({ action: "create-task", title: " 跑 5 公里 ", due: "2026/09/25", dueTime: "99:99", quad: 9, estMin: 99999, note: "x".repeat(500) });
  assert.equal(s.due, undefined, "日期格式不对必须丢字段，而不是把脏值传给 store");
  assert.equal(s.dueTime, undefined);
  assert.equal(s.quad, undefined, "象限越界要丢");
  assert.equal(s.estMin, undefined, "时长越界要丢");
  assert.ok(s.note.length <= 200, "备注要截断");
  assert.equal(s.title, "跑 5 公里", "标题要 trim");
  assert.match(fx.describe({ action: "create-block", title: "背书", date: "2026-09-24", start: "08:00", durMin: 45 }), /2026-09-24 08:00 起 45 分钟/);
}

/* 3. 快照：带真实 id、分段正确、条数与总长都封顶 */
{
  const snap = fx.snapshot();
  assert.match(snap, /id=t_1 · 交报告 · 截止 2026-09-20 18:00/, "快照必须带 id 与关键字段，否则模型没法说「改哪条」");
  assert.match(snap, /已逾期未完成 共 1 条/, "2026-09-20 的报告要落在逾期段");
  assert.match(snap, /今天到期 共 1 条/);
  assert.match(snap, /【今天 2026-09-23/, "时间块要按天给，模型才知道哪些格子被占");
  assert.match(snap, /10:00 起 90 分钟 高数/);
  assert.match(snap, /已完成 1 条/, "已完成也要给数量，模型才能做「本周做完了什么」的盘点");
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `m_${i}`, title: `任务${i}`, done: false, due: "2026-09-01", quad: 1 }));
  const saved = tasks;
  tasks = many;
  const big = fx.snapshot();
  assert.match(big, /其余 15 条略/, "单段必须封顶，否则一次请求就撞上 60000 字符上限");
  assert.ok(big.length < 9200, `快照总长必须封顶（当前 ${big.length}）`);
  tasks = saved;
  assert.match(fx.systemPrompt(), /绝不编造/, "提示词要明令不许编");
  fx.withContext = false;
  assert.match(fx.systemPrompt(), /已关闭「带本机数据」/, "关掉开关后提示词里不能出现任何本机数据");
  assert.ok(!fx.systemPrompt().includes("交报告"), "关了就真的一个字都不发");
  fx.withContext = true;
}

/* 4. 历史裁剪：system 永远在第一位，条数不超上限 */
{
  fx.thread = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `第${i}条`, at: Date.now() }));
  fx.thread.push({ role: "error", text: "这条不该发出去", at: Date.now() });
  const msgs = fx.buildMessages();
  assert.equal(msgs[0].role, "system");
  assert.equal(msgs.length, fx.SEND_TURNS + 1, `送给模型的历史要按轮数截断（当前 ${msgs.length}）`);
  assert.ok(!JSON.stringify(msgs).includes("不该发出去"), "错误行不参与上下文");
  assert.equal(msgs[msgs.length - 1].content, "第29条", "截断要保留最近的");
}

/* 5. 落库与撤销 */
{
  fx.thread = [];
  const created = [];
  const list = [
    fx.normalizeSuggestion({ action: "create-task", title: "约导师面谈", due: "2026-09-25", dueTime: "14:00", quad: 2, estMin: 30 }),
    fx.normalizeSuggestion({ action: "create-block", title: "背单词", date: TODAY, start: "10:00", durMin: 30, cat: "study" }),
    fx.normalizeSuggestion({ action: "update-task", id: "t_1", due: "2026-09-26" }),
    fx.normalizeSuggestion({ action: "done-task", id: "t_2" }),
  ];
  const { record, errors } = fx.applySuggestions(list);
  // vm 里造出来的数组 / 对象与宿主不是同一个原型，一律逐字段比，别用 deepEqual。
  assert.equal(errors.length, 0, "四条合法建议都应写入成功");
  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].title, "约导师面谈");
  assert.equal(calls.created[0].dueTime, "14:00");
  assert.ok(!("dueTime" in fx.taskPatch({ title: "x" })), "模型没给 dueTime 时不能传空串盖掉 store 默认值");
  assert.equal(record.blocks.length, 1);
  assert.equal(list[1].movedTo, "11:30", "createSmart 挪了位置必须告诉用户，不能悄悄改时间");
  assert.equal(tasks.find((t) => t.id === "t_1").due, "2026-09-26");
  assert.equal(tasks.find((t) => t.id === "t_2").done, true);
  assert.equal(record.updates.length, 2, "改期与标记完成都要留还原记录");
  const u1 = record.updates.find((u) => u.id === "t_1");
  assert.equal(Object.keys(u1.before).length, 1, "撤销记录只存被改掉的字段，别把整条任务快照塞进去");
  assert.equal(u1.before.due, "2026-09-20");
  assert.equal(record.updates.find((u) => u.id === "t_2").before.done, false, "标记完成的撤销是回到未完成");
  assert.ok(list.every((s) => s.applied), "写成功的建议要标 applied，界面据此禁用勾选框");

  fx.undoRecord(record);
  assert.deepEqual(calls.removedTasks, [record.tasks[0]], "撤销要删掉新建的任务");
  assert.deepEqual(calls.removedBlocks, [record.blocks[0]]);
  assert.equal(tasks.find((t) => t.id === "t_1").due, "2026-09-20", "撤销要把改动还原");
  assert.equal(tasks.find((t) => t.id === "t_2").done, false, "标记完成也能撤销回去");
  assert.ok(toasts.some((t) => /已撤销/.test(t.msg)), "撤销完要给一条回执");
}

/* 6. 写坏一条不能连累其它条，且坏的那条要就地标注原因 */
{
  const savedCreate = sandbox.tide.tasks.create;
  sandbox.tide.tasks.create = (patch) => {
    if (patch.title === "坏任务") throw new Error("标题重复");
    return savedCreate(patch);
  };
  const list = [
    fx.normalizeSuggestion({ action: "create-task", title: "坏任务" }),
    fx.normalizeSuggestion({ action: "create-task", title: "好任务" }),
  ];
  const { record, errors } = fx.applySuggestions(list);
  sandbox.tide.tasks.create = savedCreate;
  assert.equal(errors.length, 1, "失败要报出来");
  assert.match(errors[0], /标题重复/);
  assert.equal(record.tasks.length, 1, "后面的合法建议照常写入");
  assert.equal(list[0].reason, "标题重复", "失败的那条要标在界面上，不能悄悄吞掉");
  assert.equal(list[1].reason, undefined, "成功的那条不该带原因");
  assert.equal(list[1].applied, true);
}

/* 7. 正文渲染：先转义再排版，模型吐出 HTML 也不会被执行 */
{
  const html = fx.md('**注意** <img src=x onerror="alert(1)"> `code`\n- 第一条\n- 第二条');
  assert.ok(!/<img/.test(html), "图片标签必须被转义");
  assert.match(html, /&lt;img/);
  assert.match(html, /<strong>注意<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul>\s*<li>第一条<\/li>\s*<li>第二条<\/li>\s*<\/ul>/s, "连续短行要收成列表");
  assert.equal((html.match(/<ul>/g) || []).length, (html.match(/<\/ul>/g) || []).length, "列表标签必须配平");
}

/* 8. 端到端一轮问答：等待态复位、建议入库、历史落盘 */
{
  fx.thread = [];
  storage.clear();
  calls.chat.length = 0;
  sandbox.__reply = '今天有三件事要动。\n```json\n{"suggestions":[{"action":"create-task","title":"给导师发消息","due":"2026-09-23","dueTime":"20:00","quad":1}]}\n```';
  await fx.ask("帮我安排一下今天");
  assert.equal(calls.chat.length, 1, "只发一次请求");
  assert.equal(calls.chat[0].opts.temperature, 0.3, "温度由插件定，不吃默认值");
  assert.equal(calls.chat[0].messages[0].role, "system");
  assert.equal(calls.chat[0].messages[1].content, "帮我安排一下今天");
  assert.match(JSON.stringify(calls.chat[0].messages), /交报告/, "开了带本机数据就要把快照带上");
  assert.equal(fx.thread.length, 2);
  assert.equal(fx.thread[1].role, "assistant");
  assert.equal(fx.thread[1].suggestions.length, 1);
  assert.equal(fx.thread[1].text, "今天有三件事要动。", "正文里不该残留建议块");
  assert.equal(storage.get("thread")[1].suggestions[0].title, "给导师发消息", "建议要随历史落盘");

  sandbox.__reply = "坏掉的回复";
  await fx.ask("再来一轮");
  assert.equal(fx.thread.length, 4);

  // 上游报错 → 落成一条错误消息，并把错误原文留在界面上可重试
  const savedChat = sandbox.tide.ai.chat;
  sandbox.tide.ai.chat = async () => { throw new Error("AI 请求失败：401"); };
  await fx.ask("会失败的一问");
  sandbox.tide.ai.chat = savedChat;
  const last = fx.thread[fx.thread.length - 1];
  assert.equal(last.role, "error");
  assert.match(last.text, /401/, "错误原文要给用户看，不能只说「失败了」");
  assert.equal(fx.thread.filter((m) => m.role === "user").length, 3, "失败的那次提问要留在历史里，重试才有东西可问");
  assert.ok(fx.thread.length <= fx.KEEP, `历史必须裁到 ${fx.KEEP} 条以内`);
}

/* 9. 宿主抄收：真的把 pluginHost 拉起来跑，不靠正则猜 */
{
  globalThis.window = globalThis.window || {};
  globalThis.document = globalThis.document || {
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, append() {}, addEventListener() {} }),
    getElementById: () => null,
    head: { append() {} },
    addEventListener() {},
  };
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };
  const PH = await import("../src/pluginHost.js");

  PH.collectNotice({
    source: "cppu-notify", sourceName: "警大门户", total: 2,
    items: [{ title: "关于补考的通知", time: "09-22 10:00", sender: "教务处" }, { title: "   ", time: "", sender: "" }],
  });
  PH.collectNotice({ source: "gx-news", sourceName: "竞赛消息雷达", items: [{ title: "省赛报名开始", time: "09-23 09:00", sender: "GX" }] });
  PH.collectNotice({ source: "cppu-notify", sourceName: "警大门户", items: [{ title: "关于补考的通知", time: "09-22 10:00" }] });
  let feed = PH.listNotices(10);
  assert.equal(feed.length, 2, "空标题要丢，同一件事重复推送要按 source|time|title 合并");
  assert.equal(feed[0].title, "省赛报名开始", "listNotices 新的在前");
  assert.equal(feed[1].sourceName, "警大门户", "来源名要带上，AI 才说得出是哪推的");

  for (let i = 0; i < 150; i += 1) PH.collectNotice({ source: "rss-reader", items: [{ title: `条${i}` }] });
  feed = PH.listNotices(500);
  assert.equal(feed.length, 120, "队列必须封顶，跑一天不能把内存吃干净");
  assert.equal(feed[0].title, "条149");
  assert.equal(PH.listNotices(1).length, 1, "limit 要生效");

  PH.collectNotice(null);
  PH.collectNotice({ items: "不是数组" });
  PH.collectNotice({ source: "x", items: [null, { title: "活下来了" }] });
  assert.equal(PH.listNotices(1)[0].title, "活下来了", "载荷畸形只能丢条目，不能把广播方一起打断");
}

/* 10. 插件侧合并：跨重启留存、重复同步不翻倍、快照与提示词都带上消息 */
{
  fx.notices = [];
  sandbox.__feed = [
    { source: "cppu-notify", sourceName: "警大门户", title: "补考通知", time: "09-22 10:00", sender: "教务处", at: 1 },
    { source: "gx-news", sourceName: "竞赛消息雷达", title: "省赛报名", time: "09-23 09:00", sender: "GX", at: 2 },
  ];
  await fx.syncNotices();
  assert.equal(fx.notices.length, 2);
  assert.equal(fx.notices[0].title, "省赛报名", "合并后要维持新的在前");
  assert.equal(storage.get("notices").length, 2, "要落进私有存储，重启后 AI 还记得");
  await fx.syncNotices();
  assert.equal(fx.notices.length, 2, "重复同步不能翻倍");

  sandbox.__feed = [{ source: "rss-reader", sourceName: "RSS 订阅", title: "一篇新文章", time: "09-23 12:00", at: 3 }];
  await fx.syncNotices();
  assert.equal(fx.notices.length, 3);
  assert.equal(fx.notices[0].title, "一篇新文章");

  const snap = fx.snapshot();
  assert.match(snap, /其他插件推来的消息/, "快照必须带上消息段，否则「最近有什么通知」无从回答");
  assert.match(snap, /【警大门户 共 1 条】/);
  assert.match(snap, /补考通知 · 09-22 10:00 · 教务处/);
  assert.match(snap, /【RSS 订阅 共 1 条】/);
  assert.match(fx.systemPrompt(), /不代表用户已经处理过/, "提示词要交代「收到」不等于「办过」");

  fx.notices = [];
  assert.equal(fx.noticeBlock(), "", "一条都没收到时整段不出现，不给模型留一句空话");
}

assert.equal(fx.CHIPS.length, 5, "快捷提问至少给五条，空界面不该让用户自己想问题");
assert.ok(fx.CHIPS.some((c) => /通知/.test(c.label)), "消息收集是新能力，界面上要给一条现成的问法");
assert.ok(fx.CHIPS.every((c) => c.label && c.ask), "每条快捷提问都要有短标签与完整问法");
assert.ok(Object.keys(fx.ACTIONS).every((a) => /create|update|done/.test(a)), "写库动作白名单只能增改，不许出现删除类动作");

console.log("PASS: AI 对话插件 —— tide.ai 权限闸门 / 三端产物与图标同源 / 快照封顶与不外发 / 建议白名单 / 勾选落库与撤销 / 回复解析与转义 / 一轮问答端到端");
