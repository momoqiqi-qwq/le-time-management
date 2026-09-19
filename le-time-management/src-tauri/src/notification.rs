//! Android 系统通知与后台闹钟的跨端桥。
//!
//! ## 为什么需要
//!
//! 「任务提醒」原本只有应用内一条 toast + Web Audio 短音：
//!
//! · Android WebView **不实现 Web Notifications API**，`window.Notification` 压根不存在；
//! · 桌面端 WebView2 同样没有，`taskReminder.js` 里那句权限判断在两端都是死分支；
//! · 更要命的是网页定时器不跨进程存活 —— 应用被系统划掉之后，提醒就彻底没了。
//!
//! 所以手机端必须走原生：`NotificationPlugin.kt` 负责渠道、通知构建、按钮回传，
//! `AlarmManager` 负责「应用不在了也到点醒过来」。本文件是这两者与网页之间唯一的通道。
//!
//! ## 为什么一个命令带 action，而不是十个命令
//!
//! Kotlin 侧的 `@Command` 方法名就是路由键，十个 Rust 命令只是把同一份路由表抄两遍，
//! 改一边忘另一边的概率远高于只维护一张表。这里 Rust 侧持有一份 `KNOWN_ACTIONS`，
//! 传错的 action 直接报错而不是静默无操作（与 [`crate::native_schedule`] 同款写法）。
//!
//! ## 其他平台
//!
//! 桌面端有自己的通知体系（本版本刻意不动，避免把已验证过的托盘行为卷进来），
//! 所以对非 Android 平台**恒成功返回 `{applied:false}`**，而不是报错 ——
//! 前端可以在所有平台无脑调用同一套 API，不必到处写平台判断。

use serde_json::{json, Value};
use tauri::Runtime;
// `Manager` 只被 Android 分支用到（`app.state::<T>()`），桌面端不需要 ⇒ 必须按平台门控，
// 否则 Windows 上会有 unused_imports 警告。
#[cfg(target_os = "android")]
use tauri::Manager;

/// Kotlin 侧 `NotificationPlugin` 支持的命令名，与 `NotificationPlugin.kt` 的 `@Command`
/// 方法名一一对应。改任何一边都必须同步另一边和 `scripts/test-android-notification.mjs`。
#[cfg(target_os = "android")]
const KNOWN_ACTIONS: &[&str] = &[
    "status",
    "askPermission",
    "openSettings",
    "openExactAlarmSettings",
    "post",
    "cancel",
    "setRing",
    "syncAlarms",
    "clearAlarms",
    "takeActions",
];

#[cfg(target_os = "android")]
struct AndroidNotification<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// 注册 Android 侧的通知插件（与 `system_bar::init` 同款写法）。
///
/// 不注册的话：所有通知命令都拿不到原生句柄，前端表现为「点了授权没反应」，
/// 而不是启动就报错 —— 所以这条 `setup` 失败必须让构建期可见。
#[cfg(target_os = "android")]
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("letime-notify")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.yile.letime", "NotificationPlugin")?;
            app.manage(AndroidNotification(handle));
            Ok(())
        })
        .build()
}

/// 通知与闹钟的统一入口。
///
/// `payload` 的字段直接成为 Kotlin `@Command` 收到的参数对象（原样透传，不重命名），
/// 所以前端字段名必须与 `NotificationPlugin.kt` 里 `argsOf(invoke)` 读的键名对齐。
#[tauri::command]
pub async fn notification<R: Runtime>(
    app: tauri::AppHandle<R>,
    action: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        if !KNOWN_ACTIONS.contains(&action.as_str()) {
            return Err(format!("未知通知操作：{action}"));
        }
        let args = payload.unwrap_or_else(|| json!({}));
        return app
            .state::<AndroidNotification<R>>()
            .0
            .run_mobile_plugin_async(&action, args)
            .await
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        // 桌面端本版本不接原生通知：无事可做，且不是错误（前端在换主题之外
        // 的所有地方都会无脑调这条命令）。
        let _ = (app, action, payload);
        Ok(json!({
            "applied": false,
            "platform": std::env::consts::OS,
            "granted": false,
            "reason": "当前平台不使用原生通知桥（提醒走应用内横幅）"
        }))
    }
}
