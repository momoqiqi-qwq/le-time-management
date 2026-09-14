import * as S from "./store.js";
import { THEMES, getThemeProfile } from "./themeProfiles.js";

export { THEMES } from "./themeProfiles.js";

let transitionTimer = 0;
let systemThemeListenerBound = false;

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

function normalizeThemeMode(mode) {
  return ["system", "light", "dark"].includes(mode) ? mode : "system";
}

export function getThemeMode() {
  const st = S.getState()?.settings;
  return normalizeThemeMode(st?.themeMode);
}

/** 用户偏好 + 系统偏好 → 实际生效的亮度（"light" / "dark"）。 */
export function resolveThemeMode(mode = getThemeMode()) {
  const normalized = normalizeThemeMode(mode);
  if (normalized === "light" || normalized === "dark") return normalized;
  return prefersDark() ? "dark" : "light";
}

/**
 * 主题 id + 模式 → 最终生效的主题与色板。
 *
 * ⚠️ 这里曾经是「只要想要深色就一律返回 night」，于是深色模式下选任何主题都没有变化
 * （「切换主题没用」的根因）。现在每套主题都有自己的深色变体
 * （见 src/styles/theme-derived.css），所以深色模式下换主题会真的换。
 *
 * night 是原生深色主题：不受显示模式影响，始终用自己那套深色色板。
 */
export function resolveTheme(id, mode = getThemeMode()) {
  const requested = getThemeProfile(id).id;
  if (requested === "night") return { id: "night", dark: true, mode: "dark" };
  const dark = resolveThemeMode(mode) === "dark";
  return { id: requested, dark, mode: dark ? "dark" : "light" };
}

/** @deprecated 用 resolveTheme 拿完整信息；这里仅为兼容旧调用点。 */
export function effectiveThemeId(id, mode = getThemeMode()) {
  return resolveTheme(id, mode).id;
}

export function applyTheme(id, { animate = false } = {}) {
  const preference = getThemeMode();
  const resolved = resolveTheme(id, preference);
  const root = document.documentElement;
  if (animate && root.dataset.theme !== resolved.id) {
    root.classList.add("theme-transitioning");
    clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => root.classList.remove("theme-transitioning"), 320);
  }
  root.dataset.themePref = preference;
  root.dataset.theme = resolved.id;
  // CSS 靠 data-theme-mode 决定用浅色还是深色变体；必须是「解析后的 light/dark」，
  // 写成 "system" 会让所有深色选择器失效。
  root.dataset.themeMode = resolved.mode;
  root.style.colorScheme = resolved.mode;
  return resolved.id;
}

export function setTheme(id, options) {
  const requested = getThemeProfile(id).id;
  applyTheme(requested, options);
  S.getState().settings.theme = requested;
  S.saveNow();
  return requested;
}

export function initTheme() {
  const st = S.getState().settings;
  st.themeMode = normalizeThemeMode(st.themeMode);
  applyTheme(st.theme);
  if (!systemThemeListenerBound && typeof window !== "undefined") {
    systemThemeListenerBound = true;
    window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
      if (getThemeMode() === "system") applyTheme(S.getState().settings.theme, { animate: true });
    });
  }
}

export function setThemeMode(mode, options) {
  const st = S.getState().settings;
  st.themeMode = normalizeThemeMode(mode);
  applyTheme(st.theme, options);
  S.saveNow();
  return st.themeMode;
}
