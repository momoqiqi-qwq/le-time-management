#!/usr/bin/env node
/*
 * 生成派生调色板：每套主题的「深色变体」+ 浅色主题的文字对比度兜底。
 *
 * 单一事实源：le-time-management/src/styles.css 里各主题的浅色令牌。
 * 产物：le-time-management/src/styles/theme-derived.css（自动生成，勿手改）。
 *
 * 用法（仓库根目录）：
 *   node tools/gen-theme-dark.js            写入产物
 *   node tools/gen-theme-dark.js --check    只校验产物是否与事实源一致（测试用）
 *   node tools/gen-theme-dark.js --report   额外打印对比度体检表
 */
const fs = require("fs");
const path = require("path");
const {
  parsePalettes, renderDerivedCss, renderPreviewModule, deriveDark, deriveLightFixes, previewColors, contrastRatio,
} = require("./lib/theme-tokens.js");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "le-time-management");
const SOURCE = path.join(APP, "src", "styles.css");
const TARGET = path.join(APP, "src", "styles", "theme-derived.css");
const PREVIEW = path.join(APP, "src", "themeDarkPreview.js");
const CHECK = process.argv.includes("--check");
const REPORT = process.argv.includes("--report");

const css = fs.readFileSync(SOURCE, "utf8");
const palettes = parsePalettes(css);
const ids = Object.keys(palettes);

// styles.css 里出现的顺序即输出顺序；night 是原生深色主题，不参与派生。
const cssText = "/* 本文件由 tools/gen-theme-dark.js 生成 */\n" + renderDerivedCss(palettes, { themeOrder: ids });
const previewText = renderPreviewModule(palettes, { themeOrder: ids });

if (CHECK) {
  const stale = [];
  if (!fs.existsSync(TARGET) || fs.readFileSync(TARGET, "utf8") !== cssText) stale.push("src/styles/theme-derived.css");
  if (!fs.existsSync(PREVIEW) || fs.readFileSync(PREVIEW, "utf8") !== previewText) stale.push("src/themeDarkPreview.js");
  if (stale.length) {
    console.error(`✗ ${stale.join("、")} 与 styles.css 的事实源不一致，请运行 node tools/gen-theme-dark.js 重新生成`);
    process.exit(1);
  }
  console.log(`✓ 派生调色板已同步（${ids.length - 1} 套深色变体）`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(TARGET), { recursive: true });
fs.writeFileSync(TARGET, cssText);
fs.writeFileSync(PREVIEW, previewText);
console.log(`✓ 已写入 ${path.relative(ROOT, TARGET)} 与 ${path.relative(ROOT, PREVIEW)}（${ids.length - 1} 套深色变体）`);

if (REPORT) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n" + pad("主题", 12) + pad("深色 bg / deep / sea", 26) + "对比度 浅色 → 深色（文字/底）");
  for (const id of ids) {
    if (id === "night") continue;
    const light = palettes[id];
    const dark = deriveDark(light);
    const pairs = [
      ["正文", light["--ink"], light["--panel"]],
      ["次级", light["--ink-2"], light["--panel"]],
      ["弱化", light["--ink-3"], light["--panel"]],
      ["主色", light["--deep"], light["--panel"]],
    ];
    const detail = pairs.map(([label, lf, lb], i) => {
      const df = [dark["--ink"], dark["--ink-2"], dark["--ink-3"], dark["--deep"]][i];
      return `${label} ${contrastRatio(lf, lb).toFixed(1)}→${contrastRatio(df, dark["--panel"]).toFixed(1)}`;
    }).join("  ");
    console.log(pad(id, 12) + pad(previewColors(dark).join(" "), 26) + detail);
  }
  const fixes = ids
    .filter((id) => id !== "night")
    .map((id) => [id, deriveLightFixes(palettes[id])])
    .filter(([, f]) => Object.keys(f).length);
  console.log(`\n浅色兜底：${fixes.length} 套主题有低于门槛的文字令牌`);
  for (const [id, f] of fixes) {
    console.log("  " + pad(id, 12) + Object.entries(f).map(([k, v]) => `${k} → ${v}`).join("  "));
  }
}
