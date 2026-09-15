# v0.37.2 · 文档下载改为真正落盘

发布版本：v0.37.2（三端同源）

## 修复

- **「下载插件开发文档」现在真的保存文件**（用户反馈：点击没有下载）：
  `<a download>` 对 blob: 的下载在 Tauri WebView 里不可靠（部分平台静默失败）。
  新增 Rust 命令 `save_download(name, contents)`：把文本写入**系统下载目录**
  （重名自动追加 " (n)"；平台没有下载目录时回退应用数据目录），返回完整路径。
  - 插件 API 新增 `tide.assets.saveText(filename, text)`（`ui` 权限门控）。
  - plugin-guide 的「下载插件开发文档」与 设置 → 插件 的「下载开发文档」都改为
    优先落盘（成功 toast 显示完整路径）；浏览器调试环境自动回退 blob 下载 +
    剪贴板兜底。
- plugin-guide 1.2.0 → 1.2.1；开发文档补充 `saveText` 用法。

## 验证

- 22/22 测试通过；Rust 侧 release 增量编译通过。
