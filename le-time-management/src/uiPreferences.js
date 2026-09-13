import * as S from "./store.js";

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  density: "comfortable",
  textScale: 100,
  motion: "system",
  swipeNavigation: true,
  showTopStats: true,
  centerTopStats: false,
  showViewSubtitle: true,
  startupView: "last",
});

export const STARTUP_VIEW_OPTIONS = Object.freeze([
  ["last", "继续上次页面"],
  ["quadrant", "四象限"],
  ["timeblock", "时间块"],
  ["inbox", "收件箱"],
  ["market", "插件中心"],
]);

const DENSITIES = new Set(["comfortable", "compact"]);
const MOTIONS = new Set(["system", "full", "reduced"]);
const STARTUP_VIEWS = new Set(STARTUP_VIEW_OPTIONS.map(([id]) => id));

function clamp(v, lo, hi) {
  const n = Number(v);
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

export function normalizeUiPreferences(raw = {}) {
  const next = { ...DEFAULT_UI_PREFERENCES, ...(raw || {}) };
  if (!DENSITIES.has(next.density)) next.density = DEFAULT_UI_PREFERENCES.density;
  if (!MOTIONS.has(next.motion)) next.motion = DEFAULT_UI_PREFERENCES.motion;
  if (!STARTUP_VIEWS.has(next.startupView)) next.startupView = DEFAULT_UI_PREFERENCES.startupView;
  next.textScale = Math.round(clamp(next.textScale, 90, 120) / 5) * 5;
  next.swipeNavigation = next.swipeNavigation !== false;
  next.showTopStats = next.showTopStats !== false;
  next.centerTopStats = next.centerTopStats === true;
  next.showViewSubtitle = next.showViewSubtitle !== false;
  return next;
}

export function getUiPreferences() {
  const st = S.getState()?.settings;
  if (!st) return normalizeUiPreferences();
  st.ui = normalizeUiPreferences(st.ui || {});
  return st.ui;
}

export function applyUiPreferences(raw = null) {
  const cfg = normalizeUiPreferences(raw || getUiPreferences());
  if (typeof document === "undefined") return cfg;
  const root = document.documentElement;
  root.dataset.uiDensity = cfg.density;
  root.dataset.uiMotion = cfg.motion;
  root.dataset.showTopStats = cfg.showTopStats ? "on" : "off";
  root.dataset.centerTopStats = cfg.centerTopStats ? "on" : "off";
  root.dataset.showViewSubtitle = cfg.showViewSubtitle ? "on" : "off";
  root.style.setProperty("--ui-text-scale", String(cfg.textScale / 100));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tide:ui-preferences-changed", { detail: { ...cfg } }));
  }
  return cfg;
}

export function setUiPreferences(patch, { persist = true } = {}) {
  const st = S.getState().settings;
  st.ui = normalizeUiPreferences({ ...(st.ui || {}), ...(patch || {}) });
  applyUiPreferences(st.ui);
  if (persist) S.persistSoon();
  return st.ui;
}

export function resetUiPreferences() {
  const st = S.getState().settings;
  st.ui = { ...DEFAULT_UI_PREFERENCES };
  applyUiPreferences(st.ui);
  S.persistSoon();
  return st.ui;
}

export function initUiPreferences() {
  const st = S.getState().settings;
  st.ui = normalizeUiPreferences(st.ui || {});
  applyUiPreferences(st.ui);
  return st.ui;
}
