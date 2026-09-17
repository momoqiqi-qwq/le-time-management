# v0.49.0 变更说明

> 发布日期：2026-09-17（未提交 / 未打 tag 状态下写入本文件，随本版本一并提交）
> 版本类型：minor（新增功能 + 界面调整）

## Android：修复「键盘弹出整屏只剩背景色」的黑屏（真机必现）

### 现象

真机（Android 15）上，任何输入框聚焦、软键盘弹出后（轮换值日插件输入成员名字必现），
应用内容区整体消失，只剩深色背景和键盘。

### 根因（两个叠加）

1. **`--sab` 掺了键盘高度**：`MainActivity` 把 `--sab` 写成 `max(导航栏, 键盘)`（v0.37.15
   为了「吸底输入框不被键盘压住」）。键盘弹出时 `--sab` 从 ~24px 暴涨到 ~370px，
   `.view` 的 `padding-bottom`（62+370=436px）、toast、抽屉底栏全部跟着暴涨 ——
   页面被凭空撑长一大截；
2. **键盘 inset 无人消费**：`enableEdgeToEdge()`（`decorFitsSystemWindows=false`）下
   系统的 `adjustResize` 不再生效，默认 `adjustPan` 只把窗口整体上移、网页视口不变。
   聚焦输入框时 Chrome 的 `scrollIntoView` 把 WebView 滚进第 1 条撑出来的空白区
   → 整屏只剩背景色。

### 修复（原生侧，`MainActivity.kt`）

| 项 | 内容 |
|---|---|
| `--sab` 回归纯导航栏 | 去掉 `maxOf(bars.bottom, ime.bottom)`；CSS 布局不再被键盘高度影响 |
| WebView 消费 ime inset | 新增 `ViewCompat.setOnApplyWindowInsetsListener(webView)`：`ime.bottom` 写入 WebView 的 `bottomMargin`（**不用 setPadding —— WebView 不尊重 padding**），父容器是 FrameLayout，`MATCH_PARENT` 高度减去 margin = 网页视口压缩 |
| 连锁反应全自动 | 视口变矮 → window resize → `uiScale.js` 重算 `--ui-vh/--ui-vw` → 媒体查询与 fixed 浮层重排；Chrome 把聚焦框 `scrollIntoView` 到键盘上方；键盘收起 margin 归零 |
| 返回 ime 剥离 | 消费后用 `WindowInsetsCompat.Builder` 剥掉 ime 再往下传（防二次消费） |
| 回归守卫 | `test-android-layout.mjs` 新增 4 条断言（判定前剥 Kotlin 注释防自误伤），已变异验证 |

### 验证

- 无头探针（`__dd-keyboard-probe.html`，390×844 Android UA）双场景对照：
  - 修复后路径（视口压到 470 + `--sab`=24px）：聚焦输入框 rect [202,236] **完整落在视口内**，
    `.view` padding 正常 86px，手动派发 resize 后 `--ui-vh` 正确重算 470px；
  - 旧代码路径（视口不变 + `--sab`=374px）：`.view` padding 暴涨 436px、`.plugview`
    可视高度被压到 354px、滚动位置被拉到 404px —— 布局搅乱复现。
- 原生侧真实键盘行为**需真机验证**（无头无法模拟窗口平移/键盘）。

## 课程表（手机端）：沉浸式布局 + 紧凑顶栏 · ⋯ 更多菜单

### 背景

Android / 窄屏下课程表页面同时被两层「栏」挤压：

1. APP 全局底栏（`.rail` 在 ≤900px 时变成 fixed 底栏，约 53px + 底部安全区）；
2. 插件自己的高顶栏（21px 大标题「第 N 周」+ 约 30 字的长副标题 + 42px 触屏按钮）。

390×844 视口下第 9 节就被截断，与常见课表类 App（参考学校课表应用截图）的
「紧凑顶栏 + 全屏课表」形态差距明显。

### 改动

| 端 | 文件 | 内容 |
|---|---|---|
| 插件 | `public/plugins/shiguang-schedule/ui.js` | ① `tide.ui.registerView(...)` 声明 `immersive: true`；② 顶栏紧凑化：标题降到 16px、`‹ ›` 与 `⋯` 按钮缩到 34px、长副标题（表名 · 学期 · 周区间）在窄屏折叠为只剩周区间（`sub-full` / `sub-mini` 双份）；③ 「回到本周」按钮在窄屏从顶栏挪进 `⋯` 菜单（仅在非本周周次出现） |
| 生成物 | `public/plugins/shiguang-schedule/main.js` | 由 `tools/build-schedule-plugin.js` 重生成 |
| 宿主 | `src/pluginHost.js` | `ui.registerView` 透传 `immersive`（规整为布尔，默认 false） |
| 宿主 | `src/shell.js` | `switchTo()` 按当前视图 `def.pluginView?.immersive === true` 给 `.app` 加/摘 `.rail-hidden` |
| 宿主 | `src/styles.css` | ≤900px 媒体块内新增两条成对规则：`.app.rail-hidden .rail { display:none }` + `.view` 的 `padding-bottom` 塌到 `4px + 安全区`（只藏不塌会留一条空白） |
| 桌面 | 同上 | 不受影响：桌面 `.rail` 是左侧竖栏，规则只在 ≤900px 媒体块内生效 |
| 测试 | `scripts/test-immersive-view.mjs`（新增） | 守卫四个接线点：插件声明、宿主透传、shell 切换、成对样式仅在窄屏媒体块内（已变异验证） |
| 三端 | `package.json` 等 | 版本 `0.48.0 → 0.49.0`（`sync-version.js` 同步 + `package-lock.json` 两处手改） |

### 交互效果（390×844 Android UA 无头 Chrome 实测 + 逐张目检）

- 全局底栏消失，课程表直接铺到屏幕底：可见节次从「第 9 节截断」变为「第 10 节可见」；
- 顶栏从 ~78px 压到 ~52.5px，只剩 `‹ 第 N 周 · 周区间 › ⋯` 四件；
- 点 `⋯` 才滑出菜单：视图（今日课表 / 课表 / 我的）+ 操作（添加课程 / 切换课表 / 个性化配置），
  非本周时菜单里多一项「⟲ 回到本周」；菜单 192×323px，完整落在视口内；
- 对照组验证：非沉浸式视图（如四象限）底栏照常显示（`.rail` flex，52.8px），`padding-bottom` 仍是 62px；
- 无横向溢出（docScrollWidth 390 = clientWidth 390）。

### 影响端

- **桌面**：无行为变化（`.rail-hidden` 规则只在 ≤900px 生效；`immersive` 对布局无其他影响）。
- **Android**：课程表页为上述沉浸式形态；其他插件视图不变；任何插件都可按需声明 `immersive: true`。
- **小程序**：无变化（小程序端插件视图不走 pluginHost/shell 这条链路）。

### 数据迁移

无。

---

## 新插件：拖入消息收纳（inbox-drop）+ 任务附件升级

### 改动

| 端 | 文件 | 内容 |
|---|---|---|
| 插件 | `public/plugins/inbox-drop/`（新增） | 拖入 / Ctrl+V 粘贴消息 → 自动识别来源平台、消息类型、日期时刻 → 可修正的确认条 → 收进应用收件箱（`tide.inbox.create`）；一键转任务 / 时间块；截图以附件跟随任务 |
| 插件 | 同上 · 安全 | 可执行文件双保险拒收（扩展名黑名单 + `MZ` 魔数嗅探）；24h 窗口去重；`流程闸门`：拖入与粘贴只 stage 到确认条**不落库**，确认后才入库并递进收件箱 |
| 三端 | `manifest.json` + `tools/sync-plugins.js` 产物 | 三端 catalog 注册（Windows/Android `full`，小程序 `native`）；图标三端同源 |
| 小程序 | `core/pluginRuntime.js` + `pages/plugin/*` | 全套 `id*` 纯函数与桌面同规则（平台 / 类型 / 日期 / 时刻 / 去重 / 载荷映射），页面输入、确认、编辑、转任务、转时间块、置顶、删除 |
| 双端 | `plugin-guide` + 小程序 `GUIDE_DOCS` | 两端插件使用指南各补 inbox-drop 四步说明 |
| 宿主 | `src/views/inbox.js` | 收件箱条目显示来源插件图标与名称；顺修潜在 bug：转任务时 `due` 传的是显示串 → 改为结构化 `date` + `dueTime`；任务携带附件 |
| 宿主 | `src/views/drawer.js` + `src/styles.css` | 任务附件升级：图片压缩直读（≤1280px，<400KB 原样）、最多 6 张、逐张删除、拖放区、capture 粘贴（输入框打字时放行） |
| 测试 | `scripts/test-inbox-drop.mjs`（新增，~470 行） | 源码不变量（无硬编码色 / 时间范围守卫 / 闸门内无 `addDrop(`）+ vm 行为 14 组（识别、闸门、去重、拒收、粘贴接管、渲染冒烟）+ 变异测试（拆掉守卫后 `9时61分` 静默变 `10:01` 必须被抓） |
| 三端 | `package.json` 等 | 版本并入 `0.49.0`（与上节同版本提交） |

### 识别规则（两端同规则）

- 时刻三支：`HH:MM` / `X点(半|Y分)` / 中文数字（`下午三点`、`晚上十点半`、`中午十二点`）；`X时` 与 `X点` 同权；`半` 正确落分位（`下午3点半` → 15:30）；
- 日期：相对词（今天/明天/后天/下周X）按就近未来解析；
- 去重：同标题 + 同时段（含识别出的日期）在 24h 窗口内判重；
- 来源：优先消息来源参数 → `【】` 括注 → 域名。

### 过程中抓到的问题（都已修复）

| 问题 | 后果 | 修法 |
|---|---|---|
| manifest 缺 `blocks` 权限 | 转时间块运行时静默抛错被吞 | 补权限，插件版本 1.0.0 → 1.0.1（权限测试抓到） |
| `半` 在正则非捕获组 | `下午3点半` 识别成 15:00 | `(半|(\d{1,2})\s*分?)?` 改捕获组 |
| 小程序 `pad2(m[2])` 双重补零 | `2026-01-12` 变 `2026-001-12` | `pad2(Number(m[2]))` |
| 小程序从不读 `seq` 存储键 | KEEP 裁剪后序号回卷重复 | `idLoadAll()` 取 `max(存储seq, 列表max)` |
| 桌面 `source` 不认 `【学习通】` | 与小程序识别结果不一致 | analyze 链加 `bracketSource` |
| 去重不比识别出的日期 | 不同场次的同名消息被误杀 | `sameMessage` 加日期比对 |
| 确认入库后没摘 pending | 确认条拿新行跟自己比 → 又标「疑似重复」 | confirm 前先 `state.pending = null` |

### 影响端

- **桌面 / Android**：新插件 full；收件箱来源列、任务附件升级、 drawer 附件拖放 / 粘贴。
- **小程序**：新插件 native（原生页面实现）；其余无变化。
- **存量用户**：无破坏性变化，插件默认新增启用。

### 数据迁移

无（新插件使用全新存储键 `drops` / `seq` / `stats`；收件箱与任务字段向后兼容，附件字段新增）。

---

## 窄屏自适应：高密度屏手机上「上下栏过宽、字号偏大」

### 背景

2026-09-17 用户提供 Android 截图：上下栏合计占掉屏高 **26%**（常规机 18.4%），字号整体显大，
课程表周视图「‹」被切、教务导入页「选择学校」被压成竖排四字。

### 根因（已实测确认，不是猜的）

- 手机的 **CSS 布局宽度 = 物理宽 ÷ 设备像素比，与屏幕物理大小无关**。
  该机 1080×2376 @ 600dpi ⇒ 只有 **288×633 CSS px**（标准 360×792 的 80%）。
- 顶栏 54px / 底栏 46px 是写死的 CSS px，占屏比例因此被等比放大到 26%；字号同理。
- 用无头 Chrome 复现该机几何（291×633 + `--sat:40.3px` / `--sab:17.5px`）后与截图逐项对照：
  顶栏底边 354.6 vs 350、标题卡 y 157.2 vs 157、底栏顶边 2115 vs 2118 —— 吻合，根因确认。
- 用户「界面缩放」实为 **100%（标准）**，所以不是设置问题，是显示密度问题。

### 改动

| 端 | 文件 | 内容 |
|---|---|---|
| 三端 | `src/uiScale.js` | 新增 `narrowAutoFactor(innerWidth)`：布局宽度不足 360px 时把缩放系数再乘 `宽/360`（下限 0.7），使**内容布局宽度回到 360**；`applyUiScale` 的 `zoom` 与 `--ui-vw/--ui-vh` 一并改用生效系数，另发 `--ui-auto-scale` 供诊断 |
| 桌面 / Android | `src/views/settings/appearance.js` | 「界面缩放」提示语在自适应触发时补出「本机布局宽度 / 已自动缩至 N% / 实际生效 N%」，免得用户看见 100% 却觉得界面变小 |
| 测试 | `scripts/test-ui-scale.mjs` | 新增 `narrowAutoFactor` 契约（360/390/412 恰为 1、288→0.8、下限 0.7、脏输入→1）+ `--ui-auto-scale` 发射 + 设置页提示守卫（**已变异验证**：9 种改坏法全部被抓） |
| 插件 | `public/plugins/shiguang-schedule/ui.js` | `.school-hero > button { flex: none }` + 文字列 `min-width: 0`。修「选择学校」折成竖排 —— 那是 flex 按「基础宽度」比例分摊收缩量所致，**288~412 全档位都复现，与窄屏无关的既有 bug** |
| 生成物 | `public/plugins/shiguang-schedule/main.js` | 由 `tools/build-schedule-plugin.js` 重生成（`--check` 通过） |

### 实测（无头 Chrome，真实浏览器几何；设备像素口径）

| 项 | 修复前 | 修复后 | 常规 390×844 |
|---|---|---|---|
| 上下栏合计占屏高 | **26.0%** | **21.1%** | 18.4%（零变化） |
| 顶栏高度 | 94.3 CSS px | 76.2 | 78 |
| 底栏高度 | 70.5 CSS px | 57.2 | 77 |
| 课程表帧高 | 2779 设备px（超屏 2380，必须滚动） | 2218（**一屏放下**） | — |
| 横向 / 纵向溢出 | 0 | 0 | 0 |
| 「选择学校」按钮 | 高 77.2（4.6 行，竖排） | 高 30.4（**单行胶囊**） | 单行 |

另在 288 / 320 / 360 / 390 四档宽复测：修复后 288 与 320 的**布局结果与 360 完全一致**
（有效布局宽度被拉回 360），溢出数恒为 0。

### 已知取舍（量过之后的有意选择，不是漏算）

安全区 `--sat/--sab` 会跟着 `zoom` 一起缩小（40.3 → 32.6 CSS px）。**不补偿**：
Android 状态栏图标在栏内垂直居中，最坏情况（系数压到下限 0.7）也只侵入栏体下缘 30%，
够不到图标；288×633 实机复现确认无重叠（顶栏内容起点 123 设备px > 图标底 82）。
补偿需要让 20 多处 `var(--sat, env(...))` 全部除以 `--ui-scale`，或改动被回归测试守着的
「`:root` 不许定义 `--sat`」铁律（AGENTS.md 铁律四），收益与风险不成比例。
**若将来把下限降到 0.7 以下，或顶栏改成贴图标布局，必须重算。** 详见 `uiScale.js` 模块注释。

### 影响端

- **Android**：布局宽度 < 360px 的设备（高密度屏 / 系统「显示大小」调大）整体等比缩小，回到标准 360 观感；
  ≥ 360px 的设备（含 360/390/412）**零变化**。
- **桌面**：窗口最小宽度 900px > 360 ⇒ 永不触发，行为与 v0.48.0 完全一致。
- **小程序**：不走 `uiScale.js` 这条链路，无变化。

### 数据迁移

无（不新增存储键，仍沿用 `settings.ui.uiScale`；自适应系数由视口宽度实时算出，不落库）。
