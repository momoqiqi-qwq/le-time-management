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

export function effectiveThemeId(id, mode = getThemeMode()) {
  const normalized = normalizeThemeMode(mode);
  const wantsDark = normalized === "dark" || (normalized === "system" && prefersDark());
  if (wantsDark) return "night";
  return id === "night" ? "classic" : id;
}

export function applyTheme(id, { animate = false } = {}) {
  const mode = getThemeMode();
  const selected = getThemeProfile(effectiveThemeId(id, mode));
  const root = document.documentElement;
  if (animate && root.dataset.theme !== selected.id) {
    root.classList.add("theme-transitioning");
    clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => root.classList.remove("theme-transitioning"), 320);
  }
  root.dataset.themeMode = mode;
  root.dataset.theme = selected.id;
  root.style.colorScheme = selected.colorScheme;
  return selected.id;
}

export function setTheme(id, options) {
  const requested = getThemeProfile(id).id;
  applyTheme(requested, options);
  S.getState().settings.theme = requested === "night" ? "classic" : requested;
  S.saveNow();
  return S.getState().settings.theme;
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
