package com.yile.letime

import android.app.Activity
import android.os.Build
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * 系统栏（状态栏 / 导航栏）图标明暗桥。
 *
 * ## 这个文件解决什么问题
 *
 * `MainActivity` 调了 `enableEdgeToEdge()`，状态栏与导航栏变成**透明浮层**盖在 WebView 上：
 * 系统栏里那些图标（时间、信号、电量、返回手势条）**直接压在网页顶部/底部那一条上**。
 *
 * 而图标的颜色是 Android 按**应用主题的 light/dark** 决定的，`Theme.letime` 继承
 * `Theme.MaterialComponents.DayNight.NoActionBar` —— 它只跟随**系统深色模式**
 * （即 `prefers-color-scheme`），**完全不知道网页里的 `data-theme-mode`**。
 *
 * 于是「网页主题」与「系统深色模式」一旦不一致，状态栏图标必然消失在背景里：
 *
 * | 系统 | 网页 | 状态栏带底色 | 图标色 | 结果 |
 * |---|---|---|---|---|
 * | 深色 | 浅色 | 浅（rgb 253,253,252） | 白 | 对比 **1.02** ⇒ 看不见 |
 * | 浅色 | 深色 | 深（rgb 42,38,32）  | 近黑 | 对比 **1.16** ⇒ 看不见 |
 * | 深色 | 深色 | 深 | 白 | 15.04 ✓ |
 * | 浅色 | 浅色 | 浅 | 近黑 | 17.10 ✓ |
 *
 * （对比度由真浏览器探针实测，判据 3.0 是图形元素的下限。设置弹窗是 `inset:0` 全屏浮层，
 * 头部直接顶到屏幕绝对顶部，所以「设置 → API Key」那一页最容易撞上。）
 *
 * ## 修法
 *
 * 网页每次解析出真实亮度（`resolved.mode`）就调一次 [setLightStatusBar]，
 * 由本插件用 `WindowInsetsControllerCompat.isAppearanceLightStatusBars` 覆盖系统默认值。
 * 这样**无论系统是深色还是浅色，图标永远与网页实际背景反相** —— 根治。
 *
 * ## 为什么状态栏与导航栏一起设
 *
 * 底部导航栏同样是透明浮层盖在网页上，底栏区域的底色也跟着主题走，两个必须保持同相，
 * 否则修好上面、下面又看不见了。两者一起设，用同一个布尔值。
 *
 * ## 为什么用 WindowInsetsControllerCompat 而不是 window.insetsController
 *
 * 前者对 API 26–29 走 `SYSTEM_UI_FLAG_LIGHT_STATUS_BAR`，API 30+ 走
 * `WindowInsetsController`，一套代码全兼容 —— 本项目 minSdk 覆盖了这个区间，
 * 直接写 `window.insetsController` 在 API 30 以下会崩。
 *
 * ## 时序
 *
 * [`light`] 初值取 **false**（即「深色图标」不合语义，这里语义是 "light icons" 的反面）
 * —— 具体见参数注释；前端在首帧就会同步一次真实值，且 `applyInsets` 走
 * `onPageFinished` 补注入的同一条路径，所以不存在长时间留错的窗口。
 */
@InvokeArg
class SystemBarArgs {
  /**
   * 图标是否要用**深色**（`true` = 深色图标，配浅背景）。
   *
   * 命名刻意与 `isAppearanceLightStatusBars` 一致：Android 的 API 叫
   * `isAppearanceLightStatusBars`，语义是「状态栏外观是否为浅色（把图标画成深色）」。
   * 前端传 `mode === "light"` 正好对上 —— 浅色主题 ⇒ 深色图标 ⇒ 传 true。
   */
  var darkIcons: Boolean = false
}

@TauriPlugin
class SystemBarPlugin(private val host: Activity) : Plugin(host) {

  /**
   * 设置状态栏与导航栏的图标明暗。
   *
   * 前端在**每次**主题/亮度变化后调用（`paintTheme` 里），需幂等 —— 重复设同一个值无害。
   */
  @Command
  fun setDarkIcons(invoke: Invoke) {
    val args = try {
      invoke.parseArgs(SystemBarArgs::class.java)
    } catch (error: Exception) {
      return invoke.reject("系统栏参数不合法：${error.message}")
    }
    applyDarkIcons(args.darkIcons)
    invoke.resolve(JSObject().apply { put("darkIcons", args.darkIcons) })
  }

  /**
   * 只读查询当前生效值，供探针 / 自检使用。
   *
   * 注意 `isAppearanceLightStatusBars` 的读取在 API 30+ 依赖 `InsetsController`，
   * 拿不到时返回 null —— 前端不要把 null 当 false。
   */
  @Command
  fun getDarkIcons(invoke: Invoke) {
    val controller = WindowCompat.getInsetsController(host.window, host.window.decorView)
    invoke.resolve(
      JSObject().apply {
        put("platform", "android")
        put("api", Build.VERSION.SDK_INT)
        put("darkIcons", controller.isAppearanceLightStatusBars)
      }
    )
  }

  /**
   * 实际写值。必须回主线程 —— 前端可能在任何时机调，而 InsetsController 只能在主线程碰。
   */
  private fun applyDarkIcons(darkIcons: Boolean) {
    host.runOnUiThread {
      // 跨进程回调里抛异常不能连带拖崩 Activity —— 静默吞掉，图标最坏退回系统默认。
      try {
        // ⚠️ 必须先声明「系统栏由我们控制」：enableEdgeToEdge() 之后系统仍会在
        // 某些场景（如切回前台）按主题重算图标颜色，覆盖掉我们设的值。
        // 显式 setDecorFitsSystemWindows 保持 false（edge-to-edge 语义不变），
        // 并把 appearance 控制权锁在我们手里。
        WindowCompat.setDecorFitsSystemWindows(host.window, false)
        val controller: WindowInsetsControllerCompat =
          WindowCompat.getInsetsController(host.window, host.window.decorView)
        // 深浅图标一起设：状态栏与导航栏在 edge-to-edge 下都是透明浮层，必须同相。
        controller.isAppearanceLightStatusBars = darkIcons
        controller.isAppearanceLightNavigationBars = darkIcons
      } catch (_: Throwable) {
      }
    }
  }
}
