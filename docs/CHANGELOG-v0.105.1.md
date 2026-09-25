# U-Time v0.105.1

修一个 APK 端的老bug：**课程表顶栏压在系统状态栏上**。只改样式与守卫测试，不涉及数据结构、无迁移。

## 更新内容

### 安全区四条边不再被「界面缩放」乘掉（仅 Android / 窄屏）

#### 一、根因

`--sat / --sab / --sal / --sar` 是 `MainActivity` 读真实 `WindowInsets` 后注入的**原生浮层高度**，
物理尺寸恒定；而「界面缩放」（`src/uiScale.js`）是挂在 `documentElement` 上的 CSS `zoom`，
它是**布局级**缩放 —— 布局长度 × 系数 = 屏幕上占的物理长度。

于是凡是「拿 padding 去让开一条原生栏」的地方，padding 写了多少布局长度，实际只让开
`长度 × 缩放系数`。系数 < 1 时就是**让不够**，课程表首当其冲：v0.59.0 为「铺满除安全区之外的整屏」
把 46px 顶栏让位收掉之后，沉浸式视图的 `padding-top` 只剩 `2px + --sat`，一点余量都不剩。
核心页面上那 46px / 62px 的大让位会把这点误差吃掉，所以此前一直没暴露（`uiScale.js` 里记着这条取舍）。

#### 二、改法：inset 一律 ÷ `--ui-scale`

与仓库既有的 `calc(18px / var(--ui-scale,1))` 是同一个约定，只是之前没把安全区当同类量：

| 位置 | 改动 |
|---|---|
| `styles.css` `.view` 的 `padding-left/right` | `--sal/--sar` 各自 ÷ `--ui-scale`（横向**唯一**的负责人，插件侧不许再垫） |
| `styles.css` `.app.rail-hidden .view` | `padding-top/bottom` 整条括号 ÷ `--ui-scale` |
| 课程表 `.sg .style-sheet`（个性化抽屉，`position:fixed`） | `padding-inline` 与窄屏 `padding-bottom` ÷ `--ui-scale`，与它自己的 `bottom:calc(18px / …)` 对齐 |

系数取不到时 `var()` 兜底 `1` ⇒ 缩放 100% 下逐像素不变；桌面与 `env()` 取 0 的场合同样不变。

#### 三、实测（无头 Chrome，注入 `--sat 40 / --sab 24 / --sal --sar 18`）

探针 `output/probe-sg-safearea.mjs`：真实应用点进课程表 → 切 `.app.rail-hidden` → 六档缩放下量
`.schedule-top` 的视觉起点。修前 / 修后：

| 缩放 | 修前顶栏起点 | 侵入状态栏 | 修后 |
|---|---|---|---|
| 1.5 | 63.0 px | 无（白让 23px） | 42.0 px |
| 1.25 | 52.5 px | 无（白让 12.5px） | 42.0 px |
| 1.0 | 42.0 px | 无 | 42.0 px |
| 0.889（288 宽手机自动缩） | 37.3 px | **压进去 2.7px** | 42.0 px |
| 0.8（界面缩放 80%） | 33.6 px | **压进去 6.4px** | 42.0 px |
| 0.7（窄屏下限） | 29.4 px | **压进去 10.6px** | 42.0 px |

左 / 右同批：修前 0.889 / 0.8 / 0.7 分别漏进挖孔带 2 / 3.6 / 5.4 px，修后六档都恰好贴在 18px 上。
底部 `--sab` 那条一起修（4px 让位同样禁不起缩）。

**触发条件**：手机布局宽度 < 360 CSS px（`narrowAutoFactor` 会自动把系数压到 0.7~1），
或用户在 设置 → 界面与交互 → 界面缩放 里选了 100% 以下。360 宽以上且 100% 缩放看不到问题。

#### 四、守卫

- `test-immersive-view.mjs`：沉浸式 `.view` 的上下两条必须带 `÷ var(--ui-scale,1)`，
  并新增一条钉住宿主 `.view` 的 `--sal`。
- `test-plugin-safe-area.mjs` §E：宿主左右两条从「有 var(--sal 就绿」收紧成「必须 calc 里除回来」。
- `test-schedule.mjs`：抽屉的 `padding-inline` / `padding-bottom` 各自钉死除法写法。

## 影响范围

仅 Android APK 与窄屏浏览器形态的插件页外壳；Windows 桌面（>900px）与小程序原生课程表不受影响。
无数据迁移、无 API 变化。插件清单按惯例一起 +：`shiguang-schedule` 3.10.0 → **3.10.1**
（改的是它的样式常量，描述文案不动），已跑 `sync-plugins.js` 同步桌面与小程序两端的 `pluginCatalog.js`。
