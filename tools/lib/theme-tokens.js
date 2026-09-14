/*
 * 主题调色板工具（单一事实源解析 + 深色派生）。
 *
 * 为什么需要它：
 *   styles.css 里每套主题只手写了「浅色」调色板，而历史实现里 theme.js 干脆把所有主题
 *   在深色模式下压成 `night` → 「深色模式下换主题没用」。这里把「一套浅色令牌 → 一套
 *   深色令牌」的推导固化成纯函数，由 tools/gen-theme-dark.js 生成
 *   le-time-management/src/styles/theme-dark.css，由 scripts/test-theme-contrast.mjs 校验。
 *
 * 派生目标是「文字与背景不能相似」：深色底面上的文字与强调色都按 WCAG 对比度反解亮度，
 * 不是靠肉眼挑颜色 —— 挑出来的值会被测出来。
 *
 * CommonJS，供 .js 生成器与 .mjs 测试（createRequire）共用。
 */

/* 参与派生的令牌。顺序即输出顺序。 */
const COLOR_TOKENS = [
  "--bg", "--paper", "--panel", "--ink", "--ink-2", "--ink-3", "--line", "--line-soft",
  "--deep", "--deep-2", "--sea", "--coral", "--sun", "--grape", "--mint",
  "--q1", "--q1-bg", "--q2", "--q2-bg", "--q3", "--q3-bg", "--q4", "--q4-bg",
  "--danger",
];

/* 需要「在深色底上作为文字/图标可见」的强调色 */
const ACCENT_TOKENS = ["--deep", "--sea", "--coral", "--sun", "--grape", "--mint", "--q1", "--q2", "--q3", "--q4"];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ── 颜色基础工具 ── */

function hexToRgb(input) {
  const s = String(input || "").trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

const toHex = ({ r, g, b }) =>
  "#" + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase();

function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

function hslToRgb(h, s, l) {
  const H = (((h % 360) + 360) % 360) / 360, S = clamp(s, 0, 100) / 100, L = clamp(l, 0, 100) / 100;
  if (S === 0) { const v = L * 255; return { r: v, g: v, b: v }; }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S;
  const p = 2 * L - q;
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return { r: f(H + 1 / 3) * 255, g: f(H) * 255, b: f(H - 1 / 3) * 255 };
}

const hsl = (h, s, l) => toHex(hslToRgb(h, s, l));

/* WCAG 相对亮度与对比度 */
function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 亮度反解 ──
 * 保持色相与饱和度，从 floor 往上找「与 bgHex 对比度 ≥ target」的最低亮度。
 * 这就是「文字与背景不能相似」的机械化保证：解不等式，而不是挑颜色。 */
function toneForContrast(h, s, bgHex, target, { floor = 40, ceiling = 80 } = {}) {
  let best = hsl(h, s, ceiling);
  for (let L = floor; L <= ceiling; L += 0.5) {
    const cand = hsl(h, s, L);
    if (contrastRatio(cand, bgHex) >= target) return cand;
    best = cand;
  }
  return best;
}

/* ── 解析 styles.css 的调色板 ──
 * `:root { ... }` 是默认调色板（= classic）；`:root[data-theme="x"] { ... }` 覆盖它。
 * 主题块特异性更高，且文件里先后交错的 `:root` 块不该覆盖主题块 → 一律「先铺 base 再叠主题」。 */
function parseDeclarations(body) {
  const out = {};
  const re = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].trim();
  return out;
}

function parsePalettes(cssText) {
  const base = {};
  const themes = {};
  const re = /:root(\[data-theme="([\w-]+)"\])?\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(cssText))) {
    const decls = parseDeclarations(m[3]);
    if (m[2]) themes[m[2]] = Object.assign(themes[m[2]] || {}, decls);
    else Object.assign(base, decls);
  }
  const merged = { classic: Object.assign({}, base) };
  for (const id of Object.keys(themes)) merged[id] = Object.assign({}, base, themes[id]);
  return merged;
}

/* ── 深色派生 ── */

/**
 * 由浅色调色板派生深色调色板。
 * 表面（bg/paper/panel/line）保留主题色相与一点点饱和度 —— 这是「每套主题的深色版长得不一样」的来源；
 * 文字与强调色按对比度反解亮度 —— 这是「不会看不清」的来源。
 */
function deriveDark(light, {
  accentTarget = 4.6,
  inkTarget = 9,
  ink2Target = 5.2,
  ink3Target = 3.4,
} = {}) {
  const bgRgb = hexToRgb(light["--bg"]) || { r: 255, g: 255, b: 255 };
  const { h: hue, s: bgSatRaw } = rgbToHsl(bgRgb);
  const surfSat = clamp(bgSatRaw * 0.55, 4, 20);
  const inkSat = clamp(surfSat * 0.55, 2, 11);
  const surf = (l, k = 1) => hsl(hue, clamp(surfSat * k, 0, 24), l);

  const panel = surf(15.5);

  const dark = {
    "--bg": surf(8.5),
    "--paper": surf(11.5),
    "--panel": panel,
    "--line": surf(27, 0.85),
    "--line-soft": surf(21, 0.75),
    "--ink": toneForContrast(hue, inkSat, panel, inkTarget, { floor: 88, ceiling: 97 }),
    "--ink-2": toneForContrast(hue, inkSat, panel, ink2Target, { floor: 64, ceiling: 82 }),
    "--ink-3": toneForContrast(hue, clamp(inkSat * 0.8, 2, 9), panel, ink3Target, { floor: 54, ceiling: 72 }),
    "--deep-2": hsl(hue, clamp(surfSat * 0.8, 4, 14), 5.5),
  };

  for (const key of ACCENT_TOKENS) {
    const src = hexToRgb(light[key]);
    if (!src) { dark[key] = panel; continue; }
    const { h, s } = rgbToHsl(src);
    dark[key] = toneForContrast(h, s, panel, accentTarget, { floor: 46, ceiling: 78 });
  }

  // 四象限底色：浅色版是极淡色块，深色版要变成「深底 + 亮字」
  for (const q of ["--q1", "--q2", "--q3", "--q4"]) {
    const src = hexToRgb(light[q]);
    if (!src) continue;
    const { h, s } = rgbToHsl(src);
    dark[q + "-bg"] = hsl(h, clamp(s * 0.4, 8, 26), 15.5);
  }

  // 强调色底上的文字：深色模式下强调色都被提亮，文字必须压暗，否则白字糊在亮底上
  const deepHsl = rgbToHsl(hexToRgb(dark["--deep"]) || { r: 128, g: 128, b: 128 });
  dark["--on-deep"] = hsl(deepHsl.h, clamp(deepHsl.s * 0.5, 10, 40), 11);
  dark["--on-accent"] = hsl(hue, clamp(surfSat * 0.6, 4, 18), 10);

  // 危险 / 错误文字色。历史实现里这几处是硬编码的 #B03535 / #c24141：
  // 浅色下够用，但深色面板上只有 1.4~1.9:1（右键「移除」、插件市场报错都看不见）。
  // 与 q1 同色相，按深色面板反解亮度。
  const dangerSrc = hexToRgb(light["--q1"]) || hexToRgb(light["--coral"]) || { r: 196, g: 65, b: 65 };
  const dangerHsl = rgbToHsl(dangerSrc);
  dark["--danger"] = toneForContrast(dangerHsl.h, dangerHsl.s, panel, 5.0, { floor: 50, ceiling: 80 });

  dark["--shadow"] = "0 1px 2px rgba(0, 0, 0, .32), 0 2px 10px rgba(0, 0, 0, .24)";
  dark["--shadow-lg"] = "0 18px 46px rgba(0, 0, 0, .55)";
  return dark;
}

/* ── 浅色调色板的可读性兜底 ──
 * 浅色主题是手写的，写松了就会出现「浅灰字压在近白底上」（实测 --ink-3 最低只有 2.2:1）。
 * 这里只对低于阈值的文字令牌做「同色相压暗」，写到产物里覆盖原值；达标的主题不产生任何输出，
 * 所以不会把作者调好的配色整体改掉。 */
const LIGHT_FLOOR = { "--ink-2": 4.5, "--ink-3": 3.0, "--deep": 4.5 };

function darkenForContrast(hex, backgrounds, target, { floor = 18, ceiling = 92 } = {}) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);
  const worst = (cand) => Math.min(...backgrounds.map((bg) => contrastRatio(cand, bg)));
  if (worst(hex) >= target) return null;
  for (let L = Math.min(ceiling, l); L >= floor; L -= 0.5) {
    const cand = hsl(h, s, L);
    if (worst(cand) >= target) return cand;
  }
  return hsl(h, s, floor);
}

function deriveLightFixes(light) {
  const backgrounds = [light["--panel"], light["--bg"]].filter(Boolean);
  const fixes = {};
  for (const [key, target] of Object.entries(LIGHT_FLOOR)) {
    const fixed = darkenForContrast(light[key], backgrounds, target);
    if (fixed) fixes[key] = fixed;
  }
  return fixes;
}

/* 深色版预览色（设置页色块用） */
const previewColors = (tokens) => [tokens["--bg"], tokens["--deep"], tokens["--sea"] || tokens["--coral"]];

/** 设置页的深色色块需要真实的深色预览色；CSS 里的值取不到（:root 上的变量不能靠探针元素读），
 *  所以由生成器额外吐一个数据模块，保持与 CSS 同源。 */
function renderPreviewModule(lightPalettes, { themeOrder = [] } = {}) {
  const ids = (themeOrder.length ? themeOrder : Object.keys(lightPalettes)).filter((id) => lightPalettes[id]);
  const entries = ids.map((id) => {
    const colors = id === "night" ? previewColors(lightPalettes[id]) : previewColors(deriveDark(lightPalettes[id]));
    return `  ${JSON.stringify(id)}: [${colors.map((c) => `"${c}"`).join(", ")}],`;
  });
  return [
    "/* 本文件由 tools/gen-theme-dark.js 生成，请勿手改。 */",
    "",
    "// 每套主题「深色模式下」的预览色 [背景, 主色, 强调色]，供设置页色块使用。",
    "export const DARK_PREVIEW = Object.freeze({",
    ...entries,
    "});",
    "",
  ].join("\n");
}

function renderDerivedCss(lightPalettes, { themeOrder = [] } = {}) {
  const ids = (themeOrder.length ? themeOrder : Object.keys(lightPalettes)).filter((id) => lightPalettes[id]);
  const themes = ids.filter((id) => id !== "night");
  const lines = [
    "/* ═══════════════════════════════════════════════════════════",
    "   Le时间管理 · 派生调色板【自动生成，请勿手改】",
    "",
    "   生成：node tools/gen-theme-dark.js        校验：node tools/gen-theme-dark.js --check",
    "   事实源：src/styles.css 各主题的浅色令牌 + tools/lib/theme-tokens.js 的派生规则。",
    "",
    "   第一节 · 深色变体：每套主题都有自己的深色版，所以「深色模式下切换主题」会真的变；",
    "     生效条件 <html data-theme=\"<主题>\" data-theme-mode=\"dark\">。",
    "     night 是原生深色主题（色板本身即深色），不参与派生。",
    "   第二节 · 浅色兜底：只修正低于 WCAG 门槛的文字令牌（见 LIGHT_FLOOR），达标的不出现。",
    "   ═══════════════════════════════════════════════════════════ */",
    ':root[data-theme-mode="dark"] { color-scheme: dark; }',
    "",
    "/* ── 第一节 · 每套主题的深色变体 ── */",
    "",
  ];
  for (const id of themes) {
    const dark = deriveDark(lightPalettes[id]);
    const pairs = COLOR_TOKENS.map((key) => `${key}: ${dark[key]}`);
    pairs.push(`--on-deep: ${dark["--on-deep"]}`, `--on-accent: ${dark["--on-accent"]}`);
    lines.push(`:root[data-theme="${id}"][data-theme-mode="dark"] {`);
    lines.push("  " + pairs.join("; ") + ";");
    lines.push(`  --shadow: ${dark["--shadow"]}; --shadow-lg: ${dark["--shadow-lg"]};`);
    lines.push("}");
    lines.push("");
  }

  const lightFixes = ids
    .filter((id) => id !== "night")
    .map((id) => [id, deriveLightFixes(lightPalettes[id])])
    .filter(([, fixes]) => Object.keys(fixes).length);
  lines.push("/* ── 第二节 · 浅色可读性兜底（仅列出低于门槛的令牌） ── */", "");
  if (!lightFixes.length) lines.push("/* 所有浅色主题的文字对比度均已达标，无需兜底。 */", "");
  for (const [id, fixes] of lightFixes) {
    const pairs = Object.entries(fixes).map(([key, value]) => `${key}: ${value}`);
    lines.push(`:root[data-theme="${id}"] { ${pairs.join("; ")}; }`);
  }
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  COLOR_TOKENS,
  ACCENT_TOKENS,
  LIGHT_FLOOR,
  deriveDark,
  deriveLightFixes,
  renderPreviewModule,
  toneForContrast,
  parsePalettes,
  previewColors,
  renderDerivedCss,
  contrastRatio,
  relativeLuminance,
  hexToRgb,
  rgbToHsl,
  hslToHex: hsl,
};
