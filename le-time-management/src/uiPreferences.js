import * as S from "./store.js";
import { CUSTOM_SIZE_LIMITS } from "./windowSize.js";

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  density: "comfortable",
  textScale: 100,
  motion: "system",
  swipeNavigation: true,
  showTopStats: true,
  centerTopStats: false,
  showViewSubtitle: true,
  startupView: "last",
  // 手机底栏高度档位：紧凑 40px / 标准 46px / 宽松 54px（按钮最小高，CSS 变量消费）
  navBarSize: "standard",
  // 启动窗口大小：默认「跟随屏幕」——绝大多数显示器上都会比旧的固定 1280×820 更大。
  startupWindowMode: "auto",
  startupWindowWidth: 1440,
  startupWindowHeight: 900,
});

export const NAVBAR_SIZE_OPTIONS = Object.freeze([
  ["compact", "紧凑"],
  ["standard", "标准"],
  ["relaxed", "宽松"],
]);

export const STARTUP_VIEW_OPTIONS = Object.freeze([
  ["last", "继续上次页面"],
  ["quadrant", "四象限"],
  ["timeblock", "时间块"],
  ["inbox", "收件箱"],
  ["market", "插件中心"],
]);

/** 启动窗口大小的可选模式。具体的像素值在 windowSize.js —— 那边才是尺寸的单一事实源。 */
export const WINDOW_SIZE_MODES = Object.freeze(["auto", "compact", "standard", "large", "full", "custom"]);

export const WINDOW_SIZE_OPTIONS = Object.freeze([
  ["auto", "跟随屏幕（推荐）"],
  ["compact", "小巧 · 1120 × 720"],
  ["standard", "标准 · 1360 × 860"],
  ["large", "宽大 · 1600 × 1000"],
  ["full", "铺满可用区域"],
  ["custom", "自定义尺寸"],
]);

const DENSITIES = new Set(["comfortable", "compact"]);
const MOTIONS = new Set(["system", "full", "reduced"]);
const NAVBAR_SIZES = new Set(NAVBAR_SIZE_OPTIONS.map(([id]) => id));
const STARTUP_VIEWS = new Set(STARTUP_VIEW_OPTIONS.map(([id]) => id));
const WINDOW_SIZE_MODES_SET = new Set(WINDOW_SIZE_MODES);

function clamp(v, lo, hi) {
  const n = Number(v);
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

export function normalizeUiPreferences(raw = {}) {
  const next = { ...DEFAULT_UI_PREFERENCES, ...(raw || {}) };
  if (!DENSITIES.has(next.density)) next.density = DEFAULT_UI_PREFERENCES.density;
  if (!MOTIONS.has(next.motion)) next.motion = DEFAULT_UI_PREFERENCES.motion;
  if (!NAVBAR_SIZES.has(next.navBarSize)) next.navBarSize = DEFAULT_UI_PREFERENCES.navBarSize;
  if (!STARTUP_VIEWS.has(next.startupView)) next.startupView = DEFAULT_UI_PREFERENCES.startupView;
  next.textScale = Math.round(clamp(next.textScale, 90, 120) / 5) * 5;
  next.swipeNavigation = next.swipeNavigation !== false;
  next.showTopStats = next.showTopStats !== false;
  next.centerTopStats = next.centerTopStats === true;
  next.showViewSubtitle = next.showViewSubtitle !== false;
  if (!WINDOW_SIZE_MODES_SET.has(next.startupWindowMode)) next.startupWindowMode = DEFAULT_UI_PREFERENCES.startupWindowMode;
  next.startupWindowWidth = Math.round(clamp(next.startupWindowWidth, CUSTOM_SIZE_LIMITS.minWidth, CUSTOM_SIZE_LIMITS.maxWidth));
  next.startupWindowHeight = Math.round(clamp(next.startupWindowHeight, CUSTOM_SIZE_LIMITS.minHeight, CUSTOM_SIZE_LIMITS.maxHeight));
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
  // 注意：dataset.navbar 才生成 data-navbar；写成 dataset.navBar 会变成 data-nav-bar，
  // CSS 的 :root[data-navbar=…] 选择器就匹配不上了
  root.dataset.navbar = cfg.navBarSize;
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
