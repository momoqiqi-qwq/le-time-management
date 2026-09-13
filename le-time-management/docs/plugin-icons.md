# Le时间管理插件图标说明

> 适用：Le时间管理 v0.11.6+ ｜ 对应源码：`src/icons.js`、`src/shell.js`、`src/views/settings/plugins.js`、`public/icons/`
> v0.11.6 起图标体系改为 **Icons8 / iGoutu iOS Filled 在线图标**。旧的「Magnific 随包 PNG 白名单 + 汉字字形」两层体系已废弃，本文档已按新体系重写。

---

## 一、体系概览

v0.11.6 之后只剩**一条**图标解析链路：`appIcon(key)` → `ICONS8` 映射 → Icons8 CDN URL。

| 用途 | 实现 | 数据来源 | 出现位置 |
|---|---|---|---|
| 导航与插件图标 | `appIcon(key)` | `src/icons.js` 的 `ICONS8` 映射 | 侧栏导航方块、顶栏标题、插件市场卡片、设置页插件列表 |
| 插件元数据 `icon` | manifest / `pluginCatalog.js` 的 `icon` 字段（Font Awesome 风格名，如 `hourglass-half`） | `pluginHost.js` → `pluginViews[].icon` | **当前不参与渲染**，仅作元数据保留 |
| 小程序图标 | `miniprogram/images/{tab,plugins}/*.png` | 由 `public/icons/fontawesome/solid.svg` 离线渲染（FA 单色） | 小程序底部 tab 与插件列表 |
| 兜底 | `appIcon()` 内部候选链 | 未知 key → `market` → 隐藏 | 不会裂图、不会报错 |

要点：**桌面端不再读取 `public/icons/*.png`**；小程序也不读，它走 FA sprite。
那批 PNG 现在只剩授权台账的作用（见第八、九节），`fontawesome/solid.svg` 才是小程序图标的图形源。

---

## 二、`src/icons.js` 全文（v0.11.6）

```js
import { el } from "./ui.js";

// Icons8 / iGoutu iOS Filled icon set.
// The app uses the official Icons8 CDN so the navigation and plugin icons keep a
// consistent iOS-filled visual language across desktop and Android WebView.
// Free-use attribution is surfaced in the About / open-source notice screens.
const ICONS8 = {
  quadrant: ["four-squares", "grid-2"],
  timeblock: ["clock"],
  market: ["puzzle", "puzzle-piece"],
  settings: ["settings"],
  capture: ["inbox"],
  "shiguang-schedule": ["calendar", "calendar--v1"],
  "web-collector": ["bookmark-ribbon", "bookmark"],
  "school-notice": ["school", "classroom"],
  pomodoro: ["hourglass", "time-machine"],
  "weekly-report": ["bar-chart", "combo-chart--v1"],
  "gx-news": ["trophy"],
  "chaoxing-notify": ["graduation-cap", "student-center"],
  "cppu-notify": ["university", "school-building"],
  "wechat-push": ["wechat", "comments"],
  "cn-holiday": ["calendar", "calendar--v1"],
  "exam-calendar": ["test-passed", "calendar-plus"],
};

function iconUrl(name) {
  return `https://img.icons8.com/ios-filled/50/000000/${name}.png`;
}

export function appIcon(key, title = "") {
  const candidates = ICONS8[key] || ICONS8.market;
  let index = 0;
  let usingFallback = false;
  const img = el("img", {
    class: "app-icon icons8-app-icon",
    src: iconUrl(candidates[index]),
    alt: title || "",
    title: title || null,
    loading: "eager",
    decoding: "async",
    draggable: "false",
    "data-icon-source": "Icons8 iOS Filled",
  });
  img.addEventListener("error", () => {
    index += 1;
    if (index < candidates.length) {
      img.src = iconUrl(candidates[index]);
      return;
    }
    if (!usingFallback && key !== "market") {
      usingFallback = true;
      img.src = iconUrl(ICONS8.market[0]);
      return;
    }
    img.style.visibility = "hidden";
  }, { once: false });
  return img;
}
```

解析规则逐条：

1. **候选数组**：`ICONS8[key]` 是**候选名数组**，不是单个名字 —— 同一个语义允许准备 1–2 个 Icons8 slug。
2. **URL 模板**：`https://img.icons8.com/ios-filled/50/000000/<name>.png`。`50` 是 CDN 侧尺寸档位，`000000` 是黑色前景（iOS Filled 为单色剪影，靠 CSS `opacity` 调节视觉重量）。
3. **逐级回退**：第 1 个 slug 404 → 自动试第 2 个；候选耗尽 → 回落 `ICONS8.market[0]`（`puzzle`）。
4. **最终隐藏**：连拼图都加载失败（离线 / 被墙）→ `visibility: hidden`，只留空白占位，**不会出现裂图**。
5. **输出元素固定为** `<img class="app-icon icons8-app-icon" data-icon-source="Icons8 iOS Filled">`，实际显示尺寸由 CSS 覆盖（见第六节）。

---

## 三、key → 图标映射（16 个 key）

| key | 候选 slug（按序尝试） | 用途 |
|---|---|---|
| quadrant | `four-squares` → `grid-2` | 四象限导航 |
| timeblock | `clock` | 时间块导航 |
| market | `puzzle` → `puzzle-piece` | 插件市场导航（**同时是所有未知 key 的兜底**） |
| settings | `settings` | 设置导航 |
| capture | `inbox` | 捕获页 / 小程序捕获 tab |
| shiguang-schedule | `calendar` → `calendar--v1` | 时光课程表插件 |
| web-collector | `bookmark-ribbon` → `bookmark` | 网页收集插件 |
| school-notice | `school` → `classroom` | 校园通知插件 |
| pomodoro | `hourglass` → `time-machine` | 番茄专注插件 |
| weekly-report | `bar-chart` → `combo-chart--v1` | 周度报告插件 |
| gx-news | `trophy` | 竞赛消息雷达插件 |
| chaoxing-notify | `graduation-cap` → `student-center` | 学习通通知插件 |
| cppu-notify | `university` → `school-building` | 警大门户通知插件 |
| wechat-push | `wechat` → `comments` | 微信提醒推送插件 |
| cn-holiday | `calendar` → `calendar--v1` | 节假日插件 |
| exam-calendar | `test-passed` → `calendar-plus` | 考试日历插件 |

> `shiguang-schedule` 与 `cn-holiday` 共用同一组 slug（都是日历语义），这是刻意复用，不是笔误。

---

## 四、给插件加一个图标（3 步）

**1. 在 Icons8 / iGoutu 找图标**

打开 <https://igoutu.cn/icons/ios-filled>（或 <https://icons8.com/icons/ios-filled>），选一个 **iOS Filled** 风格的图标，从 CDN 地址里取 slug：

```
https://img.icons8.com/ios-filled/50/000000/university.png
                                            ^^^^^^^^^^ 这就是 slug
```

**2. 登记映射**：把 key 加进 `src/icons.js` 的 `ICONS8`。有备选就写第二个：

```js
const ICONS8 = {
  // ...
  "my-plugin": ["university", "school-building"],
};
```

**3. 看一眼**：`npm run tauri dev` → 侧栏、插件市场、设置 → 插件，三处确认无拼图兜底、无裂图。

> 插件没有宿主侧图标开关：只要 key 出现在 `ICONS8` 里就生效；不在映射里一律回落拼图（`market`）。
> 外部插件（数据目录 `plugins/`）走同一套 `appIcon(pluginId)`，**key 必须写进 `ICONS8`**，否则永远显示拼图。

---

## 五、插件元数据 `icon` 字段（当前不参与渲染）

`manifest.json` / `pluginCatalog.js` 里的 `icon` 仍是 **Font Awesome 风格名**，链路是：

```js
// src/pluginHost.js
pluginViews.push({ id, title, icon: plugin.icon, render, pluginId });
```

```js
// src/shell.js
const VIEWS = [
  { id: "quadrant", icon: "table-cells-large", title: "四象限", sub: "先决定，再动手" },
  { id: "timeblock", icon: "clock",          title: "时间块", sub: "把任务装进一天的格子" },
  { id: "inbox",     icon: "inbox",          title: "收件箱", sub: "自动化与待确认事项" },
  { id: "market",    icon: "puzzle-piece",   title: "插件",   sub: "扩展能力集中在这里" },
  { id: "settings",  icon: "gear",           title: "设置",   sub: "数据、提醒与插件" },
];
const PLUGIN_ICONS = {
  "pomodoro": "hourglass-half",
  "weekly-report": "chart-column",
  "gx-news": "trophy",
  "chaoxing-notify": "graduation-cap",
  "cppu-notify": "building-columns",
  "wechat-push": "comment-dots",
};
```

`viewDef()` 会把它们组装成 `def.icon`，但**没有任何渲染代码读取 `def.icon`** —— 导航按钮实际取的是：

```js
el("span", { class: "ic" }, appIcon(def.pluginView?.pluginId || id))
```

也就是说 `VIEWS[].icon`、`PLUGIN_ICONS`、manifest 的 `icon` 三处都是**遗留元数据**，改它们不会影响界面。真要换图标，改 `ICONS8`。

> 这些字段暂时保留是为了兼容旧插件清单与小程序端 `pluginCatalog.js`；将来清理时三端要一起动。

**唯一的例外**：`src/views/settings/plugins.js` 里考试日历写死了一个汉字字形 ——

```js
el("div", { class: `plug-ic${rec.id === "weekly-report" ? " alt" : ""}` },
   rec.id === "exam-calendar" ? "考" : appIcon(rec.id))
```

所以设置页的考试日历卡片显示的是「考」字，而不是 Icons8 图标。这是历史遗留分支，可以删掉。

---

## 六、各处的实际渲染尺寸

图标源统一是 50px 档的 PNG，CSS 负责缩放到目标尺寸（`src/styles.css`）：

| 位置 | 选择器 | 显示尺寸 | 容器 |
|---|---|---|---|
| 默认（`appIcon` 通用） | `.app-icon` | 30 × 30 | 行内，`object-fit: contain` |
| 顶栏标题 | `.topbar-title-mark .app-icon` | 22 × 22 | 标题左侧 |
| 侧栏导航图标 | `.nav button .ic` / `.nav button .ic .app-icon` | 38 × 38（方块底） | 圆角 11px，底色 `#EDF5F6`；选中 `#FFF2BD` |
| 插件市场卡片 | `.mcard .mi .app-icon` | 40 × 40 | 卡片 `.mi` 38×38 圆角 12px，底色 `#E1EEF3` |
| 设置页插件列表 | `.plug-ic .app-icon` | 40 × 40 | 深蓝→海蓝渐变底；`weekly-report` 用 `.alt` 紫渐变 |
| 窄屏（≤760px）侧栏 | `.nav button .ic .app-icon` | 22 × 22 | 图标方块缩到更小 |

另有两条与图标观感相关的规则：

```css
.icons8-app-icon { object-fit: contain; opacity: .9; filter: none; user-select: none; -webkit-user-drag: none; }
```

- `opacity: .9` 是 iOS Filled 黑色剪影的视觉配平 —— 纯黑在浅色底上会偏重。
- `-webkit-user-drag: none` 防止 WebView 里把图标拖出来。

**为 22px 渲染做设计**：窄屏侧栏只有 22px，细笔画会糊，选图标时优先挑轮廓粗、负空间大的。

---

## 七、小程序图标（4 个 tab + 12 个插件）

小程序**不用 Icons8 CDN**，走离线 PNG，且是 **Font Awesome 单色**风格（不是桌面端那批彩色 Magnific PNG）。
唯一的生成器是 `miniprogram/tools/sync-tab-icons.py`，它从随包的 FA sprite 渲染出两组图标：

| 输出 | 内容 | 消费方 |
|---|---|---|
| `miniprogram/images/tab/<name>{,-on}.png` | 4 个 tab（quadrant / timeblock / capture / settings） | `miniprogram/app.json` 的 `tabBar.list[].iconPath` / `selectedIconPath` |
| `miniprogram/images/plugins/<id>.png` | 12 个内置插件 | `miniprogram/pages/plugins/index.js` 与 `pages/plugin/index.js` 拼 `/images/plugins/${id}.png` |

关键片段：

```python
sprite = package_root / 'le-time-management/public/icons/fontawesome/solid.svg'
icons = {'quadrant': 'table-cells-large', 'timeblock': 'clock', 'capture': 'inbox', 'settings': 'gear'}
colors = {'': '#8A979E', '-on': '#0F4C5C'}          # 常态灰 / 选中深青
# 插件图标读 manifest 的 faIcon（无则 icon）
plugin_icons[data['id']] = data.get('faIcon') or data.get('icon') or 'puzzle-piece'
render(symbol_id, '#0F4C5C', 50).save(plugin_out / f'{plugin_id}.png')
```

- tab 图形渲染成 58×58，画布 81×81 居中；插件图形 50×50，画布 81×81。
- 配色是**写死的单色**：常态 `#8A979E`、选中 `#0F4C5C` —— 所以「选中态」在图形上是有区分的（不是只靠文字变色）。
- 重新生成：`python miniprogram/tools/sync-tab-icons.py`（需要 `Pillow` + `cairosvg`）。
- 插件 `icon` / `faIcon` 必须能在 `solid.svg` 里找到同名 `<symbol>`，否则脚本抛 `Font Awesome symbol not found`。
- v0.11.6 已移除长辈照护，`icons` 字典里的 `'elder': 'heart'` 已删除。

> **注意有两套同名脚本，别搞混**：根目录 `tools/sync-tab-icons.py` 是工作区早先自建的**彩色 Magnific 方案**（从 `public/icons/*.png` 缩放），
> 它**不生成** `images/plugins/`，且若运行会把上面的单色 FA 图标覆盖成彩色版。小程序图标以 `miniprogram/tools/` 为准。

---

## 八、授权与署名（硬性要求）

| 资源 | 授权 | 署名位置 |
|---|---|---|
| 主导航与插件中心图标 | **Icons8 / iGoutu iOS Filled** · Icons8 License（免费使用需署名） | `src/aboutData.js` → 设置 → 关于；链接 <https://igoutu.cn/icons/ios-filled> |
| `public/icons/*.png`（小程序 tab 素材） | Magnific（原 Freepik）Lineal Color | `public/icons/ATTRIBUTION.md` + `public/icons/credits.json` |

台账文件说明：

| 文件 | 作用 |
|---|---|
| `public/icons/credits.json` | 结构化台账：`key / author / source / cdn / sha256`（11 条） |
| `public/icons/ATTRIBUTION.md` | 人类可读清单：`- <key>: [作者](来源页)` |
| `src/aboutData.js` | 设置页「关于」的开源清单，Icons8 与 Font Awesome 都在这里声明 |

`sha256` 记录的是**落地 PNG 文件**的哈希，用于确认素材未被意外替换：

```powershell
(Get-FileHash le-time-management/public/icons/quadrant.png -Algorithm SHA256).Hash.ToLower()
```

红线：素材遵循原作者与平台许可，**不得把素材作为独立图标库转售**；二次分发本项目时保留 `ATTRIBUTION.md` 与设置页署名。

---

## 九、当前 PNG 清单（`public/icons/`，11 个）

这 11 个 PNG **当前没有任何消费方**：桌面端走 Icons8 CDN，小程序走 FA sprite（第七节）。
它们现在只剩两个作用 —— 图标授权台账（`credits.json` / `ATTRIBUTION.md`），以及将来若要改回离线图标时的素材储备。
但 Vite 会把 `public/` 原样拷进 `dist/`，所以这 140 KB 仍会进 exe / APK。

| key | 作者 | 消费方 |
|---|---|---|
| quadrant | Freepik | 无 |
| timeblock | wanicon | 无 |
| market | Freepik | 无 |
| settings | Good Ware | 无 |
| pomodoro | Freepik | 无 |
| weekly-report | Freepik | 无 |
| gx-news | Freepik | 无 |
| chaoxing-notify | Freepik | 无 |
| cppu-notify | Freepik | 无 |
| wechat-push | Smashicons | 无 |
| capture | Freepik | 无 |

完整来源链接与 sha256 见 `public/icons/credits.json`。

> 注意 `public/icons/fontawesome/solid.svg`（896 KB）**仍在使用** —— 小程序 tab 与插件图标的唯一图形源，别一起删。

---

## 十、已知缺口（可直接当作待办）

| 缺口 | 表现 | 修法 |
|---|---|---|
| `inbox` 不在 `ICONS8` | 侧栏「收件箱」显示拼图兜底 | 在 `ICONS8` 加 `inbox: ["inbox"]` |
| 图标依赖 CDN | 离线 / 无网环境下所有图标回落拼图，最终隐藏 | 若需离线，改为随包 PNG 或内联 SVG（会重新引入构建步骤） |
| `VIEWS[].icon` / `PLUGIN_ICONS` / manifest `icon` 是死元数据 | 改它们没有任何效果，容易误导 | 三端一起清理，或补上渲染逻辑 |
| 设置页考试日历写死「考」 | 与 Icons8 风格不统一 | 删掉 `plugins.js` 的 `rec.id === "exam-calendar"` 分支 |
| `public/icons/*.png` 是死资源 | 无消费方，140 KB 仍随 `dist` 进 exe / APK | 若确认不再需要离线素材，删除这 11 个 PNG（保留 `credits.json` / `ATTRIBUTION.md` / `fontawesome/`） |
| 根 `tools/sync-tab-icons.py` 是冲突副本 | 彩色 Magnific 方案，会覆盖小程序的单色 FA 图标 | 删除它，并把 `tools/gen-miniprogram-tab-icons.js` 指向 `miniprogram/tools/sync-tab-icons.py` |
| 图标脚本未声明依赖 | `sync-tab-icons.py` 需要 `Pillow`（+ `cairosvg`），裸 `python` 常缺 | 脚本头注明依赖，或在 README 里写明用哪个解释器 |
| 外部插件无独立图标通道 | 只能用 `ICONS8` 里已有的 key | 若要做，需给 `appIcon()` 增加按插件 id 动态拼 slug 的分支 |

---

## 十一、提交前自检清单

- [ ] 新 key 已加进 `src/icons.js` 的 `ICONS8`（否则拼图兜底）
- [ ] slug 是 **iOS Filled** 风格，且在 CDN 上确实存在（`curl -I https://img.icons8.com/ios-filled/50/000000/<slug>.png` 返回 200）
- [ ] 有备选 slug 时按「首选 → 备选」顺序书写
- [ ] 22px（窄屏侧栏）下图形仍可辨认
- [ ] `npm run tauri dev` 进 侧栏、插件市场、设置 → 插件 三处各看一眼，无裂图、无拼图兜底
- [ ] 若改了插件 `icon` / `faIcon`：确认同名 `<symbol>` 在 `fontawesome/solid.svg` 里存在，再跑 `python miniprogram/tools/sync-tab-icons.py` 更新小程序图标
- [ ] 三端图标口径一致：桌面走 `ICONS8`（Icons8 CDN），小程序走 `miniprogram/tools/` 生成的 FA 单色 PNG
