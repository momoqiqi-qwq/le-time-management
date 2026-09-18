// 周度报告插件 —— 演示只读使用 tasks / blocks API
(function () {
  const CATS = [
    { id: "work", label: "深度工作", color: "#0F4C5C" },
    { id: "study", label: "学习", color: "#9B5DE5" },
    { id: "sport", label: "运动", color: "#FF6B6B" },
    { id: "life", label: "生活", color: "#E3A008" },
    { id: "rest", label: "休息", color: "#2EC4B6" },
  ];
  function addDays(ds, n, util) { return util.addDays(ds, n); }
  function weekday(ds) {
    const [y, m, d] = ds.split("-").map(Number);
    return "日一二三四五六"[new Date(y, m - 1, d).getDay()];
  }
  function dur(m) { return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? (m % 60) + "m" : ""}`; }

  function render(el2) {
    el2.innerHTML = "";
    const root = document.createElement("div");
    root.style.cssText = "max-width:760px;margin:0 auto";
    root.innerHTML = `<div style="font-size:calc(11px * var(--ui-text-scale));letter-spacing:.3em;color:var(--ink-2,#7E8B94);margin:14px 0 16px">周 度 报 告 · 内 置 插 件</div>`;
    const card = document.createElement("div");
    card.style.cssText = "background:var(--panel,#fff);color:var(--ink,#22303A);border:1px solid var(--line,#E4DFD6);border-radius:18px;padding:26px 30px;box-shadow:var(--shadow,0 2px 10px rgba(34,48,58,.07))";
    root.append(card);
    el2.append(root);

    const today = tide.util.today();
    const days = [];
    for (let i = -6; i <= 0; i++) days.push(addDays(today, i, tide.util));

    Promise.all(days.map((d) => tide.blocks.list(d))).then((weeks) => {
      const perDay = weeks.map((bs) => bs.reduce((a, b) => a + b.durMin, 0));
      const total = perDay.reduce((a, b) => a + b, 0);
      const byCat = {};
      weeks.flat().forEach((b) => { byCat[b.cat] = (byCat[b.cat] || 0) + b.durMin; });
      const maxDay = Math.max(60, ...perDay);
      const tasks = tide.tasks.list();
      const done = tasks.filter((t) => t.done).length;

      // 柱状图
      const chart = document.createElement("div");
      chart.style.cssText = "display:flex;align-items:flex-end;gap:14px;height:150px;margin:18px 0 4px";
      days.forEach((d, i) => {
        const col = document.createElement("div");
        col.style.cssText = "flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end";
        const bar = document.createElement("div");
        bar.style.cssText = `width:100%;max-width:44px;border-radius:7px 7px 3px 3px;background:${i === 6 ? "linear-gradient(180deg,#9B5DE5,#0F4C5C)" : "linear-gradient(180deg,#118AB2,#5FC6E0)"};height:${Math.max(3, (perDay[i] / maxDay) * 100)}%`;
        const lab = document.createElement("span");
        lab.style.cssText = "font-size:calc(10px * var(--ui-text-scale));color:var(--ink-2,#7E8B94)";
        lab.textContent = `${weekday(d)} ${dur(perDay[i])}`;
        col.append(bar, lab);
        chart.append(col);
      });

      // 分类占比
      const legend = document.createElement("div");
      legend.style.cssText = "display:flex;flex-wrap:wrap;gap:8px 18px;margin:12px 0 4px";
      CATS.forEach((c) => {
        const v = byCat[c.id] || 0;
        const item = document.createElement("span");
        item.style.cssText = "font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2,#7E8B94);display:flex;align-items:center;gap:6px";
        item.innerHTML = `<i style="width:9px;height:9px;border-radius:3px;background:${c.color};display:inline-block"></i>${c.label} <b style="color:var(--ink,#22303A)">${dur(v)}</b>`;
        legend.append(item);
      });

      // 任务完成
      const comp = document.createElement("div");
      comp.style.cssText = "margin-top:16px;padding-top:14px;border-top:1px dashed var(--line-soft,#EFEAE1);font-size:calc(12.5px * var(--ui-text-scale));color:var(--ink-2,#7E8B94)";
      comp.innerHTML = `本周排程合计 <b style="color:var(--ink,#22303A)">${dur(total)}</b> · 任务完成 <b style="color:var(--ink,#22303A)">${done}/${tasks.length}</b> · 日均 ${dur(Math.round(total / 7))}`;

      card.innerHTML = `<div style="font-size:calc(16px * var(--ui-text-scale));font-weight:700">过去 7 天</div>`;
      card.append(chart, legend, comp);
    });
  }

  tide.ui.registerView({ id: "weekly-report", title: "周度报告", icon: 'chart-column', render });
})();
