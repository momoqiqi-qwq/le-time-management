import { el } from "../../ui.js";

// 分类图标：复用打包内 Font Awesome solid（与快捷 dock 同款根路径）。
// 本地小助手而不是从 shell.js 引入，避免设置视图反向依赖外壳造成循环 import。
function faIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "fa-ic");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `/icons/fontawesome/solid.svg#${name}`);
  svg.append(use);
  return svg;
}

// 窄屏断点与 styles.css 的 ≤980px 设置页规则保持一致。
const NARROW_QUERY = "(max-width: 980px)";

export function createSettingsNavigator(entries, state = {}) {
  const search = el("input", {
    class: "settings-search",
    type: "search",
    value: state.query || "",
    placeholder: "搜索设置，例如：背景、快捷键、WebDAV、提醒…",
    "aria-label": "搜索设置",
  });
  const result = el("span", { class: "settings-result" });
  const list = el("div", { class: "settings-catalog", role: "tablist", "aria-label": "设置分类" });
  const empty = el("div", { class: "settings-empty", hidden: true }, "没有找到匹配的设置项");

  const buttons = new Map();
  let active = state.active || entries[0]?.id || "";
  let visibleIds = new Set(entries.map((entry) => entry.id));

  /* ── 窄屏（Android / 手机）：横向分类行 → 手风琴 ──
     手机上 11 个分类要横向滑才看得全，而且一次只显示一块内容，「下面还有什么」完全看不见。
     所以窄屏改成手风琴：每个分区一个带头图、名称与方向箭头的标题行，点标题就地展开/收起，
     全部分区都在同一页里纵向排列。桌面仍是「左侧分类 + 右侧单页」，只是多出来的这些
     标题行在 CSS 里被隐藏（见 .settings-acc-head 的 display:none 规则）。 */
  const narrow = window.matchMedia ? window.matchMedia(NARROW_QUERY) : { matches: false };
  let expanded = new Set();            // 窄屏下哪些分区是展开的（搜索时会整体替换）
  const heads = new Map();             // entry.id -> { wrap, head, body }

  const panels = entries.map((entry) => {
    const body = el("div", { class: "settings-acc-body" }, entry.node);
    const head = el("button", {
      class: "settings-acc-head",
      type: "button",
      "aria-expanded": "false",
      onclick: () => toggleSection(entry.id),
    },
      el("span", { class: "settings-acc-ico", "aria-hidden": "true" }, faIcon(entry.icon || "gear")),
      el("span", { class: "settings-acc-copy" },
        el("b", {}, entry.label || entry.id),
        entry.hint ? el("small", {}, entry.hint) : null,
      ),
      el("span", { class: "settings-acc-arrow", "aria-hidden": "true" }),
    );
    const wrap = el("section", { class: "settings-acc" }, head, body);
    heads.set(entry.id, { wrap, head, body });
    return wrap;
  });

  /** 窄屏点标题行：展开 / 收起；桌面标题行不可见，兜底当作「切到该分类」。 */
  function toggleSection(id) {
    if (!narrow.matches) { select(id); return; }
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
    paintPage({ animate: expanded.has(id) });
  }

  const paintPage = ({ animate = false } = {}) => {
    const isNarrow = !!narrow.matches;
    for (const entry of entries) {
      const view = heads.get(entry.id);
      if (!view) continue;
      const visible = visibleIds.has(entry.id);
      const isActive = entry.id === active && visible;
      entry.node.classList.toggle("settings-section-active", isActive);
      // 窄屏：全部分区都在页面上，收放只看 expanded；桌面：只显示当前分类
      const open = isNarrow ? visible && expanded.has(entry.id) : isActive;
      view.wrap.hidden = isNarrow ? !visible : !isActive;
      view.body.hidden = !open;
      view.wrap.classList.toggle("settings-acc-open", open);
      view.head.setAttribute("aria-expanded", String(open));
      if (animate && open && isNarrow && typeof view.body.animate === "function") {
        view.body.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 160, easing: "cubic-bezier(.22,.8,.22,1)" });
      }
      if (animate && !isNarrow && isActive && typeof entry.node.animate === "function") {
        entry.node.animate([
          { opacity: .45, transform: "translateX(8px)" },
          { opacity: 1, transform: "translateX(0)" },
        ], { duration: 180, easing: "cubic-bezier(.22,.8,.22,1)" });
      }
    }
  };

  const paintActive = () => {
    for (const [id, btn] of buttons) {
      const on = id === active;
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
    }
  };

  const select = (id, { animate = true } = {}) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry || !visibleIds.has(id)) return;
    active = id;
    state.active = id;
    const wasExpanded = expanded.has(id);
    if (narrow.matches) expanded.add(id);
    paintActive();
    paintPage({ animate });
    // 窄屏下选中一个还是收着的分区时，把它滚到视口顶部 —— 否则点了分类名字还得自己往下翻找，
    // 看起来像「点了没反应」。已经展开过的不再滚，避免用户手动收起来后被反复拽回去。
    if (narrow.matches && !wasExpanded) {
      const view = heads.get(id);
      requestAnimationFrame(() => view?.wrap?.scrollIntoView?.({ block: "start", behavior: animate ? "smooth" : "auto" }));
    }
  };

  const paintButtons = () => {
    list.replaceChildren();
    buttons.clear();
    for (const entry of entries) {
      const btn = el("button", {
        class: `settings-nav-item${active === entry.id ? " on" : ""}`,
        type: "button",
        role: "tab",
        "aria-controls": `settings-${entry.id}`,
        "aria-selected": String(active === entry.id),
        onclick: () => select(entry.id),
      },
        el("span", { class: "settings-nav-ico", "aria-hidden": "true" }, faIcon(entry.icon || "gear")),
        el("span", { class: "settings-nav-item-copy" },
          el("b", {}, entry.label || entry.id),
          entry.hint ? el("small", {}, entry.hint) : null,
        ),
        el("span", { class: "settings-nav-chevron", "aria-hidden": "true" }, "›"),
      );
      buttons.set(entry.id, btn);
      list.append(btn);
    }
  };

  let expandedBeforeSearch = null;

  const apply = () => {
    const q = search.value.trim().toLowerCase();
    state.query = search.value;
    visibleIds = new Set();
    let firstVisible = null;
    for (const entry of entries) {
      const haystack = `${entry.label || ""} ${entry.keywords || ""} ${entry.node.textContent || ""}`.toLowerCase();
      const searchOk = !q || haystack.includes(q);
      const btn = buttons.get(entry.id);
      if (btn) btn.hidden = !searchOk;
      if (searchOk) {
        visibleIds.add(entry.id);
        if (!firstVisible) firstVisible = entry.id;
      }
    }
    if (!visibleIds.has(active)) active = firstVisible || "";
    state.active = active;
    // 窄屏搜索：命中的分区直接展开（否则搜到的东西全在收起状态，等于没搜）；
    // 清空搜索词时把搜索前的展开状态还回去，别把 11 个分区全留成展开。
    if (narrow.matches) {
      if (q) {
        if (!expandedBeforeSearch) expandedBeforeSearch = new Set(expanded);
        expanded.clear();
        for (const id of visibleIds) expanded.add(id);
      } else if (expandedBeforeSearch) {
        expanded = new Set(expandedBeforeSearch);
        expandedBeforeSearch = null;
      }
    }
    paintActive();
    paintPage({ animate: false });
    result.textContent = `显示 ${visibleIds.size} / ${entries.length}`;
    empty.hidden = visibleIds.size > 0;
    list.hidden = visibleIds.size === 0;
  };

  // 断点变化（手机横竖屏切换、桌面窗口拉窄）时重算一次：进入窄屏时至少展开当前分类，
  // 否则会出现「全都收着、点了设置像打开的是一张目录」。
  const onModeChange = () => {
    if (narrow.matches && !expanded.size && active) expanded.add(active);
    paintPage({ animate: false });
  };
  narrow.addEventListener?.("change", onModeChange);
  if (narrow.matches && active) expanded.add(active);

  search.addEventListener("input", apply);
  paintButtons();

  const node = el("aside", { class: "settings-sidebar" },
    el("div", { class: "settings-nav-card" },
      el("div", { class: "settings-sidebar-head" },
        el("b", {}, "设置分类"),
        result,
      ),
      search,
      list,
      empty,
    ),
  );

  return { node, apply, select, panels };
}
