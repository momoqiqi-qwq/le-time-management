package com.yile.letime

import android.app.Activity
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/*
 * 原版课程表（ShiguangSchedule）的 Android 桥。
 * 本文件是「版本化镜像」，由 tools/sync-android-native.js 同步进 src-tauri/gen/android/。
 */
@TauriPlugin
class NativeSchedulePlugin(private val host: Activity) : Plugin(host) {
    private fun originalActivity() = runCatching { Class.forName("com.xingheyuzhuan.shiguangschedule.MainActivity") }.getOrNull()
    @Command fun status(invoke: Invoke) {
        invoke.resolve(JSObject().apply { put("available", originalActivity() != null); put("platform", "android") })
    }
    @Command fun show(invoke: Invoke) {
        val original = originalActivity() ?: return invoke.reject("此安装包尚未包含原版课表")
        host.runOnUiThread {
            try { host.startActivity(Intent(host, original)); invoke.resolve() }
            catch (error: Exception) { invoke.reject("原版课表启动失败：${error.message}") }
        }
    }
    // Android owns a separate Activity in the same APK; its back stack handles returning to Le时间管理.
    @Command fun hide(invoke: Invoke) { invoke.resolve() }
    @Command fun close(invoke: Invoke) { invoke.resolve() }
}
