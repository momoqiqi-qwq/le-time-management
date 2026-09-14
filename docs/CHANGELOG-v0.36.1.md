# Le时间管理 v0.36.1

## 改了什么

两条用户反馈（同属「网页收集」插件）：

> 默认收集改为默认
> 刷新名称结果得到乱码名称

### 一、修 bug：点「刷新名称/图标」后标题变乱码（本版重点）

**症状**：网页收集里对已收藏的网站点「刷新名称/图标」，名称变成一串 `���ַ���������-��…`。

**根因不在插件，在网络层**。以用户截图里那条 `daxue.qiyemulu.cn` 为例，实测它的响应是：

```
Content-Type: text/html                       ← 不带 charset
<meta http-equiv=Content-Type content="text/html; charset=gb2312">   ← 编码只在 HTML 里声明
```

**reqwest 的 `resp.text()` 只看响应头里的 charset，不读 HTML 的 `<meta>`。**
头里没有 charset 时它按 UTF-8 解 —— 而正文是 **gb2312** 字节，于是整页中文都成了替换字符 `�`。
真实标题其实是「大学网站大全-高校信息数据库-大学网址导航网」，被解坏后才成了乱码。

这是中文站点的常见做法（尤其老 IIS / gov / edu 站）：**编码只在 meta 里声明**。

**修法**：不再用 `resp.text()`，改成自己按优先级解码 ——
**响应头 charset → HTML meta charset → UTF-8 兜底**（`src-tauri/src/lib.rs` 的 `decode_body`，
新增 `encoding_rs` 直接依赖，它本来就在依赖树里，不增体积）。

配套三点：

- **meta 嗅探只在前 4KB 内、且只扫 `<meta>` 标签**，不会把正文里随便出现的 "charset" 当声明。
- **多一道「正文是不是标记文档」的判别**（`looks_like_markup`）：首字符必须是 `<`，且 512 字节内
  出现 html / doctype / head / meta / ?xml。否则 `{"html":"<meta charset=gbk>"}` 这种 JSON 会被
  误判成声明了 gbk，**反而把本来正确的 UTF-8 中文解坏** —— 这是写测试时真抓到的反例，不是假想。
- **两端行为一致**：`src/api.js` 的浏览器回退路径原来用 `r.text()`（按 Fetch 规范同样恒按 UTF-8 解），
  现在也走同一套逻辑（新增 `src/webContent.js` 的 `decodeWebBody` / `charsetFromMeta` /
  `looksLikeMarkup`），避免「产物里好、调试环境坏」。

> 顺带修好一个连带问题：标题解对之后，Font Awesome 图标推断也正常了 ——
> 原来乱码标题匹配不到任何规则，一直退回 `globe`，现在会正确识别成 `school`。

### 二、「默认收集」文案改为「默认」，并迁移已落库的老数据

默认条目的备注前缀 `默认收集：` → `默认：`（如 `默认收集：大学名录` → `默认：大学名录`）。

⚠️ 这里有个坑：`ensureDefaults()` **只补缺失的条目**，已经存进 `tide.storage` 的默认条目不会
自动更新 —— 只改常量的话，**老用户看到的还是旧文案**。所以加了 `migrateNotes()` 做一次性改写：

- 只改写 **URL 命中默认条目**的那些条目，用户自己写的、碰巧以「默认收集：」开头的备注**不会被误伤**。
- 无老数据时**不写盘**，避免每次进插件都无谓落库。
- 迁移是幂等的。

### 三、回归与验证

- **新增 `scripts/test-web-collector.mjs`**（第 22 个测试脚本）：默认条目文案、老数据迁移
  （含「URL 尾斜杠差异」「用户备注不被误伤」「无老数据不写盘」「迁移幂等」「缺的那条仍要补」）、
  以及 render 里确实接上了 `migrateNotes` 的源码守卫。用 `vm` 跑真插件源码，不是读源码猜行为。
- **扩展 `scripts/test-web-content.mjs`**：charset 检测（头优先 / 带引号 / 大小写 / meta 兜底 /
  无声明返回空串）、`looksLikeMarkup` 的正反例、以及**用真实 gb2312 字节做端到端回归** ——
  `decodeWebBody` 解出「大学网站大全」并让 `parseSiteMeta` 取到正确标题、图标推断为 `school`。
- `npm test` **22 个测试脚本**全过 ✓；`sync-version --check`（v0.36.1）、`gen-theme-dark --check`、
  `build-schedule-plugin --check`、`check-miniprogram` 四项守卫均 ✓；
  `cargo check --release` 通过（仅剩两个既有无关警告）✓。
- 插件清单版本 `1.0.0 → 1.1.0`，已跑 `tools/sync-plugins.js` 重生成两端 catalog。

## 影响范围

- **Windows / Android**：网页收集插件的名称识别恢复正常（所有 gb2312 / gbk / big5 等非 UTF-8 站点）；
  默认条目备注文案变更。同一条 `decode_body` 也服务其它用 `tide.http` 的插件（如学校公告、
  警大通知抓取的网页），它们的标题识别同样受益。
- **微信小程序**：该插件为 `unavailable`，本版无影响；仅同步版本号。

## 数据迁移

**自动，无需手动操作。** 默认条目备注的 `默认收集：` → `默认：` 由 `migrateNotes()` 在进入插件时
一次性改写并落盘；未命中默认 URL 的备注不动。
