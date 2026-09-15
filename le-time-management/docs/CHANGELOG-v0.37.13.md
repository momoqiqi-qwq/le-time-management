# v0.37.13 · 手机端设置页横向溢出修复

## 问题

手机（≤980px 视口）打开设置页时，一大块内容被顶出屏幕右缘：搜索框、「界面与交互」
说明文字、文字大小滑杆等都只显示左半截，且页面无法横向滚动，右侧内容永久不可见。

## 根因

v0.11.5 引入的「设置分类导航」在窄屏媒体查询（≤980px）里把 `.settings-layout` 写成了
`grid-template-columns: 1fr`。CSS 里 `1fr` 的自动最小值等于轨道内内容的 min-content，
而分类导航是 11 个 `flex: 0 0 200px`（不可收缩）的横向导航项，min-content ≈ 2272px ——
于是整个网格轨道被撑到 2272px，设置页整体比屏幕宽出近 1900px。分类行自身的
`overflow-x: auto` 因为父级一直在变宽而永远不生效（滚动容器没有生效的前提是容器宽度被约束），
`document.scrollWidth` 仍显示视口宽度，所以此前的「零横向溢出」检查漏掉了它。

## 修复

`src/styles.css` 的 `@media (max-width: 980px)`：

- `.settings-layout` 改为 `grid-template-columns: minmax(0, 1fr)`，轨道锁死在视口内；
- `.settings-sidebar` 补 `min-width: 0`。

这样分类导航行在自己的滚动容器内就地横滑，其余设置内容恢复正常换行。

## 影响端

- 桌面（>980px）：无变化，仍是左侧竖排分类 + 右侧内容。
- Android / 窄屏浏览器：设置页恢复正常，分类导航改为可横滑的标签行（原设计意图）。
- 小程序：不受影响（无此布局）。

## 数据迁移

无。

## 验证

- 无头 Chrome + 390×844 iframe + Android UA 实测：修复前 `.settings-sidebar` 宽 2187px、
  分类卡 2272px；修复后 docW=390/390，仅分类滚动行按设计裁剪。
- 核心五视图（四象限/时间块/收件箱/市场/设置）逐元素溢出探针全部归零
  （时间块页签栏属设计内横滑，不计）。
- `scripts/test-android-layout.mjs` 新增两条源码守卫断言防回归。
