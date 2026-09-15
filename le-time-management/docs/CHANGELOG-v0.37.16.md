# v0.37.16 · 手机状态栏不再压住顶栏

只动 Android 原生与 CSS 安全区取值，**无数据迁移**、不影响桌面端。

## 反馈

截图里「设置」页的标题、副标题压在状态栏图标下面，右上角「关闭」按钮被 5G / 4G /
电量 64 覆盖 —— 顶栏整体和系统状态栏重叠。

## 根因（两层叠加）

1. **窗口是 edge-to-edge**：`MainActivity.onCreate` 调了 `enableEdgeToEdge()`，
   状态栏与导航栏变成**透明浮层**画在 WebView 之上。Android 的约定是：应用声明了
   edge-to-edge，就该由应用自己消费 `WindowInsets`。

2. **Android WebView 不实现 `env(safe-area-inset-*)`**：不管 `viewport-fit=cover`
   写不写，这几个环境变量在 WebView 里**取值恒为 0**（这是 WebView 的已知行为，
   不是配置问题）。于是 `styles.css` 里那一整套
   `padding-top: env(safe-area-inset-top, 0px)` 在手机上全部退化成 `0px`
   —— 顶栏从屏幕绝对顶部开始绘制，正好落进状态栏。

第一层是别人（Android 平台）的规则，第二层是 WebView 的能力缺口，单独修任一层都不成立。

## 修复

### 原生侧（`MainActivity.kt`）

用 `onWebViewCreate` 钩子拿到 WebView（WryActivity 已暴露这个回调，不用反射），
在 `window.decorView` 上挂 `setOnApplyWindowInsetsListener`，读 `systemBars` 的真实
inset，注入四个 CSS 变量：

```
--sat / --sab / --sal / --sar   （单位 px，对应 top / bottom / left / right）
```

几个必须这么写的细节：

- **四个方向都要**：横屏与折叠屏展开时挖孔会跑到侧边，只补 top 不够。
- **底部取 `max(systemBars.bottom, ime.bottom)`**：软键盘弹出时导航栏被顶掉，
  不跟 ime 取较大者的话输入框会被键盘压住。
- **`onPageFinished` 再补注入一次**：新文档会重置 `documentElement` 的内联样式，
  只注入一次的话前端热重载或页面跳转后就失效了。
- **兜底初值**：`onWebViewCreate` 早于第一帧 insets 分发，此时还没有真实值，
  先用 `status_bar_height` / `navigation_bar_height` 系统资源铺一层底，避免首屏闪一下重叠。
- **签名去重 + 吞异常**：inset 没变就不重复跨进程 eval；`evaluateJavascript` 在页面
  正在销毁时会抛，必须吞掉，否则连带把 Activity 拖崩。

### CSS 侧（`styles.css`）

17 处安全区取值统一改成**双路**形式：

```css
/* 前 */
padding-top: env(safe-area-inset-top, 0px);
/* 后 */
padding-top: var(--sat, env(safe-area-inset-top, 0px));
```

Android 命中原生注入的值，桌面 / iOS 落到原生 `env()`，两条路径互不干扰。
顺手补了两处横屏刘海：手机端顶栏与底栏的左右内边距也吃 `--sal` / `--sar`。

> ⚠️ **踩坑记录**：最初在 `:root` 里写了 `--sat: 0px;` 当"兜底默认值"，这是错的 ——
> 变量一旦在 `:root` 被定义为有效值，`var()` 的**第二个参数永远不会生效**，
> iOS 与桌面的原生 `env()` 会被彻底废掉。已加回归断言禁止这件事，并在 CSS 注释里写明原因。

## 测试

`scripts/test-android-layout.mjs` 新增 4 组断言：

- 原生必须读 `systemBars` 并注入 `--sat` / `--sab` / `--sal` / `--sar`，且挂 `onPageFinished`；
- CSS 不得出现裸 `env(safe-area-inset-*)`，且双路写法至少 15 处；
- `:root` 不得给这四个变量定义默认值（剥注释后判定，避免说明性注释误伤自己）；
- 窄屏顶栏必须同时吃 `--sat` 与左右 `--sal` / `--sar`。

断言有效性用**变异测试**验证过：分别注入「`:root` 加回 `--sat: 0px`」「顶栏退回裸 `env()`」
「Kotlin 去掉 `--sab` 注入」三种回归，全部被拦下，还原后通过。

## 影响面

- **Android**：需要重装 APK 生效（原生代码变更）。
- **桌面端**：`env()` 兜底走原路径，行为不变；`--sat` 等变量在桌面上没人注入，
  一律落到 `env(safe-area-inset-top, 0px)` = `0px`，与改前完全一致。
