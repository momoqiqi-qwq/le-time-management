# v0.74.2 · 教务导入的适配脚本改用多镜像取源（修「学校适配脚本读取失败（HTTP 404）」）

## 症状

课程表 → 教务导入 → 选择学校 → 点任意适配器，报：

```
学校适配脚本读取失败（HTTP 404）
```

用户反馈「很多都这样」。**实测是全部**：除内置警大外的 228 条第三方适配器一条都取不到。
内置警大正常，因为它读随包的 `adapters/cppu.js`，根本不发外网请求 —— 这也让这个 bug
长期被当成「个别学校没适配」。

## 根因

`ui.js` 里脚本地址写死在 GitHub 原仓库：

```
https://raw.githubusercontent.com/XingHeYuZhuan/shiguang_warehouse/main/resources/<resourceFolder>/<assetJsPath>
```

而 **`XingHeYuZhuan` 这个 GitHub 账号已经注销**（2026-09-19 实测）：

| 探测 | 结果 |
|---|---|
| `api.github.com/users/XingHeYuZhuan` | 404 |
| `github.com/XingHeYuZhuan/shiguangschedule`（主程序仓库同账号） | 404，且**没有改名重定向** |
| `search/repositories?q=shiguang_warehouse+in:name` | 命中 0 个 |
| 同 URL 换 `master` 分支 | 404（不是分支名的问题） |
| 对照组 `raw.githubusercontent.com/octocat/Hello-World/master/README` | 200（不是本机网络的问题） |

所以不是个别学校的脚本缺失，是整条取源全灭。

### 中途排除掉的一个假因

jsDelivr 的缓存清单（`data.jsdelivr.com/.../shiguang_warehouse@main/flat`）只有 132 个
`resources/` 目录，而内置索引列了 209 所学校 —— 算出「39% 的路径本来就不存在」，一度以为
根因是**索引漂移**。那份缓存本身是过期的：按 Gitee 镜像的 live 树重算，229 条适配器里只有
**1 条**取不到，而那是上游在 `resources/GLOBAL_TOOLS/adapters.yaml` 里明写的
「空网站以及不存在适配代码，用于在不更新索引的情况下给开发者进行适配的软件测试」。
教训：**镜像的缓存清单不能当事实源**，要比就比活着的树。

## 修法

`ui.js`：单一 URL → 有序的取源清单 `schoolAdapterSources`，逐个试到第一个拿到内容的为止。

| 顺序 | 源 | base |
|---|---|---|
| 1 | Gitee 官方镜像 | `https://gitee.com/XingHeYuZhuan-gh/shiguang_warehouse/raw/main` |
| 2 | GitHub 原仓库 | `https://raw.githubusercontent.com/XingHeYuZhuan/shiguang_warehouse/main` |

两处路径拼法完全一致（`resources/<resourceFolder>/<assetJsPath>`），换的只是宿主。
GitHub 留在备用位而不是删掉：账号哪天恢复就不用再改一次码，且它只在**前一个源失败后**才被试，
正常路径不多花一次请求。

顺带修掉一个同函数里的老问题：原来 `tide.http.fetch` 一旦 reject（超时 / DNS / 连接中断）
异常直接抛出，连「换源重试」的机会都没有。现在每个源各自 `try`，全失败才报错，
**错误文案带上每个源的名字和状态码**（`Gitee 官方镜像 HTTP 404；GitHub 原仓库 HTTP 404`），
下次再坏一眼能看出是哪一个源、什么错法。

### 为什么只用这两条源，不加第三条

上游自带的 `git_repos.json` 列了三条：官方 GitHub、Gitee 官方镜像站(CN)、
ITDONG 镜像（三网优化）。第三条是**第三方**加速镜像，写进产品等于引入一个不受上游控制的中间人 ——
适配脚本是**注入到用户已登录的教务页面里执行的任意 JS**，Cookie、学号、课表全在那一页。
多一个源不如守住这条信任边界。

## 实测

抽样 12 条真实适配脚本走 Gitee raw（含 302 跳到 `raw.giteeusercontent.com` 的签名重定向链）：

```
BUPT/bupt_01.js  200 12219      MASU/masu.js              200  7481
CQU/cqu.js       200  4250      BBGU/bbgu.js              200 11336
SWJTU/…yhxt.js   200  9197      GLOBAL_TOOLS/school.js    200 14649
chaoxing_jiaowu/ 24795          GLOBAL_TOOLS/wake_up.js   200 34309
YNUFE/ynufe.js   200 30161      GLOBAL_TOOLS/starlink.js  200  8211
CQUT/cqut_01.js  200 17862      GLOBAL_TOOLS/test.js      404 ← 上游故意的
```

11/12 命中，正文 4.2 KB ~ 34 KB。`tide.http.fetch` 走的 Rust reqwest 默认跟随重定向
（`http_fetch` 只有显式传 `follow_redirects:false` 才关），302 不影响取内容。

## 加了一道锁

`scripts/test-schedule.mjs` 新增一段**真跑** `openSchoolAdapter()` 的用例（不是 grep 源码字符串）：
用 vm 里注入的 fixture 直接驱动那个闭包函数，`tide.http.fetch` 换成桩子记录请求序列。断言

- 取源清单 ≥2 条，**第一位必须是仍在更新的 Gitee 官方镜像**，末位保留 GitHub —— 防有人「顺手改回一个 URL」；
- 首选 404 时逐个重试到成功，且请求序列与清单顺序一致、路径是 `resources/<resourceFolder>/<assetJsPath>`；
- 单个源抛网络异常也不能中断整条链；
- 路径逐段 `encodeURIComponent` 而分隔符保留（`A B&C/d 01.js` → `A%20B%26C/d%2001.js`，
  整串编码会把 `/` 变成 `%2F` 而 404）；
- CPPU 仍然零外网请求、只读随包副本。

## 为什么以前没被发现

取源是**运行时**才发的请求，测试只断言了 UI 上有没有「选择学校」这类标记；
上游账号注销也没有任何通知渠道。索引是随包快照，读它不需要网络，所以「列表点得开、
一按导入就 404」这个组合一直没人撞破。

## 影响面

- 桌面（Win）+ APK：都走 `tide.http.fetch` → Rust reqwest，两端同时修好。
- 小程序：无关（没有在线教务导入入口）。
- 数据迁移：无。**但要重新打包并覆盖安装才生效**，已装好的版本不会自己变好。

## 遗留（本次没动）

- 内置 `school_index.pb` 是 2026-09-13 快照（209 所 / 229 条适配器），上游
  `index-pb-release` 分支已到 2026-09-17（**219 所 / 243 条**），多 10 所学校。
  要不要随包刷新是另一个决定 —— 它牵动 `NOTICE.md` 里记的来源与 MIT 声明，不该混进这次修复。
- 三处文档还写着「上游 = raw.githubusercontent 那个地址」：`docs/多源数据融合说明.md:112`、
  `tools/gen-architecture-diagrams.js:510`（连带生成的 `docs/architecture/11-sources-map.svg`）、
  插件 `NOTICE.md:7`。前两条现在算半过时（GitHub 那条源仍在清单里，只是不再是首选）。

## 校验

```
node ../tools/sync-version.js --check          ✓ 三端版本一致：v0.74.2
node ../tools/gen-theme-dark.js --check        ✓ 派生调色板已同步（15 套深色变体）
node ../tools/build-schedule-plugin.js --check ✓ shiguang-schedule 生成物与源一致
node ../tools/sync-android-native.js --check   ✓ Android 原生代码与版本化镜像一致
npm test                                       ✓ 61 个测试脚本全部通过
```

---

# v0.74.2 追加 · 品牌更名：Le时间管理 → U-Time

（并入本版本，不另造版本号 —— v0.73.0 起整批未提交、未发布。）

## 改了什么

- **全量显示名**：窗口标题 / 主窗口 label / 关于页 / 侧栏品牌区（含副标题 `LE · TIME MANAGEMENT` → `U-TIME`）/
  Android 桌面名与主 Activity 标题 / 小程序名 / 通知标题 / WebDAV 与 LAN 文案 / 各插件 manifest 与界面文案 / README / 文档站。
  共 **88 个源文件、157 处替换**，之后重跑全部生成器（sync-plugins / build-schedule-plugin / build-exam-calendar-plugin /
  gen-theme-dark / sync-android-native / sync-version）把 `pluginCatalog.js`、`theme-derived.css`、
  插件 `main.js`、`gen/android` 的 strings.xml 等生成物带齐。
- **发布产物命名约定**：此后新版本产物叫 `UTime-<版本>-x64-setup.exe` / `UTime-<版本>-universal.apk`。
  `update.rs` 的 `asset_score` 只按扩展名 + 关键词（setup/universal）+ 版本子串打分，**不依赖品牌前缀**，
  历史 `LeTime-*` 资产依然能被匹配（Rust 里的旧名 fixture 保留，正好当回归用例）。

## 刻意不改的（内部标识符，铁律三同源）

`com.yile.letime`（applicationId / identifier）、Cargo 包名 `letime` / `letime_lib`、npm 包名
`le-time-management`、仓库路径、插件 API 全局名 `tide`、本地存储键 `letime-data`、
HTTP UA 串（`LeTimeManagement/`）。改这些会破坏升级链路 / 全部插件 / 存储数据，与「软件显示名」无关。

## 数据兼容注意

- **WebDAV 同步**：远端文件夹**默认名**从 `Le时间管理` 改为 `U-Time`。已保存的同步配置不受影响
  （配置里存的是当时的值）；**旧快照仍在远端 `Le时间管理/` 文件夹**，想让新版本读到，需在同步设置里
  把文件夹名手动改回 `Le时间管理`（或把远端文件夹改名）。
- 本地存储键没动，桌面 / Android 升级覆盖安装后数据原样保留。
- Android 覆盖安装：applicationId 未变，系统视为同一应用的升级。

## 校验（更名后重跑）

```
node ../tools/sync-version.js --check          ✓ 三端版本一致：v0.74.2
node ../tools/gen-theme-dark.js --check        ✓ 派生调色板已同步（15 套深色变体）
node ../tools/build-schedule-plugin.js --check ✓ shiguang-schedule 生成物与源一致
node ../tools/sync-android-native.js --check   ✓ Android 原生代码与版本化镜像一致
npm test                                       ✓ 61 个测试脚本全部通过
```

### 更名牵出的两处测试修正

- `test-theme-transition.mjs`：变异**写入**路径补上与还原路径同款的重试循环（Windows 文件占用
  errno -4094 偶发炸全量跑，单跑复现不出来）。
- `test-webdav-sync.mjs`：「中文文件夹逐段转义」用例改为显式传中文文件夹名（原来蹭默认名
  `Le时间管理` 当靶子，默认名改 ASCII 后失去靶子），并新增断言钉住预设默认文件夹 = `U-Time`。

---

# v0.74.2 追加 · 修设置页「界面与交互」卡片渲染崩（ReferenceError: navDisplayName is not defined）

（并入本版本，不另造版本号。）

## 症状

设置弹窗只有标题栏，body 全空 —— 全部设置分类卡片一张都不出现。无任何用户可见报错。

## 发现路径

Android 界面实拍（无头 Chrome + Pixel UA + 390×844，渲染仓库真源码）时 settings 截图 body 空白，
dump-dom 抓 iframe 内 `unhandledrejection` 定位：

```
ReferenceError: navDisplayName is not defined
    at createInterfaceCard (src/views/settings/appearance.js:284)
    at render (src/views/settings.js:48)
```

启动页下拉框（v0.52.0 按平台裁剪启动页选项那批改动）在选项文案处调了
`navDisplayName(id, label)`，但 `appearance.js` **没 import** —— 函数在 `src/navAppearance.js`
导出、`shell.js` 正常引入，唯独这里漏了。每次渲染「界面与交互」卡片必抛，
`render()` 整个中断，所有卡片都进不了 body。

## 修法

`appearance.js` 补一行 `import { navDisplayName } from "../../navAppearance.js";`。

## 为什么测试没拦住

设置卡片渲染是 DOM 组装路径，现有测试只覆盖纯函数（uiPreferences / navAppearance 本体），
没有「真跑 createInterfaceCard」的用例 —— ReferenceError 属于运行时才炸。

## 影响面

- 桌面 + APK：设置弹窗整页恢复正常。
- 小程序：无关。
- 数据迁移：无。
