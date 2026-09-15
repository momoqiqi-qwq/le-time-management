# v0.37.15 · 卡片随文字变高 + 顶栏去一层框 + APK 图标名

三处都是用户直接反馈的界面/命名问题，只动样式与一个构建补丁，**无数据迁移**。

## 1. 任务卡文字多时卡片变高（不再截断）

**反馈**：四象限里任务标题稍长就被省略号吃掉，看不到完整内容。

**根因**：`.tkc .tt .t` 写的是 `white-space: nowrap` + `text-overflow: ellipsis`，
标题永远单行、超出即截断，卡片高度也就恒定不变。

**修复**：
- 标题改 `white-space: normal` + `overflow-wrap: anywhere`，**折行完整显示**，
  卡片高度随内容自然增长。
- `.tkc` 的 `align-items` 从 `center` 改成 `flex-start`，并给复选框与右侧徽标
  （`已排` / 时长）加 `align-self: flex-start` —— 否则卡片一变高，复选框和徽章会被
  拉到垂直居中，看着像贴错了行。
- 标题与展开箭头包进新的 `.tt-top` 一行，元信息（截止 / 项目）单独占行，
  排版层级变成「标题行 → 备注 → 元信息」。
- 标题既然不再截断，`expandable` 就不再由标题长度决定，**只服务于备注**：
  `const expandable = hasNote`（原来是 `hasNote || t.title.length > 16`）。

**实测**（390×844 手机视口，真浏览器）：长标题折 4 行、卡片 105px，「短标题」卡 54px，
`标题被截断数 = 0`，卡片高不再齐平 —— 正是要的效果。

## 2. 顶栏右侧工具去掉外层框

**反馈**：搜索和头像外面还套了一个圆角大框，「框太多」。

**根因**：`.topbar-title-card, .topbar-action-card` **共用同一条带边框/渐变/阴影的规则**，
于是右侧工具区被当成一整个大胶囊。

**修复**：给 `.topbar-action-card` 再加一条覆盖规则 —— `padding:0`、`border:0`、
`background:none`、`box-shadow:none`。视觉层级改由各按钮自己的边框与底色表达
（搜索、快捷入口头像、待办计数各自独立）。**标题卡的框保留不变**，它本来就该是一张卡。

**实测**：`borderWidth: 0px`、`background: transparent`、`boxShadow: none`，
标题卡仍是 `1px` + 渐变 + 阴影，横向溢出 `0`。

## 3. APK 桌面图标名改为「Le时间管理」

**反馈**：手机桌面上的图标名是「Le时间管理 · 时间块与四象限」，太长被截断。

**根因**：`AndroidManifest.xml` 里 `MainActivity` 自带
`android:label="@string/main_activity_title"`，而 `main_activity_title` 是
「Le时间管理 · 时间块与四象限」。**launcher 取的是 activity 的 label，不是 application 的**
`app_name` —— 所以 `strings.xml` 里 `app_name` 明明已经是「Le时间管理」也不生效。

**修复**：在 `scripts/build-android-apk.sh` 里加一步**幂等补丁**，构建前删掉 MainActivity
块内的 label 行，让图标名回落到 `app_name`。

为什么必须放在构建脚本里：`src-tauri/gen/` 是 **gitignored 的生成目录**，
直接手改 manifest 在别人 clone 或下次 `tauri android init` 后就会丢失。

**注意**：`SchoolImportActivity` 也带 `android:label="@string/main_activity_title"`，
但那是**应用内教务窗口的标题**，是有意保留的 —— 所以补丁按 `android:name=".MainActivity"`
精确定位，**不能笼统删所有 activity 的 label**。

## 影响面

| 端 | 影响 |
|---|---|
| Windows / Android | 任务卡排版（1）、顶栏（2）都生效 |
| Android APK | 图标名（3）需重新构建 APK 才生效 |
| 小程序 | 不受影响（不复用这套 CSS） |

## 校验

- `node ../tools/sync-version.js --check` → 三端一致 v0.37.15
- `node ../tools/gen-theme-dark.js --check` → 派生调色板已同步
- `npm test` → 22 个测试脚本全部通过（`test-android-layout.mjs` 新增 3 组回归断言）
