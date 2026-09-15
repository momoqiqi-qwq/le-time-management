# v0.37.17 · APK 返回键 / 双指缩放 / 设置页手风琴

三件事都是**手机端适配**，全部集中在 Android 与窄屏样式，**无数据迁移**，桌面端行为不变。

> ℹ️ **批次说明**：本批次动手时的树版本是 `v0.37.17`。并行会话随后把版本推到 `v0.37.18`
> （原始数据首启清空 + 抽屉「提前预警」重叠），两边改动同处一棵未提交的树，**最终以 `v0.37.18` 发布**。
> 所以文件名 `v0.37.17` 是**批次标签**，不是发布号 —— 本页描述的三项改动随 v0.37.18 一起出货。

## 反馈

1. 「apk 界面使用返回键时回到上一个界面，而不是直接退出软件」
2. 「apk 适配缩放（双指）手势」
3. 「apk 设置界面多弄收缩内容的方向箭头，apk 的设置界面应该适配界面」

## 一、返回键直接退出应用

### 根因

Tauri 的 `TauriActivity` 把 wry 的 `handleBackNavigation` **硬编码成 `false`**
（wry 自己的默认值是 `true`）。这个开关为 `false` 时，Android 返回键完全不经过
WebView 历史，直接 `finish()` 掉 Activity —— 所以无论当前在哪个界面，一按就退出。

而本应用是**单页 + 浮层**结构：切界面走的是 `switchTo()` 重绘，设置/抽屉/命令面板
都是浮在 `document.body` 上的遮罩，**没有任何真实页面导航**。
就算把 `handleBackNavigation` 打开，WebView 的 `canGoBack()` 也恒为 `false`。

所以两层都要修：原生放开开关，前端自己维护历史栈。

### 原生侧

```kotlin
override val handleBackNavigation: Boolean = true
```

打开后 wry 的策略变成「**WebView 能回退就 `goBack()`，不能回退才 `finish`**」，
于是最后一级退完自然退出应用。

教务导入窗口（`SchoolImportActivity`）**故意不覆盖**这个属性，仍是 `false`，
保持「返回键 = 关闭该窗口」——它本来就是独立 Activity，有自己的三条退出通道。

### 前端：`src/backNav.js`（新）

历史栈里只有两种格子：

| 格子 | 何时压 | 按返回时 |
|---|---|---|
| 视图格 `{ ltmView }` | 真正切界面（`shell.switchTo`） | 回到上一个界面 |
| 浮层格 `{ ltmGuard, ltmView }` | 浮层打开时 | 关掉最上面那层浮层 |

浮层为什么要「看 DOM」：设置弹窗 / 抽屉 / 命令面板 / 快速捕获 / 询问框 / AI 规则编辑器
分散在八个模块里各自实现，逐个改去压历史等于以后新增的还会漏。这里只用一个
`MutationObserver` 盯 `document.body`，出现 / 消失遮罩就重新对账：

- 浮层开着却没有浮层格 → 补一格；
- 浮层都没了却还剩浮层格 → `history.back()` 把它退掉。

于是浮层无论是被返回键关的、被自己的按钮关的、还是被别的代码 `remove()` 掉的，
历史位置都会自动回到正确的地方 —— **不会留下「按一下没反应」的空格子**。

不变量：**只要还有浮层开着，栈顶就有且只有一格浮层格。** 首页且什么都没有时栈里
只剩最初那一格，`canGoBack()` 为 `false`，返回键直接退出应用（符合 Android 预期，
不是「先按一下没反应、第二下才退」）。

关浮层按覆盖广度走三条路：① 点遮罩（抽屉 / 设置弹窗 / 命令面板 / 询问框都这么绑）
→ ② 面板自己的 `_close()` → ③ 这一层里带「关闭 / 取消 / 收起 / ×」字样的按钮
（判据与 `motion.js` 的 `isCloseControl` 一致，只在本层内找，不会误触「确定」）。

⚠️ `OVERLAY_SELECTOR` 是这份文件**唯一需要跟着浮层一起维护的清单**。命令面板用
`.cmd-mask`、另一处捕获浮层用 `.cap-mask`，历史上各写各的，已一并收进来。
新增浮层优先直接复用 `.drawer-mask`（那样零改动）。

配套改动：`shell.js` 给 `switchTo` 加了 `opts.history`，程序性重渲染
（刷新当前视图 / 注册表变化回正 / 首屏）一律传 `{ history: false }` ——
否则返回键要多按好几下才退得出去。

## 二、双指缩放没反应

两个原因叠加，**必须一起改**：

1. **原生**：WebView 默认 `builtInZoomControls = false`，内置缩放机制根本没开。
2. **前端**：`index.html` 的 viewport 写着 `user-scalable=no`，Blink 会照它直接禁掉
   缩放手势 —— 即使原生把开关打开了也没用。

修法：原生 `onWebViewCreate` 里 `setSupportZoom(true)` + `builtInZoomControls = true`
（`displayZoomControls = false` 藏掉自带的 +/- 悬浮件）；前端新增
`src/mobileViewport.js`，`boot()` 第一件事就调用它，**只在手持设备上**把 viewport 换成
`maximum-scale=5.0` 的版本。

桌面必须保持原样：窗口缩放交给应用自己的「启动窗口大小」设置，
Ctrl+滚轮放大只会让用户以为界面坏了。所以 `index.html` 一个字没动。

## 三、窄屏设置页手风琴

原来窄屏是「横向分类 chip 行 + 一次只显示一块内容」：11 个分类要横着滑才看得全
（每项 `flex: 0 0 200px`），而且当前分类下面还有什么完全看不见。

现在 ≤980px 改成手风琴：

- 每个分类一行标题：语义图标 + 名称 + 提示 + **可旋转的方向箭头**（纯 CSS 画的 V 形，
  不依赖图标字体；收起朝下、展开 180° 掉头）；
- 点标题就地展开 / 收起，**允许多个同时展开**；首次进入至少展开当前分类；
- 标题行 `min-height: 52px`（≥44px 触控区），整行可点；
- 收掉横向 chip 行（分类切换已由标题行承担，两个入口重复又占首屏），
  搜索框保留，搜索时命中的分区自动展开、清空搜索词还原搜索前的展开状态；
- 屏幕旋转 / 窗口拉宽跨过断点时重新对账。

桌面（>980px）**完全不变**，仍是「左侧分类 + 右侧单页」：标题行整体 `display: none`。

> ⚠️ **踩坑记录**：作者样式里写了 `.settings-acc { display: block }`，
> 它会盖掉 UA 的 `[hidden] { display: none }`（同为 0,1,0 特异性、作者样式后写者胜）
> —— 少了显式的 `.settings-acc[hidden] { display: none !important }`，
> **11 个分区会全部堆在设置页上**。已加回归断言守着。

配套：`settings/navigator.js` 改成产出 `panels`（分区外层 + 标题行 + 内容），
`views/settings.js` 按它渲染；`styles.css` 里 `.settings-content > .settings-section`
的选择器同时覆盖 `.settings-acc-body > .settings-section`。

## 测试

- **新增 `scripts/test-back-nav.mjs`**：不是源码文本断言，而是配一套极简的
  DOM / History / MutationObserver 替身把 `backNav.js` **真的跑起来**，10 个场景：
  首页不可回退、切视图回退、连点同一导航项不压格、浮层优先、浮层被按钮关掉后回收、
  两层浮层逐层关、询问框走「取消」且不误触「确定」、命令面板（`.cmd-mask`）也能关、
  无关 DOM 变化不动栈、浮层开着时切视图只改视图名。
- **`test-android-layout.mjs` 新增 3 组**：原生 `handleBackNavigation` / 缩放开关；
  遮挡类名清单、`{ history: false }` 的调用数、viewport 只对手机放开；
  手风琴（含上面那条 `!important` 陷阱、窄屏标题行 / 箭头 / chip 行收起、
  桌面标题行隐藏、`panels` 接线）。
- 断言有效性用**变异测试**验证过：分别注入「遮罩类名清单退回只有 `.drawer-mask`」
  「去掉浮层格回收」「`noteViewChange` 不再去重」「去掉取消按钮兜底」
  「初始化不写初始视图」五种回归，全部被拦下，还原后通过。

## 视觉验证（真 CSS 渲染）

用无头 Chrome + 390×844 的 iframe（Windows 无头 Chrome 的布局视口会被钳在 500px，
必须靠 iframe 逼出真机视口）实测：

| 视口 | 结论 |
|---|---|
| 390×844（手机） | 横向溢出 **0px**；11 个分区；chip 行 `display:none`；标题行高 54px、右缘 376px；点标题 `open` / `bodyVisible` / `aria-expanded` 三态同步；收起态箭头朝下、展开态 180° |
| 1280×900（桌面） | 左栏 `display:flex` 保留；**可见分区数 = 1**（11 个没有堆在页面上）；横向溢出 0；弹窗 1208×828 居中 |

截图见 `output/preview/settings-acc-390-list.png`（收起目录 + 方向箭头）与
`settings-acc-390.png`（展开态）。

> ⚠️ 无头 Chrome 的 `--virtual-time-budget` 会让 **CSS transition 停在半路**，
> 所以 `getComputedStyle(...).transform` 在无头里读到的是过渡中间值 ——
> 断言要看类名 / `hidden` / 几何，**不要拿 transform 当判据**。

## 影响面

- **Android**：三件都要重装 APK 才生效（原生 Kotlin 有改动）。
- **桌面端**：`handleBackNavigation` 与 WebView 缩放设置只在 Android 生效；
  `backNav.js` 在桌面也会挂上（浏览器后退 / `Alt+←` 走同一条逻辑，行为等价于「回上一屏」），
  首屏不做任何多余压栈，不影响任何现有操作。
- **小程序**：不涉及。
