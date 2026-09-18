# v0.52.2 变更说明

> 发布日期：2026-09-18
> 版本类型：patch（侧栏插件行「两字折行 + 插件徽标竖排」修复）
> 影响端：桌面 ≥901px 侧栏（深浅主题同理）；移动端 ≤900px 该列表本就隐藏，不受影响。
> 数据：无迁移。

## 症状（用户截图）

插件视图侧栏里：

1. 名称**两个字就折行**（「网页收集」→「网页 / 收集」、「课程表」→「课程 / 表」）；
2. 「插件」徽标**有的行竖排**（「插」在上「件」在下），有的行正常横排。

## 根因（实测复现，不是猜的）

无头 Chrome 几何探针（真实 `styles.css` + 真实 navBtn DOM，212/204px 与字号 1.0/1.25 四档）：

| 行 | 有没有 Alt 快捷键徽标 | 表现 |
|---|---|---|
| 网页收集 / 课程表 / 学校通知网站 / 番茄专注 / 竞赛消息 / 学习通 / 考试日历 | **有** | 标签折行（lbH 38~57px）+ 徽标竖排（pvH 34px） |
| 周度报告 / 警大通知 / 微信推送 / 中国节假日 / 插件使用说明 | 没有 | 完全正常 |

**只有分到快捷键字母的行坏** —— 真凶是 `.nav-kbd` 徽标（「Alt+W」小片）：
它平时 `opacity: 0` 隐形，**但 opacity 不移出布局，仍然占着 ~45px 行宽**。
侧栏 212px 本就只剩 ~135px 给「标签 + 插件徽标」，再被隐形徽标吃掉 45px，
CJK 文本的 `min-content` 又只有 1 个字宽 ⇒ flex 一压缩就逐字断行、徽标竖排。
没分到字母的行没有这个节点，所以完好 —— 这就是「有的行好有的行坏」的原因。

（旧注释写着「不挤占常驻空间」，实现用了 opacity —— 意图与实现不符，这次是让实现兑现意图。）

## 改法（`src/styles.css`）

| 件 | 改前 | 改后 |
|---|---|---|
| `.nav .nav-kbd` | 文档流内 `opacity:0`，占位 ~45px | `position: absolute; right: 8px` 悬浮行尾，`pointer-events: none`，底色改不透明（盖住底下叠着的「插件」徽标） |
| `.nav button` | 无定位上下文 | 加 `position: relative` |
| `.nav button .lb` | 基线无规则（可折行） | `min-width:0; nowrap; ellipsis` 单行省略 |
| `.nav .pv-count` | 可被 flex 压缩 | `flex: none; white-space: nowrap` 永不折行 |

悬停 / 选中 / 聚焦时「Alt+X」悬浮片盖在「插件」徽标的位置上，不再挤压任何布局。

改后探针：四档配置（212px、204px 紧凑、字号 1.25 等）**折行 0、竖排徽标 0、横向溢出 0**。

## 测试

- `scripts/test-plugin-shortcuts.mjs` 新增 v0.52.2 回归守卫：kbd 必须 `position: absolute`
  且不得出现 `margin-left`（回文档流即回归）、`pointer-events: none`、`.lb` 单行省略、
  `.pv-count` `flex:none + nowrap`。变异测试 4/4 拦下（回文档流 / 恢复拦截点击 /
  删 nowrap / 删 flex:none 各验一次）。
- 全量 `run-tests.mjs` 通过（见当次构建记录）；`sync-version --check` 等四项检查全过。
- 截图：`output/preview/nav-plug-rows-before-fix.png`（复现）→
  `nav-plug-rows-after-fix.png` / `nav-plug-rows-after-fix-3cfg.png`（修复，三配置全高）。

---

## 新：四象限卡片拖拽排序（高级交互 · Drag-to-Reorder）

> 用户点名使用「高级交互 skills」的 2. Drag-to-Reorder 拖拽排序动画，并强调「这里一定要添加拖拽动画」。

### 改法

| 件 | 位置 | 行为 |
|---|---|---|
| `moveTaskRelative(dragId, overId, before)` | `src/store.js` | 拖拽落点写回：把任务移到相邻任务前/后。**懒回填 order**——本象限同完成态首次拖拽才给整组写 `order`（0..n-1），老数据无感、无迁移；只允许「同象限 + 同完成态」换位，跨组调用是 no-op |
| `tasksOfQuad` 排序升级 | `src/store.js` | `done`（完成沉底）→ `order`（显式顺序，无则 `Infinity` 落回原 due 规则）→ `due`，三层键 |
| 指针拖拽模块 `attachListDrag(list)` | `src/views/quadrant.js` | 桌面按住移动 ≥6px 即拖；触屏**长按 240ms** 进入（期间移动 >8px 视为滚动意图取消），进入时 `navigator.vibrate(10)` 触觉反馈 |
| 拖拽动画（用户点名要有） | 同上 + `styles.css` | ① **幽灵卡**：被拖卡克隆 `drag-ghost` 跟随指针（scale 1.03 + 深阴影）；② **FLIP 让位**：拖过邻居时其余卡片用 WAAPI 从旧位置平滑滑到新位（180ms）；③ **落位接续**：松手写回 store 重渲染后，新卡从幽灵落点 `animate` 平滑接位（200ms） |
| 手势让路 | quadrant.js + shell.js | 拖拽会话置 `body[data-swipe-suspended=1]`，滑动返回的 touchend 检查后让路（拖拽横移会满足 56px 阈值，不拦会把「拖完松手」误判成返回）；清除延迟 80ms——**pointerup 先于 touchend 发出**，立即清会漏掉同一次触摸 |
| 长按守卫 | quadrant.js | 拖拽会话置 `body[data-drag-reorder=1]`，卡片 contextmenu 守卫之（触屏长按进入拖拽后浏览器 ~500ms 会补发 contextmenu） |
| 键盘可达 | quadrant.js | 聚焦卡片 `Alt+↑/↓` 重排（与拖拽同一条 store 路径），焦点回到被移动卡片支持连续按键；跨完成态边界忽略 |
| reduced-motion | 全程 | `reducedMotion()` 时：不建幽灵卡、FLIP/接位动画短路（CSS 端另有 `prefers-reduced-motion` 兜底） |

### 关键设计点

- **完成沉底语义不破坏**：UI 插入槽 clamp 在「与拖拽卡同完成态」的连续区间内，store 再兜一层（跨组 no-op）。
- **点按不冲突**：卡片是 `<button>`，click 打开详情抽屉照旧；拖拽激活需移动超阈值 / 长按，快速点击零影响。
- **外部刷新安全**：`renderList` 先 `dragCtl.cancel()`（按启动时 DOM 顺序复原）再重建，拖拽中插件改数据不会留孤儿引用。
- 动画只用 transform，深浅主题通用，`gen-theme-dark.js --check` 不受影响。

### 验证中抓到并修掉的问题（真浏览器探针，CDP 真实指针序列）

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 拖拽进行中插入槽判定跳位（让位动画进行中落点乱跳） | `computeSlot` 逐卡读 `getBoundingClientRect()`，FLIP 动画进行中 rect 含残余 transform | 改几何推演：beginDrag 时缓存每卡 `offsetHeight` + 列表 `rowGap` 递推各卡中线，仅列表自身 top 读一次 rect |
| 2 | 拖拽落点与松手前 DOM 序不一致 | `moveTaskRelative` 的 seq 排序键比 `tasksOfQuad` 多一个 `createdAt` 尾键 → 懒回填 order 的基准 ≠ 渲染序 | 删掉尾键，两处排序键严格一致（done→order→due） |
| 3 | 指针在列表区域外松手，会话挂死（幽灵卡不消失、顺序不落库） | `setPointerCapture` 失败时，列表外松手的 pointerup 不会冒泡回 list | document 捕获阶段 `docUp`/`docCancel` 兜底（endDrag/cancel 幂等，双触发无害），会话结束经 `detachDoc` 摘除 |

三个坑均已固化成 `test-drag-reorder.mjs` 静态守卫，不许回潮。

### 影响端

- 桌面 + Android（共用 WebView）：✅。数据：无迁移（`order` 缺省时行为与旧版完全一致）。

### 测试

- 新增 `scripts/test-drag-reorder.mjs`：store order 语义 / 拖拽三段动画 / swipe 让路与延迟清除 / 长按守卫 / 键盘重排 / reducedMotion 短路 / computeSlot 几何推演 / document 兜底，共 40+ 条静态断言 + 行为面真跑（实调 `moveTaskRelative`：懒回填 / 前后插 / 跨组拒绝 / 新任务沉组尾）。
- 真浏览器探针（无头 Chrome CDP `Input.dispatchMouseEvent` 真实指针序列）17/17 检查全过：阈值内点按不误拖、幽灵卡几何与 dragging 态、DOM FLIP 让位、松手落库 + localStorage 持久化 + 刷新后仍在、swipeSuspended 存活期与延迟清除、不误开详情抽屉。
- `scripts/test-back-nav.mjs` 追加：touchend 必须检查 `swipeSuspended`。

## 新：插件管理批量勾选错落动画（高级交互 · Staggered Bulk Selection）

| | 改前 | 改后 |
|---|---|---|
| 全选/取消全选 | 修改 Set 后**整页 `rerender()`**（设置页全部分区重建 + 滚动位置弹回） | **就地翻勾选框**（直接改 `input.checked`）+ 状态变化的卡片按 `--bi` 错落延迟（45ms 递增）逐个弹起 + `paintToolbar()` 刷新工具栏 |

- 动画：卡片 `plug-bulk-pop`（横移微弹 0.42s）+ 勾选框本体 `plug-bulk-check`（scale 1.35 回弹 0.3s），动画类 `animationend` 即摘 + `setTimeout(1200)` 兜底；连续点击全选 `void offsetWidth` 重启动画。
- 隐藏卡（搜索/筛选后）状态照翻但不出动画；`reducedMotion()` 时整段短路（CSS 端另有 `prefers-reduced-motion` 兜底）。
- 全选范围仍 = 全部插件（内置 + 用户），v0.48.0 语义不变；卡片新增 `data-pid` 供循环定位。
- 与既有「单个勾选不重建整页」优化（v0.48.0 批次四）同一条路线：现在全选也不重建了。

### 影响端

- 桌面 + Android（共用 WebView）：✅。数据：无变化。

### 测试

- 新增 `scripts/test-bulk-select-motion.mjs`：全选不重建 / 就地翻勾 / `--bi` 错落 / 动画类即摘与兜底 / 隐藏卡与 reducedMotion 短路 / data-pid，共 15+ 条静态断言。
- 真浏览器探针 11/11 检查全过：全选后 120ms 抓帧 14/14 已勾选且 14/14 带 `bulk-pop`、`--bi` 0/45/90ms 递增、计数器「已选 14/14」与工具栏删除键禁用态同步；取消全选可逆。

## 新：左下角深浅色快捷切换按钮

> 用户需求：「在左下角添加1个深色浅色切换按钮，要有和设置-主题里面的切换按钮一样的动画」。

### 改法

| 件 | 位置 | 行为 |
|---|---|---|
| `createThemeToggle()` | `src/shell.js` | 在 `.rail-bottom`（桌面端左侧栏底部 / 移动端底栏左侧）设置按钮**上方**新增一颗深浅色切换按钮。深色时显示 ☀ 太阳（点切浅色），浅色时显示 ☾ 月亮（点切深色） |
| 动画复用 | 同上 | 点击调用 `setThemeMode(next, { animate: true })`，走的是与设置 › 主题切换按钮**完全相同**的路径：`applyTheme` → `runThemeMutation` → View Transitions 圆形揭示（从按钮点击位置向外扩散）；不支持 VT 的环境降级为 `.theme-transitioning` 全元素过渡 |
| 图标刷新 | 同上 | `MutationObserver` 驱 `documentElement.data-theme-mode` 刷新图标 —— 覆盖「跟随系统」时系统亮暗翻转的场景，用户点按钮、系统切换都自动同步 |
| 样式 | `src/styles.css` | 按钮共享 `.settings-icon-button` 尺寸（桌面 40×40 图标钮 / 移动底栏列式钮），FA SVG 图标 `.fa-ic` 单独给尺寸（桌面 18px / 移动 15px） |

### 影响端

- 桌面 + Android（共用 WebView）：✅。数据：无变化（`themeMode` 仍存 `settings.themeMode`）。
- 移动端沉浸式外壳（上下栏收起）时按钮不可见，需呼出 ⋮ 菜单后可见 —— 与设置按钮行为一致。

## 改：插件快捷键改按「中文名首字母」自动分配

> 用户需求：「快捷键使用插件，按 Alt + 中文首字母」。

### 症状（改前）

自动字母取自**插件 ID 首字母**，而 ID 是英文 —— 侧栏写着「课程表」徽标却是 `Alt+S`（shiguang-schedule）、
「番茄专注」是 `Alt+P`（pomodoro），看标签根本猜不到。更糟的是 14 个内置插件里
**6 个连字母都没有**（ID 首字母撞车：`c`/`p`/`s`/`w` 各被两个插件抢）。

### 改法

| 件 | 位置 | 行为 |
|---|---|---|
| `pinyinInitialOf(text)` | **新增** `src/pinyinInitial.js` | 汉字 → 拼音首字母。表是**生成物**（22 KB，只收 GB2312 常用字 6768 个，全表 69 KB 太占 bundle）；解析函数手写：跳过前导标点/emoji，首个英文字母直通（`"AI 助手"` → A），生僻字返回空串 |
| `tools/gen-pinyin-initial.js` | **新增** | 用 pinyin-pro 生成上面的表，注入标记区，支持 `--check`。与 `gen-chaoxing-pinyin.js` 同源不同用（那个给搜索用、收全表） |
| `autoShortcutCandidates(entry)` | `src/pluginShortcuts.js` | 候选顺序：**中文名首字母 → 插件 ID 首字母**。撞车试下一档，全被占才空手 |
| `pluginShortcutEntries()` | **新增** `src/pluginShortcutEntries.js` | 三处（侧栏徽标 / 设置页回显 / 命令面板）共用的取数口径，保证同一插件在三处算出同一个字母 |

### 为什么保留「插件 ID 首字母」这一档

中文拼音首字母只有 23 个（无 i/u/v），内置插件就有 5 组撞车。只按中文名分配会让一批插件
**彻底没有快捷键 —— 比改规则前还差**。留着 ID 兜底，保证「有字母的插件不会变少」。

名字取**显示名**（带用户重命名覆盖）而不是 manifest 原名：改名成「计时器」后侧栏写「计时器」、
徽标却是原名给的 `Alt+F`，看着像 bug。跟着显示名走，改名后字母跟着变，三处仍然一致。

### 实测（真浏览器 + 真插件加载，dev server 5175 + 无头 Chrome CDP）

| 判据 | 结果 |
|---|---|
| 侧栏徽标 14 行 | 全对：课程表 K / 番茄专注 F / 学校通知网站 X / 轮换值日 L / 竞赛消息 J / 拖入消息收纳 T / 插件使用说明 P / 网页收集 W / 考试日历 E / 学习通 C / 周度报告 Z；警大通知 · 微信推送 · 中国节假日 无（两档候选都被占） |
| 真实按键 11 次 | 全对：`Alt+K/F/X/L/J/T/P/W/Z/C` 都跳到预期插件 |
| 设置页 vs 侧栏 | 14/14 逐行一致（防取数漂移） |
| 重命名「番茄专注 → 计时器」 | 字母跟着显示名走：计时器 → `Alt+J`，被顶掉的「竞赛消息」退回 ID 字母 `Alt+G`；侧栏与设置页仍一致 |

改前 6 个插件没有快捷键 → 改后 3 个；8 个插件的字母变得能一眼猜到，且**没有任何插件失去原有字母**。

### 测试

- `scripts/test-plugin-shortcuts.mjs`：新增拼音解析（15 个真实插件名 + 前导标点/emoji/英文/生僻字/null）、
  候选顺序与去重、撞车退回 ID、两档全占才空手、取数口径唯一（三处都必须用 `pluginShortcutEntries()`，
  且不许再各自拼裸 entries）等 40+ 条断言。
- 变异测试 9/9 全部拦下（丢拼音档 / 丢 ID 兜底 / 只试首候选 / 撞车不跳过 / 去重被删 /
  不跳前导标点 / 去英文直通 / 多音字后到者胜 / entries 丢 name），跑完已还原并回读确认。
- 全量 `npm test` 45 个脚本通过；四项 `--check` 全过。

### 影响端

- 桌面（键盘快捷键只在桌面生效）：✅。Android 无 Alt 键，不受影响。数据：无迁移
  （`settings.pluginShortcuts` 显式字母照旧，用户手设的字母优先级不变）。
- 唯一的行为变化：**改了插件显示名，自动字母会跟着变**。想钉死就用设置页输入框显式指定（显式永远优先）。

## 新：示例插件 example-plugin（插件开发文档的「第 0 参考实现」）

> 用户需求：「做一个示例插件放到插件开发文档哪里，图标{示例}2字」。

### 改动

| 件 | 位置 | 内容 |
|---|---|---|
| 示例插件本体 | `public/plugins/example-plugin/`（新增） | manifest.json + main.js 两个文件、无框架无构建。六张演示卡片全部真调用：① storage 私有存储（visits 计数）② tasks.create（宿主盖 sourcePlugin 印章）③ parseWhen + blocks.createSmart（一句话变日程，冲突自动挪档）④ notify 带 actionLabel 动作按钮 ⑤ events 订阅真实 pomodoro:finished + 自发 example-plugin:ping ⑥ 子页面栈（开发文档 4.1 返回按钮契约的参考实现） |
| 印章图标管线 | `tools/gen-plugin-icons.py` | 新增 `TEXT_ICONS`：81×81 圆角渐变朱红底 + 白字竖排堆叠（「示/例」，msyhbd.ttc），确定性输出（重生成 sha 不变，`--check` 可校验）；`example-plugin` 落地双端 PNG，ATTRIBUTION.md 台账改版（区分 Icons8 素材与代码绘制素材） |
| 插件目录 | `src/pluginCatalog.js` + `miniprogram/core/pluginCatalog.js` | sync-plugins.js 重生成：15 个内置插件（新增 example-plugin，order 98、platforms windows/android=full、miniprogram=unavailable） |
| 在线手册 | `docs/index.html` | 范例章节新增「第 0 个 · 可跑的完整示例」六卡片对照表；修正三处与现实矛盾的过期表述：图标章节从 v0.11.6「iOS Filled CDN」整段改写为「随包 Color PNG 管线 + TEXT_ICONS 文字图标」（解析链按现 `appIcon()` 重写、渲染尺寸按现 styles.css 实测更新）；「permissions 不是运行时闸门」改为运行时闸门（`requirePermission` 抛错）；三处 `BUILTIN_IDS` 引用改为 sync-plugins.js 生成目录的现流程。另：能力 chips 补 sound/schoolImport/vault、排错表新增权限闸门报错行 |
| 离线手册 | `public/plugins/plugin-guide/plugin-development.md` | 头部 v0.9.x → v0.52.x + 闸门说明 + 示例插件指引；§1 补 order/platforms 字段；§4.1 指向示例插件参考实现；§5 安全说明按现模型重写；尾注 repo URL 修正（tidebalance → le-time-management） |

### 过程中抓到的问题

| # | 问题 | 处理 |
|---|---|---|
| 1 | 「示例」两字图标不能走代码渲染路线 | 图标系统全是 `<img>` PNG 管线（`appIcon()` 直读随包文件），且 sync-plugins.js 硬性要求每插件有 mini PNG → 扩展 gen-plugin-icons.py 用 Pillow 画印章 PNG，与既有管线零特例兼容 |
| 2 | gen-plugin-icons.py `--offline` 在导航图标阶段退出（`grid-2` 缓存缺失） | 插件图标 15 个已全部写入未受损；联网补跑一次补齐缓存并重写两份台账（quadrant 候选生效 `four-squares`，候选机制工作正常） |
| 3 | 示例 main.js 自查两处 | registerView 里 `show(...)` 旧调用与 renderHome 新签名不匹配（改 `show(renderHome)`）；`say()` 用 textContent 却传入 `esc()` 转义串——教学文件不能示范错误用法，已去掉 |
| 4 | 首进视图只显示 "undefined" | `renderHome` 改为「自建容器返回」后**漏写 `return root`**，`show()` 把 undefined append 成文本 —— 真应用截图抓到，补 return 后 6 卡片全渲染 |
| 5 | ⑥ 号卡「子页」按钮报 `stack is not defined`，返回按钮不出现 | `stack` 原是 `render()` 局部变量，首页卡片（renderHome）访问不到 —— 栈提升到 IIFE 顶层、进视图时 `stack.length = 0` 重置；修后「← 返回」契约真机可走通 |
| 6 | 六卡片渲染成功但没有「卡片」观感 | 头注释声称的 `.ep-card/.ep-row/.ep-out` 样式类实际**没写样式**（ensureStyle 只有 .ep-btn 动效）—— 补齐卡片底/圆角/虚线结果区/按钮基础外观（CSS 变量 + 浅色兜底，深浅主题通用） |

> 截图验证全过：侧栏印章行（含 Alt+S 悬浮徽标）、六卡片渲染、子页「← 返回」、市场印章卡片、
> storage 计数 1→2 真写回、events 自发 ping 带载荷收回 —— 无头 Chrome CDP 真实交互，
> `output/preview/example-plugin-{sidebar,view,subpage,market}.png`。

### 影响端

- 桌面 + Android（共用 WebView）：✅ 示例插件随包可用。小程序端 unavailable（小程序本就没有插件宿主）。
- 数据：无迁移（新插件首次启用按默认状态写入）。

### 测试

- `test-plugin-permissions.mjs` 自动发现新插件（15 个），manifest 声明与实际调用逐一对账通过。
- `gen-plugin-icons.py --check` OK；`sync-plugins.js` 15 个同步成功、三端图标同源。
- 截图目检：`output/preview/example-plugin-*.png`（侧栏印章图标 / 插件视图六卡片 / 市场卡片）。

## 修：exam-calendar 构建链回收本仓库（原产物无法从源头重新生成）

> 背景：`public/plugins/exam-calendar/main.js` 头部一直写着「⚠ 这个文件是构建产物，不要直接改。
> 改 `src/main.template.js`，然后跑 `tools/build.mjs`」—— 但仓库里**既没有 `src/`，也没有
> `build.mjs`**（`find` 实测为空）。构建链只存在于外部的 exam-collector 采集项目里。
> 后果：这个 1952 行的产物无法从源头重新生成 —— 而其中 1142 行（58%）是内嵌的 80 条考试数据，
> 要更新数据只能手改产物，偏偏产物头顶的警告还在告诉后来者「不要直接改」。

### 改动

| 件 | 位置 | 内容 |
|---|---|---|
| `src/exam-data.json` | `public/plugins/exam-calendar/`（新增） | 从产物里抽出的 80 条考试数据（34 KB） |
| `src/main.template.js` | 同上（新增） | 模板，数据处留 `__EXAM_DATA__` 占位符（39 KB） |
| `tools/build-exam-calendar-plugin.js` | 仓库根（新增） | 模板 + JSON → `main.js`，`--check` 只校验不写盘。风格对齐既有 `build-schedule-plugin.js` |
| `scripts/test-exam-calendar.mjs` | 新增 | 接入 `npm test`：同步守卫 + 反向提取产物内嵌 DATA 并 parse / 比对条数 + 占位符正反面 + manifest 入口契约 |

### 产物等价性（关键验证）

重建后的 `main.js` 与改前**逐字节等价**，唯一差异是头部注释那 2 行（改为指向真实存在的路径）：
`git diff --numstat` = `2 insertions, 1 deletion`。1142 行数据 + 800 行逻辑全部原样还原。

⇒ 运行时行为零变化，**无数据迁移**。

### 行尾陷阱（已处理）

仓库 `core.autocrlf=true` 且没有 `.gitattributes`，别人 clone 时 `main.template.js` 与 `main.js`
会被一起检出成 CRLF，而 `JSON.stringify` 只吐 LF。构建脚本因此**跟随模板的行尾**而非固定 LF ——
否则在 CRLF 机器上会拼出「模板段 CRLF + 数据段 LF」的混合行尾，`--check` 永远误报。

### 测试

- 构建链变异 4/4 拦下：改数据源 / 改模板 / 手改产物 → `--check` 失败；CRLF 检出环境 → 仍通过。
- 测试脚本变异 4/4 拦下。其中**变异构建脚本自身**时 `--check` 依然通过（两边用同一套坏逻辑生成），
  只有「反向提取 DATA 并比对条数」那条断言发现产物已坏 —— 证明它不是摆设。
- 五项 `--check` 全过；`npm test` 46 个脚本通过。

### 影响端

- 桌面 + Android：✅（产物等价）。小程序端该插件为 `native` 实现，不受影响。
- `AGENTS.md` 生成物索引表已补该条目。

## 改：插件导航标签按来源显示「内置 / 导入」

> 用户需求：「把右边插件标签改为{内置}，导入的就【导入】」。

### 症状（改前）

侧栏「插 件 视 图」列表里，**每一个插件行右侧都写着同一个「插件」** ——
分不清哪些是随包内置、哪些是用户自己导入的。

### 改法（`src/shell.js`）

`navBtn(id, isPlug)` 里右侧那颗 `pv-count` 徽标原本是硬编码字符串，改为按 registry 的 `source` 取值：

| source | 显示 |
|---|---|
| `builtin` | **内置** |
| 其他（`external`，用户导入） | **导入** |
| registry 尚未建好等异常态 | 回落「插件」（保持原有兜底文案） |

`getRegistry()` 在 shell.js 里本就已导入，无新增依赖；徽标样式（`.nav .pv-count`）沿用不改，
两个字的宽度与「插件」一致，无布局影响。

### 影响端

- 桌面 + Android：✅（共用 WebView）。移动端 ≤900px 该列表本就隐藏，不受影响。
- 数据：无迁移。
