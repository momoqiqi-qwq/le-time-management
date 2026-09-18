# v0.59.0 · 课程表默认彩色 + 手机端无边距铺满

## 改了什么

两处都只作用于 **APK / 窄屏**（≤900px 媒体块），桌面端观感不变。

### ① 课程表默认观感：彩色 + 75% 透明度

`public/plugins/shiguang-schedule/ui.js` 的 `defaultStyle`：`colorful:false → true`、`opacity:100 → 75`。

- 影响「没有存过样式」的新装用户，以及「个性化配置 → 恢复默认」的结果。
- **已存过样式的老用户不受影响** —— `normalizeStyle()` 只在数值缺失时回填默认，
  不会覆盖 storage 里已有的 `colorful` / `opacity`。
- 彩色调色板本身没动（8 档实色，白字对比度全部 ≥4.5:1，由 `test-schedule.mjs` 逐色校验）。

### ② 周视图拉伸填满「除安全区之外」的整屏

原来手机上课表四周被三层留白夹着，横向少 40px、纵向少 68px（约一节课的高度）：

| 层 | 原值（390px 宽机型） | 现在 |
|---|---|---|
| `.view` padding-top | 46px + 状态栏安全区 | **2px + 安全区** |
| `.plugview` 左右 | 14px | **0** |
| `.plugview` 上下（紧凑密度） | 14 / 18px | **0** |
| `.sg` 左右 | 6~8px | **0**（周视图）/ 12~14px（其余页） |
| `.schedule-top` | 圆角卡片 + 上下外边距 | **通栏条**（只留底边 1px） |
| `.schedule-frame` | 1px 描边 + 13px 圆角 | **无描边无圆角** |
| `.schedule-frame` `scrollbar-gutter` | `stable both-edges`（左右各 7px 槽） | **auto**（仅周视图） |
| `.plugview` 滚动条 | 全局 `::-webkit-scrollbar` 8~9px 占位 | **收掉**（仅沉浸式视图） |

实测（无头 Chrome，390×844）：`.schedule-grid` 由 `x=20 / w=343` 变成 **`x=0 / w=390`**，
顶栏由 `y=70` 提到 **`y=2`**。

**只有周视图无边距**：`paint()` 在 `mode==='week'` 时给 `.sg` 挂 `bleed` 类，
设置页 / 表单页 / 今日课表继续吃 `.sg` 的左右内边距（实测设置条目仍是 `x=12 / w=366`），
正文不会贴着屏幕边。

安全区一条没减：顶部 `--sat`、底部 `--sab` 照旧由 `.view` 消费；
横向 `--sal/--sar`（横屏挖孔在侧边）宿主不管，改由 `.sg.bleed` 的 `padding-inline` 补回。
全部走 `var(--s…, env(…))` 双路（铁律四）。

## 顺手修掉的一个真 bug

插件整份课表 CSS 写在 JS **模板字符串**里，我第一版的注释用了反引号
（`` `.app.rail-hidden .view` ``）—— 反引号成对时语法照样合法，
`vm` 加载、`build-schedule-plugin.js --check`、52 个测试脚本**全部通过**，
但运行时 `styles()` 把 CSS 截断、`.app.rail-hidden` 被当成属性访问，
报 `Cannot read properties of undefined (reading 'rail')`，**课表整个渲染不出来**。

`ui.js` 里本来就有这条警告（`.sg-switch` 那段注释：「反引号与美元大括号都会截断它 ——
只用中文引号」），这次是自己踩上去了。

补了回归守卫：`test-schedule.mjs` 现在用 `document` 桩子**真的执行一次 `styles()`**，
核对注入的 CSS 非空、含 `.sg.bleed` 规则、且不含反引号与 `${`。

## 影响哪端

- **Android / 桌面窄窗口**：课程表周视图无边距铺满；默认彩色 + 75% 透明度。
- **桌面宽屏**：`.view` / `.plugview` 的规则都在 `@media (max-width:900px)` 内，不受影响；
  `.sg` 的 `max-width:1540px` 居中留白照旧。
- **微信小程序**：课程表 `platforms.miniprogram = "unavailable"`，无对应实现，不涉及。

## 有没有数据迁移

无。`style` 的存储结构未动（仍是 `{slotHeight,cornerRadius,gap,opacity,hideTimes,hideDates,colorful}`），
只是默认值变了；已存盘的用户配置原样保留。

## 版本号

- `package.json` `0.58.2 → 0.59.0`（+ `sync-version.js` 三端、`package-lock.json` 两处手工补）
- 插件 `manifest.json` `3.7.1 → 3.8.0`（`tools/sync-plugins.js` 已同步桌面与小程序 pluginCatalog）
- `main.js` 由 `tools/build-schedule-plugin.js` 重新生成（**课程表插件只认 `main.js`**）

## 校验

```
node ../tools/sync-version.js --check          ✓ 三端版本一致：v0.59.0
node ../tools/gen-theme-dark.js --check        ✓ 派生调色板已同步
node ../tools/build-schedule-plugin.js --check ✓ 生成物与源一致
node ../tools/sync-android-native.js --check   ✓ Android 原生镜像一致
npm test                                       ✓ 52 个测试脚本全部通过
```
