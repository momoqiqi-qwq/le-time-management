# v0.55.0 版本说明

> 本文件由各批次会话追加自己的条目。以下先记录「四象限底色加深」批次。

## 轮换值日：多人值日（本批次）

### 改了什么

用户截图（公区值日页）要求「可以设置多人值日」。此前每轮只排一个人，现在一套轮换
可以设「每轮人数」，一轮由 N 人一起当班：

- **数据模型**：每组新增 `perRound`（每轮人数，默认 1 = 单人，上限 16）。排班计算从
  「成员环上取 1 人」改为「取 perRound 人的**滑动窗口**」—— 3 人每轮 2 人时轮次为
  A、B → C、A → B、C（窗口公平轮转，不是硬切块）。`perRound` 不 clamp 到当前成员数
  （成员会动态增删），计算时模运算兜底；perRound > 成员数时去重保序，不崩。
- **临时换人升级为可多选**：override 值改**双格式** —— 单人 = 字符串 id（历史格式，
  旧版本客户端与小程序仍能直接读，**旧数据零迁移**），多人 = id 数组。读取端
  `overrideHits()` 统一兼容两种格式；指向已移除成员的 id 过滤掉，全部失效退回正常排班。
- **界面**（桌面 / Android）：
  - 「轮换规则」新增「每轮人数」快捷档（单人 / 2 人 / 3 人 / 4 人 + 自定义 N）；
  - 主卡片当班人显示完整名单（多人时字号自动降一档 `dd-multi`），kicker 标「每轮 N 人」；
  - 轮次表每行、下次换人卡、顶部轮换标签条全部显示完整名单；
  - 「本轮换人」从下拉单选改为**勾选式多选**（初始勾选 = 本轮现在当班的名单；
    单人写入仍存字符串，兼容旧客户端）；多人换人时「已换人 · 原 X」显示原排班整批人。
- **提醒与任务**：提醒文案「今天轮到 A、B」；加入今日任务的标题为
  `轮换名 · 全部当班人`（「、」连接）。
- **小程序端同步**（`pluginRuntime.js` + 页面）：`ddAssigneesFor` / `ddNormalAssignees` /
  `ddOverrideHits` 与桌面同规则；视图模型输出 `currentNames` / `currentIds` /
  `perRounds`；设置页新增「每轮人数」chips（与桌面同档位）；成员「当班」标记按
  id 集合判断（多人当班时整批都标）。小程序换人面板保持 ActionSheet 单选
  （写入字符串格式，与旧客户端互通）；桌面端写的多人数组，小程序读取已兼容。
- **使用说明与清单**：plugin-guide 的 dorm-duty 步骤补「多人值日」；manifest 升
  1.2.0 并更新描述（`sync-plugins.js` 已重跑，三端 catalog 同步）。

### 影响端

- 桌面（Windows / macOS / Linux）
- Android（与桌面共源 WebView）
- 微信小程序（原生适配同步）

### 数据迁移

无。`perRound` 缺省归一化为 1；override 旧字符串格式原样保留可读，不做改写。

### 校验

- `scripts/test-dorm-duty.mjs` ✓ 全量通过 —— 新增第七节「多人值日」：
  perRound 归一化、滑动窗口轮转（含 perRound 与成员数不互质时起点恒定的数学事实）、
  override 双格式 / 部分失效 / 全失效 / 去重、多人提醒与任务标题、多人渲染
  （`dd-multi`、每轮人数 chips、勾选式换人、「原 X」整批显示）
- `scripts/test-miniprogram-core.js` ✓ 260 通过 0 失败
  （顺手修复了 v0.54.0 批次遗留：插件数断言 14 → 15，rss-reader 入列时漏改）
- `sync-version.js --check` ✓ 三端一致 v0.55.0（含 package-lock 两处）
- 无头 Chrome 实景截图目检 ✓（单人回归 + 每轮 2 人 + 勾选式换人，见会话交付）

## 四象限底色加深（本批次）

### 改了什么

用户反馈四象限视图的四块底色太淡、彼此分不开。把全部 **14 套浅色主题**的
`--q1-bg ~ --q4-bg` 统一按「向同主题强调色 `--q1 ~ --q4` mix 16%」的规则加深
（保持色相、加深加饱和，不是拍脑袋挑色）：

| 主题 | q1（紧急重要） | q2（重要不紧急） | q3（紧急不重要） | q4（不紧急不重要） |
|---|---|---|---|---|
| classic（默认） | `#F9E4E1 → #F3CBC8` | `#F7ECD4 → #F2E0BC` | `#E2E7FA → #CCD3F7` | `#E2EDE7 → #CCDED6` |
| ocean | `#F8E4E4 → #F2CCCC` | `#F5EBD8 → #EDDBBD` | `#E4E9F9 → #CDD4F2` | `#E2EFEA → #C8DDD6` |
| sakura | `#F8DFE6 → #F1C8D2` | `#F6EBD9 → #EDDCBF` | `#EAE5F7 → #D7D1EF` | `#E4EFEA → #CDDFD8` |
| forest | `#F4E2DF → #EDCCC9` | `#F3E9D5 → #E9D9BC` | `#E4E7F4 → #D0D4EA` | `#DFECE4 → #C8DBD0` |
| lavender | `#F5E1E7 → #EECCD4` | `#F5EAD7 → #EBDBBD` | `#E6E7F6 → #D2D4EE` | `#E3EFEC → #CCDEDA` |
| mono | `#F0E1E1 → #E4C9C9` | `#EFE8D9 → #E1D6BF` | `#E4E6EE → #CFD2E1` | `#E2E9E6 → #CDD7D3` |
| chatgpt | `#F7E7E5 → #F0CFCD` | `#F7EDD9 → #EDDCBC` | `#E8EAF8 → #D1D5F0` | `#E3F0EB → #C8DDD6` |
| claude | `#F3E2DC → #EACBC4` | `#F2E8D3 → #E6D6B8` | `#E7E7F0 → #D3D4E2` | `#E2EBE4 → #CCD8D0` |
| shadcn | `#FEF2F2 → #F9D1D1` | `#FFFBEB → #F9E6C6` | `#EEF2FF → #D5D6FB` | `#ECFDF5 → #C7EDDF` |
| celadon | `#F7E4E1 → #EECECA` | `#F5EDD8 → #EBDEBE` | `#E6E9F6 → #D0D5EC` | `#E1EEE5 → #C9DED2` |
| dunhuang | `#F6E2DC → #ECC9C1` | `#F4EBD3 → #EBDCB8` | `#E3E9F4 → #CBD5E8` | `#E2EEE3 → #CCDECF` |
| blueprint | `#FAE3DC → #F3CBC0` | `#F6EDD6 → #EDDDBA` | `#E4E9F8 → #C9D4EF` | `#DFEFEC → #C3DED9` |
| citrus | `#FBE5E0 → #F6CEC7` | `#FCF0D8 → #F6E1BC` | `#EDE8FA → #DBD1F3` | `#DFF4E9 → #C3E7D7` |
| frost | `#F1E3E3 → #EAD1D0` | `#F2ECDE → #EADDC9` | `#E6E9F2 → #D2D7E8` | `#E3EFE5 → #D0E2D3` |

同步改动：

- **小程序 `miniprogram/app.wxss`**：浅色 `page` 块的四象限底色与桌面默认主题同步为同一组值
  （三端一致性）。
- **`.q .tip` 对比度补偿**：底色加深后象限里 11px 提示小字（`--ink-2` 直压）只有 ~2.4:1，
  改为 `color-mix(in srgb, var(--ink-2) 62%, var(--ink))` 向正文色拉一档
  （深色模式下两个变量都是亮色，同样受益）。

### 没改什么（刻意不动）

- **`night` 主题**与**全部主题的深色模式变体**：深色派生（`tools/gen-theme-dark.js`）的
  `--q*-bg` 只从强调色 `--q1~q4` 的色相/饱和度反解，不读浅色 `-bg` 值，因此深色模式
  完全不受本次影响（`gen-theme-dark.js --check` 字节级一致已证实）。
- 象限内的白色任务卡、计数药丸（半透白底）在更深的底色上对比反而更好，无需调整。

### 影响端

- 桌面（Windows / macOS / Linux）
- Android（与桌面共源 WebView）
- 微信小程序（仅默认主题浅色值）

### 数据迁移

无。纯样式令牌改动。

### 校验

- `sync-version.js --check` ✓ 三端一致 v0.55.0
- `gen-theme-dark.js --check` ✓ 派生调色板字节级一致
- `build-schedule-plugin.js --check` ✓（重跑了生成器修复工作区里 main.js 与源漂移）
- `sync-android-native.js --check` ✓
- 全量测试 48 个：47 个通过；`test-dorm-duty.mjs`、`test-time-views.mjs` 两个失败
  属于**另一并行批次的在途半成品**（换人显示、`.wakeup-grid` 的 `font-size:` 属性名
  在未提交编辑中丢失），与本批次无关，由对应批次收尾。

## 网页收集：删除顶栏帮助文字（本批次）

### 改了什么

用户截图圈选了 web-collector 顶栏输入框下方的两行帮助说明，要求删除：

> 自动读取网页标题、站点 favicon，并根据网站类型匹配 Font Awesome 图标名称。
> 网站打不开时也会保存域名，之后可重新刷新。
> 「自动获取网站图标」只试抓图标并预览（不改动已收藏条目）；要单独换某一条的图标，用卡片上的「换图标」。

- `public/plugins/web-collector/main.js`：`paint()` 里整段 `<div class="wc-sub">…</div>` 删除；
  `styles()` 里随之失效的 `.wc-sub{…}` 规则一并清掉（不留死样式）。
- 插件版本号**不另升**：本次为纯文案删除，并入并行批次尚未发布的 web-collector 1.2.2
  （该批次行为变更：打开方式默认「应用内显示」）。
- 应用版本：并入 v0.55.0（未提交批次共用版本号，不造新号）。

### 影响端

- 桌面（Windows / macOS / Linux）
- Android（与桌面共源 WebView）
- 微信小程序：无（该插件未分发到小程序端）

### 数据迁移

无。纯界面文案删除。

### 校验

- `sync-version.js --check` ✓ 三端一致 v0.55.0（含 package-lock 两处）
- `gen-theme-dark.js --check` / `build-schedule-plugin.js --check` / `sync-android-native.js --check` ✓
- `scripts/test-web-collector.mjs` ✓ PASS

---

## 分类配色统一：一种类型一种颜色（本批次）

### 改了什么

用户反馈（附截图）：里程碑轴上同一个「工作」会同时出现蓝 / 绿 / 黄 / 紫四种颜色。
根因是 `milestoneView` 按**节点序号**取色（`PALETTE[(start + k) % 8]`）。

顺着查下去，全仓库有 **5 套互不一致的「分类 → 颜色」映射**，同一个「工作」
在时间块视图是深青、在时间视图是蓝、在小程序是青绿：

| 位置 | 原来的映射 |
|---|---|
| `src/styles.css` 的 `.cat-block-*` | work = `--deep`（深青） |
| `src/views/timeline.js` | work = `--deep`（第二份拷贝） |
| `src/views/timeblock.js` | work = `--deep`（第三份拷贝） |
| `src/views/timeViews.js` | work = `#2d8ee6`（蓝，与上面完全不同） |
| `miniprogram/` | work = `#168f88`（青绿，第五套） |

现在只留**一处事实源**：`styles.css` 的 `:root` 定义 `--cat-*` 与 `--cat-*-fg`，
JS 一律用 `var(--cat-*)` 引用，不再各写一份十六进制表。映射按用户指定：

| 类型 | 颜色 | 令牌 | 压在它上面的文字色 |
|---|---|---|---|
| 工作 | 黄 | `--sun` | 深 `#17323A` |
| 学习 | 蓝 | `--sea` | `--on-accent`（浅色白字 / 深色深字） |
| 运动 | 红 | `--coral` | 深 `#3A1512` |
| 生活 | 紫 | `--grape` | `--on-accent` |
| 休息 | 青绿 | `--mint` | 深 `#0E2A26` |

取色口径：里程碑 / 横向年表 / 卡片时间轴 / 年度甘特 / 阶段甘特泳道全部改成
「按事件分类取色」；泳道条用本行的分类色（原来按 `(行号 + 序号)` 取彩虹色）。
「截止」节点的标签是「目标」、不显示分类，所以单给品牌深青，不借用所属分类色。

**为什么前景色不是一律白字**（实测，不是审美）：`--sun` 上白字只有 **2.26:1**、
`--mint` 上 **2.17:1**、`--coral` 上 **2.78:1**（14 套主题实测）；而 `--sea` 白字 3.96
反而优于深字 3.45 —— 所以黄 / 红 / 青绿配深字，蓝 / 紫沿用 `--on-accent`。

分类色当**文字**压在面板上时（时间线视图的时间戳、窄屏课表时段、分类折叠标题）
另走 `color-mix(… 55%, var(--ink))`：浅色模式下 `--ink` 是深色 = 同色相压暗，
深色模式下是浅色 = 同色相提亮，一个写法同时管两种模式（黄字直接写只有 2.26:1）。

### 影响端

- 桌面（Windows / macOS / Linux）
- Android（与桌面共源 WebView）
- 微信小程序：**有** —— `app.wxss` 的 `.cat-*`、`pages/timeblock/` 的 `CAT_COLORS`、
  `.wk-row.cat-*` 边框色、时间块与日期徽章的前景色

### 数据迁移

无。纯配色，不改存储结构。

### 校验

- `scripts/test-time-views.mjs` ✓ 新增：事实源映射、按分类取色、前景色、当文字用要混 `--ink`。
  每条都**正面钉住实现表达式并计数** —— 只写「不许出现什么」被变异绕过过一次
  （把泳道条改写成 `PALETTE[(0 + 0) % …]` 就不再匹配那条禁令正则，断言却照样 PASS）
- `scripts/test-theme-contrast.mjs` ✓ 新增：16 套主题 × 浅/深两套色板，
  `--cat-*-fg` 压在 `--cat-*` 上必须 ≥ 3.0。`--cat-*` 是 `var()` 引用，
  断言前先解开这一层（声明取浅色表，内层 var 按当前模式的表解析）
- `scripts/test-miniprogram-timeviews.mjs` ✓ 新增：两端分类色逐项同值
- 变异验证 **6/6 捕获**（`.workbuddy-ai/tmp/mutate-cat-colors.mjs`，
  写入后回读比对 + `try/finally` 还原 + 收尾打印还原结果）
- 四项 `--check` ✓（版本 v0.55.0 / 派生调色板 / 课程表插件 / Android 原生）
- `npm test`：47 个脚本通过。`test-dorm-duty.mjs` 与 `test-text-scale.mjs` 失败，
  均为并行批次在途（滑动窗口顺序、`clamp()` 字号未转换完），与本次无关

### 已知遗留

- `--q1-bg ~ --q4-bg`（四象限底色加深）与 `--ui-text-scale`（文字大小）属并行批次，本次未动。
- `miniprogram/pages/plugin/index.wxss` 的 `.cx-card.cat-work` 是**插件通知类型**、
  不是任务分类（同名不同义），所以小程序端的前景色一律写成 `.cat-pill.cat-*` /
  `.block.cat-*` 这类限定选择器，避免给那张卡片塞深色字导致暗色模式下正文发黑。

---

## 文字大小：覆盖全部文字 + 区间扩到 80~150（本批次）

### 改了什么

用户要求两件事：①「文字大小」设置的调节范围增大；②文字缩放要作用于**所有**文字。
此前的实现只把手写的 8 条 `font-size` 规则接入 `--ui-text-scale`，主样式几百条
`font-size:Npx` 与全部插件的文字都不缩放；范围也只开到 90~120。

- **区间扩大**：新增单一事实源 `TEXT_SCALE_LIMITS = { min: 80, max: 150, step: 5 }`
  （`src/uiPreferences.js`），归一化逻辑改为按 LIMITS 夹取与取整；设置页滑杆
  `min/max/step` 全部改为引用该常量，不再写死 90/120。旧值（90~120 区间内）原样可用，
  旧档位无需迁移。
- **主样式全量接入**：codemod 把 `src/styles.css` 的 **277 条** `font-size:Npx`
  全部改写为 `calc(Npx * var(--ui-text-scale))`；复合乘数型（`.wakeup-grid` 的
  `--wk-zoom`）追加乘数；clamp() 流式字号（`.topbar h1`）上下限分别乘。
  豁免：`font-size:0` 与课表族 `.wk-*` 的 em 断点（后者由 `--wk-zoom` 另行管理）。
- **插件文字全量接入**：13 个手维护插件的 `main.js` + `shiguang-schedule/ui.js` +
  `exam-calendar/src/main.template.js` 全部同样改写（插件与主应用同文档渲染、
  `<style>` 注入，`:root` 变量天然可达，零运行时成本）；随后重跑两个生成器
  重建生成型 `main.js`。动态字号（web-collector 的 `fitInputFonts`）改为
  `calc(${size}px * var(--ui-text-scale, 1))` 字符串赋值。
- **移动壳兜底**：`src-tauri/src/mobile.html` 是独立文档（无 uiPreferences 注入），
  `:root` 补 `--ui-text-scale:1` 兜底 + 15 条 font-size 接入，保证缩放常量未定义时
  不至于整体字号归零。
- **守卫固化**：新增 `scripts/test-text-scale.mjs` —— ①覆盖扫描（644 条 font-size
  全接入，跳注释、按豁免清单放行）②动态 `.fontSize =` 赋值必须含 var ③设置页
  滑杆必须引用 TEXT_SCALE_LIMITS、禁止字面量 90/120 回潮 ④区间行为断言 +
  mobile.html 兜底检查。变异验证 3/3 捕获（裸 px 回退 / 滑杆写死 90 / 删兜底）。

### 影响端

- 桌面（Windows / macOS / Linux）
- Android（与桌面共源 WebView）
- 微信小程序：无（小程序端无此设置，走自身样式体系）

### 数据迁移

无。`textScale` 旧值落在新区间内原样生效；越界值（如手工改过的）按新 LIMITS 夹取。

### 校验

- `scripts/test-text-scale.mjs` ✓（新建守卫）+ 变异验证 3/3 捕获
- 全量测试 49 个脚本全部通过（`npm test` 直跑 `node scripts/run-tests.mjs`）
- 四项 `--check` ✓（版本 v0.55.0 / 派生调色板 / 课程表插件 / Android 原生）
- 无头 Chrome CDP 实测：body / topbar / 按钮 / 象限卡 / RSS 标题在 80/100/150 三档
  computed font-size 精确 0.8/1.0/1.5 倍；设置页滑杆 live 值 min=80 max=150 step=5；
  截图目检通过（`output/preview/textscale-{080,100,150}-quadrant.png`、
  `textscale-settings-{100,150}.png`、`textscale-rss-{100,150}.png`）
