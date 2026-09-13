import { el } from "./ui.js";
import { BUILTIN_PLUGINS } from "./pluginCatalog.js";

// Icons8 / iGoutu iOS Filled icon set.
// 每个入口使用独立强调色，避免侧栏图标全部显示成黑色。
const ICONS8 = {
  quadrant: ["four-squares", "grid-2"],
  timeblock: ["clock"],
  inbox: ["inbox"],
  market: ["puzzle", "puzzle-piece"],
  settings: ["settings"],
  capture: ["inbox"],
  "shiguang-schedule": ["calendar", "calendar--v1"],
  "web-collector": ["bookmark-ribbon", "bookmark"],
  "school-notice": ["school", "classroom"],
  pomodoro: ["hourglass", "time-machine"],
  "weekly-report": ["bar-chart", "combo-chart--v1"],
  "gx-news": ["trophy"],
  "chaoxing-notify": ["graduation-cap", "student-center"],
  "cppu-notify": ["university", "school-building"],
  "wechat-push": ["wechat", "comments"],
  "cn-holiday": ["calendar", "calendar--v1"],
  "exam-calendar": ["test-passed", "calendar-plus"],
};


const MANIFEST_ICON_KEYS = Object.fromEntries(BUILTIN_PLUGINS.map((plugin) => [plugin.id, plugin.icon || plugin.faIcon || "puzzle-piece"]));

const ICON_COLORS = {
  quadrant: "4F46E5",
  timeblock: "0EA5E9",
  inbox: "F59E0B",
  market: "8B5CF6",
  settings: "64748B",
  capture: "F59E0B",
  "shiguang-schedule": "2563EB",
  "web-collector": "D97706",
  "school-notice": "0F766E",
  pomodoro: "E11D48",
  "weekly-report": "7C3AED",
  "gx-news": "CA8A04",
  "chaoxing-notify": "16A34A",
  "cppu-notify": "475569",
  "wechat-push": "22C55E",
  "cn-holiday": "DB2777",
  "exam-calendar": "EA580C",
};

function iconUrl(name, color) {
  return `https://img.icons8.com/ios-filled/50/${color}/${name}.png`;
}

export function appIcon(key, title = "") {
  const manifestIcon = MANIFEST_ICON_KEYS[key];
  const candidates = manifestIcon ? [manifestIcon, ...(ICONS8[key] || [])] : (ICONS8[key] || ICONS8.market);
  const color = ICON_COLORS[key] || ICON_COLORS.market;
  let index = manifestIcon ? -1 : 0;
  let usingFallback = false;
  const img = el("img", {
    class: "app-icon icons8-app-icon",
    src: manifestIcon ? `/icons/plugins/${key}.png` : iconUrl(candidates[index], color),
    alt: title || "",
    title: title || null,
    loading: "eager",
    decoding: "async",
    draggable: "false",
    "data-icon-source": manifestIcon ? "three-platform synced plugin PNG" : "Icons8 iOS Filled",
    "data-icon-key": manifestIcon || candidates[0],
    "data-icon-color": manifestIcon ? null : `#${color}`,
  });
  img.addEventListener("error", () => {
    index += 1;
    if (index < candidates.length) {
      img.src = iconUrl(candidates[index], color);
      return;
    }
    if (!usingFallback && key !== "market") {
      usingFallback = true;
      img.src = iconUrl(ICONS8.market[0], ICON_COLORS.market);
      return;
    }
    img.style.visibility = "hidden";
  }, { once: false });
  return img;
}
