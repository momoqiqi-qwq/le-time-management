import { el } from "../../ui.js";

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

  const paintPage = ({ animate = false } = {}) => {
    for (const entry of entries) {
      const isActive = entry.id === active && visibleIds.has(entry.id);
      entry.node.hidden = !isActive;
      entry.node.classList.toggle("settings-section-active", isActive);
      if (isActive && animate && typeof entry.node.animate === "function") {
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
    paintActive();
    paintPage({ animate });
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
    paintActive();
    paintPage({ animate: false });
    result.textContent = `显示 ${visibleIds.size} / ${entries.length}`;
    empty.hidden = visibleIds.size > 0;
    list.hidden = visibleIds.size === 0;
  };

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

  return { node, apply, select };
}
