// 全局状态 + 持久化 + 派生数据
// 移植自桌面端 src/store.js：任务/时间块的数据结构与字段完全一致，
// 差异只在持久化层 —— 桌面端写 JSON 文件，小程序写在 wx 本地存储，
// 因此「导出备份」的 JSON 可以在桌面端与小程序之间互相导入恢复。

const storage = require("./storage.js");

let state = null;
const subs = new Set();
let saveTimer = null;
let saveFail = false;
let storageError = "";
let locked = false;
let batchDepth = 0, batchDirty = false;
const blockCache = new Map();

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
  if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("数据格式无效");
  if (Number(s.dataSchemaVersion || 0) > 1) throw new Error("数据来自更新版本，请先升级小程序");
  s.tasks = Array.isArray(s.tasks) ? s.tasks : [];
  s.blocks = Array.isArray(s.blocks) ? s.blocks : [];
  s.settings = s.settings && typeof s.settings === "object" && !Array.isArray(s.settings) ? s.settings : {};
  s.plugins = s.plugins && typeof s.plugins === "object" && !Array.isArray(s.plugins) ? s.plugins : {};
  s.inbox = Array.isArray(s.inbox) ? s.inbox : [];
  s.automation = s.automation && typeof s.automation === "object" && !Array.isArray(s.automation) ? s.automation : {};
  s.dataSchemaVersion = 1;
  return s;
}
function initStore(seedData) {
  clearTimeout(saveTimer); saveTimer = null;
  blockCache.clear(); storageError = ""; locked = false; saveFail = false;
  let loaded;
  try {
    loaded = storage.read();
    if (loaded.data && (!Array.isArray(loaded.data.tasks) || (loaded.data.blocks != null && !Array.isArray(loaded.data.blocks)))) throw new Error("本机数据格式损坏，请从备份恢复");
    state = normalize(loaded.data || seedData || seed());
  } catch (e) {
    // 不能用空种子覆盖损坏/未来版本的快照。只读展示，直到用户显式恢复有效备份。
    state = normalize(seedData || seed()); locked = true;
    storageError = e.message || "本机数据无法读取，请从备份恢复";
    try { wx.showToast({ title: storageError, icon: "none", duration: 4000 }); } catch (ignored) {}
    return state;
  }
  if (loaded.legacy) persist(); // 保留原 key；新快照提交失败也不会丢旧数据。
  return state;
}
function getState() { return state; }
function subscribe(fn) {
  subs.add(fn);
  return function unsub() { subs.delete(fn); };
}
function persist() {
  if (locked) {
    try { wx.showToast({ title: "数据处于保护状态，请先在设置中导入有效备份", icon: "none" }); } catch (ignored) {}
    return false;
  }
  try {
    storage.write(state); saveFail = false; storageError = "";
    return true;
  } catch (e) {
    storageError = e.message || e.errMsg || "本机存储空间不足";
    if (!saveFail) {
      saveFail = true;
      console.error("保存失败", e);
      try { wx.showToast({ title: "保存失败，请导出备份并清理存储后重试", icon: "none", duration: 3500 }); } catch (ignored) {}
    }
    return false;
  }
}
function emit() { subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
function changed() {
  blockCache.clear();
  if (batchDepth) { batchDirty = true; return; }
  emit(); persistSoon();
}
function persistSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 350); }
// 同步批量修改只通知页面/安排写盘一次；网络请求应在进入这个函数前完成。
function batchChanges(fn) {
  batchDepth++;
  try { return fn(); }
  finally {
    batchDepth--;
    if (!batchDepth && batchDirty) { batchDirty = false; changed(); }
  }
}
function storageStatus() { return { locked, error: storageError, failed: saveFail }; }

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
  if (t) {
    Object.assign(t, patch);
    if (patch.title !== undefined) state.blocks.filter(b => b.taskId === id).forEach(b => { b.title = t.title; });
    changed();
  }
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
  if (!blockCache.has(dateStr)) blockCache.set(dateStr, state.blocks
    .filter(b => b.date === dateStr).sort((a, b) => mmOf(a.start) - mmOf(b.start)));
  return blockCache.get(dateStr).slice();
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
      ((a.order == null ? Infinity : a.order) - (b.order == null ? Infinity : b.order)) ||
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
  saveTimer = null;
  return persist();
}
// 显式导入事务：先完整写入，再切换内存；失败时保留当前数据和旧磁盘快照。
function commitSnapshot(next) {
  const candidate = normalize(JSON.parse(JSON.stringify(next)));
  storage.write(candidate);
  clearTimeout(saveTimer); saveTimer = null;
  state = candidate; locked = false; saveFail = false; storageError = "";
  blockCache.clear(); emit();
  return state;
}

/* ── 首次启动初始数据 —— 刻意全空，与桌面端 seed_data() 对齐 ──
   v0.37.17 起不再预置「示例任务」：首启四象限该是干净的，由空状态引导用户自己建。
   想要样例请走设置里的显式入口，别塞回这里。 */
function seed() {
  return {
    version: 1,
    tasks: [],
    blocks: [],
    settings: {},
    plugins: {},
    inbox: [], automation: {}, dataSchemaVersion: 1,
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

// 与桌面端相同：同象限 + 同完成态排序，完成项始终沉底。
function moveTaskRelative(id, overId, before) {
  const task = taskById(id), over = taskById(overId);
  if (!task || !over || id === overId || task.quad !== over.quad || !!task.done !== !!over.done) return false;
  const rest = tasksOfQuad(task.quad).filter(t => !!t.done === !!task.done && t.id !== id);
  const at = rest.findIndex(t => t.id === overId);
  rest.splice(at + (before === false ? 1 : 0), 0, task);
  rest.forEach((t, i) => { t.order = i; }); changed(); return true;
}
function moveTaskToQuad(id, quad) {
  const task = taskById(id), q = Number(quad);
  if (!task || !Number.isInteger(q) || q < 1 || q > 4) return null;
  if (task.quad === q) return task;
  const seq = tasksOfQuad(q).filter(t => !!t.done === !!task.done);
  task.quad = q; seq.push(task); seq.forEach((t, i) => { t.order = i; });
  changed(); return task;
}
function deleteTasksUndoable(ids) {
  const wanted = new Set(ids), owner = state;
  const tasks = state.tasks.filter(t => wanted.has(t.id));
  if (!tasks.length) return null;
  const snapshot = JSON.parse(JSON.stringify({ tasks, blocks: state.blocks.filter(b => wanted.has(b.taskId)) }));
  batchChanges(() => tasks.forEach(t => removeTask(t.id)));
  return () => {
    if (state !== owner) return false;
    const restoring = snapshot.tasks.filter(t => !taskById(t.id));
    if (!restoring.length) return false;
    const restoredIds = new Set(restoring.map(t => t.id));
    state.tasks.unshift(...restoring);
    state.blocks.push(...snapshot.blocks.filter(b => restoredIds.has(b.taskId) && !state.blocks.some(x => x.id === b.id)));
    changed(); return true;
  };
}
function deleteTaskUndoable(id) { return deleteTasksUndoable([id]); }
function deleteDoneTasksUndoable() { return deleteTasksUndoable(state.tasks.filter(t => t.done).map(t => t.id)); }
function removeBlockUndoable(id) {
  const b = state.blocks.find(x => x.id === id), owner = state;
  if (!b) return null;
  const snapshot = JSON.parse(JSON.stringify(b)); removeBlock(id);
  return () => {
    if (state !== owner || state.blocks.some(x => x.id === id) || (snapshot.taskId && !taskById(snapshot.taskId))) return false;
    state.blocks.push(snapshot); changed(); return true;
  };
}
function returnTaskToPool(id) {
  const block = state.blocks.find(b => b.id === id), owner = state;
  if (!block || !block.taskId || !taskById(block.taskId)) return null;
  const saved = JSON.parse(JSON.stringify(state.blocks.filter(b => b.taskId === block.taskId && b.date === block.date)));
  batchChanges(() => saved.forEach(b => removeBlock(b.id)));
  return () => {
    const task = taskById(block.taskId);
    if (state !== owner || !task) return false;
    const restoring = saved.filter(b => !state.blocks.some(x => x.id === b.id));
    if (!restoring.length) return false;
    restoring.forEach(b => { b.title = task.title; state.blocks.push(b); }); changed(); return true;
  };
}
function placeTask(task, date, startMin, cat) {
  if (!task || !task.id || !taskById(task.id)) throw new Error("任务不存在");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("请选择排程日期");
  const parts = date.split("-").map(Number);
  if (fmtDate(new Date(parts[0], parts[1] - 1, parts[2], 12)) !== date) throw new Error("排程日期无效");
  const dur = Math.max(15, Number(task.estMin) || 30);
  const busy = blocksOf(date).filter(b => b.taskId !== task.id);
  let cursor = startMin == null ? 420 : Number(startMin);
  if (startMin == null) for (const b of busy) {
    const start = mmOf(b.start), end = start + Number(b.durMin);
    if (end <= cursor) continue;
    if (start - cursor >= dur) break;
    cursor = Math.max(cursor, end);
  }
  if (!Number.isInteger(cursor) || !Number.isInteger(dur) || cursor < 0 || cursor + dur > 1440) throw new Error("这一天没有足够的空闲时间");
  if (busy.some(b => cursor < mmOf(b.start) + Number(b.durMin) && cursor + dur > mmOf(b.start))) throw new Error("这个时段已有安排，请选择空闲时段");
  // 所有校验成功之后，才替换选定日期；其他日期的排程始终保留。
  state.blocks = state.blocks.filter(b => b.taskId !== task.id || b.date !== date);
  return addBlock({ date, start: hhmmOf(cursor), durMin: dur, title: task.title, taskId: task.id, cat: cat || "work" });
}
function addInbox(patch) {
  const item = Object.assign({ id: uid("in"), title: "待处理事项", note: "", source: "捕获", status: "pending", suggestion: "create-task", createdAt: Date.now() }, patch);
  state.inbox.unshift(item); changed(); return item;
}
function inboxToTask(id) {
  const item = state.inbox.find(x => x.id === id);
  if (!item || item.status === "done") return null;
  let task;
  batchChanges(() => {
    task = addTask({ title: item.title, note: item.note || "", due: /^\d{4}-\d{2}-\d{2}$/.test(item.date || "") ? item.date : null,
      dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || "") ? item.time : "23:59", quad: 1,
      tags: [item.source || "收件箱"], sourcePlugin: item.sourcePlugin || "", attachments: Array.isArray(item.attachments) ? item.attachments.slice() : [] });
    item.status = "done"; item.taskId = task.id; changed();
  });
  return task;
}
function touch() { changed(); }

module.exports = {
  uid, fmtDate, todayStr, addDays, weekdayCN, mmOf, hhmmOf, durLabel,
  initStore, getState, subscribe, saveNow, persistSoon, touch, batchChanges, storageStatus, commitSnapshot, normalize,
  addTask, updateTask, removeTask, toggleTask, moveTaskRelative, moveTaskToQuad, placeTask,
  deleteTaskUndoable, deleteTasksUndoable, deleteDoneTasksUndoable, removeBlockUndoable, returnTaskToPool, addInbox, inboxToTask,
  blocksOf, addBlock, updateBlock, removeBlock,
  poolOf, taskById, tasksOfQuad,
  pluginState, isPluginEnabled, setPluginEnabled, pluginStorageGet, pluginStorageSet,
  replaceAll, seed, CATEGORIES, catLabel,
};
