# v0.37.9 · 校园服务收起箭头左移

接 v0.37.8：收起箭头放大后仍贴着卡片右缘，用户反馈「往左移一点」。

- `.pp-side-acts`（↻ 与收起箭头所在的操作组）加 `margin-right:7px`，整组离开卡片右缘，不再顶边。
- cppu-notify 1.7.2 → 1.7.3；应用 0.37.8 → 0.37.9。
- 22 个测试脚本全过；`sync-version --check` ✓ 三端一致；实拍确认（`output/preview/win/cppu-side-arrow-left.png`）。
