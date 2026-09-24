# U-Time v0.102.1

## 更新内容

### 教务请求只剩一句看不懂的英文报错（`cppu-notify` 1.26.0 → 1.26.1 + `src-tauri` 错误链）

「警大学分」点开后整屏只有一条 `请求失败: error sending request for url (https://jw.cppu.edu.cn/je/load)`，
学分卡一张都没出来。这条文案是 Rust 侧 `http_fetch` 用 `format!("请求失败: {e}")` 拼的，
而 **reqwest 0.12 的 `Display` 就只有 `error sending request for url (…)` 这一句** ——
真正的成因（DNS 解析失败、TCP 连不上、TLS 握手断、客户端超时）全在 `source()` 链里，
被这一次 `{e}` 直接吞掉。所以截图上那条报错不仅用户读不懂，开发者也照样看不出是什么，
只能从外部重新取证。

排查过程（结论都写进了注释，避免下次再测一遍）：

- 站点与 `/je/load` 本身可达，未登录也在 15ms 内回 200 —— 不是请求配方错。
- **教务服务器空闲 keep-alive 连接 200s 内不掐**（裸 TLS 探针 4 次复测，响应头恒 `Connection: keep-alive`），
  而 reqwest 连接池 90s 就退役 → 拿到死连接这条最常见的嫌疑**不成立**，`pool_idle_timeout` 保持不动。
- 同一台开发机在 5 分钟 60 次请求的探针里撞到 1 次 `ENOTFOUND`（机器上挂着 Radmin VPN、BootMagix 等 TAP 网卡），
  另开 20 轮 × 4 域名的定向解析又全绿 → 判定为**瞬时 DNS / 连接抖动**。
  截图里只有培养计划/成绩之外的一个报错条、其余两类数据照常，正是「单条请求撞上抖动」的形状。

### 一、Rust 侧：把 cause 链摊平

新增 `error_chain()`，沿 `source()` 最多摊三层，`http_get` / `http_get_icon` / `http_fetch`
的「请求失败」「读取响应失败」以及 AI 那条一并改用。现在同一次失败回的是
`请求失败: error sending request for url (…): client error (Connect): dns error: failed to lookup address information: no such host`。
配套 Rust 单测覆盖「只有顶层一句」「摊平到第三层」「第四层起截断成 `…`」。

### 二、插件侧：读查询敢重发，报错说人话

- `/je/load` 是刻意只读的通用查询端点（写操作一律不接管），所以传输层失败**原样重发是安全的**：
  按 `JW_RETRY_MS = [400, 1600]` 退避重发，最多两次。退避给到秒级是因为
  Windows 解析器会短期缓存失败结果，立刻重发往往撞上同一条负面缓存。
  非传输层错误（代码 bug、`TypeError` 之类）一次都不重发 —— 盲目重试会把真 bug 藏起来。
- 传输层抖动与「登录态失效」是两条路：后者表现为 POST 被 302 回登录页、拿回一整页 HTML，
  仍走原来的换新票重一次，两者不互相冒充。
- `explainHttpError` 按成因分类翻成中文（等待响应超时 / 域名没解析出来 / HTTPS 握手没通过 /
  连不上服务器 / 连接被中途掐断），并把摊平后的原始串附在末尾备查；
  本来就是人话的文案（如「教务登录态已失效」）原样透出，不二次加工。
  `jwFuncInfo` 原先没有 catch，抖一下就把裸英文抛到界面上，这次一并接上。

## 影响范围

- **Windows / Android**：`cppu-notify` 四个教务视图（选课 / 请假 / 学分 / 创新学分）与通知、一卡通的
  所有 HTTP 失败提示；Rust 侧 `http_get` / `http_get_icon` / `http_fetch` / AI 对话的错误文案。
  网络正常时行为完全不变，只在原本就要报错的那条路径上多两次重发。
- **小程序端**：该插件标记为 `unavailable`，不受影响；`pluginCatalog.js`（桌面 + 小程序）由
  `sync-plugins.js` 同步插件版本号 1.26.1。
- 需要重新构建桌面版才看得到新文案（插件 JS 与 Rust 都打进二进制）。

## 数据迁移

无。`jwCache` 结构、`jwState` 字段、教务请求体配方都没动。
