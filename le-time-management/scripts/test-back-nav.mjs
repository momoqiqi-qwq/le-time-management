// 返回键历史栈的行为测试 —— 不是源码文本断言，而是把 src/backNav.js 真的跑起来。
//
// backNav.js 是纯逻辑 + 少量 DOM 查询，所以这里配一套极简的 DOM / History /
// MutationObserver 替身，逐条验证「按一下返回键，到底退到哪」。
// 替身只实现 backNav 真正用到的那点 API，不做通用 DOM。
//
// 每个场景都换一套全新的世界 + 一份全新的 backNav 模块实例（import 加 query 破缓存），
// 场景之间不共享状态，断言才好读。
//
// 覆盖的关键回归：
//   · 首页（什么都没有）按返回 = 交给系统退出应用，不留「按一下没反应」的空格子
//   · 切视图后返回 = 回上一个界面；连点同一个导航项不会多压格
//   · 浮层打开后返回 = 只关最上面那层浮层，不切视图
//   · 浮层被自己的按钮关掉后，那一格要回收，否则下次返回白按一下
//   · 命令面板 / 询问框这类非 .drawer-mask 的浮层也要能被返回键关掉

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

/* ────────────────────────── 极简 DOM 替身 ────────────────────────── */

function matchesSimple(el, raw) {
  const sel = raw.trim();
  if (!sel) return false;
  if (sel.startsWith(".")) return el.classList.contains(sel.slice(1));
  const attr = sel.match(/^\[([\w-]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/);
  if (attr) {
    const value = el.getAttribute(attr[1]);
    return attr[2] === undefined ? value !== null : value === attr[2];
  }
  return el.tagName === sel.toUpperCase();
}
const matchesSelector = (el, sel) => sel.split(",").some((one) => matchesSimple(el, one));

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...names) { names.forEach((n) => n && this.set.add(n)); }
  remove(...names) { names.forEach((n) => this.set.delete(n)); }
  contains(name) { return this.set.has(name); }
}

class FakeEl {
  constructor(tag = "div", attrs = {}, text = "") {
    this.tagName = tag.toUpperCase();
    this.classList = new FakeClassList();
    this.children = [];
    this.parent = null;
    this.attrs = { ...attrs };
    this.textContent = text;
    this.clicks = 0;
    this._clickHandlers = [];
    if (attrs.class) this.classList.add(...String(attrs.class).split(/\s+/).filter(Boolean));
  }
  get title() { return this.attrs.title || ""; }
  get isConnected() {
    let node = this;
    while (node) {
      if (node === STATE.doc.body || node === STATE.doc.documentElement) return true;
      node = node.parent;
    }
    return false;
  }
  get nextElementSibling() {
    if (!this.parent) return null;
    const i = this.parent.children.indexOf(this);
    return i < 0 ? null : this.parent.children[i + 1] || null;
  }
  append(...kids) {
    for (const kid of kids) {
      if (!kid) continue;
      kid.parent = this;
      this.children.push(kid);
      queueRecord({ addedNodes: [kid] });
    }
  }
  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
    queueRecord({ removedNodes: [this] });
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  matches(sel) { return matchesSelector(this, sel); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const kid of node.children) {
        if (matchesSelector(kid, sel)) out.push(kid);
        walk(kid);
      }
    };
    walk(this);
    return out;
  }
  addEventListener(type, handler) { if (type === "click") this._clickHandlers.push(handler); }
  click() {
    this.clicks += 1;
    for (const handler of [...this._clickHandlers]) handler({ target: this });
  }
}

/* MutationObserver：把本轮的 DOM 增删攒成一批，用微任务回调出去（与浏览器一致）。 */
let pendingRecords = [];
let flushScheduled = false;

function queueRecord(record) {
  if (!STATE.observers.length) return;
  pendingRecords.push(record);
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const records = pendingRecords;
    pendingRecords = [];
    for (const observer of [...STATE.observers]) observer.callback(records);
  });
}

class FakeMutationObserver {
  constructor(callback) { this.callback = callback; }
  observe() { STATE.observers.push(this); }
  disconnect() { STATE.observers = STATE.observers.filter((o) => o !== this); }
}

/* ────────────────────────── 极简 History 替身 ────────────────────────── */

// 与真浏览器一致：back() 只移动指针、不删条目；之后再 pushState 才会截掉前面的条目。
// 所以「栈上还剩几格能退」要看 depth（= index），不是 length。
class FakeHistory {
  constructor() { this.stack = [{ state: null }]; this.index = 0; }
  get state() { return this.stack[this.index].state; }
  get length() { return this.stack.length; }
  get depth() { return this.index; }
  get canGoBack() { return this.index > 0; }
  pushState(state) {
    this.stack.splice(this.index + 1);
    this.stack.push({ state });
    this.index = this.stack.length - 1;
  }
  replaceState(state) { this.stack[this.index] = { state }; }
  back() {
    if (this.index === 0) return;
    this.index -= 1;
    const state = this.state;
    queueMicrotask(() => { for (const fn of [...STATE.popstate]) fn({ state }); });
  }
}

/* ────────────────────────── 世界搭建 ────────────────────────── */

const STATE = { doc: null, observers: [], popstate: [] };
let worldSeq = 0;

/**
 * 换一套干净的世界。
 * `goto(id)` = 模拟用户在界面上切视图（shell.switchTo 的 commit）；
 * `applyView(id)` = 返回键触发的视图还原，单独记进 `applied`，两者不能混。
 */
async function setup({ view = "quadrant" } = {}) {
  const body = new FakeEl("body");
  const doc = {
    body,
    documentElement: new FakeEl("html"),
    querySelectorAll(sel) { return body.querySelectorAll(sel); },
  };
  const history = new FakeHistory();
  const window = {
    history,
    addEventListener: (type, fn) => { if (type === "popstate") STATE.popstate.push(fn); },
    removeEventListener: (type, fn) => {
      if (type !== "popstate") return;
      const i = STATE.popstate.indexOf(fn);
      if (i >= 0) STATE.popstate.splice(i, 1);
    },
  };
  STATE.doc = doc;
  STATE.observers = [];
  STATE.popstate = [];
  pendingRecords = [];
  flushScheduled = false;
  globalThis.document = doc;
  globalThis.window = window;
  globalThis.MutationObserver = FakeMutationObserver;

  const applied = [];
  let current = view;
  const world = {
    history,
    applied,
    body,
    get current() { return current; },
    goto(id) { current = id; },
    applyView(id) { applied.push(id); current = id; },
    /** 造一个浮层遮罩挂到 body：`onClickClose` 模拟「点遮罩即关」。 */
    openMask({ className = "drawer-mask", onClickClose = true, closers = [] } = {}) {
      const mask = new FakeEl("div", { class: className });
      const buttons = closers.map((spec) => {
        const btn = new FakeEl("button", spec.role ? { role: spec.role } : {}, spec.text || "");
        if (spec.label) btn.attrs["aria-label"] = spec.label;
        btn.addEventListener("click", () => mask.remove());
        mask.append(btn);
        return btn;
      });
      if (onClickClose) mask.addEventListener("click", () => mask.remove());
      body.append(mask);
      return { mask, buttons };
    },
  };

  worldSeq += 1;
  const mod = await import(new URL(`../src/backNav.js?world=${worldSeq}`, import.meta.url).href);
  const off = mod.initBackNav({ readView: () => world.current, applyView: (id) => world.applyView(id) });
  return { world, mod, off };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
async function pressBack(world) {
  world.history.back();
  await flush();
}

/* ────────────────────────── 场景 ────────────────────────── */

// 1. 首页且什么都没有：栈里只剩最初那一格 → 返回键直接交给系统退出应用。
{
  const { world, off } = await setup();
  assert.equal(world.history.depth, 0, "首屏不能多压格子");
  assert.equal(world.history.canGoBack, false,
    "首页必须不可回退：否则返回键第一下没反应、第二下才退出应用");
  off();
}

// 2. 切视图后返回 = 回上一个界面（用户原始诉求：不要直接退出软件）。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  world.goto("timeblock"); mod.noteViewChange("timeblock");
  assert.equal(world.history.depth, 2, "两次切视图压两格");

  await pressBack(world);
  assert.deepEqual(world.applied, ["inbox"], "返回键应先回到 inbox 而不是退出应用");
  assert.equal(world.current, "inbox");

  await pressBack(world);
  assert.deepEqual(world.applied, ["inbox", "quadrant"], "再退一次回到首页");
  assert.equal(world.history.canGoBack, false, "到达最初那格后才交给系统退出");
  off();
}

// 3. 连点同一个导航项：不重复压栈（否则返回键按下去看着「没反应」）。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  mod.noteViewChange("inbox");
  assert.equal(world.history.depth, 1, "同一个视图重复切换只算一格");
  await pressBack(world);
  assert.deepEqual(world.applied, ["quadrant"]);
  off();
}

// 4. 浮层打开 → 返回只关浮层，不切视图；关掉后不留空格子。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  const { mask } = world.openMask();
  await flush();
  assert.equal(world.history.depth, 1, "浮层打开要压一格浮层格，返回键才有得退");
  assert.equal(world.history.state.ltmGuard, true, "栈顶那一格要标记成浮层格");

  await pressBack(world);
  assert.equal(mask.isConnected, false, "返回键先关浮层");
  assert.deepEqual(world.applied, [], "关浮层不能顺手把视图也切了");
  assert.equal(world.history.canGoBack, false, "浮层关掉后那一格要还回去，不能留空格子");
  void mod;
  off();
}

// 5. 浮层被自己的按钮关掉 → 那一格要回收，下次返回才真的退得动。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  const { mask } = world.openMask();
  await flush();
  assert.equal(world.history.depth, 2, "有浮层时 = 视图格 + 浮层格");

  mask.remove();          // 等价于用户自己点了浮层里的「关闭 / ×」
  await flush();
  assert.equal(world.history.depth, 1, "浮层被按钮关掉后，浮层格必须回收");
  assert.deepEqual(world.applied, [], "回收历史格本身不是一次视图切换");

  await pressBack(world);
  assert.deepEqual(world.applied, ["quadrant"], "回收后下一次返回要真的回到上个界面，不能白按一下");
  off();
}

// 6. 两层浮层：返回键一层一层关，全程不切视图。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  const lower = world.openMask().mask;
  const upper = world.openMask().mask;
  await flush();
  assert.equal(world.history.depth, 2, "两层浮层也只占一格（栈顶那格代表最上面那层）");

  await pressBack(world);
  assert.equal(upper.isConnected, false, "第一次返回关最上面那层");
  assert.equal(lower.isConnected, true, "下面那层要留着");
  assert.equal(world.history.depth, 2, "还有浮层开着，就必须保证返回键还退得动");

  await pressBack(world);
  assert.equal(lower.isConnected, false, "第二次返回关剩下那层");
  assert.deepEqual(world.applied, [], "关浮层全程不应切视图");

  await pressBack(world);
  assert.deepEqual(world.applied, ["quadrant"], "浮层都关完后，返回才回上一个界面");
  off();
}

// 7. 遮罩不响应点击的询问框：要退到「取消」那条路，且不能误触「确定」。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  const { mask, buttons } = world.openMask({
    className: "drawer-mask app-dialog-mask",
    onClickClose: false,
    closers: [{ text: "取消" }, { text: "确定", role: "button" }],
  });
  await flush();
  await pressBack(world);
  assert.equal(mask.isConnected, false, "遮罩不响应点击时要走「取消按钮」那条兜底路径");
  assert.equal(buttons[0].clicks, 1, "应当点的是「取消」");
  assert.equal(buttons[1].clicks, 0, "绝不能误触「确定」");
  assert.deepEqual(world.applied, [], "关询问框不切视图");
  off();
}

// 8. 命令面板用的是自己的类名（.cmd-mask），也必须能被返回键关掉。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  const { mask } = world.openMask({ className: "cmd-mask" });
  await flush();
  assert.equal(world.history.depth, 1, "命令面板打开也要压浮层格");
  await pressBack(world);
  assert.equal(mask.isConnected, false, "命令面板必须能被返回键关掉（类名清单最容易漏）");
  assert.equal(world.history.canGoBack, false);
  void mod;
  off();
}

// 9. 屏幕上没有浮层时，无关的 DOM 变化不能凭空多压一格。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  const { mask } = world.openMask();
  await flush();
  const before = world.history.depth;
  world.body.append(new FakeEl("div", { class: "toast" }));
  world.body.append(new FakeEl("p"));
  await flush();
  assert.equal(world.history.depth, before, "普通 DOM 变化不该动历史栈（Observer 挂在 subtree 上，容易误判）");
  await pressBack(world);
  assert.equal(mask.isConnected, false);
  off();
}

// 10. 浮层开着时程序性切视图：改浮层格上的视图名，而不是额外压一格。
{
  const { world, mod, off } = await setup({ view: "quadrant" });
  world.goto("inbox"); mod.noteViewChange("inbox");
  const { mask } = world.openMask();
  await flush();
  const before = world.history.depth;

  world.goto("timeblock"); mod.noteViewChange("timeblock");   // 插件注册表变化导致的跳转
  assert.equal(world.history.depth, before, "浮层开着时切视图不该额外压格");
  assert.equal(world.history.state.ltmView, "timeblock", "浮层格要跟着改成新视图，否则以后退到它会跳回旧界面");

  await pressBack(world);
  assert.equal(mask.isConnected, false, "返回键仍然先关浮层");
  assert.equal(world.current, "timeblock", "关浮层不能把视图改回旧的");
  assert.deepEqual(world.applied, []);
  off();
  assert.deepEqual(STATE.popstate, [], "卸载后不应再留着 popstate 监听");
}

console.log("PASS: 返回键历史栈（视图回退 / 浮层优先 / 空格子回收 / 各类遮罩类名）");
