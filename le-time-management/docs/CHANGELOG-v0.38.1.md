# Le时间管理 v0.38.1

> 上一版：v0.38.0（应用内自动更新 + 手机端时间块真响应式）

## 本版内容

**修一个会让 Windows 版完全编不出来的编译错误。** v0.38.0 的源码推到仓库后无法构建，
本版修正后可正常出包。

### 问题：`reqwest::Response::json()` 不存在（E0599）

`src-tauri/Cargo.toml` 里 `reqwest` 是这么配的：

```toml
reqwest = { version = "0.12", default-features = false,
            features = ["rustls-tls", "charset", "gzip", "cookies"] }
```

**`default-features = false` 之后，`json` 这个 feature 没有补回列表**。
而 `Response::json()` 正是由 `json` feature 提供的 ⇒ 检查更新那段代码
（`update.rs` 解析 GitHub Release 的响应）编到就会断：

```
error[E0599]: no method named `json` found for struct `reqwest::Response` in the current scope
   --> src\update.rs:285:10
```

**修法**：改用 `response.text().await` + `serde_json::from_str`。
这不是权宜之计 —— 它**本来就是本仓库一致的写法**（`lib.rs` 里解析 AI 响应、
`lan.rs` 里解析局域网消息都这么做），因为 `.text()` 是 reqwest 的基础能力，
不需要额外 feature。顺带把解析失败的报错也带上响应原文前 300 字符，便于排查。

> **为什么之前没发现**：这段代码从未被编译过。v0.38.0 的更新功能是在工作树里写完的，
> 第一次真正跑 `build-windows.sh` 就撞上了。**「代码写完」不等于「能编过」** ——
> 这也再次印证：每次发布都要真跑构建，不能凭「上次能编」外推。

### 本版没有的功能改动

v0.38.0 描述的应用内更新与手机端时间块响应式改造，功能设计与实现**完全不变**，
只是把编不过的那一行改正。未升级的 v0.38.0 用户直接装本版即可。

## 影响面

- **Windows**：exe / MSI / 便携版均需使用本版（v0.38.0 无法构建，仓库里也没有它的产物）。
- **Android**：同一份 `src-tauri` 源码，同样受影响，本版一并重新出包。
- **微信小程序**：不受影响（不涉及 Rust 侧），但版本号随三端同步至 0.38.1。

## 校验

- `node ../tools/sync-version.js --check` ✓ 三端版本一致 v0.38.1
- `node ../tools/gen-theme-dark.js --check` ✓ 派生调色板已同步
- `node ../tools/build-schedule-plugin.js --check` ✓
- `node ../tools/sync-plugins.js --check` ✓ 12 个内置插件三端同源
- `node ../tools/sync-android-native.js --check` ✓ Android 原生代码与镜像一致
- `node ../tools/check-miniprogram.js` ✓ 静态校验全部通过
- `node scripts/run-tests.mjs` **28 个测试脚本全部通过**
