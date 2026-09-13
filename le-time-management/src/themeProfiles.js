const profile = (id, name, note, colors, colorScheme = "light") => Object.freeze({
  id,
  name,
  note,
  colors: Object.freeze(colors),
  colorScheme,
});

/**
 * Theme metadata is kept outside the DOM layer so settings, startup and tests
 * all use the same source of truth. CSS variables live in styles.css.
 */
export const THEMES = Object.freeze([
  profile("classic", "经典 Le时间管理", "温暖纸面，适合日常任务管理", ["#F2EFEA", "#0F4C5C", "#FF6B6B"]),
  profile("fresh", "清爽海盐", "更亮、更轻，长时间看也不累", ["#ECF7F5", "#106C72", "#28BFA9"]),
  profile("night", "夜间护眼", "低亮度深色界面，适合夜晚使用", ["#111820", "#37A6A0", "#F0B84C"], "dark"),
  profile("ocean", "深海蓝", "冷静的蓝色系，适合学习与代码场景", ["#EAF1F8", "#174C72", "#277DA1"]),
  profile("sakura", "樱花粉", "柔和暖粉，降低大面积白色的刺眼感", ["#FBF0F3", "#8A4E65", "#E66F89"]),
  profile("forest", "松林绿", "低饱和自然绿，适合长时间规划", ["#EDF3EE", "#355E4A", "#4C9272"]),
  profile("lavender", "暮光紫", "轻紫与蓝灰搭配，视觉层级更明显", ["#F1EFF8", "#58507B", "#8066B2"]),
  profile("mono", "极简灰", "低彩度、高信息密度的中性主题", ["#EFEFEE", "#40484C", "#607D8B"]),
  profile("chatgpt", "ChatGPT 白瓷", "克制的中性色与翡翠绿，专注清晰行动", ["#F7F7F5", "#10A37F", "#202123"]),
  profile("claude", "Claude 手稿", "温暖纸色与陶土橙，适合阅读与深度思考", ["#F4F0E8", "#C15F3C", "#2D2926"]),
  profile("shadcn", "Shadcn 锌灰", "中性锌灰与近黑主按钮，shadcn/ui 的克制风格", ["#FAFAFA", "#18181B", "#3B82F6"]),
]);

const THEME_BY_ID = new Map(THEMES.map((item) => [item.id, item]));

export function getThemeProfile(id) {
  return THEME_BY_ID.get(id) || THEME_BY_ID.get("classic");
}
