# Le时间管理 v0.17.0

## 改了什么

新增第 11 套界面主题 **「Shadcn 锌灰」**（id：`shadcn`），把 shadcn/ui 默认 zinc
色系的设计语言搬进 Le时间管理：中性锌灰面板、近黑主按钮、10px 圆角与极轻阴影，
适合喜欢克制、高对比、少彩度界面的用户。

### 色板设计（对照 shadcn/ui zinc 亮色）

| 应用变量 | 取值 | 来源 |
|---|---|---|
| `--bg` / `--panel` | `#FAFAFA` / `#FFFFFF` | zinc-50 页面底 + 白色卡片 |
| `--ink` | `#09090B` | zinc-950（foreground） |
| `--ink-2` / `--ink-3` | `#71717A` / `#A1A1AA` | zinc-500 / zinc-400（muted-foreground / ring） |
| `--line` | `#E4E4E7` | zinc-200（border） |
| `--deep` / `--deep-2` | `#18181B` / `#09090B` | zinc-900 主按钮 / zinc-950 侧栏 |
| `--sea` `--coral` `--sun` `--grape` `--mint` | `#3B82F6` `#EF4444` `#F59E0B` `#8B5CF6` `#10B981` | 蓝/红/琥珀/紫/翠的功能色 |
| 四象限 | red/amber/indigo/emerald 各自的 600 + 50 | Tailwind 色阶 |
| `--radius` | `10px` | shadcn 默认 `0.625rem` |
| 阴影 | shadow-sm / shadow-lg 级别 | 极轻投影 |

### 影响范围

- **仅桌面端与 Android 端**的主程序界面（`src/`），纯新增，不改任何现有主题。
- 设置 → 界面 的主题卡片由 `themeProfiles.js` 自动渲染，「Shadcn 锌灰」无需额外 UI 代码。
- **数据迁移：无。** 主题 id 存储在 settings.theme，老用户保持原主题不变。
- 小程序端不受影响。

### 测试

- `scripts/test-themes.mjs` 增加对新主题元数据（3 个预览色、名称）的断言。
- `npm test` 12 个测试脚本全过；`node tools/sync-version.js --check` 三端一致 v0.17.0。
