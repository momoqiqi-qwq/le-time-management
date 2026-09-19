# v0.71.1 · 深浅色切换的圆形揭示改从按钮处扩散（手机上原来偏到「左中间」）

## 需求

> 安卓端的深浅色切换动画应从左下角按钮处开始扩散，而不是从左中间开始。

只改 `le-time-management/src/`（桌面与 Android 共用同一套前端），小程序没有这套动画。
**无数据迁移。**

## 根因：两套坐标系对不上

圆形揭示本身没问题 —— 问题在**坐标写错了空间**：

- `src/theme.js::runThemeMutation` 用 `pointerdown` 的 `clientX/clientY` 写
  `--theme-reveal-x/y/r`，这是**屏幕 CSS px**；
- `src/uiScale.js::paintFactor` 把「用户设定 × 窄屏自适应」写在 `documentElement.style.zoom` 上，
  而 `::view-transition` 伪元素活在 **zoom 之后**的坐标系里：它的盒 = 视口 ÷ zoom。

无头 Chrome 实测（视口 503×642）：

| `:root` zoom | `::view-transition` 盒 | 写在 540px 的圆心实际落在 |
|---|---|---|
| 1 | 503×642 | 540px（对） |
| 0.64 | 833×876 | **346px** |

于是圆心被整体往左上按 `zoom` 倍收缩。桌面窗口最窄 900px、缩放默认 100% ⇒ 系数恒为 1，
**桌面看不出问题**；手机是窄屏（标准机 360 CSS px 以下触发自动缩小，下限 0.7），
再叠上用户自己调的「界面缩放」，系数能低到 0.56 —— 左下角按钮（y≈610/633）的圆心被推到
y≈342，正好就是用户看到的「左中间」。半径同理会缩掉一截，圆扫不到右下角。

顺带一提：桌面把「界面缩放」调到 125% / 150% 时同一个 bug 也成立，只是方向相反（圆心跑到按钮右下方）。

## 修法：在消费点换算，沿用既有的 `--ui-scale` 契约

`src/styles.css` 的 `@keyframes theme-reveal` 里，三个量一律除以 `--ui-scale`：

```css
clip-path: circle(calc(var(--theme-reveal-r, 150vmax) / var(--ui-scale, 1))
             at calc(var(--theme-reveal-x, 50%) / var(--ui-scale, 1))
                calc(var(--theme-reveal-y, 50%) / var(--ui-scale, 1)));
```

选 CSS 而不是在 JS 里除，是因为 `--ui-scale` 与 `zoom` 由 `paintFactor()` **同帧写入**、
天然指向同一个系数，而「恒定物理长度写 `calc(Npx / var(--ui-scale))`」本来就是 uiScale.js
定的既有契约（`--ui-vw/--ui-vh` 同一套路）。`theme.js` 继续按屏幕 px 记录按下点，语义不变。

兜底 `1` 不能省：`--ui-scale` 还没写入时 `calc` 会非法，整条 `clip-path` 被丢掉 ⇒ 揭示直接没了。

## 验证

- `scripts/test-theme-transition.mjs` 新增 4 条 CSS 守卫（x/y/r 三处换算 + `1` 兜底），
  并把变异测试的靶子从「只有 theme.js」扩成「按文件挑靶子」，补两条变异：
  `揭示几何未换算 zoom 坐标系`、`--ui-scale 兜底被去掉` —— 7 条全部被拦下。
- 真浏览器（探针页把 `@keyframes theme-reveal` 与 `theme.js` 的几何算法**原样**抄进去）：
  - zoom=0.64：按下点屏幕 (19.8, 540.8) → 伪元素收到 `circle(310.8px at 30.98px 844.97px)`
    → 绘制回屏幕正是 (19.8, 540.8)，冻结在半径 200px 时截图，圆心压在按钮上；
  - zoom=1.5：同样逐位吻合（桌面 150% 缩放一并修好）。
