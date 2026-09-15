# Le时间管理 v0.37.0

## 改了什么

课程表插件的周视图从「三张卡片纵向堆叠、7 列横着滚、10 节看不全」改成
**周一到周日 7 列 × 全部节次一屏铺满**，插件自己的底部三宫格导航收进右上角「⋯」菜单。

| 问题 | 改前实测（390×844） | 改法 |
|---|---|---|
| 7 天显示不全，横向滚动只露 4.5 列 | `.schedule-grid{min-width:630px}`（窄屏 544px） | 列改 `var(--sg-label-w) repeat(7,minmax(0,1fr))`，去掉 `min-width`，7 列按容器等比铺开 |
| 10 节课要纵向滚动才看得完 | 表头 64px + 10 × 76px = 824px 固定行高 | 帧 `flex:1 1 0` + `max-height:calc(表头 + 节次数 × 用户设定行高)`，行 `minmax(30/34px,1fr)` 自动铺满 |
| 底部三宫格导航白占 ~76px | `.main-nav` 贴在 `.main-stage` 底部 | 移除，改 `.more-menu` 弹层挂在右上角「⋯」 |
| 右下角悬浮「+」压住最后一行的周末两列 | `position:sticky;float:right` | 移除；「添加课程」进 ⋯ 菜单 |

「⋯」菜单内容：

- **视图**：今日课表 / 课表 / 我的（原底栏三项，当前项高亮）
- **操作**：添加课程 / 切换课表 / 个性化配置（原工具栏「切换课表」与悬浮「+」）

菜单挂在周视图工具栏右侧，以及「今日课表」「我的」两屏的 `screenHead` 右侧。
点条目即切换并重绘收起；点空白处或按 `Esc` 关闭（关闭逻辑绑在 `document` 上只绑一次，
因为宿主 `.plugview` 每次切视图都会重建）。

### 🔴 行高不能用 JS 量出来（第一版踩的坑）

第一版把行高交给 JS：量 `frame.clientHeight`，按 `min(用户设定, 可用高度 / 节次数)` 算行高。
实测帧高 **782px**、`.sg` **937px**、`.plugview` 只有 **728px** —— 帧自己撑爆了视口。

根因是 `.schedule-grid{height:100%}` 在**高度不确定**的父级下退化成 `auto`，
于是 `grid-template-rows` 里的 `76px × 10` 固有高度反过来把 `.schedule-frame`（`flex:1 1 0`）
和 `.sg` 一路撑大。也就是说 `frame.clientHeight` 量到的就是**被内容撑出来的那个高度**，自激。

改法是把整条高度链变成确定的、且只向下传导：

```
.plugview{height:100%}          /* 宿主给的，本就确定：实测 728px */
  → .sg{height:100%}            /* 关键：不是 min-height，min-height 只是下限、拦不住内容撑高 */
    → .main-stage{flex:1;display:flex;flex-direction:column}
      → .schedule-frame{flex:1 1 0;min-height:0;max-height:calc(...)}  /* 上限写 CSS，不写 JS */
        → .schedule-grid{height:100%;grid-template-rows:表头 repeat(N,minmax(row-min,1fr))}
```

帧高只由容器决定，行高由 `1fr` 填满帧 —— 不需要 `ResizeObserver`，也没有测量循环。

## 影响范围

- **Windows / Android**：共用同一份 `public/plugins/shiguang-schedule/main.js`。
  手机端与桌面端都是「7 天 × 全部节次一屏全见」，桌面端行高仍受「课表格子高度」上限约束
  （窗口够高时按设定值，不够高时等比压缩）。
- **微信小程序**：该插件 `platforms.miniprogram = unavailable`，无影响。
- 节次数超过一屏能容纳的下限（`row-min` 34px，窄屏 30px）时仍会纵向滚动，
  例如 20 节 × 34px + 表头 = 720px > 可用高度 —— 这是刻意保留的降级，比压到看不清更合理。

插件清单版本 `3.3.1 → 3.4.0`（已跑 `tools/sync-plugins.js` 重生成两端 catalog），
项目版本 `0.36.8 → 0.37.0`（界面调整属 minor，已跑 `tools/sync-version.js`）。

## 校验

- 真浏览器 CDP 实测（无头 Chrome，`Emulation.setDeviceMetricsOverride`）：

  | 视口 | 列数 | 行数 | 帧尺寸 | 横向溢出 | 纵向溢出 | 底栏 | ⋯ 按钮 |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | 390×844 | 8（1 节次 + 7 天） | 11（1 表头 + 10 节） | 350 × 558 | 0 | 0 | 已移除 | 有 |
  | 1440×900 | 8 | 11 | 1106 × 582 | 0 | 0 | 已移除 | 有 |

  同时确认 `.schedule-grid` 底边与 `.schedule-frame` 底边间距 1px（刚好铺满，无留白）。
- `npm test` **22 个脚本**全部通过。
- `node tools/sync-version.js --check` ✓
- `node tools/build-schedule-plugin.js --check` ✓
- 截图：`output/preview/phone-plugins/shiguang-schedule-week-{light,dark}.png`、
  `shiguang-schedule-menu-{light,dark}.png`、`shiguang-schedule-week-light-desktop.png`。

## 数据迁移

无。本版只改布局与导航入口，不涉及存储结构；`style.slotHeight` 语义从「固定行高」
变成「行高上限」，老数据无需改动。
