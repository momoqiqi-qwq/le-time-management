# v0.51.0 变更说明

> 发布日期：2026-09-17
> 版本类型：minor（新增跨端同步机制 + Android 原生插件）

## 修：手机端状态栏文字/图标看不见（「设置 → API Key」页最容易撞上）

### 现象

用户反馈：Android 端「设置 → API Key」页面，手机状态栏的文字（时间）、信号、电量**全看不见**。

### 根因（真浏览器实测确认）

Android 端 `MainActivity` 调了 `enableEdgeToEdge()` ⇒ 状态栏与导航栏是**透明浮层**
盖在 WebView 上，系统栏图标**直接压在网页顶部那条的实际底色上**。

而图标颜色是 Android 按**应用主题的 light/dark** 决定的（`Theme.letime` 继承
`Theme.MaterialComponents.DayNight.NoActionBar`），它只跟随**系统深色模式**
（即 `prefers-color-scheme`）——**完全不知道网页里的 `data-theme-mode`**。

于是「网页主题」与「系统深色模式」一旦不一致，图标必然消失在背景里：

| 系统深色模式 | 网页主题 | 状态栏带实测底色 | 图标色 | 对比度 | 结果 |
|---|---|---|---|---|---|
| 深色 | 浅色 | 浅 `rgb(253,253,252)` | 白 | **1.02** | ✗ 看不见 |
| 浅色 | 深色 | 深 `rgb(42,38,32)` | 近黑 | **1.16** | ✗ 看不见 |
| 深色 | 深色 | 深 | 白 | 15.04 | ✓ |
| 浅色 | 浅色 | 浅 | 近黑 | 17.10 | ✓ |

判据 3.0 = 图形元素对比度下限（WCAG）。设置弹窗是 `inset:0` 全屏贴顶浮层，
头部直接顶到屏幕绝对顶部，所以「设置 → API Key」那一页最容易撞上。

### 改法

新增一条「网页亮度 → 系统栏图标明暗」的同步链路，**四段**缺一不可：

| 层 | 文件 | 职责 |
|---|---|---|
| 前端 | `src/theme.js` · `paintTheme()` | 每次解析出真实亮度就调 `syncSystemBarIcons(resolved.mode)` |
| API | `src/api.js` · `systemBar(darkIcons)` | 调原生命令 `system_bar`；非 Tauri 环境安全空转 |
| Rust | `src-tauri/src/system_bar.rs` | Android 转发给原生插件；桌面端恒成功返回 `{applied:false}` |
| Kotlin | `android/gradle/.../SystemBarPlugin.kt` | `isAppearanceLightStatusBars` 覆盖系统默认值 |

关键设计点：

- **传 `resolved.mode` 而不是主题 id**：只有解析后的 light/dark 才知道实际背景是深是浅
  （主题 id 在浅色/深色两种模式下都可能是同一个）。
- **状态栏与导航栏一起设**：底部导航栏同样是透明浮层盖在网页上，只修上面会让下面看不见。
- **走 `WindowCompat.getInsetsController`**：API 26–29 降级到
  `SYSTEM_UI_FLAG_LIGHT_STATUS_BAR`，API 30+ 用 `WindowInsetsController`。直接写
  `window.insetsController` 在 API 30 以下会崩。
- **必须 `runOnUiThread`**：InsetsController 只能在主线程访问。
- **桌面端不报错**：桌面窗口不铺满整屏（有原生标题栏），不存在这个问题，
  所以 Rust 侧对非 Android 返回 `Ok({applied:false})` 而不是 `Err` —— 前端可以在所有
  平台无脑调用，不必到处写平台判断。
- **纯装饰性、不 await**：同步失败绝不能阻断换主题。

副作用（正向）：系统深色+网页深色、系统浅色+网页浅色这两档本来图标就是对的，
现在改成跟着**网页**走，图标与实际背景始终反相 —— 比原来更稳。

### 影响端

- Android：✅ 修复（需重出 APK 才生效 —— 改了 Kotlin + Rust）
- Windows：改动无行为影响（`system_bar` 命令在桌面端是空转），但**代码进了二进制**，
  按铁律一必须重出 exe
- 小程序：不受影响（无系统栏浮层概念）

### 验证

- **真浏览器探针** `.workbuddy-ai/tmp/probe-statusbar-contrast.cjs`：291×633 @ dsf 3.76
  （用户机尺寸）、`--sat: 40.3px`，用 `Emulation.setEmulatedMedia` 固定
  `prefers-color-scheme` 代表系统深色模式，四种组合各采 9 个点量实际底色 + 算对比度。
  修复前后两档 1.02 / 1.16，修复后四档全部 >= 3.0。
- **回归断言** `scripts/test-android-system-bar.mjs`：钉住上面四段链路，
  以及「非 Android 分支不得有任何错误 / panic 出口」。
- **变异测试**：19 条变异（去掉同步调用、传反参数、命令名拼错、少设导航栏、
  漏收同步工具……）**全部被抓住**，无漏过。
  ⚠️ 过程中发现两条断言是**假的**（`/Err\(/` 匹配不到 `Err::<(), String>(` 的 turbofish 写法，
  以及只查 `Ok(` 存在不查错误出口）—— 已修正，这正是变异测试的价值。
- `cargo check`：编译通过，无新增警告。
- `npm test` + 四道 `--check`：全部通过。

### 维护须知

`SystemBarPlugin.kt` 已登记进 `tools/sync-android-native.js` 的 `SOURCES`。
⚠️ **`src-tauri/gen/android/` 是 gitignored 生成目录**，`tauri android init` 会整个重建 ——
若没登记进 `SOURCES`，本插件会在下次 init 后**静默消失**，症状与修复前一模一样。
回归测试里有专门一条断言守着这件事。

---

## 修：学校通知「展开正文」把整页菜单页脚都当成正文（北大招生网实测）

### 现象

学校通知插件里展开 `bkzs.pku.edu.cn`（北京大学本科招生网）的详情页，正文里混着
「常见问题 / 我要报名 / 首页 / 招生类别…」整个导航菜单和「友情链接 / 电话 / 京ICP备…」页脚，
真通知的一句话反而被淹没。

### 根因（真实抓取取证，2026-09-17）

`src/webContent.js` 的 `extractArticleText()` 有两处罩不住这个站：

1. **选择器落空**：gpower CMS 的正文在 `.article-cont > #articleDiv.gpCmsArticle00` 里，
   `ARTICLE_SELECTORS` 里没有这几个名字 → 全部落空，退到整页兜底 `blockText(doc.body)`。
2. **兜底删不干净**：该站的侧栏（`.sidebar-mod`）、导航（`.x-header > .nav-mod`）、
   页脚（`.x-footer`）**全是 div 带 class，整页一个 `<nav>/<footer>` 标签都没有** ——
   兜底只按标签删，于是两翼噪声全被吞进「正文」。

正文本身只有一句话（约 110 字），这也是「选不到正文块」的诱因：块太小，不可见度低。

### 改法（`src/webContent.js`，只动 JS 端；`tide.util.web` 小程序不注入，无跨端影响）

| 改动 | 说明 |
|---|---|
| `ARTICLE_SELECTORS` 补 `#articleDiv` / `.article-cont` / `.gpCmsArticle00` | gpower CMS（`gpowersoft.com` 建站的一批高校）直接命中 |
| 清理阶段按 **id/class 特征**多删一轮容器 | 判据复用公告链接筛选的 `NAV_SIGNATURE_RE`（nav/menu/footer/header/sidebar/breadcrumb/copyright…），div 型导航页脚从此进不了正文 |

### 影响端

- Windows / Android：✅ 修复（WebView 宿主注入 `tide.util.web`；随下次构建进 dist）
- 小程序：不受影响（插件运行时不注入 `webContent`）

### 验证

- **真浏览器探针**（`output/notice-probe.cjs` + 无头 Chrome，喂真实抓取的详情页 HTML）：
  修复后 `textLen=96`，正文恰为通知本体四段（各位考生…北京大学招生办公室 2026年6月27日），
  无任何导航/页脚字样；`artDate=2026-06-27` 正确。
- **回归断言** `scripts/test-web-content.mjs`：按真实 DOM 结构压了两条 ——
  ① gpower CMS 选择器命中且两翼导航（常见问题/学科专业/返回列表）与页脚不混入；
  ② 无 CMS 特征的站点走整页兜底时，`div.nav-mod` / `div.x-footer` 同样被摘掉。
- `npm test` 全量通过。

---

## 学习通插件 2.12.0：「通知分类」带计数 + 搜索支持拼音首字母缩写

### 需求

1. 顶部「通知分类」标签页也要像收件箱 / 待办作业 / 课程一样显示数字（截图里唯独它是光杆）。
2. 搜索支持拼音缩写：输入 `bj` 能搜出「北京」，`dx` 能搜出「大学英语」，收件箱与课程两处搜索都生效。

### 改法

| 改动 | 说明 |
|---|---|
| `navHtml()` 的 cats 项加 `cx2-pill` 计数 | 显示 `visibleInbox().length`（与分类页顶部「共 N 条」同源，移除/学年筛选后联动） |
| 新增 `cxKwHit()` / `cxInitials()` | 纯字母数字关键词走「拼音首字母流」的**连续子串**匹配；含中文/符号的关键词退回原文 `includes`，旧行为不变 |
| 收件箱 `filteredInbox` 与课程页 `coursesHtml` 的过滤改走 `cxKwHit` | 桌面端 `public/plugins/chaoxing-notify/main.js` 与小程序端 `core/chaoxingCore.js` 同一套规则 |
| 新增 `tools/gen-chaoxing-pinyin.js` | 用 pinyin-pro（`multiple:true` 取多音字全部读音）生成 U+4E00–U+9FA5 的「首字母 → 汉字串」压缩表（23 组 / 20,853 字 / 约 69KB），整段注入两端文件的 `CX_PY_DATA` 标记区，重跑即可重生成 |
| 多音字命中用记忆化回溯 | 每个汉字位置任选其一读音（如 重 zhong/chong），任一条路走通即命中，`重庆` 可被 `cq` 搜到；`kw` 不能跨过标点分隔符，与旧版 `includes` 的连续子串语义一致 |
| manifest 2.11.0 → 2.12.0 | 已跑 `tools/sync-plugins.js`，两端 `pluginCatalog.js` 同步到 2.12.0 |

匹配语义细节（都实测钉进测试）：

- `北京理工大学期末通知` ↔ `bj` ✓；`大学英语四级` ↔ `yy` ✓、↔ `英语` ✓（中文退回 includes）、↔ `bj` ✗（不误报）；
- 数字与字母原样保留可混拼：`25防火2队1班` 首字母流 `25fh2d1b`，`25fh` 能搜到班级；
- 零声母字（安/爱/二/欧…）也进首字母流——生成器取**完整音节首字母**而不是 pinyin-pro 的 `pattern:'initial'`（后者对零声母返回空串，会漏掉整批字）；
- 长正文（几千字的通知全文）也在匹配范围里，回溯带 memo 剪枝，不会卡 UI。

### 影响端

- Windows / Android：✅（插件 main.js，随 dist 重新构建生效）
- 小程序：✅（`core/chaoxingCore.js` 的 `filteredInbox` / `courseGroups` 同步生效；小程序端本就没有「通知分类」tab，计数改动不涉及）

### 验证

- `scripts/test-chaoxing.mjs`：新增第 9 节 —— 首字母流断言（北京/大学英语四级/多音字/零声母/数字混拼）、`cxKwHit` 正反例、收件箱与课程两条过滤链的端到端用例（`bj` 只命中北京那条、`dx` 命中大学英语不带出线性代数），以及「通知分类标签必须带 cx2-pill 计数」的源码断言。**PASS**。
- `tools/test-miniprogram-core.js`：`[chaoxing]` 节新增 9 条缩写搜索断言。**260 通过 / 0 失败**。
- 顺手修正两条过期断言：插件计数 13→14、原生适配 9→10（本批次早前新增 inbox-drop 后没跟着改）。


---

## 新：桌面端系统托盘可关闭 + 「点关闭按钮」行为可设（设置 → 界面与交互）

### 背景

桌面端原先**无条件下**创建系统托盘图标，且点关闭按钮**无条件下**隐藏到托盘 ——
用户既关不掉托盘图标，也改不了「关闭 = 隐藏」这个语义。这一批把两件事都交给用户。

### 改法

| 位置 | 改动 |
|---|---|
| `src/views/settings/appearance.js` | 新增「系统托盘」滑块开关（默认**开**），与「点关闭按钮时」下拉（默认**隐藏到系统托盘**）相邻放置，构成「总开关 → 细项」的从属关系；两者都按 `desktopWindow` 门控，非桌面端不出现 |
| `src-tauri/src/lib.rs` | 新增 `tray_enabled()`（读 `settings.trayEnabled`，默认 `true`）；`setup_tray()` 在建图标**之前**先查它，关掉就直接 `return Ok(())` |
| 同上 | `close_to_tray()` 的默认值由 `false` 改为 **`true`**（对应用户原话「叉掉应用是隐藏到托盘」），并抽出 `read_desktop_setting(pointer, default)` 收口两处读盘逻辑 |

### 🔴 一个必须先拆掉的致命组合

「托盘图标关掉」+「关闭行为 = 隐藏到托盘」如果同时成立，窗口一隐藏，
**托盘里没有图标可以把应用叫回来**，用户只能去任务管理器杀进程。

两处各拦一道：

- **前端**：关掉托盘开关时同步把 `closeToTray` 置回 `false`、把下拉控件同步成「直接退出应用」、
  并把「点关闭按钮时」整行隐藏（只改 `settings` 不改控件的话，界面显示的是一个已经失效的假状态）；
- **Rust**：`CloseRequested` 里 `tray_enabled(...) && close_to_tray(...)` 两个条件都成立才
  `prevent_close()` —— 即使 `data.json` 被手工改成这种组合，也不会把窗口藏没。

反向**不成立**（单向约束）：重新打开托盘开关**不会**把「直接退出」扳回「隐藏到托盘」，
不会覆盖用户上次的显式选择。

### 生效时机

- **关闭行为**：改完立即生效（Rust 每次 `CloseRequested` 现读 `data.json`，刻意不缓存）。
- **托盘图标开关**：**重启后**生效 —— 图标一旦建立，运行期增删容易留残留。改完有 toast 提示。

### 影响端

- Windows：✅（设置项、托盘、关闭拦截都是桌面端专属路径）
- Android / 小程序：❌ 不涉及（`desktopWindow` 为假，两个控件都不渲染；Rust 侧全在 `#[cfg(desktop)]` 里）

### 验证

- `scripts/test-desktop-tray.mjs`（新增，进 `npm test` 全量）：钉住设置键名与默认值、
  `setup_tray` 的闸门位置（必须在 `builder.build(app)` 之前）、`CloseRequested` 的双条件、
  前端单向约束与初值归一。**11 条变异逐条改坏实现，全部被拦下。**
- `.workbuddy-ai/tmp/probe-tray-settings.cjs`（真浏览器，1280×900 + 390×844 双档）：12 条判据 ——
  默认值、关掉托盘后 `settings` 真的落盘（`trayEnabled=false` / `closeToTray=false`）、
  下拉控件同步、细项行隐藏、**没有整页重建**（哨兵节点同一性）、重开托盘后细项行回来且
  不改写 `closeToTray`、窄屏 390 无横向溢出。**5 条变异全部被拦下。**
- `cargo check` 通过（仅剩两条与本次无关的既有 warning）。
