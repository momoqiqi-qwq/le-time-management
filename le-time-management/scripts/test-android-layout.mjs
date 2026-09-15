import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles.css");
const shell = read("../src/shell.js");
const quadrant = read("../src/views/quadrant.js");
const appearance = read("../src/views/settings/appearance.js");

// Android 上四象限必须由内容撑高，让 .view 承担整页滚动。若继续继承桌面的
// height:100% + flex:1，四张卡会被压进一屏，卡内按钮虽在 DOM 中却被 overflow 裁掉。
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.quad-wrap\s*\{[^}]*height:\s*auto[^}]*min-height:\s*100%/,
  "窄屏四象限容器必须按内容自然增高");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.quad-grid\s*\{[^}]*flex:\s*none[^}]*grid-auto-rows:\s*max-content/,
  "窄屏象限网格不能继续参与剩余高度压缩");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.q\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*overflow:\s*visible/,
  "窄屏象限不能裁掉任务与添加按钮");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.q \.tks\s*\{[^}]*flex:\s*none[^}]*max-height:\s*none[^}]*overflow:\s*visible/,
  "窄屏任务列表应交给页面统一滚动");

// Android 没有桌面窗口概念。这些按钮显示出来只会无响应；顶栏 HTML5 draggable
// 也可能与 WebView 触摸点击竞争，所以两者都必须由桌面运行时门控。
assert.match(shell, /const desktopWindow = isDesktopRuntime\(\)/,
  "应用外壳必须识别桌面运行时");
assert.match(shell, /const windowControls = desktopWindow\s*\?\s*el\(/,
  "窗口控制按钮只应在桌面端创建");
assert.match(shell, /node\.draggable = desktopWindow/,
  "Android 顶栏控件不能启用 HTML5 拖拽");
assert.ok(shell.includes('desktopWindow ? (pinActionBtn = createQuickDockButton("thumbtack", "窗口置顶"'),
  "快捷入口中的窗口置顶必须由桌面运行时门控");
assert.match(appearance, /desktopWindow\s*\?\s*windowRow\s*:\s*null/,
  "Android 设置页不应显示无效的窗口大小控件");

// v0.37.13 回归：窄屏设置页横向溢出。分类导航 .settings-catalog 在 ≤980px 变横向滚动行
// （11 个 flex:0 0 200px 的导航项，min-content ≈ 2272px）。若 .settings-layout 继续写
// grid-template-columns: 1fr（自动最小 = min-content），轨道会被撑到 2272px，整页被顶出
// 屏幕右缘且 docWidth 不变（无横向滚动可救）。必须 minmax(0,1fr) + 侧栏 min-width:0，
// 让 overflow-x:auto 真正就地滚动。
const mobileSettings = css.split("@media (max-width: 980px)")[1]?.split("@media")[0] ?? "";
assert.match(mobileSettings, /\.settings-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  "窄屏设置布局必须用 minmax(0,1fr)，1fr 的自动最小值会被分类导航 min-content 撑爆");
assert.match(mobileSettings, /\.settings-sidebar\s*\{[^}]*min-width:\s*0/,
  "窄屏设置侧栏必须 min-width:0，否则横向分类行把整页顶出屏幕");

// v0.37.15 回归 1：任务卡标题必须换行让卡片随内容变高。
// 旧版写 white-space:nowrap + text-overflow:ellipsis，标题被截断、卡片高度恒定。
// 改回 nowrap 就会退化成「文字太多看不到」（用户反馈「当字太多时卡片变高」）。
const tkcRule = css.match(/\.tkc \.tt \.t\s*\{([^}]*)\}/)?.[1] ?? "";
assert.ok(tkcRule, "必须存在 .tkc .tt .t 规则");
assert.match(tkcRule, /white-space:\s*normal/, "任务卡标题必须允许换行，卡片才能随文字变高");
assert.doesNotMatch(tkcRule, /text-overflow:\s*ellipsis/, "任务卡标题不能再走省略号截断");
assert.doesNotMatch(tkcRule, /white-space:\s*nowrap/, "任务卡标题不能再 nowrap");
assert.match(tkcRule, /overflow-wrap:\s*anywhere/, "超长连续字符（无空格）也要能断行，否则撑破卡片");
// 卡片纵向内边距方向必须是「首行对齐」，否则变高后复选框/徽标会跑到垂直居中
assert.match(css, /\.tkc\s*\{[^}]*align-items:\s*flex-start/, "任务卡在变高后复选框应贴首行，不能垂直居中");
assert.match(quadrant, /class: "tt-top"/, "标题与展开箭头必须包在 .tt-top 里同处一行");
assert.match(quadrant, /const expandable = hasNote;/, "标题不再截断后，展开只服务于备注，不再看标题长度");

// v0.37.15 回归 2：顶栏右侧工具不再套外层框（用户反馈「框太多」）。
// .topbar-action-card 必须透明无边框，视觉层级由各按钮自身表达；标题卡的框保留。
// 注意：共享规则 `.topbar-title-card, .topbar-action-card { border: 1px … }` 依然存在
// （标题卡要用），所以判定必须落在靠后的那条覆盖规则上。
const actionCardRules = [...css.matchAll(/\.topbar-action-card\s*\{([^}]*)\}/g)].map((m) => m[1]);
const overridden = actionCardRules.find((r) => /padding:\s*0/.test(r)) ?? "";
assert.ok(overridden, "必须有一条 .topbar-action-card 覆盖规则把外层内边距清零");
assert.match(overridden, /border:\s*0/, "顶栏右侧工具外层不能有边框");
assert.match(overridden, /background:\s*none/, "顶栏右侧工具外层不能有底色");
assert.match(overridden, /box-shadow:\s*none/, "顶栏右侧工具外层不能有阴影");

// v0.37.15 回归 3：APK 桌面图标名必须是「Le时间管理」。
// MainActivity 上的 android:label 会覆盖 application 级 app_name，图标名变成
// 「Le时间管理 · 时间块与四象限」。构建脚本必须幂等清掉它（gen/ 是 gitignored，手改会丢）。
const androidBuild = read("../scripts/build-android-apk.sh");
assert.match(androidBuild, /MainActivity/, "Android 构建脚本必须处理 MainActivity 的 label");
assert.match(androidBuild, /android:name="\\\.MainActivity"/, "必须按 android:name 精确定位 MainActivity，不能误删教务窗口的 label");
assert.match(androidBuild, /main_activity_title/, "必须移除对 main_activity_title 的引用");

// v0.37.16 回归：状态栏 / 设置页顶部重叠。
// Android WebView **不实现 env(safe-area-inset-*)**（取值恒为 0，viewport-fit=cover 也没用），
// 而 MainActivity 的 enableEdgeToEdge() 让状态栏变成透明浮层盖在网页上 ——
// 顶栏从屏幕绝对顶部开始画，标题与关闭按钮被信号/电量图标压住。
// 解法：原生侧读 WindowInsets 注入 --sat/--sab/--sal/--sar，前端走 var(..., env(...)) 双路。
const mainActivity = read("../src-tauri/gen/android/app/src/main/java/com/yile/letime/MainActivity.kt");
assert.match(mainActivity, /getInsets\(WindowInsetsCompat\.Type\.systemBars\(\)\)/,
  "MainActivity 必须读 systemBars 的真实 inset，否则 edge-to-edge 下顶栏必然压状态栏");
assert.match(mainActivity, /setProperty\('--sat'/,
  "必须把状态栏高度注入成 CSS 变量 --sat");
assert.match(mainActivity, /setProperty\('--sab'/,
  "必须把导航栏 / 键盘高度注入成 CSS 变量 --sab");
// 四个方向都要：横屏与折叠屏展开时挖孔会跑到侧边，只补 top 不够。
for (const v of ["--sal", "--sar"]) {
  assert.ok(mainActivity.includes(`setProperty('${v}'`), `必须注入 ${v}（横屏刘海安全区）`);
}
assert.match(mainActivity, /onPageFinished/,
  "页面加载完必须补注入一次：新文档会重置 documentElement 的内联样式变量");

// CSS 侧：所有安全区取值都必须是「var(注入值, env(原生)) 」双路。
assert.doesNotMatch(css, /(?<!\))\benv\(safe-area-inset-[a-z]+,\s*0px\)(?!\))/,
  "安全区不能裸用 env()：Android WebView 里恒为 0，会被直接压到状态栏");
const satUses = [...css.matchAll(/var\(--s(?:at|ab|al|ar),\s*env\(safe-area-inset-[a-z]+,\s*0px\)\)/g)].length;
assert.ok(satUses >= 15, `安全区必须统一走 var(--s…, env(…)) 双路，当前只匹配到 ${satUses} 处`);
// 🔴 :root 里绝不能给 --sat/--sab/… 定义默认值：变量一旦有有效值，
// var() 的第二参数永不生效，iOS / 桌面的原生 env() 会被彻底废掉。
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.doesNotMatch(rootBlock, /--s(?:at|ab|al|ar)\s*:/,
  ":root 不能定义 --sat/--sab/--sal/--sar 默认值，否则 var() 的 env() 兜底永远不生效");
// 手机端顶栏必须同时吃 top 与左右：竖屏补 top，横屏挖孔在侧边。
const mobileTopbar = css.split("@media (max-width: 760px)")[1]?.split("@media")[0] ?? "";
assert.match(mobileTopbar, /padding-top:\s*var\(--sat/,
  "窄屏顶栏必须吃掉 --sat，否则标题压状态栏");
assert.match(mobileTopbar, /padding-left:\s*calc\([^)]*var\(--sal/,
  "窄屏顶栏必须吃掉 --sal（横屏刘海）");
assert.match(mobileTopbar, /padding-right:\s*calc\([^)]*var\(--sar/,
  "窄屏顶栏必须吃掉 --sar（横屏刘海）");

console.log("PASS: Android natural-height layout, tappable quadrant controls, desktop-only window actions, wrapping task cards, single-layer topbar tools, launcher label and status-bar safe-area insets");
