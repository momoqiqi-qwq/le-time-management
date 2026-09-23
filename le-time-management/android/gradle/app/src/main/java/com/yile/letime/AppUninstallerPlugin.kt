package com.yile.letime

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * 应用内「卸载本应用」桥 —— 与 `ApkInstallerPlugin` 对称的那一半。
 *
 * ## 为什么必须走原生
 *
 * WebView 里没有任何卸载入口：跳 `market://` 只会进应用商店。卸载只能由
 * `Intent.ACTION_DELETE` + `package:<包名>` 交给系统的卸载程序（PackageInstaller），
 * 而清单里**必须声明 `REQUEST_DELETE_PACKAGES`**：系统那个卸载 Activity 带
 * `android:permission` 保护，漏声明时 `startActivity` 直接抛 `SecurityException`，
 * 用户侧只看到「点了卸载没反应」。
 *
 * ## 为什么发意图而不是自己调 `deletePackage()`
 *
 * `PackageManager.deletePackage()` 同样要求 `REQUEST_DELETE_PACKAGES`，但 Android 12 起
 * 对非特权应用的静默卸载卡得更严；走 `ACTION_DELETE` 是唯一稳定、且**必然经过用户确认**
 * 的路径，顺带保留了系统界面里「删除个人数据」这类 ROM 自有选项 —— 这些我们不该替用户决定。
 *
 * ## 成功只代表界面已拉起
 *
 * 与安装桥同理：resolve 返回 `launched:true` 之后，用户在系统界面点取消还是点卸载，
 * 本应用一概收不到 —— 真卸载时进程会被系统直接杀掉，压根等不到回调。
 * 所以前端文案只能说「已交给系统卸载程序」，不能说「卸载完成」。
 */
@TauriPlugin
class AppUninstallerPlugin(private val host: Activity) : Plugin(host) {

  /** 拉起系统卸载确认界面。 */
  @Command
  fun uninstall(invoke: Invoke) {
    host.runOnUiThread {
      try {
        val intent = Intent(Intent.ACTION_DELETE).apply {
          // `package:` 的 scheme 部分只接受裸包名，带别的段系统不认。
          data = Uri.parse("package:${host.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        host.startActivity(intent)
        invoke.resolve(
          JSObject().apply {
            put("launched", true)
            put("packageName", host.packageName)
          }
        )
      } catch (error: ActivityNotFoundException) {
        // 极简 ROM / 卸载组件被禁用：没有能接这个意图的应用。
        invoke.reject("系统里没有可用的卸载程序，请在「设置 › 应用管理」里手动卸载")
      } catch (error: Exception) {
        // SecurityException 基本等于清单漏了 REQUEST_DELETE_PACKAGES ——
        // 最常见的原因是 `tauri android init` 重建过 gen/android 后没重跑
        // tools/sync-android-native.js。原样把原因抛回，别吞成「点了没反应」。
        invoke.reject("无法拉起系统卸载程序：${error.message}")
      }
    }
  }
}
