# v0.58.1 · 安全区补漏（APK）

**日期**：2026-09-18
**类型**：patch（样式修正 / 遮挡 bug）
**影响端**：Android（APK）；桌面与 iOS 行为不变
**数据迁移**：无

---

## 背景

Android 上 `MainActivity` 调了 `enableEdgeToEdge()`，状态栏与导航栏变成**透明浮层**盖在
WebView 之上，按 Android 约定应用必须自己消费 `WindowInsets`。而 **WebView 不实现 CSS 的
`env(safe-area-inset-*)`**（取值恒为 0，`viewport-fit=cover` 也没用），所以真实值只能由
原生侧读出来后注入 `--sat / --sab / --sal / --sar`，前端一律写双路：

```css
padding-top: var(--sat, env(safe-area-inset-top, 0px));
```

这套机制自 v0.37.15 就在，主界面（顶栏 / 底栏 / 抽屉 / toast / 设置页标题栏）都已覆盖。
但仍有四处**漏了双路写法**，用的都是「固定物理边距」，而系统栏 inset 实测在布局坐标约
30px 上下 ⇒ 被状态栏或导航栏压住。

## 修复

| # | 位置 | 原写法 | 问题 | 现写法 |
|---|---|---|---|---|
| ① | `.update-toast`（应用内更新提示条，左下角） | `left/bottom: 22px` | 22px < 导航栏 inset ⇒ 被手势条压住一截 | `calc(22px / var(--ui-scale,1) + var(--sab, env(...)))`，左侧同理吃 `--sal` |
| ② | `.ai-rule-editor`（AI 规则编辑器，居中弹窗） | `max-height: min(760px, calc(--ui-vh - 32px))` | 居中后上下各只剩 16px ⇒ 状态栏压标题、导航栏压底部按钮 | 高度上限再扣 `--sat` 与 `--sab` |
| ③ | `.settings-modal-body`（窄屏全屏设置弹窗的滚动容器） | 无底部安全区（窄屏 `.set-wrap` 的 padding-bottom 只有 2px） | 滚到底时最后一项被导航栏盖住（本层是 fixed 全屏，不走 `.view` 的 `--nav-pad`） | `padding-bottom: var(--sab, env(safe-area-inset-bottom, 0px))` |
| ④ | 插件 `web-collector` 的内嵌网页面板 `.wc-web-panel` | `inset: 18px` | 18px < 状态栏 inset ⇒ 面板顶部伸到状态栏下面 | 四方向 `calc(18px + var(--s-*, env(...)))` |

## 守卫

`scripts/test-android-layout.mjs` 新增 4 组断言（共 9 条），逐条钉住**精确的 calc 结构**
而不是「出现了 `--sab`」——否则 `bottom: var(--sab)` 这种把 22px 边距整个丢掉的写法也会
骗过断言。同时钉住反面：不许裸用 `env()`（Android 上恒为 0）、不许退回旧写法。

变异验证（把实现改回旧写法）5 条全部失败 ⇒ 断言有分辨力。

## 已知未处理（刻意）

- 视口坐标的右键菜单（`.popmenu`、`.sn-tabmenu`）只有 `Math.max(8, …)` 的 8px 下限，
  没有扣安全区。移动端几乎不触发右键，且改它们要在 JS 侧读 CSS 变量，成本不划算 —— 先记着。
- `.cap-modal`（88%）与 `.ingest-panel`（86%）居中弹窗：上下各留 6~7%，在 390×844 下
  约 50~59px，大于系统栏 inset，够用，本次不动。
