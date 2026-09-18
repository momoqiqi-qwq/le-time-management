# v0.62.0 · 网盘同步引导：三步配好 + 一键上传，小白也能把数据带到手机上

## 先说清楚这是什么

「可选同步」这一节从 v0.3x 就在了，但它的形态是**三个输入框 + 两个按钮**，
默认读者已经知道 WebDAV 是什么、坚果云的「应用密码」去哪拿、目录必须先存在才能传。
结果就是：功能在，人用不上。

本版把它改成 **①选网盘 → ②填账号 → ③一键配好** 的三步引导，
把小白必卡的三处逐个替他走完。**没有引入账号体系，也没有改成自动上传** ——
不点按钮，依然没有任何东西离开这台设备。

## 改了什么

### ① 引导卡（`src/views/settings/sync.js`，新文件）

原来那段内联实现在 `views/settings.js` 里，跟着 `ai.js` / `appearance.js` 的先例拆成独立模块。

| 步骤 | 内容 |
|---|---|
| ① 选网盘 | 三张预设卡：**坚果云**（默认推荐，根地址写死且只读）/ **Nextcloud · ownCloud** / **其他 WebDAV** |
| ② 填账号 | 根地址、文件夹名、账号、应用密码；「打开坚果云后台」一键跳浏览器；「怎么填这一栏？」就地展开 4 步图文（头像 → 账户信息 → 安全选项 → 第三方应用管理 → 添加应用）；「记住密码」滑块 |
| ③ 一键配好 | 一个按钮走完：**核对账号 → 建好文件夹 → 上传第一份快照**，进度分步回显 |

配好之后才出现「以后怎么同步」一节：上传 / 拉回 / 只测连接 / 忘掉密码，
外加一句换设备时该干什么的说明。三步各自带完成态（编号变 ✓ + 右侧「已完成」）。

**失败原因一律翻成人话**，不再甩 HTTP 状态码：

| 状态码 | 提示 |
|---|---|
| 401 | 账号或密码不对。坚果云要填的是「第三方应用管理」里生成的应用密码，不是网页登录密码 |
| 404（拉回时） | 网盘上还没有这份快照文件。第一次用请先点「上传本地 → 网盘」… |
| 404（登录时） | 地址找不到。坚果云的根地址应以 /dav 结尾；Nextcloud 必须填到 /remote.php/dav/files/用户名 |
| 507 | 网盘空间满了，传不上去 |
| 网络层异常 | 连不上这个地址。检查一下本机能不能上网… |

### ② 同步层（`src/syncLayer.js`）

新增预设表、URL 拼装/反解、目录探测与自动建目录、状态码文案表、密码持久化。

- **自动建目录是这一步的全部意义**：向不存在的目录 PUT 会拿 409，
  而 409 对小白是一条看不出原因的失败。现在 `ensureWebDavFolder()` 逐层
  `PROPFIND`（Depth 0，带最小请求体 —— 裸 PROPFIND 会被 Nextcloud 拒）探一遍，
  缺哪层 `MKCOL` 哪层，所以**用户不需要先去网盘网页版手动建文件夹**。
  已存在的层直接跳过 → 重复点「一键配好」是幂等的。
- 根地址 + 文件夹 + 文件名**逐段 `encodeURIComponent`**，中文文件夹名（默认就叫 `Le时间管理`）才拼得对。
- `uploadWebDav` / `downloadWebDav` 的报错改走同一张文案表。

### ③ 应用密码进密钥库（这是本版的**行为变更**）

模块头原先写着「不保存密码」。现在默认**存**，但只存进 Rust 侧
AES-256-GCM 密钥库（`plugin_vault_*`，与 AI 的 API Key 同一套）：

- **不进 `data.json`、不进完整备份** → 也就不会被跟着快照上传到网盘上；
- 换设备仍要重新输一次（密钥库是本机的），但同一台设备上重启不用再输；
- 「记住密码」关掉时会把已存的那串删掉，不让开关和实际存储状态各说各话；
- 输入框留空 = 沿用已存的那串（和 AI 卡一致的交互）。

### ④ Rust：`http_fetch` 认得 WebDAV 方法（`src-tauri/src/lib.rs`）

原来只映射 POST/PUT/DELETE，**其余方法一律降级成 GET** —— PROPFIND 与 MKCOL 到不了服务器。
补 `dav_method()`（`reqwest::Method::from_bytes`，http-rs 没有这两个常量）加两条分支。
字节集是内部字面量，不接受用户输入，不存在任意方法注入。

**刻意不加 `#[cfg(desktop)]`**：APK 也要能自己建目录。有反向断言钉着。

### ⑤ 老用户迁移

只存过整条 `url` 的，就地拆成根地址 + 文件夹 + 文件名（`migrateLegacyUrl`，放在同步层而非 UI 层，测试不必为此拉起 DOM）。
认得出坚果云就归到坚果云预设；认不出的一律落回「其他 WebDAV」并**整条保留原地址与原文件名** ——
换成别的预设会把根地址改掉，那是数据事故。已有 `presetId` 的不再动（幂等）。

## 顺手修掉的一处测试基建

`test-switch-control.mjs` 的设置卡片源码清单是**手写文件列表**，新增 `settings/sync.js` 后
「可选同步」标题守卫直接假失败。改成整目录扫描 —— 否则每拆一个设置模块都要来改一次这里。

## 影响哪端

- **Windows（exe）**：设置 → 可选同步 全部换新。
- **Android（APK）**：同一份前端代码 + 同一条 Rust `http_fetch`（未门控），
  `INTERNET` 权限本来就有。**APK 与 exe 用同一个网盘账号即可互传**。
  窄屏（≤760px）表单改单列，标签压在输入框上方。
  ⚠️ 走的是 Rust 侧 reqwest 原生 socket，不受 WebView 的 `usesCleartextTraffic=false` 限制，
  所以 http:// 的自建 WebDAV 在 release APK 上照样能连（仍会先弹明文提醒）。
- **微信小程序**：不涉及（这一节只在 `le-time-management/src/`）。

## 有没有数据迁移

`settings.sync.webdav` 从 `{ url, username }` 扩为
`{ presetId, root, folder, fileName, username, remember, lastSyncAt, url }`。
`url` 继续写（保持兼容），老字段在打开卡片时就地拆分升级。**不删任何数据。**

## 版本号

- `package.json` → `0.62.0`（+ `sync-version.js` 三端、`package-lock.json` 两处手工补）
- 插件清单与 `manifest.json` 未动

> 📌 **为什么不是 0.60.0**：本功能做完时版本是 `0.59.0 → 0.60.0`，但同一工作树里有另一条
> 会话在并行改插件（`gx-news` 等），它把号一路推到 `0.61.0`。按铁律一「新功能走 minor、
> 不压进别人未提交的 patch 号」，这里让到 `0.62.0`。**两条会话共用一个版本号事实源，
> 谁后跑 `sync-version.js` 谁覆盖前者** —— 合并时以最终 `--check` 通过的那个号为准。

## 校验

```
node ../tools/sync-version.js --check          ✓ 三端版本一致：v0.62.0
node ../tools/gen-theme-dark.js --check        ✓ 派生调色板已同步（只用了既有令牌，无新增）
node ../tools/build-schedule-plugin.js --check ✓ 生成物与源一致
node ../tools/sync-android-native.js --check   ✓ Android 原生镜像一致
cargo check                                    ✓（仅既有 warning）
cargo check --lib --target aarch64-linux-android ✓ APK 侧编得过（NDK 27 环境，48s）
npm test                                       ✓ 全部通过（新增 1 个测试脚本）
```

### 新增 `scripts/test-webdav-sync.mjs`

**替掉 `window.__TAURI_INTERNALS__.invoke` 而不是替全局 fetch** —— 那才是 exe / APK 真正走的路径，
顺带把「JS 参数形状 → Rust 命令」这层契约钉住（WebDAV 方法正是在这层丢掉的）。
假后端像真服务器一样校验 Basic、要求 PROPFIND 带 Depth 与请求体、目录不存在时 PUT 回 409。

覆盖：URL 转义与反解、老地址迁移（含幂等）、自动建目录与幂等、多级目录只补缺层、
状态码文案、密码只进密钥库且**快照里绝不出现密码**、Rust 方法未门控、卡片接线、
`.sync-*` 类名在 styles.css 里都有定义。

### 无头 Chrome 真实点击验证

`output/sync-probe.mjs` + `output/fake-dav.mjs`（一次性脚手架，gitignored）：
把引导卡从头点到尾，后端指向本机起的假 WebDAV。四个场景全过：

- **桌面 1440**：首装默认停在坚果云、根地址只读且已填好 → 切「其他 WebDAV」→ 填账号密码 →
  点「一键配好」→ 假服务器实收 `PROPFIND /dav/ → PROPFIND /dav/Le时间管理/ → MKCOL /dav/Le时间管理/ → PUT /dav/Le时间管理/le-time-data.json`，
  回显「全部完成 · …的快照已在网盘上」，步骤 3 转完成态，日常区出现。
- **误填登录密码**：回显 `is-error`，文案命中「应用密码」。
- **只测连接**：填回正确密码后回显「账号能登录，这串密码仍然有效」。
- **窄屏 408（APK 形态）**：三步齐全、手风琴内卡片可见、表单单列、页面横向溢出 0。

截图：`output/preview/sync-desktop-{step1,howto,configured,wrongpass}.png`、`sync-narrow-408.png`。

> 探针踩到的两个坑（都不是应用 bug）：① `api.js` 的浏览器回退路径带 `credentials:"include"`，
> 假服务器的 `Access-Control-Allow-Origin: *` 会被浏览器拒（必须回显来源 + `Allow-Credentials`）；
> 真应用走 Rust reqwest，没有这一层。② 上一轮跑完 `presetId/root` 已落进 localStorage，
> 「首装默认值」那几条断言会假失败，探针开头要清一次。
