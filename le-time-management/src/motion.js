const CLOSING_CLASS = "motion-closing";
const PRESS_CLASS = "motion-pressing";

function reducedMotion() {
  const setting = document.documentElement.dataset.uiMotion;
  if (setting === "full") return false;
  if (setting === "reduced") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function initMotionInteractions() {
  const release = (event) => {
    const button = event.target?.closest?.(`.${PRESS_CLASS}`);
    button?.classList.remove(PRESS_CLASS);
  };
  document.addEventListener("pointerdown", (event) => {
    const button = event.target?.closest?.("button, [role='button']");
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    const rect = button.getBoundingClientRect();
    button.style.setProperty("--motion-x", `${event.clientX - rect.left}px`);
    button.style.setProperty("--motion-y", `${event.clientY - rect.top}px`);
    button.classList.add(PRESS_CLASS);
  }, { passive: true });
  document.addEventListener("pointerup", release, { passive: true });
  document.addEventListener("pointercancel", release, { passive: true });
  window.addEventListener("blur", () => {
    document.querySelectorAll(`.${PRESS_CLASS}`).forEach((node) => node.classList.remove(PRESS_CLASS));
  });
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
  panel?.classList.add(CLOSING_CLASS);
  mask?.classList.add(CLOSING_CLASS);
  panel?.setAttribute("aria-hidden", "true");
  if (panel?.contains(document.activeElement)) document.activeElement.blur();
  const finish = () => {
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
  window.setTimeout(finish, 260);
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
