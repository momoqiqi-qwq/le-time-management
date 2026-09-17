# v0.52.1 变更说明

> 发布日期：2026-09-18
> 版本类型：patch（悬浮键不再挡住顶栏控件 + 两处 Rust 修复）
> ⚠️ **v0.52.0 从未单独发版**，它的全部功能（APK 沉浸式外壳、时间线视图、左右滑改返回）
> 随本版一并发布，详见 `docs/CHANGELOG-v0.52.0.md`。

## 改：⋮ 菜单键 / 悬浮返回键挪到左右两侧 45% 高度

### 需求（用户原话）

1. 「apk的3点菜单还有设置按钮放到右上角往下的位置{不要挡住东西}」
2. 「把菜单键和返回键放到左右2侧中间」

### 根因（实测复现，不是猜的）

把两颗悬浮键的矩形与**页面里所有可见元素**做相交统计（`probe-floating.cjs`）：

| 档位 | 状态 | 贴顶时压住的东西 |
|---|---|---|
| 390×844 | 收起 / 呼出 | 无 |
| **288×633** | **呼出态** | **顶栏 `button.top-mini-btn.quick-menu-trigger`（快捷入口 / 头像按钮）** |

⇒ 用户说的「设置按钮」就是顶栏右上角那个快捷入口。**390 档测不出来，288 档一测就中** ——
高密度屏的 CSS 布局宽度只有 288（物理宽 ÷ dpr），顶栏被压扁后两者撞在一起。

### 改法

| 件 | 改前 | 改后 |
|---|---|---|
| `.chrome-toggle`（⋮） | `top: calc(5px + var(--sat, env(…)))` | `top: calc(45% - 18px)` |
| `.mobile-back`（‹ 返回） | 同上（左侧对称） | `top: calc(45% - 18px)` |
| `.app.chrome-shown .topbar` | `padding-right: calc(46px + var(--sar, env(…)))`（给贴顶的 ⋮ 让位） | `calc(12px + var(--sar, env(…)))`（⋮ 已不在顶栏，回归常规右边距） |

两个细节：

- **不是正中间 50%，是 45%**：纵向 5%~90% 逐档扫描（`scan-floating.cjs`，4 视图 × 2 键），
  50% 处会压住四象限右列格子的 `button.addq`「添加到这个象限」—— 浮层会吃掉点击。
  交互控件遮挡为 0 的档位是 25/30/**45**/60/75/90%，45% 离中间最近。
- **不用 `transform: translateY(-50%)` 居中**：`:active` 要覆写 transform 做 `scale(.94)`，
  两者打架会让按下瞬间跳位。用 `calc(45% - 半高)`。

改后实测：四象限 / 时间线 / 番茄三视图 × 收起 + 呼出两态，**交互控件遮挡全为 0**
（只压住象限标题这类纯文本 span，非控件）。

## 修：Android 编译断在 `quit_ack`（v0.51.0 起就没编过）

`error: cannot find macro __cmd__quit_ack` —— v0.51.0 的托盘退出握手给 `quit_ack`
加了 `#[cfg(desktop)]`，而 `tauri::generate_handler![...]` 的命令列表**没有平台门控**。
桌面端一直编得过，所以直到这次构建 APK 才发现。

修法：退出握手这一组（`QuitGate` / `QUIT_GATE` / `quit_gate` / `quit_ack`）去掉门控，
只保留 `wait_quit_ack` 与 `setup_tray` 的桌面门控。移动端无人调 `quit_ack`，零成本。
（代码里已写注释：这组不许再加 `#[cfg(desktop)]`。）

## 修：托盘退出白等 2 秒

`quit_ack` 要的 `State<Arc<QuitGate>>` **从来没 `.manage()` 注册过** ⇒ 编译能过，
运行时注入失败 ⇒ 握手永远敲不响，每次从托盘退出都要空等满 2 秒超时才走。
已在 builder 链补 `.manage(quit_gate().clone())`。

## 影响端

- Android（APK）：✅ 主要目标（键位 + 终于能编过）。
- 桌面端：托盘退出不再白等 2 秒；窗口缩到 ≤900px 时两颗悬浮键位置同样下移。
- 数据：无迁移。

## 测试

- `scripts/test-chrome-toggle.mjs`：原来断言「⋮ 的 `top` 必须吃 `var(--sat, env(…))`」，
  纵向不贴边后与 `--sat` 无关 ⇒ 改为断言 `top: calc(45% - 18px)` 并写明理由。
  **不许裸用 `env()`**（铁律四）由文件末尾的全文件守卫统一把守，没有放松。
- 全量 `run-tests.mjs` 43 个脚本通过；`sync-version --check`、`gen-theme-dark --check`、
  `build-schedule-plugin --check`、`sync-android-native --check` 全部通过。

## 产物

| 文件 | 字节 |
|---|---|
| `LeTime-0.52.1-universal.apk` | 22,110,528 |
| `LeTime-0.52.1-x64-setup.exe` | 4,365,988 |
| `LeTime-0.52.1-x64-zh-CN.msi` | 6,086,656 |
| `LeTime-0.52.1-x64-portable.exe` | 13,392,896 |
