# 时光课程表原版源码移植

目标：打开Le时间管理插件后使用原版界面、导航、编辑和教务导入。原型 JavaScript 周课表不满足这个目标。

## 来源与复用

- `vendor/shiguangschedule/` 来自用户提供的 `shiguangschedule-main.zip`，保留 Apache-2.0 LICENSE、原作者信息及完整工程。
- 原始入口 `shared/src/commonMain/kotlin/com/xingheyuzhuan/shiguangschedule/App.kt`、页面、Room 数据库、仓库、教务脚本桥和学校仓库配置继续直接使用。
- 新增代码集中在 JVM 平台适配、桌面宿主和 Android 包装模块，修改处标明 Le。
- 教务导入仍使用原版 `WebViewScreen` → `WebBridgeHandler` → `CourseConversionRepository`。Windows 增加 Chromium/JCEF 管道，Android 使用原版 WebView。

## 当前验证（2026-09-10，持续更新）

- 原版共享代码及桌面入口已编译通过，原版桌面程序启动并初始化数据库。
- Compose 测试已通过“我的 → 课表导入/导出”的导航和导入入口检查。
- 打包后的原版 EXE 已通过父窗口嵌入、390×640 缩放、隐藏、控制管道关闭后退出测试。
- 原版 `androidApp:assembleDebug` 已成功。
- Le时间管理与原版合并 release APK 已构建成功（arm64-v8a / x86_64），正在完成模拟器验收。
- 真实 Chromium/JCEF 执行测试脚本，通过原版 `WebBridgeHandler` 将课程及第 1、3、5 周写入原版 Room 数据库；这是桥接集成测试，不是真实学校登录测试。
- JVM 图片裁剪已接入原版裁剪界面和 Skia 输出；桌面提醒修正了提前 0 分钟漏报、跨午夜重复提醒。
- 主应用前端 `npm run build` 与 Rust `cargo check --lib` 已通过；后续原生桥改动还需复验。
- 未验证真实学校账号的完整导入，不能把模拟数据或入口可点描述为教务导入成功。

## 构建

需要 JDK 21、Android SDK 37。网络代理通过调用进程的 `GRADLE_OPTS` 配置，不修改全局 Gradle 设置。

Windows：

```powershell
./tools/build-native-schedule.ps1
# 加上 -Installer 才生成含原版运行时的Le时间管理 NSIS 安装包。
```

脚本先运行原版 Compose／原生窗口测试，再把含 Java 运行时的发行目录放入 `le-time-management/src-tauri/native/shiguang/`。打包使用 `tauri.shiguang.conf.json`。Windows jpackage 对中文参数路径存在编码问题，构建输出使用单独的 ASCII 目录，源码仍留在原位置。

Android：

```bash
TIDE_NATIVE_SCHEDULE=1 le-time-management/scripts/build-android-apk.sh all
```

Rust 库先构建，随后用原版 Gradle 工具链构建 `leAndroid`。`androidPlugin` 直接引用原版 Android 源码和资源；同一个 APK 内包含Le时间管理和时光 Activity。宿主采用原版 Application 初始化 Koin、数据库与 WorkManager。新增 Gradle 包装模块引用 Tauri 原始源文件，不修改 Cargo 缓存或原有生成工程的构建脚本。

## 仍须完成的差异

- Windows 系统日历同步、分享、自动勿扰／静音／穿戴同步等上游桌面实现存在缺项，未达到 Android 全功能一致；图片裁剪已补充，但仍需专项交互验收。
- Windows 新增提醒消费原版计算出的课程实例，目前只在程序运行期间提醒，尚不等价于 Android 后台精确闹钟。
- Android 合并包需要验证启动、返回、教务浏览器、文件选择、通知与小组件。
- 微信小程序尚无原版 UI 移植；不能直接运行 Kotlin/Compose 原生包。
- 浏览器预览仍是早期 JS 原型，不代表原版原生插件。原型存储和原版 Room 存储尚未做迁移。
- 本轮安装包：`releases/Le-shiguang-native-20260910-x64-setup.exe`、`releases/Le-shiguang-native-20260910-universal.apk`。旧 care 包和 JS 插件 ZIP 不包含本轮原生移植成果。

## 插件视图的回退约定（v0.31.1 起）

原生运行时**只有**走 `tauri.shiguang.conf.json` 的「含原版课表」包才在安装目录里，默认包（`tauri.conf.json`）
不含它 —— 且 `native/shiguang/` 是 300 MB 级的 jpackage 产物，不可能默认随包分发。

所以 `src/pluginHost.js` 对课表插件的接管是**增强**而不是**替代**：

```js
{ render: (el, ctx) => renderNativeSchedule(el, ctx, def.render) }
```

`src/nativeSchedule.js` 探测不到运行时（或探测本身失败）就把视图交回插件自带界面
（`public/plugins/shiguang-schedule/`，由 `tools/build-schedule-plugin.js` 从 `model.js` + `ui.js` 生成）。
**不要再改回无条件覆盖** —— 那会让默认包一点开课程表就只有一行提示。回归由
`le-time-management/scripts/test-native-schedule.mjs` 守住（四条分支：运行时缺失 / 探测失败 / 运行时可用 / 插件界面自身报错）。

两条路的存储**不互通**：插件界面写 `tide.storage`，原版写 Room。见下面「仍须完成的差异」。

## 合并包修复记录

- Android 版本号使用 1001，可覆盖此前版本号为 1000 的Le时间管理安装，保留应用数据。
- Android 合并清单保留 ProcessLifecycleInitializer，只移除 WorkManager 自动初始化，继续使用原版 Koin WorkManager 配置。
- release 构建加载 Tauri 生成的 `proguard-wry.pro`，保留 Rust JNI 调用的 Activity/WebView 方法，修复 `MainActivity.getId()` 被 R8 改写引起的启动崩溃。
- Windows 打包脚本默认使用独立 Rust 产物目录，避免旧项目路径的权限缓存导致构建失败。
