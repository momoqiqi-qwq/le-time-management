# v0.58.2 · 三键导航栏适配补漏

## 改了什么

排查全部「贴底 / 居中 / JS 定位」的浮层后，补齐 8 处没把 Android 三键导航栏（~48dp）高度算进去的地方。均为 bug 修复（patch）。

### CSS（居中 / 全屏弹窗）

| 位置 | 问题 | 修法 |
|---|---|---|
| `.cap-modal` | `max-height: 88%` 居中后底部只剩 6%，三键导航栏正好压住「保存」按钮行 | 高度上限减去 `--sat + --sab`（沿 v0.58.1 `.ai-rule-editor` 模式） |
| `.ingest-panel` | `max-height: 86%` 底部只剩 7%，吸底操作条的「确认写入」被压 | 同上 |
| `.app-dialog-mask` | `padding: 20px` 均一内边距 < 导航栏高度，确认/取消按钮行被盖 | 四边 padding 各自叠加 `--sat/--sar/--sab/--sal` |

### JS 定位浮层（贴底钳制 margin 只有 8~20px，挡不住 48dp 导航栏）

| 位置 | 问题 |
|---|---|
| `ui.js` `popmenu()` | 右键/长按菜单底部钳制只留 10px |
| `shell.js` 插件右键菜单 | 只留 8px |
| `shell.js` `positionQuickDock()` / `positionQuickDockNear()` | 快捷入口面板 margin 12~20px |
| `timeViews.js` 课表「更多」菜单 | 只留 8px |

修法：`ui.js` 新增 `bottomInsetPx()` —— 读 MainActivity 注入的 `--sab`（Android 真实导航栏高度），桌面 / iOS 取不到返回 0，行为不变。五处钳制统一叠加该值。

## 影响哪端

- **Android**：三键导航栏与手势条两种模式下，弹窗按钮行、菜单、快捷入口面板不再被底部系统栏压住。
- **桌面 / iOS**：`--sab` 不存在 → `bottomInsetPx()` 返回 0、`env()` 为 0，所有行为与 v0.58.1 完全一致。

## 有没有数据迁移

无。settings 结构未动（`quickDock` 定位仍是 `{left, top}`，只是钳制范围变了）。

---

# 追加批次 · APK 顶栏整条移除（用户需求「把apk上面那栏删除」）

## 改了什么

手机端（≤900px）顶栏在 v0.52.0 沉浸式外壳里是「⋮ 呼出才显示」；本批次起**整条移除**——无论 ⋮ 呼出与否都不再出现，⋮ 只剩呼出底栏一个职责。

| 文件 | 改动 |
|---|---|
| `src/styles.css`（≤900px 沉浸式块） | `.app:not(.chrome-shown) .topbar → display:none` 改为 **`.app .topbar { display:none }`**（无条件）；删除 `.app.chrome-shown .topbar` 的 padding-right 规则；`.view` 的 `--sat/--sab` 安全距离由「仅收起态」扩为「收起态 + 呼出态」成组选择器（顶栏不再替内容占位）；删除 `.app.chrome-shown .mobile-back { display:none }` 让位规则 |
| `src/shell.js` | ⋮ 键 aria-label「显示或隐藏顶栏与底栏」→「显示或隐藏底栏」；相关注释同步（行为语义：顶栏已移除） |

要点：

- **返回能力不受损**：顶栏里的返回键（`.topbar-back`）随顶栏一起消失，左上角悬浮返回键（`.mobile-back`）成为手机端唯一返回入口——它不再有「呼出态让位」，呼出底栏时也保持可见（`.show` 门控不变，仍与 Android 返回键共用 `canGoBack()`）。
- **桌面端（≥901px）顶栏完全不动**：标题卡、工具方框（搜索/快捷入口/主题/窗口键）、拖动排序全部照旧。

## 影响哪端

- **Android / 手机端**：顶栏消失，⋮ 只控制底栏；返回靠左上悬浮键与系统返回键。
- **桌面端**：无变化。

## 有没有数据迁移

无。`settings.topbarOrder`（桌面顶栏排序）保留，桌面上继续生效。

## 验证

- 守卫测试 `scripts/test-chrome-toggle.mjs` 契约反转更新：钉「`.app .topbar → display:none`」+ 两条反向守卫（不许再出现 `.app.chrome-shown .topbar` 规则；不许再藏悬浮返回键）；`.view` 安全距离断言改为成组选择器形态。
- 四项 `--check` 全绿（v0.58.2 三端一致）+ 全量 **52 个测试脚本全部通过**。
- 无头 Chrome 390×844 真实应用探针（iframe 逼出真视口 + 两步导航种浅色主题）：默认态顶栏 `none` / 呼出态顶栏仍 `none`；底栏 `none→flex`；`.view` 顶部安全距离两种状态均 46px；悬浮返回键两种状态均可见（`.show` 挂上）；⋮ 键 36×36 落在右侧 45% 高度；页面横向溢出 0。截图 `output/preview/topbar-removed-390-{default,open}.png` 目检通过。
- 探针备注：呼出态测到 `.view.page-l` 右缘超出 16px 为**虚拟时间冻结切换动画的伪象**（页面级 scrollWidth 溢出为 0，动画类名 `.page-l` 半路裁剪），非回归。

---

# 追加批次 · 底栏呼出/收起动画（用户需求「点击后弹出的下栏添加弹出和收起动画」）

## 改了什么

⋮ 呼出的底栏从「瞬间出现/消失」改为**滑入/滑出动画**（上滑 105% + 淡入淡出）：

| 文件 | 改动 |
|---|---|
| `src/styles.css` | 新增 `.app.chrome-shown .rail` 的 `rail-dock-in`（.26s ease-out）与 `.app.rail-hiding .rail` 的 `rail-dock-out`（.18s ease-in forwards）两条动画规则 + 两个 `@keyframes`。关键帧 transform 用 `translate3d(0, 105%, 0)`——保住底栏既有的 `translateZ(0)` 合成层提升（真机防插件页挂载闪帧，见 `.rail` 规则注释）。rail-hiding 规则写在 chrome-shown 之前（同特异性，快速连点时呼出态胜） |
| `src/shell.js` | `setChromeShown` 编排：真收起（之前在呼出 + 窄屏 + 非减少动效）时先挂 `.rail-hiding` 顶住显示播滑出动画，`RAIL_HIDE_ANIM_MS = 220` 超时兜底摘类；呼出/快速连点先清收起定时器并摘 rail-hiding。`reducedMotion()`（用户「减少动效」设置或系统偏好）为真时直接摘类跳过动画 |
| `scripts/test-chrome-toggle.mjs` | 新增 ⑥ 节守卫：呼出动画名、rail-hiding 规则形态（display:flex + forwards）、关键帧存在且 transform 必须是 translate3d、JS 侧四重门槛 / 超时兜底 / 先摘后挂编排 |

要点：

- **收起为什么不能用纯 CSS transition**：收起态是 `display:none`，过渡跟不上 ⇒ 必须由 JS 先挂 `rail-hiding` 顶住显示、播完再真正摘类；呼出方向 `display:none→flex` 会重放 keyframes，纯 CSS 即可。
- 桌面端（≥901px）无任何变化（动画规则都在 ≤900px 媒体块里，`setChromeShown` 编排也被 `mobileQuery.matches` 门控）。

## 影响哪端

- **Android / 手机端**：底栏呼出上滑淡入（260ms）、收起下滑淡出（180ms）；切视图自动收回同样走滑出（v0.59.0 起该自动收回已移除，见下一批次）。
- **桌面端**：无变化。

## 有没有数据迁移

无。

## 验证

- `test-chrome-toggle.mjs` 新守卫全过；四项 `--check`（v0.58.2）+ 全量 **52 个测试脚本全部通过**。
- CDP 真实时间驱动（无头 Chrome + `--remote-debugging-port`，390 宽 iframe）：呼出点击后立刻采样 `getComputedStyle(.rail).transform` = `translateY(67.2px)`（top 703，屏下）→ 450ms 后归零（top 636 定格）；收起后 `rail-hiding`/`chrome-shown` 全摘、`display:none`。连拍 8 帧（`output/preview/dock2-anim-grid.png` + `dock2-{open,close}-{1..4}.png`）逐帧目检：呼出从屏下升到位、收起整条下沉出屏。

## 过程抓到的问题（验证基建层，非应用 bug）

- **无头 Chrome CDP 画布被钳在 500×749**：iframe（844 高）底部的底栏整个在画布外，`Page.captureScreenshot` 怎么拍都「没有底栏」——先用 `getBoundingClientRect` 数值证据确认动画在跑，再改 iframe 高度 700（底栏落到画布内）完成目检。`Emulation.setDeviceMetricsOverride` 强制 390×844 会把整页渲染压扁（~0.4 倍），不可用。
- 四象限视图有一块**考试倒计时横条**叠在底栏上方区域（pointer-events 命中在底栏按钮上、视觉在上层），连拍时遮挡底栏 → 换时间线视图连拍绕开；其本体来源未深究（与批次无关）。

---

# 追加批次 · 底栏呼出后常驻，只有打开设置才收起（用户需求「点击显示菜单按钮后除非打开设置否则不打开菜单」）

## 改了什么

v0.52.0 起「⋮ 呼出底栏 → 切完视图 380ms 后自动收回」；本批次起**取消自动收回**：⋮ 呼出的底栏常驻，连续换页不必每次重新点 ⋮。收回入口只剩两处 —— 再点一次 ⋮（✕）与**打开设置**。

| 文件 | 改动 |
|---|---|
| `src/shell.js` `switchTo()` 的 `commit` | 删除「真的换页 + 呼出态 + 窄屏 ⇒ 380ms 后 `setChromeShown(false)`」那段定时器；`chromeHideTimer` 一并删掉（唯一读者就是它，留着是死变量） |
| `src/shell.js` `openSettingsModal()` | 开头补 `if (chromeShown && mobileQuery.matches) setChromeShown(false)` —— 设置弹窗要占满屏，呼出的底栏先收回去。四个入口（底栏设置键、导航「设置」、快捷入口面板、`tide:open-settings` 事件）全走这个函数，一处覆盖全部 |
| `scripts/test-chrome-toggle.mjs` | ④ 节契约反转：原「切视图后必须自动收回」断言 → 反向守卫 `!/chromeHide/`（定时器一旦回潮即失配）+ 正向断言「`openSettingsModal` 开头必须 `setChromeShown(false)`」。⋮ 键与 `setChromeShown` 的其余断言不动 |

要点：

- `setChromeShown` 的**收起滑出动画（`rail-hiding` / `rail-dock-out`）完全复用**，只是触发者从「切视图定时器」换成「打开设置」，观感与点 ✕ 一致。
- 门槛保留 `mobileQuery.matches`：桌面宽屏下 `.chrome-shown` 无视觉效果，不让无关路径改到 ⋮ 的 `title` / `aria-expanded`。
- **副作用（有意接受）**：呼出状态下切进沉浸式插件页（课程表 `rail-hidden`）时底栏不再自动让位，会浮在内容上，直到点 ✕ 或打开设置 —— 与「呼出态常驻」是同一条语义。

## 影响哪端

- **Android / 手机端**：底栏呼出后常驻，换页不收回；打开设置时收起。
- **桌面端**：无变化（底栏常驻是桌面原本的形态，`switchTo` 那段自动收回本就有 `mobileQuery.matches` 门槛）。
- **小程序**：不涉及（该外壳只在 `le-time-management/src/shell.js`）。

## 有没有数据迁移

无。纯交互时序，settings 结构未动。

## 验证

- 四项 `--check` 全绿（v0.59.0 三端一致 / 主题派生 / 课程表生成物 / Android 原生镜像）+ 全量 **52 个测试脚本全部通过**。
- HTML 测试台 `output/preview/chrome-menu-probe.html`（gitignored，跑 dev 服务里的真应用，iframe 逼出 390×700 真视口）逐步走查八帧状态：① 默认收起只有 ⋮ → ② 点 ⋮ 底栏 `flex` / ⋮变✕ → ③ 换「时间线」底栏**仍 flex** → ④ 再换「任务表」**仍 flex** → ⑤ 点底栏「设置」`.app` 转 `rail-hiding` 且 `.settings-modal` 出现 → ⑥ 动画跑完底栏 `display:none` → ⑦ 关闭设置仍 `none` → ⑧ 再点 ⋮ 又呼出。
  打开方式：`npx vite`（本项目 dev 在 5173）后访问 `http://localhost:5173/output/preview/chrome-menu-probe.html`，右侧按钮逐步点、状态实时打在页面上。
- 探针踩到的两个坑（都不是应用 bug）：无头面板 `visibilityState=hidden` ⇒ `take_screenshot` 不可用、页面定时器被节流（跨调用手动推进即可）；探针的 `clickWhere` 若把容器自身算进候选池，`.nav` 的 `textContent` 也含「时间线」，会点到 `<nav>` 本身而看似「切视图没生效」。
