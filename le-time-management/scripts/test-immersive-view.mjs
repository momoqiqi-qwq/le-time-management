/* 沉浸式插件视图（v0.49.0）的回归测试。
 *
 * 背景：课程表插件在手机端曾同时被两层「栏」挤压 —— APP 全局底栏（.rail，≤900px 时
 * 变成 fixed 底栏，约 53px + 安全区）+ 插件自己的高顶栏（21px 大标题 + 30 字副标题），
 * 390×844 下第 9 节就被截断。v0.49.0 改成：
 *   ① 插件在 tide.ui.registerView(...) 声明 `immersive: true`（声明式，不按插件 id 硬编码）；
 *   ② pluginHost 把它透传进 pluginViews；
 *   ③ shell.js 的 switchTo() 按当前视图是否沉浸给 .app 加/摘 `.rail-hidden`；
 *   ④ styles.css 在 ≤900px 媒体块里用两条**成对**规则响应：藏 .rail + 塌掉 .view
 *      为底栏预留的 padding-bottom（只藏不塌会留一条空白，只塌不藏底栏还在）。
 *
 * 为什么只做源码守卫而不 mock 整个 shell：真实几何（.rail 消失、菜单开合、无横向溢出、
 * 顶栏 ~52px）已由无头 Chrome 探针在 390×844 Android UA 下逐项目检通过
 * （output/preview/phone-demos/__sg-immersive-probe.html + run-android-probe.mjs，
 * 产物 output/sg-after.json / sg-offweek.json / sg-plain.json）。
 * 这里钉住的是四个最容易在重构中静默回归的接线点。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

/* ── ① 插件必须显式声明 immersive，且生成物同步（build-schedule-plugin 的 --check 也守，
 *      但这里独立断言一次：就算有人跳过 --check 直接提交，测试照样拦） ── */
const pluginUi = read("public/plugins/shiguang-schedule/ui.js");
const pluginMain = read("public/plugins/shiguang-schedule/main.js");
for (const [file, src] of [["ui.js", pluginUi], ["main.js", pluginMain]]) {
  assert.match(
    src,
    /registerView\(\{[^}]*immersive:\s*true/,
    `${file} 的 registerView 必须声明 immersive:true（丢了手机端课表就会被底栏挤压）`,
  );
}

/* ── ② pluginHost 透传：只认布尔，默认 false（插件不声明就绝不沉浸） ── */
const pluginHost = read("src/pluginHost.js");
assert.match(
  pluginHost,
  /immersive:\s*def\.immersive\s*===\s*true/,
  "pluginHost.js 必须把 def.immersive 规整为布尔后透传（undefined → false）",
);

/* ── ③ shell 按当前视图切换 .rail-hidden；判定必须绑定 pluginView.immersive，
 *      不许出现按插件 id 硬编码的写法（shiguang-schedule 字样不该出现在 shell.js） ── */
const shell = read("src/shell.js");
assert.match(
  shell,
  /classList\.toggle\(\s*["']rail-hidden["']\s*,\s*def\.pluginView\?\.immersive\s*===\s*true\s*\)/,
  "shell.js 的 switchTo 必须按 def.pluginView?.immersive === true 切换 .rail-hidden",
);
assert.doesNotMatch(
  shell,
  /shiguang-schedule/,
  "shell.js 不许硬编码插件 id（沉浸与否由插件自己声明）",
);

/* ── ④ styles.css：两条规则成对出现，且都只在 ≤900px 媒体块内。
 *      桌面端 .rail 是左侧竖栏，不占底部高度 —— 规则若泄漏到媒体块外会藏掉整根侧栏。 ── */
const styles = read("src/styles.css");

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;
assert.equal(
  occurrences(styles, ".app.rail-hidden .rail"),
  1,
  ".app.rail-hidden .rail 规则必须恰好出现一次",
);
assert.equal(
  occurrences(styles, ".app.rail-hidden .view"),
  1,
  ".app.rail-hidden .view 规则必须恰好出现一次（与藏 .rail 成对，塌掉为底栏预留的 padding）",
);

// 两条规则之间不许隔着媒体块边界（成对 = 同一块内）。
const railIdx = styles.indexOf(".app.rail-hidden .rail");
const viewIdx = styles.indexOf(".app.rail-hidden .view");
assert.ok(railIdx >= 0 && viewIdx > railIdx, "两条沉浸式规则必须都存在且 .rail 在前");
const between = styles.slice(railIdx, viewIdx);
assert.doesNotMatch(between, /@media/, "两条沉浸式规则之间不许有媒体块边界（必须成对写在一起）");

// 都必须落在 max-width:900px 媒体块内：从规则位置向前找最近的 @media，必须是 900px。
const lastMedia = (idx) => {
  const before = styles.slice(0, idx);
  const m = before.match(/@media[^{]*\{/g);
  return m ? m[m.length - 1] : null;
};
assert.match(
  lastMedia(railIdx),
  /max-width:\s*900px/,
  ".rail-hidden 规则必须在 ≤900px 媒体块内（桌面侧栏不能被藏）",
);

// .view 那条必须真的把为底栏预留的 padding 塌掉，而不是留着 var(--nav-pad)。
assert.match(
  styles.slice(viewIdx).match(/\.app\.rail-hidden \.view\s*\{[^}]*\}/)[0],
  /padding-bottom:\s*calc\(4px\s*\+\s*var\(--sab/,
  "沉浸式 .view 的 padding-bottom 必须塌到 4px + 安全区（不许保留 --nav-pad）",
);

console.log("PASS: 沉浸式插件视图（声明 / 透传 / 切换 / 成对样式且仅在窄屏媒体块内）");
