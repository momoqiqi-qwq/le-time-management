# v0.74.1 · 补上窗口写操作的 Tauri ACL（缩放视图 / 启动窗口大小 / 窗口置顶）

## 症状

桌面版里三处「按了没反应」，控制台报同一条：

```
Command plugin:window|set_size not allowed by ACL
```

- 左下角「**缩放视图**」按钮（收成固定尺寸并居中 / 再按还原）
- 设置 → 界面与交互 → 启动窗口大小的「**立即应用**」（把 ACL 报错原文显示在页面上）
- 快捷坞的「**窗口置顶**」（📌）

## 根因

`src-tauri/capabilities/default.json` 只授了这些窗口权限：

```
show / unminimize / set-focus / minimize / toggle-maximize / close / start-dragging
```

而 `src/windowSize.js` 用的是 **`maximize` / `unmaximize` / `setSize` / `center` / `setPosition`**，
`src/shell.js` 的置顶用的是 **`setAlwaysOnTop`** —— 一条都不在清单里。
`toggle-maximize` 只管「切换」，**不等于** `maximize` + `unmaximize`，这是最容易看漏的地方。

Tauri v2 的 ACL 是**运行时**逐条校验的：清单缺项不会编译失败，只在调用那一刻返回
`not allowed by ACL`。而 `unmaximize()` / `center()` 都带 `.catch(() => {})`（调不动窗口不该拦住启动），
所以异常被吞、只剩按钮没反应；`setSize()` 没被 catch，才把错误冒到设置页上。

## 修法

`capabilities/default.json` 补六条：

```
core:window:allow-maximize        core:window:allow-set-size
core:window:allow-unmaximize      core:window:allow-set-position
core:window:allow-center          core:window:allow-set-always-on-top
```

六条在 `gen/schemas/` 的 desktop / windows / android / mobile 四份 schema 里都存在，
所以放在三端通用的 `default` 里不会像 `desktop-global-shortcut.json` 那样需要按平台隔离。

只读的那批（`innerSize` / `outerPosition` / `isMaximized` / `isAlwaysOnTop` / `currentMonitor`）
由 `core:default` 带出的 `core:window:default` 覆盖，本来就能用 —— 这也是为什么报错停在 `set_size`
而不是更早的读取调用上。

## 为什么以前没被发现

- 浏览器里测不出来：`applyWindowSize()` 第一行 `if (!isDesktopRuntime()) return { applied:false }`，
  Vite 页面永远走早退分支。
- 单测只测纯逻辑（尺寸计算、偏好归一、夹取），没人把「代码用到的窗口 API」和「清单里给的权限」对过。

## 加了一道锁

`scripts/test-window-size.mjs` 末尾新增：递归扫 `src/**/*.js` 里所有 `win.<api>(` 调用，
逐条要求 —— 写操作必须在 `capabilities/default.json` 里有对应的 `core:window:allow-<kebab>`，
只读操作必须在只读白名单里，**两者都不认识的直接判红**（逼后来人登记）。
本 bug 涉及的六条另有一组指名道姓的断言。已用变异实测：从清单里删掉 `allow-set-size`，
断言精确报出「windowSize.js 调用 win.setSize()，但 capabilities/default.json 缺 …」。

## 生效条件

⚠️ capabilities 是**构建期烘进二进制**的，改完必须重新打包并覆盖安装才生效；
已经装好的桌面版 / APK 不会自己变好。

## 影响面

- 桌面（Win）：三处窗口操作恢复。
- APK：`setAlwaysOnTop` 一类的窗口调用在 Android 上仍受 Tauri 移动端的实现限制（移动端没有真正的窗口），
  补权限只是让调用不被 ACL 挡在前面，不改变「移动端不生效」这个事实。
- 小程序：无关。
- 数据迁移：无。

## 校验

```
node ../tools/sync-version.js --check     ✓ 三端版本一致：v0.74.1
npm test                                  ✓ 61 个测试脚本全部通过（含新增的 ACL 断言）
```
