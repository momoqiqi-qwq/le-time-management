import * as S from "./store.js";
import { appIcon } from "./icons.js";

const ACCENTS = ["#7C3AED", "#2563EB", "#0F766E", "#D97706", "#DB2777", "#0891B2", "#65A30D", "#EA580C"];

function overridesState() {
  const settings = S.getState().settings;
  if (!settings.pluginOverrides || typeof settings.pluginOverrides !== "object" || Array.isArray(settings.pluginOverrides)) {
    settings.pluginOverrides = {};
  }
  return settings.pluginOverrides;
}

export function pluginAccent(id) {
  let hash = 0;
  for (const char of String(id || "plugin")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

export function getPluginOverride(id) {
  const value = overridesState()[id];
  return value && typeof value === "object" ? value : {};
}

export function pluginDisplayName(id, fallback) {
  const name = String(getPluginOverride(id).name || "").trim();
  return name || fallback || id;
}

export function pluginDisplayIcon(id, title = "") {
  const icon = appIcon(id, title);
  const custom = getPluginOverride(id).icon;
  icon.classList.add("plugin-present-icon");
  icon.style.setProperty("--plugin-accent", pluginAccent(id));
  if (typeof custom === "string" && custom.startsWith("data:image/")) {
    icon.src = custom;
    icon.dataset.iconSource = "user customization";
  }
  return icon;
}

export function setPluginOverride(id, patch) {
  const table = overridesState();
  const next = { ...(table[id] || {}), ...(patch || {}) };
  if (!String(next.name || "").trim()) delete next.name;
  if (!String(next.icon || "").startsWith("data:image/")) delete next.icon;
  if (Object.keys(next).length) table[id] = next;
  else delete table[id];
  S.persistSoon();
  return next;
}

export function resetPluginOverride(id) {
  delete overridesState()[id];
  S.persistSoon();
}
