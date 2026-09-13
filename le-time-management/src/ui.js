// 通用 UI 小件：toast、弹出菜单、dom 助手
import { removeWithMotion } from "./motion.js";

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

export function toast(msg, opts = {}) {
  const box = document.getElementById("toasts");
  const t = el("div", { class: "toast" }, el("span", {}, msg));
  if (opts.action) {
    t.append(el("button", { onclick: () => { opts.action(); removeWithMotion(t); } }, opts.actionLabel || "撤销"));
  }
  box.append(t);
  setTimeout(() => removeWithMotion(t), opts.ms || 4200);
}

export function popmenu(x, y, items) {
  document.querySelectorAll(".popmenu").forEach((m) => m.remove());
  const menu = el("div", { class: "popmenu" });
  for (const it of items) {
    if (it === "-") { menu.append(el("div", { class: "sep" })); continue; }
    menu.append(el("button", { class: it.warn ? "warn" : "", onclick: () => { close(); it.run(); } },
      it.icon ? el("span", {}, it.icon) : null, it.label));
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - r.width - 10)}px`;
  menu.style.top = `${Math.min(y, innerHeight - r.height - 10)}px`;
  const close = () => { removeWithMotion(menu); document.removeEventListener("pointerdown", onDoc, true); };
  const onDoc = (e) => { if (!menu.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener("pointerdown", onDoc, true));
  return close;
}

// 指针拖拽（鼠标 + 触摸通用，Android 可用）
// onDrop({x, y, payload, targetAt}) 由调用方决定放置逻辑
export function pointerDrag(e, payload, { ghostHTML, onMove, onDrop, onClick }) {
  if (e.button !== 0) return;
  const startX = e.clientX, startY = e.clientY;
  let ghost = null, moved = false;
  let lastEv = null, raf = 0;
  const pid = e.pointerId;

  const onUp = (ev) => {
    if (ev.pointerId !== pid) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onUp, true);
    if (raf) cancelAnimationFrame(raf);
    if (ghost) ghost.remove();
    if (ev.type === "pointercancel") return;
    if (moved) onDrop && onDrop({ x: ev.clientX, y: ev.clientY, payload });
    else onClick && onClick(ev);
  };
  const paintMove = () => {
    raf = 0;
    if (!lastEv) return;
    if (ghost) {
      ghost.style.transform = `translate3d(${lastEv.clientX}px, ${lastEv.clientY}px, 0) translate(-50%, -50%) rotate(1deg)`;
    }
    onMove && onMove(lastEv);
  };
  const move = (ev) => {
    if (ev.pointerId !== pid) return;
    if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
    moved = true;
    if (!ghost) {
      ghost = el("div", { class: "drag-ghost" });
      if (ghostHTML) ghost.append(ghostHTML);
      document.body.append(ghost);
    }
    lastEv = ev;
    if (!raf) raf = requestAnimationFrame(paintMove);
    ev.preventDefault();
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", onUp, true);
  window.addEventListener("pointercancel", onUp, true);
}

export const QUADS = [
  { q: 1, cls: "q1", title: "重要且紧急 · 立即做", tip: "截止压顶，别再犹豫", rn: "I" },
  { q: 2, cls: "q2", title: "重要不紧急 · 排计划", tip: "人生的复利都在这里", rn: "II" },
  { q: 3, cls: "q3", title: "紧急不重要 · 少快办", tip: "能批量就批量，能拒绝就拒绝", rn: "III" },
  { q: 4, cls: "q4", title: "不重要不紧急 · 有空再说", tip: "留给真正的休息", rn: "IV" },
];
