# v0.43.0 · 主导航图标随包化，与插件图标统一为 Icons8 Color 彩色风格

> 上一版：v0.42.0（课程表个性化配置即时生效，删除「保存样式」按钮）

## 背景

插件图标在 v0.27.0 起已换成随包 Icons8 Color 彩色 PNG，而侧栏「四象限 / 时间块 /
收件箱 / 插件」4 个核心入口（含设置、快速捕获，共 6 个 key）还走 Icons8 CDN 的
iOS Filled 直链 —— 用户指出两者不一致（顶栏标题卡小框、侧栏里一眼可见），
且旧线路离线即裂（`docs/plugin-icons.md` 第八节的已知缺口）。

## 改动

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
- 桌面端（≥761px）`.wakeup-view` 改 `display:flex; flex-direction:column; height:100%`，
  让网格吃到 `.time-alt-host` 的确定高度；**手机端刻意不改** —— 面板一旦 `height:100%`，
  超出一屏的内容会被 `.tv-panel` 的 `overflow:hidden` 裁掉。
- 实测（真浏览器）：1440×900 下 10 节全部可见、行高 72 → 58px、纵向溢出 0；
  390×844 手机档仍是按天折叠列表，零溢出。

## 三端影响

| 端 | 影响 |
|---|---|
| Windows | ✅ 生效 |
| Android | ✅ 生效（同一份前端代码） |
| 微信小程序 | ⚪ 不适用（tabBar 仍是 FA 单色成对图标，由 sync-tab-icons.py 管；插件图标本来就是随包复制） |
