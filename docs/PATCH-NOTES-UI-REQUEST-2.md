# UI request patch · 三端同步 / Android 插件列表 / 微信能力说明

本补丁在 v0.11.6 源码基础上完成以下调整，不修改现有数据主结构：

## 三端同步

- 右上角快捷功能盒继续支持自由拖动，位置写入 `settings.quickDock`。
- 功能盒保留窗口置顶与全局搜索入口。
- Windows 左侧插件视图支持拖动调整上下顺序；顺序写入 `settings.pluginOrder`。
- 插件顺序会进入现有备份 / WebDAV 快照；微信插件中心读取相同字段并按该顺序展示。
- 插件图标改为三端同源 PNG：`tools/sync-plugins.js` 会把微信端 `images/plugins/*.png` 同步到桌面公共资源，Windows / Android 共用同一份图标。

## Android

Android 继续复用 Windows/Tauri 前端。窄屏插件中心改成紧凑的播放器设置式列表：

- 每个插件只保留一个总滑块开关；
- 不显示逐项权限开关；
- 移动端隐藏额外“打开”按钮，点击插件整行进入插件；
- 插件名称、版本和图标保留，列表改为单列紧凑布局。

## 微信小程序

当前主要功能：四象限、时间块、快速捕获、任务详情、数据备份/恢复、暗色模式、插件中心。

插件清单与 Windows / Android 同步为 12 个；当前小程序原生可运行 4 个：

- 番茄专注
- 周度报告
- 中国节假日
- 考试日历

微信小程序目前不能像 Windows 一样直接导入 ZIP 用户插件。原因是小程序不能执行桌面 DOM/Tauri 插件运行时，也受网络域名、Cookie/会话与后台能力限制。新增微信插件需要把插件能力做成小程序原生适配页，再在桌面 manifest 中声明 `platforms.miniprogram = "native"`，最后运行 `node tools/sync-plugins.js` 同步清单与数据。
