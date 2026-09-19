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

/**
 * 应用内横幅。
 * @param {object} opts
 *   action / actionLabel 带一个动作按钮（默认文案「撤销」）
 *   ms 停留时长；**0 = 常驻不自动消失**（长鸣那种必须用户明确处置的横幅），默认 4200
 *   class 额外类名（如 "alarm"）
 * @returns {{close:Function,node:HTMLElement}} 调用方可以提前收掉它；旧调用方忽略返回值即可。
 *   close 幂等：按钮自身与调用方都会收，重复调用不会把动效跑两遍。
 */
export function toast(msg, opts = {}) {
  const box = document.getElementById("toasts");
  const t = el("div", { class: `toast${opts.class ? ` ${opts.class}` : ""}` }, el("span", {}, msg));
  let removed = false;
  const close = () => {
    if (removed) return;
    removed = true;
    removeWithMotion(t);
  };
  if (opts.action) {
    t.append(el("button", { onclick: () => { opts.action(); close(); } }, opts.actionLabel || "撤销"));
  }
  box.append(t);
  let timer = null;
  if (opts.ms !== 0) timer = setTimeout(close, opts.ms || 4200);
  return { close: () => { if (timer) clearTimeout(timer); close(); }, node: t };
}

/* ── 应用内对话框：替代 window.prompt / window.confirm（Tauri 里原生弹窗样式突兀）── */
function appDialog({ title, message, label, value = "", placeholder = "", confirmText = "确定", cancelText = "取消", danger = false, input = false }) {
  return new Promise((resolve) => {
    const close = (result) => {
      document.removeEventListener("keydown", onKey, true);
      mask.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(input ? null : false);
      }
    };
    const field = input
      ? el("input", { class: "app-dialog-field", type: "text", value, placeholder, "aria-label": label || title })
      : null;
    const submit = () => close(input ? field.value.trim() : true);
    const box = el("div", { class: "app-dialog", role: "dialog", "aria-modal": "true", "aria-label": title },
      el("h3", {}, title),
      message ? el("p", { class: "app-dialog-msg" }, message) : null,
      field,
      el("div", { class: "app-dialog-actions" },
        el("button", { class: "app-dialog-btn", type: "button", onclick: () => close(input ? null : false) }, cancelText),
        el("button", { class: `app-dialog-btn pri${danger ? " danger" : ""}`, type: "button", onclick: submit }, confirmText),
      ),
    );
    const mask = el("div", { class: "drawer-mask app-dialog-mask" }, box);
    mask.addEventListener("click", (e) => { if (e.target === mask) close(input ? null : false); });
    if (field) {
      field.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") submit();
      });
    }
    document.addEventListener("keydown", onKey, true);
    document.body.append(mask);
    if (field) { field.focus(); field.select(); }
    else box.querySelector(".app-dialog-btn.pri")?.focus();
  });
}

/** 应用内输入对话框：确认返回输入值（已 trim），取消/Esc 返回 null */
export function appPrompt(title, opts = {}) {
  return appDialog({ title, input: true, ...opts });
}

/** 应用内确认对话框：确认返回 true，取消/Esc 返回 false */
export function appConfirm(title, message, opts = {}) {
  return appDialog({ title, message, ...opts });
}

/**
 * 底部系统栏（三键导航栏 / 手势条）的真实高度，单位 px。
 * Android 由 MainActivity 注入 `--sab`（WebView 不实现 env(safe-area-inset-*)），
 * 桌面 / iOS 取不到该变量，返回 0 —— 行为与以前一致。
 * JS 定位的浮层（popmenu / 右键菜单 / quick-dock）贴底钳制必须减掉它，
 * 否则 8~20px 的 margin 挡不住 ~48dp 的三键导航栏（v0.58.2）。
 */
export function bottomInsetPx() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sab"));
  return Number.isFinite(v) ? v : 0;
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
  menu.style.top = `${Math.min(y, innerHeight - r.height - 10 - bottomInsetPx())}px`;
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
