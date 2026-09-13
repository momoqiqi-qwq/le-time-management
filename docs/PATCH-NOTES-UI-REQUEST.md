# UI 定制补丁说明

本补丁按本次截图需求完成 3 项调整：

1. **侧栏图标彩色化**：核心入口和内置插件图标由纯黑改为独立强调色，仍沿用 Icons8 iOS Filled 图标体系。
2. **设置中心改为独立分类页**：左侧点击某个设置分类后，右侧只显示该分类页面，不再把全部设置纵向堆叠后通过锚点滚动跳转；搜索仍保留，并会自动选择第一个匹配分类。
3. **Windows 自绘窗口按钮**：关闭 Tauri 原生窗口装饰，在应用顶部加入最小化、最大化/还原、关闭按钮，并保留可拖动标题区域；同时补充对应 Tauri 窗口权限。

## 关键文件

- `01-windows/app/src/icons.js`
- `01-windows/app/src/views/settings/navigator.js`
- `01-windows/app/src/views/settings.js`
- `01-windows/app/src/shell.js`
- `01-windows/app/src/styles.css`
- `01-windows/app/src-tauri/tauri.conf.json`
- `01-windows/app/src-tauri/capabilities/default.json`

## 已验证

- `node --check`：相关 JavaScript 文件通过语法检查。
- `scripts/test-v0114-ui.mjs`：通过。
- `scripts/test-v0116-ai.mjs`：通过。

> 说明：本环境执行 `npm install` 时网络安装超时，因此未完成 Vite/Tauri 的完整打包构建；源码级语法与项目现有关键测试已通过。
