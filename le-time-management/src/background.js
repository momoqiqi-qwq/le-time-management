import * as S from "./store.js";

export const DEFAULT_BACKGROUND = {
  enabled: false,
  image: "",
  baseColor: "#F2EFEA",
  fit: "cover",
  position: "center center",
  repeat: "no-repeat",
  attachment: "fixed",
  opacity: 100,
  blur: 0,
  brightness: 100,
  saturation: 100,
  overlayColor: "#000000",
  overlayOpacity: 0,
  panelOpacity: 94,
  panelBlur: 8,
  textShadow: false,
};

export function normalizeBackground(raw = {}) {
  const x = { ...DEFAULT_BACKGROUND, ...(raw || {}) };
  x.opacity = clamp(x.opacity, 0, 100);
  x.blur = clamp(x.blur, 0, 30);
  x.brightness = clamp(x.brightness, 40, 180);
  x.saturation = clamp(x.saturation, 0, 220);
  x.overlayOpacity = clamp(x.overlayOpacity, 0, 90);
  x.panelOpacity = clamp(x.panelOpacity, 45, 100);
  x.panelBlur = clamp(x.panelBlur, 0, 30);
  if (!["cover", "contain", "100% 100%", "auto"].includes(x.fit)) x.fit = "cover";
  if (!["no-repeat", "repeat", "repeat-x", "repeat-y"].includes(x.repeat)) x.repeat = "no-repeat";
  if (!["fixed", "scroll"].includes(x.attachment)) x.attachment = "fixed";
  return x;
}
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, Number(v) || 0)); }
function hexRgb(hex) {
  const s = String(hex || "#000000").replace("#", "");
  const v = s.length === 3 ? s.split("").map(c => c + c).join("") : s.padEnd(6, "0").slice(0, 6);
  const n = parseInt(v, 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function applyBackground(raw = null) {
  const cfg = normalizeBackground(raw || S.getState()?.settings?.background || {});
  const root = document.documentElement;
  root.dataset.customBackground = cfg.enabled ? "on" : "off";
  root.style.setProperty("--custom-bg-color", cfg.baseColor);
  root.style.setProperty("--custom-bg-image", cfg.image ? `url(${JSON.stringify(cfg.image)})` : "none");
  root.style.setProperty("--custom-bg-size", cfg.fit);
  root.style.setProperty("--custom-bg-position", cfg.position);
  root.style.setProperty("--custom-bg-repeat", cfg.repeat);
  root.style.setProperty("--custom-bg-attachment", cfg.attachment);
  root.style.setProperty("--custom-bg-opacity", String(cfg.opacity / 100));
  root.style.setProperty("--custom-bg-blur", `${cfg.blur}px`);
  root.style.setProperty("--custom-bg-brightness", `${cfg.brightness}%`);
  root.style.setProperty("--custom-bg-saturation", `${cfg.saturation}%`);
  root.style.setProperty("--custom-bg-overlay", `rgba(${hexRgb(cfg.overlayColor)},${cfg.overlayOpacity / 100})`);
  root.style.setProperty("--custom-panel-alpha", `${cfg.panelOpacity}%`);
  root.style.setProperty("--custom-panel-blur", `${cfg.panelBlur}px`);
  root.dataset.bgTextShadow = cfg.textShadow ? "on" : "off";
  return cfg;
}

export function setBackground(patch, { persist = true } = {}) {
  const st = S.getState().settings;
  st.background = normalizeBackground({ ...(st.background || {}), ...patch });
  applyBackground(st.background);
  if (persist) S.persistSoon();
  return st.background;
}

export function initBackground() {
  const st = S.getState().settings;
  st.background = normalizeBackground(st.background || {});
  applyBackground(st.background);
}
