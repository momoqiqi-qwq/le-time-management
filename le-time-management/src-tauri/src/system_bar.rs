//! 系统栏（状态栏 / 导航栏）图标明暗的跨端同步。
//!
//! ## 为什么需要
//!
//! Android 端 `MainActivity` 调了 `enableEdgeToEdge()` ⇒ 状态栏与导航栏是**透明浮层**
//! 盖在 WebView 上，系统栏图标直接压在网页顶部 / 底部那一条的背景上。
//!
//! 而图标颜色由 Android 按**应用主题的 light/dark** 决定 —— `Theme.letime` 继承
//! `Theme.MaterialComponents.DayNight.NoActionBar`，只跟随**系统深色模式**，
//! **完全不知道网页里的 `data-theme-mode`**。两者一旦不一致，图标就消失在背景里：
//!
//! | 系统 | 网页 | 状态栏带底色 | 图标色 | 对比度 | 结果 |
//! |---|---|---|---|---|---|
//! | 深色 | 浅色 | 浅 rgb(253,253,252) | 白 | **1.02** | 看不见 |
//! | 浅色 | 深色 | 深 rgb(42,38,32) | 近黑 | **1.16** | 看不见 |
//! | 深色 | 深色 | 深 | 白 | 15.04 | ✓ |
//! | 浅色 | 浅色 | 浅 | 近黑 | 17.10 | ✓ |
//!
//! （实测自真浏览器探针，判据 3.0 = 图形元素对比度下限。设置弹窗 `inset:0` 全屏贴顶，
//! 「设置 → API Key」那一页最容易撞上。）
//!
//! ## 修法
//!
//! 前端每次解析出真实亮度（`theme.js` 的 `paintTheme`）就调 [`system_bar`]，
//! 由 Android 侧的 `SystemBarPlugin` 用 `isAppearanceLightStatusBars` 覆盖系统默认值。
//! 无论系统深色 / 浅色，图标永远与网页实际背景反相 —— 根治。
//!
//! ## 其他平台
//!
//! Windows 端窗口**不**铺满整屏（有原生标题栏），不存在「系统栏压网页」的问题，
//! 所以这里对非 Android 平台**恒成功返回 `{applied:false}`**，而不是报错 ——
//! 前端可以在所有平台无脑调用，不必到处写平台判断。

use serde_json::Value;
use tauri::Runtime;
// `Manager` 只被 Android 分支用到（`app.state::<T>()` / `app.manage()`），
// 桌面端不需要 ⇒ 必须按平台门控，否则 Windows 上会有 unused_imports 警告。
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct AndroidSystemBar<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("system-bar")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.yile.letime", "SystemBarPlugin")?;
            app.manage(AndroidSystemBar(handle));
            Ok(())
        })
        .build()
}

/// 把网页解析出的亮度同步给系统栏图标。
///
/// `dark_icons = true` 表示「浅色背景，需要深色图标」—— 与 Android 的
/// `isAppearanceLightStatusBars` 语义一致，前端传 `mode == "light"` 即可。
#[tauri::command]
pub async fn system_bar<R: Runtime>(app: tauri::AppHandle<R>, dark_icons: bool) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        return app
            .state::<AndroidSystemBar<R>>()
            .0
            .run_mobile_plugin_async(
                "setDarkIcons",
                serde_json::json!({ "darkIcons": dark_icons }),
            )
            .await
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        // 桌面端平台有自己的标题栏 / 状态栏，网页永远碰不到它 ⇒ 无事可做，且不是错误。
        let _ = app;
        Ok(serde_json::json!({
            "applied": false,
            "darkIcons": dark_icons,
            "reason": "当前平台不使用 WebView 之上的系统栏浮层"
        }))
    }
}
