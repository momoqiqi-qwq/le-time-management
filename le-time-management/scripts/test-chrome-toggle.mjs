import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles.css");
const shell = read("../src/shell.js");

/* ───────────── v0.52.0 回归：APK 沉浸式外壳 ─────────────
   需求（用户原话）：
   ① 「apk 默认上下栏都隐藏起来，只有点 3 个点图标的菜单键才会显示出来」
   ② 「距离手机状态栏合适的距离」
   ③ 「apk 每一页都添加返回按钮，在适合的位置，要小」

   实现：.app 挂 .chrome-shown ⇔ 顶栏 + 底栏显示；默认不挂 ⇒ 两栏 display:none。
   右上角 .chrome-toggle（⋮/✕）呼出与收回；左上角 .mobile-back 与顶栏返回键共用
   canGoBack() 状态。收起态 .view 自己补 --sat 顶部安全距离（悬浮键不吃进内容）。 */

// ── ① 默认收起：≤900px 里两栏都藏 ──
assert.match(css, /\.app:not\(\.chrome-shown\)\s+\.topbar\s*\{[^}]*display:\s*none/,
  "收起态必须藏顶栏（.app:not(.chrome-shown) .topbar → display:none）");
assert.match(css, /\.app:not\(\.chrome-shown\)\s+\.rail\s*\{[^}]*display:\s*none/,
  "收起态必须藏底栏（.app:not(.chrome-shown) .rail → display:none）");

// ⋮ 呼出：必须存在「.chrome-shown 显示底栏」的规则，且写在 .rail-hidden 之后 ——
// 两者同为 (0,2,1) 特异性靠后者胜；顺序反了沉浸式插件页（课程表）里 ⋮ 就呼不出底栏。
assert.match(css, /\.app\.chrome-shown\s+\.rail\s*\{[^}]*display:\s*flex/,
  "呼出态必须把底栏重新显示出来（.app.chrome-shown .rail → display:flex）");
const railHiddenIdx = css.indexOf(".app.rail-hidden .rail");
const chromeRailIdx = css.indexOf(".app.chrome-shown .rail");
assert.ok(railHiddenIdx >= 0 && chromeRailIdx > railHiddenIdx,
  ".app.chrome-shown .rail 必须出现在 .app.rail-hidden .rail 之后（同特异性靠后者胜）");

// :not(…) 带类名参与特异性，必须整体强于 .rail-hidden 那组 —— 否则收起态在沉浸式
// 插件页上会被 (0,2,1) 的旧规则盖回。直接比两段的位置与形态，防有人改回弱写法。
assert.match(css, /\.app:not\(\.chrome-shown\)\s+\.view\s*\{[^}]*padding-bottom:\s*calc\(4px\s*\+\s*var\(--sab/,
  "收起态 .view 要收回为底栏预留的 padding-bottom（否则底部留一条空白）");

// ── ② 状态栏距离：收起态内容从 --sat 下起步，悬浮键本体也吃安全区 ──
assert.match(css, /\.app:not\(\.chrome-shown\)\s+\.view\s*\{[^}]*padding-top:\s*calc\(\d+px\s*\+\s*var\(--sat,\s*env\(safe-area-inset-top,\s*0px\)\)/,
  "收起态 .view 必须补 padding-top = Npx + var(--sat, env(…))：内容不能压进透明状态栏");
const toggleRule = css.match(/\.chrome-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
assert.ok(toggleRule, "必须存在 .chrome-toggle 规则");
// v0.52.1：⋮ 从「贴顶」挪到右侧 45% 高度 —— 贴顶时它压在顶栏里，窄屏（288 CSS px 档）
// 会盖住顶栏右侧的「快捷入口 / 搜索」。纵向不再贴边 ⇒ 与 --sat 无关，不必吃安全区；
// 但**任何**位置都不许裸用 env()（铁律四），由文件末尾的全文件守卫统一把守。
assert.match(toggleRule, /top:\s*calc\(45%\s*-\s*18px\)/,
  "⋮ 菜单键应落在右侧 45% 高度（v0.52.1 起不再贴顶；贴顶会压住顶栏右侧控件）");
assert.match(toggleRule, /right:\s*calc\(\d+px\s*\+\s*var\(--sar,\s*env\(safe-area-inset-right,\s*0px\)\)/,
  "⋮ 菜单键的 right 必须吃 var(--sar, env(…))（横屏挖孔在侧边）");
assert.match(toggleRule, /position:\s*fixed/, "⋮ 菜单键必须悬浮（fixed）");
// ⚠️ .mobile-back 会先命中媒体块外的兜底规则「.chrome-toggle, .mobile-back { display:none }」
// （选择器列表里也含这个类名）—— 必须取媒体块内那条含 position:fixed 的完整规则。
const mobileBackRule = [...css.matchAll(/\.mobile-back\s*\{([^}]*)\}/g)]
  .map((m) => m[1])
  .find((body) => /position:\s*fixed/.test(body)) ?? "";
assert.ok(mobileBackRule, "必须存在 .mobile-back 的窄屏定位规则（position:fixed）");
assert.match(mobileBackRule, /top:\s*calc\(45%\s*-\s*18px\)/,
  "悬浮返回键应与 ⋮ 对称落在左侧 45% 高度（v0.52.1 起同样不再贴顶）");
assert.match(mobileBackRule, /left:\s*calc\(\d+px\s*\+\s*var\(--sal,\s*env\(safe-area-inset-left,\s*0px\)\)/,
  "悬浮返回键的 left 必须吃 var(--sal, env(…))（横屏挖孔在侧边）");
// 悬浮键要压在底栏(z-55)之上：两栏呼出时 ⋮ 必须保持可点
const toggleZ = Number(toggleRule.match(/z-index:\s*(\d+)/)?.[1] ?? 0);
assert.ok(toggleZ > 55, `⋮ 菜单键 z-index 必须 > 55（底栏层级），实际 ${toggleZ}`);

// ── ③ 桌面 / 宽屏恒隐藏两颗悬浮键（元素在 shell.js 里无条件挂进 DOM）──
assert.match(css, /\.chrome-toggle,\s*\.mobile-back\s*\{\s*display:\s*none/,
  "媒体块外必须有 .chrome-toggle, .mobile-back { display:none } 兜底，宽屏不许露出");

// 呼出态：顶栏右侧要让出一颗钮的宽度，且悬浮返回键让位（顶栏里已有返回键）
assert.match(css, /\.app\.chrome-shown\s+\.topbar\s*\{[^}]*padding-right:\s*calc\(\d+px\s*\+\s*var\(--sar/,
  "呼出态顶栏的 padding-right 仍要走 var(--sar, env(…)) 双路（横屏挖孔在侧边）");
assert.match(css, /\.app\.chrome-shown\s+\.mobile-back\s*\{[^}]*display:\s*none/,
  "呼出态悬浮返回键要让位给顶栏返回键，同屏不摆两颗「返回」");

// ⋮ ↔ ✕ 图标随态切换：默认只显 ⋮，呼出后只显 ✕
assert.match(css, /\.chrome-toggle\s+\.ct-close\s*\{\s*display:\s*none/,
  "默认态 ⋮ 菜单键不该显示 ✕");
assert.match(css, /\.app\.chrome-shown\s+\.chrome-toggle\s+\.ct-open\s*\{\s*display:\s*none/,
  "呼出态要藏起 ⋮");
assert.match(css, /\.app\.chrome-shown\s+\.chrome-toggle\s+\.ct-close\s*\{\s*display:\s*block/,
  "呼出态要显示 ✕（可点它收回）");

// ── ④ shell.js 侧：状态、开关、自动收回、返回键同步 ──
assert.match(shell, /let chromeShown = false;/,
  "沉浸式外壳必须默认收起（每次启动都从收起态开始，需求原文「默认上下栏都隐藏」）");
assert.match(shell, /class: "chrome-toggle"/, "必须创建 ⋮ 菜单键按钮");
assert.match(shell, /class: "mobile-back"/, "必须创建悬浮返回键按钮");
assert.match(shell, /"aria-expanded"/, "⋮ 菜单键要把呼出态暴露给无障碍树");
assert.match(shell, /onclick: \(\) => setChromeShown\(!chromeShown\)/,
  "⋮ 菜单键的点击行为必须是切换 .chrome-shown");
assert.match(shell, /appFrame\.classList\.toggle\("chrome-shown", show\)/,
  "setChromeShown 必须把状态写到 .app 的类上（CSS 只认这个类）");
// 自动收回：只在「真的换了界面」且菜单呼出且窄屏时排定时器
assert.match(shell,
  /prevId !== targetId && chromeShown && mobileQuery\.matches[\s\S]{0,220}setChromeShown\(false\)/,
  "切视图后必须自动收回菜单（条件：真的换页 + 当前呼出 + 窄屏）");
// 悬浮返回键与顶栏返回键同一份状态
assert.match(shell,
  /syncBackButton[\s\S]{0,220}backBtn\.classList\.toggle\("show", show\);[\s\S]{0,120}mobileBack\.classList\.toggle\("show", show\)/,
  "syncBackButton 必须同时驱动顶栏返回键与悬浮返回键（同一份 canGoBack()）");
assert.match(shell, /const mobileBack = el\("button", \{[\s\S]{0,200}onclick: \(\) => goBack\(\)/,
  "悬浮返回键必须复用 goBack()（先关浮层再回视图，与 Android 返回键一致）");
// 两颗键都要真的挂进 .app（appFrame）——呼出态字形切换与返回键让位全靠
// `.app.chrome-shown .chrome-toggle …` 后代选择器，挂 root 上（.app 的兄弟）永不命中
assert.match(shell, /appFrame\.append\(chromeToggle, mobileBack\)/,
  "两颗悬浮键必须挂在 .app（appFrame）里，不能挂 root（否则 .app.chrome-shown … 选择器失效）");
// 两颗键都要 data-motion="off"：interactions.css 的
// `button.motion-ripple-host:not([data-motion="off"]) { position: relative }`（0,2,1）
// 会压掉 .chrome-toggle 的 position:fixed（0,1,0），按钮掉回文档流末尾（实测 y=850 出屏）。
// 带上该属性后 :not() 不命中，fixed 保留（motion.js 同样尊重这个退出属性，波纹一并免掉）。
assert.match(shell, /class: "mobile-back",[\s\S]{0,200}?"data-motion": "off"/,
  "悬浮返回键必须带 data-motion=\"off\"，否则 interactions.css 会把 fixed 压成 relative");
assert.match(shell, /class: "chrome-toggle",[\s\S]{0,260}?"data-motion": "off"/,
  "⋮ 菜单键必须带 data-motion=\"off\"，否则 interactions.css 会把 fixed 压成 relative");
// 呼出切换要清掉未到点的自动收回定时器（用户刚点开就别又被收走）
assert.match(shell,
  /function setChromeShown\(show\) \{[\s\S]{0,120}clearTimeout\(chromeHideTimer\)/,
  "setChromeShown 必须先清自动收回定时器");

// ── ⑤ 新增规则不许裸用 env()（铁律四；全文件守卫在 test-android-layout.mjs，
//      这里专钉本功能的四条悬浮键 / 收起态规则）──
const chromeCssChunk = css.slice(css.indexOf(".chrome-toggle, .mobile-back"));
for (const m of chromeCssChunk.matchAll(/var\(--s(?:at|ab|al|ar),\s*env\(safe-area-inset-[a-z]+,\s*0px\)\)/g)) {
  // 命中的每处都必须在 var() 里 —— 变异守卫：谁把某一处改回裸 env 就会少一处命中
}
const chromeSatUses = (chromeCssChunk.match(/var\(--s(?:at|ab|al|ar),\s*env\(safe-area-inset-[a-z]+,\s*0px\)\)/g) || []).length;
assert.ok(chromeSatUses >= 8,
  `沉浸式外壳相关规则必须至少有 8 处 var(--s…, env(…)) 双路取值，实际 ${chromeSatUses} 处 —— 少了就是有人改回裸 env()`);

console.log("PASS: immersive chrome shell (default-hidden bars, ⋮ toggle with ✕ swap, auto-collapse after navigation, floating back button synced with canGoBack, status-bar safe distances on collapsed state, desktop always hides the floating keys)");
