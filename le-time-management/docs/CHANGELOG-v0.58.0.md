# v0.58.0 版本说明

## 侧栏宽度分隔条：可拖拽实时调宽，松手保持

### 需求原文（用户截图点单）

> 在这边添加一个可拖动的分隔条，拖动后可以实时调整侧边栏的宽度，支持鼠标和触摸操作，
> 并在松开后保持新的宽度状态。

### 改了什么

| 改动 | 文件 | 说明 |
|---|---|---|
| 新增侧栏宽度模块（纯函数 + DOM 唯一出口） | `src/railWidth.js` | `RAIL_WIDTH_LIMITS`（168~360 布局 px）、`normalizeRailWidth`（落盘值闸门：脏数据一律 null = 恢复 CSS 默认）、`clampRailWidth`（拖动实时夹取，只认 number 类型 —— `Number(null)===0` 放进来会被误当下限）、`steppedRailWidth`（键盘步进 ±16px）、`applyRailWidth`（唯一 DOM 出口：往 `.app` 写/删内联 `--rail-w`） |
| 分隔条元素与拖拽会话 | `src/shell.js` | `.rail-resizer`（`role="separator"` + aria 区间值）插在 `.rail` 与 `.main` 之间。Pointer Events 一套代码同时吃鼠标与触摸；`setPointerCapture` 失败时 document 捕获阶段 `pointerup/pointercancel` 兜底（照抄 `attachRailDockDrag` 的防挂死范式）。拖动实时改宽走 rAF 合帧（宽度变化重排整个 `.app`，不逐事件重排）；**pointercancel 回滚**到拖动前宽度，不留半截状态；松手才落盘 `settings.railWidth` + `persistSoon()` |
| 坐标换算（zoom 契约） | `src/shell.js` | zoom 下 `clientX` 与 `getBoundingClientRect()` 同为屏幕**视觉 px**，位移与起点宽度都除以生效缩放系数（`getUiScaleFactor()`）换成布局 px —— 不除的话 125% 缩放下侧栏会比手指快 25%。系数在 pointerdown 时快照，拖动中途不漂移 |
| 附加交互 | `src/shell.js` | 双击恢复默认（删内联 `--rail-w` + 删落盘值，密度档位默认宽度立刻生效）；键盘 ←/↓ 变窄、→/↑ 变宽、Home/End 到界，每次按键即落盘；拖动结束与键盘调整都会同步 `aria-valuenow` |
| 分隔条几何与视觉 | `src/styles.css` | 桌面（≥901px）：16px 命中区用 -12px×2 负边距骑在 `.app` 的 8px 间隙上（净占位 -8px，**布局零位移**）；3px×56px 指示线平时隐形、悬停/拖动/键盘聚焦现形；`touch-action: none`（触摸拖动不让位给滚动）+ `cursor: col-resize`。拖拽会话全局态 `body.rail-resizing`：全局光标、禁文本选中、**iframe 一律禁命中**（插件视图的 iframe 会吞指针让 pointermove 断流）。窄屏（≤900px）：侧栏变底栏，分隔条 `display: none`（flex 子元素默认 order:0 会排到顶部，必须显式藏） |

### 影响端

- **桌面端（Windows）**：全部生效。
- **Android**：共用同一 WebView 代码；手机宽度（≤900px）下侧栏是底部导航条，分隔条隐藏，
  无行为变化。平板/折叠屏展开到 ≥901px 时可拖。
- **小程序**：不涉及（外壳为桌面/Android 共用代码，小程序端无 `.rail` 结构）。

### 数据迁移

无。`settings.railWidth` 为新增可选字段，缺省即跟随 CSS 默认（舒适密度 224px / 紧凑 204px），
不写迁移；老存档升级后界面不突变。用户显式拖过的宽度优先于密度默认值（内联 `--rail-w`
压过样式表档位），双击分隔条即可恢复密度默认。

### 回归守卫

`scripts/test-rail-resizer.mjs`（全量 51 个测试脚本之一）：

- 纯逻辑：落盘值闸门（合法/越界/脏数据/布尔/数组）、拖动夹取（0 与负数是合法中间态）、
  键盘步进（未自定义时用现测宽度作基准、方向非法拒收、上下界钳住）、DOM 出口（写值/删值/
  非法值无操作/无环境安全）。
- 源码守卫：≤900px 媒体块内必须有 `.rail-resizer { display: none }`；桌面规则必须含
  `touch-action: none` 与 `cursor: col-resize`；`body.rail-resizing iframe` 必须禁命中；
  shell.js 必须有 document 捕获兜底、两条落盘路径、双击删落盘值、`getUiScaleFactor()` 坐标换算。

---

## 修复：拖动「界面缩放」滑杆整页「一闪一闪」

### 需求原文（用户截图 + 一句话点单）

> 拖动这个就会一闪一闪（设置页「界面缩放」滑杆截图，滑杆停在 80%、文字大小 125%）

### 根因（2026-09-18 无头 Chrome + CDP 真实鼠标拖动实测）

不是动画、不是渲染循环，是一个**几何正反馈回路**：

1. 滑杆 `input` 改 `documentElement.style.zoom` → 整页（含滑杆自身）按新系数立即重排；
2. 设置弹窗是 `margin:auto` 居中的 fixed 浮层 ⇒ 轨道在指针下**水平平移**（每 5% 档漂移约 14px，
   实测轨道 left 898.3@0.95 → 912@1.0 → 926.3@1.05 → 940.5@1.1 → 859@0.8 → 903.3@1.25）；
3. 浏览器下一次 `pointermove` 按**新几何**重算滑杆值 → 值跳 → zoom 又变 → 回到第 1 步。

实测指针匀速右移，值 95→100→95→105→95→110→90→120→100→110→95→120→105 剧烈振荡；
原地 ±1px 微抖，值在 110→80→125→95 之间摆动 45% —— 即用户看到的「一闪一闪」。
「文字大小」滑杆只改 font-size、轨道不动，所以它无此问题（未改动它）。

### 改了什么

| 改动 | 文件 | 说明 |
|---|---|---|
| 新增拖动稳定映射纯函数 | `src/uiScale.js` | `dragStableScale({v0,x0,x,baseLeft,baseWidth})`：拖动期间以**按下瞬间冻结的轨道几何**做增量映射 `v = normalize(v0 + (f(x)-f(x0)) × (max-min))`。轨道平移对 f 与 f0 是同一个平移、差值不变 —— 正反馈在数学上被拆掉，值跟随指针位移单调变化；退化输入（rect 异常 / 坐标 NaN）兜底回 v0 |
| 滑杆拖动事件接线 | `src/views/settings/appearance.js` | `pointerdown`（`button===0 && isPrimary`）冻结轨道 rect + 记录 pointerId；window 级 `pointermove` 只认同一个 pointerId（第二根手指不干扰）；`pointerup`/`pointercancel` 结束会话。`input` 里第一次取浏览器原生值作 v0（保留「点轨道跳转」语义），其后用 `dragStableScale` 重算并写回控件。**契约不变**：拖动仍 `persist:false` 直设不动画（源码守卫 3f-2 继续钉住） |
| 回归测试 | `scripts/test-ui-scale.mjs` | 新增 1d 节：单调跟随（dx=-200~200 全程不回退）、夹取两端、**抖动稳定**（±2px 来回必须停在同一档 —— 旧实现同位置摆 45%）、轨道平移 14px 不改变映射值（断开回路的判据）、6 种退化输入兜底；新增源码守卫 3f-4（拖动必须走 dragStableScale，且 pointerdown/pointercancel 会话齐全） |

### 影响端

- **桌面端（Windows）**：全部生效（本次修复的主场景）。
- **Android**：共用同一 WebView 代码，触摸拖动同样受益（Pointer Events 一套代码）。
- **小程序**：不涉及（外壳为桌面/Android 共用代码，无此滑杆）。

### 数据迁移

无。纯交互行为修复，不新增任何存储字段；键盘方向键、点档位、自定义输入、松手落定动画
的行为与此前逐位一致（键盘路径无 pointer 会话，不走映射）。

### 回归守卫

`scripts/test-ui-scale.mjs`（全量 51 个测试脚本之一）：
纯函数 5 组断言 + 源码守卫 3f-4。映射数学在 `uiScale.js` 可直接单测，无需起浏览器。

---

## 界面：顶栏 5 键合一框（闪电 / 搜索 / 窗口三键）

### 需求原文（用户截图点单）

> 有把这5个按钮做到1个方框里面吗（截图：顶栏闪电、放大镜各自独立小框 + — □ × 独立胶囊）

### 前史与反转

v0.37.15/v0.39.0 因用户反馈「框太多」特意去掉了顶栏工具的外层框（按钮各自带小框、
容器透明无边框，并有回归守卫钉着）。本版用户看到 5 键分散的现状，要求反过来 ——
**收进同一个方框**。执行规则：外框有边框+渐变底色，**内层按钮一律裸图标**
（嵌套框才是当年「框太多」的本意），hover/激活改用底色高亮，关闭键红色 hover 保留。

### 改了什么

| 改动 | 文件 | 说明 |
|---|---|---|
| 外层方框恢复 | `src/styles.css` | `.topbar-action-card`：4px 内边距 + 1px 边框 + 12px 圆角 + 渐变底色 + 轻阴影；gap 8→4px |
| 内层三件套去框 | `src/styles.css` | `.top-search` / `.top-mini-btn` 去边框底色（hover/`.on` 用 deep 8% 底色高亮）；`.window-controls` 去边框底色与内边距，不再是独立胶囊 —— 5 颗键在框内视觉统一 |
| 守卫反转 | `scripts/test-android-layout.mjs` | 原「必须透明无边框」断言改为：方框规则（4px padding + border + 渐变底色）必须存在，且内层三件套的卡内规则必须含 `border: 0`、window-controls 必须显式透明底色（防止嵌套框回归） |

DOM 与拖动排序不动：排序单元仍是 search / quick / stats / window 四个，5 键合一框只是外观。

### 影响端

- **桌面端（Windows）**：全部生效（窗口三键仅桌面存在）。
- **Android**：共用同一 WebView 代码；无窗口三键，搜索/快捷入口两键同样收进框内。
- **小程序**：不涉及（无顶栏工具行结构）。

### 数据迁移

无。纯 CSS 外观改动。

### 回归守卫

`scripts/test-android-layout.mjs` 的「5 键合一框」段（守卫已随本改动反转并加固）。

---

## 界面：顶栏按键框贴右 + 新增深浅色切换键

### 需求原文（用户截图点单）

> 这一套按键放在右边，并且添加深色和浅色切换按钮（截图：🔍 ⚡ — □ × 按键框）

### 改了什么

| 改动 | 文件 | 说明 |
|---|---|---|
| 按键框贴顶栏右侧 | `src/styles.css` | `.topbar-action-card` 的 `margin-left: 12px → auto`：桌面端 `window-drag-strip`(flex:1) 已吃掉剩余空间（行为不变），无 strip 的环境由 auto 推到最右 |
| 新增深浅色切换键 | `src/shell.js` | `TOPBAR_PARTS` 加入 `"theme"`（默认序 search → quick → **theme** → stats → window）。按钮 34×34 瓷砖（对齐搜索键），点击走 `setThemeMode({animate:true})` —— 与左下角操作条/设置页同一条 View Transitions 圆形揭示路径，圆心取点击位置；图标随**实际生效**亮暗翻转（深色显太阳、浅色显月亮），「跟随系统」时系统亮暗翻转由 `MutationObserver(data-theme-mode)` 驱动刷新（照抄侧栏 theme-toggle 模式） |
| 老存档平滑升级 | `src/shell.js` | `topbarOrderState` 归一化改为「新增部件插到 `window` 之前」—— 老用户升级后新键不会排到窗口键右边（窗口键恒贴最右的 Windows 习惯）；已保存的相对顺序不动，仍可拖动换位 |
| 按钮样式 | `src/styles.css` | `.topbar-action-card .top-theme-toggle`：归零 `.top-mini-btn` 的横向 padding、定宽 34px（否则撑成椭圆）；图标 15px 对齐搜索键 |
| 守卫 | `scripts/test-android-layout.mjs` | 新增：TOPBAR_PARTS 必含 theme 且 window 恒最后；归一化必须有「插到 window 前」逻辑；paintTopTheme + MutationObserver 接线；margin-left:auto；34×34 瓷砖规格 |

### 影响端

- **桌面端（Windows）**：全部生效（窗口三键 + 主题键都在框内贴右）。
- **Android**：共用同一 WebView 代码；顶栏出现搜索/快捷/深浅切换键（无窗口键），同样贴右。
  手机上深浅切换从「侧栏底」多了一个顶栏直达入口。
- **小程序**：不涉及（无顶栏工具行结构）。

### 数据迁移

无破坏性迁移。已保存的 `settings.topbarOrder` 保留；缺省（或含已废弃 id）时按新默认顺序补齐，
新增 theme 键自动插到窗口键之前。点「恢复界面默认」也会回到新顺序。

### 验证

无头 Chrome 探针实测：框右缘距视口 31px（≈ 顶栏内边距，贴右）；parts 渲染序
search → quick → theme → stats → window；点击主题键 `data-theme-mode` dark→light、
图标月亮↔太阳与 title 同步翻转、toast 提示正确；浅色整页渲染目检通过
（`output/topbar-right-theme-btn.png`）。

---

## 界面：「四象限」更名「任务表」

### 需求原文

> 把4象限改叫任务表

### 改了什么

纯显示名更换（内部标识符 `quadrant`、类名 `.quad-*`、机制注释一律不动 —— 改名只改用户看得见的字符串）：

| 位置 | 文件 | 说明 |
|---|---|---|
| 侧栏导航 + 标题卡标题 | `src/shell.js` | 导航定义 `title: "任务表"`（副标题「先决定，再动手」保留）+ 快捷菜单按钮 |
| 命令面板 | `src/commandPalette.js` | title 改「任务表」；**keywords 保留「四象限」** —— 老用户按旧名搜索仍能命中 |
| 启动页选项 | `src/uiPreferences.js` | 「启动后进入」下拉里的选项名 |
| 拖入消息收纳 | `src/views/ingestPanel.js` | 目标描述「进任务表待办」 |
| 关于页 | `src/aboutData.js` | 小程序一行简介 |
| 小程序 tabBar + 页面标题 | `miniprogram/app.json`、`pages/quadrant/index.json` | 底部标签与导航栏标题 |
| 小程序文案 | `pages/plugin/index.js`（说明 + toast）、`pages/quadrant/index.js`（分享标题 ×2）、`pages/settings/index.wxml`、`core/appMeta.js` | 同步更名 |

格子内语境的「象限」（如「添加到这个象限」「象限 | 面积最大」）不改 —— 那是 2×2 矩阵格子的语义，不是视图名。

### 影响端

三端同步（桌面 / Android 共用 WebView + 小程序）。无数据迁移（存储键、视图 id 均不变）。

### 验证

全量 51 个测试脚本通过（无守卫钉显示文案）；探针断言导航含「任务表」、无「四象限」残留、
标题卡 h1 =「任务表」，截图目检通过（`output/rename-task-table.png`）。
