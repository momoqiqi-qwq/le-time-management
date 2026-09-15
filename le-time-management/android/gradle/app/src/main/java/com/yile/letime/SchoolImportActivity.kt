package com.yile.letime

/**
 * 教务导入窗口专用 Activity（v0.37.12 起，school_import_open 在 Android 上通过
 * `activity_name("SchoolImportActivity")` 指定）。
 *
 * 为什么不能省：
 * - tauri 的 `window.close()` 在 Android 只丢 Rust 引用，不会 finish 承载窗口的
 *   Activity（tao 的 Android Window 没有 Drop 逻辑），教务窗口会永远停在前台；
 *   Rust 侧现在经 wry JniHandle 对「本 Activity」直接调 finish()。
 * - 不能直接用 TauriActivity：它是 abstract class，startActivity 会直接崩。
 * - 不能用 MainActivity：launchMode=singleTask 只会复用主实例，教务页会顶掉主界面。
 *
 * 本文件是「版本化镜像」：真身由 `tools/sync-android-native.js` 同步进
 * `src-tauri/gen/android/`（那边的副本 gitignored，重新 `tauri android init` 会丢）。
 * `scripts/test-school-import.mjs` 会校验本文件与 AndroidManifest.xml 的注册。
 */
class SchoolImportActivity : TauriActivity()
