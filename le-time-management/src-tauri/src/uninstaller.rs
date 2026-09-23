//! 应用内「卸载本应用」（仅 Android 有实际动作）。
//!
//! ## 为什么只有 Android 做
//!
//! Windows/Linux 的卸载本来就归系统管（「应用与功能」/ 包管理器），NSIS 也自带卸载器，
//! 应用内再放一个按钮只是多一次间接；而且桌面端没有「先退干净再拉卸载器」的可靠路径
//! —— `app.exit(0)` 之后由谁去起卸载器就成了竞态。所以这里对非 Android 只回一句说明，
//! 前端据此**根本不渲染**那个入口（见 `src/views/settings/uninstall.js`）。
//!
//! ## Android 侧只做一件事
//!
//! 把 `Intent.ACTION_DELETE` + `package:<包名>` 发给系统卸载程序，由 `AppUninstallerPlugin`
//! 执行。返回 `launched:true` 只代表「系统卸载确认界面已拉起」：用户之后点取消还是点卸载
//! 我们收不到（真卸载时进程直接被系统杀掉），所以前端文案只能说「已交给系统卸载程序」。
//!
//! ## 命令必须全平台注册
//!
//! `invoke_handler` 的命令列表没有平台门控，非 Android 分支也要能编译（同 `system_bar.rs`
//! 里那条关于 `quit_ack` 的教训：只在单平台存在的命令会让另一个平台编译断掉）。

use serde_json::Value;
use tauri::Runtime;
// `Manager` 只被 Android 分支用到（`app.try_state::<T>()`），桌面端不需要 ⇒ 按平台门控，
// 否则 Windows 构建会有 unused_imports 警告。
#[cfg(target_os = "android")]
use tauri::Manager;

#[cfg(target_os = "android")]
struct AndroidUninstaller<R: Runtime>(tauri::plugin::PluginHandle<R>);

#[cfg(target_os = "android")]
pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("letime-uninstall")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.yile.letime", "AppUninstallerPlugin")?;
            app.manage(AndroidUninstaller(handle));
            Ok(())
        })
        .build()
}

/// 把本应用交给系统卸载程序。
#[tauri::command]
pub async fn app_uninstall<R: Runtime>(app: tauri::AppHandle<R>) -> Result<Value, String> {
    #[cfg(target_os = "android")]
    {
        let handle = app
            .try_state::<AndroidUninstaller<R>>()
            .ok_or("卸载桥未初始化，请重启应用后再试")?;
        return handle
            .0
            .run_mobile_plugin_async("uninstall", serde_json::json!({}))
            .await
            .map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(serde_json::json!({
            "launched": false,
            "reason": "当前平台请在系统的应用管理里卸载"
        }))
    }
}
