package com.yile.letime

/**
 * 普通网页的应用内 WebView 容器（open_internal 在 Android 上通过
 * `activity_name("BrowserActivity")` 指定）。与教务导入窗口隔离，避免普通网页
 * 继承教务桥接脚本或专用生命周期；系统返回键由 TauriActivity 负责关闭本页。
 *
 * 本文件是版本化镜像，tools/sync-android-native.js 会同步到 gen/android。
 */
class BrowserActivity : TauriActivity()
