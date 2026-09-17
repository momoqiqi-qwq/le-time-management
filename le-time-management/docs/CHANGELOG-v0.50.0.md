# v0.50.0 变更说明

> 发布日期：2026-09-17
> 版本类型：minor（默认界面行为变更）

## 默认界面密度改为「紧凑」

### 改动

新装用户（以及从未在设置里动过密度选项的用户）的界面密度默认值从「舒适」改为「紧凑」。

| 项 | 内容 |
|---|---|
| 事实源 | `src/uiPreferences.js` · `DEFAULT_UI_PREFERENCES.density: "comfortable" → "compact"` |
| 生效选择器 | `:root[data-ui-density="compact"]`（styles.css 里的紧凑覆盖规则：侧栏宽度 204px、导航按钮/设置行/主题卡片间距收窄等） |
| 影响端 | 桌面 + Android（共用 WebView）；小程序端无 UI 密度概念，不受影响 |
| 已保存数据不受影响 | 密度是显式偏好，用户之前手动选过「舒适」的照旧是「舒适」；只有未设置过（回退到默认）的实例才切到紧凑 |
| 想要宽松 | 设置 → 界面与交互 → 界面密度 → 舒适 |

### 兼容性说明

- `normalizeUiPreferences()` 对非法密度的回退值随默认值一起变为 `"compact"`，
  `scripts/test-ui-preferences.mjs` 断言已同步。
- 「低干扰」预设（外观设置页）仍显式指定 `density: "comfortable"` —— 预设是明确的用户选择，语义不变。

### 验证

- `npm test`：37 个测试脚本全部通过（含 UI 偏好归一化断言）。
- 四道 `--check`（版本 / 主题派生 / 课程表生成物 / Android 原生）全部通过。

---

## Android：设置弹窗顶栏让开手机状态栏

### 现象

APK 里打开设置，顶栏的「设置」二字与「关闭」按钮被手机状态栏压住（用户反馈）。

### 根因与修复

窄屏（≤760px）设置弹窗是 `inset: 0` 的全屏浮层，顶栏 `padding-top` 只有 12px，
而 Android 的 `enableEdgeToEdge()` 让状态栏变成浮层盖在 WebView 上。
Android WebView **不实现** `env(safe-area-inset-*)`，只有 `MainActivity` 注入的 `--sat` 是真的。

⇒ `.settings-modal-head` 改为 `padding-top: calc(12px + var(--sat, env(safe-area-inset-top, 0px)))`（双路写法，铁律四）。

实测（291×633 @ dsf 3.76，`--sat: 40.3px` ⇒ 状态栏在布局坐标占 32.6px）：

| 项 | 改前 | 改后 |
|---|---|---|
| 「设置」标题 top | 15.9（被压） | 44.9 ✓ |
| 「关闭」按钮 top | 14.2（被压） | 43.3 ✓ |

### 🔴 顺带修掉：v0.48.0 的「视口补偿」写法是错的（影响桌面端设置页）

追这个 bug 时发现 v0.48.0 把 `position: fixed` 浮层的边距统一改写成了
`calc(var(--ui-vh, 100dvh) - N)`（理由：「zoom 下 px 会被缩放」）。**实测证明那是错的**：

| 写法（1280×800，zoom=1 与 1.5 两档） | 结果 |
|---|---|
| `calc(var(--ui-vh) - 22px)` | 等价于「距屏幕**顶** 22px」—— toast 跑到屏幕上沿（实测 top=22） |
| `.settings-modal` 的 `inset: calc(--ui-vh - 36px) calc(--ui-vw - 20px)` | 弹窗塌成 **2×2 像素**并推到右下角外 ⇒ **桌面（>760px）设置页整个打不开** |
| `calc(22px / var(--ui-scale, 1))` | zoom=1 与 1.5 下矩形完全一致 ✓ |

道理：`fixed` 的包含块在 zoom 下确实变成 root，但它的尺寸**仍是视口尺寸**（不是视口 × zoom）；
zoom 元素里「布局长度 × zoom = 物理长度」，所以「恒定的物理边距 N」要写 **N ÷ 系数**。
`--ui-vw/--ui-vh` 只能用来**乘比例**（`calc(var(--ui-vh) * .11)` = 视口的 11%）。

已改回正确写法的地方（4 处）：`.settings-modal` 的 `inset`、`#toasts` 的 `bottom`（全局 + 窄屏）、
`.update-toast` 的 `bottom`（全局 + 窄屏）。文件顶部「界面整体缩放」契约第 1 条与
`src/uiScale.js` 的注释同步订正 —— 原文在教错误写法。

### 验证

- 对照实验脚本 `.workbuddy-ai/tmp/probe-inset-zoom.cjs`（4 种候选写法 × 2 个 zoom 档）。
- 探针 `.workbuddy-ai/tmp/probe-settings-modal-sat.cjs`：
  桌面 1280×800 弹窗恢复 `top=36 left=20 1240×728`、`#toasts` 回到屏幕底部（top=778）；
  用户机 291×633 顶栏两项均落在状态栏下沿（32.6px）之下。
- `scripts/test-ui-scale.mjs` 第 3c 节改写成**反向守卫**（原断言正钉着错误写法）：
  定位锚点里出现「`--ui-v* − 数值`」一律算回归。两种变异（改回旧写法 / 去掉顶栏 `--sat`）都被抓红。
- `npm test` 37 个测试脚本全部通过。

---

## 里程碑：从「横向长轨道」改成蛇形折返跑道

### 需求

里程碑视图原来是一条横向轨道排到底：12 个节点要横向滑很久才看得全，
而且一条直线看不出阶段感。用户给了参考图 —— 要「人类科技革命里程碑」那种回环折返的跑道。

### 改动

`src/views/timeViews.js` 的 `milestoneView()` 与 `src/styles.css` 的里程碑段一并重写：

| 项 | 内容 |
|---|---|
| 分块 | 每 4 个节点一行（`MS_COLS = 4`），一行排满就掉头 |
| 方向 | 奇数行反向：`.ms-row[data-dir="rev"]` 用 `direction: rtl`，让 grid 自动放置从右往左（天然就是「倒序 + 靠右对齐」） |
| 序号 | 每个节点带 `1..N` 编号 —— 折返之后光看左右位置已经看不出时间先后，序号是必需品不是装饰 |
| 跑道线 | `.ms-row::after` 贯穿整行、从图钉中心穿过（`--ms-rail-y: 164px`），按本行节点配色做渐变；反向行的渐变跟着倒过来铺，否则颜色与节点对不上 |
| 行间竖直段 | `.ms-row::before` 从本行图钉中心往下接到下一行，落在**本行时间最晚那个节点**下方：正向行 → 最右列中心，反向行 → 最左列中心；最后一行不接 |
| DOM 顺序 | 恒为时间顺序，方向只由 `data-dir` 表达 ⇒ 窄屏把每行拆成单列时不必重排 |
| 窄屏降级（≤760px） | 每行拆成单列、方向摆回正序、跑道线与行间段 `display:none`，改成左侧色条 + 左对齐文字；`min-width` 归零，无横向溢出 |

### 验证

- 真浏览器探针 `.workbuddy-ai/tmp/probe-milestone.cjs`（已收进技能 `letime-settings-ui-probe`），
  造 7 条 / 12 条事件两档 × 桌面 1280×900 / 窄屏 390×844，共 12 条判据：
  行数、每行节点数、行方向交替、反向行在屏幕上确实从右往左、
  **竖直段落在时间最晚那一端**、**竖直段中心与末节点中心对齐（实测偏差 0px）**、
  **跑道线从图钉中心穿过（偏差 0px）**、编号 `1..N`、跑道线渐变、无横向溢出、窄屏收线与单列。
- 变异测试（两条都变红）：① 把反向行的竖直段改回 `right` ⇒ 12 事件档两条断言红（偏差 732px）；
  ② 窄屏 `display:none` 改 `display:block` ⇒ 两条收线断言红。
- `scripts/test-time-views.mjs` 补 10 条静态守卫（分块常量 / 方向交替 / 序号 / 渐变反转 /
  `direction:rtl` / 正反向段落左右端 / 末行不接 / 窄屏收线）。
- `npm test` 全部通过。

### 🔴 探针踩过的坑（写给下次改这里的人）

Chrome 对**绝对定位**元素的 `left`/`right` 返回的是 **used value** —— 只声明了一侧时，
另一侧也会被解析成具体 px（实测 `L=852px R=120px`）。所以「谁不是 `auto`」这种判法**必然误判**：
首轮探针把反向行读成了 `right`，而 CSS 本来就是对的。
只有 `display:none` 的元素才保留未解析的声明值（`L=auto` / `height=calc(100% + 26px)`）。
同理，「有没有被收掉」只能看 `display`，不能看 `backgroundImage` / `height`。
⇒ 判几何用**数值比较 + 与目标元素实测中心对照**，别用「属性是否等于某关键字」。

### 追加：反向行的箭头也指向行进方向

`clip-path` 左右镜像（原式每个 x 换成 `100% − x`，尖与缺口对调）：反向行左端变尖、右端变缺口，
行内相邻箭头「尖插缺口」的衔接关系不变，文字与 DOM 顺序都不用动。

⚠️ 窄屏必须在窄屏块里**显式复位**成 `clip-path: none`：桌面那条 `[data-dir="rev"] .ms-arrow`
的 specificity 是 0,3,0，而窄屏原有的 `.ms-arrow { clip-path: none }` 只有 0,1,0，
**压不住它**（跨断点的覆盖只看 specificity，与书写顺序无关）。
「窄屏没写就是沿用桌面」这个假设在这里是错的 —— 首轮就是这么错的，实测 rev 行窄屏变成了朝左箭头。

### 🔴 造测试数据的坑：过期任务会被自动顺延到今天

探针最初把日期写死成 2026-07-04 ~ 07-15。结果 8 个任务的日期**全变成了今天**，
`events.sort` 退化成按标题拼音排序，日期标签全一样（截图一眼就看出来：编号 5→8 正好是
「北京大学 / 读完 / 给导师 / 回飞书」的拼音序）。

根因是既有自动化规则 `src/automation.js:36`：

```js
for (const t of S.getState().tasks) if (!t.done && t.due && t.due < S.todayStr()) t.due = S.todayStr();
```

⇒ 造数据一律**相对今天**生成（`dayOffset(n)`），任务的 due 落在未来。
并且探针补了一条哨兵断言「节点日期互不相同」—— 因为日期全相同时，
「编号 1..N」「行方向交替」这些判据**照样全绿**，只有这条能把它拦下来。

---

## 警大门户通知（cppu-notify）1.9.0：校园服务栏的「收起」按钮

### 现象

展开左侧「校园服务」栏后，头部是 **10.5px 灰金小字标题**（字距 2.31px）+ 右上角一个 **18px 小三角 ◂**。
用户反馈希望这里就是一个像样的按钮（并给了参考图 —— 正是收起后那个把手的样式）。

### 改动

| 项 | 改前 | 改后 |
|---|---|---|
| 展开态头部 | `<span>校园服务</span>` + ↻ + ◂ 小三角 | **一个按钮** `◂ 校园服务`（`data-side-toggle`，点了收起）+ 右侧只留 ↻ |
| 按钮视觉 | — | 与收起后的把手 `.pp-side-toggle` **完全同一套**：12px / 600、`var(--deep)`、白底、`1px solid var(--line)`、圆角 11px、`0 1px 6px` 阴影 |
| 箭头位置 | ◂ 在右边（小图标） | **◂ 在左**（与把手的 `▸` 左右对称，方向跟随状态） |
| 字距 | 继承头部的 `letter-spacing:.22em` | 按钮上显式 `letter-spacing:normal`，否则按钮文字会被拉散 |
| 手机端 | ◂ 图标 44px 触控区 | 按钮 `min-height:44px` + `padding:10px 14px` + 13px 字号 |

顺带删掉已无人匹配的 `.pp-side-sync[data-side-toggle]` 规则（那个 ◂ 图标没了）。

### 为什么不复用 `.pp-side-toggle`

它是**收起态的把手**，带 `position:sticky` 与「展开时收到 0 宽」的收合动画
（`.pp-shell:not(.side-collapsed) .pp-side-toggle{max-width:0;…}`）—— 展开态里直接复用会被藏掉。
所以新开 `.pp-side-head-toggle`，**只抄视觉、不抄收合逻辑**。
两个开关都带 `data-side-toggle`，靠既有的事件委托与 `applySideOpen()` 自动生效。

### 验证

真浏览器探针 `.workbuddy-ai/tmp/probe-cppu-side.cjs`（390×844 与 1440×900 两档，
量「刚打开 → 点开 → 再收起」三拍）：

| 项 | 实测 |
|---|---|
| 打开插件默认 | `side-collapsed=true`、侧栏 `opacity:0`、把手 `▸校园服务` 101×44 可见（**没有回归**） |
| 展开后头部按钮 | 390 档 `◂校园服务` 262×44；1440 档在 214px 侧栏内正常 |
| 按钮样式 | `13px / 600 / rgb(15,76,92) / 白底 / 圆角 11px / padding 10px 14px / letter-spacing normal` —— 与把手逐项一致 |
| 点它 | `side-collapsed` 变回 true、侧栏 `opacity:0` ✓ |

`scripts/test-cppu.mjs` 补 4 条守卫（头部必须是带 `data-side-toggle` 的按钮 / 不能再渲染成纯文字标题 /
按钮用 `var(--deep)` / 必须显式清字距），并把「手机端收起入口 ≥44px」从 `.pp-side-sync` 改钉到
`.pp-side-head-toggle`（原来钉的是那个已被删掉的小三角）。
另把硬编码的 `assert.equal(version,'1.8.0')` 改成三段式格式断言 —— 它和下面那条
「catalog 与 manifest 版本一致」自相矛盾（后者的注释正写着「版本号只写一处」）。

`npm test` 38 个脚本全过。

---

## 警大门户通知（cppu-notify）1.10.0：校园服务栏头部去重

### 需求

用户看着展开态头部的截图说：「删除右侧多余的按钮。把多余的 1 个框删掉。」

### 实测：那个 ↻ 是被裁掉半个的

先量后改。探针把侧栏里**所有带框的元素**（有 border / 有 box-shadow / 背景不透明）逐个列出来：

| 元素 | rect（x,y,w,h） | 边框 |
|---|---|---|
| `aside.pp-side` | 263,93,**214**,370 | 四边 1px |
| `div.pp-side-head` | 275,105,**214**,46 | 只有 `border-bottom` |
| `button.pp-side-head-toggle` | 275,105,184,36 | 四边 1px |
| `span.pp-side-ico` ×5 | 283,167… | 四边 1px |

`.pp-side-head` 宽 214px，可 `.pp-side` 的**内容盒只有 190px**（214 − 2×1px 边框 − 2×11px 内边距）。
根因是 `.pp-side-inner{width:214px}` 照抄了卡片的**外框宽**：整层内容比内容盒宽 24px，
多出来的部分被 `.pp-side{overflow:hidden}` 裁掉。头部右侧的 ↻ 正好落在那 24px 里，只剩半个弧 ——
用户看到的是「右边一个残缺的按钮」。

所以这条不是「按钮多余」，是**宽度算错了**。删掉 ↻ 只是治标；宽度不改，下一个右对齐的元素照样被裁。

### 改动

| 项 | 前 | 后 |
|---|---|---|
| 头部右侧 | `↻`（`data-link-sync`，重新识别标题与图标）+ `.pp-side-acts` 包裹 | 删掉 |
| 头部下方 | `border-bottom:1px solid var(--line-soft)` 分隔线 | 删掉（卡片边框 + 这条线把头部圈成一个多余的方框） |
| `.pp-side-inner` | `width:214px`（卡片外框宽，溢出 24px） | `width:190px`（卡片内容盒宽，正好贴合） |
| 点击委托 | 多一个 `[data-link-sync]` 分支 | 删掉，不留死代码 |

### 取舍

「重新识别标题与图标」这个**强制重扫**入口没了。自动识别仍在：每次渲染都会调 `loadLinkMeta(el)`，
结果按 `LINK_META_TTL` 缓存、过期自动重抓 —— 丢的只是「缓存没过期但我想立刻重来」这个便利。
要放回来的话，合适的位置是插件自己的设置区（目前没有）。

### 验证

| 判据 | 实测 |
|---|---|
| 头部按钮右边缘 | 275 + 190 = **465** = `.pp-side` 内容盒右边缘 465 ⇒ 0px 溢出 |
| 带框元素 | 9 个 → 8 个：`.pp-side-head` 不再出现在列表里（分隔线没了），↻ 与 `.pp-side-acts` 从 DOM 消失 |
| 三拍回归 | 390 与 1440 两档：默认收起 / 展开头部（手机 44px）/ 点它正常收起，全绿 |
| 按钮视觉 | 与收起把手逐项一致（`12px / 600 / rgb(15,76,92) / 白底 / 圆角 11px / letter-spacing normal`） |

`scripts/test-cppu.mjs` 把原来那条「内层必须固定宽度」的断言升级成**算式守卫**：解析 `.pp-side` 的
width / border / padding 与 `.pp-side-inner` 的 width，核对 `190 = 214 − 2×1 − 2×11`。
改了卡片尺寸却忘了改内层会被拦下。

变异测试两条，都变红：

| 变异 | 触发 |
|---|---|
| 把 `border-bottom` 加回 `.pp-side-head` | `头部不能再有 border-bottom 分隔线：卡片边框 + 这条线会把头部圈成一个多余的方框` |
| 把 `.pp-side-inner` 写回 `width:214px` | `内层固定宽度必须等于卡片的内容盒宽（214 − 2×1px 边框 − 2×11px 内边距 = 190）…` |

`npm test` 39 个脚本全过。

---

## 顺带修：`test-back-nav.mjs` 一条脆弱断言

「popstate 监听必须注册在 `initBackNav` 之后」原来用**字符距离窗口**判断：

```
/initBackNav\(\{[\s\S]{0,300}?\}\);\s*\n[\s\S]{0,200}?window\.addEventListener\("popstate", syncBackButton\)/
```

并行会话做插件快捷键时把 `attachPluginShortcutKeys({...})` 插在了这两者中间 ——
**两边语义都没变**，但中间那段（注释 + 调用，约 400 字符）把 200 的窗口撑破，断言变红。

改成按下标先后判断（`indexOf` 比大小），不再受中间插入多少代码影响。
教训：**用「距离窗口」判断代码顺序是脆的**，语义上是「A 在 B 之前」，就该直接比位置。

---

## 深浅色切换动画：从「瞬间跳变」到圆形揭示

### 需求

切换深色/浅色模式时动画做好，不要突兀。原来点击「深色模式 / 浅色模式」是整页瞬间变色，视觉上「闪一下」。

### 根因（为什么原来零动画）

`src/theme.js` 旧逻辑里 `animate` 的门槛只看**主题 id** 是否变化：

```js
const changed = root.dataset.theme !== resolved.id || ...;   // 模式变化不计入
```

纯「深色 ↔ 浅色」模式下 `theme` 不变（还是同一套配色），`changed` 恒 false → 永远走直通路径。
也就是说**模式切换的动画通道压根没接过电**，CSS 里再怎么写过渡都没用。

### 改动

| 项 | 内容 |
|---|---|
| 触发条件 | `changed` 纳入 `themeMode`：主题变化**或**模式变化都算真变化 |
| 主路径 | `document.startViewTransition(() => paintTheme(...))` —— 旧快照垫底、新快照在上做 clip-path 圆形扩张揭示，全页统一，无「半渐变半闪变」 |
| 揭示圆心 | 跟随**最近一次 pointerdown** 的位置（模块顶层 capture 监听记录 `lastPointer`）；无坐标（键盘/程序化触发）回退屏幕中心；半径 = 圆心到视口最远角的距离（`ceil(hypot)`） |
| 注入变量 | `--theme-reveal-x / -y / -r` 写在 `:root` 内联，CSS 端 `@keyframes theme-reveal` 消费（带 50%/150vmax 兜底） |
| 时长曲线 | 340ms `cubic-bezier(.22,.8,.22,1)` |
| 降级路径 | 不支持 View Transitions 的旧 WebView → `.theme-transitioning` class 给全元素加 340ms 颜色过渡（原有机制保留） |
| 减少动效 | `data-ui-motion="reduced"`（应用内设置）或系统 `prefers-reduced-motion` → 直接应用，不进转场（JS 端 `themeMotionAllowed()` 拦 + CSS 端 `animation:none !important` 双保险） |
| CSS | `styles.css` 新增 `::view-transition-old/new(root)` 层级与 `theme-reveal` keyframes（36 行） |

### 验证

- 新增 `scripts/test-theme-transition.mjs`（vm + stub 真跑 theme.js）：
  VT 主路径（坐标注入 / 中心回退 / 半径公式 / 重复状态不转场 / night 主题同路径）、
  降级 class 加/摘、reduced 直接应用、跟随系统变化转场，CSS 静态守卫；
  3 个变异（模式变化不计入 changed / 砍掉 VT 主路径 / reduced 豁免失效）经子进程重跑**全部拦下**。
- 真机 CDP 驱动（无头 Chrome 152，390×844 iframe 进真实设置弹窗，**真实鼠标事件**点击）12 项判据全 PASS：
  - dark→light→dark 两次切换 `startViewTransition` 计数 1→2，**重复点击不再增加**；
  - **揭示圆心 = 实际点击坐标**（浅色按钮中心 191,475 / 深色 191,547），
    半径与「到最远角」公式吻合（±1px 取整差）；
  - 终态正确、无残影。
- 连帧截图目检（45ms 步进 × 8 帧 × 两方向）：动画中段弧形边缘清晰（顶部两角残留旧主题），
  340ms 内完成，终态干净。截图在 `output/theme-anim/`（`shot-*` 单帧 + `seq/` 连帧）。
- `npm test`：38 个测试脚本全部通过；四道 `--check` 全部通过。

### 🔴 验证时踩过的坑（写给下次做动画验证的人）

1. **无头 Chrome 默认 `prefers-reduced-motion`** —— 不显式处理时探针会走「减少动效」豁免路径，
   测不到主路径。探针须显式设 `data-ui-motion="full"`。
2. **`--virtual-time-budget` 不推进渲染帧**：实测 1500ms 虚拟时间只跑 **1 帧 rAF**，
   而 `startViewTransition` 的 callback 恰在「下一次渲染机会」执行 ⇒ 虚拟时间模式下
   callback 执行时机近乎随机，固定 sleep 等终态必然偶发错乱（表现为「上一步的值」）。
   **验证动画要用 CDP 真实时间驱动**，别用 `--dump-dom` + 虚拟时间。
3. **CDP 连接断开后 headless tab 会被冻结**：页面内 `setTimeout` 轮询不再推进，
   页面内长轮询必然超时。轮询要做成**外部短查询**（每条 `Runtime.evaluate` 都会唤醒上下文）。
4. **手风琴展开是异步动画**：轮询里每 150ms 重复 `click()` 展开头会与收起/展开动画竞争，
   最终读到的按钮坐标是过期的（真实点击打在别的分区上，表现为「点击无效 vt=0」）。
   正确姿势：**单次点击展开 → 只等不点 → 布局稳定（连续多次 rect 相同）→
   `elementFromPoint` 自校验坐标确实是目标按钮 → 再派发真实鼠标事件**。
