# 动画演示 · 录屏用 HTML 动画总集

工作区里的演示动画原先散在 `video-demos/`、`output/utime-intro/`、`output/preview/`、`创客比赛/` 四处，
2026-09-20 收拢到这里。**每一套一个子文件夹，互不引用**，各自双击 `index.html`（或单个页面）即可全屏录屏。

| 目录 / 文件 | 内容 | 最后更新 |
|---|---|---|
| `参赛三分钟-7镜头-配音同步/` | **★ 参赛在用的那版。** 7 幕，无角色，时长锁 `../创客比赛/voice-timeline.json`（七页求和 180.1s，对齐 `narration-180s.wav`） | 2026-09-20 |
| `三分钟介绍-22镜头-含角色/` | 22 镜头三分钟片，含安安×橘雪莉吐槽立绘。事实源是同级的 `generate-u-time-intro.mjs` | 2026-09-20 |
| `插件专章-8镜头/` | **插件主线专章**，8 镜 2 分 24 秒。按「学校通知 → 课程表 → 番茄专注 → 微信推送 → 11 个一遍过 → 深色模式 → 设置」的口述分镜排序，画面里的公告、课表、勾选项、设置条目全部取自应用内真实数据。事实源是同级的 `build-plugin-tour.mjs`（只管 S2–S7，S0/S1 手写），节拍对齐见 `分镜表.md` | 2026-09-20 |
| `软件介绍-7镜头/` | 7 镜头「软件介绍动画」，比 22 镜头粗、比参赛版早 | 2026-09-20 |
| `软件介绍-单页.html` | 单页版软件介绍（1.8 MB，资源全内联，无同级依赖） | 2026-09-20 |
| `参赛三分钟-单页旧版/` | 拆成镜头之前的单页三分钟动画 + 对齐配音前的快照；`创客比赛/tools/` 的渲染管线指向它 | 2026-09-19 |
| `手机端演示/` | 手机端界面演示页（纯 CSS，无外部引用） | 2026-09-20 |
| `滚动铰链交互/` | scroll-driven 吸顶铰链机制演示，`.golden.html` 是比对基准 | 2026-09-18 |

## 没搬进来的，以及为什么

- **探针 / 预览页**（`output/probe-*.html`、`output/plugin-preview-*.html`、`output/preview/phone-demos/__*.html` 等 20 多个）
  —— 插件开发期的抓包与渲染调试页，不是动画，留在原地。
- **`output/preview/phone-demos/letime-apk-demo-30s.html`** —— 虽是 30 秒演示动画，但它 `src="shoot/raw/*.png"`
  直接引同级真实截图，搬走就断图，所以整目录留下。
- **`docs/*.html`** —— 说明文档，不是动画。

## 版本控制

`.gitignore` 里只放行了页面与脚本，屏蔽掉 `_qc/` 截图、`*.png` / `*.jpg`、以及两份重复的角色立绘
（`anan - emotion rename/`、`shery - emotion rename/`，共约 50 MB）。

克隆后补齐素材：

```bash
# 角色立绘（22 镜头那套要用）
cp -r ~/.agents/skills/video-shot-demos/assets/examples/glm-5.3-range-test/"anan - emotion rename" "三分钟介绍-22镜头-含角色/"
cp -r ~/.agents/skills/video-shot-demos/assets/examples/glm-5.3-range-test/"shery - emotion rename" "三分钟介绍-22镜头-含角色/"

# 质检截图：用技能里的 scripts/shot.js 对各页多个时间点重新出图
```

## 注意

- 屏幕上的规模数字要**录屏前临场重测**，别信旧稿。参赛稿里「内置十二个校园插件」是错的，
  实测为 **15 个**（14 个功能插件 + `plugin-guide` 这份说明型条目）。
- 这些页面不属于 `AGENTS.md` 铁律一的产品路径，改它们**不需要升版本号**。
- `generate-u-time-intro.mjs` 的输出目录写死为 `三分钟介绍-22镜头-含角色/`，重跑会覆盖那 23 个页面。
