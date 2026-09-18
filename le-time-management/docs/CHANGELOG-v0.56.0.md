# v0.56.0 版本说明

> 本文件由各批次会话追加自己的条目。以下先记录「AI 文档 / 图片解析」批次。

## AI 文档 / 图片解析：识别时间安排并写入任务、时间块、收件箱与课程表

### 背景：不是从零开始

仓库里已经有 AI 的**基础设施**，缺的只是「读懂文档与图片」这一层：

| 已存在 | 位置 |
|---|---|
| 加密凭据库（AES-256-GCM，不进 `data.json` / 备份 / 同步） | `src-tauri/src/lib.rs` 的 `ai_vault_*` |
| AI 调用桥（Rust 侧 reqwest，绕开 WebView CORS） | `ai_chat` + `src/api.js` |
| 定时 AI 自动任务（自然语言 → 规则 → 定时执行 → 白名单操作） | `src/aiAutomation.js` |
| 规则式中文时间解析 | `src/timeParser.js` |
| 拖放 / 粘贴捕获 | `src/capture.js` |

此前**图片是死路**：`capture.js` 的注释写着「截图无法本地 OCR，时间需手选」，
拖进来的截图只能当附件，日期时间全靠手点。

### 改了什么

**一、Rust 侧 `ai_chat` 支持多模态**

`AiMessage.content` 从 `String` 改为 `serde_json::Value`，允许两种形态：纯字符串
（v0.55.0 及之前的调用方全部兼容）或 OpenAI 兼容的 content parts 数组。用 `Value`
而不是定义枚举，是为了**原样透传** —— 各家「兼容」端点在 content parts 上的字段并不
一致，本地拆解再重组只会把本来能用的端点挡在门外。

新增 `inspect_ai_content()` 只读校验：文本按字符数封顶（图片字节**不计入** chars，
否则一张 300 KB 的截图会被算成 40 万「字符」而误触发「上下文过长」）；图片必须
`data:image/*` 内联（**拒绝远程 URL**）、单张上限约 1.5 MB、单次最多 6 张。

**二、新增 `src/aiIngest.js`（核心解析与路由管线）**

- `aiAnalyzeContent()`：把文字 / 图片交给模型，要求返回严格 JSON，抽成事件数组；
- `normalizeIngestEvent()` / `normalizeIngestCourse()`：**脏数据兜底**（详见下节）；
- `applyIngestEvents()`：按 `kind` 路由 —— `task` / `timeblock` / `inbox` 走核心 store，
  `course` 走事件广播交给课程表插件；
- `isAiIngestReady()`：入口先探测凭据，不做缓存（设置页保存后要立刻生效）。

**三、课程表插件新增外部导入通道**

`manifest.json` 加 `events` 权限；`ui.js` 订阅 `ingest:courses`，用
`M.normalize` + `M.mergeTables` + `persist` 走**插件自己的链路**落盘，并给可撤销提示。

为什么不由核心直接写 `tide.storage`：`tables` / `table` 在 `ui.js` 里是**内存副本**，
核心写盘后插件下一次 `saveTables()` 会把旧副本覆盖回去 —— 新课程凭空消失。
为此把 `render()` 里的状态读取抽成 `loadState()`，因为导入可能发生在用户
**从没打开过课表**的时候。

**四、入口与确认面板**

- 拖入 / 粘贴图片 → AI 读图；无 AI 凭据时**退回原有手选时间弹窗**（降级不是报错框）；
- 拖入文本文件 → **规则优先，AI 兜底**（本地认不出日期才花钱）；
- 粘贴纯文本 → **不自动走 AI**（粘贴是最高频动作，随手贴一句就触发付费请求会让人觉得在偷偷烧钱）；
- PDF / docx / xlsx / pptx → **诚实告知暂不支持**，提示截图后拖入，而不是静默存成附件让人以为已经解析过；
- 新增 `src/views/ingestPanel.js` 确认面板：逐条可勾选 / 改落点 / 改标题日期时间，
  显示置信度与落点提示，写入后可一键撤销。**AI 的结果绝不直接落盘。**

### 修掉的两个既有缺陷

1. **`aiAutomation.js` 的分类白名单写错了。** 手抄的白名单是
   `["work","study","life","exercise","rest"]`，而应用里根本没有 `exercise`
   这个分类（真实 id 是 `sport`）。后果：AI 生成的时间块拿到一个没有 `--cat-*` 变量的
   分类 id，渲染出来没有配色、`catLabel` 直接回显 id，**全程不报错**。
   现在改为从 `store.js` 的 `CATEGORIES` 派生（`CAT_IDS`），提示词里的枚举也一并
   由它生成，杜绝再次漂移。

2. **`applyIngestEvents` 曾假设调用方已归一。** 传进来的原始事件没有 `durMin` 时，
   `addBlock` 的 `{ ...patch }` 会把默认的 30 分钟覆盖成 `undefined`，落库一个
   **没有时长的时间块** —— 而冲突检测靠 `b.durMin` 算区间，此后所有排程检查静默失效。
   现在函数入口强制过一遍 `normalizeIngestEvents`（归一本身幂等）。

### 脏数据兜底（这条链路的输入是大模型的自由文本）

| 输入 | 处理 | 理由 |
|---|---|---|
| `2026-02-31` | 判为非法，返回空串 | `new Date` 会静默滚到 3 月 3 日，幻觉日期变成另一天 |
| `end` 早于 `start` | 清空 `end`，时长回落默认 | 不许生成负时长 |
| `weekday: 9` / `weeks: [2.5]` | 拒绝，回落默认值 | **不四舍五入** —— 半个周次说明模型没想清楚，圆整会凭空造出一周的课 |
| `cat: "exercise"` | 回落 `guessCategory()` | 白名单必须与 `CATEGORIES` 一致 |
| 未知 `kind` | 回落 `task` | 绝不透传 |
| `durMin: 99999` / `-30` | 夹取到 5~720 / 回落 60 | |
| 标题空白 / 超长 | 兜底文案 / 截断 160 | |
| 非对象输入 | 归一成合法的空事件 | 不能炸 |

### 降级纪律（不静默丢数据）

- 课程表**被禁用**或**加载失败**（广播没人接）⇒ course 事件降级进收件箱，
  并写明原因与完整识别结果；
- 时间块**冲突** ⇒ **不覆盖**已有安排，改投收件箱；
- AI 调用失败 ⇒ 退回本地识别路径（图片仍可手选时间）。

### 验证

- 新增 `scripts/test-ai-ingest.mjs`（脏数据兜底 / 路由分派 / 课程降级 / 安全边界）；
- 变异验证 **8/8 全部被捕获**，脚本在 `.workbuddy-ai/tmp/mutate-ai-ingest.mjs`
  （不入库），含「日期不校验真实性」「不处理反向区间」「区间整数改回四舍五入」
  「不再内部归一」「课程静默丢弃」「不做冲突检测」「撤销失效」「未知分类透传」；
- `scripts/test-schedule.mjs` 新增导入链路集成测试：桩补 `events` / `storage`，
  实测「插件自己 merge + persist、字段映射、重复导入幂等、空载荷与越界节次被拒」；
- `cargo check --lib` 通过（仅剩两条既有 warning）；四项 `--check` 全过；
  `npm test` **50 个脚本全部通过**。

### 影响范围

- 端：**Windows / Android**。小程序端本功能不可用（小程序无 `vault`、无本地文件读取，
  且调外部 AI 接口需要域名白名单），与课程表 / RSS / cppu-notify 等既有先例一致。
- 数据迁移：无。课程表只新增了 `events` 权限，存储结构未变。
- 费用：只有拖入图片 / 文件时才调用 AI；粘贴文本与「快速捕获」仍走本地解析。
- 识别课表类图片需要模型**支持视觉输入**（如 `qwen-vl-*` / `gpt-4o` / `glm-4v` 等）；
  纯文本模型在图片场景会直接失败并回退到手选时间。
