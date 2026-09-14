// 课表视图入口的行为测试：默认安装包不带 native/shiguang 运行时，
// 此时必须把视图交回插件自带的课表界面，而不是留一块只显示提示文字的死面板。
// src/api.js 只读 window.__TAURI_INTERNALS__、无外部依赖，所以可以在 Node 里直接驱动真源码。
import assert from 'node:assert/strict';

/* ── 极简 DOM ── */
class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.textContent = '';
    this.className = '';
    this.style = { cssText: '' };
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
    this._listeners = new Map();
  }
  append(...nodes) { for (const n of nodes) { n.parentNode = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    const i = this.parentNode?.children.indexOf(this) ?? -1;
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  addEventListener(type, fn) { this._listeners.set(type, fn); }
  removeEventListener(type) { this._listeners.delete(type); }
  closest() { return this._view || null; }
  getBoundingClientRect() { return { x: 12, y: 34, width: 900, height: 620 }; }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  text() { return [this.textContent, ...this.descendants().map((c) => c.textContent)].join(' '); }
}

/* ── 宿主环境 ── */
const calls = [];
let statusReply = { available: false, platform: 'windows' };

globalThis.window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd, args) => {
      calls.push({ cmd, args });
      if (args?.action === 'status') {
        if (statusReply instanceof Error) throw statusReply;
        return statusReply;
      }
      return { visible: true };
    },
  },
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
};
globalThis.document = { createElement: (tag) => new FakeEl(tag) };
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
globalThis.cancelAnimationFrame = () => {};

const { renderNativeSchedule } = await import('../src/nativeSchedule.js');
const tick = () => new Promise((r) => setTimeout(r, 0));
const DEAD_END = '尚未包含原版课表运行时';

function box() {
  const view = new FakeEl('section');
  const container = new FakeEl('div');
  container._view = view;
  container.style.cssText = 'height:100%;overflow-y:auto';   // 宿主给 .plugview 的默认样式
  return container;
}

/* ① 运行时缺失（默认安装包）→ 交回插件界面 */
{
  calls.length = 0;
  statusReply = { available: false, platform: 'windows' };
  const el = box();
  const ctx = { refresh() {} };
  let got = null, disposed = 0;
  const cleanup = renderNativeSchedule(el, ctx, (target, received) => {
    assert.equal(received, ctx, '插件界面必须拿到宿主的 ctx');
    got = target;
    return () => { disposed += 1; };
  });
  await tick();
  assert.equal(got, el, '运行时缺失时必须把视图交回插件界面');
  assert.equal(calls.filter((c) => c.args.action === 'show').length, 0, '运行时缺失时不该再尝试打开原生窗口');
  assert.ok(!el.text().includes(DEAD_END), `不该留下死面板提示：${el.text().trim()}`);
  assert.equal(el.style.cssText, 'height:100%;overflow-y:auto', '交回插件界面时必须还原 .plugview 的容器样式');
  cleanup();
  assert.equal(disposed, 1, '切换视图时要调用插件界面自己的清理函数');
}

/* ② 探测本身报错（例如 Android 包里没注册原生模块）→ 同样交回插件界面 */
{
  calls.length = 0;
  statusReply = new Error('命令 native_schedule 未注册');
  const el = box();
  let got = null;
  renderNativeSchedule(el, {}, (target) => { got = target; });
  await tick();
  assert.equal(got, el, '探测失败时必须交回插件界面，而不是把异常抛给用户');
  assert.ok(!el.text().includes('未注册'), '不该把原生探测的原始报错直接摆到界面上');
}

/* ③ 运行时可用（tauri.shiguang.conf.json 打出来的含原版课表的包）→ 仍走原生嵌入 */
{
  calls.length = 0;
  statusReply = { available: true, platform: 'windows' };
  const el = box();
  let fallbackCalled = false;
  const cleanup = renderNativeSchedule(el, {}, () => { fallbackCalled = true; });
  await tick();
  await tick();
  const show = calls.find((c) => c.args.action === 'show');
  assert.ok(show, '运行时可用时必须把显示区域交给原生窗口');
  assert.ok(show.args.bounds.width >= 1 && show.args.bounds.height >= 1, '显示区域尺寸必须合法');
  assert.equal(fallbackCalled, false, '运行时可用时不该退到插件界面');
  assert.match(el.style.cssText, /overflow:hidden/, '原生嵌入要的是「撑满 + 不滚动」的容器');
  cleanup();
  await tick();
  assert.equal(calls.filter((c) => c.args.action === 'hide').length, 1, '切换视图时必须通知原生窗口隐藏');
}

/* ④ 插件界面自己炸了 → 给出可读提示，而不是白屏 */
{
  calls.length = 0;
  statusReply = { available: true, platform: 'windows' };
  const el = box();
  let got = null;
  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    calls.push({ cmd, args });
    if (args?.action === 'status') return statusReply;
    if (args?.action === 'show') throw new Error('原版课表未完成启动，请检查运行时日志');
    return { visible: true };
  };
  renderNativeSchedule(el, {}, (target) => {
    got = target;
    target.append(new FakeEl('main'));
  });
  await tick();
  await tick();
  assert.equal(got, el, '原生运行时启动失败时必须回退到插件界面');
  assert.ok(!el.text().includes('原版课表未完成启动'), '不该把原生启动失败留成死面板');
  assert.equal(el.style.cssText, 'height:100%;overflow-y:auto', '原生启动失败回退时必须还原 .plugview 样式');

  window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
    calls.push({ cmd, args });
    if (args?.action === 'status') {
      if (statusReply instanceof Error) throw statusReply;
      return statusReply;
    }
    return { visible: true };
  };
}

/* ⑤ 插件界面自己炸了 → 给出可读提示，而不是白屏 */
{
  statusReply = { available: false, platform: 'windows' };
  const el = box();
  renderNativeSchedule(el, {}, () => { throw new Error('存储不可用'); });
  await tick();
  assert.match(el.text(), /课程表界面加载失败：存储不可用/);
}

/* ⑥ 没有兜底渲染函数时也不能静默白屏 */
{
  statusReply = { available: false, platform: 'windows' };
  const el = box();
  renderNativeSchedule(el, {});
  await tick();
  assert.match(el.text(), /插件界面也不可用/);
}

console.log('PASS: 课表视图在「原版运行时缺失 / 探测失败」时回退到插件界面，运行时可用时仍走原生嵌入');
