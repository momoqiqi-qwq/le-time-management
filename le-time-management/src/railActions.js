// 侧栏快捷操作条（rail dock）—— 动作注册表 + 顺序归一化
//
// v0.53.0：左下角原本**竖排**的「深浅色切换 / 设置」两颗按钮，改成**横排**操作条，
// 并要求两件事：
//   ① 按住按钮可以自由拖动重排 —— 被按住的按钮浮起（幽灵卡跟随指针），
//      其余按钮实时让位腾出空槽，落点由指针位置决定（不是松手才算）；
//   ② 「后续添加按钮」要有稳定接口 —— 新增按钮不再改 shell.js 的建 DOM 代码，
//      只注册一个定义即可。
//
// 所以「有哪些动作 / 什么顺序」收在本模块，shell.js 只负责把 listRailActions()
// 按 settings.railActionOrder 渲染成按钮，并处理指针拖拽。
//
// 顺序持久化在 settings.railActionOrder（与 settings.topbarOrder 同构）：
//   - 归一化只保留「当前仍在注册表里」的 id ⇒ 动作卸载后残留的 id 不会卡住顺序；
//   - 新注册的动作按注册先后**追加到尾部** ⇒ 老数据（没有这个字段）无需迁移，
//     首次读取即得到「注册顺序」，与升级前的视觉顺序一致。
//
// 本模块**不碰 DOM、不碰 store**：注册表 + 三个纯函数，便于单测（见
// scripts/test-rail-dock.mjs）。

/** 注册表：id → 定义。Map 的插入顺序即默认展示顺序（后注册的排在末尾）。 */
const registry = new Map();

/**
 * 注册一个操作条按钮。
 *
 * @param {object} def
 * @param {string} def.id          必填，唯一标识（顺序持久化用的就是它）
 * @param {string} [def.label]     无障碍名（aria-label），也是 tooltip 的兜底
 * @param {string} [def.title]     显式 tooltip（给了就不再用 label 兜底）
 * @param {string} [def.className] 附加类名（沿用既有样式钩子，如 theme-toggle-btn）
 * @param {() => Node} [def.icon]  返回初始图标节点
 * @param {(btn: HTMLElement) => void} [def.onMount] 挂载后回调，用于订阅刷新（如跟随系统主题）
 * @param {(event: Event, btn: HTMLElement) => void} [def.onClick]
 * @returns {string} 注册用的 id
 */
export function registerRailAction(def) {
  if (!def || typeof def !== "object") throw new Error("rail action 必须是一个对象");
  if (typeof def.id !== "string" || !def.id.trim()) throw new Error("rail action 必须有非空字符串 id");
  const id = def.id.trim();
  // 重复注册同 id 直接覆盖：renderShell 重建时会再注册一遍核心动作，
  // Map.set 对已存在的键**不改插入顺序**，所以默认顺序稳定。
  registry.set(id, { label: "", className: "", icon: null, onMount: null, onClick: null, ...def, id });
  return id;
}

/** 卸载动作（返回是否真的删掉了）。顺序里残留的 id 由 normalizeRailActionOrder 清掉。 */
export function unregisterRailAction(id) {
  return registry.delete(id);
}

/** 清空注册表。核心动作会在 renderShell 里重新注册；外部动作需要自己重注册。 */
export function clearRailActions() {
  registry.clear();
}

/** 按注册顺序列出全部动作定义（副本，调用方改不动注册表）。 */
export function listRailActions() {
  return [...registry.values()];
}

/** 当前已注册的动作 id（注册顺序）。 */
export function railActionIds() {
  return [...registry.keys()];
}

/**
 * 把持久化的顺序对齐到当前注册表：
 *   已知 id 去重保留 → 未知 id 丢弃 → 没出现在 saved 里的新动作按注册顺序追加到尾部。
 * 返回的一定是 ids 的一个排列（长度、元素都对齐），调用方可以直接拿去渲染。
 */
export function normalizeRailActionOrder(saved, ids = railActionIds()) {
  const known = new Set(ids);
  const seen = new Set();
  const kept = [];
  for (const id of Array.isArray(saved) ? saved : []) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return [...kept, ...ids.filter((id) => !seen.has(id))];
}

/**
 * 把 source 移到 target 的前面（before=true）或后面。
 * 返回新数组；source/target 有一方不在 order 里、或两者相同 ⇒ 返回 null（调用方据此跳过持久化）。
 */
export function moveRailAction(order, source, target, before = true) {
  if (typeof source !== "string" || typeof target !== "string" || source === target) return null;
  const list = [...(Array.isArray(order) ? order : [])];
  if (!list.includes(source) || !list.includes(target)) return null;
  list.splice(list.indexOf(source), 1);
  list.splice(list.indexOf(target) + (before ? 0 : 1), 0, source);
  return list;
}

/**
 * 落点槽位：mids 是**已去掉被拖项**后各按钮的中心点坐标（升序），x 是指针坐标。
 * 返回应插入的下标（0..mids.length）。
 *
 * 抽成纯函数是为了能直接单测「落点由指针实时决定」这条语义 ——
 * DOM 几何（offsetWidth + gap 递推）由调用方算，本函数只做判定。
 * 注意判定用 `<` 而不是 `<=`：指针正好压在中心线上时留在**后**一槽，
 * 与四象限拖拽（computeSlot）的边界行为保持一致。
 */
export function slotIndexFor(mids, x) {
  for (let i = 0; i < mids.length; i++) if (x < mids[i]) return i;
  return mids.length;
}
