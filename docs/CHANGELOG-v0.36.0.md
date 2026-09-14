# Le时间管理 v0.36.0

## 改了什么

两条用户反馈（其实是同一处交互）：

> 校园服务可收起来和展开，默认收起来状态，收起展开动画做好，收起展开方向为左上角到右下角。
> 警大通知记得随收缩而动。

### 一、校园服务栏：默认收起，点一下从左上角展开

警大门户通知左侧那栏（WebVPN / 教育邮箱 / 教务 / 学工 / 一网通办）以前是**常驻** 214px，
把「警大通知」正文挤在右边。现在：

- **默认收起**：进插件看不到那栏，只在左上角留一个 **「▸ 校园服务」把手**。
- **点把手展开**，展开后侧栏头部多一个 **「◂」**，点它收回。
- 收起状态**只活在本次插件会话**里：进插件永远回到收起（需求就是"默认收起来"），
  但你在里面展开了，之后登录成功/刷新列表重绘不会又给你收起来。

**动画**：`.pp-side` 的 `width` 走 `0.34s cubic-bezier(.22,.8,.22,1)`（和插件里卡片展开同一条曲线）。
关键三点：

1. **正文跟着动** —— `.pp-main` 是 `flex:1`，侧栏宽度过渡时布局每帧重算，正文自然平滑地
   从左边让出 214px，不需要给正文写任何动画。为此把 `.pp-shell` 原来的 `gap:16px` 换成了
   `.pp-side{margin-right:16px}`：`gap` 在元素宽度为 0 时**依然占位**，收起后会白留 16px，
   而 margin 能一起过渡到 0。
2. **动画期间文字不重排** —— 侧栏外层 `overflow:hidden`，内容裹一层 `.pp-side-inner` 并**固定 214px**。
   否则宽度动画时文字会一路折行，看起来像在抖。
3. **方向：左上角 → 右下角** —— `.pp-side-inner` 的 `transform-origin:left top` +
   收起时 `scale(.88) translate(-10px,-10px)`。宽度方向是左右收放，内层缩放带来的纵向位移
   与之叠加，观感就是内容**自左上角往右下角长出来 / 收回左上角**。

把手本身是 `.pp-shell` 的**正经 flex 子项**（不是浮层），所以永远压不住正文；
展开时它的 `max-width` 收到 0，与侧栏的 `width` 过渡同时进行，**没有跳变**。
`position:sticky` 让通知列表滚很长时也够得着。

窄屏（≤820px）时侧栏本来是整层叠在正文上面的，所以那里收起改为收**高度**
（`max-height:1400px → 0`），同样带过渡。

插件清单版本 `1.6.0 → 1.7.0`，已跑 `tools/sync-plugins.js` 重生成两端 catalog。

### 二、回归与验证

- `scripts/test-cppu.mjs` 新增一组断言：默认 `sideOpen:false`、默认渲染带 `side-collapsed`、
  收起/展开两个开关都在、开关真的切状态、宽度必须有过渡、收起必须宽度归零、
  内层固定宽度、`transform-origin:left top`、内层收起有缩放、窄屏走 `max-height`、
  间距挂在侧栏上；外加一条**负向断言**——外壳不许再用 `gap:16px`（否则收起后仍留空隙）。
- **真浏览器实测**（无头 Chrome + 真 `src/styles.css` + 真插件源码，只桩掉 `tide`）：
  为看清正文让位，直接把插件的 `buildMain` 暴露出来渲染**真实的「警大通知」列表页**，
  量到两态几何：

  | | 侧栏宽 | 把手 | 正文左边界 |
  |---|---|---|---|
  | 收起（默认） | `0` | 92px @ x=56 | `160` |
  | 展开 | `214` | 0（隐藏） | `286` |

  正文左边界 160 ↔ 286，正是「随收缩而动」。另量到 `transform-origin: 0px 0px`（= left top），
  收起态内层矩阵 `matrix(0.88, 0, 0, 0.88, -8.8, -8.8)`，过渡属性为
  `width, margin-right, padding, border-width, opacity`（0.34s / 0.3s / 0.24s）。
- 浅色 / 深色 × 收起 / 展开 四张截图，见 `output/preview/cppu-sidebar-collapse.png`。
- `npm test` 全部通过；`sync-version.js --check`、`gen-theme-dark.js --check`、
  `build-schedule-plugin.js --check` 三项守卫均 ✓。

> 说明：无头 Chrome 的 `--virtual-time-budget` 会把过渡直接快进到终点，抓不到动画中间帧
> （试过 `getAnimations()` 暂停 + scrub、也试过放大时长，都拿不到），
> 所以动画是靠**过渡属性 + 两个末态几何 + 内层变换矩阵**共同确认的，不是靠一张"半路上"的截图。

## 影响范围

- Windows / Android：警大门户通知插件左侧校园服务栏改为默认收起，正文视区变宽。
- 微信小程序：该插件为 `unavailable`（依赖桌面端 SSO 链路），本版无影响。
- 其余插件无影响。

## 移动端（Android）补充

桌面与 Android 共用同一份前端代码（`public/plugins/cppu-notify/main.js`），收展逻辑天然一致；
但上面那版**只验证了桌面宽屏**。补做手机尺寸实测（390×844 视口 —— Windows 上无头 Chrome 的窗口
最小宽度被钳在 500px，所以把页面放进 390px 宽的 iframe 里逼出真实视口，`@media` 按 iframe 宽度判定）
后发现并修掉三处：

| 问题 | 实测 | 修法 |
|---|---|---|
| 窄屏**展开**时，被藏起来的把手仍占 44px 高度 → 侧栏与正文之间留一条看不见的空隙 | 隐身占位 `0×44` | 收起态同时归零 `max-height` 与 `min-height` —— **CSS 里 `min-height` 大于 `max-height` 时 `max-height` 会被忽略**，只写后者无效 |
| 收起后的把手只有 92×35，低于触屏 44/48px 建议点击区 | `92×35` → `101×44` | 窄屏下把手、侧栏头部两个图标 ≥44px，侧栏入口 ≥52px |
| `prefers-reduced-motion` 只覆盖了卡片，侧栏/把手照旧动画（Android 省电模式、系统「移除动画」无效） | — | 把 `.pp-side` / `.pp-side-inner` / `.pp-side-toggle` 一并纳入降级 |

顺带修的手机端体验：

- 窄屏工具栏原本纯靠自动换行碰运气，「刷新」会独占一整行；现在关键词搜索框独占一行、其余按钮与
  开关共用一行，按钮统一 44px 点击高度。
- 交互元素加 `touch-action: manipulation`（消除双击缩放带来的点击延迟）与
  `-webkit-tap-highlight-color: transparent`（去掉触屏高亮块），并补 `:active` 反馈。

验证：390×844 视口两态截图见 `output/preview/cppu-sidebar-phone.png`；`scripts/test-cppu.mjs`
新增 7 条窄屏/触屏断言（含 `min-height` 与 `max-height` 的压制关系、44/52px 点击区、
reduced-motion 覆盖面）。`npm test` 22 个脚本全部通过。

