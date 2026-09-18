/* ═══════════════════════════════════════════════════════════════════
   示例插件 · 插件开发的「可跑参考实现」

   配套文档：「插件使用说明 → 下载插件开发文档」（plugin-guide 目录下的
   plugin-development.md，在线版为 docs/index.html）。

   这个插件刻意保持小而完整：一个视图、两个文件（manifest.json + main.js），
   没有框架、没有构建步骤 —— 每张卡片演示文档里的一类宿主能力，且全部是
   真调用（不是伪代码）：

     ① 私有存储     tide.storage.get / set        —— await 异步，按插件 ID 隔离
     ② 创建任务     tide.tasks.create             —— 自动记住 sourcePlugin 来源
     ③ 一句话变日程 tide.util.parseWhen + tide.blocks.createSmart
     ④ 应用内通知   tide.notify(msg, { actionLabel, action })
     ⑤ 事件总线     tide.events.on / emit         —— 建议事件名带插件前缀
     ⑥ 子页面栈     开发文档 4.1 的返回按钮硬性要求的参考实现

   权限对账：manifest.permissions 必须覆盖实际调用（宿主 requirePermission
   会抛错）。本插件声明 ui / storage / tasks / blocks / notify / events /
   timeParse —— 与下面用到的能力一一对应，多一个都是没用的声明。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  const VIEW_ID = "example-plugin";

  /* 页面栈放模块级：首页卡片（renderHome）也要能压栈；每次进入视图在 render 里重置 */
  const stack = [];

  /* ── 极简 DOM 工具：插件里可以用 document，但建议封成小函数保持可读 ── */
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function button(label, fn, primary) {
    const b = document.createElement("button");
    b.className = "ep-btn";
    b.textContent = label;
    if (primary) b.classList.add("pri");
    b.onclick = () => Promise.resolve().then(fn).catch((e) => say(b, "出错：" + (e && e.message || e)));
    return b;
  }

  /* 每张卡片一根结果行：动作的反馈落在卡片里，而不是只有 toast（可回看） */
  function say(node, text) { node.textContent = text; }

  function card(host, { title, desc }) {
    const box = document.createElement("section");
    box.className = "ep-card";
    box.innerHTML = `<h3>${esc(title)}</h3><p>${esc(desc)}</p><div class="ep-row"></div><div class="ep-out">尚未执行</div>`;
    host.append(box);
    return { row: box.querySelector(".ep-row"), out: box.querySelector(".ep-out") };
  }

  function ensureStyle() {
    if (document.getElementById("ep-style")) return;
    const st = document.createElement("style");
    st.id = "ep-style";
    st.textContent = `
.ep-card{border:1px solid var(--border,#E4DFD6);background:var(--card,#fff);border-radius:14px;padding:14px 16px}
.ep-card h3{margin:0 0 4px;font-size:14.5px}
.ep-card p{margin:0 0 10px;font-size:12.5px;line-height:1.75;color:var(--muted,#687780)}
.ep-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.ep-out{margin-top:9px;padding-top:9px;border-top:1px dashed var(--border,#E4DFD6);font-size:12.5px;line-height:1.7;color:var(--ink-2,#5B6B76);min-height:1em}
.ep-btn{cursor:pointer;border:1px solid var(--border,#D8D2C6);background:var(--card,#fff);color:var(--ink,#22303A);border-radius:10px;padding:7px 13px;font-size:12.5px}
.ep-btn.pri{background:var(--accent,#2F6FED);border-color:transparent;color:#fff}
.ep-btn{transition:transform .12s ease,box-shadow .15s ease,filter .15s ease}
.ep-btn:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(34,48,58,.14);filter:brightness(1.04)}
.ep-btn:active{transform:translateY(0) scale(.97);box-shadow:none}`;
    document.head.append(st);
  }

  /* ── ⑥ 子页面：演示「页面栈 + 顶部返回按钮」（开发文档 4.1 硬性要求）── */
  function renderAbout(show) {
    const page = document.createElement("div");
    page.innerHTML = `<p style="font-size:13px;line-height:1.9;color:var(--ink-2,#7E8B94)">
      插件在宿主里是这么跑起来的：<br>
      1. 启动时宿主读 <b>pluginCatalog</b>（由 tools/sync-plugins.js 从各 manifest 生成）；<br>
      2. 每个插件的 main.js 在函数环境里执行，宿主注入唯一的 <b>tide</b> 对象；<br>
      3. 插件用 tide.ui.registerView 注册页面，页面出现在侧栏「插件视图」里；<br>
      4. 私有存储挂在 state.plugins["${esc(VIEW_ID)}"].storage 下，改 ID 等于丢数据。</p>`;
    return page;
  }

  /* ── 首页：构建自己的容器并返回，交给 show() 挂载 ── */
  function renderHome(show) {
    ensureStyle();
    const root = document.createElement("div");

    const head = document.createElement("div");
    head.style.cssText = "max-width:860px;margin:0 auto;padding:22px 18px 8px";
    head.innerHTML = `<h2 style="margin:0 0 7px;font-size:24px">示例插件</h2>
      <div style="color:var(--muted,#7E8B94);font-size:13px;line-height:1.8">
      给插件开发者的参考实现：下面每张卡片对应开发文档里的一类宿主能力，点了真的会执行。
      源码就在 <b>public/plugins/${esc(VIEW_ID)}/</b>，两个文件，没有框架。</div>`;
    root.append(head);

    const host = document.createElement("div");
    host.style.cssText = "max-width:860px;margin:0 auto;padding:6px 18px 26px;display:grid;gap:12px";
    root.append(host);

    /* ① 私有存储：打开次数。注意 get/set 都是 await —— 宿主可能跨 WebView 落盘 */
    {
      const c = card(host, {
        title: "① 私有存储 tide.storage",
        desc: "按插件 ID 隔离的键值存储，随应用数据一起备份/同步。这里记录本视图的打开次数。",
      });
      const btn = button("读一次并 +1", async () => {
        const visits = await tide.storage.get("visits", 0);
        await tide.storage.set("visits", visits + 1);
        say(c.out, `这是本插件第 ${visits + 1} 次被打开（键 visits 已写回存储）`);
      }, true);
      c.row.append(btn);
    }

    /* ② 创建任务：宿主会强制盖上 sourcePlugin 印章，四象限/抽屉据此显示来源图标 */
    {
      const c = card(host, {
        title: "② 创建任务 tide.tasks",
        desc: "创建的任务自动记住来源插件（sourcePlugin，插件自己传的同名字段会被宿主覆盖）。四象限和任务抽屉里能看到本插件的图标。",
      });
      c.row.append(button("建一个示例任务", async () => {
        const task = tide.tasks.create({ title: "来自示例插件的问候", quad: 2 });
        tide.notify(`任务已创建：${task.title}`, { actionLabel: "去四象限", action: () => tide.util.navigate("quadrant") });
        say(c.out, `已创建任务 #${task.id}（quad 2 · 来源自动标记为 ${VIEW_ID}）`);
      }, true));
    }

    /* ③ 一句话变日程：时间语义解析 + 冲突感知的智能排程。解析不出日期会抛错，交给按钮统一兜底 */
    {
      const c = card(host, {
        title: "③ 一句话变日程 parseWhen + createSmart",
        desc: "先用 tide.util.parseWhen 把自然语言解析成 { date, startMin, endMin, title }，再用 createSmart 排进时间块 —— 有冲突会自动找最近的空档。",
      });
      const input = document.createElement("input");
      input.value = "明天下午3点到4点 阅读插件开发文档";
      input.style.cssText = "flex:1;min-width:180px;border:1px solid var(--border,#E4DFD6);border-radius:10px;padding:8px 10px;font-size:12.5px;color:var(--ink,#22303A);background:var(--card,#fff)";
      c.row.append(input);
      c.row.append(button("排进今天的时间块", () => {
        const parsed = tide.util.parseWhen(input.value);
        if (!parsed.date) { say(c.out, "这句话里解析不出日期 —— 试试「明天下午3点到4点 …」"); return; }
        const start = tide.util.hhmmOf(parsed.startMin);
        const durMin = parsed.endMin ? parsed.endMin - parsed.startMin : 45;
        const { block, moved, conflicts } = tide.blocks.createSmart({ date: parsed.date, start, durMin, title: parsed.title });
        tide.notify(moved ? "目标时段有冲突，已自动挪到空档" : "已排进时间块", { actionLabel: "查看", action: () => tide.util.navigate("timeblock") });
        say(c.out, `${parsed.date} ${block.start}~${block.end}「${block.title}」${moved ? `（原时段冲突${conflicts.length ? "：" + conflicts.length + " 个碰撞" : ""}，已自动挪动）` : ""}`);
      }, true));
    }

    /* ④ 应用内通知：notify 自带「插件名：」前缀；actionLabel 是可点击的动作按钮 */
    {
      const c = card(host, {
        title: "④ 应用内通知 tide.notify",
        desc: "通知文本自动加「示例插件：」前缀；可以带一个动作按钮（actionLabel + action）。",
      });
      c.row.append(button("发一条带动作的通知", () => {
        tide.notify("这条通知带一个动作按钮", { actionLabel: "点我", action: () => say(c.out, "动作按钮被点击了 —— action 回调执行于宿主侧，不需要额外权限") });
        say(c.out, "通知已发出（右上角 / 顶栏 toast）");
      }, true));
    }

    /* ⑤ 事件总线：订阅真实事件 pomodoro:finished；再自己 emit 一条验证收发回路。
       惯例：事件名用插件 ID 当前缀，避免和别的插件撞名。 */
    {
      const c = card(host, {
        title: "⑤ 事件总线 tide.events",
        desc: "跨插件广播。左边订阅了番茄专注的真实事件 pomodoro:finished；右边发一条自己的事件验证收发（事件名带插件前缀是惯例）。",
      });
      let received = 0;
      tide.events.on("pomodoro:finished", () => {
        received += 1;
        say(c.out, `番茄专注完成了 ${received} 次（pomodoro:finished）`);
      });
      tide.events.on("example-plugin:ping", (data) => {
        say(c.out, `收到 example-plugin:ping，载荷 n=${data && data.n}`);
      });
      c.row.append(button("发一条 example-plugin:ping", () => {
        tide.events.emit("example-plugin:ping", { n: Date.now() });
      }));
    }

    /* ⑥ 子页面栈入口：见 renderAbout 与 show() —— 开发文档 4.1 的返回按钮契约 */
    {
      const c = card(host, {
        title: "⑥ 子页面栈（返回按钮契约）",
        desc: "插件内部的多级页面由插件自己维护页面栈，「← 返回」回上一级。这是上架检查项，参考实现就在本插件源码里。",
      });
      c.row.append(button("打开「插件是如何加载的」子页", () => {
        stack.push(renderHome);   // 先把当前页压栈，返回按钮才会出现（见 show() 的约定）
        show(renderAbout);
      }));
    }

    const foot = document.createElement("div");
    foot.style.cssText = "max-width:860px;margin:0 auto;padding:0 18px 30px";
    foot.innerHTML = `<div style="border:1px solid var(--border,#E4DFD6);border-radius:12px;padding:12px 14px;color:var(--muted,#687780);font-size:12px;line-height:1.8">
      完整的 API 清单（网络桥 / 密钥库 / 教务导入 / 资源落盘…）见「插件使用说明 → 下载插件开发文档」。
      把本目录复制改名、改掉 manifest 里的 id，就是一个新插件的起点。</div>`;
    root.append(foot);
    return root;
  }

  /* ── 注册视图：show() 实现页面栈 —— 每次进页面整棵重建，栈顶弹出即回上一级 ── */
  tide.ui.registerView({
    id: VIEW_ID,
    title: "示例插件",
    icon: "seal",
    render(root) {
      ensureStyle();
      stack.length = 0; // 每次进入视图页面栈归位到首页
      const show = (renderPage) => {
        root.replaceChildren();
        const bar = document.createElement("div");
        bar.style.cssText = "max-width:860px;margin:0 auto;padding:14px 18px 0;display:flex;align-items:center;gap:10px";
        if (stack.length > 0) {
          const back = document.createElement("button");
          back.className = "ep-btn";
          back.textContent = "← 返回";
          back.onclick = () => show(stack.pop());
          bar.append(back);
        }
        root.append(bar);
        root.append(renderPage(show));
      };
      show(renderHome);
    },
  });
})();
