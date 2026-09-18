# v0.54.0 版本说明

> 界面缩放切换动画 + 自定义缩放数字输入（设置 → 界面与交互 → 界面缩放）+ 顶栏快捷入口触发钮改圆方形图标瓷砖。
> 解决用户反馈：「修改界面缩放时动画做好，不要一闪一闪」「快捷入口按钮弄成圆方形，不需要文字」
> 「那 4 个固定参数放在滑块下面，添加一个直接输入数字的自定义」。

## 改动一览

| 文件 | 改动 |
|---|---|
| `src/shell.js` | **快捷入口触发钮**：去掉「YL」圆形头像与「快捷入口」文字标签，改为单个 `bolt` 闪电图标（`faIcon("bolt")`，走打包内 Font Awesome 精灵图）；弹出面板（quick-dock-head）里的账号头像不受影响 |
| `src/styles.css` | `.quick-menu-trigger` 改为 34×34 圆方形瓷砖：`border-radius: 11px`、`padding: 0`、`flex: none`，内容居中；新增 `.quick-menu-trigger-glyph`（图标 15×15，`fill: currentColor`，跟随 hover/`.on` 高亮）；移除移动端 `.quick-menu-trigger-label` 隐藏死规则 |
| `src/uiScale.js` | `applyUiScale(scale, { animate })` 支持 rAF 插值动画：从当前生效系数逐帧推进到目标系数（easeOutCubic，260ms）；拆出单一 DOM 出口 `paintFactor()`（zoom / `--ui-scale` / `--ui-auto-scale` / `--ui-vw` / `--ui-vh` 五个值同帧写入）；令牌 `animId` 支持中途重触发（从当前插值位置续走，不回跳）；reduced 动效偏好（`data-ui-motion` / 系统 `prefers-reduced-motion`）与无 rAF 环境直设；新增导出 `UI_SCALE_ANIM_MS` |
| `src/uiPreferences.js` | `applyUiPreferences` / `setUiPreferences` 透传 `{ animate }`（默认 false）；`resetUiPreferences`（恢复界面默认）走动画；启动 / 初始化路径保持直设 |
| `src/views/settings/appearance.js` | 三处离散入口接动画：缩放滑杆松手 `change`、缩放档位按钮、三个界面预设（含「舒适预设」的 uiScale 归位）；滑杆 `input` 拖动保持直设（连续输入本身平滑，「跟手」优先）；新增「自定义缩放值」数字输入框（与 4 个固定档位同排：输入途中只在合法区间内预览、落定才夹取落盘、命中档位留空、非档位值高亮），自定义输入落定同样走动画（与点档位同为离散跳变） |
| `scripts/test-ui-scale.mjs` | 新增 2b 动画行为块：插值中段连续性、终帧精确落点、`--ui-vw` 与 zoom 同帧、中途重触发、reduced 短路、值没变短路、resize 取消在飞动画；新增 3f-2 接线守卫；`makeEnv` 支持 dataset 与手动 rAF |
| `src/uiScale.js`（追加） | 新增导出 `parseCustomScaleInput()`：把「自定义输入框这一串文本现在该不该应用」做成**纯函数三态**（`skip` / `preview` / `clamp`），input 与 change 两个入口共用同一处判据 |
| `src/views/settings/appearance.js`（追加） | 缩放档位组末尾新增「自定义」数字输入框：`type="number"`、范围与步进读 `UI_SCALE_LIMITS`、命中档位时留空并让档位按钮接管高亮；滑杆与档位两个入口都会同步它 |
| `src/styles.css`（追加） | `.scale-presets`（允许换行，极窄屏 5 项不横向溢出）、`.pref-choice-input`（宽度 58px 写死，输入时不抽动）、`.pref-choice-unit`（`%` 单位） |

## 设计要点（为什么这么做）

- **不用 CSS transition**：`zoom` 是布局级属性，浏览器不对它补间 —— zoom 突变等价于整棵
  布局树一次重排，这就是「一闪一闪」的来源。
- **不用 transform 补间**：transform 只改绘制不改布局，动画结束那一刻仍要发生一次真实
  重排 —— 跳变只是被推迟，没有消除。所以由 JS 逐帧写中间系数，把「一步重排」拆成
  N 次小重排，视觉上就是连续的等比缩放。
- **动画分工**：动画只留给离散跳变入口（点档位一步跨 20%~70%、恢复默认、界面预设）；
  滑杆拖动是连续输入，每档立即生效才是「跟手」，不动画。
- **终帧精确落点**：`from + (factor - from) * 1` 在浮点上不保证精确回到目标值，最后一帧
  显式取目标系数 —— 动画结束后的 DOM 状态与直设逐位一致（含 `--ui-vw/--ui-vh`）。
- **resize / 旋屏取消动画**：视口尺寸变化时插值前提失效（窄屏自适应系数会变），立即
  直设并令旧循环失效，不允许它再写 DOM。
- 动效门槛与 `theme.js` 的 `themeMotionAllowed()` 同一规则、读同一偏好；在 `uiScale.js`
  就地实现而不是 import `uiPreferences.js`（后者 import 前者，反向引用会成环）。

## 自定义缩放输入（三态判据）

4 个固定档位只覆盖 80 / 100 / 125 / 150，中间值此前只能靠滑杆一点点拖。
新增的数字输入框就在档位组末尾 —— 与 4 个档位同排、整体位于滑块**下方**（用户指定的位置），
可直接敲 `110`、`135`。

它与滑杆的关键差别是**逐字符变化**，所以判据是**三态**而不是一个布尔
（`src/uiScale.js` 的 `parseCustomScaleInput()`，input 与 change 共用同一处）：

| 态 | 触发 | 行为 |
|---|---|---|
| `skip` | 空串 / 半截（`-`、`.`）/ 非法类型 | 预览与落定都不动界面（不是「要设成 0」，是还没输完） |
| `preview` | 落在 80~150 内 | 输入途中即时预览（拖动般的连续感） |
| `clamp` | 有数字但越界 | **输入途中不应用**，**落定照常夹到边界** |

三条取舍值得记下来：

- **越界为什么不在输入途中应用**：`normalizeUiScale(9)` 会被夹成 80% ——
  用户敲「999」的过程中界面先跳到 80%、再跳到 150%，看着像控件坏了。
- **越界为什么落定必须接住**：与滑杆松手同一语义。把用户的输入丢掉、把输入框悄悄还原，
  比夹到边界更糟。（夹到的 80 / 150 本身就是档位，于是表现为「输入框留空 + 档位接管高亮」。）
- **命中档位时输入框留空**：否则「标准」高亮着、输入框里又写着 100，同一个状态显示两遍。
  非档位值（110、115）才填数字并高亮输入框自身。

预览值与落定值都走同一个 `normalizeUiScale`，不会出现「预览 110、落定 115」这种口径分裂。

## 影响端

- 桌面（Windows Tauri）、Android（共用 WebView 前端）：行为一致。
- 小程序端：无此功能（界面缩放为双端设置项），不受影响。

## 数据迁移

无。`settings.ui.uiScale` 的取值与存储格式不变，仅切换时的呈现方式变化。

## 验证

- `scripts/test-ui-scale.mjs`：新增 12 项动画断言全过（中段连续性 / 同帧同步 / 精确落点 /
  重触发续走 / reduced 短路 / resize 取消）。
- **触发钮瓷砖**（无头 Chrome 真渲染探针，1280×760 浅色）：按钮 34×34、圆角 11px、
  `.quick-menu-avatar` 与 `.quick-menu-trigger-label` 均已不在按钮内；`<use>` 字形盒 11.25×15
  非零（bolt 真画出来了，非静默空白）；点击后面板正常锚定展开（dock 紧贴按钮下方，右缘不出屏），
  触发钮呈 `.on` 高亮；横向溢出 0。截图见 `output/preview/quick-trigger-tile-*.png`。
- 全量测试 + 四项 `--check`（sync-version / gen-theme-dark / build-schedule-plugin /
  sync-android-native）通过。
- 无头 Chrome CDP 探针实测：抓取 100% → 150% 动画中间帧，zoom 连续递进无跳变（见会话记录）。
- 自定义缩放输入：`scripts/test-ui-scale.mjs` 新增 1c 三态判据块（preview / clamp / skip
  三面 + 与 `normalizeUiScale` 的口径一致性）与 3f-3 设置页接线守卫。
- 变异验证 11 条全部被断言捕获（越界归成 skip、preview 不走 normalize、落定把 clamp 也跳过、
  输入途中对 clamp 也预览、档位判断改成手写数字、档位组不许换行……）。
  ⚠️ 首轮曾漏过一条（「input 里改成就地判据、change 里保留调用」）⇒ 断言从「出现过」改为
  「两个入口各调用一次」，改完才捕获。
- 无头 Chrome CDP 探针 26 条判据全过（`.workbuddy-ai/tmp/probe-custom-scale.cjs`）：
  几何（在滑块下方、与档位同排、宽度固定 58px）、逐字符输入（1 → 12 → 120）、
  越界夹取、空输入还原、与档位的互斥显示、滑杆同步、窄屏 390×844 不横向溢出。
  截图 `output/preview/ui-scale-custom-1280.png` / `-390.png`。

---

## 同版并入：RSS 信息流插件（内置，`rss-reader`）

> 在途未单独发版，按仓库约定并入本版（不另起版本号）。

新增内置插件 `rss-reader`，把若干 RSS / Atom 源聚合成一条时间倒序的信息流。

- **订阅**：粘贴 RSS / Atom 地址即可；**粘贴网站首页也行** —— 会读页面里 `rel="alternate"`
  声明的订阅地址，找不到再按 `/feed`、`/rss`、`/atom.xml` 等常见路径试一遍。
- **三种方言**：RSS 2.0 / Atom / RDF(RSS 1.0) 都能解析，命名空间前缀（`dc:creator`、
  `content:encoded`、`media:*`）一并处理。解析器是自写的字符串实现（不依赖 DOMParser），
  遇到裸 `&`、缺闭合标签这类畸形源不会整份报废。
- **筛选与标记**：按源、关键词筛选，只看未读 / 只看收藏，未读计数，条目收藏。
- **一键转提醒**：条目里带时间（「9 月 20 日截止」）时交给宿主的语义解析 ——
  能排进时间块就排，只认出日期放 09:00，都没有就进象限池。
- **自动刷新**：可设 15 / 30 / 60 分钟；页面切到后台时不抓。
- **裁剪**：每源保留最近 60 条，但**未读与收藏不受条数限制** —— 否则会出现「还没看就被裁掉」，
  未读数自己往下掉。

平台：Windows / Android 完整实现；微信小程序端未适配（清单标 `unavailable`），
插件中心不会出现点不开的入口。

## 新：条目显示样式三档（卡片 / 紧凑 / 标题）

信息流工具栏新增分段控件，三档切换条目密度：

| 档 | 一行里有什么 | 适合 |
|---|---|---|
| 卡片 | 封面 + 来源 + 时间 + 标题 + 摘要 + 打开 / 收藏 / 提醒 | 逐条细读 |
| 紧凑 | 来源 + 时间 + 标题（单行截断）+ 打开 / 收藏 / 提醒 | 快速扫标题 |
| 标题 | 色点 + 时间 + 标题 + ★ / 提醒 | 一屏看最多 |

同时把 `prefs.showCover`（此前是个有默认值、有归一化、却**没有任何控件**能改的死配置，
等于恒为 true）接成工具栏上的「封面图」开关，只对卡片档显示。

三条实现取舍值得记下来：

- **三档共用同一个 `.rss-card` 容器，只改密度**。`ui.list` 的点击委托是
  `closest(".rss-card")` + `dataset.id` 回查条目 —— 换容器类名会把「打开 / 收藏 / 提醒」
  全弄哑，而且哑得没有任何报错。样式差异全部走 `.rss-wrap[data-style=…]` 下的 CSS。
- **紧凑 / 标题档的封面与摘要是 JS 侧就不拼进 HTML**，不是「先渲染再 CSS 藏」。
  后者 `<img src>` 照样发请求 —— 33 条就是 33 张白拉的图。
- **标题档的动作按钮不做「hover 才出现」**：触屏没有 hover，那样手机上根本点不到收藏 / 提醒。
  判据是「可见且够大」（`opacity ≥ .5` 且按钮高 ≥ 14px），不是「有 opacity 属性」。

窄屏（≤520px）紧凑档一行塞不下「来源 + 时间 + 标题 + 按钮」，标题换行独占一行并限 2 行
（`flex-wrap` 后 `align-items` 从 `center` 改 `baseline`，否则首行文字对不齐）。

### 验证

- `scripts/test-rss-reader.mjs`：新增「显示样式三档」一节 —— 三档共有不变量（容器类名 /
  `data-id` / 三个动作）、各档渲染差异、`applyStyle()` 三处同步（`data-style` /
  `aria-pressed` / 封面开关）、未知样式回落、`setStyle()` 非法值拒绝且**不重置分块进度**、
  以及 `loadPrefs()` 对 `style` 的三向兜底（未知值回落 / 缺字段回落 / 合法值不许被冲掉）。
- 变异验证：**node 侧 18 条 + 浏览器侧 9 条全部被抓住**。首轮有 3 条漏过，全是真缺口：
  - `data-seg` / `data-cover-toggle` 的源码契约只查「字符串在文件里出现过」，而
    `wrap.querySelector("[data-seg]")` 与 CSS 里也有这名字 —— 把模板节点整个删掉照样绿。
    改成钉住模板标记本身。
  - `setStyle` 不落库（样式变「本次会话有效、重启回卡片」）在 node 侧无人守。
  - 窄屏紧凑档标题的换行与限行没有任何断言。
- 真浏览器探针（mock 宿主镜像 `requirePermission` + 三份真实抓取的 feed）：
  桌面 764×485 与窄屏 390×844 各浅色 / 深色两档，**101 / 104 条断言 × 4 档全部通过**
  （含 WCAG 对比度、横向溢出、分块渲染、委托点击、每档真点一次收藏确认委托没被样式改坏）。
  截图 `output/rss-style-{card,compact,title}.png` 与 `output/rss-style-phone-*.png`。
- 探针期间诊断并修掉三处**测量陷阱**（都不是产品 bug，是量法错了）：
  - 宿主的全局 `button { transition: … color .14s, background-color .14s }` 让
    `getComputedStyle` 读到**过渡中间值**（实测 `rgb(131,140,147)` 正是 `#fff → #626E76` 的 79%），
    对比度因此虚报 3.85 / 1.10 / 1.17 / 1.08。改用 `document.getAnimations()` 等它结束是
    **等不到**的（`--virtual-time-budget` 下动画永远停在「运行中」），最终在探针里注入
    `transition:none !important; animation:none !important`。
  - `content-visibility:auto` 让离屏行返回 `contain-intrinsic-size` 的**估值**，实测行高比内容
    高 44%（同一份代码两次跑出 56.0 / 57.8），已一并置为 `visible`。
  - 只测选中态那一颗按钮会让「未选中档文字太淡」整片漏过，改成逐档各测一次。
