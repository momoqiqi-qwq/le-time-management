# v0.71.0 · 时间块页七种视图共用一个缩放系数，右上角给三颗键

## 需求

> 让时间块内的界面都适配触碰板的放缩手势，并在右上角添加放大的加号和默认和缩小的减号。

只影响桌面端（Windows / macOS / Android WebView 里同样能捏），小程序没有这套视图。
**无数据迁移**：缩放比例沿用课时格早就在用的 `settings.timeViewZoom`，只是从「一种视图专用」
变成「整个时间块页共用」。

## 改造前：只有课时格捏得动

v0.43.0 给课时格（内部 id 仍叫 `wakeup`）接过一套触控板捏合 + 双指缩放，其余六种视图没有 ——
在「日时间轴」「里程碑」「横向时间轴」「卡片时间轴」「年度甘特」「阶段甘特」里两指捏合，
拿到的是 WebView 自己的整页缩放（顶栏、侧栏、任务池一起变大），而不是这块画布变大。
而且那套手势没有任何明面上的入口：不知道能捏、不知道能捏到多大、缩过头只能一点点捏回来。

## 一个系数，七种视图

`createTimeViewZoom(container)` 造出**唯一**的缩放状态，把系数写成 CSS 变量
`--tv-zoom` 挂在时间块视图的根容器上（区间 0.6~2，步进 0.1，存 `settings.timeViewZoom`）。
七种视图各取所需，JS 侧不再逐视图写系数：

| 视图 | 消费方式 | 为什么是这一种 |
|---|---|---|
| 日时间轴 | `.tl-canvas { zoom: var(--tv-zoom) }` | 块的内联 `top/height`、行高、字号全在画布空间里，zoom 一次乘完 |
| 课时格 | `.wakeup-view { --wk-zoom: var(--tv-zoom) }` | 那张网格是 `height:100%` + `1fr` 铺满容器的，用 `zoom` 属性会反向（v0.43.0 实测过），只能保留「尺寸 × 系数」的写法 |
| 里程碑 / 年表 / 年度甘特 / 阶段甘特 | 各自画布上 `zoom: var(--tv-zoom)` | 画布内部全是 px 或 % 定位，一条规则整体等比放大 |
| 卡片时间轴 | 新增内容层 `.ct-zoom` 上 `zoom` | 轨道宽度带 `94%` 上限，见下文 |

**手势面用 `data-zoom-surface` 声明**（六种非日视图各标一处自己的滚动容器，
日时间轴由 `timeblock.js` 直接把 `.tl-scroll` 接上）。
`attachViewZoomGestures()` 是 v0.43.0 那套逻辑的原样搬移：`ctrl+wheel`（触控板捏合在
Chromium 里就长这样，顺带白送键盘用户）+ 双指 `touchmove` 距离比 + 双击复位，
`{passive:false}` 才拦得住 WebView 自己的页面缩放，锚点仍按「滚动内容里的相对位置」算。
日时间轴**关掉双击复位**：那里双击会命中时间块弹出块菜单，一次双击同时「改比例 + 开菜单」
是最坏的巧合，回头路交给右上角那颗默认键。

## 右上角三颗键

`.time-viewbar` 最右端（`margin-left:auto`）：

| 键 | 语义 |
|---|---|
| `＋` | 放大一档（+0.1）；到 200% 自动置灰 |
| `100%` | 既是当前比例，也是「默认」：点一下回 100%，非 100% 时点上深色 |
| `－` | 缩小一档（−0.1）；到 60% 自动置灰 |

顺序按需求原话给：**放大、默认、缩小**。三颗键共用一套，七种视图不各做一套；
窄屏长到 44×44（触控目标下限，与 `.time-viewitem` 同一档），同时把视图切换器从
`width:100%` 改成 `flex:1`，否则同一行会被挤出去。

## 两个必须写下来的坑

### 1. 指针落点要除以生效系数（顺带修了「界面缩放」的同一类漏算）

CSS `zoom` 是布局级的：`clientY` 与 `getBoundingClientRect()` 给的都是物理像素，
而时间块的内联 `top/height` 写在未缩放的空间里。所以「屏幕 Y → 分钟」必须先在
`minFromY()` 里除以生效系数，否则 150% 下会把 1 分钟当成 1.5 分钟 —— 落点偏一半。
系数是两层的：**本视图的 `--tv-zoom` × 「界面缩放」的 root zoom**，
后者是这次一并补上的（原来只除了个位数，150% 界面缩放下拖动落点本来就偏）。

### 2. `zoom` 元素的内部可用宽会被除以 `zoom`

`.tl-canvas` 只写 `zoom` 的话，画布物理宽度恒定不变、里面的字数却按系数变大 ⇒
**越放大越截字**，放大反而看不清。补一条 `min-width: calc(100% * var(--tv-zoom, 1))`
之后画布物理宽 = 容器宽 × 系数，超出部分交给 `.tl-scroll` 横滚，与浏览器整页缩放同手感。
卡片时间轴是同一个问题的另一种形态：轨道 `min(840px, 94%)` 里的 94% 是物理不变量，
光放大内容会让两列卡片压到中轴上 ⇒ 轨道宽度改成
`max(min(840px, 94%), calc(700px * var(--tv-zoom, 1)))`（700 = 两列卡片 270 + 连线 70 各一 + 缝），
并给它套一层 `.card-scroll` 横滚容器 —— `.tv-panel` 是 `overflow:hidden`，没处滚就直接裁掉右半边。

## 实测（探针：把 ≤760px 媒体块关掉、≥761px 打开，容器写死 1269px）

日时间轴：

| 系数 | 小时行物理高 | 画布物理宽 | `.tl-scroll` scrollWidth |
|---|---|---|---|
| 1 | 62.0 | 719 | 719（不横滚） |
| 1.21（一次 ctrl+wheel） | 75.1 | — | — |
| 1.5 | 93.0 | 1078.5 | 1079（横滚出现） |
| 0.6 | 37.2 | 719（仍铺满，不留白） | 719 |

另外量到：普通滚轮 `defaultPrevented = false`（放行给原生滚动），`ctrl+滚轮 = true`；
双指 touchmove 从 1 捏到 1.7；日时间轴双击比例不变、里程碑双击从 1.5 回到 1；
连点 `＋` 二十次精确停在 `2`（label 200%、`＋` 置灰）、连点 `－` 停在 `0.6`（`－` 置灰）；
离开视图后 `documentElement` 上查不到 `--tv-zoom`（变量挂在视图容器上，节点一起消失）。

六种非日视图在**系数 1 时与改造前逐像素一致**（轨道 840 / 年表画布 1500 / 甘特 1191 /
泳道 1250 / 课时格网格 1187 / 里程碑行 1187×250），系数 1.5 时按预期长：
卡片轨道 1050、年表 2250、甘特 1680、泳道 1875、课时格 1350×1344、里程碑行高 375 且**仍是 4 列**。

## 一个浮点坑

`0.7 − 0.1 = 0.5999999999999999`，于是「已到 60% 下限但 `－` 键不置灰」
（差 1e-16 判不出 `<=`），而且这串小数尾巴会被持久化进 `settings.json`。
按键路径改成 `stepBy()` 先四舍五入到百分位；手势路径是连续值，交给 `clampZoom` 夹取。

## 改动清单

| 文件 | 改动 |
|---|---|
| `src/views/timeViews.js` | `attachWakeupGestures` → 通用的 `attachViewZoomGestures`（新增 `dblToReset` 开关）；新增 `createTimeViewZoom`（写 `--tv-zoom` + 三键 DOM + 600ms 延后落盘 + `flush()`）；`renderTimeView` 多收一个 zoom 参数并按 `data-zoom-surface` 接手势；六个视图各标一处手势面；卡片时间轴加 `.card-scroll` + `.ct-zoom`；课时格不再自己写 `--wk-zoom`；`toast` 导入随之删掉（缩放有常驻读数，不再弹提示） |
| `src/views/timeblock.js` | 建控制器并把三键挂进 `.time-viewbar`；`.tl-scroll` 接手势（`dblToReset:false`）；`viewScale()` + `minFromY()` 统一三处「屏幕 Y → 分钟」的换算；`_unsub` 里 `zoom.flush()` |
| `src/styles.css` | `.tl-canvas` / `.milestone-track` / `.chronicle-canvas` / `.gantt-grid` / `.swim-grid` / `.ct-zoom` 消费 `--tv-zoom`；`.wakeup-view` 把 `--wk-zoom` 改成别名；`.tl-canvas` 补 `min-width`；`.card-timeline` 宽度改 max() 式；六个滚动容器补 `touch-action:pan-x pan-y` + `overscroll-behavior:contain`；`.tv-zoombar` 三键外观与窄屏 44px |
| `scripts/test-time-views.mjs` | 回归 7 的 `--wk-zoom` 断言改成「别名 / JS 不再写系数」；新增回归 8：六处手势面标记、六个 CSS 消费点、`.tl-canvas` 的 min-width、日时间轴不许二次乘系数、落点必须除系数（含 `--ui-scale`）、卡片轨道保底宽 ≥680 与 `.card-scroll`、三键顺序与上下限置灰、窄屏 44px 与切换器不得 `width:100%` |

## 校验

```
✓ 三端版本一致：v0.71.0
✓ 派生调色板已同步（15 套深色变体）
✓ shiguang-schedule 生成物与源一致
✓ Android 原生代码与版本化镜像一致
PASS: 55 个测试脚本全部通过
```
