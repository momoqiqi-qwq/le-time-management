# AI 必读

> ⚠️ **本文件已更名为 [`AGENTS.md`](./AGENTS.md)，规则内容全部在那里。**

`AGENTS.md` 是 AI 协作规范的**单一事实源**（也符合各家 AI 工具自动加载 `AGENTS.md` 的约定）。
保留本文件只是为了让中文名入口和既有链接不失效 —— **不要把规则复制到这里**，
改了 `AGENTS.md` 就够了，两份内容必然会漂移。

核心铁律速记：

1. **每次更新必须升版本号**（改 `package.json` → 跑 `sync-version.js` → 手工补 `package-lock.json` → `--check`）
2. 改完版本必须跑 `--check` + `npm test`，全过才能构建
3. `com.yile.letime` / `letime` 这类标识符永远不许回退（插件全局名 `tide` 是唯一例外）
4. Win 与 Android 构建脚本不能并行
5. 合并外部交付包要分层，不要整体覆盖

细节、操作步骤、坑点清单 → [`AGENTS.md`](./AGENTS.md)
