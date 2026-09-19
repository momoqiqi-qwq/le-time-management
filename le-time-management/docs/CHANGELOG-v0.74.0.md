# v0.74.0 · 插件界面的安全区收成一个负责人（上下左右四边）

## 需求

> APK 的插件开发必须专门做一个上下左右安全区，防止新的插件界面超出安全区。
> 记得把安全区写进插件开发文档里。

## 之前的状态：两条边有人管，两条边没人管

Android 是全面屏，`MainActivity` 已经把四个方向的 `WindowInsets` 注入成 `--sat / --sab / --sal / --sar`
（AGENTS.md 铁律四，因为 WebView 里 `env(safe-area-inset-*)` 恒为 0）。但**注入 ≠ 有人消费**：

| 边 | 之前谁垫 | 后果 |
|---|---|---|
| 上 `--sat` | 宿主 `.view`（`46px + --sat`，沉浸式 `2px + --sat`） | 已安全 |
| 下 `--sab` | 宿主 `.view`（`--nav-pad + --sab`） | 已安全 |
| 左 `--sal` | **没有人** | 横屏挖孔在左侧时插件内容被切掉 |
| 右 `--sar` | **只有课程表自己**（`.sg.bleed` 补了一遍） | 其他 14 个插件横屏照样被切 |

而且 `plugin-development.md`（唯一的插件 SDK 文档）**一次都没提过安全区** —— 新插件作者根本不知道该干什么。

## 改了什么

### 1. 四条边的唯一负责人 = 宿主 `.view`

`src/styles.css` 给 `.view` 补上左右两条（写在任何媒体块之外，横屏与宽屏都吃）：

```css
.view { padding-left: var(--sal, env(safe-area-inset-left, 0px));
        padding-right: var(--sar, env(safe-area-inset-right, 0px)); }
```

于是**新插件什么都不写就落在安全区内**。挂 `.view` 而不是 `.plugview`：沉浸式插件页会把
`.plugview` 的 padding 整条归零（`:820`），挂那儿必漏。桌面 / iOS 两端这两个 `var()` 都取不到值、
经 `env()` 兜底为 0 ⇒ 像素不变。

### 2. 收掉重复负责人

课程表 `.sg.bleed` 原来自己补左右（宿主不管时才不得不补），现在删成 `.sg.bleed{padding:0}`。
**留着就会双重计算** —— 与 `docs/CHANGELOG-v0.38.2.md` 那次「桌面端插件页底部凭空多出 86px 纯空白」同族。

### 3. 唯一拦不住的那类：`position:fixed`

fixed 的包含块是 `.view` 的 **padding box**（`.view` 上有 `will-change: opacity, transform`），
padding 划不出它的新边界。所以插件自建遮罩 / 弹层 / 菜单**只能自己让开四边**，本次一并修掉两处存量：

- `gx-news`：`.gx-mask` 内边距从 `16px` 改成四边各自「`16px + 安全区`」；`.gx-dlg` 的 `max-height:82vh`
  改 `min(82vh,100%)`（vh 不扣安全区，弹窗会比可视区高、底边被导航栏吃掉）。
- `school-notice`：右键菜单按视口坐标定位，夹取边界原来只 `Math.max(8, …)`，现在四个方向都读回
  `--sat/--sab/--sal/--sar` 再减（读法同宿主的 `bottomInsetPx()`）。

`web-collector` 本来就是对的，由既有断言继续钉住。

**第二轮全量审计**（19 个插件 JS 逐条过），又揪出两处：

- **课程表个性化抽屉只让了底、没让左右** —— `.sg .style-sheet` 是 `position:fixed;left:0;right:0` 的贴底抽屉，
  ≤900px 那条补了 `padding-bottom:var(--sab)`，但横屏时挖孔落在**左/右**，滑杆会被压住。
  已在基线规则补 `padding-inline:var(--sal,…) var(--sar,…)`；竖屏与桌面这两个变量都取 0，
  原作者实测过的「390×844 下抽屉 0..390 通栏」不受影响。
- **wechat-push 消息源多选面板按 `innerWidth - 12` 夹取** —— 视口的边不等于可视区的边，
  横屏时右半边能伸进挖孔。改成先读 `--sar`/`--sal` 再夹（推回量同时夹住左缘，不会顶穿左边）。

同时确认**无需改动**的几类：`position:absolute`（`.cx2-course`、`.sg .sem-col`、`.sheet-head` 等都有定位祖先，
本来就在宿主 padding 之内）、`position:sticky`（在 `.plugview` 滚动区内，够不到安全区）、
`100vh` 类（只有课表抽屉用 `calc(var(--ui-vh,100dvh) * .66)`，`--ui-vh` 是应用自己量的可视高度）、
`pomodoro` 里的 `body.append(`（那是个局部变量名，不是 `document.body`）。

### 4. 新守卫：`scripts/test-plugin-safe-area.mjs`

扫全部 19 个插件 JS（含课程表 / 考试日历的构建前模板），四条规则 + 两条宿主断言：

| # | 拦什么 | 本轮咬到的 |
|---|---|---|
| A | 裸 `env(safe-area-inset-*)`（没写成双路） | 0 处 |
| B | 非浮层规则再垫一遍（按选择器识别 `position:fixed`，媒体块不误伤） | `.sg.bleed` |
| C | 文件里有 fixed 浮层却一次没提宿主变量 | `gx-news`、`school-notice` |
| D | **逐条边**：fixed 面板钉了 `bottom:`/`inset:` 就得让开对应那条边 | `.sg .style-sheet` 缺左右 |
| E | 用 `innerWidth/innerHeight` 却没读安全区 | `wechat-push` |
| F | 挂进 `document.body`（彻底逃出宿主）却缺任一边 | 0 处（web-collector 四边齐） |

外加钉住本次修好的两条，以及宿主 `.view` 四条边齐备、`.plugview` 不参与（防被无声删掉）。
**规则本身也有锁**：一段故意写错的样本必须让四条规则全红、一段合规样本必须全绿（纯字符串判定
最容易在重构里悄悄变成"永远绿"，这条自检就是防那个）。

### 5. 文档（这次的重点之一）

- `public/plugins/plugin-guide/plugin-development.md` 新增 **§4.2 安全区（硬性要求）**：四变量含义与故障表、
  三条禁令、配方 A（CSS 浮层）、配方 B（JS 坐标定位浮层）、真机自检步骤；§6 发布前自检加一条。
  原 §4.2 其他建议顺延为 §4.3。
- `docs/index.html`（在线开发手册）新增 **「安全区（APK 必读）」** 一节 + 「发布前逐项过一遍」加一条。
- `AGENTS.md` 铁律四 新增小节「插件界面的安全区：宿主负责四条边，插件不许再垫」。
  顺带修了该小节一处**与代码矛盾的旧表述**：原文写「底部要 `max(systemBars.bottom, ime.bottom)`」，
  而 `MainActivity` 与 `test-android-layout.mjs` 明令 `--sab` **严禁掺 ime**（v0.49.0 黑屏根因）—— 照原文写就会撞断言。

## 影响哪端

- **APK**：可见变化只在横屏 / 侧边有挖孔或三键栏时；竖屏上下本来就被 `.view` 垫着，不变。
- **桌面（Win）**：像素不变（两个新 `var()` 都取 0）。
- **小程序**：不动。它的插件页根节点是 `.page-body`，微信原生实现了 `env()`，安全区本来就全覆盖。
- **数据迁移**：无。

## 为什么版本号是 0.74.0 而不是更早

树里 `0.73.0` 是另一条**未提交的在建工作**（`docs/CHANGELOG-v0.73.0.md`：学校通知站点设置收进图标菜单），
按铁律一「新增功能走 minor」不抢那个号，取高于当前树值的下一个 minor。

## 校验

```
node ../tools/sync-version.js --check        ✓ 三端版本一致：v0.74.0
node ../tools/gen-theme-dark.js --check      ✓
node ../tools/build-schedule-plugin.js --check  ✓
node ../tools/sync-android-native.js --check ✓
npm test                                     ✓ 59 个测试脚本全部通过
```
