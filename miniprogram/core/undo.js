// 短时撤销跨页面可用；快照由 store 的撤销函数保存，不写入用户数据。
let pending = null, timer = null;
const listeners = new Set();
function label() { if (pending && Date.now() >= pending.until) { clearTimeout(timer); timer=null; pending=null; } return pending ? pending.message : ""; }
function emit() { listeners.forEach(fn => { try { fn(label()); } catch (e) { console.error(e); } }); }
function offer(fn, message) {
  if (typeof fn !== "function") return;
  clearTimeout(timer);
  pending = { fn, message: message || "操作已完成", until: Date.now() + 12000 }; emit();
  timer = setTimeout(clear, 12000);
}
function clear() { clearTimeout(timer); timer = null; pending = null; emit(); }
function run() {
  label(); const entry = pending; clear();
  if (!entry) return false;
  const ok = entry.fn() !== false;
  wx.showToast({ title: ok ? "已撤销" : "数据已变化，这次撤销已失效", icon: "none" });
  return ok;
}
function bind(page) {
  const update = message => page.setData({ undoMessage: message });
  listeners.add(update); update(label());
  return () => listeners.delete(update);
}
module.exports = { offer, clear, run, bind, label };
