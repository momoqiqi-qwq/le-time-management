# v0.38.0 · 应用内一键更新（Windows / Android）

本次主线是**应用内自动更新**：启动静默检查 → 发现新版在左下角弹升级通知 → 一键下载安装，
桌面端静默重装并自动重启，Android 交给系统安装器。**不需要签名密钥。**

提示条上是三个动作：**立即升级** / **稍后** / **忽略此版本**；是否弹这个通知由
**「设置 › 关于 › 软件更新」**里的开关控制（连同「启动时自动检查更新」一起放在关于页）。

发布源是公开仓库 `momoqiqi-qwq/le-time-management` 的 GitHub Releases；
产物命名必须保持 `LeTime-<版本>-x64-setup.exe` 与 `LeTime-<版本>-universal.apk`。

无数据迁移，不影响既有存储结构。

---

## 一、为什么自建而不用 `tauri-plugin-updater`

官方插件要求每个更新包带**签名**（`tauri signer generate` 的私钥 + 内嵌公钥），
发版流程变成「构建 → 归集产物 → **签名** → 上传」，而且**私钥丢了就再也发不了更新**。

本项目的发布是「脚本手工归集产物 → 传 GitHub Releases」，刻意不加这道密钥工序。
所以走自建：`reqwest` 直接打 GitHub Releases API —— `reqwest` 本来就是依赖，**零新增依赖**。

## 二、三段式（各管一段，互不耦合）

| 命令 | 位置 | 职责 |
|---|---|---|
| `update_check` | `src-tauri/src/update.rs` | 查 `releases/latest`，比版本号，挑出本平台该装哪个产物 |
| `update_download` | 同上 | 流式下到应用缓存目录，边下发 `update:progress`，下完校验体积 |
| `update_install` | 同上 | Windows：NSIS `/S /R` 静默重装并自启；Android：FileProvider 交给系统安装器 |
| `update_ready` | 同上 | Android 专有：现在能不能真的装（未知来源授权 + 系统有安装器） |
| `update_open_install_settings` | 同上 | Android 专有：跳到「安装未知来源应用」授权页 |

前端 `src/updateChecker.js` 串起三步，`src/views/settings/update.js` 负责界面。

### 挑产物用**打分**，不是「取第一个匹配」

release 里同时挂着 `-setup.exe` / `-portable.exe` / `-x64-zh-CN.msi` / `-universal.apk`，
而 portable 与 msi **都没法静默原地升级**。打分规则：

- **+3**：精确后缀 + 首选关键词（Windows `setup` / Android `universal`）
- **+1**：仅后缀匹配（退而求其次的 msi / 普通 apk）
- **+4**：文件名里带了**目标版本号**

最后那条是防「装完还是旧版，于是每次启动都提示更新」的无限循环 ——
某个 release 误挂了旧版产物时，靠版本号加分把正确的那个顶上来。

同名同分时**先出现的赢**（显式循环 `>`，不用 `max_by_key` —— std 的 `max_by_key`
在并列时返回**最后**一个，与直觉相反，注释写「first wins」就会骗人）。

### 🔴 两个「打包才暴露」的坑

**① 共用 HTTP 客户端会把 APK 下载掐死。** `shared_http_client()` 设了 15 秒
**整体超时**（`ClientBuilder::timeout`）——21MB 的 APK 在稍慢的网速下必然被中断，
用户看到的是「下载中断：operation timed out」且**永远装不上**。
下载单独用 `download_client()`：不设整体超时，只要求 `read_timeout(30s)`
（每 30 秒至少来一段数据），慢但一直在动的连接不会被误杀，真断流又能及时失败。

**② Android 必须落在 `app_cache_dir()`，不是 `cache_dir()`。** Tauri 上
`cache_dir()` → `getExternalCacheDir`，`app_cache_dir()` → `getCacheDir`（内部）。
而 `res/xml/file_paths.xml` 只声明了 `<cache-path>` —— 落到外部缓存目录
FileProvider 不认，安装器直接打不开。**写错了本地 dev 完全发现不了。**

### 完整性校验说到做到

`asset.size` 只能证明「下全了」，**证明不了「没被换过」** —— 防篡改要靠签名，
而本项目刻意不引入签名密钥。所以这里如实只做体积校验（拦住截断、代理插广告这类损坏），
先写 `*.part` 再改名，中途失败不会留下一个「看起来能用」的半截安装包被安装器捡走。

## 三、Android 安装桥（新增原生 Kotlin 插件）

`tauri-plugin-opener` 对 `file://` **既不经 FileProvider 也不授予读权限**，
Android 7.0 起直接抛 `FileUriExposedException`。所以新增 `ApkInstallerPlugin.kt`：

- `installReady` —— 查 `canRequestPackageInstalls()` 与系统是否有安装器；
- `install` —— 校验路径在 FileProvider 声明范围内 → `FileProvider.getUriForFile`
  → `ACTION_VIEW` + `FLAG_GRANT_READ_URI_PERMISSION` + `FLAG_ACTIVITY_NEW_TASK`；
- `openInstallPermissionSettings` —— `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES`。

配 `REQUEST_INSTALL_PACKAGES` 权限声明。

**Android 8.0+ 装未知来源应用是「逐应用授权」**：没授权时点安装只会看到系统界面
一闪而过。所以前端下载完成后先探一次 `installReady`，没授权就把按钮换成
「去开启安装权限」，而不是让用户对着一个点了没反应的按钮。

## 四、🔴 为此必须先解决：Android 原生代码版本化

`src-tauri/gen/android/` 是 **gitignored 生成目录**。手机上跑的那些 Kotlin
（`MainActivity` 的安全区/返回键/双指缩放、`SchoolImportActivity`、`NativeSchedulePlugin`）
**只存在于生成目录里** —— 一旦有人重跑 `tauri android init`（改了 identifier /
productName 就必须重跑），这些代码连同本次新增的 `ApkInstallerPlugin` 一起**静默消失**，
而且本地 dev 永远发现不了。

做法：把 Kotlin 与清单**版本化**到 `android/gradle/`，用 `tools/sync-android-native.js`
幂等同步回 `gen/`。工具做三件事，全部**只在缺失时补、绝不整文件覆盖**：

1. 覆盖式同步 5 个 Kotlin 文件（镜像＝事实源）；
2. 清单**增量补**：`REQUEST_INSTALL_PACKAGES`、注册 `.SchoolImportActivity`、
   去掉 `MainActivity` 上的 `label`（label 由 activity 主题管，重复会导致 APK 名错）；
3. 校验 `file_paths.xml` 里有 `<cache-path>`（只校验，不合成）。

`scripts/build-android-apk.sh` 已在 vite build 之后调用它，`set -e` 下同步失败即中止构建。
另有 `--check`（CI / 测试用）与 `--capture`（从 gen/ 反向抄回镜像）。

顺带修掉两处**潜在 bug**：`test-android-layout.mjs` 与 `test-school-import.mjs`
原先读 `src-tauri/gen/android/...`，在**全新 clone 上必然 ENOENT**（gen/ 不存在）——
已改读版本化镜像。

## 五、前端行为约定（都是刻意的）

| 约定 | 取值 | 理由 |
|---|---|---|
| 启动检查 | 静默，失败不打扰 | 离线、GitHub 限流都当没事发生；只有「真的发现新版」才弹提示条 |
| `autoCheck` 开关 | 管「启动要不要去查」 | 关掉后仍可在「关于 › 软件更新」手动检查 |
| `notify` 开关 | 管「查到新的要不要弹通知」 | 与 `autoCheck` **独立**：关掉它照样查、状态照样显示在关于页，只是不主动打扰 |
| 检查间隔 | 6 小时节流 | 未鉴权的 GitHub API 每小时只有 60 次，共用出口 IP 很容易撞上 |
| 节流窗口写入时机 | **只在检查成功后**写 | 失败不写 → 下次启动还能再试，又不会疯狂重试 |
| 「忽略此版本」 | 按版本号记住（`skipVersion`） | 发了更新的版本号后自然失效（只比对相等），不需要用户回来清理 |
| 「稍后」 | 只活本次会话，不落盘 | 落盘就变成「关一次再也看不到更新」 |
| 「恢复提示」 | **当场生效** | 复位会话内的忽略标记并立刻放回提示条 —— 否则按钮要等到下次启动才起作用 |
| 「恢复提示」 vs `notify` | 恢复忽略**不绕过** `notify` | `notify` 是用户自己关的全局开关；恢复一个版本不该把它重新打开 |
| 下载完 ≠ 装完 | 文案一律「已交给系统安装」 | Android 上用户在系统界面点取消，我们收不到任何信号 |

两个开关都只认**显式 `false`** 才算关：配置被外力写成字符串 / 数字时按「开」处理 ——
宁可多提示一次，也不要让更新功能静默失效（那样用户永远发现不了新版）。

提示条三个按钮：**立即升级**（跳到设置 › 关于 › 软件更新）/ **稍后** / **忽略此版本**。
新增 `tide:open-settings` 事件（带 `section`）用于跨视图跳转，设置弹窗透传 `section`
给分区导航。**注意 `select()` 依赖 `apply()` 填的 `visibleIds`，所以先 apply 再 select。**

### 更新入口放在「关于」里，不是独立分区

初版设计成独立的「更新与维护」分区，**实现时改了**：面板（两个开关 + 状态回显 + 进度条 +
按钮组）改为嵌在「关于」卡片中、紧跟在版本信息后面，小标题「软件更新」。

三个理由：关于页本来就写着当前版本号，检查 / 升级入口放那儿最顺手；两个开关同处一节，
不会被拆到两个分区；设置导航少一个只有两行控件的分区。

`views/settings/update.js` 只负责产出节点（`createUpdateSettingsPanel()`），**挂载点由
`views/aboutCard.js` 决定** —— 位置想再换只改那一处。`settings.js` 里对应的
`{ id: "update" }` 条目与 `createUpdateSettingsCard()` 已删除，提示条的
`jumpToUpdateSettings()` 改发 `section: "about"`。

「关于」分区的关键词补了「更新 升级 检查更新 自动更新 弹窗提示 忽略此版本」，
设置页搜索里输「更新」也能落到关于。

## 六、手机端时间视图改版（同一发布批次）

时间视图的 7 个样式与 5 个视图原先一律「横向滚动解决一切」，在 390px 下都不可用：

| 位置 | 原来 | 现在（≤760px） |
|---|---|---|
| 视图切换栏 | 7 个 chips 横排，一屏只看得到 4 个半 | 收成「当前样式名 + 展开菜单」，列出全部 7 项并带说明 |
| WakeUp 课表 | 7 列 × 10 节 = 70 格，最小可读宽约 700px | 按天分组的日程列表 |
| 横向时间轴 | 1500px 画布绝对定位，窄屏文字叠成一团 | 纵向年表（一条中轴 + 左右交错卡片） |
| 年度甘特 | 12 月 × ≥70px + 220px 标签 = 1060px 起 | 按月折叠，全年只展开当前月 |
| 阶段甘特（泳道） | 31 列 × ≥34px + 160px = 1214px 起 | 按分类折叠 + 占比条（默认只展开前两个有内容的分类） |
| 里程碑 | 横向轨道，每格固定 165px | 纵向时间线 |

桌面端行为**不变**：窄屏专属块由 `@media (min-width: 761px)` 隐藏，折叠用的原生
`<details>` 在桌面由 CSS 强制展开。

> 改造期间发现并修掉的两处真问题：
> ① `.card-timeline` 带 `margin:34px auto`，窄屏只覆盖左右 `margin` 会让盒宽算成
> `100% + 28px` ⇒ **向右溢出 13px**（实测）。改为 `width:auto; margin:16px 0 22px`，
> 水平间距全部交给 `padding`。
> ② 年表 12 个月全列出来时，8 个空月份的标题会把有内容的月份**推出屏幕**（1650px 高）。
> 改为只渲染「有内容 + 当前月」，实测 4 个折叠组。

### 去掉视图标题下的占位说明行

7 个时间视图的面板顶部原来是「视图名 + 一行灰色说明」两行结构，说明文案全是
「参考 X 图：…」这类**概念稿出处与设想**，不承载任何状态、不可交互，只是把内容往下推
（用户截图反馈「占位置的删除」）：

| 删除前 | |
|---|---|
| `WakeUp 课表周视图` | 第 2 周 · 2026-09-07 ～ 2026-09-13 · 课程表式时间布局，窄屏可横向滚动。 |
| `里程碑时间轴` | 参考箭头阶段图：按日期排序展示近期关键任务与时间块。 |
| `横向时间轴` | 参考机器人发展史年表：适合信息密度高、事件多的长期回顾。 |
| `卡片时间轴` | 参考中国近代史时间轴：左右交错卡片，适合展示阶段说明和备注。 |
| `年度甘特图` | 参考年度工作规划：按任务起止日期映射到月份，窄屏按月分组折叠。 |
| `阶段甘特图` | …年…月 · 参考阶段泳道图：按工作/学习/运动/生活/休息分组。 |

**实现**：`head(title, desc)` 第二参数保留但不再渲染（恢复只需改这一处），
`.tv-head` 从两行块改成单行居中条（`padding` 18/14px → 14px，去掉 `h2` 的 `margin-bottom`）；
`h2` 与 `p` 的样式保留，方便随时把说明加回来。

小程序端同源处理：6 处 `vh-sub` 从 `index.wxml` 移除，
`.viz-head` 由 `flex-direction:column` 改回单行 `align-items:center`。
**注意小程序那版说明里含动态数据**（`{{wakeupWeekLabel}}`「第 N 周 · 日期区间」），
属于同一个 `vh-sub` 元素，一并去掉后才符合「标题只留视图名」的一致形态。

> 小程序端另有一批**同源的大改动**（7 样式收进展开菜单 + 5 个视图去横向滚动），
> 与桌面端是同一个问题的两处表现，合并写在第七节。

## 七、手机端时间视图：从「横向滚动硬撑」改成真响应式

用户截图反馈：APK 上时间块的 7 个样式**没有一个适配界面** —— 顶部 7 个切换 tab 横向滚动、
点进去每个视图又各自靠 `scroll-x` 硬撑，320px 手机上大片内容压在屏幕外。

本次把这条链路整个重做，**桌面端外观保持不变**，改动全部落在 `≤760px`（桌面）
与 `≤750rpx`（小程序）媒体查询内。

### 7.1 顶部切换栏：横向滚动 → 展开菜单

- **桌面**：`.tv-bar` 在窄屏收起，改成「时间视图 ▾」单按钮；点击后菜单挂到 `document.body`
  （switcher 自带 `overflow`，挂原地会被裁掉），带遮罩、`Esc` / 点外部 / 选中三项均可关闭。
- **小程序**：`viewTabs` 数组移进 `vt-menu`，`viewMenuOpen` 控制显隐，遮罩走 `vt-mask`。
- 7 个 tab 各自带一行 `desc` 说明（与桌面 `VIEW_META` 第三列对齐），
  这样菜单虽有 7 行但**每行都有信息量**，不是把 tab 竖过来而已。

### 7.2 五个视图：去掉 `scroll-x`，改为折叠 / 纵向重排

| 视图 | 改前 | 改后 |
|---|---|---|
| WakeUp 课表 | `scroll-x` 七日 × 多时段网格 | 按天折叠（`<details>` / `fold`），今天默认展开 |
| 里程碑 | `scroll-x` 横向箭头链 | 纵向列表，日期落在左侧轴 |
| 横向时间轴 | `scroll-x` 横向年表 | `chronicle-vertical` 纵向时间轴 |
| 年度甘特 | `scroll-x` 全年 12 个月 | 按月折叠，**只渲染有内容的月份 + 当前月** |
| 阶段甘特 | `scroll-x` 泳道 | 按分类折叠，默认展开前 2 个 |

折叠实现桌面上用原生 `<details>` / `<summary>`（零 JS，键盘与读屏器免费支持），
小程序用 `folds` 状态对象 + `onFoldTap`。

### 7.3 四个真 bug（静态断言全都看不见）

**① `.card-timeline` 左溢出 13px。** 该容器 `margin-left` 为负值撑出视口，
窄屏下卡片左侧被切掉一截。改成 `width:auto; margin:16px 0 22px; padding:0 14px 0 0;`。

**② 年度甘特渲染 8 个空月份，把内容顶到屏幕外。**
`buildGanttMonths` 原来只按年份筛，12 个月全出；没有任务时月份体是空壳，
却仍占 `fold` 高度。改成过滤空月、保留当前月，实测从 12 月降到 4 月。

**③ `.tv-fold` 在桌面端会被当成 flex/grid item。**
`<details>` 在原本的 grid 里多出一个子项，桌面的 7 个视图布局全被挤歪。
用 `display:contents` 让它对布局透明，桌面渲染与改动前**逐像素一致**。

**④ `menu.hidden = ""` 赋的是空字符串（falsy），属性不生效。**
菜单会赖在屏幕上不关。同类坑：`el.hidden` 必须赋布尔值。

### 7.4 阶段甘特百分比口径

第一版用 `width/26*100` 做归一化，出来的数字**没有任何含义**。
改成与桌面一致的「占本月总时长比例」：`totalMin ? Math.round(sumMin/totalMin*100) : 0`
（桌面 `timeViews.js:439` 同口径），百分比条也挪到分类行上，与桌面形态一致。
测试里加了「全部分类 pct 之和 = 100 ± 2」的断言守住这个口径。

### 7.5 小程序端的三条独有约束

- **`color-mix()` 不用** —— 小程序渲染器支持不可靠。两处替换为 `rgba(255,255,255,.75)` / `.82`。
- **JS 改字段名会静默白屏** —— WXML / WXSS / JS 三文件分离，模板里引用不存在的字段
  既不报错也不警告，本地与真机都只显示空白。所以测试必须跑**真数据构造**，
  而不是只检查模板里有没有某个字符串。
- **跨 realm 数组不能 `deepEqual`** —— `viewTabs` 从 `vm` 沙箱里出来，
  它的 `Array` 原型与 Node 侧不同。比 `join(",")` 字符串。

### 7.6 验收

**真浏览器实测**（无头 Chrome，7 视图 × 320/360/390/412 四档宽 × 明暗，桌面 1440×900 回归）：

| 档位 | host 横向溢出 / 绘制溢出 / 文本重叠 |
|---|---|
| 320 / 360 / 390 / 412 | 全部 **0 / 0 / 0** |
| 390（浅色） | 全部 **0 / 0 / 0** |
| 桌面 1440×900 | 4 个手机容器全 `none`，桌面外观未变 |

折叠数实测合理：WakeUp `1/7`（今天展开）、年度甘特 `4/4`、阶段甘特 `2/5`。

**变异测试：9 个变异 9 个被抓到** —— 年度甘特不滤空月 / WakeUp 折叠默认值每轮重算 /
阶段甘特全展开 / 阶段甘特日期用 365 而非当月天数 / WXSS 混入 `color-mix` /
`viewTabs` 缺 `desc` / 甘特 key 少 `gm-` 前缀 / 里程碑退回横向滚动 / 空态类名被改。

两个脚本共 40+ 条断言：`scripts/test-time-views.mjs`（桌面）+ `scripts/test-miniprogram-timeviews.mjs`（小程序）。

## 八、验收

### 8.1 时间视图：回归脚本 + 真浏览器实测

> 手机端时间视图一节的脚本设计、真浏览器实测矩阵与变异测试结论见 **7.6**，此处不重复。
> 补充两条**定位脚本时踩的坑**（都是「断言因为错误的原因通过」的同一类）：

- **窄屏媒体块定位** —— 文件里有 **10 个** `@media (max-width: 760px)` 块，直接
  `split(...)[1]` 会落到抽屉块上。用「选择器 + 花括号 + 声明」的完整规则形态
  （`.wakeup-mobile { display:block`）当锚点才唯一；裸选择器会被基础态规则的尾巴污染。
- **负数 margin 断言** —— 正则 `/margin:\s*[^;]*1[0-9]px\s/` 会误伤 `margin:16px 0 22px`
  （匹配到 `16`）。必须按简写语义解析：三值时左右 = `mv[1]`。

### 8.2 应用内更新

新增两个测试脚本（第 25、26 个）：

- `scripts/test-update-rust-logic.mjs` —— 把 `update.rs` 的纯逻辑段 + `#[cfg(test)] mod tests`
  抽出来，用 **`rustc --test` 单独编译真跑**（沙箱里 `cargo` 起不来，这是绕开办法），
  **9 个用例**：版本号数字序（不是字典序）/ 前缀与后缀容错 / 产物挑选取舍 /
  路径穿越防护 / URL 白名单 / 说明按**字符**截断 / 不支持平台拿到空结果。
- `scripts/test-update.mjs` —— 迷你 DOM 替身 + 可编程的 `invoke` 打桩，真 import
  `src/updateChecker.js` 把状态机跑一遍。覆盖：设置项被改坏时的自愈、
  检查四态（有新版 / 已最新 / 有新版但本平台无产物 / 请求失败）、
  静默检查三道闸门（开关关 / 6 小时节流 / 失败不写 `lastCheckAt`）、
  忽略与恢复与稍后、**命令桥参数名契约**（`{url,name,size}` / `{path}`，名字错了
  只会在运行时静默变成缺参）、Android 未授权时不得直接调 `update_install`、
  **`notify` 开关只管「弹不弹」**（关掉后仍发 `update_check`、仍写 `lastCheckAt`、
  状态仍推进到 `available`，只是不弹提示条）、
  提示条上确实有「立即升级」与「忽略此版本」两个按钮、
  面板挂在「关于」卡片里（并断言设置页里**不再**有 `createUpdateSettingsCard`
  与 `id: "update"` 分区 —— 死代码回潮会被拦下）。

**变异测试：9 个变异 9 个被抓到**（删节流 / 删开关判断 / 不写 `lastCheckAt` /
不比对 `skipVersion` / 下载 size 写死 / 未授权不转授权页 / 忽略不记版本号 /
删掉 `notify` 闸门 / 把更新面板的订阅还原成旧写法）。其中**两处假通过**是被「对照组」逼出来的，
值得记着：

- 「不比对 `skipVersion`」第一次**逃逸** —— 断言接在「忽略」按钮之后，
  `dismissedThisSession` 已为 true，提示条本来就不会出现，断言因为**错误的原因**通过。
  已把该断言前移到 `clearSkippedVersion()` 复位之后，并补一句 `update_check` 调用次数断言，
  证明「没弹」不是被节流挡的。
- 新增的 `notify` 差异断言第一次也**红了**：同一段里刚点过「稍后」，
  `dismissedThisSession` 仍是 true ⇒ 两次都不弹，差异测试退化成「两边都是 null」。
  修法是每次跑之前用 `clearSkippedVersion()` 显式复位（它是复位的唯一入口），
  再跑 `notify=false` / `notify=true` 两遍：**只差一个值，结果必须不同**。

### 8.3 真浏览器探针抓出的三个真 bug（静态断言全都看不见）

前两节都是「读代码 / 跑迷你 DOM」。这一节是**真 CSS + 真 DOM + 真视口**（无头 Chrome，
iframe 逼出 390px 与 1280px 真布局，Tauri 命令打桩），一次就抓出三个静态断言完全测不到的缺陷：

**① 更新面板一构建就把整个设置页打崩（最严重）。**
`subscribeUpdateState()` 会**同步**先回调一次，而那一刻 panel 还没被 append 进文档，
`panel.isConnected` 恒为 false；旧写法
`const unsubscribe = subscribeUpdateState(() => { if (!panel.isConnected) { unsubscribe(); … } })`
于是在**暂时性死区**里读 `unsubscribe` → `ReferenceError` → 顺着
`createUpdateSettingsPanel → createAboutCard → renderSettings` 冒出去。
**症状是打开设置只剩一个标题为「设置」的空弹窗**（所有分区全没了）。
修法：用 `firstCallback` 标记跳过那次同步回调，并先把 `unsubscribe` 初始化成空函数。
顺带把 `subscribeUpdateState` 的首次调用也套上 try/catch（与 `emit()` 一致）。

**② `[hidden]` 被作者样式压过去，两个元素一直显形。**
`.update-progress { display: flex }` 与 `.setting-row { display: flex }` 都是 0,1,0 特异性，
而 UA 的 `[hidden] { display: none }` 同样是 0,1,0 —— **作者样式优先**，`hidden` 属性形同虚设。
实测（`getComputedStyle().display`）：`hidden=true` 时 `.update-progress` 与「已忽略的版本」行
的 computed display 仍是 `flex`。症状是「不下载也一直挂着一条空进度条」和
「没有忽略记录却显示『已忽略的版本』空行」。
修法：加 `.update-progress[hidden], .update-notes[hidden], .setting-row[hidden] { display: none !important; }`
（与既有的 `.settings-acc[hidden]` 同一个坑、同一个修法）。

**③ 手机端升级横幅整个盖住底部导航。**
`.update-toast` 窄屏原来写 `bottom: 12px`，而底部导航占 62px —— 横幅把它**整条压住**，
而横幅要用户点按钮才消失，那段时间等于没法切视图（390px 截图一眼可见）。
修法：底距抬到 `calc(86px + var(--sab, env(safe-area-inset-bottom, 0px)))`，与 `#toasts` 同高；
`sab` 用双路写法（WebView 不实现 `env()`）。

**探针本身也踩了两个坑**（已记进技能）：
- 内层页必须**先**打桩 `window.__TAURI_INTERNALS__` 再加载 module —— `api.js` 在模块顶层读它，
  晚了就落到浏览器降级分支，更新面板只显示一句「仅桌面客户端与 Android 版可用」，开关根本不渲染。
- 打桩的 `invoke` 对未知命令要返回 `{}` 而不是 `null`：`views/settings/ai.js` 会直接读返回值的
  `.baseUrl`，给 `null` 会让**整个设置页渲染中断**（又一个「只有真渲染才看得见」的坑）。

**结论**：桌面 1440/1280 与 390px 下，关于页面板与升级横幅均为 **横向溢出 0 / 逐元素越界 0**；
两个开关可正常拨动并写回设置；横幅三按钮齐全（立即升级 / 忽略此版本 / 稍后）且 × 能关掉。

全部校验：

- `node ../tools/sync-version.js --check` ✓ 三端版本一致 v0.38.0
- `node ../tools/gen-theme-dark.js --check` ✓ 派生调色板已同步（15 套深色变体）
- `node ../tools/build-schedule-plugin.js --check` ✓
- `node ../tools/sync-android-native.js --check` ✓ Android 原生代码与镜像一致
- `node ../tools/sync-plugins.js --check` ✓ 12 个内置插件三端同源
- `node scripts/test-time-views.mjs` ✓ 切换菜单关闭语义 + 卸载清理 + 7 视图窄屏适配
- `node scripts/test-miniprogram-timeviews.mjs` ✓ 小程序 7 样式收进展开菜单 + 5 个横向滚动视图改折叠
- `node scripts/run-tests.mjs` **28 个测试脚本全部通过**
- 无头 Chrome 探针 ✓ 关于页「软件更新」面板 + 左下角升级横幅（390 / 1280 两档视口）
- 无头 Chrome 探针 ✓ 手机端 7 个时间视图（320/360/390/412 × 明暗），逐档 0 横向溢出 / 0 绘制溢出 / 0 文本重叠

## 影响面

- **Windows**：新增应用内更新；`android/gradle/` 镜像与本版同步。
- **Android**：新增应用内更新 + 安装桥 + `REQUEST_INSTALL_PACKAGES`；
  重跑 `tauri android init` 后**必须**执行 `node ../tools/sync-android-native.js`
  （构建脚本已自动调用）。
- **微信小程序**：有独立实现，本版未同步更新功能；
  **但时间视图的占位说明行已同步删除**（`pages/timeblock/index.wxml` + `.wxss`）。
- **插件**：无影响。无数据迁移。
- 用户可见的新设置项：`settings.update = { autoCheck, notify, skipVersion, lastCheckAt }`
  —— 缺字段就地补默认值，**不需要走 `migrations.js`**。两个开关都只认显式 `false` 才算关。
- 设置页导航少了「更新与维护」一节（并入「关于」），微信小程序端无对应功能、不受影响。
