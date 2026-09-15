# v0.37.12 · APK 修复：教务导入窗口「关闭」关不掉（Android）

## 用户反馈

警大教务系统导入课表后，点工具栏「关闭」只显示「正在关闭…」，窗口退不回软件课表界面。

## 根因（逐层查实）

1. **`window.close()` 在 Android 是空操作**：tauri 的 close → tauri-runtime-wry
   `on_window_close()` 只做 `window_wrapper.inner = None`（丢 Rust 引用）。桌面端
   tao Window drop 会销毁原生窗口，但 **tao 的 Android Window 没有 Drop/finish 逻辑**，
   承载教务页面的 Activity 永远留在返回栈上。状态文字是 webview 里的，窗口没关所以
   一直显示「正在关闭…」。
2. **runtime 永远收不到 `Destroyed` 事件**（它来自 tao 窗口销毁）→ tauri manager 里
   `school-import` 的窗口/webview 注册条目关不掉 → 修好关窗后，**第二次用相同 label
   build 会直接报 "a webview with label … already exists"**。

## 修复

- **Android 专用 Activity**：新增 `SchoolImportActivity : TauriActivity()`，在
  AndroidManifest 注册（`exported="false"`、`singleTop`）；`school_import_open` 在
  Android 上 `activity_name("SchoolImportActivity")`，让教务窗口有自己可 finish 的
  Activity。不能直接用 `TauriActivity`（abstract，startActivity 会崩）也不能用
  `MainActivity`（singleTask 只会复用主实例）。
- **真正关窗**：新增 `school_import_close()` —— Android 上经
  `with_webview(|wv| wv.jni_handle().exec(|env, activity, _| env.call_method(activity, "finish", "()V", &[])))`
  直接 finish 承载 Activity，随后 `window.destroy()` 清 tauri/runtime 引用；
  桌面端 `destroy()` 等价于原来的 `close()`。`close` 导航分支与
  `notifyTaskCompletion` 自动关窗都走它。
- **label 递增**：`school-import-<seq>`（`IMPORT_WINDOW_SEQ: AtomicU64`），绕开
  Android 上 manager 条目关不掉导致的二次打不开问题；打开新窗前顺手关掉上一扇。
- **工具栏重试**：close 导航带随机 query（`?r=n-时间戳`）+ 600ms/1.6s 两次重试 ——
  Android WebView 对「同一 URL 的重复导航」不再触发 `shouldOverrideUrlLoading`。
- **依赖**：`[target.'cfg(target_os = "android")'.dependencies] jni = "0.21"`
  （与 tauri 锁定版本统一）。

## gen/android 变更（该目录不入 git，此文档即备份源）

1. 新增 `app/src/main/java/com/yile/letime/SchoolImportActivity.kt`：

```kotlin
package com.yile.letime

/** 教务导入窗口专用 Activity（v0.37.12 起，school_import_open 在 Android 上通过
 *  activity_name("SchoolImportActivity") 指定）。
 *  - tauri 的 window.close() 在 Android 只丢 Rust 引用，Rust 侧经 wry JniHandle
 *    对本 Activity 调 finish()。
 *  - 不能直接用 TauriActivity（abstract，startActivity 会崩）；
 *    不能用 MainActivity（singleTask 只会复用主实例）。 */
class SchoolImportActivity : TauriActivity()
```

2. `AndroidManifest.xml` 在 `<provider>` 前新增：

```xml
<activity
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:label="@string/main_activity_title"
    android:launchMode="singleTop"
    android:name=".SchoolImportActivity"
    android:exported="false" />
```

若 `tauri android init` 重新生成 gen/，以上两处必须重新落回。

## 验证

- `scripts/test-school-import.mjs` 重写：守工具栏关闭重试、JNI finish + destroy、
  自动关窗、SchoolImportActivity 存在/注册/被指定、label 递增、禁回固定 label。
- 22 个测试脚本全部通过；`cargo check` Windows 与 `aarch64-linux-android` 双目标 0 error。
