package com.yile.letime

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File

/**
 * APK 安装桥（v0.38.0）——应用内一键升级的最后一公里。
 *
 * ## 为什么不能复用 tauri-plugin-opener
 *
 * `OpenerPlugin` 对 `file://` 只做 `Intent(ACTION_VIEW) + FLAG_ACTIVITY_NEW_TASK`，
 * **既不经 FileProvider、也不授予读取权限**。Android 7.0（API 24）起直接
 * 抛 `FileUriExposedException`；即便绕开，系统安装器也拿不到文件读取权
 * （安装器是另一个进程）。所以必须自己发 `content://` URI 并显式授权。
 *
 * ## 为什么用 `content://` 而不是 `file://`
 *
 * `FLAG_GRANT_READ_URI_PERMISSION` 只对 `content://` 生效。URI 由 `FileProvider`
 * 生成，authority 是 `AndroidManifest.xml` 里声明的 **`${applicationId}.fileprovider`**
 * （即 `com.yile.letime.fileprovider`），可访问的文件范围由 `res/xml/file_paths.xml` 决定。
 *
 * ⚠️ **本插件只接受落在 `file_paths.xml` 已声明根目录下的文件。** 当前声明了
 * `<cache-path path="." />`（＝**内部** `Context.getCacheDir()`）与
 * `<external-path path="." />`。Rust 侧因此固定把 APK 下到 `app.path().app_cache_dir()`
 * （对应 `getCacheDir`，即内部缓存），而不是 `cache_dir()` —— 后者在 Android 上解析为
 * `getExternalCacheDir`，需要 `<external-cache-path>` 才会被 FileProvider 认。
 * 换落盘位置时**必须同时**改这里与 `file_paths.xml`。
 *
 * ## 两个命令为什么分开
 *
 * Android 8.0 起安装「未知来源应用」是**按应用授权**的（`canRequestPackageInstalls`）。
 * 用户没开这个开关时，系统安装器会被直接拦掉、界面一闪而过，看起来像「点了没反应」。
 * 所以前端要先问 [installReady]，没权限就引导去 [openInstallPermissionSettings] 再回来装。
 */
@InvokeArg
class ApkInstallArgs {
  /** 已下载完成的 APK 绝对路径（Rust 侧给出）。 */
  lateinit var path: String
}

@TauriPlugin
class ApkInstallerPlugin(private val host: Activity) : Plugin(host) {

  /** 本应用是否被允许安装未知来源应用（API 26 以下恒 true）。 */
  private fun canInstallPackages(): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      host.packageManager.canRequestPackageInstalls()
    } else {
      true
    }

  /** 系统里是否存在能处理 APK 安装的应用（极简系统 / 被卸载时可能没有）。 */
  private fun hasInstaller(): Boolean {
    val probe = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(Uri.parse("content://placeholder/x.apk"), APK_MIME)
    }
    return host.packageManager.queryIntentActivities(probe, 0).isNotEmpty()
  }

  /** 前端在下载完成后、点「立即安装」之前调用，用来决定按钮是否可点与提示什么。 */
  @Command
  fun installReady(invoke: Invoke) {
    val allowed = canInstallPackages()
    val installer = hasInstaller()
    invoke.resolve(
      JSObject().apply {
        put("platform", "android")
        put("allowed", allowed)
        put("installer", installer)
        put("ready", allowed && installer)
        put("reason", when {
          !installer -> "系统里没有可用的安装程序"
          !allowed -> "需要先允许 Le时间管理 安装未知来源应用"
          else -> ""
        })
      }
    )
  }

  /**
   * 用 FileProvider 把 APK 交给系统安装器。
   *
   * 成功只代表「安装界面已拉起」，用户在系统界面点「安装」/「取消」本插件无从得知，
   * 所以前端提示要说「已交给系统安装」，不要说「安装完成」。
   */
  @Command
  fun install(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(ApkInstallArgs::class.java)
    } catch (error: Exception) {
      return invoke.reject("安装参数不合法：${error.message}")
    }

    if (!canInstallPackages()) {
      return invoke.reject("需要先允许「安装未知来源应用」，请点「去开启」")
    }

    val file = File(args.path)
    if (!file.isFile) return invoke.reject("安装包不存在或已被清理，请重新下载")
    if (!file.name.endsWith(".apk", ignoreCase = true)) return invoke.reject("安装包格式不是 APK")
    if (!file.canRead()) return invoke.reject("安装包无法读取，请重新下载")

    // FileProvider 只认自己声明的根目录；越界会抛 IllegalArgumentException，
    // 这里转成能看懂的话，而不是把裸异常丢给用户。
    val uri = try {
      FileProvider.getUriForFile(host, "${host.packageName}.fileprovider", file)
    } catch (error: Exception) {
      return invoke.reject("安装包不在可共享目录内（$FILE_PROVIDER_HINT）：${error.message}")
    }

    host.runOnUiThread {
      try {
        val intent = Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, APK_MIME)
          // 安装器是另一个进程：必须显式把读取权授给它，否则它会打不开这个 content URI。
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        host.startActivity(intent)
        invoke.resolve(JSObject().apply { put("launched", true) })
      } catch (error: Exception) {
        invoke.reject("无法拉起系统安装程序：${error.message}")
      }
    }
  }

  /** 跳到本应用的「安装未知来源应用」授权页。 */
  @Command
  fun openInstallPermissionSettings(invoke: Invoke) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return invoke.resolve(JSObject().apply { put("opened", false) })
    }
    host.runOnUiThread {
      try {
        host.startActivity(
          Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${host.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        )
        invoke.resolve(JSObject().apply { put("opened", true) })
      } catch (error: Exception) {
        invoke.reject("打不开授权页面：${error.message}")
      }
    }
  }

  private companion object {
    const val APK_MIME = "application/vnd.android.package-archive"
    const val FILE_PROVIDER_HINT = "需落在 res/xml/file_paths.xml 声明的根目录下"
  }
}
