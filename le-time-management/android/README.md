# Le时间管理 · Android 端说明

Android 端**不维护第二份插件目录**。Tauri Android 构建直接复用 `../`（即 `le-time-management/`）的前端与 `src-tauri`，因此内置插件以：

`../public/plugins/<id>/`

为单一事实源。Windows / Android 的插件代码、版本、启停字段和插件宿主保持同源；Android 只额外提供少量 Kotlin 原生桥。课程表从 v0.3.0 起直接复用与桌面端相同的响应式 Web 插件，不再要求额外的原生课程表运行时。

## 三端插件同步

在仓库根目录执行：

```bash
node tools/sync-plugins.js
```

脚本会校验 12 个内置插件的 manifest/入口文件，生成 Windows/Android 共用的插件目录清单，同时刷新微信小程序的插件清单和可移植离线数据。

`shiguang-schedule` 在 Android 的状态为 `full`：桌面 7 列布局会在窄屏自动转成 2 列 / 单列日程卡片，教务导入、课程编辑、JSON/ICS 与桌面端使用同一代码路径。`NativeSchedulePlugin.kt` 仅作为旧版兼容参考，不再由插件宿主覆盖课程表视图。


## v0.4.0

Android 与 Windows 同源新增「网页收集」「学校通知网站」、9 套主题和课程表/节假日性能优化。学校登录使用 Tauri Rust 会话 Cookie Jar；密码仅存在当前页面输入中，不写入插件存储。
