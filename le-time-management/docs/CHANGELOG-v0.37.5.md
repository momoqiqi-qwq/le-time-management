# v0.37.5 · 网页收集卡片编辑框溢出修复

## 问题（用户截图反馈）

网页收集卡片里的「名称 / 备注」编辑框会把长内容顶出卡片边框——长标题（如「中国教育和科研计算机网-」）和长备注直接超出卡片，视觉上像断了的服务卡。

## 根因

`.wc-edit` 是两列网格（名称 + 备注），轨道写的是 `1fr 1fr`。`1fr` 的真实含义是 `minmax(auto, 1fr)`，**下限是内容的 min-content**；而 `<input>` 的 min-content 是按 `size` 属性算的固定宽度（约 20 字符），不随卡片收缩。卡片最小 260px，两条各 ≈180px 的轨道必然撑破容器。

## 修法（web-collector 1.1.0 → 1.1.1）

- `.wc-edit` 轨道改 `minmax(0,1fr) minmax(0,1fr)`；
- `.wc-edit input` 补 `min-width:0; width:100%`。

长值现在在输入框内截断，卡片边界完好。窄屏（≤640px 单列）原本就单列、不受影响。

## 守卫与验证

- `scripts/test-web-collector.mjs` 新增第七节：禁 `1fr 1fr` 裸轨道、必须 `min-width:0` + `width:100%`；版本断言 1.1.1。
- 22 个测试脚本全部通过；`sync-version --check` ✓ 三端一致 v0.37.5。
- 无头实拍（1440×900 浅/深 + 390×844 手机视口）：默认条目「国家教育资源公共服务平台」长标题/长备注在卡内截断，无溢出（`output/preview/win/webcollector-fix-*.png`）。

## 顺手修正

本轮起版本推进重新走 `tools/sync-version.js` 全量同步（前两轮 v0.37.3 / v0.37.4 只手改了 `package.json` + lock，`Cargo.toml` / 小程序 `appMeta` 等三端位置当时没跟上，本轮已一并对齐到 0.37.5）。
