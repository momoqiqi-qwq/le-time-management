# v0.37.18 · 首启不再预置示例任务 + 修「提前预警」重叠

两处改动：**首启数据改为全空**（三端），**任务抽屉「提前预警」窄屏重叠修复**。
无数据迁移、不影响桌面端布局。

## 一、反馈：初始界面不该有安排

首启的四象限里塞了 8 条示例任务（「回飞书群消息 12 条」「答辩 PPT · 第 3 章图表重绘」
「取快递 + 缴水电费」…），用户希望**一打开什么都不该有**。

### 根因

三端各写了一份「种子数据」：

| 端 | 位置 |
|---|---|
| Windows / Android（真机实际来源） | `src-tauri/src/lib.rs` 的 `seed_data()` |
| 浏览器调试端 | `src/main.js` 的 `seed()` |
| 微信小程序 | `miniprogram/core/store.js` 的 `seed()` |

注入时机都是「**本地数据不存在时写一次**」：

- Rust 侧 `load_data()` 判 `!path.exists()` → 写 `data.json`；
- 浏览器 `api.loadData()` 抛错 → 走 `store.initStore(seed)` 的 catch 分支；
- 小程序判 `wx.getStorageSync("tidebalance-data")` 有没有 `tasks` 数组。

### 修复

三处 `seed` 一律返回空集合（`tasks: []` / `blocks: []`），首启由空状态自己引导。
`settings.lastView: "quadrant"` 保留 —— 只决定默认落在哪个视图，与空状态无关。

顺带清掉 `lib.rs` 里因 seed 清空而失去唯一调用者的 `now_ms()`（避免 `dead_code` 告警）；
`js_datetoday()` 仍有调用点，补注释说明它不该被当通用工具函数搬走。

### ⚠️ 只对新装设备生效

判据是「数据文件不存在」，所以**已落盘旧数据的设备不会自动清空**。
要让某台设备变空，需删掉它的 `data.json`（Android 在应用私有目录，
桌面在 `%APPDATA%/com.yile.letime`），或走设置里的清空入口。

## 二、反馈：「提前预警」区块布局乱了

截图（Android 竖屏）里「提前预警」标签浮在上面，chips 行与下一行「所属项目」的
输入框（placeholder「无」）压在一起，「到点」按钮叠在输入框上。

### 根因（实测定位，不是靠看 CSS 猜的）

`.drawer .dbody` 是 `display:flex; flex-direction:column` 的**纵向**容器，
而 `.kv` 作为 flex item **默认 `flex-shrink:1`**。窄屏把 `.reminder-kv` 改成竖排
（`@media (max-width:760px)` 里的 `flex-direction:column`）后，这行需要的高度从
「桌面单行 74px」涨到「label 行 + 4 行 chips」——纵向空间不够时，flex 会按 shrink
比例**把它压回**可用高度。

用真浏览器（390×844）量到的数字：

```
.reminder-kv   自身高 58.36px
.reminder-picks（chips）实际高 104px
chips 画出 .reminder-kv 底部：+77.6px   ← 溢出
「到点」 vs projInput 交叠：27.9 × 21.6  ← 真重叠
```

所以这不是「间距不够」，是**容器高度没有跟着内容长**。

⚠️ 踩过的弯路：第一版修复写了 `min-height:0`，以为「解除下限」就能让高度自适应。
**结论相反** —— `min-height:0` 是解除下限，反而让 item 被压得更扁。真正要的是
`flex: none`（禁止收缩、高度由内容决定）。

### 修复

窄屏新增一段（`.drawer .dbody` 提高优先级，不动既有规则、避免与并行改动冲突）：

```css
.drawer .dbody .reminder-kv {
  flex: none;                    /* 🔴 关键：禁止被纵向 flex 容器压缩 */
  height: auto;
  flex-direction: column;
  align-items: stretch;          /* chips 撑满可用宽 */
  justify-content: flex-start;   /* 干掉继承自 .kv 的 space-between（竖排下会纵向均分） */
  min-height: 0;
  gap: 8px;
  padding-bottom: 10px;
}
```

同时把 `drawer.js` 里那行的内联 `style="align-items:flex-start"` 与标签的
`style="padding-top:7px"` 去掉（前者是给单行横排用的，后者是「单行时假装垂直居中」），
改由 `.reminder-kv-lab` 类收口。

### 验收（真浏览器实测，四档视口 × 浅/深）

| 指标 | 修复前 | 修复后 |
|---|---|---|
| `.reminder-kv` 高度 | 58.4px（被压扁） | **147px**（随内容） |
| chips 溢出容器 | **+77.6px** | **−11px**（安全在盒内） |
| 「到点」vs「所属项目」重叠 | **true** | **false** |
| chips vs「所属项目」重叠 | **true** | **false** |

390 / 360 / 320 / 412 四档宽 × 浅/深两套配色全部 `overlapping: false`。
412px 档 chips 只需 3 行、容器收到 110px —— 证明高度是真正自适应，不是靠 magic number。

## 影响面

- 两端产物需重建（`src-tauri/src/` 改过 → 按铁律一升版本 + 重建 exe/APK）。
- 桌面端（>760px）布局不变，只受 seed 清空影响。
- 无数据迁移。
