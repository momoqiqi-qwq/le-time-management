# v0.72.0 · 深浅色切换键：图标表示「现在是什么」，颜色跟着主题反色

## 需求

> 当你切换成浅色模式时，图标应该是白色的太阳，而不是深色的齿轮。

追问后定为两条：① 图标**显示当前生效的亮度**（浅色 = 太阳、深色 = 月亮）；
② 磁贴跟主题、图标自动反色。只改 `le-time-management/src/`（桌面与 Android 共用），
小程序没有这颗键。**无数据迁移。**

## 那个「深色的齿轮」是怎么来的

两件事叠在一起：

**一、字形映射是反的。** 旧代码 `faIcon(dark ? "sun" : "moon")`（`shell.js` 三处）走的是
「图标表示点下去要切到哪」—— 浅色模式显月亮、深色模式显太阳。

**二、深色模式下图标颜色写死成深色。** 磁贴底色在 v0.5x 就已经跟主题走了
（`.rail-bottom > button .ic` → `color-mix(in srgb, var(--panel) 86%, transparent)`），
但 `styles.css:1074` 那条 `color: #17323A` 一直留在那儿没人管。于是深色模式下
`--panel:#2D2922` 的深磁贴上压着 #17323A 的深图标，**实测对比 1.07:1** —— 基本看不见，
只剩个轮廓。

而 Font Awesome 的 `sun` 在 15~18px 下就是「圆盘 + 8 道短射线」，把 sun / moon / gear
三个字形按实际尺寸渲染出来比对，**sun 与隔壁设置键的真 gear 几乎同形**（且它俩就在底栏左右相邻）。
看不见 + 形似齿轮 = 用户口中的「深色的齿轮」。

## 改法

**字形收进一个 helper**（`src/shell.js`），顶栏与左下角两颗键共用，不再各写 ternary：

```js
const themeModeGlyph = () => (resolveThemeMode() === "dark" ? "moon" : "sun");
```

三处调用点：顶栏 `paintTopTheme`、左下角 `registerRailAction("theme-toggle")` 的 `icon()`
与 `onMount` 刷新回调。`title` 不动 —— 它继续说「点下去会切到哪」，与字形「现在是什么」互补。

**图标色改走 `--ink`**（`src/styles.css`）：

```css
.rail-bottom > .theme-toggle-btn .ic { color: var(--ink); }
```

`--ink` 是每套主题浅/深两套色板里现成的「正文字色」，与 `--panel` 底色天然反色，
15 套主题 × 深浅两模式一并覆盖，不用逐主题写。选择器只圈这颗键，
不动 `.rail-bottom > button .ic` 的 #17323A —— 那条还养着 `.on` 态的太阳黄磁贴。

## 验证

真浏览器实测（`localhost:1420`，量 `.ic` 的 `color` 与逐层合成出的磁贴实际底色）：

| 模式 | 字形 | 图标色 | 磁贴色 | 对比度 |
|---|---|---|---|---|
| 浅色 | sun | rgb(34,48,58) | rgb(255,255,255) | **13.53** |
| 深色（改后） | moon | rgb(227,225,222) | rgb(45,41,34) | **11.08** |
| 深色（改前） | sun | #17323A | rgb(45,41,34) | **1.07** |

顶栏那颗同规则（浅色 sun / 深色 moon），它本来就走 `--ink-2`，颜色无需动。

回归断言落在 `scripts/test-rail-dock.mjs` 新增的 ④ 段：helper 定义、三处调用计数、
「shell.js 里 sun/moon 字面量只许出现 2 次」（防分叉）、CSS 的 `color: var(--ink)`
与「不许在这条规则里写死 #17323A」的反面断言。
