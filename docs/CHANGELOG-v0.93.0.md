# v0.93.0

## 轮换值日：标签右键菜单，可整组复制与导入成员

「轮换值日」里每套轮换是一个标签。之前要再开一套，只能点「+ 新建轮换」拿到一个空壳，
再把成员名字**一个个重打**一遍 —— 而「宿舍值日 / 公区值日 / 倒垃圾」往往就是同一批人。

现在标签支持右键（小程序端点标签后面的「⋯」），菜单五项：
**切到这一组 / 重命名 / 再添加一个 / 导入成员 / 删除这一组**。

- **再添加一个** = 整套复制：成员、周期、每轮人数、起始日、提醒设置全部带走，
  复制完立刻弹框要新名字（取消则沿用「XX 2」这种自动号）。副本紧跟在源组后面并切过去。
- **导入成员** = 从别的轮换挑一套名单并进当前组，**按名字去重**后追加到末尾，
  已有的一个人不动、顺序不变。给空标签补人不用重打名字。

## 两个刻意的取舍

**复制时组 id 和每个成员 id 全部重新生成。** 沿用旧 id 等于两组共享同一批人 ——
在副本里「本轮换人」或「移除某人」会连着改掉原组的排班，而「每套轮换互不影响」
是这个插件的立身之本（见 `main.js` 文件头第一条建模决定）。

**代价是临时换人记录不能带。** override 记的是成员 id，端过来全是悬空引用，
所以复制会把 `overrides` 清空；`lastNotified` 一并清空，否则副本当天不会再提醒当班的人。
起始日**保留** —— 同一宿舍的两套值日才会在同一天换人。

**副本名要截本体腾出后缀。** 直接 `src + " 2"` 再切到 `NAME_MAX`，
满 12 字的名字会切回和源组一模一样的串 —— 用户取消改名时标签条上就是两个同名标签。
所以写成 `src.slice(0, NAME_MAX - 后缀长) + " N"`，同名被占则往后取号。

## Android 端：长按入口 + 菜单必须自己让开安全区

Android WebView 对普通按钮的长按**不会**触发 `contextmenu`，所以移动端加了
`pointerdown` 起 550ms 的长按计时器（按下后移动超 10px 算滑动，取消）。
长按弹菜单后浏览器还会补一个 `click`，不吞掉就会在弹菜单的同时顺手把组切走 —— 用
`longPressed` 标志吃掉那一次。

菜单是 `position:fixed` 浮层，落在宿主 `.view` 之外：**四边都得自己让开**
状态栏 / 导航栏 / 横屏挖孔。视口坐标是从屏幕角量起的，所以夹取右边界必须减掉 `--sar`、
下边界减掉 `--sab`（`innerWidth` / `innerHeight` 不等于可视区）。
四个方向的宿主变量都要读，取值走 `getComputedStyle(document.documentElement)`。

重命名走 `promptFn`（与 rss-reader / inbox-drop 同款兜底）。已核实 Android 侧
Tauri 生成的 `RustWebChromeClient.onJsPrompt` 会真弹 AlertDialog + EditText，
所以 APK 上这个框可用；拿不到时退回「不改名」，不把复制流程卡死。

## 影响范围与限制

- `public/plugins/dorm-duty/main.js`（插件 `1.2.0 → 1.3.0`）、`plugin-guide/main.js`
  （`1.3.1 → 1.3.2`）与两份清单；`src/pluginCatalog.js`、`miniprogram/core/pluginCatalog.js`
  由 `tools/sync-plugins.js` 重写。
- 小程序端是独立实现：`core/pluginRuntime.js` 新增 `ddDuplicateGroup` / `ddImportMembers` /
  `ddCopyName`，`pages/plugin/index.{js,wxml,wxss}` 加「⋯」入口与 ActionSheet。
- 存储结构不变（仍是 `groups` / `activeId`），**无数据迁移**；旧版本客户端读到新数据
  只会多出几套轮换，不会解析失败。
- 「导入成员」只改名单，不改当前活动组 —— 右键哪套就导进哪套，视图停在原处，
  结果由 toast 报明目标组名与导入人数。

## 验证

- `scripts/test-dorm-duty.mjs` 新增「八、标签右键菜单」共 9 组用例：
  桌面端 `duplicateGroup` / `importMembers` 在 vm 沙箱里**真跑**（换新 id、清 overrides、
  副本名取号与截断、按名字去重、`GROUP_MAX` / `MEMBER_MAX` 上限、各种查无此组）；
  菜单渲染与长按/夹取走源码不变量。
- 小程序端 `ddDuplicateGroup` / `ddImportMembers` 用 `createRequire` **直接 require 真跑**
  （此前该仓库对 mini 端只做正则匹配），逐字段与桌面端比对语义；
  并对三处关键实现做过变异验证（复用成员 id / 保留 overrides / 导入沿用源 id）确认测试咬得动。
- 浏览器探针 `output/dd-tabmenu-probe.html` 在真 DOM 里跑通：右键出菜单（194×239，
  `position:fixed`，未越视口）、导入后原组名单为 阿明/老王/大个/小李 且原有 id 未变、
  副本 `倒垃圾` 四人 id 与原组**零交集**、Esc 收起、长按弹菜单后的 click 没有切走组。
- `npm test`（73 个脚本）与 `sync-version` / `gen-theme-dark` / `build-schedule-plugin` /
  `sync-android-native` 四个 `--check` 全部通过。
