const CLOSING_CLASS = "motion-closing";
const PRESS_CLASS = "motion-pressing";
const CLICK_CLASS = "motion-clicked";
const CLOSE_CONTROL_CLASS = "motion-close-control";
let initialized = false;
const pressedControls = new Set();

export function reducedMotion() {
  const setting = document.documentElement.dataset.uiMotion;
  if (setting === "full") return false;
  if (setting === "reduced") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function isCloseControl(control) {
  const label = [control.getAttribute("aria-label"), control.title, control.textContent]
    .filter(Boolean)
    .join(" ")
    .trim();
  return /(?:关闭|取消|收起|退出|×|✕)/.test(label);
}

function addRipple(control, clientX, clientY) {
  if (reducedMotion() || control.tagName !== "BUTTON") return;
  const rect = control.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = Number.isFinite(clientX) && clientX > 0 ? clientX - rect.left : rect.width / 2;
  const y = Number.isFinite(clientY) && clientY > 0 ? clientY - rect.top : rect.height / 2;
  const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
  const ripple = document.createElement("span");
  ripple.className = "motion-ripple";
  ripple.style.cssText = `--motion-ripple-x:${x}px;--motion-ripple-y:${y}px;--motion-ripple-size:${radius * 2}px`;
  control.classList.add("motion-ripple-host");
  control.append(ripple);
  const remove = () => ripple.remove();
  ripple.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, 520);
}

export function initMotionInteractions() {
  if (initialized) return;
  initialized = true;
  const release = () => {
    for (const control of pressedControls) control.classList.remove(PRESS_CLASS);
    pressedControls.clear();
  };
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const control = event.target?.closest?.("button, [role='button']");
    if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
    control.classList.add(PRESS_CLASS);
    pressedControls.add(control);
    addRipple(control, event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener("click", (event) => {
    const control = event.target?.closest?.("button, [role='button']");
    if (!control || control.disabled || control.getAttribute("aria-disabled") === "true") return;
    control.classList.toggle(CLOSE_CONTROL_CLASS, isCloseControl(control));
    control.classList.remove(CLICK_CLASS);
    void control.offsetWidth;
    control.classList.add(CLICK_CLASS);
    if (event.detail === 0) addRipple(control);
    window.setTimeout(() => control.classList.remove(CLICK_CLASS), 280);
  }, true);
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });
  window.addEventListener("blur", release);
}

// 插件常用 innerHTML / replaceChildren 重绘局部内容。宿主统一为新内容补上轻量反馈，
// 让第三方插件无需依赖主应用 CSS 类，也能获得一致的状态切换动效。
//
// 「弹 2 下」修复（用户视频反馈）：
// 1) 挂载宽限期 settleMs——视图本身正在做入场动画，这期间插件的首绘 / 缓存绘
//    （如学习通 render 里的 loading → paintMain(缓存)）不再叠加动画；
// 2) 重绘动画只留淡入、去掉 7px 上移——异步数据到达的重绘是「浮现」不是「弹跳」。
export function observePluginMotion(container, { settleMs = 350 } = {}) {
  if (!container || typeof MutationObserver === "undefined") return () => {};
  const pending = new Set();
  let frame = 0;
  const startedAt = performance.now();
  const flush = () => {
    frame = 0;
    if (reducedMotion()) {
      pending.clear();
      return;
    }
    if (performance.now() - startedAt < settleMs) {
      pending.clear();
      return;
    }
    const candidates = [...pending].filter((node) => node.isConnected);
    pending.clear();
    const roots = candidates.filter((node) => !candidates.some((parent) => parent !== node && parent.contains(node)));
    for (const node of roots.slice(0, 12)) {
      if (!node.getClientRects().length) continue;
      const topLevel = node.parentElement === container;
      node.animate(
        topLevel
          ? [{ opacity: .2 }, { opacity: 1 }]
          : [{ opacity: .24 }, { opacity: 1 }],
        { duration: topLevel ? 180 : 160, easing: "cubic-bezier(.22,.8,.22,1)" },
      );
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches("style, script, link, option, .motion-ripple") || node.closest('[data-motion="off"]')) continue;
        pending.add(node);
      }
    }
    if (pending.size && !frame) frame = requestAnimationFrame(flush);
  });
  observer.observe(container, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
    pending.clear();
  };
}

export function closeLayer(panel, mask, cleanup) {
  if (!panel && !mask) {
    cleanup?.();
    return;
  }
  if (panel?.classList.contains(CLOSING_CLASS)) return;
  cleanup?.();
  if (reducedMotion()) {
    mask?.remove();
    panel?.remove();
    return;
  }
  const layerKind = panel?.matches(".drawer")
    ? "side"
    : panel?.matches(".cmd-palette, .quick-cap")
      ? "top"
      : panel?.matches(".settings-modal, .wc-web-panel")
        ? "full"
        : "center";
  if (panel) panel.dataset.motionLayer = layerKind;
  mask?.classList.add("motion-layer-mask");
  panel?.classList.add(CLOSING_CLASS);
  mask?.classList.add(CLOSING_CLASS);
  panel?.setAttribute("aria-hidden", "true");
  if (panel?.contains(document.activeElement)) document.activeElement.blur();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    mask?.remove();
    panel?.remove();
  };
  const target = panel || mask;
  const onAnimationEnd = (event) => {
    if (event.target !== target) return;
    target.removeEventListener("animationend", onAnimationEnd);
    finish();
  };
  target?.addEventListener("animationend", onAnimationEnd);
  window.setTimeout(finish, 320);
}

export function removeWithMotion(element) {
  if (!element || element.classList.contains(CLOSING_CLASS)) return;
  if (reducedMotion()) return element.remove();
  element.classList.add(CLOSING_CLASS);
  const finish = () => element.remove();
  const onAnimationEnd = (event) => {
    if (event.target !== element) return;
    element.removeEventListener("animationend", onAnimationEnd);
    finish();
  };
  element.addEventListener("animationend", onAnimationEnd);
  window.setTimeout(finish, 240);
}
