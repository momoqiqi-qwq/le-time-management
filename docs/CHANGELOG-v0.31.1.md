# Le时间管理 v0.31.1

## 改了什么

### 修复：课程表插件点开只有一行「此版本尚未包含原版课表运行时」

现象（用户反馈）：装上 0.31.0 之后点侧栏的**课程表**，右侧一片空白，只有一行提示：

> 此版本尚未包含原版课表运行时。原版界面需要安装包含原生课表的客户端。

插件自带的整套课表界面（周课表 / 今日课表 / 多课表 / 课程管理 / 教务导入 / 个性化 / 备份）**完全没出现**，看起来像插件坏了。

### 根因：原生渲染是「替代」，而运行时默认不在包里

`src/pluginHost.js` 在 Tauri 环境下**无条件**把课表插件的渲染函数换成了原生宿主：

```js
// 旧写法
...(pid === "shiguang-schedule" && api.isTauri ? { render: renderNativeSchedule } : {})
```

而 `renderNativeSchedule()` 要去找 `resource_dir()/native/shiguang/ShiguangSchedule.exe`
（原版 Kotlin/Compose 工程，jpackage 产物，**313 MB**：237 MB jar + 76 MB JRE）。

关键在于这个运行时**只有专门的打包配置才会带上**：

| 打包配置 | 是否带 `native/shiguang/` | 用途 |
|---|---|---|
| `src-tauri/tauri.conf.json`（默认） | ❌ 无 `bundle.resources` | 常规 Windows / Android 包 |
| `src-tauri/tauri.shiguang.conf.json` | ✅ `"resources": { "native/shiguang/": "native/shiguang/" }` | `tools/build-native-schedule.ps1 -Installer` 打「含原版课表的包」 |

于是默认包里的结果必然是：`status.available === false` → 只剩那行提示。**用户装的是默认包，却拿到了专门包的界面行为。**

`src/nativeSchedule.js` 里另有 `#[cfg(debug_assertions)]` 的 dev 兜底（找 `CARGO_MANIFEST_DIR/native/shiguang/`），所以 `npm run tauri dev` 是好的 —— 问题只在**打出来的包**上暴露，这也是它能溜过开发期检查的原因。

### 改法：原生渲染降级成「增强」，探测不到就交回插件界面

- **`src/nativeSchedule.js`**：签名由 `renderNativeSchedule(container)` 改为
  `renderNativeSchedule(container, ctx, fallback)`，新增 `degrade()` 分支：

  - `status.available === false`（默认包）→ 拆掉原生侧 DOM / 监听、还原 `.plugview` 容器样式，把视图交给 `fallback`；
  - `status` 探测本身抛错（例如 Android 包里没注册 `NativeSchedulePlugin`）→ 同样回退，不再把原始报错摆到界面上；
  - 插件界面**自己**抛错 → 显示「课程表界面加载失败：…」而不是白屏；
  - 完全没有 fallback → 显示「…插件界面也不可用」而不是静默空白；
  - 运行时真的可用（含原版课表的包）→ 行为不变，照旧嵌入原生窗口。

  清理函数也一并收口：只有**真的起过**原生窗口才发 `hide`（否则 Android 会白跑一趟原生插件）。

- **`src/pluginHost.js`**：接管时把插件自己的 `render` 传下去当兜底：

  ```js
  { render: (el, ctx) => renderNativeSchedule(el, ctx, def.render) }
  ```

  这等于恢复了 `docs/CHANGELOG-v0.3.0.md` 里「Windows 与 Android WebView 共用同一 HTML/CSS/JS 实现」的语义，
  同时保留了原生包的能力 —— 不再是非此即彼。

### 验证

- **新增 `scripts/test-native-schedule.mjs`（可执行的行为测试）**：`src/api.js` 只读
  `window.__TAURI_INTERNALS__`、无外部依赖，所以在 Node 里用一套极简 DOM 直接驱动**真源码**，覆盖四条分支：
  运行时缺失 / 探测抛错 → 必须回退且不留死面板提示、必须还原容器样式、清理函数必须调用插件自己的清理；
  运行时可用 → 必须发 `show` 且带合法 bounds、不得回退、切换视图要发 `hide`；
  插件界面自身抛错 / 没有兜底 → 必须给出可读提示。测试脚本数 16 → **17**。
- **`scripts/test-schedule.mjs`** 补静态守卫：`renderNativeSchedule` 必须收到插件的 `render` 当兜底，
  `nativeSchedule.js` 里不许出现「只显示提示就结束」的写法。
- **真浏览器实测**：用 `dist/` 里发布的真产物（真 `main.js` + 真打包 CSS）渲染插件界面，
  浅色 / 深色各截一张 —— 周课表、10 个节次、周次导航、底部三视图导航、FAB 都正常，深色下文字可读。

### 影响与注意

- 用户手上的 **0.31.0 及更早的默认包**都会看到这个死面板；升级到 0.31.1 即恢复。
- 两条路的**数据不互通**：插件界面用 `tide.storage`，原版 Compose 用 Room 数据库，二者没有做迁移
  （见 `docs/shiguang-native-port.md` 的「仍须完成的差异」）。想让课程表和原版完全一致，
  仍需要单独构建带运行时的包。
- `src-tauri/native/shiguang/` 是 **gitignored 的本地资产**，313 MB，仓库里没有。
