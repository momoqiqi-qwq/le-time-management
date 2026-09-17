import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles.css");
const shell = read("../src/shell.js");
const quadrant = read("../src/views/quadrant.js");
const appearance = read("../src/views/settings/appearance.js");

// Android 上四象限必须由内容撑高，让 .view 承担整页滚动。若继续继承桌面的
// height:100% + flex:1，四张卡会被压进一屏，卡内按钮虽在 DOM 中却被 overflow 裁掉。
// 断点保持 `px`。曾一度改成 `em`（理由是「em 媒体查询会跟着界面缩放走」），
// 实测证明该理由**不成立**：em 媒体查询按浏览器默认 16px 求值，zoom 与 html font-size
// 都改不动它（详见 styles.css 顶部那段「被实测推翻的旧结论」），已全部回退。
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

// v0.39.0 回归：顶栏标题左侧小框回归（紧凑版）。前史：v0.38.2 之前是一颗 42×42
// 死框、恒装 Le 应用图标，用户嫌噪音删掉（v0.38.2）；随后用户回头表示想要框 ——
// 但要小（不顶开顶栏两条横线），且图标必须跟随当前视图（插件页 = 插件自己的图标）。
assert.ok(shell.includes("topbar-title-mark"), "标题卡里必须有 .topbar-title-mark 小框");
assert.ok(shell.includes("renderTitleMark"), "小框图标必须随视图切换刷新（renderTitleMark）");
assert.ok(shell.includes("class: \"topbar-title-copy\""), "标题卡里必须保留 .topbar-title-copy（标题 + 副标题）");
// 紧凑尺寸：桌面 28px / 窄屏 24px。超过 30px 就会顶开标题卡、把卡推出顶栏两条横线
// （42px 死框当年就是这么压顶的），低于 20px 图标糊成一团。
const markSizeRules = [...css.matchAll(/\.topbar-title-mark\s*\{([^}]*)\}/g)].map((m) => m[1]);
assert.ok(markSizeRules.length >= 2, "桌面与窄屏各应有一条 .topbar-title-mark 规则");
for (const rule of markSizeRules) {
  const w = Number(rule.match(/width:\s*(\d+)px/)?.[1] ?? 0);
  const h = Number(rule.match(/height:\s*(\d+)px/)?.[1] ?? 0);
  assert.ok(w >= 20 && w <= 30, `小框宽度必须是 20~30px 的紧凑规格，实际 ${w}px`);
  assert.ok(h >= 20 && h <= 30, `小框高度必须是 20~30px 的紧凑规格，实际 ${h}px`);
  assert.equal(w, h, "小框必须是正方形");
}
assert.match(css, /\.topbar-title-mark\s+\.app-icon/, "小框内部的 .app-icon 必须有尺寸规则（否则回落 30px 撑破小框）");
// 图标来源：插件页走 pluginDisplayIcon（含用户自定义图标覆盖），不许再装死的 app 图标。
assert.ok(shell.includes("pluginDisplayIcon(def.pluginView.pluginId"), "插件页小框必须装插件自己的图标");
assert.doesNotMatch(shell, /titleMark\.append\(appIcon\("quadrant"\)\)/, "小框不许恒装四象限应用图标（回到 v0.38.2 之前的老毛病）");
// 小框左侧占位后，标题卡内边距仍要左右对称，否则标题会偏左贴边。
// 注意不能只看 `padding:` 简写：`padding: 8px 12px` 配上一条 `padding-right: 16px`
// 就是不对称的，而简写本身看起来完全正常（第一版断言就是这么漏过的）。
const titleCardRules = [...css.matchAll(/\.topbar-title-card\s*\{([^}]*)\}/g)].map((m) => m[1]);
assert.ok(titleCardRules.length >= 2, "桌面与窄屏各应有一条 .topbar-title-card 规则");
for (const rule of titleCardRules) {
  const parts = (rule.match(/(?:^|;)\s*padding:\s*([^;]+)/)?.[1] ?? "0").trim().split(/\s+/).filter(Boolean);
  const base = { top: parts[0] ?? "0", right: parts[1] ?? parts[0] ?? "0", bottom: parts[2] ?? parts[0] ?? "0", left: parts[3] ?? parts[1] ?? parts[0] ?? "0" };
  const long = (side) => rule.match(new RegExp(`(?:^|;)\\s*padding-${side}:\\s*([^;]+)`))?.[1]?.trim() ?? base[side];
  assert.equal(long("left"), long("right"), `标题卡内边距要左右对称，实际 left=${long("left")} right=${long("right")}`);
}

// v0.37.15 回归 3：APK 桌面图标名必须是「Le时间管理」。
// MainActivity 上的 activity 级 android:label 会覆盖 application 级 app_name，图标名变成
// 「Le时间管理 · 时间块与四象限」，手机桌面放不下被截断。
// gen/ 是 gitignored，手改会在下次 `tauri android init` 时丢 —— 所以这条清理逻辑
// v0.38.0 起搬到了 tools/sync-android-native.js（幂等补丁），由构建脚本在打包前调用。
// 断言因此落在「工具里有这条规则」+「构建脚本确实调了它」两点上。
const androidBuild = read("../scripts/build-android-apk.sh");
const androidSync = read("../../tools/sync-android-native.js");
assert.match(androidBuild, /sync-android-native\.js/, "Android 构建脚本必须在打包前同步版本化的原生代码");
assert.match(androidSync, /android:name="\\\.MainActivity"/,
  "必须按 android:name 精确定位 MainActivity，不能误删教务窗口的 label");
assert.match(androidSync, /main_activity_title/, "必须移除 MainActivity 对 main_activity_title 的引用");
assert.match(androidSync, /REQUEST_INSTALL_PACKAGES/,
  "必须幂等补上安装未知来源应用权限，否则应用内一键升级在 Android 8+ 上会被系统静默拦掉");

// v0.37.16 回归：状态栏 / 设置页顶部重叠。
// Android WebView **不实现 env(safe-area-inset-*)**（取值恒为 0，viewport-fit=cover 也没用），
// 而 MainActivity 的 enableEdgeToEdge() 让状态栏变成透明浮层盖在网页上 ——
// 顶栏从屏幕绝对顶部开始画，标题与关闭按钮被信号/电量图标压住。
// 解法：原生侧读 WindowInsets 注入 --sat/--sab/--sal/--sar，前端走 var(..., env(...)) 双路。
// 读版本化镜像而不是 gen/android —— 后者 gitignored，全新 clone 上这个测试会直接 ENOENT。
// 镜像由 tools/sync-android-native.js 同步进 gen（--check 守两者一致）。
const mainActivity = read("../android/gradle/app/src/main/java/com/yile/letime/MainActivity.kt");
assert.match(mainActivity, /getInsets\(WindowInsetsCompat\.Type\.systemBars\(\)\)/,
  "MainActivity 必须读 systemBars 的真实 inset，否则 edge-to-edge 下顶栏必然压状态栏");
assert.match(mainActivity, /setProperty\('--sat'/,
  "必须把状态栏高度注入成 CSS 变量 --sat");
assert.match(mainActivity, /setProperty\('--sab'/,
  "必须把导航栏高度注入成 CSS 变量 --sab");
// v0.49.0 回归：键盘弹出整屏只剩背景色（轮换值日插件输成员名字必现）。
// 旧写法 `val bottom = maxOf(bars.bottom, ime.bottom)` 把 --sab 撑到键盘高（~370px），
// .view 的 padding-bottom / toast / 抽屉底栏全部暴涨 —— 页面被凭空撑长一大截，
// 聚焦输入框时 Chrome scrollIntoView 把 WebView 滚进这段空白 → 整屏只剩背景色。
// 修复：--sab 回归纯导航栏；键盘 inset 由 WebView 自己消费（bottomMargin 压缩网页视口）。
// ⚠️ 判定前剥掉 Kotlin 注释（/* */ 与 //）—— 本文件的说明性注释会引用旧写法文本，会误伤自己。
const ktNoComment = mainActivity.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
assert.doesNotMatch(ktNoComment, /maxOf\(bars\.bottom,\s*ime\.bottom\)/,
  "--sab 严禁掺 ime：键盘高度会撑爆 CSS 布局（黑屏根因），键盘避让必须走 WebView ime listener");
assert.match(mainActivity, /setOnApplyWindowInsetsListener\(webView\)/,
  "必须给 WebView 挂 ime inset listener：edge-to-edge 下 adjustResize 不生效、adjustPan 只挪窗口，" +
  "不消费 ime 的话输入框会被键盘盖住且视口不变");
assert.match(mainActivity, /bottomMargin\s*=\s*ime\.bottom/,
  "ime 避让必须用 bottomMargin 压缩 WebView 视口 —— WebView 不尊重 padding，网页会铺满 view 边界");
assert.match(mainActivity, /WindowInsetsCompat\.Builder\(insets\)/,
  "WebView 消费 ime 后必须剥掉 ime 再往下传（防子层级二次消费）");
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
// 先剥掉注释再判定，否则本文件的说明性注释会被自己误伤。
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
const rootBlock = cssNoComment.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.doesNotMatch(rootBlock, /--s(?:at|ab|al|ar)\s*:/,
  ":root 不能定义 --sat/--sab/--sal/--sar 默认值，否则 var() 的 env() 兜底永远不生效");
// 手机端顶栏必须同时吃 top 与左右：竖屏补 top，横屏挖孔在侧边。
// 注意：全文件有 8 个 max-width:760px 查询，必须按「哪一块里有 .topbar」来定位，
// 不能取第一个 —— 否则断言落在错误的块上（本回归的第一次写法就踩了这个坑）。
const topbarRule = css.match(
  /\.topbar\s*\{[^}]*?padding-left:\s*calc\([^}]*?var\(--sal[^}]*?\}/,
)?.[0] ?? "";
assert.ok(topbarRule, "窄屏顶栏必须有一条同时含 padding-left: calc(… var(--sal …)) 的规则");
assert.match(topbarRule, /padding-top:\s*var\(--sat/,
  "窄屏顶栏必须吃掉 --sat，否则标题压状态栏");
assert.match(topbarRule, /padding-right:\s*calc\([^)]*var\(--sar/,
  "窄屏顶栏必须吃掉 --sar（横屏刘海）");

/* ───────────── v0.37.17 回归 1：Android 返回键 ─────────────
   Tauri 的 TauriActivity 把 wry 的 handleBackNavigation 固定成了 false（wry 自己是 true），
   于是返回键完全不碰 WebView 历史、直接 finish 掉 Activity —— 用户看到「一按返回就退出软件」。
   必须覆盖回 true（wry 便成了「能回退就 goBack，不能才 finish」），
   再由前端 src/backNav.js 压历史：视图格 + 浮层格。 */
// 同上：读版本化镜像（gen/android 不进 git）
const mainActivityBack = read("../android/gradle/app/src/main/java/com/yile/letime/MainActivity.kt");
assert.match(mainActivityBack, /override\s+val\s+handleBackNavigation\s*:\s*Boolean\s*=\s*true/,
  "MainActivity 必须把 handleBackNavigation 覆盖回 true，否则返回键绕过 WebView 直接退出应用");

const backNav = read("../src/backNav.js");
assert.match(backNav, /export\s+function\s+initBackNav/, "必须存在返回键历史栈模块");
assert.match(backNav, /export\s+function\s+noteViewChange/, "切视图要能给历史栈压一格");
// 遮罩类名清单是这份文件唯一要跟着浮层一起维护的地方，漏一个就有浮层关不掉。
assert.match(backNav, /const OVERLAY_SELECTOR = "[^"]*\.drawer-mask[^"]*\.cmd-mask[^"]*\.cap-mask[^"]*"/,
  "浮层遮罩类名清单要齐全：命令面板 .cmd-mask、捕获浮层 .cap-mask 最容易漏");
assert.match(backNav, /ltmGuard/, "浮层格标记不能丢，否则返回键会连视图一起退掉");
assert.match(shell, /initBackNav\(\{[\s\S]{0,160}applyView/, "外壳必须在首屏视图定下来后挂上历史栈");
assert.match(shell, /if \(opts\.history !== false\) noteViewChange\(targetId\)/,
  "只有真正切视图才压历史；程序性重渲染压栈会让返回键要多按好几下");
assert.ok((shell.match(/switchTo\([^)]*\{ history: false \}/g) || []).length >= 4,
  "程序性重渲染的几处调用都要带 { history: false }（刷新视图 / 注册表回正 / 首屏）");

/* ───────────── v0.37.17 回归 2：双指缩放 ─────────────
   Android WebView 默认 builtInZoomControls = false，叠加 index.html 里 viewport 的
   user-scalable=no，双指缩放完全没反应。原生侧打开缩放机制，前端只在手持设备上
   放开 user-scalable —— 两边缺一不可，桌面必须保持原样。 */
assert.match(mainActivityBack, /setSupportZoom\(true\)/, "原生必须显式 setSupportZoom(true)");
assert.match(mainActivityBack, /builtInZoomControls\s*=\s*true/, "必须打开 WebView 的内置缩放机制");
assert.match(mainActivityBack, /displayZoomControls\s*=\s*false/,
  "内置缩放自带的 +/- 悬浮件要藏起来，否则会浮在界面上");

const mobileViewport = read("../src/mobileViewport.js");
assert.match(mobileViewport, /maximum-scale=5\.0/, "手机 viewport 要把放大上限放开");
// 剥掉注释再判定 —— 本模块的说明性注释里就写着旧的 user-scalable=no，否则会误伤自己。
const mobileViewportCode = mobileViewport
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
assert.doesNotMatch(mobileViewportCode, /user-scalable=no/, "手机上不能再写 user-scalable=no");
assert.match(mobileViewport, /Android\|iPhone\|iPad\|iPod/, "只有手持设备才放开缩放");
const mainJs = read("../src/main.js");
assert.match(mainJs, /applyTouchZoomViewport\(\);\s*\n\s*await initStore/,
  "必须在首屏渲染前改 viewport，否则第一帧仍按旧的 user-scalable=no 排版");
// 桌面 index.html 保持原样：窗口缩放交给应用自己的「启动窗口大小」设置，
// Ctrl+滚轮放大只会让用户以为界面坏了。
assert.match(read("../index.html"), /name="viewport"[^>]*user-scalable=no/,
  "桌面的 viewport 不能顺手放开，缩放只对手机生效");

/* ───────────── v0.37.17 回归 3：窄屏设置页手风琴 ─────────────
   手机上原来是「横向分类 chip 行 + 一次只显示一块内容」：11 个分类要横着滑才看得全，
   当前分类下面还有什么完全看不见。窄屏改成手风琴（标题行 + 方向箭头，可就地收放），
   桌面仍用左栏分类，标题行必须隐藏。 */
// 作者样式里 .settings-acc 有 display:block，会盖掉 UA 的 [hidden] ——
// 少了这条 !important，11 个分区会全部堆在设置页上。
assert.match(css, /\.settings-acc\[hidden\]\s*\{\s*display:\s*none\s*!important/,
  "必须显式写 .settings-acc[hidden] { display:none !important }，否则隐藏属性失效");

const narrowBlocks = css
  .split(/@media \(max-width: 980px\)/)
  .slice(1)
  .map((chunk) => chunk.split(/\n@/)[0]);
// 按「哪一块里有 .settings-acc-open」定位手风琴块 —— 基础规则（.settings-acc-head 的
// display:none）落在前一个 980px 块之后，按 .settings-acc-head 找会落在错误的块上。
const accordion = narrowBlocks.find((block) => block.includes(".settings-acc-open")) ?? "";
assert.ok(accordion, "必须存在窄屏手风琴的媒体块");
assert.match(accordion, /\.settings-acc-head\s*\{[^}]*display:\s*flex/, "窄屏要把分类标题行显示出来");
assert.match(accordion, /\.settings-acc-head\s*\{[^}]*min-height:\s*52px/,
  "标题行触控区要够高（≥44px），拇指才点得住");
assert.match(accordion, /\.settings-acc-open \.settings-acc-arrow\s*\{[^}]*transform:\s*rotate\(180deg\)/,
  "展开时方向箭头要掉头，否则看不出可收放");
assert.match(accordion, /\.settings-catalog\s*\{\s*display:\s*none/,
  "窄屏要收掉横向 chip 行：分类切换已由标题行承担，两个入口重复又占首屏");

// 桌面：标题行隐藏，仍是「左侧分类 + 右侧单页」。
const accHeadBase = css.match(/\.settings-acc-head\s*\{([^}]*)\}/)?.[1] ?? "";
assert.match(accHeadBase, /display:\s*none/, "桌面必须隐藏标题行，分类切换仍交给左栏");

const navigatorSrc = read("../src/views/settings/navigator.js");
assert.match(navigatorSrc, /class:\s*"settings-acc-arrow"/, "每个分区标题行都要有方向箭头");
assert.match(navigatorSrc, /return \{ node, apply, select, panels \}/,
  "navigator 必须把 panels 暴露出去");
assert.match(read("../src/views/settings.js"), /\.\.\.settingsNavigator\.panels/,
  "设置视图要渲染 navigator 给的 panels，否则手风琴结构根本不生效");

/* ───────────── v0.49.1 回归：窄屏进设置页先给分类目录，不预展开 ─────────────
   原先窄屏一进设置页就展开当前分类（「界面与交互」），11 个分区里只看得见它，
   其余分类被挤到屏幕外。现在初始不展开任何分区，展开与否全由用户点标题行决定。 */
assert.ok(!/expanded\.add\(active\)/.test(navigatorSrc),
  "窄屏不许在初始化 / 断点变化时预展开当前分类（v0.49.1：一进来先给一张分类目录）");
assert.match(navigatorSrc, /^\s*const syncExpanded = \(\) => \{ state\.expanded = \[\.\.\.expanded\]; \};\s*$/m,
  "展开状态必须写回 state：改一项设置会整页重建，状态只存局部变量会让展开的面板当场塌掉");
assert.match(navigatorSrc, /^\s*let expanded = new Set\(Array\.isArray\(state\.expanded\) \? state\.expanded : \[\]\);\s*$/m,
  "重建时要读回 state.expanded，否则上面那句写了也白写");
assert.match(read("../src/views/settings.js"), /settingsNavState\.expanded = \[\];/,
  "每次打开设置页要清空展开集合：重新进来仍是目录态，不记住上次展开");

console.log("PASS: Android natural-height layout, tappable quadrant controls, desktop-only window actions, wrapping task cards, single-layer topbar tools, launcher label, status-bar safe-area insets, back-key history stack, pinch zoom and the narrow-screen settings accordion");
