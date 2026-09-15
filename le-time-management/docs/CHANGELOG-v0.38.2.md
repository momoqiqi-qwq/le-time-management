# Le时间管理 v0.38.2

> 上一版：v0.38.1（修 Windows 编译错误）
>
> 本版含**三处**改动（同处一棵未提交的树，共用 0.38.2 这个版本号）：
> ① 插件页底部空白收窄（下面这节）；② 课程表「我的」设置条目加图标（文末「附」）；
> ③ 顶栏标题左侧小框删除（文末「附二」）。

## 本版内容

**收掉插件页底部一大片纯空白，让课程表下方的小字贴近底栏。**

### 问题：插件页底部白占 86px

手机端课程表页，网格下面的两行小字（操作提示 + 出处署名）离底栏很远，
中间空出一大片什么也没有的区域。

实测（390×844，浅色/深色一致，320/360/412 同样）：

| 盒子 | top | bottom |
|---|---|---|
| `.schedule-grid` | 139 | 694.7 |
| `.schedule-note`（小字） | 700.7 | 718 |
| `.sg footer`（署名） | 738 | 758 |
| `.plugview` | 54 | 782 |
| `.view.page-r` | 54 | 844 |
| `nav`（底栏） | 794 | 840 |

署名底部到视口底部有 **86px**，而底栏只占 794→844 —— 中间约 36px 全是空白。

### 根因：安全区被算了两遍（两个独立来源）

**① `.view` 与 `.plugview` 各留了一次底部空间**

```css
/* src/styles.css:576  —— 已为底部导航预留 */
.view { padding-bottom: calc(var(--nav-pad, 62px) + var(--sab, env(safe-area-inset-bottom, 0px))); }
/* src/styles.css:981  —— 又叠了一次 18px + 同一个 sab */
.quad-wrap, .plugview, .market, .set-wrap { padding: 14px 14px calc(18px + var(--sab, env(...))); }
```

`.plugview` 是 `.view` 的子节点，`.view` 的 `padding-bottom` 已经把「底栏 + 安全区」
让出来了，`.plugview` 再垫一层 ⇒ **`--sab` 双重计数，外加 18px 纯多余**。
这是结构性浪费，与屏幕宽度无关（320/360/390/412 实测数值完全相同）。

**② 课程表插件自己的底部间距偏大**

```css
.sg footer { margin-top: 18px; padding-top: 11px; ... }   /* → 10px / 8px */
```

### 修法

三处窄屏/基础 padding 的底部收窄，让 `.view` 独自负责预留导航与安全区：

```css
/* 窄屏（≤620px 断点与 ≤760px 断点） */
.plugview { padding: 14px 14px 2px; }
.quad-wrap, .plugview, .market, .set-wrap { padding: 14px 14px 2px; }
/* 宽屏基础规则 */
.quad-wrap, .plugview, .market, .set-wrap { padding: 20px 22px 8px; }
```

配套把课程表插件的间距调紧（`public/plugins/shiguang-schedule/ui.js`，
**生成物 `main.js` 已随之重建**）：

| 位置 | 旧 | 新 |
|---|---|---|
| `.sg footer` `margin-top` / `padding-top`（基础） | 18px / 11px | 10px / 8px |
| `.sg footer` `margin-top`（≤620px） | 8px | 6px |
| `.sg .schedule-note` `margin`（≤620px） | 5px 2px 0 | 4px 2px 0 |

**效果**：署名底部到视口底部 **86px → 70px**；小字到署名 **20px → 18px**；
四个宽度 × 浅色/深色 八种组合数值完全一致，无溢出。

> 保留的 70px 是**必要的**：底栏 46px（standard 档）+ 安全区 + 网格余量。
> 再往下压就会让小字被底栏盖住或紧贴。

### 顺带修正了宽屏布局

宽屏（>900px）底栏是**左侧竖栏**、不占底部，`24px` 的底部内边距纯属浪费；
`.plugview` 宽屏底部改为 `8px`。

### 不会造成遮挡（已实测）

`.market` 这类**可滚动**容器，内容底边本来就会低于底栏，这是正常且正确的
（`.view` 的 62px 预留保证最后一项滚得到）。实测插件市场滚到底：
最后一张卡片底边 780，底栏顶边 791 ⇒ **净余 11px，无遮挡**。

## 影响面

- **Windows / Android**：插件视图容器（课程表、插件市场、四象限、设置）底部间距统一收窄。
- **课程表插件**（3.4.0 → 3.4.1）：「我的」7 个设置条目加主题色图标；`main.js` 已重建。
- **顶栏**：标题左侧的 42×42 应用图标小框删除（全部视图），标题卡边框保留、内边距改左右对称。
- **微信小程序**：不受影响（不涉及 `styles.css`），版本号随三端同步至 0.38.2。
- 无数据结构变更，无需迁移。

## 校验

- `node ../tools/sync-version.js --check` ✓ 三端版本一致 v0.38.2
- `node ../tools/gen-theme-dark.js --check` ✓ 派生调色板已同步（15 套深色变体）
- `node ../tools/build-schedule-plugin.js --check` ✓ 生成物与 `ui.js` 一致
- `node ../tools/sync-plugins.js --check` ✓ 12 个内置插件三端同源
- `node scripts/test-android-layout.mjs` ✓ 含 `--sat / --sab` 安全区回归断言
- `node scripts/run-tests.mjs` **28 个测试脚本全部通过**

---

# 附：课程表「我的」设置条目加图标（同一批次的另一处改动）

「我的」里的 7 个设置条目原先只有「标题 + 说明 + ›」，没有任何视觉锚点，
和旁边的「课程管理」列表、课表卡片混在一起不好扫读。现在每条左侧加一个与设置页
分类导航同款的主题色图标。

| 条目 | 图标（Font Awesome solid） |
|---|---|
| 课程管理 | `list-ul` |
| 课表管理 | `table-cells-large` |
| 时间与学期 | `calendar-week` |
| 个性化配置 | `palette` |
| 教务导入 | `school` |
| 备份与恢复 | `box-archive` |
| 同步到时间块 | `arrows-down-to-line` |

### 实现要点

- 图标复用**打包内**的 FA solid 精灵，根绝对路径 `/icons/fontawesome/solid.svg#<name>`
  —— 与设置页分类导航（v0.37.11）同一份、同一种写法，不新增资源、不引第三方字体。
  插件侧**没有 `tide.ui` 图标 API**（只有 `registerView` / `registerTaskAction`），只能内联 `<use>`。
- 样式走主题变量（`--sg-accent` = `--deep`）：
  `32×32` 圆角盒子 + `8%` 强调色底 + `8px` 内边距（字形实际 16px），悬停加深到 `16%`。
  **没有任何硬编码色值**，深色模式由主题派生自动跟随。
- **布局必须跟着改**：条目原先是「文字 + `›`」两段撑开的
  `justify-content: space-between`；插进图标就成了三段，**中间那段会被挤到正中**。
  改为 `justify-content: flex-start` + 文字块 `flex: 1; min-width: 0`，`›` 才回到右端。
- 图标刻意用 `<svg>` 而不套 `<span>`：上面那条 `.settings-item span` 会把任何 span
  刷成 11px 灰字。整个结构里只有 `<use>` 一个新增节点。

### 验证（无头 Chrome 真视口 + 真 CSS）

| 视口 / 主题 | 条目 | 横向溢出 | 逐元素越界 | 空白图标 | 图标与行未居中 |
|---|---|---|---|---|---|
| 390×844 浅色 | 7 | 0 | 0 | 0 | 0 |
| 390×844 night 深色 | 7 | 0 | 0 | 0 | 0 |
| 390×844 ocean 深色 | 7 | 0 | 0 | 0 | 0 |
| 390×844 frost 深色 | 7 | 0 | 0 | 0 | 0 |
| 1280×900 浅色 / 深色 | 7 | 0 | 0 | 0 | 0 |

- **「空白图标」是真测出来的**，不是靠肉眼看截图：`<use>` 指到不存在的 symbol 是
  **静默失败**（不抛错、不触发 `onerror`、console 无输出），所以探针读
  `use.getBoundingClientRect()` —— 7 个图标全部拿到 12.4~16px 的非零字形盒，
  说明精灵里的 symbol 真的解析到了。
- 几何：图标盒 32×32、字形居中偏移 8~9px、`iconCenterY === itemCenterY`（垂直居中）、
  文字右缘 335.67 / 条目右缘 370（`›` 仍在右端）、行高 64px。
- 对比度（图标色 vs 图标盒的合成底色）：浅色约 9:1；深色 night 4.52:1、
  ocean 4.20:1、frost 4.15:1 —— 均高于 WCAG 非文字图形 3:1 的下限。

### 测试守卫

`scripts/test-schedule.mjs` 新增一节（7 条断言）：条目数 = 7、图标数 = 7、7 个图标不重复、
**每个图标名都要在 `public/icons/fontawesome/solid.svg` 里找得到 `<symbol id>`**、
必须是根绝对路径（禁相对路径）、布局必须是 `flex-start` + 文字块 `flex:1`、
图标规则必须含 `fill:currentColor` 且不含硬编码色值。

插件版本 3.4.0 → **3.4.1**；`main.js` 由 `tools/build-schedule-plugin.js` 重建，
`sync-plugins.js` 已同步三端 catalog。

**断言有效性用变异测试验过（4/4 被拦下）**：把 `palette` 改成不存在的 `pallete`
→「精灵里没有 pallete 这个 symbol」；整条删掉 `justify-content:flex-start` 重排规则
→「加图标后条目要改 flex-start」；去掉图标块的 `width/height` →「图标盒子要有固定尺寸」；
去掉 `fill:currentColor` →「不给 currentColor 会渲染成纯黑」。验完已还原（`ui.js` 逐字节一致）。

---

# 附二：顶栏标题左侧的小框已删除

用户对着顶栏截图说「不要小框了【删除小框】，直接把插件名写在 2 横线之间」。

### 删了什么

`.topbar-title-mark` —— 标题卡左侧那颗 **42×42 圆角小框**（窄屏 32×32），
里面固定装着 `appIcon("quadrant")`，也就是 Le 的四象限应用图标。
它跟当前插件没有任何关系：插件页顶着「课程表」的标题，左边却是 Le 的应用图标，属于噪音。

- `src/shell.js`：标题卡里那颗 `<span class="topbar-title-mark">` 整个去掉，
  结构简化成 `.topbar-title-card > .topbar-title-copy > (h1 + .sub)`。
- `src/styles.css`：`.topbar-title-mark` 与 `.topbar-title-mark .app-icon` 两组规则
  （桌面 + ≤760px 各一组）一起删；标题卡内边距由 `padding-right:16px`（当年是给小框配平用的）
  改成左右对称的 `padding: 8px 16px` / 窄屏 `4px 12px`。
- `docs/plugin-icons.md` 的「渲染尺寸」表里那一行标为已删（否则文档还在教人给小框调图标尺寸）。

**标题卡自身的边框与底色保留** —— v0.37.15「框太多」那次只针对右侧工具卡，
左侧标题卡是它的对照组（见 `test-android-layout.mjs` 的原注释）。

### 实测（无头 Chrome，真 CSS）

| 视口 | 视图 | 小框 | 顶栏高 | 标题卡 | padding | 卡在顶栏内居中 | 横向溢出 |
|---|---|---|---|---|---|---|---|
| 1280 | 课程表（插件） | 已无 | 54px | 81.5 × 41 | 8px 16px | ✓ | 0 |
| 1280 | 时间块（核心） | 已无 | 54px | 159.9 × 57 | 8px 16px | ✓ | 0 |
| 390×844 | 课程表 | 已无 | 54px | 273.9 × 31 | 4px 12px | ✓ | 0 |

副标题照旧：插件页无副标题（只有名称），核心页两行（`时间块` + `· 把任务装进一天的格子`）。
截图对照：`output/preview/topbar-compare-{1280,390}.png`（A/B 两种做法并排）。

> **顺带量到一个既有隐患（本次未改）**：1280 下核心页标题卡实测 **57px**，而顶栏是 **54px**
> —— 卡片上下各溢出约 1.5px，视觉上会压过顶栏那两条横线。这在本次改动**之前就存在**
> （那时卡片高 58px：小框 42px + 上下内边距 16px），删掉小框后只从 58 降到 57，没解决。
> 要修得给标题卡减内边距或收紧 `h1`/`.sub` 行高 —— 属于顶栏整体尺寸的事，留给下一轮。

### 测试守卫

`scripts/test-android-layout.mjs` 新增一节：DOM 里不得再出现 `topbar-title-mark`、
`styles.css` 不得再有 `.topbar-title-mark` 规则（含 `.app-icon` 那条）、
标题卡内边距必须**左右对称**。

> 内边距那条断言第一版是**假断言**：只读 `padding:` 简写，而 `padding: 8px 12px` 配一条
> `padding-right: 16px` 就是不对称的 —— 简写本身看着完全正常，变异测试当场漏过。
> 改成把简写与 `padding-left/right` 长写合并算出实际左右值后才拦得住。
> **变异测试 4/4 被拦下**（加回 DOM / 加回 CSS / 补 `padding-right` / 只改 `padding-left`）。

