# Le时间管理 v0.36.2

## 改了什么

本版是 v0.36.0「校园服务栏默认收起」的**移动端补充修复**的版本落点。

v0.36.0 只验证了桌面宽屏。补做 **390×844** 手机视口实测后（Windows 上无头 Chrome 窗口最小宽度
被钳在 500px，故把页面放进 390px 宽的 iframe 逼出真实视口，`@media` 按 iframe 宽度判定）
发现并修掉三处缺陷：

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

> 收展本身的实现（默认收起、左上角展开、正文随收缩而动）见 `CHANGELOG-v0.36.0.md`。

## 影响范围

- **Android**：手机端警大通知插件收展不再留隐形空隙、把手点击区达标、省电模式下不再播放动画。
- **Windows**：与 Android 共用同一份 `public/plugins/cppu-notify/main.js`，但本版改动集中在
  窄屏断点与触屏交互，宽屏无功能变化。
- **微信小程序**：该插件为 `unavailable`（依赖桌面端 SSO 链路），无影响。

插件清单版本 `1.7.0 → 1.7.1`，已跑 `tools/sync-plugins.js` 重生成两端 catalog。

## 校验

- `scripts/test-cppu.mjs` 新增 **7 条**窄屏/触屏断言，含 `min-height` 与 `max-height` 的压制关系、
  44/52px 点击区、`prefers-reduced-motion` 覆盖面。
- `npm test` **22 个脚本**全部通过。
- `node tools/sync-version.js --check` ✓
- 390×844 视口两态截图：`output/preview/cppu-sidebar-phone.png`。

## 数据迁移

无。本版只改样式与断点，不涉及存储结构。
