// 全局状态 + 持久化 + 派生数据
// 移植自桌面端 src/store.js：任务/时间块的数据结构与字段完全一致，
// 差异只在持久化层 —— 桌面端写 JSON 文件，小程序写在 wx 本地存储，
// 因此「导出备份」的 JSON 可以在桌面端与小程序之间互相导入恢复。

const LS_KEY = "tidebalance-data";

let state = null;
const subs = new Set();
let saveTimer = null;
let saveFail = false;

function uid(p) {
  return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── 日期工具 ── */
function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function fmtDate(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function todayStr() { return fmtDate(new Date()); }
function addDays(dateStr, n) {
  const parts = dateStr.split("-");
  const dt = new Date(+parts[0], +parts[1] - 1, +parts[2] + n);
  return fmtDate(dt);
}
function weekdayCN(dateStr) {
  const parts = dateStr.split("-");
  return "日一二三四五六"[new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay()];
}
function mmOf(hhmm) {
  const parts = hhmm.split(":");
  return +parts[0] * 60 + +parts[1];
}
function hhmmOf(min) {
  min = ((min % 1440) + 1440) % 1440;
  return pad2(Math.floor(min / 60)) + ":" + pad2(min % 60);
}
function durLabel(m) {
  if (m < 60) return m + " 分钟";
  const h = Math.floor(m / 60), r = m % 60;
  return r ? h + "h " + r + "m" : h + " 小时";
}

/* ── 初始化 ── */
function normalize(s) {
  s = s || {};
  s.tasks = Array.isArray(s.tasks) ? s.tasks : [];
  s.blocks = Array.isArray(s.blocks) ? s.blocks : [];
  s.settings = s.settings || {};
  s.plugins = s.plugins || {};
  return s;
}
function initStore(seed) {
  try {
    const raw = wx.getStorageSync(LS_KEY);
    state = raw && typeof raw === "object" && Array.isArray(raw.tasks) ? raw : seed;
  } catch (e) {
    state = seed;
  }
  return normalize(state);
}
function getState() { return state; }
function subscribe(fn) {
  subs.add(fn);
  return function unsub() { subs.delete(fn); };
}
function persist() {
  try {
    wx.setStorageSync(LS_KEY, state);
    saveFail = false;
  } catch (e) {
    if (!saveFail) {
      saveFail = true;
      console.error("保存失败", e);
      // 存储超限（单 key 1MB / 总量 10MB）时让用户知道修改没存上，而不是静默丢数据
      try { wx.showToast({ title: "本机存储空间不足，本次修改未能保存", icon: "none", duration: 3000 }); } catch (e2) { /* 忽略 */ }
    }
  }
}
function changed() {
  subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 350);
}

/* ── 任务 ── */
function addTask(patch) {
  const t = Object.assign({
    id: uid("t"), title: "新任务", note: "", quad: 1, done: false, estMin: 30,
    tags: [], project: "", due: null, dueTime: "23:59", reminderEnabled: true, reminderOffsets: null, createdAt: Date.now(),
  }, patch);
  state.tasks.unshift(t); changed(); return t;
}
function updateTask(id, patch) {
  const t = state.tasks.find((x) => x.id === id);
  if (t) { Object.assign(t, patch); changed(); }
  return t;
}
function removeTask(id) {
  const i = state.tasks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const t = state.tasks.splice(i, 1)[0];
  state.blocks = state.blocks.filter((b) => b.taskId !== id);
  changed(); return t;
}
function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (t) { t.done = !t.done; changed(); }
  return t;
}

/* ── 时间块 ── */
function blocksOf(dateStr) {
  return state.blocks
    .filter((b) => b.date === dateStr)
    .sort((a, b) => mmOf(a.start) - mmOf(b.start));
}
function addBlock(patch) {
  const b = Object.assign({
    id: uid("b"), date: todayStr(), start: "09:00", durMin: 30,
    title: "新时间块", taskId: null, cat: "work",
  }, patch);
  state.blocks.push(b); changed(); return b;
}
function updateBlock(id, patch) {
  const b = state.blocks.find((x) => x.id === id);
  if (b) { Object.assign(b, patch); changed(); }
  return b;
}
function removeBlock(id) {
  const i = state.blocks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const b = state.blocks.splice(i, 1)[0]; changed(); return b;
}

/* ── 派生：某天的任务池（未安排且未完成） ── */
function poolOf(dateStr) {
  const scheduled = new Set(blocksOf(dateStr).map((b) => b.taskId).filter(Boolean));
  return state.tasks.filter((t) => !t.done && !scheduled.has(t.id));
}
function taskById(id) { return state.tasks.find((t) => t.id === id); }

/* ── 象限取任务：未完成的在前，同象限内按截止日期升序 ── */
function tasksOfQuad(q) {
  return state.tasks
    .filter((t) => t.quad === q)
    .sort((a, b) =>
      (Number(a.done) - Number(b.done)) ||
      String(a.due || "9999").localeCompare(String(b.due || "9999")));
}

/* ── 插件状态（字段与桌面端完全一致，备份可互通） ── */
function pluginState(id) {
  if (!state.plugins[id]) state.plugins[id] = { enabled: true, storage: {} };
  if (!state.plugins[id].storage || typeof state.plugins[id].storage !== "object") state.plugins[id].storage = {};
  return state.plugins[id];
}
function isPluginEnabled(id) {
  return !state.plugins[id] || state.plugins[id].enabled !== false;
}
function setPluginEnabled(id, on) {
  pluginState(id).enabled = !!on; changed();
}
function pluginStorageGet(id, key, fallback) {
  const rec = state.plugins[id];
  if (!rec || !rec.storage || rec.storage[key] === undefined) return fallback;
  return rec.storage[key];
}
function pluginStorageSet(id, key, value) {
  pluginState(id).storage[key] = value; changed();
}

/* ── 备份导入 / 手动保存 ── */
function replaceAll(next) {
  state = normalize(next); changed();
}
function saveNow() {
  clearTimeout(saveTimer);
  persist();
}

/* ── 首次启动示例数据（与桌面端一致） ── */
function seed() {
  const d = todayStr();
  return {
    version: 1,
    tasks: [
      { id: "t1", title: "回复导师：开题修改稿", note: "", quad: 1, done: true, estMin: 15, tags: ["论文"], project: "毕业设计", due: d, createdAt: Date.now() },
      { id: "t2", title: "修复登录页线上 bug", note: "疑似 token 过期逻辑", quad: 1, done: false, estMin: 60, tags: ["线上"], project: "毕业设计平台", due: d, createdAt: Date.now() },
      { id: "t3", title: "答辩 PPT · 第 3 章图表重绘", note: "", quad: 1, done: false, estMin: 120, tags: ["答辩"], project: "毕业设计", due: d, createdAt: Date.now() },
      { id: "t4", title: "精读《深度工作》第 4 章", note: "", quad: 2, done: false, estMin: 45, tags: ["读书"], project: "读书计划", due: null, createdAt: Date.now() },
      { id: "t5", title: "每周健身 3 次 · 第 2 次", note: "背 + 二头", quad: 2, done: false, estMin: 40, tags: ["运动"], project: "", due: null, createdAt: Date.now() },
      { id: "t6", title: "回飞书群消息 12 条", note: "", quad: 3, done: false, estMin: 10, tags: [], project: "", due: d, createdAt: Date.now() },
      { id: "t7", title: "取快递 + 缴水电费", note: "", quad: 3, done: false, estMin: 20, tags: ["生活"], project: "", due: d, createdAt: Date.now() },
      { id: "t8", title: "整理相册 · 6 月旅行", note: "", quad: 4, done: false, estMin: 30, tags: [], project: "", due: null, createdAt: Date.now() },
    ],
    blocks: [
      { id: "b1", date: d, start: "09:00", durMin: 120, title: "论文写作 · 第 3 章", taskId: null, cat: "work" },
      { id: "b2", date: d, start: "11:00", durMin: 45, title: "整理参考文献", taskId: null, cat: "work" },
      { id: "b3", date: d, start: "11:45", durMin: 75, title: "午餐 + 散步", taskId: null, cat: "life" },
    ],
    settings: {},
    plugins: {},
  };
}

const CATEGORIES = [
  { id: "work", label: "工作" },
  { id: "study", label: "学习" },
  { id: "sport", label: "运动" },
  { id: "life", label: "生活" },
  { id: "rest", label: "休息" },
];
function catLabel(c) {
  const hit = CATEGORIES.find((x) => x.id === c);
  return (hit && hit.label) || c;
}

module.exports = {
  uid, fmtDate, todayStr, addDays, weekdayCN, mmOf, hhmmOf, durLabel,
  initStore, getState, subscribe, saveNow,
  addTask, updateTask, removeTask, toggleTask,
  blocksOf, addBlock, updateBlock, removeBlock,
  poolOf, taskById, tasksOfQuad,
  pluginState, isPluginEnabled, setPluginEnabled, pluginStorageGet, pluginStorageSet,
  replaceAll, seed, CATEGORIES, catLabel,
};
