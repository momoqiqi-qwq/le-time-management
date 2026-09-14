import { el } from "./ui.js";
import { BUILTIN_PLUGINS } from "./pluginCatalog.js";

// Icons8 / iGoutu 图标源，分两套风格（来源台账见 public/icons/plugins/ATTRIBUTION.md）：
//  · 主导航：iOS Filled 单色剪影 + 每项独立强调色，URL 形如 ios-filled/50/<色>/<slug>.png；
//  · 插件图标：Color 彩色风格（内置插件用随包 PNG，读不到才回落同风格 CDN 直链），
//    URL 形如 img.icons8.com/color/96/<slug>.png。
const NAV_ICONS8 = {
  quadrant: ["four-squares", "grid-2"],
  timeblock: ["clock"],
  inbox: ["inbox"],
  market: ["puzzle", "puzzle-piece"],
  settings: ["settings"],
  capture: ["inbox"],
};

// slug 与 public/icons/plugins/<插件ID>.png 一一对应（由 tools/gen-plugin-icons.py 生成）。
const PLUGIN_ICONS8 = {
  "shiguang-schedule": ["timetable", "calendar"],
  "web-collector": ["bookmark-ribbon", "bookmark"],
  "school-notice": ["school", "classroom"],
  pomodoro: ["tomato", "hourglass"],
  "weekly-report": ["statistics", "combo-chart--v1"],
  "gx-news": ["trophy"],
  "chaoxing-notify": ["books", "graduation-cap"],
  "cppu-notify": ["university", "school-building"],
  // Color 风格没有微信标志，回落绿色对话气泡（随包 PNG 用的是 3d-fluency 的微信标志）。
  "wechat-push": ["speech-bubble", "chat"],
  "cn-holiday": ["lantern", "calendar"],
  "exam-calendar": ["test-passed", "calendar-plus"],
  "plugin-guide": ["help", "question-mark"],
};

const ICONS8 = { ...NAV_ICONS8, ...PLUGIN_ICONS8 };

const MANIFEST_ICON_KEYS = Object.fromEntries(BUILTIN_PLUGINS.map((plugin) => [plugin.id, plugin.icon || plugin.faIcon || "puzzle-piece"]));

// 仅主导航（iOS Filled）需要强调色，插件图标是彩色 PNG，不再染色。
const ICON_COLORS = {
  quadrant: "4F46E5",
  timeblock: "0EA5E9",
  inbox: "F59E0B",
  market: "8B5CF6",
  settings: "64748B",
  capture: "F59E0B",
};

function iosFilledUrl(name, color) {
  return `https://img.icons8.com/ios-filled/50/${color}/${name}.png`;
}

function colorUrl(name) {
  return `https://img.icons8.com/color/96/${name}.png`;
}

export function appIcon(key, title = "") {
  const manifestIcon = MANIFEST_ICON_KEYS[key];
  const isNav = Boolean(NAV_ICONS8[key]);
  const candidates = manifestIcon ? [manifestIcon, ...(ICONS8[key] || [])] : (ICONS8[key] || ICONS8.market);
  const color = ICON_COLORS[key] || ICON_COLORS.market;
  const urlOf = (name) => (isNav ? iosFilledUrl(name, color) : colorUrl(name));
  let index = manifestIcon ? -1 : 0;
  let usingFallback = false;
  const img = el("img", {
    class: "app-icon icons8-app-icon",
    src: manifestIcon ? `/icons/plugins/${key}.png` : urlOf(candidates[index]),
    alt: title || "",
    title: title || null,
    loading: "eager",
    decoding: "async",
    draggable: "false",
    "data-icon-source": manifestIcon ? "bundled plugin PNG (Icons8 Color)" : isNav ? "Icons8 iOS Filled" : "Icons8 Color",
    "data-icon-key": manifestIcon || candidates[0],
    "data-icon-color": isNav ? `#${color}` : null,
  });
  img.addEventListener("error", () => {
    index += 1;
    if (index < candidates.length) {
      img.src = urlOf(candidates[index]);
      return;
    }
    if (!usingFallback && key !== "market") {
      usingFallback = true;
      img.src = colorUrl(ICONS8.market[0]);
      return;
    }
    img.style.visibility = "hidden";
  }, { once: false });
  return img;
}
