# Le时间管理 v0.32.2

修复版。本版修的是**一个让 Android 端从 v0.25.0 起一直编译不过的编译错误** ——
也就是说，**Android 安装包已经断了 8 个版本**（上一次成功出包是 v0.16.0）。

## 问题现象

`bash scripts/build-android-apk.sh all` 交叉编译到 `aarch64-linux-android` 时报：

```
error[E0599]: no method named `center` found for struct `WebviewWindowBuilder`
   --> src\lib.rs:139:10
        .center()
```

Windows 端构建完全正常，只有 Android 目标编不过。

## 为什么会出现

`school_import_open`（v0.25.0 随「课程表 · 选择学校」教务适配导入一起加入）在创建教务登录窗口时，
builder 链上写了 `.center()`：

```rust
WebviewWindowBuilder::new(&app, "school-import", WebviewUrl::External(parsed))
    .title(...)
    .inner_size(1100.0, 780.0)
    .center()            // ← 桌面端专有
    .initialization_script(SCHOOL_IMPORT_BOOTSTRAP)
    ...
```

在 tauri 2.11 里，`center()` 位于 `#[cfg(desktop)]` 门控的 `impl WebviewWindowBuilder` 块中
（同块还有 `decorations()`），**Android 上这个方法根本不存在**。
而 `title()` / `inner_size()` / `resizable()` 在**另一个不受门控的 impl 块**里，全平台可用 ——
所以只有 `center()` 一个方法炸。

**为什么没被及早发现**：`native_schedule.rs` 里有 `debug_assertions` 的 dev 兜底，
Windows 端也一直是好的；而 Android 只在真的跑 `build-android-apk.sh` 时才会暴露。
v0.25.0 之后再没有人成功出过 APK，于是这个错误静静躺了 8 个版本。

## 怎么修的

把 `.center()` 从链上摘出来，用 `#[cfg(desktop)]` 单独条件应用：

```rust
let builder = WebviewWindowBuilder::new(...)
    .title(...)
    .inner_size(1100.0, 780.0)
    .initialization_script(SCHOOL_IMPORT_BOOTSTRAP)
    .on_navigation(...);

// center() 属于 #[cfg(desktop)] 门控的 impl 块，Android 上没有这个方法
#[cfg(desktop)]
let builder = builder.center();

builder.build().map_err(...)?;
```

- Windows / macOS：行为**完全不变**，教务登录窗口仍然居中。
- Android：跳过居中（Android 上窗口由系统接管，本来也没有「居中」的概念），其余全部保留。

## 影响范围

- **Windows**：无行为变化（仅重新编译）。
- **Android**：从「完全无法构建」变为**可构建**。本版因此成为 v0.16.0 以来第一个 Android 安装包。
- **小程序**：无影响。

## 数据迁移

**无需迁移。** 只改窗口创建方式，不涉及数据结构与本地存储键。

---

## 下载

| 文件 | 说明 |
| --- | --- |
| `LeTime-0.32.2-x64-setup.exe` | Windows 安装版（NSIS，中文界面） |
| `LeTime-0.32.2-x64-portable.exe` | Windows 免安装版，双击直接运行 |
| `LeTime-0.32.2-universal.apk` | Android 通用包（arm64-v8a + x86_64），包名 `com.yile.letime` |

系统要求：Windows 10 1809 及以上 / Windows 11，x64；Android 7.0（API 24）及以上。

> 本版同时包含此前未单独发版的 v0.31.1（课程表插件死面板修复）、
> v0.32.0（番茄专注：到点提醒可配置 + 提示音可选可自定义）与
> v0.32.1（原生课表启动失败时回退内置 Web 课表）的全部改动。
