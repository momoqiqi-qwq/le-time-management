# v0.69.0 · 左下角新增「缩放视图」：一键收成固定大小并居中，再按还原

## 需求

> 在软件左下角再添加界面大小转换的按钮，按下后让界面居中，并按图片所示的大小调整。
> 再按一次就恢复到未按之前的界面大小和位置。

只影响 **Windows / macOS 桌面端**。Android 与小程序没有「窗口」可调，按钮不注册。

## 那颗按钮

左下角横排操作条（`rail dock`）原本两颗：深浅色切换、设置。现在第三颗 **缩放视图** 追加在末尾
（`settings.railActionOrder` 的归一化规则会把新注册的动作补到尾部，老用户无需迁移；
不喜欢位置直接按住拖走，或 Alt+←/→ 重排）。

| 状态 | 图标 | tooltip | 行为 |
|---|---|---|---|
| 未按 | `compress` | 窗口居中并收成 1600 × 1100 | 记住当前几何 → 取消最大化 → 设成 1600×1100 → 居中 |
| 已按 | `expand` | 还原窗口的大小和位置 | 写回记住的尺寸与位置（原来最大化则重新最大化） |

激活态用 `.window-focus-btn.on` 上了深色底，一眼看得出当前处在哪一档。

## 1600 × 1100 是怎么量出来的

需求截图 **1762 × 1213 物理像素**，开发机 2560×1600 @ **110%** 缩放：

```
1762 / 1.1 ≈ 1602      1213 / 1.1 ≈ 1103
```

无边框窗口（`decorations: false`）带一圈**隐藏投影边距**，外框比内容大 2~3 px，
去掉之后内容区正好 **1600 × 1100 逻辑像素** —— 四象限每个象限的卡片基本一屏看完，不用滚。

这个值写死在 `src/windowSize.js` 的 `FOCUS_WINDOW_SIZE`，是尺寸的单一事实源；
按钮 tooltip、toast、测试断言都从它取，不在 CSS / shell 里重复写数字。

屏幕装不下时自动退到「可用区域 − 24 px 余量」（复用 `resolveWindowSize` 的 `fitToScreen`），
所以在 1366×768 的笔记本上会收成 1342×744，而不是把窗口右下角顶出屏幕。

## 一个容易搞错的 API 细节：快照必须 inner + outer 成对取

`toggleFocusWindow()` 存快照用 `innerSize()` + `outerPosition()`，还原用 `setSize()` + `setPosition()`。
这不是随手挑的，两侧必须严格配对：

| 前端 API | 落到 tao（Windows） | 取的是 |
|---|---|---|
| `setSize` | `set_inner_size` | **内容区**（还会自己补投影边距） |
| `innerSize` | `client_rect` | **内容区** |
| `setPosition` | `set_outer_position` | **外框**（`SetWindowPos` 的 x/y） |
| `outerPosition` | `get_window_rect` | **外框** |

若用 `outerSize()` 取、再喂给 `setSize()`，因为 `setSize` 语义是「内容区」、还会再加一次投影边距，
每按一轮还原窗口就缩掉一圈，按十次窗口的没了。

## 快照只存内存，不落 store

「缩放视图」管的是**当前这一次**看着顺不顺眼；「设置 › 界面与交互 › 启动窗口大小」管的是
**每次打开**长什么样。两者是正交的，所以快照放在 `windowSize.js` 的模块变量里，重启即失效 ——
存进 store 反而会让「上次退出时停在缩放态」污染下一次启动，把启动设置变得看起来不生效。

中途调窗口失败（拿不到显示器信息、`setSize` 抛错）时**不写快照**，按钮不会卡在激活态。

## 改动清单

| 文件 | 改动 |
|---|---|
| `src/windowSize.js` | 新增 `FOCUS_WINDOW_SIZE`、`focusWindowSize()`、`isFocusWindowActive()`、`toggleFocusWindow()`；把读显示器可用区域的逻辑从 `applyWindowSize` 里抽成私有的 `readMonitorArea()` 共用 |
| `src/shell.js` | `if (desktopWindow)` 内注册 `window-focus` rail 动作（走 `registerRailAction`，不改建 DOM 代码） |
| `src/styles.css` | `.window-focus-btn` 的 `.fa-ic` 尺寸；`.window-focus-btn.on` 激活态 |
| `scripts/test-window-size.mjs` | 新增「十二、缩放视图」段：尺寸常量、屏幕夹取、非桌面端降级、接线守卫、图标存在性、CSS 优先级守卫 |

**没有数据迁移**：不动 `letime-data` 的结构，`migrations.js` 无需新增；
`railActionOrder` 由既有的归一化函数自动补新 id。

## 校验

```
✓ 三端版本一致：v0.69.0
✓ 派生调色板已同步（15 套深色变体）
✓ shiguang-schedule 生成物与源一致
✓ Android 原生代码与版本化镜像一致
PASS: 55 个测试脚本全部通过
```
