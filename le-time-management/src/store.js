// 全局状态 + 持久化 + 派生数据
import { api } from "./api.js";
import { migrateState } from "./migrations.js";

let state = null;
const subs = new Set();
let saveTimer = null;
let saveFail = 0;
let saveChain = Promise.resolve();
let batchDepth = 0;
let batchDirty = false;
let blockIndexVersion = 0;
const blockIndexByDate = new Map();

export function uid(p = "id") {
  return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ── 日期工具 ── */
export function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function todayStr() { return fmtDate(new Date()); }
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return fmtDate(dt);
}
export function weekdayCN(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return "日一二三四五六"[new Date(y, m - 1, d).getDay()];
}
export function mmOf(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function hhmmOf(min) {
  min = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function durLabel(m) {
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h} 小时`;
}

/* ── 初始化 / 结构归一化 ── */
export function normalizeState(raw = {}) {
  const next = raw && typeof raw === "object" ? raw : {};
  next.tasks = Array.isArray(next.tasks) ? next.tasks : [];
  next.blocks = Array.isArray(next.blocks) ? next.blocks : [];
  next.settings = next.settings && typeof next.settings === "object" && !Array.isArray(next.settings) ? next.settings : {};
  next.plugins = next.plugins && typeof next.plugins === "object" && !Array.isArray(next.plugins) ? next.plugins : {};
  next.inbox = Array.isArray(next.inbox) ? next.inbox : [];
  next.automation = next.automation && typeof next.automation === "object" && !Array.isArray(next.automation) ? next.automation : {};
  return next;
}
function invalidateBlockIndex() {
  blockIndexVersion++;
  blockIndexByDate.clear();
}
export async function initStore(seed) {
  let loaded;
  try {
    loaded = await api.loadData();
  } catch {
    loaded = seed;
  }
  // 迁移放在 try 之外：数据来自更新版本时要显式报错，而不是静默换成种子数据
  state = normalizeState(migrateState(loaded));
  invalidateBlockIndex();
  return state;
}
export function getState() { return state; }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function queueSave() {
  saveChain = saveChain.catch(() => {}).then(() => api.saveData(state));
  return saveChain.then(() => { saveFail = 0; }).catch((e) => { if (++saveFail === 1) console.error("保存失败", e); throw e; });
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { queueSave().catch(() => {}); }, 350);
}
function emitChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("tide:state-changed"));
  subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
}
function changed() {
  if (batchDepth > 0) { batchDirty = true; return; }
  emitChanged();
  scheduleSave();
}
// 仅请求持久化，不触发界面刷新/自动化。适合滑块、导航位置等高频设置。
export function persistSoon() { scheduleSave(); }
export function touch() { changed(); }
// 批量修改期间合并刷新与写盘，避免循环中每条记录都触发一次全局更新。
export async function batchChanges(fn) {
  batchDepth++;
  try { return await fn(); }
  finally {
    batchDepth--;
    if (batchDepth === 0 && batchDirty) {
      batchDirty = false;
      emitChanged();
      scheduleSave();
    }
  }
}

/* ── 任务 ── */
export function addTask(patch) {
  const t = {
    id: uid("t"), title: "新任务", note: "", quad: 1, done: false, estMin: 30,
    tags: [], project: "", due: null, dueTime: "23:59", reminderEnabled: true, reminderOffsets: null, createdAt: Date.now(), ...patch,
  };
  state.tasks.unshift(t); changed(); return t;
}
export function updateTask(id, patch) {
  const t = state.tasks.find((x) => x.id === id);
  if (t) {
    Object.assign(t, patch);
    if (patch.title !== undefined) state.blocks.filter((b) => b.taskId === id).forEach((b) => { b.title = t.title; });
    changed();
  }
  return t;
}
export function removeTask(id) {
  const i = state.tasks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [t] = state.tasks.splice(i, 1);
  state.blocks = state.blocks.filter((b) => b.taskId !== id);
  invalidateBlockIndex();
  changed(); return t;
}
export function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (t) { t.done = !t.done; changed(); }
  return t;
}

// 删除与撤销作为一个操作，完整保留关联排程。
export function deleteTaskUndoable(id) {
  const task = taskById(id);
  if (!task) return null;
  const snapshot = JSON.parse(JSON.stringify({ task, blocks: state.blocks.filter((b) => b.taskId === id) }));
  removeTask(id);
  return () => {
    if (taskById(id)) return;
    state.tasks.unshift(snapshot.task);
    state.blocks.push(...snapshot.blocks.filter((b) => !state.blocks.some((x) => x.id === b.id)));
    invalidateBlockIndex();
    changed();
  };
}

export function placeTask(t, date, startMin = null, cat = "work") {
  const dur = Math.max(15, Number(t.estMin) || 30);
  const busy = blocksOf(date).filter((b) => !t.id || b.taskId !== t.id);
  let cursor = startMin ?? 420;
  if (startMin === null) {
    for (const b of busy) {
      const start = mmOf(b.start), end = start + b.durMin;
      if (end <= cursor) continue;
      if (start - cursor >= dur) break;
      cursor = Math.max(cursor, end);
    }
  }
  if (!Number.isFinite(cursor) || cursor < 0 || cursor + dur > 1440) throw new Error("这一天没有足够的空闲时间");
  if (busy.some((b) => cursor < mmOf(b.start) + b.durMin && cursor + dur > mmOf(b.start))) throw new Error("这个时段已有安排，请选择空闲时段");
  // 验证成功后再替换所选日期的安排，保留其他日期的记录。
  if (t.id) {
    state.blocks = state.blocks.filter((b) => b.taskId !== t.id || b.date !== date);
    invalidateBlockIndex();
  }
  return addBlock({ date, start: hhmmOf(cursor), durMin: dur, title: t.title, taskId: t.id || null, cat });
}

/* ── 时间块 ── */
export function blocksOf(dateStr) {
  const cached = blockIndexByDate.get(dateStr);
  if (cached && cached.version === blockIndexVersion) return cached.blocks.slice();
  const blocks = state.blocks.filter((b) => b.date === dateStr).sort((a, b) => mmOf(a.start) - mmOf(b.start));
  blockIndexByDate.set(dateStr, { version: blockIndexVersion, blocks });
  return blocks.slice();
}
export function addBlock(patch) {
  const b = { id: uid("b"), date: todayStr(), start: "09:00", durMin: 30, title: "新时间块", taskId: null, cat: "work", ...patch };
  state.blocks.push(b); invalidateBlockIndex(); changed(); return b;
}
export function updateBlock(id, patch) {
  const b = state.blocks.find((x) => x.id === id);
  if (b) { Object.assign(b, patch); invalidateBlockIndex(); changed(); }
  return b;
}
export function removeBlock(id) {
  const i = state.blocks.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [b] = state.blocks.splice(i, 1); invalidateBlockIndex(); changed(); return b;
}

/* ── 派生：某天的任务池（未安排且未完成） ── */
export function poolOf(dateStr) {
  const scheduled = new Set(blocksOf(dateStr).map((b) => b.taskId).filter(Boolean));
  return state.tasks.filter((t) => !t.done && !scheduled.has(t.id));
}
export function taskById(id) { return state.tasks.find((t) => t.id === id); }

/* ── 象限取任务 ── */
export function tasksOfQuad(q) {
  return state.tasks
    .filter((t) => t.quad === q)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"));
}

/* ── 插件状态 ── */
export function pluginState(id) {
  if (!state.plugins[id]) state.plugins[id] = { enabled: true, storage: {} };
  state.plugins[id].storage ??= {};
  return state.plugins[id];
}
export function setPluginEnabled(id, on) {
  pluginState(id).enabled = on; changed();
}
export function removePluginState(id) {
  if (state.plugins[id]) {
    delete state.plugins[id];
    changed();
  }
}
export function replaceAll(next) {
  state = normalizeState(migrateState(next));
  invalidateBlockIndex();
  changed();
}
export function saveNow() {
  clearTimeout(saveTimer);
  return queueSave();
}

export const CATEGORIES = [
  { id: "work", label: "工作" },
  { id: "study", label: "学习" },
  { id: "sport", label: "运动" },
  { id: "life", label: "生活" },
  { id: "rest", label: "休息" },
];
export function catLabel(c) { return (CATEGORIES.find((x) => x.id === c) || {}).label || c; }
