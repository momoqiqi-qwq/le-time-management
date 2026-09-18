# v0.57.0 版本说明

## 顶栏工具行重排：统计默认居中 + 搜索改纯放大镜图标 + 一行可拖动

### 需求原文（用户截图点单）

> 把待办/已完成默认居中，搜索/命令也弄成一个放大镜图标，不用文字，把变成图标后的
> 快捷入口和全局搜索和最大最小和关闭按钮弄成 1 行，可以自由拖动切换位置。

### 改了什么

| 改动 | 文件 | 说明 |
|---|---|---|
| 「待办 N · 已完成 N」统计默认居中 | `src/uiPreferences.js` | `centerTopStats` 默认值 `false → true`；归一化从「严格 `===true`」放宽为「`!==false`」—— 老存档没写过这个键 → 落新默认（居中），显式关过的用户保持关闭。设置页「顶部任务统计居中」开关保留，随时可切回 |
| 搜索钮收成纯放大镜图标 | `src/shell.js` | `top-search` 只剩 Font Awesome `magnifying-glass` 字形（与快捷入口「闪电」瓷砖同套图标、同 34×34 观感）；「搜索 / 命令」文字与 `Ctrl K` 角标从 DOM 移除，快捷键说明挪进 `title`。点击行为（命令面板）与拖动排序不变 |
| 搜索图标瓷砖规格 | `src/styles.css` | `.top-search` 改 34×34、`padding:0`、圆角 11px（对齐 `.quick-menu-trigger`）；删除 `.top-search kbd` 规则、≤700px 媒体块里的旧文字态规则（`padding:0 10px` 覆盖会撑变形）、以及「统计居中时 761~1280px 才折图标」的媒体块（现在恒为图标，块失去目标） |
| 一行 + 自由拖动 | （既有能力保留） | 快捷入口、放大镜、最小化/最大化/关闭本就同处 `.topbar-action-card` 一行；四部件 `search/quick/stats/window` 的 HTML5 拖动换位（`moveTopbarPart` + `settings.topbarOrder` 持久化）原样保留，居中的统计胶囊仍是可拖部件 |

### 影响端

- **桌面端（Windows）**：全部生效。
- **Android**：顶栏默认隐藏（沉浸式外壳），呼出后同样吃到图标化搜索与居中统计；
  `draggable` 仍由桌面运行时门控（手机上不启 HTML5 拖拽），排序沿用已存顺序。
- **小程序**：不涉及（顶栏为应用外壳概念，小程序端无此结构）。

### 数据迁移

无。`centerTopStats` 缺省即新默认，不写迁移；显式 `false` 的存档原样尊重。

### 回归守卫

`scripts/test-android-layout.mjs` 新增四组断言：放大镜图标必须存在、`top-search-label`
/`<kbd>` 必须不存在、`.top-search` 必须是 34px 瓷砖（含「无 kbd 样式残留」全文件扫描）、
统计居中规则必须由 `data-center-top-stats="on"` 驱动 + 拖动换位逻辑必须保留。
