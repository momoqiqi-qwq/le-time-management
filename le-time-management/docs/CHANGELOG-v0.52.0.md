# v0.52.0 变更说明

> 发布日期：2026-09-18
> 版本类型：minor（新增 APK 沉浸式外壳：默认收起上下栏 + ⋮ 菜单键 + 每页悬浮返回键）

## 新：APK 沉浸式外壳 —— 上下栏默认收起，⋮ 菜单键呼出

### 需求（用户原话）

1. 「apk 默认上下栏都隐藏起来，只有点 3 个点图标的菜单键才会显示出来」
2. 「距离手机状态栏合适的距离，及 apk 界面开发」
3. 「apk 每一页都添加返回按钮，在适合的位置，要小」

### 改法

只做窄屏（≤900px，与全项目移动端适配的断点约定一致），桌面端零改动：

| 件 | 位置 | 行为 |
|---|---|---|
| `.chrome-shown` 状态类 | `.app`（`src/shell.js` · `setChromeShown`） | 挂上 ⇔ 顶栏 + 底栏显示；默认不挂 ⇒ 两栏 `display:none`，内容独占整屏 |
| ⋮ 菜单键 `.chrome-toggle` | 右上角悬浮（`top: calc(5px + --sat)`、`right: calc(6px + --sar)`） | 点它呼出两栏，再点收回（图标 ⋮ ↔ ✕ 随态切换）；呼出时顶栏右侧让出一颗钮的宽度，搜索/快捷入口不压在它下面 |
| 悬浮返回键 `.mobile-back` | 左上角悬浮（与 ⋮ 对称） | 与顶栏返回键共用同一份 `canGoBack()` 状态（`syncBackButton` 同步），点击复用 `goBack()` —— 行为与 Android 返回键完全一致：先关浮层、再回上一个视图；首页且无浮层时不出现（返回=退出应用，与既有约定一致） |
| 自动收回 | `switchTo` 的 `commit` | 呼出状态下真的切换了视图（`prevId !== targetId`）→ 380ms 后自动收回，把屏幕还给内容；程序性重渲染不触发 |
| 状态栏距离 | `.app:not(.chrome-shown) .view` | 收起时 `padding-top: calc(46px + --sat)`（悬浮键底缘 41px + --sat，内容从 46px + --sat 起步）、`padding-bottom: calc(4px + --sab)`；悬浮键本体同样吃 `--sat/--sal/--sar` |

### 关键设计点

- **每次启动都从收起态开始，不做持久化** —— 需求原文是「默认」。
- **桌面 / 宽屏恒隐藏两颗悬浮键**：`.chrome-toggle, .mobile-back { display: none }` 写在
  媒体块外兜底，元素虽无条件挂进 DOM，≥901px 永远不可见。
- **`.app.chrome-shown .rail` 必须写在 `.rail-hidden` 规则之后**：两者同为 (0,2,1) 特异性
  靠后者胜 —— 沉浸式插件页（课程表）里点 ⋮ 也要能把底栏呼出来。
- **`.app:not(.chrome-shown) …`（0,3,0）稳压 `.rail-hidden`（0,2,1）**：收起态对普通视图
  与沉浸式视图一视同仁。
- **安全区全走双路**（铁律四）：新增的每处取值都是 `var(--sat, env(safe-area-inset-top, 0px))`
  形态，没有裸 `env()`，也没有给 `:root` 加兜底默认值（有回归断言守着）。
- **主题适配**：悬浮键用 `var(--panel)/var(--line)/var(--ink-2)` 令牌 + `color-mix` 半透明底
  + `backdrop-filter`，浅色/深色/各主题下都成立，无需新增令牌（`gen-theme-dark.js --check` 不受影响）。

### 验证中抓到并修掉的问题（390×844 截图目检 + CSSOM 探针）

| 问题 | 根因 | 修法 |
|---|---|---|
| 呼出态右上角 ✕ 完全不可见 | 后加载的 `interactions.css` 有 `button.motion-ripple-host:not([data-motion="off"]) { position: relative }`（特异性 0,2,1），压过 `.chrome-toggle { position: fixed }`（0,1,0）——按钮被拽回文档流末尾，实测 `rect.y=850` 已滚出 844 视口 | 两颗悬浮键加 `data-motion="off"`（项目自有动效退出属性，`motion.js` 与 `interactions.css` 均尊重）：`:not()` 不命中，fixed 保留，36px 小钮顺带免掉波纹动效 |
| ⋮ 永远不变成 ✕、呼出态返回键不让位 | 按钮最初挂在 `root` 上，是 `.app` 的**兄弟**节点 —— `.app.chrome-shown .chrome-toggle .ct-close` 等后代选择器永不命中（CSSOM dump + `elementsFromPoint` 证实） | 挂载点改进 `.app`（`appFrame.append`）；`.app` 无 transform/filter，不构成 fixed 包含块，定位不受影响 |
| `.mobile-back` 首屏常显（canGoBack=false 时也露） | 媒体块内写了无条件 `display: inline-flex`，盖过 `.show` 门控 | 媒体块内不再写 display，显示完全由块外兜底 `display:none` + `.mobile-back.show` 门控 |

守卫（`test-chrome-toggle.mjs`）相应加固：钉住 `appFrame.append` 挂载点与两处
`data-motion: "off"`，另配变异自检 7/7 全拦（默认态 / 规则顺序 / --sat / 桌面兜底 /
初始状态 / 自动收回 / 返回键同步）。

### 影响端

- Android（APK）：✅ 主要目标。
- 桌面端窗口缩窄到 ≤900px：同样生效（与其它移动端适配行为一致）。
- 数据：无迁移。

### 测试

- 新增 `scripts/test-chrome-toggle.mjs`（默认收起、⋮ 呼出与规则顺序、悬浮键安全区双路、
  自动收回、返回键状态同步、桌面恒隐藏等静态断言）。
- 全量 `run-tests.mjs` 通过；`sync-version --check`、`gen-theme-dark --check`、
  `build-schedule-plugin --check`、`sync-android-native --check` 通过。
- 390×844 真机形态截图验证（iframe 手法）：收起态 / 呼出态 / 切视图自动收回 / 返回键出现时机。

## 新：APK 端核心视图重构 —— 删「时间块 / 收件箱」，增「时间线」

### 需求（用户原话）

1. 「apk界面删除时间块和收件箱，添加时间线」
2. 「时间线上显示年/月/日，点一下后显示具体多少点正文是怎么样子的」（附参考图：America in the World 年表）

### 改法

按**运行时**（非视口宽度）裁剪核心视图：`uiPreferences.coreViewIds()` 是单一事实源，
`isDesktopRuntime()`（UA 判定）为假 = APK / 移动端：

| 端 | 核心视图 | 说明 |
|---|---|---|
| APK / 移动 | 四象限 · **时间线** · 插件 | 时间块、收件箱不再出现在导航、翻页序、快捷菜单 |
| 桌面 | 四象限 · 时间块 · 收件箱 · 插件 | 保持不变，也没有时间线入口 |

- **时间线视图**（`src/views/timeline.js`，参照用户给的年表图）：
  - 中轴贯穿 + **年份徽章**跨轴（首组与跨年处出现）+ **日期徽章**骑轴（`9/18`，今天高亮、过期未完成任务带红点）；
  - 卡片**左右交错**；收起露「时间点 + 标题」，**点一下就地展开**：完整日期（2026年9月18日 周五）· 具体到点的时间（时间块 `14:00 – 15:30 · 时长`，任务 `23:59 截止`）+ **正文**（任务 note；时间块给分类 / 关联任务），任务附「任务详情」按钮；
  - sticky「◎ 今天」胶囊一键跳回；进入视图自动把今天滚到屏中；store 变更自动重渲染且保持滚动位置与展开状态。
- **导航兜底**：APK 上所有历史入口（命令面板「今天的时间块」、快速捕获排程后的「查看」、`tide:navigate` 事件）指到 `timeblock`/`inbox` 一律重定向到时间线；启动页 `lastView` 落在被裁视图时回退四象限。
- **设置页**：启动页下拉按平台过滤选项（APK 不出现时间块 / 收件箱，桌面不出现时间线）。
- **图标**：`tools/gen-plugin-icons.py` 新增 nav `timeline` 条目（Icons8 Color `timeline`），随包 PNG + `ATTRIBUTION.md` + `icons.js NAV_ICONS8` 回落清单三处对齐；快捷菜单用 FontAwesome 精灵图 `timeline`。
- **样式**：`styles.css` 新增 `.tlv-*` 段，全部走主题令牌（深色派生自动跟随）；≤760px 紧凑适配；不贴顶贴底，不涉安全区。

### 影响端

- Android（APK）：✅ 主要目标。
- 桌面端：无任何变化（时间线不可达，时间块 / 收件箱原样）。
- 数据：无迁移（时间线只读既有 blocks / tasks，无 due 的任务不上线）。

### 测试

- 新增 `scripts/test-timeline-view.mjs`：纯函数单测（事件收集 / 排序 / 分组、年份徽章触发、今天 / 过期 / 完成标记、跨年分组）。
- 全量 `run-tests.mjs` 通过；`sync-version --check`、`gen-theme-dark --check`、`build-schedule-plugin --check`、`sync-android-native --check` 通过。
- 390×844 无头 Chrome 截图目检：时间线外观 / 卡片展开（具体时间 + 正文）/ 底栏三入口 / 桌面四视图不变。

---

## 改：内容区左右滑动从「翻页切界面」改为「返回上一页」（用户要求）

### 需求（用户原话）

1. 「把左右滑动切换应用界面删除」
2. 「左右滑的返回手势是回到上一页的功能」

### 改法（`src/shell.js` 手势段一处）

手势框架（touchstart / touchcancel / touchend + `SWIPE_SKIP` 排除清单 + 「横向主导且 ≥56px」阈值）原样保留，
只把 touchend 的动作换掉：

| | 改前 | 改后 |
|---|---|---|
| touchend 动作 | `allViewIds()` 按序取上/下一个视图 → `switchTo(next, dir)`（翻页切界面） | `goBack()`（backNav 的返回键同款：先关最上层浮层，无浮层才回上一个视图；没格子可回静默忽略，**不会误退应用**） |
| 方向语义 | 左滑=下一个、右滑=上一个 | **左右滑都是返回**（与 Android 返回手势惯例一致） |

- `SWIPE_SKIP` 排除清单照旧：横滑课表 / 泳道 / 甘特这类「自己能横向滚」的内容时滚的是内容，不会被抢去当返回。
- 设置项 `swipeNavigation` 键名**不回退**（归一化与旧数据兼容），只改语义与文案：
  设置 › 界面与交互 「触摸左右滑动翻页」→「**触摸左右滑动返回上一页**」，关掉它滑动即不触发任何动作。

### 影响端

- Android / 桌面（共用 WebView）：✅（触屏设备才有滑动；桌面鼠标无影响）
- 小程序：不涉及（其 swipe 是任务卡片左滑操作，另一套实现）

### 测试

- `scripts/test-back-nav.mjs` 静态接线追加四条：touchend 必须调 `goBack()`、滑动块内**不得再出现** `allViewIds`/`switchTo(`（防翻页逻辑回潮）、开关短路保留、56px 阈值守卫保留。
