# U-Time v0.105.0

> 本版是 v0.102.0 之后的**第一次发版**：v0.102.1 / v0.103.0 / v0.104.0 三批改动已提交但当时未出包，
> 一并打进这一个 release。逐版细节见 `CHANGELOG-v0.102.1.md`、`CHANGELOG-v0.103.0.md`、`CHANGELOG-v0.104.0.md`，
> 本文只写 v0.105.0 新增的那一批。

## 更新内容

### 仓库卡片可以改名、加备注、换图标（`github-readme` 1.0.0 → 1.1.0）

**GitHub 文档**插件此前只有「owner/仓库名」一种显示口径，卡片上想区分「同一组织的两个仓库各自干什么」、
或者想把 `some-long-repo-name` 缩写成一句人话，都只能看原名。本版给卡片加了右键菜单：**修改名称 / 添加备注 / 更改图标**。

#### 一、菜单自己画，输入借 `window.prompt`

插件拿不到宿主的菜单与弹窗 API，所以弹层由插件自绘：一级是动作表，选「更改图标」进二级图标面板
（12 个候选 emoji + 「无」，写法同 `dorm-duty` 的导入子菜单）。改名与备注走 `window.prompt` ——
Android 侧 `Tauri` 生成的 `RustWebChromeClient` 实现了 `onJsPrompt`，**APK 上这个输入框是真能用的**；
拿不到弹窗时按「取消」处理，不会把改名流程卡死。

三个字段都是本机显示层的修饰：`alias` 截 40 字、`note` 折行空白后截 80 字、`icon` 截 8 码点，
存进插件自身 storage。卡片与阅读页共用同一个 `repoTitle()`，改完名两处一起变，
未改名时仍是 `owner/仓库名`。

#### 二、手机上长按也能弹，但要多做三件事

1. **Android WebView 长按普通节点不一定触发 `contextmenu`**，只能自己数时间（550 ms），
   按下后挪开 10 px 以上算滑动、不弹菜单 —— 与 `dorm-duty` 的标签页同一套判据。
2. **长按之后浏览器还会补一个 `click`**，不吞掉的话长按的同时顺手把阅读页打开了，
   所以有个 `longPressed` 标志只吞一次；新的一次按下就是新意图，必须先清掉残留标志，
   否则会白吞掉一次正常点击。
3. **右键只对卡片 `preventDefault`**，别处保留浏览器原生菜单 —— 往输入框里粘仓库链接还要用。

#### 三、浮层的安全区得自己让开

菜单是 `position: fixed`，落在 `.view` 的 padding box 里，**宿主的四条边拦不住 fixed 后代**
（AGENTS.md §「插件界面的安全区」列出的唯一漏网点）。所以弹层定位时按视口坐标夹取，
并读回 `--sat / --sab / --sal / --sar` 四边各自减掉（读法同宿主 `bottomInsetPx()`），
CSS 里刻意不写 `top/left/right/bottom` —— 一写就等于把安全区当 0，手机上会压进状态栏。

顺带两处约定：菜单项用独立的 `data-gh-menu-act` / `data-gh-icon` 命名空间，否则事件委托里
`[data-gh-open]` 分支会先把点击抢走；菜单的收起（点别处 / 滚动 / Esc / 改窗口尺寸）
绑在 `document` 上且只绑一次，因为宿主元素每次 `render` 可能重建，绑在 `el` 上会随重建丢失。

每个动作改完都给一条 `tide.notify` 反馈（显示成什么、恢复成什么、备注是否清空），不静默生效。

## 影响范围

- 只影响 Windows 与 Android 两端的「GitHub 文档」插件；小程序端该插件标记 `unavailable`，无改动。
- `pluginCatalog.js`（桌面 + 小程序）由 `sync-plugins.js` 同步到 1.1.0，manifest description 补了卡片菜单一句。
- 其余仓库行为未变；本版另含 v0.102.1 → v0.104.0 三批已提交的改动。
- 新增测试组：`scripts/test-github-readme.mjs` 的「卡片别名备注图标」断言（截断长度、共用显示名、菜单动作互不抢事件）。

## 数据迁移

无。插件 storage 的仓库记录新增 `alias` / `note` / `icon` 三个可选键，老数据没有这些键时行为同升级前
（显示 `owner/仓库名`、无备注、无图标）；「移除仓库」逻辑不变，改名与备注不碰远端仓库。
