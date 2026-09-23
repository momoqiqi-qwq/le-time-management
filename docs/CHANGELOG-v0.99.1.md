# U-Time v0.99.1

## 更新内容

本轮是代码体检后挑出的「白捡级」清理：只删死代码、只换更小的资产，没有任何功能与交互变化。

- 应用图标 `favicon` 从 1024×1024 的 PNG（266 KB）改为项目已有的同名 SVG（781 B）。
  桌面构建产物 `dist/assets/` 不再打进那张 266 KB 的位图。
- 删除插件宿主里的死代码 `emitLocal`：它是 `emitPluginEvent` 的旧副本，全仓无调用点，
  且丢掉了后者「区分无订阅者 / 成功 / 抛错」的返回值语义。插件事件广播现在只有
  `emitPluginEvent` 一条路径。
- 去掉 20 个「只在自己文件内使用」的 `export` 关键字，涉及 13 个模块
  （automation / commandPalette / dataCenter / keywordHighlights / lanSync / mobileViewport /
  scheduleConflict / sound / syncLayer / taskReminder / theme / views/drawer / pluginHost）。
  函数与常量本体一律未改，只是不再对外声明。
- 测试跑器 `scripts/run-tests.mjs` 改为**跑完全部再汇总**：原先第一个红就 `process.exit`，
  一轮只能看见一个失败。现在会跑完 73 个脚本，末尾列出失败清单与总数，退出码仍为 1。
- `tools/sync-plugins.js` 补上 `--check`：此前该脚本根本不认这个参数，带着它也会直接写盘，
  而 `AGENTS.md` 铁律二让开发者对它跑 `--check`。现在 `--check` 只比对三端插件目录与图标
  是否和清单同源，不一致就报错退出；同时未知参数会直接报错，不再静默忽略。

## 影响范围

- Windows / Android：仅 `favicon` 资产与前端模块的导出面收窄，运行时行为不变。
- 小程序：无改动。
- 数据迁移：无。`letime-data` / `data.json` 结构未动。

## 校验

- `node tools/sync-version.js --check`
- `node tools/gen-theme-dark.js --check`
- `node tools/build-schedule-plugin.js --check`
- `node tools/sync-android-native.js --check`
- `node tools/sync-plugins.js --check`（本轮新增的能力）
- `npm test`
