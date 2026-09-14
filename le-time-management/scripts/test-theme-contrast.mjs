/*
 * 主题对比度回归测试。
 *
 * 面向两条用户可见的诉求：
 *   ① 「深色模式下切换主题没用」→ 每套主题都必须有自己的深色变体，且彼此可区分。
 *   ② 「确保字体和背景颜色不能相似」→ 浅色 / 深色两套色板里，文字与底色的 WCAG 对比度都要过门槛。
 *
 * 事实源：src/styles.css（浅色）+ src/styles/theme-derived.css（派生，生成物）。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { THEMES, getThemeProfile } from "../src/themeProfiles.js";
import { DARK_PREVIEW } from "../src/themeDarkPreview.js";

const require = createRequire(import.meta.url);
const {
  parsePalettes, renderDerivedCss, renderPreviewModule, contrastRatio,
  relativeLuminance, hexToRgb, deriveDark,
} = require("../../tools/lib/theme-tokens.js");

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const stylesCss = read("../src/styles.css");
const derivedCss = read("../src/styles/theme-derived.css");

/* ── 1. 生成物必须与事实源一致（防止改了 styles.css 忘了重新生成） ── */
const light = parsePalettes(stylesCss);
const expectedCss = "/* 本文件由 tools/gen-theme-dark.js 生成 */\n" + renderDerivedCss(light, { themeOrder: Object.keys(light) });
assert.equal(
  derivedCss, expectedCss,
  "styles/theme-derived.css 与 styles.css 不一致：请运行 node tools/gen-theme-dark.js",
);
const previewSrc = read("../src/themeDarkPreview.js");
assert.equal(
  previewSrc, renderPreviewModule(light, { themeOrder: Object.keys(light) }),
  "themeDarkPreview.js 与 styles.css 不一致：请运行 node tools/gen-theme-dark.js",
);

/* ── 2. 解析出「实际生效」的两套色板 ── */
function blocksBy(cssText, pattern) {
  const out = {};
  const re = new RegExp(pattern, "g");
  let m;
  while ((m = re.exec(cssText))) {
    const decls = {};
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decls[d[1]] = d[2].trim();
    out[m[1]] = Object.assign(out[m[1]] || {}, decls);
  }
  return out;
}

const darkOverrides = blocksBy(derivedCss, ':root\\[data-theme="([\\w-]+)"\\]\\[data-theme-mode="dark"\\]\\s*\\{([^}]*)\\}');
const lightFixes = blocksBy(derivedCss, ':root\\[data-theme="([\\w-]+)"\\]\\s*\\{([^}]*)\\}');
const themeIds = Object.keys(light);

/* ── 3. 覆盖率：除 night（原生深色）外，每套主题都要有深色变体 ── */
for (const id of themeIds) {
  if (id === "night") continue;
  assert.ok(darkOverrides[id], `${id} 缺少深色变体：深色模式下换主题会没有反应`);
  const missing = ["--bg", "--panel", "--ink", "--ink-2", "--ink-3", "--deep", "--on-deep", "--on-accent"]
    .filter((k) => !darkOverrides[id][k]);
  assert.deepEqual(missing, [], `${id} 的深色变体缺少令牌：${missing.join(", ")}`);
}
for (const id of Object.keys(darkOverrides)) {
  assert.ok(light[id], `theme-derived.css 里有 styles.css 不存在的主题：${id}`);
}

/* ── 4. 对比度门槛 ── */
const LIGHT_MIN = { "--ink": 7, "--ink-2": 4.5, "--ink-3": 3.0, "--deep": 4.5, "--danger": 4.5 };
const DARK_MIN = { "--ink": 7, "--ink-2": 4.5, "--ink-3": 3.0, "--deep": 4.5, "--danger": 4.5 };
const DARK_ACCENTS = ["--sea", "--coral", "--sun", "--grape", "--mint", "--q1", "--q2", "--q3", "--q4"];

const failures = [];
const record = (where, label, fg, bg, need) => {
  const got = contrastRatio(fg, bg);
  if (got + 0.01 < need) failures.push(`${where} ${label} 对比度 ${got.toFixed(2)} < ${need}（${fg} on ${bg}）`);
  return got;
};

const darkPalettes = {};
for (const id of themeIds) {
  const lightTokens = Object.assign({}, light[id], lightFixes[id] || {});
  const darkTokens = id === "night" ? Object.assign({}, lightTokens) : darkOverrides[id];

  // 浅色：文字/底
  for (const [token, need] of Object.entries(LIGHT_MIN)) {
    if (!lightTokens[token]) continue;
    record(`${id}(浅色)`, token, lightTokens[token], lightTokens["--panel"], need);
    record(`${id}(浅色)`, `${token}/bg`, lightTokens[token], lightTokens["--bg"], need);
  }

  // 深色：文字/底
  for (const [token, need] of Object.entries(DARK_MIN)) {
    record(`${id}(深色)`, token, darkTokens[token], darkTokens["--panel"], need);
    record(`${id}(深色)`, `${token}/bg`, darkTokens[token], darkTokens["--bg"], need);
  }
  // 深色：强调色当文字用（标签、图标、链接）
  for (const token of DARK_ACCENTS) {
    if (!darkTokens[token]) continue;
    record(`${id}(深色)`, token, darkTokens[token], darkTokens["--panel"], 4.5);
  }
  // 深色：强调色当按钮底 → 上面的字必须能看
  record(`${id}(深色)`, "--on-deep", darkTokens["--on-deep"], darkTokens["--deep"], 4.5);
  for (const token of ["--sea", "--coral", "--sun", "--grape", "--mint", "--q4"]) {
    if (darkTokens[token]) record(`${id}(深色)`, `--on-accent/${token}`, darkTokens["--on-accent"], darkTokens[token], 3.0);
  }
  // 强调色当按钮底 → 上面的字必须能看（浅色主题用白字，night 与深色版用深字）
  record(`${id}(浅色)`, "--on-deep/--deep", lightTokens["--on-deep"], lightTokens["--deep"], 3.0);

  // 深色模式真的得是深色，浅色模式真的得是浅色。night 是原生深色主题，不参与这组判断。
  if (id !== "night") {
    assert.ok(relativeLuminance(darkTokens["--bg"]) < 0.06, `${id} 的深色 --bg 不够深：${darkTokens["--bg"]}`);
    assert.ok(relativeLuminance(darkTokens["--panel"]) < 0.10, `${id} 的深色 --panel 不够深：${darkTokens["--panel"]}`);
    assert.ok(relativeLuminance(lightTokens["--bg"]) > 0.6, `${id} 的浅色 --bg 不够浅：${lightTokens["--bg"]}`);
    darkPalettes[id] = { bg: darkTokens["--bg"], deep: darkTokens["--deep"] };
  }
  assert.ok(hexToRgb(lightTokens["--ink"]) && hexToRgb(darkTokens["--ink"]), `${id} 的 --ink 必须是十六进制`);
}

assert.deepEqual(failures, [], `对比度不达标：\n  ${failures.join("\n  ")}`);

/* ── 5. 每套主题的深色版必须彼此可区分（否则「换主题」等于没换） ── */
const fingerprints = new Map();
for (const [id, v] of Object.entries(darkPalettes)) {
  const key = `${v.bg}|${v.deep}`;
  assert.ok(!fingerprints.has(key), `${id} 的深色配色与 ${fingerprints.get(key)} 完全相同，换主题看不出区别`);
  fingerprints.set(key, id);
}
assert.equal(fingerprints.size, Object.keys(darkPalettes).length);

/* ── 6. 元数据侧：每套主题都要有深色预览色 ── */
for (const theme of THEMES) {
  assert.equal(theme.darkColors.length, 3, `${theme.id} 需要 3 个深色预览色`);
  assert.ok(Object.isFrozen(theme.darkColors), `${theme.id} 的深色预览色必须是冻结的`);
  assert.deepEqual([...theme.darkColors], DARK_PREVIEW[theme.id]);
}
assert.equal(getThemeProfile("night").darkColors.length, 3);

/* ── 7. 源码守卫：不许再把深色一律压成 night，也不许把深色规则绑死在 night 上 ── */
const themeSrc = read("../src/theme.js");
assert.doesNotMatch(themeSrc, /wantsDark\s*\)\s*return\s*"night"/, 'theme.js 不许再把所有主题在深色模式下压成 night');
assert.match(themeSrc, /root\.dataset\.themeMode\s*=\s*resolved\.mode/, "theme.js 必须把「解析后的 light/dark」写进 data-theme-mode");
assert.match(themeSrc, /resolveThemeMode/, "theme.js 需要 resolveThemeMode 处理「跟随系统」");

const darkRulesOnNight = [...stylesCss.matchAll(/:root\[data-theme="night"\][^{]*\{/g)].map((m) => m[0]);
assert.equal(darkRulesOnNight.length, 1,
  `除 night 自身的色板外，不应再有只对 night 生效的深色规则（否则换主题 / 跟随系统时会漏）：\n  ${darkRulesOnNight.join("\n  ")}`);
assert.match(stylesCss, /:root\[data-theme-mode="dark"\] input/, "输入控件的深色覆盖必须按 data-theme-mode 生效");

/* 危险色必须是令牌，不许再硬编码。
 * 历史坑：.plug-info .perr / .popmenu button.warn / .plugin-context-item.danger / .btn.danger
 * 写死 #B03535 / #c24141，深色面板上只有 1.4~1.9:1（右键「移除」、插件市场报错看不清）。 */
const hardcodedDanger = [...stylesCss.matchAll(/^[^\n]*color:\s*#(?:B03535|c24141)\b[^\n]*$/gim)].map((m) => m[0].trim());
assert.deepEqual(hardcodedDanger, [],
  `不许再硬编码危险色，请改用 var(--danger)：\n  ${hardcodedDanger.join("\n  ")}`);
assert.match(stylesCss, /\.plugin-context-item\.danger\s*\{\s*color:\s*var\(--danger\)/,
  "右键菜单的「移除」项必须用 var(--danger)");
assert.match(stylesCss, /\.popmenu button\.warn\s*\{\s*color:\s*var\(--danger\)/,
  "弹出菜单的告警项必须用 var(--danger)");

/* ── 8. deriveDark 是纯函数：同样输入必须同样输出 ── */
assert.deepEqual(deriveDark(light.classic), darkOverrides.classic);

console.log(`PASS: 主题对比度（${themeIds.length} 套主题 × 浅/深两套色板，均过 WCAG 门槛，深色版互不相同）`);
