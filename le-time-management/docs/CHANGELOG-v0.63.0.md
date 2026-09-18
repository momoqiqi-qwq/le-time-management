# v0.63.0 · RSS 信息流两处入口：卡片能就地读原文、顶栏能一键加源

## 先说清楚这是什么

都在 `public/plugins/rss-reader/`，两笔都不动数据模型：

1. **卡片档新增「展开正文」按钮** —— 点开直接抓原文页面、抽正文、在卡片里读完，不必跳浏览器；
   展开/收起动画与 警大通知 / 学校通知 的同一类操作**逐字同款**（插件 1.2.0 → 1.3.0）。
2. **顶栏「来源」那一行行尾新增「＋ 添加源」** —— 添加与删除本来就在折叠的「订阅管理」里，
   只是入口藏太深，这颗按钮负责把它带出来（插件 1.3.0 → 1.4.0）。

## 版本号为什么落到 0.63.0

本笔开做时工作树是未提交的 0.60.0 / 0.60.1（网盘同步引导、竞赛消息筛选自愈，另有会话在改）。
新增功能按铁律一走 minor，不能压进别人的补丁号，所以先记为 0.61.0；
期间另一会话把三端推到 **0.62.0**（仍是他那笔网盘同步）并顺手删掉了当时那份 `CHANGELOG-v0.61.0.md`。
这里以 **0.63.0** 重记本笔。**若提交时又要改号，连本节标题一起改**，别让包版本与说明文件各说各话。

## ① 卡片「展开正文」（`rss-reader` 1.2.0 → 1.3.0）

卡片档原来**没有**展开入口：摘要 `<p class="rss-snip">` 上挂了 `data-act="expand"`，
必须恰好点到那两行摘要文字才放开，而且是 `-webkit-line-clamp:unset` 瞬间切换 —— 没按钮、没动画、看不出可点。

现在：

- 摘要下面一颗真的 `.rss-expand`，文案 **展开正文 ⇄ 收起正文** 翻转，`aria-expanded` 同步；摘要文字仍是入口之一。
- 点开 `tide.http.get(it.link)` → `tide.util.web.extractArticleText()` 抽正文，渲进 `.rss-body`
  （`max-height:320px` 内滚）。语义与 警大通知 / 学校通知 的「展开正文」一致 —— **抓的是原文全文，不是把 220 字摘要放开**。
- **权限一条没加**：`http` 早就为抓 feed 声明过，`extractArticleText` 宿主侧同样只认 `http`。
- 正文**只留内存**（`state.bodies`，按 link 索引）：一篇几 KB 到几十 KB，进 storage 会把 `letime-data` 撑爆，
  而且原文随站点改版会变，落盘只会留下过期快照。
- 抓失败**不进缓存**，错误只写在这张卡片上并提示「再点一次可重试」；抓过的再展开不重抓。
- 没有 `link` 的条目整个按钮不渲染（不留点了必然报错的死控件）；紧凑 / 标题档不渲染 ——
  那两档是一行式扫描视图，塞一段可滚正文会把行高撑乱，且沿用摘要「JS 侧就不出」的规律，不是渲染了再 CSS 藏。

### 动画：与本仓库既有插件同一套

```css
.rss-detail-shell{display:grid;grid-template-rows:0fr;opacity:0;margin-top:0;
  transition:grid-template-rows .42s cubic-bezier(.2,.78,.2,1),opacity .24s ease,margin-top .42s cubic-bezier(.2,.78,.2,1)}
.rss-card.open .rss-detail-shell{grid-template-rows:1fr;opacity:1;margin-top:9px}
.rss-detail-clip{min-height:0;overflow:hidden}
.rss-detail{…;transform:translateY(-6px);transition:transform .36s cubic-bezier(.2,.78,.2,1)}
.rss-card.open .rss-detail{transform:translateY(0)}
.rss-expand::after{content:"⌄";…;transform:translateY(-1px);transition:transform .36s cubic-bezier(.22,.8,.22,1)}
.rss-card.open .rss-expand::after{transform:translateY(1px) rotate(180deg)}
```

三家的 `transition` 声明现在**字符串相等**（测试就是这么断言的）。
「减少动效」不用插件配合：宿主 `:root[data-ui-motion="reduced"] *` 已把全站过渡压到 `.001ms`。

### 三处实现约束，别改回去

1. **展开 / 收起一律就地改 `.open` 类，不走 `paintList()`。** 后者会整体重写 `ui.list.innerHTML`，
   新卡片一出生就带着 `.open` 终态，过渡根本不播放（就是「闪一下」）。与 `school-notice.setItemOpen()` 同源做法。
   正文写回时按 id 重新查**当前**那张卡片（`liveCard()`）：抓取期间发生过刷新 / 改筛选 / 换样式的话，
   手里那个元素已离开文档，不重查就会永远停在「正在读取正文…」。
2. **展开态要 `content-visibility:visible`。** 卡片默认 `content-visibility:auto` + `contain-intrinsic-size:auto 88px`，
   不退出这条，展开的卡片滚出屏幕会被按 88px 占位收掉、滚回来就跳。
   顺带不再继承已读的 `opacity:.62` —— 正在读的长文不该被调暗。
3. **正文区里的点击不能被兜底分支吃掉。** 委托的兜底是 `openItem()`（跳浏览器），读到一半选个字就被踢走；
   落点在 `.rss-detail-clip` 内直接 return。展开按钮是它的兄弟节点，不受影响。

### 一处实测结论：为什么正文区是从 0 收放，而不是「2 行 → 全文」

用真实浏览器逐帧 seek 过 grid 轨道过渡（`output/probe-grid-track.html`，一次性脚手架、gitignored）：

| 收起态轨道 | 展开态 | 高度序列（0 / 50 / 105 / 210 / 420ms） | 结论 |
|---|---|---|---|
| `41.25px`（两行） | `1fr` | `41 → 41 → 69 → 69 → 69` | 照样生成 CSSTransition，但走 **discrete 插值**：前一半停在原高，到 50% 一次性跳到位 |
| `2lh` | `1fr` | `46 → 46 → 69 → 69 → 69` | 同上，换 `lh` 单位也救不了 |
| `0fr` | `1fr` | `0 → 32 → 53 → 65 → 69` | **连续插值** ✅ 与 `cubic-bezier(.2,.78,.2,1)` 的前凸形状吻合 |

三段用同一份内容（都长到 69px），可直接对比。⇒「2 行摘要原地长到全文」做不出同款动画：
要么 discrete 跳变，要么换 `max-height` / JS 测高（全站第三种手感）。
所以取「收起态保留 2 行摘要 + 展开态追加全文」，与两个基准插件的现状一致。

**已知代价**（同样是基准插件的现状）：首次展开先长到「正在读取正文…」的高度，全文回来时有一次跳变；
再次展开（正文已在 DOM 里）才是完整的 0fr→1fr 全文高度动画。

## ② 顶栏「＋ 添加源」（`rss-reader` 1.3.0 → 1.4.0）

「来源」那一行行尾常驻一颗 `＋ 添加源`（`.rss-add-src`，**虚线**描边 —— 与实心边框的源 chip 区分开，
读起来是「这里能加」而不是「又一个源」）。点一下 = 展开「订阅管理」+ 光标落到地址输入框 + 带到视野内。

- **只是把手，不是第二套逻辑**：不自己添加、不自己删除；`添加` 按钮、每行的
  `启用/停用 · 改名 · 删除` 一律留在原处，测试把这四样都钉住了（顶栏加了入口也不许把它们拆走）。
- `focus({ preventScroll: true })` 之后再 `scrollIntoView({ block:"nearest", behavior:"smooth" })` ——
  少了 `preventScroll`，浏览器自己那一下跳转会和 `scrollIntoView` 抢，观感是跳两次。
- 窄屏（≤520px）把「添加源」三个字收掉只剩 `＋`：那一行要给 chips 让位，靠 `title` 与虚线圈说明用途。
  `title` 不能省 —— 收字之后读屏与悬停提示全靠它。

## 探针顺手修掉的一个真 bug

第一版把「写正文」留在 `try` 里、「清 loading」放在 `finally`，而 `bodyHtml()` 第一眼就是看 loading ——
结果抓取已经返回，卡片还是永远停在「正在读取正文…」。这是**在真浏览器里跑 `render()` 点出来的**，
纯 `cardHtml()` 字符串断言看不见。现在改成先摘 loading 再写正文，并补了变异验证：
把顺序改回去，第 ⑨ 组断言立刻红（`正文要真的写进详情区，实际：<div class="rss-body">正在读取正文…</div>`）。

## 影响哪端

- **Windows / Android**：RSS 视图。插件版本进了入口 URL 的 `?v=`，APK 覆盖安装后 WebView 才会弃掉旧 `main.js` 缓存。
- **微信小程序**：`rss-reader` 仍是 `unavailable`，无适配页改动。
- `manifest.json` 的 version / description 变了 ⇒ 已重跑 `node ../tools/sync-plugins.js`，
  桌面 `src/pluginCatalog.js` 与小程序 `core/pluginCatalog.js` 同步。
  （顺带把之前几笔漏同步的插件清单一起带齐了 —— 那几家升过 manifest 却没跑生成器。）
- 窄屏无横向溢出（实测 `scrollWidth - clientWidth = 0`）。

## 有没有数据迁移

**没有。** `expanded` / `bodies` / `bodyLoading` 全在内存，一个字节都不落 storage。

## 校验

```
node ../tools/sync-version.js --check              ✓ 三端版本一致：v0.63.0
node ../tools/gen-theme-dark.js --check            ✓ 派生调色板已同步（未新增令牌）
node ../tools/build-schedule-plugin.js --check     ✓ 生成物与源一致
node ../tools/sync-android-native.js --check       ✓ Android 原生镜像一致
node ../tools/sync-plugins.js                      ✓ 15 个内置插件清单已同步
node scripts/test-rss-reader.mjs                   ✓ 二十节全绿
npm test                                           ⚠ 见下
```

> **`npm test` 当时跑不完，但不是本笔的问题**：`test-gx-news.mjs`（侧栏链接去噪后应有 9 条，实得 12）
> 与 `test-wechat-push.mjs`（断言 gx-news 首次同步不广播历史，正则对不上 gx-news 现有写法）两红，
> 都落在 `gx-news` / `wechat-push` 那两笔**同时在改、尚未提交**的改动里，与 RSS 无关；
> `run-tests.mjs` 遇第一个红就退，所以把这两个排除后**其余 52 个脚本逐个真跑全绿**。
> 提交这一版之前要先把那两笔理顺（或等它们自己变绿）。

### `scripts/test-rss-reader.mjs` 新增两节

**第十九节 · 展开正文**

- 收起 / 展开两态的 `cardHtml()` 产物：按钮在、文案翻转、`aria-expanded` 与详情壳 `aria-hidden` 同步、
  `open` 类挂在 `.rss-card` 上（挂到摘要上则全部 `.rss-card.open` 选择器失效）。
- 抓回来的正文必须转义（原文里贴的 `<script>` 只是文章的一部分）；换行原样带过交给 `pre-wrap`。
- 无 `link` 不渲染入口；紧凑 / 标题档不渲染。
- 🔴 `toggleBody()` 用假卡片**真跑**：成功路径正文必须落进详情区（不许停在占位文案）、按 link 入内存缓存、
  抓完摘掉 loading；403 路径错误写在卡片上、**不进缓存**（可重试）、loading 照样摘掉。
- 🔴 动画守卫：从三个插件源码各抠出 `.xx-detail-shell` 的 `transition` 声明，断言**字符串相等**；
  并钉住 `0fr` 起跳、展开态 `1fr`、箭头 `content:"⌄"` 与 `rotate(180deg)`。
- 🔴 不许重绘守卫：`kind === "expand"` 分支里出现 `paintList(` 即失败；
  正文区点击兜底与展开态 `content-visibility:visible` 各一条。
- 第十五节里 `assert.equal(manifest.version, '1.4.0')` 是故意钉死字面量的：插件内容改了必须来这里确认一次。

**第二十节 · 顶栏加源入口**

- 「订阅管理」里既有的 地址框 / 添加 按钮 / 每行 启用·停用·改名·删除 一个都不能少；
- 顶栏那颗必须是真 `<button>`、带 `title`、挂在「来源」行行尾、落在 `.rss-hero` 内（不滚到底也够得着）；
- `focusAddBox()` 真跑：`<details>` 展开、焦点落到地址框、`focus` 带 `preventScroll`，且它自己不碰 addFeed / removeFeed。

### 浏览器实测

`output/probe-rss-view.html`（gitignored）—— 直接 `<script src>` 加载**真插件**、stub 掉 `tide`
（feed 与详情页用本地假数据），跑真的 `render()` 与真的点击：

- 3 张卡片渲染出，前两张有「展开正文」、摘要两行仍在；
- 点顶栏「＋ 添加源」→「订阅管理」展开（高 276px）、`document.activeElement` 就是地址输入框；
- 点「展开正文」→ 先显示「正在读取正文…」→ 真正文落地（519 字，`stuck:false`），
  详情壳 329px、卡片 473px、文案翻成「收起正文」；
- 布局几何：收起卡片 112px、按钮独占一行且不吃动作列宽、`scrollWidth - clientWidth = 0`；
- 动画曲线在 `output/probe-rss-expand.html`（CSS 与 `cardHtml()` 产物均从 `main.js` 现取）量得
  **duration 420ms、easing `cubic-bezier(0.2, 0.78, 0.2, 1)`**，正文壳 `0 → 105 → 215 → 267 → 281 → 284px`
  连续插值，箭头 `matrix(1,0,0,1,0,-1) → matrix(-1,0,0,-1,0,1)`；正文 730px 时 `.rss-body` 收在 `clientHeight 320px` 内滚。

> 探针踩到的坑：browser-use 那个实例的文档时间线是冻结的（`requestAnimationFrame` 不触发、
> `document.timeline.currentTime` 不走），所以**按真实时间采样量不到动画**。
> 改成拿 `el.getAnimations()` 的 CSSTransition 直接写 `currentTime` 再读 `getBoundingClientRect()`，
> 才拿到上面那条插值序列。
