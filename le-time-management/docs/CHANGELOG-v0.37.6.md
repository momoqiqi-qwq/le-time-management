# v0.37.6 · 网页收集编辑框超长文字自动缩字号

## 改了什么

接 v0.37.5（输入框不再撑破卡片后，长文字被省略号截断）。用户反馈：「字超出框了自动缩小字体，但不能缩小到看得难受」。

网页收集卡片「名称 / 备注」编辑框（web-collector 1.1.1 → 1.1.2）：

- 每次渲染后按真实溢出（`scrollWidth > clientWidth`）自动缩小字号：**13px → 11px，步进 0.5px**；
- **11px 是下限**——再放不下交给省略号，绝不缩到看不清；
- 短值保持 13px 原字号，不受影响。

## 守卫与验证

- `scripts/test-web-collector.mjs` 第八节：必须 `fitInputFonts()`、上下限 13/11、判定基于真实溢出、`paint()` 末尾必须调用。
- 22 个测试脚本全过；`sync-version --check` ✓ 三端一致 v0.37.6。
- 实拍（种入超长标题 + 超长备注）：短值卡保持原字号、长值卡字号缩小、触底后省略号，均在卡内（`output/preview/win/webcollector-fitfont-desktop-{light,dark}.png`）。
