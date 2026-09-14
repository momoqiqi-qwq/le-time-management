import * as S from "../../store.js";
import { el, toast } from "../../ui.js";
import { THEMES, getThemeMode, resolveThemeMode, setTheme, setThemeMode } from "../../theme.js";
import { DEFAULT_BACKGROUND, normalizeBackground, setBackground } from "../../background.js";
import {
  DEFAULT_UI_PREFERENCES,
  STARTUP_VIEW_OPTIONS,
  WINDOW_SIZE_OPTIONS,
  getUiPreferences,
  resetUiPreferences,
  setUiPreferences,
} from "../../uiPreferences.js";
import { CUSTOM_SIZE_LIMITS, applyWindowSize, isDesktopRuntime, windowSizeHint } from "../../windowSize.js";

function toggleRow(label, checked, onChange, note = "") {
  const input = el("input", { type: "checkbox", checked: checked ? true : null });
  input.addEventListener("change", () => onChange(input.checked));
  return el("div", { class: "setting-row" },
    el("span", { class: "setting-copy" }, el("b", {}, label), note ? el("small", {}, note) : null),
    input,
  );
}

export function createInterfaceCard({ rerender = () => {} } = {}) {
  const prefs = getUiPreferences();
  const densityBox = el("div", { class: "pref-choice", role: "group", "aria-label": "界面密度" });
  for (const [id, label] of [["comfortable", "舒适"], ["compact", "紧凑"]]) {
    densityBox.append(el("button", {
      class: `pref-choice-btn${prefs.density === id ? " on" : ""}`,
      onclick: () => { setUiPreferences({ density: id }); rerender(); },
    }, label));
  }

  const textScale = el("input", { type: "range", min: "90", max: "120", step: "5", value: String(prefs.textScale) });
  const textScaleOut = el("output", {}, `${prefs.textScale}%`);
  textScale.addEventListener("input", () => {
    textScaleOut.textContent = `${textScale.value}%`;
    setUiPreferences({ textScale: Number(textScale.value) }, { persist: false });
  });
  textScale.addEventListener("change", () => setUiPreferences({ textScale: Number(textScale.value) }));

  const motion = el("select", {},
    el("option", { value: "system" }, "跟随系统"),
    el("option", { value: "full" }, "完整动效"),
    el("option", { value: "reduced" }, "减少动效"),
  );
  motion.value = prefs.motion;
  motion.addEventListener("change", () => setUiPreferences({ motion: motion.value }));

  const startup = el("select", {});
  for (const [id, label] of STARTUP_VIEW_OPTIONS) startup.append(el("option", { value: id }, label));
  startup.value = prefs.startupView;
  startup.addEventListener("change", () => { setUiPreferences({ startupView: startup.value }); toast("启动页设置将在下次打开应用时生效"); });

  /* 启动窗口大小：桌面端启动时套用（实现见 src/windowSize.js）。 */
  const desktopWindow = isDesktopRuntime();
  const windowMode = el("select", {});
  for (const [id, label] of WINDOW_SIZE_OPTIONS) windowMode.append(el("option", { value: id }, label));
  windowMode.value = prefs.startupWindowMode;
  const winW = el("input", { type: "number", class: "win-size", min: String(CUSTOM_SIZE_LIMITS.minWidth), max: String(CUSTOM_SIZE_LIMITS.maxWidth), step: "20", value: String(prefs.startupWindowWidth), "aria-label": "启动窗口宽度" });
  const winH = el("input", { type: "number", class: "win-size", min: String(CUSTOM_SIZE_LIMITS.minHeight), max: String(CUSTOM_SIZE_LIMITS.maxHeight), step: "20", value: String(prefs.startupWindowHeight), "aria-label": "启动窗口高度" });
  const customSize = el("span", { class: "win-size-row" }, winW, el("span", { class: "win-size-sep" }, "×"), winH);
  const windowHint = el("small", { class: "win-size-hint" });
  const syncWindowRow = () => {
    customSize.style.display = windowMode.value === "custom" ? "" : "none";
    windowHint.textContent = windowSizeHint(windowMode.value, {
      startupWindowWidth: Number(winW.value),
      startupWindowHeight: Number(winH.value),
    }) + (desktopWindow ? "" : " 当前环境不支持调整窗口，仅桌面端安装版生效。");
  };
  windowMode.addEventListener("change", () => {
    setUiPreferences({ startupWindowMode: windowMode.value });
    syncWindowRow();
  });
  for (const input of [winW, winH]) {
    input.addEventListener("change", () => {
      setUiPreferences({ startupWindowWidth: Number(winW.value), startupWindowHeight: Number(winH.value) });
      // 越界输入会被 normalize 夹回范围内，写回控件让用户看到真实生效值。
      const fixed = getUiPreferences();
      winW.value = String(fixed.startupWindowWidth);
      winH.value = String(fixed.startupWindowHeight);
      syncWindowRow();
    });
  }
  const applyWindowNow = async () => {
    const out = await applyWindowSize(getUiPreferences());
    if (out.applied) toast(out.mode === "full" ? "窗口已铺满可用区域" : `窗口已调整为 ${out.width} × ${out.height}`);
    else toast(`当前环境无法调整窗口${desktopWindow ? `：${out.reason || "未知原因"}` : ""}`);
  };
  const windowRow = el("div", { class: "setting-row setting-col" },
    el("span", { class: "setting-copy" },
      el("b", {}, "启动窗口大小"),
      el("small", {}, "每次打开应用时的默认窗口大小；手动拖过的尺寸不会记忆")),
    el("div", { class: "win-size-row" },
      windowMode,
      customSize,
      el("button", { class: "btn ghost sm", type: "button", onclick: applyWindowNow }, "立即应用"),
    ),
    windowHint,
  );
  syncWindowRow();

  const applyPreset = (name, patch) => {
    setUiPreferences(patch);
    toast(`已应用「${name}」界面预设`);
    rerender();
  };

  return el("div", { class: "card set-card" },
    el("h2", {}, "界面与交互"),
    el("p", { class: "desc" }, "控制信息密度、文字、动效、手势和启动行为。这里只改变显示与交互，不会修改任务或时间块数据。"),
    el("div", { class: "pref-presets", "aria-label": "界面预设" },
      el("button", { class: "btn ghost sm", onclick: () => applyPreset("舒适", { ...DEFAULT_UI_PREFERENCES }) }, "舒适预设"),
      el("button", { class: "btn ghost sm", onclick: () => applyPreset("高密度", { density: "compact", textScale: 95, motion: "system", showTopStats: true, showViewSubtitle: false }) }, "高密度"),
      el("button", { class: "btn ghost sm", onclick: () => applyPreset("低干扰", { density: "comfortable", textScale: 100, motion: "reduced", showTopStats: false, showViewSubtitle: false }) }, "低干扰"),
    ),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "界面密度"), el("small", {}, "紧凑模式会减少卡片、导航和列表留白")), densityBox),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "文字大小"), el("small", {}, "适合高分屏、远距离显示或更大字号需求")), el("span", { class: "pref-range" }, textScale, textScaleOut)),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "页面动效"), el("small", {}, "减少动效可降低页面切换与按钮过渡")), motion),
    toggleRow("显示顶部任务统计", prefs.showTopStats, (value) => setUiPreferences({ showTopStats: value }), "关闭后顶部更清爽"),
    toggleRow("顶部任务统计居中", prefs.centerTopStats, (value) => setUiPreferences({ centerTopStats: value }), "让“待办 / 已完成”固定显示在窗口顶部中央"),
    toggleRow("显示页面副标题", prefs.showViewSubtitle, (value) => setUiPreferences({ showViewSubtitle: value }), "例如“四象限 · 先决定，再动手”中的说明"),
    toggleRow("触摸左右滑动翻页", prefs.swipeNavigation, (value) => setUiPreferences({ swipeNavigation: value }), "关闭可减少 Android / 触屏设备误触翻页"),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "启动后进入"), el("small", {}, "选择固定页面，或继续上次离开的位置")), startup),
    desktopWindow ? windowRow : null,
    el("div", { class: "data-actions pref-reset" },
      el("button", { class: "btn ghost sm", onclick: () => { resetUiPreferences(); toast("界面与交互设置已恢复默认"); rerender(); } }, "恢复界面默认"),
    ),
  );
}

function createSwatch(item, dark) {
  const colors = dark ? item.darkColors : item.colors;
  return el("span", { class: "theme-swatch", "aria-hidden": "true" },
    ...colors.map((color) => el("i", { style: `background:${color}` })),
  );
}

export function createThemeCard() {
  const settings = S.getState().settings;
  const selectedId = settings.theme || "classic";
  const selectedMode = getThemeMode();
  const themeCard = el("div", { class: "card set-card" },
    el("h2", {}, "主题"),
    el("p", { class: "desc" }, "选择浅色、深色或跟随系统；每套主题都有自己的深色配色，深色模式下换主题同样会变。切换会即时预览，不会刷新页面。"),
  );
  const modeNote = el("p", { class: "desc theme-mode-note" });
  const modeBox = el("div", { class: "theme-mode", role: "radiogroup", "aria-label": "显示模式" });
  for (const [id, label, note] of [
    ["system", "跟随系统", "自动适配系统浅深色"],
    ["light", "浅色模式", "明亮纸面界面"],
    ["dark", "深色模式", "低亮度夜间界面"],
  ]) {
    const on = selectedMode === id;
    modeBox.append(el("button", {
      class: `theme-mode-btn${on ? " on" : ""}`,
      type: "button",
      role: "radio",
      "aria-checked": String(on),
      onclick: (event) => {
        setThemeMode(id, { animate: true });
        for (const node of modeBox.querySelectorAll(".theme-mode-btn")) {
          const active = node === event.currentTarget;
          node.classList.toggle("on", active);
          node.setAttribute("aria-checked", String(active));
        }
        paintModeNote();
        paintSwatches();
        toast(`已切换为${label}${id === "system" ? `（当前 ${resolveThemeMode() === "dark" ? "深色" : "浅色"}）` : ""}`);
      },
    }, el("b", {}, label), el("small", {}, note)));
  }
  const themeGrid = el("div", { class: "theme-grid", role: "radiogroup", "aria-label": "界面主题" });

  // 夜间护眼本身就是深色主题，不受模式影响；其余主题按当前模式显示对应色板。
  const isDarkPreview = (item) => item.colorScheme === "dark" || resolveThemeMode() === "dark";
  const swatchNodes = new Map();
  const paintSwatches = () => {
    for (const [item, node] of swatchNodes) {
      const colors = isDarkPreview(item) ? item.darkColors : item.colors;
      [...node.children].forEach((dot, index) => { dot.style.background = colors[index]; });
    }
  };
  const paintModeNote = () => {
    const resolved = resolveThemeMode();
    const system = getThemeMode() === "system";
    modeNote.textContent = `当前生效：${resolved === "dark" ? "深色配色" : "浅色配色"}` +
      (system ? `（跟随系统，检测到系统为${resolved === "dark" ? "深色" : "浅色"}）` : "") +
      "；上方 ${THEMES.length} 套主题各自带深色版，深色模式下切换会即时生效。";
  };

  const selectTheme = (item, button) => {
    if (button.classList.contains("on")) return;
    setTheme(item.id, { animate: true });
    for (const node of themeGrid.querySelectorAll(".theme-card")) {
      const on = node === button;
      node.classList.toggle("on", on);
      node.setAttribute("aria-checked", String(on));
      node.tabIndex = on ? 0 : -1;
    }
    toast(`已切换到「${item.name}」${item.colorScheme === "dark" ? "（深色主题）" : ""}`);
  };

  for (const item of THEMES) {
    const selected = selectedId === item.id;
    const swatch = createSwatch(item, isDarkPreview(item));
    swatchNodes.set(item, swatch);
    const button = el("button", {
      class: `theme-card theme-${item.id}${selected ? " on" : ""}`,
      type: "button",
      role: "radio",
      "aria-checked": String(selected),
      tabindex: selected ? "0" : "-1",
    },
      swatch,
      el("span", { class: "theme-card-copy" }, el("b", {}, item.name), el("small", {}, item.note)),
      el("span", { class: "theme-selected-mark", "aria-hidden": "true" }, "✓"),
    );
    button.addEventListener("click", () => selectTheme(item, button));
    themeGrid.append(button);
  }
  paintModeNote();

  themeGrid.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...themeGrid.querySelectorAll(".theme-card")];
    const current = Math.max(0, buttons.indexOf(document.activeElement));
    const step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
    const next = buttons[(current + step + buttons.length) % buttons.length];
    next.focus();
    next.click();
  });

  themeCard.append(modeBox, themeGrid);
  return themeCard;
}

export function createBackgroundCard({ rerender = () => {} } = {}) {
  const settings = S.getState().settings;
  settings.background = normalizeBackground(settings.background || {});
  const bg = settings.background;
  const bgCard = el("div", { class: "card set-card" },
    el("h2", {}, "自定义背景"),
    el("p", { class: "desc" }, "支持图片（PNG / JPG / WebP / GIF / BMP / SVG / AVIF / ICO）/ 纯色、填充方式、九宫格位置、平铺、透明度、模糊、亮度、饱和度、遮罩、卡片与组件透明度、毛玻璃——调低「组件透明度」可让侧栏、顶栏和任务卡透出背景。窄屏会自动关闭 fixed 背景，避免 Android WebView 滚动抖动。"),
  );
  const bgEnabled = el("input", { type: "checkbox", checked: bg.enabled ? true : null });
  const bgImage = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/svg+xml,image/avif,image/x-icon,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.avif,.ico", style: "display:none" });
  const bgColor = el("input", { type: "color", value: bg.baseColor || DEFAULT_BACKGROUND.baseColor });
  const fit = el("select", {},
    el("option", { value: "cover" }, "覆盖（推荐）"), el("option", { value: "contain" }, "完整显示"),
    el("option", { value: "100% 100%" }, "拉伸铺满"), el("option", { value: "auto" }, "原始尺寸")); fit.value = bg.fit;
  const position = el("select", {});
  for (const [v, n] of [["left top","左上"],["center top","上中"],["right top","右上"],["left center","左中"],["center center","居中"],["right center","右中"],["left bottom","左下"],["center bottom","下中"],["right bottom","右下"]]) position.append(el("option", { value:v }, n)); position.value = bg.position;
  const repeat = el("select", {}, el("option", { value:"no-repeat" }, "不平铺"), el("option", { value:"repeat" }, "双向平铺"), el("option", { value:"repeat-x" }, "横向平铺"), el("option", { value:"repeat-y" }, "纵向平铺")); repeat.value = bg.repeat;
  const attachment = el("select", {}, el("option", { value:"fixed" }, "固定背景"), el("option", { value:"scroll" }, "随页面滚动")); attachment.value = bg.attachment;
  const overlayColor = el("input", { type:"color", value:bg.overlayColor || "#000000" });
  const textShadow = el("input", { type:"checkbox", checked:bg.textShadow ? true : null });
  const preview = el("div", { class:"bg-preview" }, el("div", { class:"bg-preview-card" }, el("b", {}, "背景适配预览"), el("div", { class:"desc" }, "卡片透明度与文字可读性会同时预览")));
  const mkRange = (label, key, min, max, suffix="%") => {
    const input = el("input", { type:"range", min:String(min), max:String(max), value:String(bg[key]) });
    const out = el("output", {}, `${bg[key]}${suffix}`);
    input.oninput = () => { out.textContent = `${input.value}${suffix}`; live(); };
    return { key, input, row: el("label", { class:"bg-field" }, el("span", {}, label), el("div", { class:"bg-range-row" }, input, out)) };
  };
  const ranges = [
    mkRange("背景透明度", "opacity", 0, 100), mkRange("背景模糊", "blur", 0, 30, "px"),
    mkRange("背景亮度", "brightness", 40, 180), mkRange("背景饱和度", "saturation", 0, 220),
    mkRange("遮罩强度", "overlayOpacity", 0, 90), mkRange("卡片不透明度", "panelOpacity", 45, 100),
    mkRange("卡片毛玻璃", "panelBlur", 0, 30, "px"),
    mkRange("组件透明度", "componentOpacity", 30, 100),
  ];
  const patchFromControls = () => ({
    enabled:bgEnabled.checked, baseColor:bgColor.value, fit:fit.value, position:position.value, repeat:repeat.value,
    attachment:attachment.value, overlayColor:overlayColor.value, textShadow:textShadow.checked,
    ...Object.fromEntries(ranges.map(r => [r.key, Number(r.input.value)])),
  });
  const paintPreview = () => {
    const x = { ...bg, ...patchFromControls() };
    preview.style.setProperty("--bg-preview-color", x.baseColor);
    preview.style.setProperty("--bg-preview-image", x.image ? `url(${JSON.stringify(x.image)})` : "none");
    preview.style.setProperty("--bg-preview-size", x.fit); preview.style.setProperty("--bg-preview-position", x.position);
    preview.style.setProperty("--bg-preview-repeat", x.repeat); preview.style.setProperty("--bg-preview-opacity", x.opacity / 100);
    preview.style.setProperty("--bg-preview-blur", `${x.blur}px`); preview.style.setProperty("--bg-preview-brightness", `${x.brightness}%`);
    preview.style.setProperty("--bg-preview-saturation", `${x.saturation}%`);
    const h=x.overlayColor.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h,16)||0;
    preview.style.setProperty("--bg-preview-overlay", `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${x.overlayOpacity/100})`);
  };
  const live = () => { Object.assign(bg, patchFromControls()); setBackground(bg, { persist:false }); paintPreview(); };
  for (const c of [bgEnabled,bgColor,fit,position,repeat,attachment,overlayColor,textShadow]) c.oninput = live;
  const persistBg = async () => { Object.assign(bg, patchFromControls()); setBackground(bg); };
  for (const c of [bgEnabled,bgColor,fit,position,repeat,attachment,overlayColor,textShadow,...ranges.map(r=>r.input)]) c.onchange = persistBg;
  bgImage.onchange = () => {
    const file = bgImage.files?.[0]; if (!file) return;
    if (file.size > 6 * 1024 * 1024) { toast("背景图片请控制在 6MB 以内，避免备份文件过大"); bgImage.value=""; return; }
    const rd = new FileReader();
    rd.onload = async () => { bg.image = String(rd.result || ""); bg.enabled = true; bgEnabled.checked = true; setBackground(bg); paintPreview(); toast("背景图片已应用"); };
    rd.readAsDataURL(file);
  };
  const bgGrid = el("div", { class:"bg-grid" },
    el("label", { class:"bg-field" }, el("span", {}, "启用自定义背景"), bgEnabled),
    el("label", { class:"bg-field" }, el("span", {}, "背景底色"), bgColor),
    el("label", { class:"bg-field" }, el("span", {}, "图片填充"), fit),
    el("label", { class:"bg-field" }, el("span", {}, "图片位置"), position),
    el("label", { class:"bg-field" }, el("span", {}, "平铺方式"), repeat),
    el("label", { class:"bg-field" }, el("span", {}, "滚动方式"), attachment),
    el("label", { class:"bg-field" }, el("span", {}, "遮罩颜色"), overlayColor),
    el("label", { class:"bg-field" }, el("span", {}, "增强文字阴影"), textShadow),
    ...ranges.map(r=>r.row),
  );
  bgCard.append(preview,
    el("div", { class:"data-actions" },
      el("button", { class:"btn pri sm", onclick:()=>bgImage.click() }, bg.image ? "更换背景图片" : "选择背景图片"),
      el("button", { class:"btn ghost sm", onclick:async()=>{ bg.image=""; setBackground(bg); paintPreview(); toast("已移除背景图片，保留纯色设置"); } }, "移除图片"),
      el("button", { class:"btn ghost sm", onclick:async()=>{ Object.assign(bg, DEFAULT_BACKGROUND); setBackground(bg); rerender(); toast("背景设置已恢复默认"); } }, "恢复默认"),
    ), bgImage, bgGrid);
  paintPreview();
  return bgCard;
}
