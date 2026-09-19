# v0.73.0 · 学校通知：站点设置卡片收进图标菜单

## 需求

> 把「站点设置卡片」（站名 / 网址 / 适配模式 / 登录网址 / 已缓存 / 刷新·编辑·登录配置·打开·删除
> 五个按钮）变成一个菜单图标放进「添加站点」那张卡片里，点图标才展开。

原来插件首屏从上到下要占三块：添加卡片、一整行站点文字标签、当前站点的设置卡片，
再往下才是真正要看的公告列表。日常只想翻公告时，那两张卡片纯属占位。

改后：**添加卡片内多一行站点图标，设置卡片默认不渲染**，公告列表直接顶上来。

## 为什么不是「再加一行图标」

第一版直觉是在原标签行旁边补图标，但那会变成两处选站点、两套心智。所以这行图标
**取代**了 `.sn-tabs` 文字标签行（含其 CSS），只留一个入口：

| 操作 | 行为 |
|---|---|
| 点当前站点的图标 | 展开 / 收起来回切 |
| 点别的站点的图标 | 切成该站点并展开（公告列表跟着换） |
| 右键图标 | 弹操作菜单，与原先完全同一套动作 |

图标沿用 v0.72.1 那套三层降级（data URL → 远程 `<img>` → 首字母方块），
`favHtml()` 三层全空时返回空串，chip 里再补一个首字母方块，不留空位。

**只有当前站点那枚图标带站名**（`.sn-chip.cur`）。收起态下整屏不再有任何地方写站点名，
而下面列的是哪个站点的公告必须看得出来 —— 这是这行图标唯一不能省的信息。
非当前站点只有 36px 见方，一行放得下十几个。

箭头是唯一的可点暗示：当前 chip 收起时 `::after` 给 `⌄`，展开后翻成 `⌃`。

## 展开态刻意不落盘

`sitePanel` 是模块级布尔，`render()` 每次进插件都置回 `false`。
理由就是这条需求的出发点：默认要看的是公告，不是站点配置。

代价是卡片一收起就整块不再渲染（`paint()` 里 `${sitePanel ? \`<section …>\` : ""}`），
所以有三处必须自己把卡片摊开，否则功能就藏在看不见的地方：

1. **读到登录页**（`readNotices()` 的 `likelyLogin` 分支）—— 列表只剩一句「请先完成登录」，
   而登录框长在卡片里，不展开等于把人堵死。
2. **右键菜单的「编辑」「登录配置」** —— 两个框都在卡片内，收起时点了像按钮坏了。
3. **添加新站点** —— 下一步大概率就是配登录，直接摊开。

另外「登录网址」输入框也在卡片里，而 `paint()` 是整块重建 DOM 的：
收起前先把输入框的值写回 `site.loginUrl` 并 `save()`，否则填一半的网址会凭空消失。

## 展开动画为什么用 animation 而不是 transition

公告条目的展开走的是 `grid-template-rows: 0fr → 1fr` 的 transition，且刻意**不走 `paint()`**
（元素一直挂着，就地切 `.open` 类，transition 才播得出来）。

站点卡片反过来：收起态是**整块不渲染**（要的就是省那块纵向空间），元素是新建的，
transition 没有起始帧可插。所以用 `.sn-site{animation:sn-site-in …}`，挂载即播。
收起是瞬时消失 —— 这里没有「往回收」的视觉目标，不做对称动画。

## 验证

`scripts/test-school-notice.mjs` 加了第七节，守的是「改坏了会静默失效」的接线：

- 图标行必须在添加卡片**内**（卡片闭合 `</div>` 之后才是右键菜单）；
- `.sn-tabs` 与 `.sn-tab{}` 不得残留（否则又长出第二个入口）；
- `</section>` : ""} 后面紧跟 `.sn-toolbar` —— 只收卡片本身，工具条和列表收起态照常渲染；
- 上面那三处自动展开、以及收起前保存登录网址；
- chip 保留 `data-site`（右键菜单和「点别处收起」都靠它判定）；
- 箭头与 `.sn-site` animation 的 CSS 契约。

左键点标签那条旧断言按新语义改写了（原来是无条件 `switchSite`）。

**真浏览器逐条点过**（`output/sn-chip-probe.html`，tide 全桩掉、不发网络）：
默认收起 ✓、点图标展开 ✓、再点收起 ✓、点别的图标切站点并展开 ✓、
收起态右键 → 菜单 →「编辑」自动展开 ✓、桩出登录表单后点刷新 → 卡片自己摊开 ✓、
登录网址收起再展开后值还在（且已落盘）✓。

**无数据迁移。** `sitePanel` 只在内存，`sites` 存储结构没动。

## 版本号为什么是 0.73.0 而不是 0.72.2

`0.72.1`（APK 上学校网站图标拿不到）是**另一条在途、尚未提交**的工作，
插件清单也被它占到 `1.4.1`。按仓库惯例不抢对方刚写的号，取更高的下一个 minor：
`0.72.1 → 0.73.0`，插件 `1.4.1 → 1.5.0`。

## 影响面

只动 `public/plugins/school-notice/`（插件本体 + manifest 描述），桌面与 Android 同源生效；
小程序侧只有 `pluginCatalog.js` 里的清单描述跟着 `sync-plugins.js` 刷新，无独立实现。

---

## 并入：APK 上学校网站的图标拿不到（原独立记在 `CHANGELOG-v0.72.1.md`）

> 这条在途工作被本版本合并（见上面「版本号为什么是 0.73.0」）。
> `school-notice` 的插件版本随之到 **1.5.0** —— 本条的图标改动与
> 本版本的 UI 改动同属这一个插件，共用一个号。

### 需求

> apk 学校通知网站插件无法获取图标。

插件**本体**的图标是好的 —— 把 `LeTime-0.72.0-universal.apk` 里的 `libletime_lib.so`
解出来扫资源表，`/icons/plugins/school-notice.png` 和其它 13 个插件图标一起嵌着。
拿不到的是插件页里**学校网站自己的小图标（favicon）**：站点标签页、站点头部、
每条公告标题前那个。表现是退化成首字母方块。

### 根因：桌面端永远复现不了的那类问题

图标地址是 `parseSiteMeta()` 从 `<link rel="icon">` 解析出来的**绝对地址**，
渲染成 `<img src="http://…/favicon.ico">`。三条事实叠在一起：

1. **Android 上页面来源是 https。** Tauri 用 `WebViewAssetLoader`，而
   `RustWebViewClient.kt` 构造它时没指定 scheme ⇒ 走默认的 `https` ⇒
   页面来源是 `https://tauri.localhost`。
2. **WebView 默认禁混合内容。** 自 API 21 起 `mixedContentMode` 默认
   `MIXED_CONTENT_NEVER_ALLOW`，`MainActivity` 里也没动过它 ⇒ https 页面里的
   `http://` 子资源被**静默拦掉**（不报错、不触发 error 之外的任何提示）。
3. **release 版还叠了一道。** `build.gradle.kts` 的
   `manifestPlaceholders["usesCleartextTraffic"] = "false"`（debug 才是 true）
   ⇒ 网络栈层面同样拒绝明文。

而**桌面端页面来源是 `http://tauri.localhost`** —— 明文页面加载明文图片不算混合内容，
所以同一个站点在 Windows 上图标正常、在 APK 上消失。中国高校网站大量是 http，
所以这个 bug 覆盖面不小，且**只看桌面端永远复现不了**。

### 改法：把图标搬到原生侧抓

新增 `http_get_icon` 命令（`src-tauri/src/lib.rs`）：reqwest 抓字节 → 判 MIME →
base64 拼成 data URL 返回。**完全不受 WebView 策略约束**，顺带绕开防盗链；
data URL 能随插件 storage 落盘，离线也显示得出来。

判 MIME 的 `icon_mime()` 有两条硬规矩：

- **魔数优先，认不出才退到响应头。** 高校站点的图标大量由老 IIS / 旧 CMS 提供，
  `Content-Type: text/plain`、`application/octet-stream` 甚至空值都常见，
  只信头会把好图标判死；反过来只信魔数又认不出 webp。
- **拒 SVG、拒 HTML。** 站点把 `/favicon.ico` 回落到首页 HTML 是最常见的坑 ——
  收进来等于把一段网页内联成图片。SVG 是文档不是位图，同样拒。

另加 `MAX_ICON_BYTES = 256 KB` 封顶：不封顶的话一个指向大文件的 URL
能把几十 MB 灌进 `data.json`。

插件侧（`school-notice` 1.4.1）改成三层降级：

| 层 | 条件 | 渲染 |
|---|---|---|
| ① | 有抓好的 data URL | `.sn-fav.has-icon`，走 `--sn-icon` CSS 变量 |
| ② | 只有远程地址 | 仍是 `<img src=远程>`，失败由 error 委托加 `.no-img` 兜底 |
| ③ | 都没有 | 首字母方块 |

第 ① 层用 CSS 变量而不是内联 `<img>` 是有原因的：公告列表上百条，每条内联一份
base64 会让 DOM 体积成倍涨。变量设在 `.sn-list` 容器上，列表项继承同一份。

抓取时机三处都接上了：**添加站点**、**刷新通知**、以及 `render()` 里对
**存量站点**的后台补抓 —— 升级前保存的站点只有远程地址，不补的话用户在 APK 上
永远看不到图标，还得手动删了重加。

### 顺手审计：同一个根因的第二个受害者 `web-collector`

修完 school-notice 后按同一口径（`<img src>` / CSS `url()` / `@font-face` 指向外部
**http** 的都算）扫了一遍全部 15 个插件，发现 `web-collector`（网页收集）同病，
而且更直接 —— 它的 `DEFAULT_ITEMS` 里第一条预置条目就是
`iconUrl: "http://daxue.qiyemulu.cn/favicon.ico"`，**开箱即在 APK 上拿不到图标**。

复用同一套机制（插件 1.2.2 → **1.2.3**）：

| 位置 | 改法 |
|---|---|
| `favicon(item)` | 取值改成 `iconDataOf(item) \|\| String(item.iconUrl \|\| "")` —— 有 data URL 就用它，退回远程地址 |
| `fetchIconData(iconUrl)` | 新增。**失败不抛**（返回 `""`）：调用它的是「识别 / 换图标」主流程，图标拿不到不该把整条流程带塌 |
| `inspect()` | 返回 `{ url, ...meta, iconData }` |
| `fetchIcon()` | 返回 `{ iconUrl, iconName, iconData }` |
| `render()` | 对**存量条目**后台补抓（升级前收藏的条目只有远程地址） |

`fetchIcon()` 的返回字段是有契约的：`refreshIcon()` 里是 `Object.assign(item, got)`，
多回一个 `title` / `note` 就会覆盖用户手改过的内容。所以测试钉的是
「**必须回图标三件套，且不许回 `title`/`note`/`host`**」——
`iconData` 只落在图标上，是安全的。

其余 13 个插件没发现同类问题（不引用外部 http 图片）。

### 验证

- 新增 `scripts/test-icon-fetch.mjs`（已进 `npm test`，现共 57 个脚本）：
  - `icon_mime` 从 `lib.rs` **切原文**用 `rustc --test` 真跑（魔数优先、拒 HTML/svg、
    头参数剥离、svg 伪装成 `image/*` 也要拒）；
  - `favHtml` 从插件里切原文用 `new Function` 真跑（三层降级、`inline=false`
    不内联 base64、脏值不能突破 style 属性）；
  - `web-collector` 的 `favicon` 同样切原文真跑（data URL 优先、退回远程地址、都没有才走 FA 兜底）；
  - 接线契约（命令注册、`tide.http.getIcon` 与权限校验、两插件各自的调用点、CSS 规则、
    `fetchIcon` 只回图标字段不回 `title`/`note`）。
- **变异测试 10/10 捕获**：把「响应头兜底不筛 image/*」「不拒 svg」「废掉 PNG 魔数」
  「iconDataOf 退回只查前缀」「favHtml 忽略 inline=false」「容器不设 --sn-icon」
  「刷新不补抓」，以及 web-collector 侧的「favicon 不用 data URL」「fetchIcon 不回 iconData」
  「fetchIcon 顺手回 title」逐条改坏，断言全部失败。
  （这次用的是**一次性**变异脚本，跑完即删，没留在仓库里 —— 仓库里只有
  `test-theme-transition.mjs` 一个脚本内嵌了可复跑的变异循环。要复验得重写一份。）
- **`test-web-collector.mjs` 的旧断言同步**：它原本钉 `fetchIcon` **只回两个字段**
  （`{ iconUrl, iconName }`），加了 `iconData` 后这条会红。已改成钉真正的契约
  ——「回图标三件套，且**不许**回 `title`/`note`/`host`」，比原来那条更贴住意图。
- **`test-theme-transition.mjs` 的两处真缺陷**（顺带修掉）：
  - 变异循环的**还原**写在 `try` 外面且不回读，Windows 文件占用（errno -4094）时还原失败
    ⇒ 变异**留在了 `src/theme.js` 里**（实测发生一次，后续 `npm test` 报一堆莫名其妙的状态栏
    失败）。改成 `try/finally` + 写入与还原都回读 + 重试。
  - M4 的正则写 `;\n`，而工作树是 **CRLF** ⇒ 该变异**从未命中过源码**（等于这个洞从来没被测到）。
    改成 `;\r?\n`，现在真被拦下了。

- **真浏览器量过 CSS 链路**（`output/icon-css-probe.mjs`，无头 Chrome，CSS 从插件源码原文提取）：
  字符串断言只能证明 HTML 长什么样，证明不了图标画得出来 —— `.sn-fav{background:var(--paper)}`
  是简写，会把 `background-image` 重置成 `none`，只有 `.sn-fav.has-icon` 赢下来才生效。
  实测四条：容器变量继承 ✓、元素内联 ✓、标签页 14px（`.sn-tab .sn-fav` 与
  `.sn-fav.has-icon` 特异性相同，前者写在前面不吃掉背景）✓、反面（非 has-icon 的两个
  必须是 `none`）✓。
- `cargo check` 通过；`sync-version.js --check` / `gen-theme-dark.js --check` /
  `build-schedule-plugin.js --check` / `sync-android-native.js --check` 全绿；
  `npm test` 全绿。

**无数据迁移。** 旧站点下次刷新（或下次打开插件）时自动补上 data URL；
补不上就维持首字母兜底，不会更差。

### 附：一处顺手加固

`iconDataOf()` 一开始写的是 `startsWith("data:image/")`。写断言时发现
`data:image/png;base64,x" onload="alert(1)` 这种脏值能**直接突破 style 属性** ——
前缀检查拦不住它。改成严格校验「`data:image/<非 svg>;base64,<只含 base64 字符>`」，
因为真正的约束是 **base64 字母表里没有引号**，而不是前缀长什么样。

---

## 并入（续）：web-collector「应用内显示」碰到 http 明文站点会白板（插件 1.2.4）

修完上面的图标问题后，按同一口径把 15 个插件扫了一遍 **DOM 级**外部 http 子资源
（`<img src>` / `<iframe src>` / CSS `url()`），又抓到**同一个根因的第三个受害者**。

`web-collector` 的「应用内显示」直接挂 `<iframe src="${item.url}">`，而它的**默认打开方式
就是「应用内显示」**（`DEFAULT_OPEN_MODE = "inside"`），**内置预置条目第一条又是
`http://daxue.qiyemulu.cn/`** ⇒ 在 APK 上点「打开」就是一块空白。

APK 上页面来源是 `https://tauri.localhost`，http 的 iframe 被当**混合内容**静默拦掉；
桌面端页面来源是 http，同一个地址嵌得出来 —— 又是那个「只看桌面端永远复现不了」的签名。

**先排除了一个方向**：不是 `X-Frame-Options` 的锅 —— 实测 `daxue.qiyemulu.cn` 与
`tem.fltonline.cn` 都回 200 且**没有** `X-Frame-Options` / CSP `frame-ancestors`，
它们本来是可以被嵌的。

**改法**：嵌不出来的地址**不挂 iframe**，改成在面板里给出原因 + 保留「浏览器打开」出口
（头部那个按钮本来就在）。判据是：

```js
const PAGE_IS_HTTPS = location.protocol === "https:";
const cleartextBlocked = (url) => PAGE_IS_HTTPS && /^http:\/\//i.test(String(url || ""));
```

🔴 判据用「**页面自己是不是 https**」而**不是「是不是 Android」** —— 后者是平台代理，
Tauri 一改 scheme 就失效；前者就是混合内容的定义本身。

⚠️ 连带一处：降级面板里也有一个「浏览器打开」，所以原来的
`panel.querySelector("[data-web-external]")` 必须改成 `querySelectorAll(...).forEach`
—— 否则降级面板里那个按钮点了没反应。这条**专门写了反面断言**钉住。

**验证**：`test-web-collector.mjs` 新增「七之二」节，并把 fixture 改成**跑两遍**
（`location.protocol` 给 `http:` / `https:` 各一次），直接验 `cleartextBlocked` 的**真值表**
—— 只做字符串断言的话，「条件少写一个」也能骗过去。
**变异测试 8/8 全部被拦下**（含「少写页面是 https」「少写地址是 http」「判定恒 true/false」
「协议判据写死成 https」「openInside 不分流」「正则去掉 i」「退回单选 querySelector」）。

**无数据迁移。** 只改渲染分支，`items` 存储结构没动。
