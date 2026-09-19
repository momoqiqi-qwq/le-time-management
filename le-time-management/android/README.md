# U-Time · Android 端说明

Android 端**不维护第二份插件目录**。Tauri Android 构建直接复用 `../`（即 `le-time-management/`）的前端与 `src-tauri`，因此内置插件以：

`../public/plugins/<id>/`

为单一事实源。Windows / Android 的插件代码、版本、启停字段和插件宿主保持同源；Android 只额外提供少量 Kotlin 原生桥。课程表从 v0.3.0 起直接复用与桌面端相同的响应式 Web 插件，不再要求额外的原生课程表运行时。

## 原生代码（Kotlin）放哪 —— 别改 gen/

手机端真正干活的 Kotlin **不在** `src-tauri/gen/android/`，那是 Tauri 的生成目录（被 `.gitignore` 忽略）：

```bash
# 事实源（版本化）：le-time-management/android/gradle/app/src/main/java/com/yile/letime/
#   MainActivity.kt            安全区注入 --sat/--sab/--sal/--sar、返回键 handleBackNavigation、双指缩放
#   SchoolImportActivity.kt    教务导入窗口（window.close() 在 Android 关不掉承载 Activity）
#   NativeSchedulePlugin.kt    原版课程表桥
#   ApkInstallerPlugin.kt      应用内一键升级：FileProvider content:// + ACTION_VIEW + 读权限授予
# 目标（生成物）：le-time-management/src-tauri/gen/android/app/src/main/java/com/yile/letime/
```

**重新执行一次 `tauri android init` 会把 gen/android 整个重建**，上面这些全部静默消失（而且没进 git，连回滚都没有）。所以：

| 操作 | 命令 |
|---|---|
| 改完原生代码同步进 gen | `node tools/sync-android-native.js` |
| 只校验是否一致（CI / 构建前） | `node tools/sync-android-native.js --check` |
| `tauri android init` 重建过 gen 之后，把手上的现状采纳为新基线 | `node tools/sync-android-native.js --capture` |

`scripts/build-android-apk.sh` 在构建最开始就会跑一次同步（失败即中止），所以正常流程下不用手工记这件事。

除 Kotlin 外，同一脚本还**幂等**补三处声明，这三处都是「改在 gen 里必然被下次 init 抹掉」的：
AndroidManifest 的 `REQUEST_INSTALL_PACKAGES`（应用内升级要拉起系统安装器）、去掉 MainActivity 的 activity 级 label（否则 launcher 图标名取到「U-Time · 时间块与四象限」被桌面截断）、`res/xml/file_paths.xml` 的 `<cache-path>`（更新包暂存在 `app_cache_dir()`＝内部 `getCacheDir`，FileProvider 靠它才肯共享）。

> 变更历史：v0.38.0 起改由 `tools/sync-android-native.js` 统一管理。此前 Kotlin 副本散在 `android/` 根下（`MainActivity.kt` 早已是 255 字节的旧桩），清单补丁则写死在构建脚本的 python 段里。

## 三端插件同步

在仓库根目录执行：

```bash
node tools/sync-plugins.js
```

脚本会校验 12 个内置插件的 manifest/入口文件，生成 Windows/Android 共用的插件目录清单，同时刷新微信小程序的插件清单和可移植离线数据。

`shiguang-schedule` 在 Android 的状态为 `full`：桌面 7 列布局会在窄屏自动转成 2 列 / 单列日程卡片，教务导入、课程编辑、JSON/ICS 与桌面端使用同一代码路径。`NativeSchedulePlugin.kt` 仅作为旧版兼容参考，不再由插件宿主覆盖课程表视图。


## v0.4.0

Android 与 Windows 同源新增「网页收集」「学校通知网站」、9 套主题和课程表/节假日性能优化。学校登录使用 Tauri Rust 会话 Cookie Jar；密码仅存在当前页面输入中，不写入插件存储。
