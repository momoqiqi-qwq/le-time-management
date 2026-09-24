# U-Time v0.103.0

## 更新内容

### 插件颜色分组：右键给插件上色，同色自动并成一张颜色卡片

需求（用户）「可以给插件分组，分组过程：给插件右键增加颜色背景，相同颜色背景的在相邻时自动组成一个颜色卡片」。

### 一、交互模型

- 右键菜单（`openPluginContextMenu`）在「修改图标…」下面新增一排 **8 个色点 + 一个 ✕（不分组）**，
  点一下即生效；再点当前色等于取消。同一段里还有一条「分组名称 · 当前组名」，未分组时置灰。
  这个菜单函数被侧栏插件项和市场卡片共用，所以桌面两处一次都有。
- **改色即吸附**：`normalizePluginOrder()` 把同色插件拉成连续一段，段的位置 = 该组第一个成员原来的位置，
  无色插件各占自己原来的槽。所以只有被改色的那几个会挪，其余插件不会因别人上色而乱跳。
- 一张颜色卡片 = 组头（色点 + 组名 + 成员数 + 收起箭头）+ 组内成员。组名默认「红色组」这种「颜色名 + 组」，
  可改；收起后只剩一条带颜色的窄横条。整组上下换位走组头右侧的 ↑/↓。
- 手机端没有右键语义，市场页每张卡片多了一个「⋯」按钮（仅 ≤900px 显示），点开的是同一个菜单。

### 二、数据

全部落在 `settings` 里，随现有持久化与局域网同步快照一起走，**没有数据迁移**：

| 位置 | 内容 |
|---|---|
| `settings.pluginOverrides[<插件id>].color` | 色 ID（`red` / `orange` / …），只认 `GROUP_COLORS` 里的 8 个值 |
| `settings.pluginGroups[<色 ID>]` | `{ name?, collapsed? }`，两项都空时整条删掉 |

旧数据没这两个字段 = 全部未分组，行为与升级前一致。色值本身（`#DC2626` 等）不落库，
存在 `src/pluginGroups.js` 的 `GROUP_COLORS`，改色板不必动用户数据。

### 三、为什么侧栏拖拽改成「每段挂一次」

`attachPluginListDrag` 的落点推演按「等高连续兄弟」累加高度（`st.contentTop` + 各项 `offsetHeight` + `rowGap`）。
一旦把组头插进 `.plug-list` 的直接子节点里，这段累加就会从组头那里开始整体偏移 —— 而且**偏移是静默的**，
拖出来的顺序看着对、落库的不对。

所以这次**没有动拖拽器一行代码**，改成渲染侧适配它：`.plug-list` 的直接子节点变成一段一段的容器
（`.plug-seg` / `.plug-group`），每个容器的直接子节点正好是插件按钮，组头挂在容器外面。
代价是「跨卡片拖动」不支持 —— 换组走右键改色，这本来就是自动吸附该管的事。
收起的组不渲染成员，段容器只在展开时挂拖拽。

市场页用另一套办法：组头是 `grid-column: 1 / -1` 的一行，卡片仍留在同一个 `.market-grid` 里流式排布，
这样响应式列数只在 `.market-grid` 一处定义，不必每个组再抄一遍。

### 四、顺手修掉的一处语义歧义

「恢复默认名称与图标」原先调 `resetPluginOverride()`，那是**整条覆写记录一起删**。
分组色也存在这条记录里，于是改名后点它会顺手把人家的分组抹了。改为
`setPluginOverride(id, { name: "", icon: "" })`，只清这两项；置灰条件也跟着从
「整条记录为空」改成「name 和 icon 都没有」。整条删除只留给「删除插件」用。

### 五、踩到的坑

- ⚠️ **`.market-card-more` 的显示规则必须写在基础规则之后。** 基础规则是 `display: none`，
  把它配套的 `@media (max-width: 900px) { display: inline-flex }` 放在文件前半段（第 1528 行那个块里）
  完全不生效 —— 同特异性下后来者胜，跟媒体查询放哪没关系，只看谁在后面。
- ⚠️ **不要为了这个再开一个新的 `@media (max-width: 900px)` 块。**
  `scripts/test-ui-scale.mjs` 钉死了各断点出现的次数（900px 恰好 4 处），多一个块直接红。
  现成的落点是第 3411 行那个「Android / 窄屏插件中心」块，它本来就在基础规则之后。
- 侧栏组头的按钮必须用 `.nav .plug-group-*` 前缀写：深色侧栏基线 `.nav button:hover { color: #fff }`
  特异性是 (0,2,1)，不带 `.nav` 前缀的 `.plug-group-fold:hover` 打不过它，悬停会把文字刷成白色。

### 六、同版本打磨：修回归、补动效（并入 0.103.0，不另升版本）

一轮审查后的处理，过程与验证细节见 `docs/mcp-plugin-groups-optimization-v0.103.0.md`。

**修掉的问题**

| 问题 | 原因 | 处理 |
|---|---|---|
| 侧栏只剩 `cppu-notify` 的 1 个入口（它注册了通知 / 一卡通 / 教务四视图共 6 个） | `renderNav` 用 `new Map(pluginViews.map(...))` 按插件 ID 建单值表，后注册的视图覆盖了前面的 | 先按插件归拢全部视图，每段展开成该段插件的所有视图 |
| 段内拖拽可能把别的插件挤出 `pluginOrder` | 多视图插件的几个按钮 `data-plugin-id` 相同，回填时重复 ID 占掉别人的格子 | `saveSegmentOrder` 先按首次出现去重；被拖散时落位后再按插件归拢一次 |
| 上色会让没拖过序的插件整体洗牌 | `applyPluginColor` 以「`pluginOrder` + 注册顺序补尾」为底，而侧栏对未排序插件按标题排 | 以改色前的**显示顺序**为底（`currentPluginOrder()`），只有被改色的插件会挪 |
| 侧栏收放后插件中心还是旧状态 | 侧栏折叠钮只调了 `renderNav()` | 两边互相同步收放（`repaintMarket({ fold })` / `foldNavGroup`） |
| 插件中心冒出同名的第二个组头 | 已上色但没有视图（如已停用）的插件不在 `pluginOrder` 里，排到末尾自成一段 | 插件中心也按同色吸附（`normalizePluginOrder`） |
| 颜色段后面的未分组卡片挤进该组最后一行，看着像组员 | 组头是整行，组尾却不换行 | 回到未分组时插一条零高整行 `.market-group-end` 封口 |

**刷新范围**：改色、改组名、收放、整组换位、段内排序改走 `refreshPluginGroups()`，只重绘侧栏、
插件中心就地重排。原先走 `refreshPluginPresentation()` → `switchTo()`，会把当前插件页整个重挂
（插件内部状态丢失、联网插件重新拉数据），也会把插件中心滚回顶部、让全部卡片重播入场动画 ——
与 `scripts/test-nav-appearance.mjs` 守的「改名不许走 switchTo」是同一条原则。

**动效**

- 侧栏收起 / 展开：就地增删成员段并做高度动画（`motion.js` 的 `foldOpen` / `foldClose`），下方兄弟随布局跟走；
  箭头固定 chevron-down，收起态由 CSS 转 -90°。
- 整组 ↑/↓、上色吸附：侧栏与插件中心都走按 key 的 FLIP（`flipByKey`），插件从原位滑到新位，
  新出现的颜色卡片只淡入底色与描边；到顶 / 到底的 ↑/↓ 直接置灰，重绘后焦点还给同一个按钮。
- 插件中心收起：本组卡片先淡出（110ms），其余卡片 FLIP 补位；就地重排不重播入场动画、不动滚动位置。
- 收起的组里有当前页时，组头替它高亮（`.has-on`）。
- 折叠钮加 `data-motion="off"`：标题带「收起」会被全局按钮反馈当成关闭钮，松手播 3° 旋转回弹，
  整行宽的插件中心折叠钮会明显歪斜。
- WAAPI 动画一律先问 `reducedMotion()`；CSS 过渡由既有的全局减少动效规则压时长。

**侧栏拖拽的缩放修正**：浮起项的位置与尺寸、FLIP 位移、槽位推演的高度与间距一律按 `getUiScaleFactor()`
换算（与 `toolbarDrag.js` 同一口径），界面缩放不是 100% 时浮起项不再偏离指针、FLIP 起点不再跳。

**代码**：`normalizePluginOrder` 改为线性（每个 ID 只问一次颜色）；新增 `groupRuns()` 带色分段；
组记录写入收成 `updateGroupRecord()`；侧栏与插件中心共用 `groupFoldButton()`。

### 影响范围

- **Windows / Android**：改的是 `src/shell.js`、`src/pluginGroups.js`（新增）、`src/pluginAppearance.js`、`src/motion.js`、`src/styles.css`，
  两端共用同一套外壳代码，市场页分组与「⋯」入口在手机上直接生效。
- **微信小程序**：本次未做（用户选的范围是「桌面侧栏 + 插件市场（含手机端）」），小程序插件列表不分组。
- **数据**：无迁移。
- **测试**：新增 `scripts/test-plugin-groups.mjs`（色板校验 / 同色吸附幂等 / 整组移动 / 组名与收起 / 覆写表清理，共 40+ 条断言）；
  `scripts/test-plugin-sidebar-drag.mjs` 的两条断言跟着改了 DOM 形状（`.plug-list > button` → `.plug-seg > button`，
  并新增「组头必须挂在拖拽容器外」的约束）。打磨轮新增 `scripts/test-plugin-groups-motion.mjs`（线性吸附 / FLIP 位移与嵌套扣减 /
  折叠高度 / 减少动效短路 / 多视图保留 / 分组改动不走 switchTo / 拖拽缩放换算）。全量 80 个测试脚本通过。
- **未验证项**：侧栏 ↑/↓ 整组换位与段内拖动只在 Tauri 桌面窗口挂载（`isDesktopRuntime()` 在纯浏览器里恒 false），
  浏览器 dev 模式下没法点，需要在桌面构建里过一遍（含界面缩放不是 100% 时的拖拽）。
  打磨轮已在浏览器 dev 模式下用无头 Chrome 逐帧核对侧栏收放、插件中心收放与改色吸附，27 项检查全过。
