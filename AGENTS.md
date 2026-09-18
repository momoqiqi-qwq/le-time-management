# AGENTS.md · AI 必读铁律

> 本文件是仓库的 **AI 协作规范单一事实源**（中文别名 `AI必读.md` 只是指向这里的短指针）。
> 任何 AI（或人）在本仓库动手之前，先读完这一页。
> 这些规则不是建议，是硬约束 —— 违反了产物版本会错乱、构建会挂。

---

## 🔴 铁律一：每次更新必须升版本号

**只要改动进入了产品代码，就必须同时升版本号。不允许出现「改了代码但版本号没动」。**

### 什么算「更新」

| 目录 / 文件 | 是否必须升版本 |
|---|---|
| `le-time-management/src/` | ✅ 必须 |
| `le-time-management/public/`（含插件清单、图标） | ✅ 必须 |
| `le-time-management/src-tauri/src/` | ✅ 必须 |
| `le-time-management/android/` | ✅ 必须 |
| `miniprogram/` | ✅ 必须 |
| `le-time-management/src-tauri/tauri.conf.json`（窗口 / 打包配置） | ✅ 必须 |
| `docs/`、`README.md`、注释、`.workbuddy/` 日志 | ❌ 可以不升 |

### 怎么升（三步，一步都不能少）

```bash
# ① 改唯一事实源
#    编辑 le-time-management/package.json 的 "version" 字段

# ② 同步三端
cd le-time-management && node ../tools/sync-version.js

# ③ 手工补 package-lock.json（脚本不覆盖它，见下方警告）
#    把 version 与 packages[""].version 两处一并改成新版本号

# ④ 校验必须通过
node ../tools/sync-version.js --check
```

### 版本号怎么选（语义化）

| 改动性质 | 版本变化 | 例子 |
|---|---|---|
| 修 bug、文案微调、样式修正 | patch +1 | `0.12.0` → `0.12.1` |
| 新增功能、界面调整、重构 | minor +1（patch 归零） | `0.12.0` → `0.13.0` |
| 不兼容的数据/接口变更 | major +1（minor、patch 归零） | `0.12.0` → `1.0.0` |

拿不准就选 minor。**不要跳号，不要用 `0.12` 这种两段式** —— 全项目是严格三段式 `X.Y.Z`，
历史从 `v0.3.0` 一路到 `v0.12.0`，两段式会让 `sync-version.js` 的正则失配。

### `sync-version.js` 覆盖与不覆盖的位置

**会自动同步**（改一处即可，其余由脚本写完）：

| 位置 | 内容 |
|---|---|
| `src-tauri/Cargo.toml` | `version` |
| `src-tauri/Cargo.lock` | `letime` 包的 `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `miniprogram/core/appMeta.js` | `version` |
| `src-tauri/gen/android/app/tauri.properties` | `versionName` + `versionCode` |
| `src-tauri/gen/android/app/src/main/res/values/strings.xml` | `app_name`（跟 productName 对齐） |
| 仓库根 `README.md` | 若存在「版本：vX.Y.Z」行 |

**不会同步，必须手工处理**：

- ⚠️ **`package-lock.json`** —— 脚本完全不管。漏改会导致 lock 与 `package.json` 长期脱节
  （实测曾停在 `0.11.2` 而 `package.json` 已到 `0.11.6`）。要改
  `version` 与 `packages[""].version` **两处**。

> 📌 关于 `tauri.conf.json`：**它有 `version` 字段，且脚本会同步它**
> （旧版本的本页曾写「这里通常没有 version 字段，不用管」—— 那是错的，
> v0.46.0 发布时实测 0.45.1 → 0.46.0 被脚本改写）。
> Tauri 2 运行时确实以 `Cargo.toml` 为准，但配置文件里这个字段仍然存在、会被写，
> 所以看 `git diff` 时见到它别当异常。

### ⚠️ Android `versionCode` 不要手改

它由 `sync-version.js` 从版本号算出：

```
versionCode = major * 10000 + minor * 100 + patch
```

`0.12.0` → `1200`，`0.12.1` → `1201`，`0.13.0` → `1300`。
手改会和 `versionName` 对不上，装到手机上会被系统当成同一个包或直接拒绝升级。

### 配套：版本说明也要写

升版本时顺手补 `docs/CHANGELOG-v<新版本>.md`（历史 `v0.3.0` → `v0.11.6` 每个版本都有一份）。
内容写「改了什么、影响哪端、有没有数据迁移」。

---

## 🔴 铁律二：改完版本必须跑校验

```bash
cd le-time-management
node ../tools/sync-version.js --check   # 必须输出 ✓ 三端版本一致：vX.Y.Z
node ../tools/gen-theme-dark.js --check # 主题深色变体与 styles.css 是否同步
node ../tools/build-schedule-plugin.js --check # 课程表插件 main.js 是否与 model.js + ui.js 同步
node ../tools/sync-android-native.js --check   # Android 原生 Kotlin 与清单声明是否进到 gen/android
npm test                                # 必须全部通过（脚本数会变，看最后一行 PASS: N 个测试脚本全部通过）
```

任何一项失败都**不要**继续构建 —— 拿着一个版本不一致的树去打包，产物会带错版本号。

### 改了「事实源」，必须重跑对应生成器

仓库里有几处是**生成物**，手改了会被下次生成覆盖，而改了事实源不重跑会被测试拦下：

| 事实源 | 生成器 | 产物 |
|---|---|---|
| `public/plugins/<id>/manifest.json` | `node tools/sync-plugins.js` | 桌面 `src/pluginCatalog.js`、小程序 `core/pluginCatalog.js`、插件图标副本 |
| `public/plugins/shiguang-schedule/` 的 `model.js` + `ui.js` | `node tools/build-schedule-plugin.js`（`--check` 只校验） | 插件入口 `main.js`、`adapters/cppu.js`。**课程表插件只认 `main.js`，直接改它等于白改** |
| `public/plugins/exam-calendar/` 的 `src/main.template.js` + `src/exam-data.json` | `node tools/build-exam-calendar-plugin.js`（`--check` 只校验） | 插件入口 `main.js`（80 条考试数据在构建时内嵌）。**改数据只改 `src/exam-data.json`，不要动 `main.js`** |
| `package.json` 的 `version` | `node tools/sync-version.js` | 三端版本号（**不含** `package-lock.json`，要手改两处） |
| `src/styles.css` 的主题令牌 | `node tools/gen-theme-dark.js` | `src/styles/theme-derived.css`、`src/themeDarkPreview.js` |
| 插件图标清单 | `python tools/gen-plugin-icons.py` | 桌面 + 小程序插件 PNG、`ATTRIBUTION.md` |
| `le-time-management/android/gradle/` 的原生 Kotlin + 清单声明 | `node tools/sync-android-native.js`（`--check` 只校验） | `src-tauri/gen/android/` 里的 Kotlin、AndroidManifest 权限、`file_paths.xml`。**该目录 gitignored，`tauri android init` 会整个重建 → 手机端功能静默消失** |

**主题配色的分层**：`src/styles.css` 手写浅色 → `tools/lib/theme-tokens.js` 按 WCAG 反解派生深色 →
`theme-derived.css`（生成物）。所以**每套主题在深色模式下都有自己的一套色板**，
「深色模式」与「主题」是两个正交属性：`data-theme`（主题）+ `data-theme-mode`（解析后的 light/dark）。
CSS 里凡「深色才生效」的规则一律用 `[data-theme-mode="dark"]`，**不要写 `[data-theme="night"]`**。
详见技能 `letime-theme-tokens`。

---

## 🔴 铁律三：这些标识符永远不许回退

品牌已从「潮衡 / TideBalance」改名为「Le时间管理 / Le」。**外部交付包、历史快照、
旧插件里全是改名前的值，照抄就会砸构建。**

| 项 | 必须是 | 不许变成 |
|---|---|---|
| Tauri identifier / Android applicationId | `com.yile.letime` | `com.yile.tidebalance` |
| Cargo 包 / lib 名 | `letime` / `letime_lib` | `tidebalance` / `tidebalance_lib` |
| Android gradle buildSrc 包目录 | `com/yile/letime` | `com/yile/tidebalance` |
| 本地存储键 | `letime-data` | `tidebalance-data` |
| 前端包名 | `le-time-management` | `tidebalance` |

**唯一的例外**：插件 API 的全局名 `tide`（`src/pluginHost.js` 用 `new Function("tide", ...)` 注入，
插件侧现有 **308 处 `tide.*` 调用、分布在 14 个文件**，对外文档也依赖它）。
**刻意保留，不要"顺手改对"** —— 改了就是所有插件全废。

---

## 🔴 铁律四：构建注意

- **Win 与 Android 的构建脚本绝不能并行跑。** 两者开头都会 `vite build` 写 `dist/`，
  而 Rust 侧把 `dist/` 编进二进制 —— 并行会产出半截资产。必须串行。
- **不要用 `npm run tauri android build`**，Windows 中文路径下会坏。用：
  ```bash
  bash build-windows.sh --bundles nsis,msi        # Windows
  bash scripts/build-android-apk.sh all           # Android，all = aarch64 + x86_64
  ```
- **不要用 `cargo clean` 做"保险"**，白等十几分钟，脚本自己已经处理了 linker 与路径问题。
- **`src-tauri/gen/` 是生成目录**（gitignored）。改了 `tauri.conf.json` 的 identifier 或
  productName 后必须重新 `tauri android init`，否则包名目录、Theme 名、`lib*.so` 名全对不上。

### 🔴 安全区：Android WebView 不认 `env(safe-area-inset-*)`

**这条会反复踩，写死在前面。**

`MainActivity` 调了 `enableEdgeToEdge()` ⇒ 状态栏/导航栏变成**透明浮层**盖在 WebView 之上，
按 Android 约定应用必须自己消费 `WindowInsets`。而 **WebView 里
`env(safe-area-inset-*)` 取值恒为 0**，`viewport-fit=cover` 写了也没用。

⇒ 任何「贴顶/贴底」的布局（顶栏、底栏、抽屉、吸底输入框、toast）**不能裸用 `env()`**，
必须走双路：

```css
/* 对 */  padding-top: var(--sat, env(safe-area-inset-top, 0px));
/* 错 */  padding-top: env(safe-area-inset-top, 0px);   /* 手机上 = 0，直接压状态栏 */
```

四个变量 `--sat / --sab / --sal / --sar` 由 `MainActivity` 读真实 `WindowInsets` 后注入
（详见类注释）。改这一块时注意：**四方向都要取**（横屏挖孔在侧边）、
底部要 `max(systemBars.bottom, ime.bottom)`、`onPageFinished` 得**补注入一次**
（新文档会重置内联样式）。

> ⚠️ **`:root` 里绝不要给 `--sat` 等写"兜底默认值"。** 变量一旦在 `:root` 被定义为有效值，
> `var()` 的**第二个参数永远不会生效** —— iOS / 桌面的原生 `env()` 会被彻底废掉。
> 这条有回归断言守着（`scripts/test-android-layout.mjs`），别绕过它。

---

## 🔴 铁律五：合并外部交付包要分层，不要整体覆盖

外部交付包是「三端分目录快照」（`01-windows/app` + `02-android` + `03-miniprogram` + `tools`），
**本仓库永远是 `le-time-management/` + `miniprogram/` + 根 `tools/`，不是这个结构。**

- 应用层（`src` / `public` / `miniprogram` / 测试）可以取包。
- 配置与构建基建层**一律保留仓库版**，只吸收内容增量（否则铁律三全线崩）。
- 包**还缺** `src/migrations.js`、`src/themeProfiles.js`、`src/pluginMarket.js` ——
  取包时会连人带测试一起消失，必须从备份补回。
- 包里的测试脚本用交付包布局路径（`../app/src/...`），落到仓库里必报 `ENOENT`，
  要改回 `../src/`、`../public/`、`../src-tauri/`。

详见技能 `letime-overlay-merge`（含源码包 ↔ 工作区的逐目录映射表，
以及「哪些文件必须保留仓库版、只合并新增内容」的清单）。

---

## 一句话总结

> **改代码 = 改版本号。** 改完 `package.json` → 跑 `sync-version.js` → 补 `package-lock.json`
> → `--check` 通过 → 才能构建。
