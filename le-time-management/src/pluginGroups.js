// 插件颜色分组：色板、同色吸附的顺序归一化、组名与收起状态。
//
// 这里只依赖 store，不 import pluginAppearance —— 那边反过来 import 本模块做色值校验，
// 双向引用会让 ESM 初始化顺序变得不可读。插件的色值本身存在
// settings.pluginOverrides[id].color（读写在 pluginAppearance），组元数据存在
// settings.pluginGroups[colorId]。
import * as S from "./store.js";

export const GROUP_COLORS = [
  { id: "red", label: "红色", hex: "#DC2626" },
  { id: "orange", label: "橙色", hex: "#EA580C" },
  { id: "yellow", label: "黄色", hex: "#CA8A04" },
  { id: "green", label: "绿色", hex: "#16A34A" },
  { id: "cyan", label: "青色", hex: "#0891B2" },
  { id: "blue", label: "蓝色", hex: "#2563EB" },
  { id: "purple", label: "紫色", hex: "#7C3AED" },
  { id: "pink", label: "粉色", hex: "#DB2777" },
];

const COLORS_BY_ID = new Map(GROUP_COLORS.map((color) => [color.id, color]));

export function isGroupColor(value) {
  return COLORS_BY_ID.has(value);
}

export function groupColorMeta(value) {
  return COLORS_BY_ID.get(value) || null;
}

// 只认合法色 ID：脏值一律按「未分组」处理，免得一个坏值把整列顺序搅乱。
function safeColor(colorOf, id) {
  const value = typeof colorOf === "function" ? colorOf(id) : "";
  return isGroupColor(value) ? value : "";
}

function cleanIds(ids) {
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && id) : [];
}

/**
 * 把同色插件拉成连续一段。段的位置 = 该组第一个成员在原顺序里的位置，
 * 无色插件各占自己原来的槽。纯函数，色由调用方注入。
 * 线性实现：每个 ID 只问一次颜色 —— colorOf 在侧栏里是一次覆写表查询，
 * 每次重绘、每次改色都要跑，旧写法对每个上色插件都要把整列再扫一遍。
 */
export function normalizePluginOrder(ids, colorOf) {
  const list = [...new Set(cleanIds(ids))];
  const colorById = new Map(list.map((id) => [id, safeColor(colorOf, id)]));
  const members = new Map();
  for (const id of list) {
    const color = colorById.get(id);
    if (!color) continue;
    if (!members.has(color)) members.set(color, []);
    members.get(color).push(id);
  }
  const out = [];
  for (const id of list) {
    const color = colorById.get(id);
    if (!color) out.push(id);
    else if (members.get(color)[0] === id) out.push(...members.get(color));
  }
  return out;
}

/**
 * 按颜色切成连续段，每段带上自己的颜色（无色段为 ""），调用方不必再逐个回查。
 * 侧栏渲染与整组移动都从这里取段。
 */
export function groupRuns(ids, colorOf) {
  const runs = [];
  for (const id of cleanIds(ids)) {
    const color = safeColor(colorOf, id);
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.ids.push(id);
    else runs.push({ color, ids: [id] });
  }
  return runs;
}

/** 按颜色切成连续段（每段是一串 ID），供整组移动用。 */
export function groupSegments(ids, colorOf) {
  return groupRuns(ids, colorOf).map((run) => run.ids);
}

/** 整组与相邻段交换位置，delta 以「段」为单位；越界或组不存在则原样返回。 */
export function moveGroupInOrder(ids, colorId, delta, colorOf) {
  const list = cleanIds(ids);
  if (!isGroupColor(colorId)) return list;
  const runs = groupRuns(list, colorOf);
  const at = runs.findIndex((run) => run.color === colorId);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= runs.length) return list;
  const [moved] = runs.splice(at, 1);
  runs.splice(to, 0, moved);
  return runs.flatMap((run) => run.ids);
}

function groupsTable() {
  const settings = S.getState().settings;
  const current = settings.pluginGroups;
  if (!current || typeof current !== "object" || Array.isArray(current)) settings.pluginGroups = {};
  return settings.pluginGroups;
}

function groupRecord(table, colorId) {
  const record = table[colorId];
  return record && typeof record === "object" && !Array.isArray(record) ? record : null;
}

// 组记录的唯一写口：在副本上改，改完为空就整条删掉（settings 里不留一串 {}），再落库。
function updateGroupRecord(colorId, mutate) {
  const table = groupsTable();
  const next = { ...(groupRecord(table, colorId) || {}) };
  mutate(next);
  if (Object.keys(next).length) table[colorId] = next;
  else delete table[colorId];
  S.persistSoon();
  return next;
}

export function groupName(colorId) {
  const meta = groupColorMeta(colorId);
  if (!meta) return "";
  const record = groupRecord(groupsTable(), colorId);
  return String(record?.name || "").trim() || `${meta.label}组`;
}

/** 组名留空即恢复默认（= 颜色名 + 组）。 */
export function renameGroup(colorId, name) {
  if (!isGroupColor(colorId)) return null;
  const value = String(name ?? "").trim();
  return updateGroupRecord(colorId, (next) => {
    if (value) next.name = value;
    else delete next.name;
  });
}

export function isGroupCollapsed(colorId) {
  return !!groupRecord(groupsTable(), colorId)?.collapsed;
}

export function toggleGroupCollapsed(colorId) {
  if (!isGroupColor(colorId)) return false;
  return !!updateGroupRecord(colorId, (next) => {
    if (next.collapsed) delete next.collapsed;
    else next.collapsed = true;
  }).collapsed;
}
