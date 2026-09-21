# v0.92.0

## 网页打开与全局搜索优化

- Windows 桌面端外部打开网页改为直接调用系统 `ShellExecuteW`，避免经命令行启动浏览器时闪出控制台窗口。
- 「应用内打开网页」偏好仍保持原逻辑：开启时优先打开 U-Time 内置网页窗口，失败后再交给系统浏览器。
- 全局搜索新增中文拼音首字母缩写匹配：例如 `jm` 可命中「界面与交互 / 界面缩放」，`yy` 可命中「应用内打开网页」这类入口。
- 缩写匹配复用现有常用汉字拼音首字母数据，不改生成区；插件快捷键原有首字母规则不变。

## 影响范围与限制

- 主要影响 Windows 桌面端网页打开路径与桌面/移动端共用的命令面板搜索。
- macOS / Linux / Android 继续沿用原有打开实现；Android 应用内网页窗口逻辑未改。
- 无数据迁移。

## 验证

- `node scripts/test-settings-global-search.mjs`
- `node scripts/test-link-opening-preference.mjs`
- `cargo check`
- `node ../tools/sync-version.js --check`
