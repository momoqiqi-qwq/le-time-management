# v0.37.7 · 切视图「弹 2 下」动画修复

## 问题（用户视频反馈）

学习通插件打开时界面莫名弹两下；小窗口里点侧边栏按钮切换视图也弹两下。

## 根因（两层叠加）

1. **切视图三层动画叠加**：旧页出场动画（`view.animate` 120ms 滑出淡出）→ 新页入场（`page-l/page-r` 240ms）→ 插件首绘又被 `observePluginMotion` 放一遍「上移 7px + 淡入」。
2. **学习通 `render()` 连环重绘**：`正在读取登录信息 → paintMain(缓存) → paintMain(登录后) → refreshAll 再绘`，每次 `innerHTML` 重灌都被 MutationObserver 捕捉，重放一次带位移的 topLevel 动画——每次重绘都是一记「弹跳」。

## 修法（宿主侧统一修，全部插件受益）

- `shell.js switchTo()`：**删掉旧页出场动画**，点击立即提交切换。动效只剩一次入场滑入 + 标题卡淡入。
- `motion.js observePluginMotion()`：
  - **挂载宽限期 350ms**（`settleMs`）：视图入场期间插件的首绘 / 缓存绘不再叠加动画；
  - 重绘动画**只留淡入、去掉 7px 位移**：异步数据到达的重绘是「浮现」不是「弹跳」。

## 验证

- 行为级探针：无头驱动给 iframe 打补丁包住 `Element.prototype.animate`，点击学习通后统计 3 秒窗口内带 `translate3d(0, 7px` 的动画次数 → **bounce=0**（修复前插件重绘会连放 2~3 次），仅剩 1 次标题卡动画。
- `test-motion.mjs` 新增守卫：禁 `shouldAnimateExit` 回归、必须有 `settleMs = 350` 宽限期、插件动画禁 7px 位移。
- `test-v0116-ai.mjs` 的 `view.animate` 守卫改为 `titleCard.animate`（出场动画已删）。
- 22 个测试脚本全部通过；`sync-version --check` ✓ 三端一致 v0.37.7。
