package com.yile.letime

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * 主 Activity。
 *
 * ## 本文件是「版本化镜像」，不是生成物
 *
 * `src-tauri/gen/android/` 是 Tauri 的生成目录（gitignored），**重新 `tauri android init`
 * 会把它整个清掉** —— 而手机端真正干活的代码只活在那里。所以原生代码的事实源放在
 * `le-time-management/android/gradle/`（本文件就是），由 `tools/sync-android-native.js`
 * 幂等同步进 `gen/android/`；`scripts/build-android-apk.sh` 构建前会先跑一次 `--check`。
 *
 * **改这份文件，不要去改 gen 里的副本**（改了会在下次同步时被覆盖，且提交不进 git）。
 *
 * ## 为什么要手动注入安全区（v0.37.15）
 *
 * `enableEdgeToEdge()` 让窗口铺满整屏、状态栏/导航栏变成**透明浮层**画在 WebView 之上。
 * Android 的约定是：既然应用声明了 edge-to-edge，就该由应用自己消费 WindowInsets。
 *
 * 但 **Android WebView 不实现 CSS 环境变量 `env(safe-area-inset-*)`** —— 无论
 * `viewport-fit=cover` 写不写，取值恒为 0。于是 `styles.css` 里那一整套
 * `padding-top: env(safe-area-inset-top, 0px)` 在手机上全部退化成 `0px`：
 * 顶栏从屏幕绝对顶部开始绘制，「设置」标题与副标题正好压在状态栏图标（信号/电量）下面，
 * 右上角的窗口按钮也被状态栏覆盖。
 *
 * 修复：在原生侧读真实 inset，通过 `--sat/--sab/--sal/--sar` 四个 CSS 变量注入网页。
 * 前端把 `env(safe-area-inset-top, 0px)` 写成 `var(--sat, env(safe-area-inset-top, 0px))`
 * —— Android 走注入值，桌面 / iOS 走原生 `env()` 兜底，两条路径互不干扰。
 *
 * 用 `onWebViewCreate` 钩子而不是反射取 WebView：WryActivity 已经暴露了这个回调点。
 *
 * ## 返回键与双指缩放（v0.37.17）
 *
 * 三件事都落在同一个 Activity 上，一起记在这里：
 *
 * 1. **返回键**：Tauri 的 `TauriActivity` 把 wry 的 `handleBackNavigation` 固定成了 `false`
 *    （wry 自己的默认值是 `true`），于是 Android 返回键完全不碰 WebView 历史，直接结束
 *    Activity —— 用户看到的就是「一按返回就退出软件」。这里覆盖回 `true`，wry 的策略即
 *    「WebView 能回退就 goBack()，不能回退才 finish」。前端 `src/backNav.js` 负责压历史
 *    （切视图 / 浮层哨兵），所以返回键会先回上一个界面、关掉最上层弹窗，全部退完才退出。
 *    教务导入窗口（SchoolImportActivity）直接继承 TauriActivity，仍是 `false`，
 *    保持「返回键 = 关闭该窗口」，这是刻意的。
 *
 * 2. **双指缩放**：WebView 默认不启用内置缩放机制（`builtInZoomControls = false`），
 *    叠加 index.html 里 viewport 的 `user-scalable=no`，就完全缩放不了。这里打开内置缩放
 *    并隐藏它自带的 +/- 悬浮件，由前端 `src/mobileViewport.js` 在 Android 下放开
 *    `user-scalable`；两边缺一不可。
 *
 * 3. **安全区注入**：见上文。
 */
class MainActivity : TauriActivity() {

  /** 返回键交回 wry 处理（详见类注释第 1 条）。 */
  override val handleBackNavigation: Boolean = true

  private var webView: WebView? = null
  private var appliedInsetSignature: String? = null

  /**
   * 在 `enableEdgeToEdge()` 之前生效的兜底 inset。
   *
   * `onWebViewCreate` 早于第一帧 WindowInsets 分发，此时 `ViewCompat.getRootWindowInsets`
   * 可能返回 null。这份从系统资源读出的高度能让首屏就不重叠，之后被真实 inset 覆盖。
   */
  private val fallbackTopPx: Int by lazy {
    val id = resources.getIdentifier("status_bar_height", "dimen", "android")
    if (id > 0) resources.getDimensionPixelSize(id) else 0
  }

  private val fallbackBottomPx: Int by lazy {
    val id = resources.getIdentifier("navigation_bar_height", "dimen", "android")
    if (id > 0) resources.getDimensionPixelSize(id) else 0
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // 竖屏吸顶是主场景；但横屏 / 折叠屏展开时状态栏会跑到侧边（左刘海），
    // 所以四个方向一起监听，不能只取 top/bottom。
    ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      // 虚拟键盘弹出时导航栏被顶掉，底栏内边距要跟 ime 取较大者，否则输入框会被键盘压住。
      val bottom = maxOf(bars.bottom, ime.bottom)
      applyInsets(bars.top, bottom, bars.left, bars.right)
      // 交还系统继续分发：WebView 自己也要拿到 insets，否则软键盘避让会失效。
      ViewCompat.onApplyWindowInsets(view, insets)
    }
    // 主动请求一次，避免只依赖被动回调。
    ViewCompat.requestApplyInsets(window.decorView)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView

    // 双指缩放：打开内置缩放机制并隐藏 +/- 悬浮件（配合 mobileViewport.js 放开 user-scalable）
    webView.settings.apply {
      setSupportZoom(true)
      builtInZoomControls = true
      displayZoomControls = false
    }

    // WebView 刚建好时页面还没加载，注入会丢失；用兜底值先铺一层底，
    // 真实值会在 WindowInsets 回调里补上（那时页面早已 ready）。
    // 另挂 WebViewClient：每次页面加载完补注入一次，覆盖导航 / 前端热重载把
    // documentElement 内联样式重置掉的场景。
    webView.webViewClient = object : android.webkit.WebViewClient() {
      override fun onPageFinished(view: WebView, url: String?) {
        super.onPageFinished(view, url)
        appliedInsetSignature = null   // 新文档会丢掉内联变量，清签名强制重发
        lastKnownInsets?.let { applyInsets(it.top, it.bottom, it.left, it.right) }
      }
    }
    applyInsets(fallbackTopPx, fallbackBottomPx, 0, 0)
  }

  /** 最近一次已知的真实 inset，供 onPageFinished 补注入用。 */
  private var lastKnownInsets: InsetBox? = null

  private data class InsetBox(val top: Int, val bottom: Int, val left: Int, val right: Int)

  /** 把 inset 写成 CSS 变量。重复值不重发，避免每次 insets 回调都跨进程 eval。 */
  private fun applyInsets(top: Int, bottom: Int, left: Int, right: Int) {
    lastKnownInsets = InsetBox(top, bottom, left, right)
    val signature = "$top|$bottom|$left|$right"
    if (signature == appliedInsetSignature) return
    appliedInsetSignature = signature

    val js = buildString {
      append("(function(){var s=document.documentElement.style;")
      append("s.setProperty('--sat','${top}px');")
      append("s.setProperty('--sab','${bottom}px');")
      append("s.setProperty('--sal','${left}px');")
      append("s.setProperty('--sar','${right}px');")
      append("})();")
    }

    // 跨进程 IPC，必须在主线程，且 WebView 未就绪时要吞掉异常 ——
    // 这里出问题不能连带把 Activity 拖崩。
    val view = webView ?: return
    view.post {
      try {
        view.evaluateJavascript(js, null)
      } catch (e: Throwable) {
        // 页面正在销毁 / 尚未 attach：忽略，并清掉签名让下一次 insets 回调重试。
        appliedInsetSignature = null
      }
    }
  }
}
