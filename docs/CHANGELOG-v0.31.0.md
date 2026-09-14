# Le时间管理 v0.31.0

## 改了什么

### 一、修复：深色模式下切换主题没有任何变化

现象（用户反馈）：切到深色模式后，在设置里点其他主题，界面**一动不动**。

根因在 `src/theme.js`：旧实现里「想要深色」被直接翻译成了「用 night 主题」——

```js
// 旧逻辑（已删）
if (wantsDark) return "night";
```

于是 `data-theme` 永远被写成 `night`，用户点「深海蓝 / 樱花粉 / 蜜柑汽水」全被吞掉，页面上唯一的深色就是夜间护眼那一套。**「换主题」在深色模式下等于没换。**

**改法**：给**每一套主题都生成自己的深色变体**，深色模式下 `data-theme` 保留用户选的主题 id，由 `data-theme-mode="dark"` 去命中该主题的深色色板。

- **`tools/lib/theme-tokens.js`**（新增）：主题令牌派生规则的单一事实源。导出 `deriveDark()`（浅色 → 深色）、`toneForContrast()`（按 WCAG 门槛反推可用色调）、`contrastRatio()` / `relativeLuminance()` / `rgbToHsl()` / `hslToHex()` 等纯函数，以及 `renderDerivedCss()` / `renderPreviewModule()` 两个渲染器。
- **`tools/gen-theme-dark.js`**（新增）：读 `src/styles.css` 里 16 套主题的浅色令牌 → 派生深色变体 → 写 `le-time-management/src/styles/theme-derived.css` 与 `src/themeDarkPreview.js`。支持 `--check`（校验生成物与事实源一致）、`--report`（打印每套主题的对比度表）。
- **`src/styles/theme-derived.css`**（新增，生成物）：`--bg` / `--paper` / `--panel` / `--ink` / `--ink-2` / `--ink-3` / `--line` / `--deep` / `--sea` / `--coral` / `--sun` / `--grape` / `--mint` / `--q1..q4` 各自成对给出深色值，并按 `:root[data-theme="<id>"][data-theme-mode="dark"]` 生效。**15 套非深色主题全部覆盖**，night 是原生深色主题不参与派生。
- **`src/theme.js`**：拆成两层 —— `data-theme` 记用户选的主题（`themePref` 记显示模式偏好），`data-theme-mode` 记**解析后的** `light` / `dark`，同时写 `color-scheme`。新增 `resolveThemeMode()` 处理「跟随系统」与 `resolveTheme()` 返回最终生效的组合；`setThemeMode()` 切模式、`setTheme()` 切主题。跟随系统的 `matchMedia` 监听在系统切换时重算并带过渡动画。

### 二、修复：浅色模式下也有文字"贴"在背景上

同一份生成器顺带做**浅色兜底**：`--ink-2` 门槛 4.5:1、`--ink-3` 门槛 3.0:1，不达标的主题由 `toneForContrast()` 就地调深，达标的不动。

实测有 **15 套主题**的次级 / 弱化文字原本不达标，例如经典主题 `--ink-2` 只有 **3.5:1**、`--ink-3` 只有 **2.2:1**（WCAG AA 正文要求 4.5:1、大字号 / 辅助信息 3.0:1）。另外 `chatgpt` / `claude` / `citrus` / `frost` 的主色 `--deep` 当文字用时也不达标（最低 `citrus` 4.0:1），一并修正。

### 三、新增令牌 `--on-deep` / `--on-accent`，替代硬编码白字

原来「主色 / 强调色当按钮底」的地方一律写死 `#fff` 文字。深色变体里主色普遍被调亮（classic `--deep` 从 `#0F4C5C` 变成 `#21A7CA`），白字压上去反而看不清。

现在按钮上的文字统一取 `var(--on-deep)` / `var(--on-accent)`：浅色主题里解析为近白，深色变体里解析为深色墨（如 classic 深色 `--on-deep: #122226`），保证 4.5:1 / 3.0:1 以上。`src/styles.css` 中所有 `--deep` / `--sea` / `--coral` / `--ec` / `--q*` 上的 `#fff` 已全部替换。

### 四、新增 `--danger` 令牌，修掉深色下"红字糊在深色面板上"

顺着同一条线索审计 `styles.css` 里所有「硬编码文字色 + 主题化背景」的组合（共 17 处），发现 5 处真实的深色对比度缺陷 —— 全是写死的红字压在会随主题变深的面板 / 弹出层上：

| 位置 | 原来 | night / 深色面板上 |
|---|---|---|
| `.btn.danger`（清空已完成等） | `color:#B03535` + 白底硬编码 | 白底在深色下极其刺眼，未跟随主题 |
| `.plug-info .perr`（插件市场报错） | `color:#B03535` | **约 1.9:1** |
| `.popmenu button.warn`（「重置为默认图标」） | `color:#B03535` | **约 1.9:1** |
| `.plugin-context-item.danger`（插件右键菜单「移除」） | `color:#c24141` | **约 1.4:1** |
| 同上 hover 底色 | `color-mix(#c24141 9%, var(--panel))` | 与文字同色系，几乎无层次 |

**改法**：新增语义令牌 `--danger`，由生成器按各主题的深色面板**反解亮度**（目标 5.0:1）产出，一并写进 `theme-derived.css`。

- `src/styles.css` 的 `:root` 里 `--danger: #B03535`（与原来的浅色取值完全一致，浅色观感不变）。
- night 是原生深色主题、不参与派生，所以在它自己的色板块里显式给出 `--danger: #EF8A84`（对 `#1C2833` 为 6.1:1）。**这一步不能漏** —— 漏了 night 会继承 `:root` 的暗红。
- 上面 5 处全部改用 `var(--danger)`，底色用 `color-mix(in srgb, var(--danger) N%, var(--panel))`，`.btn.danger` 因此跟着主题走（深色下从"刺眼白药丸"变成低亮度红底）。

实测（classic 深色面板 `#2D2922`）：`#B03535` **2.35:1 →** `#E27B7B` **5.06:1**。

### 五、深色规则改为按模式生效，不再绑死 night

`src/styles.css` 里输入控件、插件兼容层的深色覆盖，选择器从 `:root[data-theme="night"] …` 改成 `:root[data-theme-mode="dark"] …`，这样「跟随系统变深色」或「任意主题 + 深色」都能命中，不会漏。测试里有源码守卫断言：除 night 自身色板外，**不允许再出现只对 `data-theme="night"` 生效的深色规则**。

### 六、设置页「外观」调整

- 模式三选一（跟随系统 / 浅色 / 深色），选中态即时生效并提示"已切换为深色模式（当前 深色）"。
- 主题卡片的色块会**跟着当前模式显示对应色板** —— 深色模式下看到的是该主题的深色预览色（来自 `themeDarkPreview.js`，与 `theme-derived.css` 同源），所以选主题前就能看出"这个主题的深色长什么样"。
- 说明文案补上"每套主题都有自己的深色配色，深色模式下换主题同样会变"。

## 影响哪端

桌面端（Windows / Android）与小程序三端共用的 `themeProfiles.js` / `theme.js` 只有桌面端消费，小程序侧不受影响（小程序不加载 `styles.css`）。

## 新增校验

- **`tools/gen-theme-dark.js --check`** —— 生成物与事实源一致性。
- **`scripts/test-theme-contrast.mjs`** —— 16 套主题 × 浅/深两套色板：
  - 覆盖率：非 night 主题都必须有深色变体，且令牌齐全（缺了就是"换主题没反应"）。
  - 对比度门槛：`--ink` ≥ 7、`--ink-2` ≥ 4.5、`--ink-3` ≥ 3.0、`--deep` ≥ 4.5、`--danger` ≥ 4.5（均对 `--panel` 与 `--bg` 双向），9 个强调色当文字 ≥ 4.5，`--on-deep` / `--on-accent` 当按钮文字 ≥ 4.5 / 3.0。
  - 深浅真实性：深色 `--bg` 相对亮度 < 0.06、`--panel` < 0.10；浅色 `--bg` > 0.6。
  - **可区分性**：15 套深色变体的 `bg|deep` 指纹必须互不相同（否则"换主题等于没换"）。
  - 源码守卫：`theme.js` 不许再 `return "night"` 兜底；必须写 `data-theme-mode`；`styles.css` 里**不许再出现硬编码的 `#B03535` / `#c24141` 文字色**，右键菜单与弹出菜单的告警项必须用 `var(--danger)`。
  - `deriveDark()` 纯函数性：同输入同输出。

测试脚本数 15 → **16**，`npm test` 全部通过。

## 怎么自查

```bash
cd le-time-management
node ../tools/gen-theme-dark.js --check   # 派生调色板与 styles.css 是否同步
node ../tools/gen-theme-dark.js --report  # 打印 16 套主题的浅/深对比度表
npm test                                  # 16 个测试脚本
```

改了 `styles.css` 里任何一套主题的浅色令牌后，**必须重跑 `node tools/gen-theme-dark.js`**，否则 `--check` 与 `npm test` 都会失败（这条已经由测试守住，不会静默漂移）。

## 数据迁移

无。`settings.themeMode` 是新增字段，旧数据缺失时 `normalizeThemeMode()` 归一为 `"system"`（旧用户升级后表现为跟随系统，与直觉一致）；`settings.theme` 沿用原值，不涉及 state schema 版本与本地存储键。
