# v0.43.0 · 主导航图标随包化 + 微信推送多选面板可收起（带开合动画）

> 上一版：v0.42.0（课程表个性化配置即时生效，删除「保存样式」按钮）

## 改动一：主导航图标随包化，与插件图标统一为 Icons8 Color 彩色风格

插件图标在 v0.27.0 起已换成随包 Icons8 Color 彩色 PNG，而侧栏「四象限 / 时间块 /
收件箱 / 插件」4 个核心入口（含设置、快速捕获，共 6 个 key）还走 Icons8 CDN 的
iOS Filled 直链 —— 用户指出两者不一致（顶栏标题卡小框、侧栏里一眼可见），
且旧线路离线即裂（`docs/plugin-icons.md` 第八节的已知缺口）。改动：

- `tools/gen-plugin-icons.py` 新增 `NAV_ICONS` 清单与 `NAV_OUT` 输出：
  `public/icons/nav/<key>.png`（81×81 透明 PNG，与插件同一套 Color 风格），
  台账写 `public/icons/nav/ATTRIBUTION.md`。生效 slug：quadrant=`four-squares`、
  timeblock=`clock`、inbox/capture=`inbox`、market=`puzzle`、settings=`settings`
  （`grid-2` 在 Color 风格下 404，候选按序回退已实测）。
- `src/icons.js`：`appIcon()` 对主导航 key 先读随包 PNG，失败才回落同风格 CDN 直链
  （候选清单在 `NAV_ICONS8`）；删除 iOS Filled 线路与 `ICON_COLORS` 强调色表
  （彩色 PNG 不再染色）。
- 侧栏导航、顶栏标题卡小框、设置入口、任务来源图标等全部经 `appIcon()`，自动切换。
- 文档与署名同步：`docs/plugin-icons.md` 重写导航相关章节并销掉「主导航依赖 CDN」缺口、
  `public/OPEN_SOURCE_NOTICES.md`、`src/aboutData.js`、`scripts/test-v0114-ui.mjs`
  断言更新（改守「随包 nav PNG」而非「ios-filled CDN」）。

## 版本

- 应用版本 0.42.0 → 0.43.0（三端同步，package-lock 两处已手改）
- 插件 wechat-push 1.8.0 → 1.8.1（sync-plugins 已重跑，pluginCatalog 同步）

## 改动二：微信推送多选面板「展开后无法收起」修复 + 开合动画（wechat-push 1.8.1）

用户截图：「推送内容：时间块 + 任务截止 + 插件消息 ▾」的面板展开后点按钮收不回去。

**根因**：`.wp-ms-panel` 的作者样式里有 `display:flex`，而 `hidden` 属性靠的是
浏览器 UA 样式的 `[hidden]{display:none}` —— **作者样式永远压过 UA 样式**（与特异性
无关），所以 `msPanel.hidden = true` 切了也没用，面板从渲染起就恒展开。

**修复**（`public/plugins/wechat-push/main.js`）：

- 面板开关从 `hidden` 属性改成 `.on` 类切换（`setMsOpen()`），点按钮取反、点外部收起。
- 新增展开/收起过渡：透明度 + 6px 下落位移 + `visibility` 延迟切换（收起动画播完才
  真正隐藏，不会截断）；`prefers-reduced-motion:reduce` 时动画关闭。
- 按钮箭头 `▾` 包一层 `.wp-ms-caret`，开合时旋转 180°；按钮补 `aria-expanded` 同步。
- `test-wechat-push.mjs` 新增第 5 节守卫：禁用 `msPanel.hidden`、必须 `.on` 类开合、
  reduced-motion 必须尊重等 9 条断言。

## 附：时间块「WakeUp课表」更名为「课程表」，1–10 节一屏显示

- 视图名 `WakeUp课表` → `课程表`（桌面 `src/views/timeViews.js` 的 `VIEW_META` 与
  面板标题「课程表周视图」、小程序 `viewTabs` 与页头文案）。
  **内部 id 仍为 `wakeup`** —— 改 id 会让用户已保存的视图选择失效。
- 行高不再写死 72px（10 节 = 64 + 720 = 784px，第 10 节必须纵向滚动才看得见）：
  `--slot-count` 从网格挪到面板根节点，`.wakeup-grid` 改
  `repeat(var(--slot-count), minmax(52px, 1fr))`，`.wakeup-scroll` 加 `flex:1 1 0` +
  `max-height:calc(112px + var(--slot-count) * 72px)`。装得下按 72px 自然行高，
  装不下等比压到刚好铺满 —— 与课程表插件 `.schedule-frame` 同一套机制
  （上限写成 CSS 而非 JS 量高度：帧高一旦随内容走就会自激）。
- 🔴 网格同时补 `min-height: calc(64px + var(--slot-count) * 52px)`。
  **少了这一条会出真回归**：`.wakeup-grid` 自带 `overflow:hidden`（裁 18px 圆角用），
  窗口矮到行触 52px 下限时，轨道总和（584px）超出被压扁的网格盒子 ⇒ 末尾几节被
  **直接裁掉且滚不到**（`scrollHeight` 不含被裁内容），比原来「能滚」更糟。
  给足 `min-height` 后溢出只发生在网格之外，交给 `.wakeup-scroll` 正常滚动。
- 桌面端（≥761px）`.wakeup-view` 改 `display:flex; flex-direction:column; height:100%`，
  让网格吃到 `.time-alt-host` 的确定高度；**手机端刻意不改** —— 面板一旦 `height:100%`，
  超出一屏的内容会被 `.tv-panel` 的 `overflow:hidden` 裁掉。
- 实测（真浏览器，`measure-timeviews.cjs`）：1440×900 → 10 节全可见、行高 72 → 58px、
  纵向溢出 0；1366×768 / 1440×700 / 1440×560 → 行触 52px 下限转为可滚动（溢出 71 / 139 / 279），
  末节均可达；390×844 手机档仍是按天折叠列表。各档横向溢出、绘制溢出、文本重叠均为 0。

## 三端影响

| 端 | 影响 |
|---|---|
| Windows | ✅ 改动一、二均生效 |
| Android | ✅ 生效（同一份前端代码） |
| 微信小程序 | ⚪ 改动一不适用（tabBar 仍是 FA 单色成对图标，由 sync-tab-icons.py 管；插件图标本来就是随包复制）；改动二不适用（小程序端是独立原生界面，无该面板） |
