# Le时间管理 · 插件开发文档

> 适用于 Le时间管理 v0.9.x 的 Windows / Android Tauri 插件宿主。

## 1. 最小插件结构

```text
my-plugin/
├─ manifest.json
└─ main.js
```

`manifest.json` 示例：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "author": "you",
  "icon": "puzzle-piece",
  "description": "一句话说明插件用途",
  "permissions": ["ui", "tasks", "blocks", "storage", "notify", "events", "http", "openUrl", "timeParse"],
  "entry": "main.js"
}
```

建议：`id` 只使用小写英文字母、数字和短横线；版本号使用语义化版本格式；`description` 直接说明“解决什么问题”。

## 2. 安装与调试

### ZIP 导入

1. 将插件目录打包成 ZIP，确保 ZIP 内直接包含插件目录或插件文件。
2. 打开 **设置 → 插件 → 导入插件**。
3. 导入后检查插件卡片是否显示名称、版本与启用状态。
4. 若插件注册了页面，启用后会出现在应用导航中。

### 文件夹调试

把插件文件夹放到 **设置 → 数据** 所显示的数据目录下的 `plugins/` 子目录，然后在设置页重新扫描插件。

> Android 端对外部插件目录扫描能力有限，优先使用内置插件或 ZIP 导入流程。

## 3. `tide` API 速览

插件入口在函数环境中执行，主程序向入口注入 `tide` 对象。

```js
tide.ui.registerView({
  id: "my-view",
  title: "我的页面",
  icon: "puzzle-piece",
  render(el) {
    el.textContent = "Hello Le时间管理";
  },
});
```

### 任务

```js
const tasks = tide.tasks.list();
const task = tide.tasks.create({ title: "新任务", quad: 2 });
tide.tasks.update(task.id, { tags: ["插件"] });
tide.tasks.remove(task.id);
```

### 时间块

```js
const blocks = tide.blocks.list("2026-09-11");
const block = tide.blocks.create({
  date: "2026-09-11",
  start: "10:00",
  durMin: 45,
  title: "阅读",
});
tide.blocks.update(block.id, { durMin: 60 });
tide.blocks.remove(block.id);
```

### 插件私有存储

```js
await tide.storage.set("count", 1);
const count = await tide.storage.get("count", 0);
```

### 插件资源

```js
const cfg = await tide.assets.json("data/config.json");
const text = await tide.assets.text("README.txt");
// 把文本真正保存到系统下载目录（重名自动加序号），返回落盘的完整路径
const path = await tide.assets.saveText("导出说明.md", text);
```

资源路径必须是插件目录内的相对路径，不能使用绝对路径或 `..`。
`saveText` 需要 `ui` 权限；平台没有下载目录时保存到应用数据目录。

### 通知与事件

```js
tide.notify("操作完成");

tide.events.on("pomodoro:finished", (payload) => {
  console.log(payload);
});

tide.events.emit("my-plugin:changed", { ok: true });
```

### 网络请求

```js
const res = await tide.http.get("https://api.example.com/list");
```

需要 Cookie 会话时：

```js
const sid = await tide.http.session();
await tide.http.fetch(sid, "POST", "https://example.com/login", {
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: "username=a&password=b",
});
const feed = await tide.http.fetch(sid, "GET", "https://example.com/feed");
```

仅支持 `http/https`。

### 工具

```js
tide.util.openUrl("https://example.com");
const parsed = tide.util.parseWhen("明天下午3点到4点 讨论开题");
const cat = tide.util.guessCategory("跑步 30 分钟");
const quad = tide.util.guessQuad("2026-09-12");
tide.util.navigate("timeblock");
```

## 4. 插件页面规范与建议

### 4.1 返回按钮（硬性要求）

**每个插件注册的视图页面必须提供明显的返回按钮，点击后返回上一页。** 这不是建议，是上架/导入插件的门槛：

- 插件内部有多级子页面时，插件自己维护页面栈，返回按钮回退到上一级子页面；首页顶部如需提供返回（例如从其他视图跳转而来），点击应回到跳转来源视图。
- 插件通过 `tide.util.navigate()` 跳到应用其他视图之前，先记录来源视图，返回按钮用 `tide.util.navigate("<来源视图>")` 送用户回去。
- 返回按钮固定在页面顶部显眼位置（手机端尤其重要），不要藏在折叠菜单或长列表底部。
- 没有返回按钮、或点击后无法回退的插件页面，视为不合规。

参考实现（页面栈 + 顶部返回按钮）：

```js
tide.ui.registerView({
  id: "my-view",
  title: "我的页面",
  render(el) {
    const stack = []; // 插件内部页面栈
    const show = (renderPage) => {
      el.textContent = "";
      const topbar = document.createElement("div");
      topbar.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
      if (stack.length > 0) {
        const back = document.createElement("button");
        back.textContent = "← 返回";
        back.onclick = () => show(stack.pop());
        topbar.appendChild(back);
      }
      el.appendChild(topbar);
      el.appendChild(renderPage());
    };
    const home = () => {
      const page = document.createElement("div");
      const item = document.createElement("button");
      item.textContent = "打开详情";
      item.onclick = () => { stack.push(home); show(detail); };
      page.appendChild(item);
      return page;
    };
    const detail = () => {
      const page = document.createElement("div");
      page.textContent = "这是子页面，点上方「← 返回」回首页";
      return page;
    };
    show(home);
  },
});
```

跨视图跳转的返回（跳走前记下来源）：

```js
// 进入插件前用户停留在哪个视图，就记下来
let fromView = "quadrant";
// 需要把用户送去其他视图时：
function gotoTimeblock() {
  fromView = "quadrant"; // 或按实际情况记录
  tide.util.navigate("timeblock");
}
// 插件首页返回按钮：
backButton.onclick = () => tide.util.navigate(fromView);
```

### 4.2 其他建议

- 首屏先展示插件能做什么，再展示配置项。
- 登录类插件明确说明账号信息如何保存、是否落盘。
- 网络请求提供加载、失败、重试和空状态。
- 会产生任务或时间块的操作，在执行前明确说明影响范围。
- 不要把密钥、Cookie、Token 写进源码或示例仓库。

## 5. 安全说明

当前 v0.9.x 外部插件属于“受信任扩展”模型：插件代码在应用前端上下文中执行。只安装你自己编写、审核过或可信来源提供的插件 ZIP。不要把未知来源插件当作完全隔离的沙箱应用。

后续若需要面向公开插件市场，建议把第三方插件迁移到隔离 iframe / Worker / 独立 WebView，并通过消息桥暴露最小权限 API。

## 6. 发布前自检

- `manifest.json` 可被 JSON 解析。
- `id` 唯一且稳定。
- `entry` 文件存在。
- 所声明权限与实际能力一致。
- 每个插件页面都有返回按钮，点击后能正确返回上一页（子页面回上一级，跨视图跳转回来源视图）。
- 无硬编码密钥、账号、Cookie、上传私钥。
- 离线状态不会卡死页面。
- 失败信息对用户可读。
- 至少完成一次导入、启用、停用、重新扫描、导出测试。

## 7. 项目资源

- 项目仓库：https://github.com/momoqiqi-qwq/tidebalance
- 官方网站：https://YOUR-WEBSITE.example

> 官网地址为待配置占位符。请在发布前替换为你的真实网站域名。
