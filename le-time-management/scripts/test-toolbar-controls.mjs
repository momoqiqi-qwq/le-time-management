import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachToolbarDrag, toolbarItems, toolbarSlot, animateToolbarReorder } from "../src/toolbarDrag.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const shell = read("../src/shell.js"), css = read("../src/styles.css");
const orderSource = shell.slice(shell.indexOf("const TOPBAR_PARTS ="), shell.indexOf("function viewDef("));
const state = { settings: { topbarOrder: ["quick", "search", "theme", "stats", "window"] } };
let saves = 0;
const { topbarOrderState, moveTopbarPart } = new Function("S", `${orderSource}; return { topbarOrderState, moveTopbarPart };`)(
  { getState: () => state, persistSoon: () => saves++ },
);
assert.deepEqual(topbarOrderState(), ["quick", "search", "theme", "stats", "settings", "window"], "旧顺序保留，新增设置插在窗口控制之前");
state.settings.topbarOrder = ["theme", "theme", "missing", "window"];
assert.deepEqual(topbarOrderState(), ["theme", "search", "quick", "settings", "stats", "window"], "去重并丢弃未知部件");
assert.equal(moveTopbarPart(["settings", "quick", "search", "theme", "stats"]), true);
assert.equal(state.settings.topbarOrder.at(-1), "window", "浏览器未渲染窗口键时仍保留它的存档位置");
assert.equal(moveTopbarPart(state.settings.topbarOrder), false, "相同顺序不重复写盘");
assert.equal(saves, 1);
assert.match(shell, /class: "top-mini-btn top-settings-trigger"/);
assert.match(shell, /onclick: \(\) => openSettingsModal\(\)/, "顶栏复用原设置面板");
assert.match(shell, /attachToolbarDrag\(topbarActionCard/);
assert.doesNotMatch(shell, /text\/topbar-part/, "不能再同时保留另一套原生拖放事件");
assert.match(css, /:root\[data-theme-mode="dark"\] \.rail-dock > \.rail-dock-btn\.window-focus-btn \.ic,[\s\S]*?color: #fff;/);
assert.match(css, /:root\[data-theme-mode="dark"\] \.rail-dock-ghost\.window-focus-btn \.ic/);

const widths = new Map([["a", 34], ["b", 120], ["c", 34]]);
assert.equal(toolbarSlot(["a", "b", "c"], "a", widths, 100, 4, 122), 0, "起拖时不要自动让第一个按钮右移");
assert.equal(toolbarSlot(["a", "b", "c"], "a", widths, 100, 4, 199), 1, "越过不同宽度的部件中心才换位");
assert.equal(toolbarSlot(["b", "a", "c"], "a", widths, 100, 4, 199), 1, "换位后指针停住不抖动");
assert.equal(toolbarSlot(["a", "b", "c"], "b", widths, 100, 4, 0), 0);
assert.equal(toolbarSlot(["a", "b", "c"], "b", widths, 100, 4, 900), 2);
const scaled = new Map([...widths].map(([id, w]) => [id, w * 1.5]));
assert.equal(toolbarSlot(["a", "b", "c"], "a", scaled, 150, 6, 199 * 1.5), 1, "槽位统一使用缩放后的视口坐标");

class Target {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn(event); }
}
class Element extends Target {
  constructor(id = "", classes = "rail-dock-btn", width = 40) {
    super(); this.id = id; this.classes = new Set(classes.split(" ").filter(Boolean)); this.width = width;
    this.children = []; this.parentElement = null; this.attrs = new Map(); this.moves = []; this.position = "static";
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x) };
  }
  matches(s) { return s.startsWith(".") ? this.classes.has(s.slice(1)) : s === "[data-topbar-part]" && this.attrs.has("data-topbar-part"); }
  closest(s) { return this.matches(s) ? this : this.parentElement?.closest(s); }
  get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  getBoundingClientRect() {
    let left = 100;
    if (this.parentElement) for (const node of this.parentElement.children) { if (node === this) break; left += node.width + 4; }
    return { left, top: 10, width: this.width, height: 40, right: left + this.width, bottom: 50 };
  }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  setAttribute(k, v) { this.attrs.set(k, v); }
  removeAttribute(k) { this.attrs.delete(k); }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  insertBefore(node, before) { node.remove(); node.parentElement = this; const i = before ? this.children.indexOf(before) : this.children.length; this.children.splice(i, 0, node); }
  remove() { if (this.parentElement) { const p = this.parentElement; p.children.splice(p.children.indexOf(this), 1); this.parentElement = null; } }
  cloneNode() { const copy = new Element(this.id, [...this.classes].join(" "), this.width); copy.attrs = new Map(this.attrs); return copy; }
  querySelectorAll() { return []; }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus() { document.activeElement = this; }
  animate(frames, options) { const result = { cancelled: false, cancel() { this.cancelled = true; } }; this.moves.push({ frames, options, result }); return result; }
}
const doc = new Target(), win = new Target();
doc.documentElement = { dataset: { uiMotion: "full" } }; doc.body = new Element("body", "");
win.matchMedia = () => ({ matches: false });
globalThis.document = doc; globalThis.window = win;
globalThis.getComputedStyle = (node) => ({ position: node.position, columnGap: "4px", padding: "0px", gap: "4px", font: "14px sans-serif", color: "white" });
let serial = 0; const frames = new Map();
globalThis.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const tick = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
const pointer = (target, x, extra = {}) => ({ target, clientX: x, clientY: 25, pointerId: 1, pointerType: "mouse", button: 0, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
const fixture = (options) => {
  const list = new Element("list", ""); const buttons = ["a", "b", "c"].map(id => new Element(id));
  if (options?.selector) for (const button of buttons) button.setAttribute("data-topbar-part", button.id);
  list.append(...buttons); doc.body.append(list); let commits = 0;
  const binding = attachToolbarDrag(list, () => commits++, options);
  return { list, buttons, binding, order: () => list.children.map(x => x.id), commits: () => commits };
};
const ghosts = () => doc.body.children.filter(x => x.classes.has("rail-dock-ghost") || x.classes.has("topbar-drag-ghost"));

let f = fixture();
f.buttons[1].position = "absolute";
assert.deepEqual(toolbarItems(f.list, ".rail-dock-btn"), [f.buttons[0], f.buttons[2]], "居中的统计不能占排序槽位");
f.buttons[1].position = "static";
f.list.fire("pointerdown", pointer(f.buttons[0], 120));
doc.fire("pointerup", pointer(f.buttons[0], 120));
assert.equal(f.commits(), 0, "普通点击不能触发换位或写盘");
assert.equal(doc.listeners.get("pointermove").size, 0);
f.buttons[0].focus();
f.list.fire("keydown", pointer(f.buttons[0], 120, { altKey: true, key: "ArrowRight" }));
assert.deepEqual(f.order(), ["b", "a", "c"]);
assert.equal(f.commits(), 1);
assert.ok(f.buttons[0].moves.length && f.buttons[1].moves.length, "键盘换位也应播放 FLIP");
assert.equal(doc.activeElement, f.buttons[0]);
f.binding.destroy(); f.list.remove();

for (const options of [undefined, { selector: "[data-topbar-part]", ghostClass: "topbar-drag-ghost", dragClass: "topbar-dragging", liveClass: "topbar-drag-live" }]) {
  f = fixture(options);
  f.list.fire("pointerdown", pointer(f.buttons[0], 120));
  doc.fire("pointermove", pointer(f.buttons[0], 170)); tick();
  assert.deepEqual(f.order(), ["b", "a", "c"]);
  assert.equal(ghosts().length, 1, "两个工具区都必须有跟手副本");
  const click = pointer(f.buttons[0], 170); doc.fire("click", click);
  assert.ok(click.prevented && click.stopped, "拖动中不能触发原按钮点击");
  doc.fire("pointerup", pointer(f.buttons[0], 230));
  assert.deepEqual(f.order(), ["b", "c", "a"]);
  assert.equal(f.commits(), 1);
  assert.equal(ghosts().length, 0);
  assert.equal(frames.size, 0);
  assert.equal(f.buttons[0].getAttribute("data-motion"), null, "松手恢复原动效属性");
  assert.equal(f.buttons[0].moves.at(-1).options.duration, 210, "松手有落位动画");
  assert.ok(doc.listeners.get("click").size, "pointerup 后的 click 仍须吞掉");
  await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(doc.listeners.get("click").size, 0);
  f.binding.destroy(); f.list.remove();
}

for (const end of [() => doc.fire("pointercancel", pointer(f.buttons[0], 180)), () => doc.fire("keydown", pointer(f.buttons[0], 180, { key: "Escape" })), () => win.fire("blur")]) {
  f = fixture();
  f.list.fire("pointerdown", pointer(f.buttons[0], 120));
  doc.fire("pointermove", pointer(f.buttons[0], 180)); tick();
  end();
  assert.deepEqual(f.order(), ["a", "b", "c"], "取消/失焦必须回滚原顺序");
  assert.equal(f.commits(), 0); assert.equal(ghosts().length, 0); assert.equal(frames.size, 0);
  f.binding.destroy(); f.list.remove();
}
await new Promise(resolve => setTimeout(resolve, 1));

f = fixture(); doc.documentElement.dataset.uiMotion = "reduced";
f.list.fire("pointerdown", pointer(f.buttons[0], 120));
doc.fire("pointermove", pointer(f.buttons[0], 220)); tick();
doc.fire("pointerup", pointer(f.buttons[0], 220));
assert.deepEqual(f.order(), ["b", "c", "a"]);
assert.equal(f.commits(), 1); assert.equal(ghosts().length, 0);
assert.ok(f.buttons.every(x => !x.moves.length), "减少动效模式不播放位移动画");
f.binding.destroy(); f.list.remove(); doc.documentElement.dataset.uiMotion = "full";
await new Promise(resolve => setTimeout(resolve, 1));

f = fixture();
f.list.fire("pointerdown", pointer(f.buttons[0], 120, { pointerType: "touch" }));
await new Promise(resolve => setTimeout(resolve, 260));
assert.equal(ghosts().length, 1, "触屏长按可进入拖拽");
doc.fire("pointercancel", pointer(f.buttons[0], 120));
f.binding.destroy(); f.list.remove();
await new Promise(resolve => setTimeout(resolve, 1));

const node = new Element("flip"); let left = 60;
node.getBoundingClientRect = () => ({ left, top: 0 });
animateToolbarReorder([node], () => { left = 120; }, { scale: 1.5 });
assert.equal(node.moves.at(-1).frames[0].transform, "translate(-40px, 0px)", "FLIP 位移须补偿界面缩放");
const previous = node.moves.at(-1).result;
animateToolbarReorder([node], () => { left = 150; }, { scale: 1.5 });
assert.ok(previous.cancelled, "连续换位必须取消旧动画，不能叠加偏移");
console.log("✓ toolbar controls：白色深色图标 / 设置入口 / 存档兼容 / 跟手与落位 / 键盘 / 长按 / 取消 / 减少动效 / 缩放 全部通过");
