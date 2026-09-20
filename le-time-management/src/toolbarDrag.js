import { reducedMotion } from "./motion.js";
import { slotIndexFor } from "./railActions.js";
import { getUiScaleFactor } from "./uiScale.js";

// 顶栏与左下操作条共用：跟手浮起、FLIP 让位、松手落位；不参与业务数据写入。
const animations = new WeakMap();
const EASING = "cubic-bezier(.22,.8,.22,1)";

export function toolbarItems(list, selector) {
  return [...list.children].filter((node) => {
    if (!node.matches(selector) || !node.getClientRects().length) return false;
    // 居中的统计胶囊脱离 flex 流，不能把它的宽度算进横向槽位。
    return !["absolute", "fixed"].includes(getComputedStyle(node).position);
  });
}

// widths / left / gap / x 都是视口坐标；保留原按钮占位，避免指针停下时来回换位。
export function toolbarSlot(order, card, widths, left, gap, x) {
  const mids = [];
  let at = left;
  for (const node of order) {
    const width = widths.get(node) || 0;
    if (node !== card) mids.push(at + width / 2);
    at += width + gap;
  }
  return slotIndexFor(mids, x);
}

function play(node, frames, duration) {
  animations.get(node)?.cancel();
  if (typeof node.animate !== "function") return;
  const animation = node.animate(frames, { duration, easing: EASING });
  animations.set(node, animation);
  animation.onfinish = () => { if (animations.get(node) === animation) animations.delete(node); };
}

export function animateToolbarReorder(nodes, mutate, { scale = getUiScaleFactor() || 1 } = {}) {
  // 先记当前视觉位置，再取消上一次 FLIP；连续换位不累加残余 transform。
  const before = new Map(nodes.map((node) => [node, node.getBoundingClientRect()]));
  for (const node of nodes) { animations.get(node)?.cancel(); animations.delete(node); }
  mutate();
  if (reducedMotion()) return;
  for (const node of nodes) {
    const old = before.get(node), now = node.getBoundingClientRect();
    const dx = (old.left - now.left) / scale, dy = (old.top - now.top) / scale;
    if (Math.abs(dx) + Math.abs(dy) < .1) continue;
    play(node, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], 185);
  }
}

export function attachToolbarDrag(list, onCommit, {
  selector = ".rail-dock-btn",
  ghostClass = "rail-dock-ghost",
  dragClass = "dragging",
  liveClass = "drag-live",
} = {}) {
  let pd = null;
  const items = () => toolbarItems(list, selector);
  const clearLong = (st) => { if (st.longTimer) clearTimeout(st.longTimer); st.longTimer = null; };
  const changed = (st) => st.originOrder.some((node, i) => list.children[i] !== node);

  const endSession = (st) => {
    clearLong(st);
    if (st.frame) cancelAnimationFrame(st.frame);
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onCancel, true);
    document.removeEventListener("keydown", onEscape, true);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("resize", cancel);
    st.ghost?.remove();
    st.card.classList.remove(dragClass);
    list.classList.remove(liveClass, "toolbar-drag-live");
    for (const [node, previous] of st.motionAttrs || []) {
      if (previous === null) node.removeAttribute("data-motion"); else node.setAttribute("data-motion", previous);
    }
    if (pd === st) pd = null;
    try { list.releasePointerCapture(st.pointerId); } catch { /* document 监听兜底 */ }
    // pointerup 后浏览器还会派发 click；拖动不能顺带打开设置、切主题或关闭窗口。
    if (st.swallowClick) setTimeout(() => document.removeEventListener("click", st.swallowClick, true), 0);
  };

  function cancel() {
    const st = pd;
    if (!st) return;
    if (st.active) animateToolbarReorder(items(), () => {
      for (const node of st.originOrder) if (node.parentElement === list) list.append(node);
    }, { scale: st.scale });
    st.active = false;
    endSession(st);
  }

  function update(st) {
    if (!st.active) return;
    if (!list.contains(st.card)) { cancel(); return; }
    st.ghost?.style.setProperty("transform", `translate(${(st.x - st.gx) / st.scale}px, ${(st.y - st.gy) / st.scale}px) scale(1.025)`);
    const order = items();
    const slot = toolbarSlot(order, st.card, st.widths, st.left, st.gap, st.x);
    if (slot === st.slot) return;
    st.slot = slot;
    const peers = order.filter((node) => node !== st.card);
    animateToolbarReorder(peers, () => list.insertBefore(st.card, peers[slot] ?? null), { scale: st.scale });
  }

  function frame(st) {
    update(st);
    if (pd === st && st.active) st.frame = requestAnimationFrame(() => frame(st));
  }

  function beginDrag(st) {
    if (pd !== st || st.active || !list.contains(st.card)) return;
    clearLong(st);
    st.active = true;
    st.originOrder = [...list.children];
    st.scale = getUiScaleFactor() || 1;
    const order = items();
    st.motionAttrs = new Map(order.map((node) => [node, node.getAttribute("data-motion")]));
    list.classList.add(liveClass, "toolbar-drag-live");
    for (const node of order) {
      node.setAttribute("data-motion", "off");
      node.classList.remove("motion-pressing", "motion-clicked");
      animations.get(node)?.cancel();
    }
    const rect = st.card.getBoundingClientRect();
    st.gx = st.x - rect.left; st.gy = st.y - rect.top;
    st.left = order[0].getBoundingClientRect().left;
    st.gap = (parseFloat(getComputedStyle(list).columnGap) || 0) * st.scale;
    st.widths = new Map(order.map((node) => [node, node.getBoundingClientRect().width]));
    st.slot = order.indexOf(st.card);
    if (!reducedMotion()) {
      const ghost = st.card.cloneNode(true);
      ghost.classList.add(ghostClass);
      ghost.removeAttribute("id");
      ghost.removeAttribute("data-rail-id");
      ghost.removeAttribute("data-topbar-part");
      ghost.setAttribute("aria-hidden", "true");
      ghost.setAttribute("tabindex", "-1");
      ghost.setAttribute("data-motion", "off");
      for (const ripple of ghost.querySelectorAll(".motion-ripple")) ripple.remove();
      const css = getComputedStyle(st.card);
      Object.assign(ghost.style, {
        width: `${rect.width / st.scale}px`, height: `${rect.height / st.scale}px`,
        padding: css.padding, font: css.font, color: css.color, gap: css.gap,
      });
      document.body.append(ghost);
      st.ghost = ghost;
    }
    st.card.classList.add(dragClass);
    st.swallowClick = (event) => { event.preventDefault(); event.stopPropagation(); };
    document.addEventListener("click", st.swallowClick, true);
    // 捕获到不移动的容器，避免 insertBefore 移动按钮时丢失 pointer capture。
    try { list.setPointerCapture(st.pointerId); } catch { /* document 监听兜底 */ }
    update(st);
    st.frame = requestAnimationFrame(() => frame(st));
  }

  function onDown(event) {
    if (pd || (event.pointerType === "mouse" && event.button !== 0)) return;
    const card = event.target.closest?.(selector);
    if (!card || card.parentElement !== list || !items().includes(card) || card.disabled) return;
    pd = { card, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: event.clientX, y: event.clientY, active: false, frame: 0, longTimer: null };
    if (event.pointerType !== "mouse") {
      const st = pd;
      pd.longTimer = setTimeout(() => { if (pd === st) beginDrag(st); }, 240);
    }
    // 从按下就监听，尚未进入拖拽时在容器外松手也能清掉长按定时器。
    document.addEventListener("pointermove", onMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onCancel, true);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
  }

  function onMove(event) {
    const st = pd;
    if (!st || event.pointerId !== st.pointerId) return;
    st.x = event.clientX; st.y = event.clientY;
    if (st.active) { event.preventDefault(); return; }
    const dx = st.x - st.startX, dy = st.y - st.startY;
    if (st.longTimer) { if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLong(st); return; }
    if (event.pointerType === "mouse" && Math.hypot(dx, dy) >= 6) beginDrag(st);
  }

  function onUp(event) {
    const st = pd;
    if (!st || event.pointerId !== st.pointerId) return;
    if (!st.active) { endSession(st); return; }
    st.x = event.clientX; st.y = event.clientY;
    update(st);
    if (pd !== st) return;
    const didChange = changed(st), ghostRect = st.ghost?.getBoundingClientRect();
    st.active = false;
    endSession(st);
    if (didChange) onCommit?.();
    if (ghostRect && !reducedMotion() && list.contains(st.card)) {
      const landed = st.card.getBoundingClientRect();
      play(st.card, [
        { transformOrigin: "0 0", transform: `translate(${(ghostRect.left - landed.left) / st.scale}px, ${(ghostRect.top - landed.top) / st.scale}px) scale(1.025)` },
        { transformOrigin: "0 0", transform: "none" },
      ], 210);
    }
  }

  function onCancel(event) { if (pd && event.pointerId === pd.pointerId) cancel(); }
  function onEscape(event) { if (event.key === "Escape") { event.preventDefault(); cancel(); } }
  function onLostCapture(event) { if (pd?.active && event.pointerId === pd.pointerId) cancel(); }
  function onNativeDrag(event) { if (event.target.closest?.(selector)) event.preventDefault(); }
  function onTouchMove(event) { if (pd?.active) event.preventDefault(); }
  function onKey(event) {
    if (pd || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const card = event.target.closest?.(selector), order = items();
    const at = order.indexOf(card), to = at + (event.key === "ArrowRight" ? 1 : -1);
    if (at < 0 || to < 0 || to >= order.length || card.disabled) return;
    event.preventDefault();
    const focus = document.activeElement;
    animateToolbarReorder(order, () => list.insertBefore(card, to > at ? order[to].nextSibling : order[to]));
    onCommit?.();
    (focus || card).focus?.({ preventScroll: true });
  }

  list.addEventListener("pointerdown", onDown);
  list.addEventListener("lostpointercapture", onLostCapture);
  list.addEventListener("dragstart", onNativeDrag);
  list.addEventListener("touchmove", onTouchMove, { passive: false });
  list.addEventListener("keydown", onKey);
  return { cancel, destroy() {
    cancel();
    list.removeEventListener("pointerdown", onDown);
    list.removeEventListener("lostpointercapture", onLostCapture);
    list.removeEventListener("dragstart", onNativeDrag);
    list.removeEventListener("touchmove", onTouchMove);
    list.removeEventListener("keydown", onKey);
  } };
}
