import { DARK_PREVIEW } from "./themeDarkPreview.js";

const profile = (id, name, note, colors, colorScheme = "light") => Object.freeze({
  id,
  name,
  note,
  colors: Object.freeze(colors),
  /** 深色模式下的预览色。由 tools/gen-theme-dark.js 按浅色调色板派生，与 theme-derived.css 同源。 */
  darkColors: Object.freeze(DARK_PREVIEW[id] || colors),
  colorScheme,
});

/**
 * Theme metadata is kept outside the DOM layer so settings, startup and tests
 * all use the same source of truth. CSS variables live in styles.css；
 * 每套主题的深色变体在 styles/theme-derived.css（同样是生成的）。
 */
export const THEMES = Object.freeze([
  profile("classic", "经典 Le时间管理", "温暖纸面，适合日常任务管理", ["#F2EFEA", "#0F4C5C", "#FF6B6B"]),
  profile("fresh", "清爽海盐", "更亮、更轻，长时间看也不累", ["#ECF7F5", "#106C72", "#28BFA9"]),
  profile("night", "夜间护眼", "低亮度深色界面；本身就是深色主题，不受显示模式影响", ["#111820", "#37A6A0", "#F0B84C"], "dark"),
  profile("ocean", "深海蓝", "冷静的蓝色系，适合学习与代码场景", ["#EAF1F8", "#174C72", "#277DA1"]),
  profile("sakura", "樱花粉", "柔和暖粉，降低大面积白色的刺眼感", ["#FBF0F3", "#8A4E65", "#E66F89"]),
  profile("forest", "松林绿", "低饱和自然绿，适合长时间规划", ["#EDF3EE", "#355E4A", "#4C9272"]),
  profile("lavender", "暮光紫", "轻紫与蓝灰搭配，视觉层级更明显", ["#F1EFF8", "#58507B", "#8066B2"]),
  profile("mono", "极简灰", "低彩度、高信息密度的中性主题", ["#EFEFEE", "#40484C", "#607D8B"]),
  profile("chatgpt", "ChatGPT 白瓷", "克制的中性色与翡翠绿，专注清晰行动", ["#F7F7F5", "#10A37F", "#202123"]),
  profile("claude", "Claude 手稿", "温暖纸色与陶土橙，适合阅读与深度思考", ["#F4F0E8", "#C15F3C", "#2D2926"]),
  profile("shadcn", "Shadcn 锌灰", "中性锌灰与近黑主按钮，shadcn/ui 的克制风格", ["#FAFAFA", "#18181B", "#3B82F6"]),
  profile("celadon", "青瓷釉色", "南宋龙泉窑的粉青釉，安静温润，久看不腻", ["#EDF2EE", "#3D6B5B", "#C96A5E"]),
  profile("dunhuang", "敦煌暮色", "莫高窟矿物颜料：石青主色、朱砂点缀、沙金纸面", ["#F4E8D5", "#2F5D68", "#C0452E"]),
  profile("blueprint", "晒图蓝", "蓝晒制图纸的普鲁士蓝与安全橙，适合学习与工程场景", ["#EEF3F9", "#1D4E89", "#E15A33"]),
  profile("citrus", "蜜柑汽水", "夏日下午的橘子汽水，明亮有元气", ["#FFF6E9", "#CE5F05", "#2B8AC4"]),
  profile("frost", "极光晨雾", "极地雪原与冻雾蓝，冷静克制的开发者配色", ["#ECEFF4", "#5E81AC", "#8FBC72"]),
]);

const THEME_BY_ID = new Map(THEMES.map((item) => [item.id, item]));

export function getThemeProfile(id) {
  return THEME_BY_ID.get(id) || THEME_BY_ID.get("classic");
}
