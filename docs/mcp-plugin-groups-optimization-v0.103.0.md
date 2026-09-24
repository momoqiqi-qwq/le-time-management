# 插件颜色分组 · 代码与动效优化（v0.103.0）

查看日期：2026-09-24。

范围：v0.103.0 尚未提交的「插件颜色分组」改动 —— `le-time-management/src/shell.js`、
`le-time-management/src/pluginGroups.js`、`le-time-management/src/pluginAppearance.js`、
`le-time-management/src/styles.css` 及对应测试。目标由用户选定为「流畅度 + 观感 + 代码质量」，
改动并入 0.103.0，不另升版本（`docs/CHANGELOG-v0.103.0.md` 第六节）。

## 结论

分组的数据模型（`settings.pluginOverrides[id].color` + `settings.pluginGroups`）与同色吸附语义是对的，
问题集中在三处：

1. **侧栏渲染丢视图**：多视图插件只剩最后一个入口 —— `cppu-notify` 注册了 6 个视图，侧栏只显示 1 个，
   连主入口「警大通知」都不见了。这是本轮最严重的问题。
2. **刷新范围过大**：改色、改组名走 `switchTo()`，当前插件页会被整个重挂，插件中心滚回顶部、全部卡片重播入场。
3. **没有过渡**：收放、整组换位、上色吸附全是整段重建，画面瞬间跳变。

## 一、审查发现

### 1. 功能问题

| # | 问题 | 位置 | 原因 |
|---|---|---|---|
| 1 | 多视图插件在侧栏只剩最后一个视图 | `le-time-management/src/shell.js` 的 `renderNav` | `new Map(pluginViews.map((pv) => [pv.pluginId, pv]))` 按插件 ID 建单值表，后注册的覆盖先注册的；v0.102.0 是逐个视图渲染，没有这个问题 |
| 2 | 段内拖拽可能把别的插件挤出 `pluginOrder` | `saveSegmentOrder` | 同一插件的多个按钮 `data-plugin-id` 相同，回填时重复 ID 占掉别人的格子 |
| 3 | 上色让没拖过序的插件整体洗牌 | `applyPluginColor` | 以「`pluginOrder` + 注册顺序补尾」为底；侧栏对未排序插件按标题排，两者不同 |
| 4 | 侧栏收放后插件中心状态过期 | 侧栏折叠钮 | 只调 `renderNav()`，没通知插件中心 |
| 5 | 插件中心出现同名的第二个组头 | `renderMarket` 的卡片排序 | 已上色但没有视图的插件（如已停用）不在 `pluginOrder` 里，排到末尾自成一段 |
| 6 | 颜色段后面的未分组卡片挤进该组最后一行 | 插件中心网格 | 组头是整行（`grid-column: 1 / -1`），组尾不换行 |

### 2. 流畅度

- 改色 / 改组名走 `refreshPluginPresentation()` → `switchTo(activeView)`：插件页 `view.replaceChildren()` 后重新
  `render`，插件内部状态丢失，联网插件会重新拉数据；插件中心整页重建，滚动位置归零、每张卡片重播
  `market-card-enter`。颜色与组名只出现在侧栏和插件中心，完全不需要重挂视图。
- 插件中心的组收放同样整页重绘卡片，每点一次所有卡片都重播入场。
- 侧栏拖拽（`attachPluginListDrag`）直接把视觉像素写进 transform 与宽高。项目用 `html.style.zoom`
  做界面缩放，`getBoundingClientRect` 与指针坐标是缩放后的视觉像素，transform 用的是元素自身的 CSS 像素；
  缩放不是 100% 时浮起项会偏离指针、FLIP 起点会跳。`le-time-management/src/toolbarDrag.js` 已经按
  `getUiScaleFactor()` 换算，侧栏这份没跟上。

### 3. 观感

- 收放与整组换位瞬间跳变；折叠箭头靠整颗换图标（chevron-right / chevron-down）。
- 全局按钮反馈（`le-time-management/src/motion.js` 的 `isCloseControl`）把标题含「收起」的折叠钮认成关闭钮，
  松手播 `motion-close-button-release`（最大 `rotate(3deg)`）；插件中心的折叠钮是整行宽，
  一转两端歪出去二十多像素，按下的 `scale(.965)` 也会让整条缩一截。
- 收起的组里如果有当前页，侧栏里就看不到任何「当前在哪」的提示。

### 4. 代码质量

- `normalizePluginOrder` 是 O(n²)：每个上色插件都把整列再扫一遍，`colorOf`（一次覆写表查询）被调用 O(n²) 次；
  它在每次重绘、每次改色都要跑。
- 「当前完整顺序」`normalizePluginOrder(orderedPluginViews().map(...), pluginColor)` 在三处各写一遍。
- 侧栏组头与插件中心组头的折叠钮结构相同，写了两份；`renameGroup` / `toggleGroupCollapsed` 的写库逻辑重复。

## 二、改动

### 刷新范围

新增 `refreshPluginGroups()`：只重绘侧栏（FLIP 过渡），插件中心若挂着就就地重排（`renderMarket` 注册的
`repaintMarket`，没挂着时什么都不做）。改色、改组名、收放、整组换位、段内排序全部改走它。
`refreshPluginPresentation()` 保留给改名 / 换图标（标题栏确实要换字）。

### 动效设计

| 场景 | 做法 | 为什么这样选 |
|---|---|---|
| 侧栏收起 / 展开 | 就地增删成员段，`foldOpen` / `foldClose` 做高度 + 透明度动画 | 收起的成员不渲染（测试钉住的 `collapsed ? null : plugSegNode(views)`），接不上 CSS transition；侧栏只有几十个节点，逐帧重排可以接受，下方兄弟随布局自然跟走，不必再 FLIP |
| 整组 ↑/↓、上色吸附 | `flipByKey`：按 key 记旧位置 → 整段重建 → 同 key 的新节点从旧位置滑到新位置 | 侧栏与插件中心都是「状态 → 整段重建」，节点身份每次都换，只能认 key；只动 transform，由合成层完成 |
| 插件中心收起 | 本组卡片 `fadeAway`（110ms）→ FLIP 补位 | 网格里没有可以做高度动画的组容器；先离场再补位，读起来是「收进去、再合拢」 |
| 插件中心展开 | 直接 FLIP，本组卡片按 enter 淡入并轻微错落 | 同上 |
| 折叠箭头 | 固定 chevron-down，`.collapsed .fold-chev { transform: rotate(-90deg) }` 带过渡；插件中心组头是重建节点，由 `turnChevron()` 用 WAAPI 补转 | 状态反馈落在箭头上，替代被关掉的按钮回弹 |

`flipByKey`（`le-time-management/src/motion.js`）的几个细节：

- **嵌套扣减**：最近的 key 祖先已经在走的位移要从子节点里扣掉，否则随颜色卡片整体移动的插件会走两遍。
- **缩放换算**：位移除以 `getUiScaleFactor()`，与 `toolbarDrag.js` 同一口径。
- **连点不跳**：快照取的是含进行中 transform 的视觉位置，连点 ↑/↓ 时从半路接着走。
- **新颜色卡片**：只淡入底色与描边（`navFlipEnter`），整卡淡入会把里面本来就在的插件也闪一下。
- **越界裁切**：飞进 / 飞出颜色卡片的插件会越过卡片边界，FLIP 期间给 `.nav` 挂 `nav-flip`，
  放开 `.plug-group` 的 `overflow`。
- **减少动效**：`reducedMotion()` 为真时只执行 mutate；CSS 过渡由既有的全局规则压时长。

其余观感改动：到顶 / 到底的 ↑/↓ 置灰；整组换位重绘后焦点还给同一个按钮，插件中心收放后焦点还给新的折叠钮；
收起组含当前页时组头高亮（`.has-on`）；折叠钮 `data-motion="off"`；颜色段封口 `.market-group-end`；
色点加 `:focus-visible` 描边。

### 代码结构

- `le-time-management/src/pluginGroups.js`：`normalizePluginOrder` 线性化；新增 `groupRuns()`（带色分段，
  `groupSegments` 与 `moveGroupInOrder` 都基于它）；`updateGroupRecord()` 统一组记录写入。
- `le-time-management/src/shell.js`：`currentPluginOrder()`；`groupFoldButton()` / `groupMoveButton()`；
  `toggleNavGroup` / `foldNavGroup`（只动 DOM、不碰状态，侧栏与插件中心共用）；`paintCards({ flip })` 与 `fillCards`。
- `le-time-management/src/motion.js`：`flipByKey`、`foldOpen`、`foldClose`、`fadeAway`。

## 三、验证

| 项 | 结果 |
|---|---|
| VS Code 诊断（`le-time-management`） | 0 错误 / 0 警告 |
| `node ../tools/sync-version.js --check` | ✓ 三端版本一致：v0.103.0 |
| `node ../tools/gen-theme-dark.js --check` | ✓ 派生调色板已同步（15 套深色变体） |
| `node ../tools/build-schedule-plugin.js --check` | ✓ shiguang-schedule 生成物与源一致 |
| `node ../tools/sync-android-native.js --check` | ✓ Android 原生代码与版本化镜像一致 |
| `npm test` | PASS：80 个测试脚本全部通过 |
| 无头 Chrome 逐帧质检 | 27 / 27 项通过 |

新测试 `le-time-management/scripts/test-plugin-groups-motion.mjs` 做过反向验证：放到原版代码上会红
（「同色吸附每个 ID 只问一次颜色」「侧栏必须按插件归拢全部视图」）。

逐帧质检的做法：在 1433 端口起 vite dev，无头 Chrome 预置三组颜色，触发操作后把在播的动画暂停并定位到指定毫秒，
截图并量元素位置。关键数值：

- 侧栏收起：卡片高度 122 → 54（90ms）→ 34；第 0 帧高度不跳；下方兄弟 413 → 325。
- 侧栏展开：34 → 117（110ms）→ 122，结束后不残留内联 `height` / `overflow`。
- 插件中心收起补位、上色吸附：FLIP 第 0 帧元素位置与操作前**零偏差**，中段位于起止之间。
- 减少动效：收放产生 0 个 WAAPI 动画，状态照常生效；控制台无报错。
- `cppu-notify` 的 6 个视图全部回到侧栏。

质检脚本在 `output/mcp-plugin-groups-qc/qc.mjs`（`/output/` 已被 `.gitignore` 忽略，不进仓库），
重跑方法：`cd le-time-management && npx vite --port 1433 --strictPort --host 127.0.0.1`，另开终端 `node output/mcp-plugin-groups-qc/qc.mjs`。

## 四、未做与建议

1. **未排序插件的默认顺序两处不一致**：侧栏按标题排（`orderedPluginViews`），插件中心按 manifest 的 `order` 排。
   第一次写入 `pluginOrder`（第一次拖拽或上色）时，其中一边会整体重排一次 —— v0.102.0 的拖拽就有这个现象。
   本轮保证侧栏稳定（对应第一节「只有被改色的那几个会挪」），插件中心那次重排现在是平滑过渡而不是跳变。
   根治需要二选一统一默认顺序，属于产品决策，未改。
2. **桌面构建里过一遍**：整组 ↑/↓、段内拖动、界面缩放不是 100% 时的拖拽跟手，只在 Tauri 桌面窗口挂载，
   浏览器 dev 模式点不到。
3. `le-time-management/src/shell.js` 里的 `movePluginBefore` 已经没有调用方，可以删掉。
4. FLIP 只补位置不补尺寸：插件飞进颜色卡片时宽度会瞬间窄 8px（卡片左右内边距），刻意不用 `scaleX`（会压扁文字）。
5. 已知遗留、与本轮无关：浏览器兜底存储键仍是 `tidebalance-data`（`le-time-management/src/api.js`），
   `tools/gen-architecture-diagrams.js` 已经标注。
