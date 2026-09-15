# v0.37.11 · 设置分类导航加图标

## 变更

设置弹窗左侧「设置分类」列表的 11 个条目，每项前新增一枚语义图标（Font Awesome solid，与快捷 dock 同款打包内资源）：

| 分类 | 图标 |
| --- | --- |
| 界面与交互 | `sliders` |
| 主题 | `palette` |
| 自定义背景 | `image` |
| 任务提醒 | `bell` |
| 数据中心 | `database` |
| 可选同步 | `cloud-arrow-up` |
| AI 与自动任务 | `wand-magic-sparkles` |
| 全局快捷键 | `keyboard` |
| 局域网联动 | `network-wired` |
| 插件管理 | `puzzle-piece` |
| 关于 | `circle-info` |

## 实现要点

- `src/views/settings.js`：`settingEntries` 每项新增 `icon` 字段（唯一事实源，导航渲染只读它）。
- `src/views/settings/navigator.js`：`paintButtons()` 在文案前渲染 `.settings-nav-ico` 容器；内置本地 `faIcon()` 小助手（`<svg><use href="/icons/fontawesome/solid.svg#NAME">`），**刻意不从 `shell.js` 引入**——设置视图反向依赖外壳会造成循环 import。
- `src/styles.css`：`.settings-nav-ico` 28px 圆角底座，底色/前景全走主题变量（`color-mix(var(--deep) …)`），悬停加深、选中态转 `var(--deep)`；深浅主题自动适配，无硬编码色。

## 验证

- `npm test`：22 个测试脚本全部通过；`gen-theme-dark --check`、`sync-version --check` 通过。
- 无头 Chrome（CDP 驱动，1440×900 Windows 视口）加载真实源码：11 枚图标 `<use>` href 全部正确解析，深色模式（深海跟随系统）截图确认渲染。
