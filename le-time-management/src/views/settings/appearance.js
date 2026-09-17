import * as S from "../../store.js";
import { el, toast } from "../../ui.js";
import { THEMES, getThemeMode, resolveThemeMode, setTheme, setThemeMode } from "../../theme.js";
import { DEFAULT_BACKGROUND, normalizeBackground, setBackground } from "../../background.js";
import {
  DEFAULT_UI_PREFERENCES,
  NAVBAR_SIZE_OPTIONS,
  STARTUP_VIEW_OPTIONS,
  WINDOW_SIZE_OPTIONS,
  getUiPreferences,
  resetUiPreferences,
  setUiPreferences,
} from "../../uiPreferences.js";
import { CUSTOM_SIZE_LIMITS, applyWindowSize, isDesktopRuntime, windowSizeHint } from "../../windowSize.js";
import { NARROW_REFERENCE_WIDTH, UI_SCALE_LIMITS, UI_SCALE_PRESETS, getAutoScaleFactor, normalizeUiScale } from "../../uiScale.js";
import { toggleSwitch } from "../../switchControl.js";

/* 开关行：左侧只有名称，右侧一个滑块开关（说明文字已按要求全部去掉，见 v0.37.19）。 */
function toggleRow(label, checked, onChange) {
  return el("div", { class: "setting-row" },
    el("span", { class: "setting-copy" }, el("b", {}, label)),
    toggleSwitch({ checked, onChange }),
  );
}

export function createInterfaceCard({ rerender = () => {} } = {}) {
  const prefs = getUiPreferences();
  const settings = S.getState().settings;
  const densityBox = el("div", { class: "pref-choice", role: "group", "aria-label": "界面密度" });
  for (const [id, label] of [["comfortable", "舒适"], ["compact", "紧凑"]]) {
    densityBox.append(el("button", {
      class: `pref-choice-btn${prefs.density === id ? " on" : ""}`,
      onclick: () => { setUiPreferences({ density: id }); rerender(); },
    }, label));
  }

  // 手机底栏高度：紧凑 / 标准 / 宽松（只影响 ≤900px 的底部导航栏，桌面端无感）
  const navBarBox = el("div", { class: "pref-choice", role: "group", "aria-label": "底栏高度" });
  for (const [id, label] of NAVBAR_SIZE_OPTIONS) {
    navBarBox.append(el("button", {
      class: `pref-choice-btn${prefs.navBarSize === id ? " on" : ""}`,
      onclick: () => { setUiPreferences({ navBarSize: id }); rerender(); },
    }, label));
  }

  const textScale = el("input", { type: "range", min: "90", max: "120", step: "5", value: String(prefs.textScale) });
  const textScaleOut = el("output", {}, `${prefs.textScale}%`);
  textScale.addEventListener("input", () => {
    textScaleOut.textContent = `${textScale.value}%`;
    setUiPreferences({ textScale: Number(textScale.value) }, { persist: false });
  });
  textScale.addEventListener("change", () => setUiPreferences({ textScale: Number(textScale.value) }));

  /* ── 界面缩放（80%~150%）──
     与上面「文字大小」分工不同：文字大小只改 8 条手写 font-size，控件/间距/图标全不动；
     界面缩放走 documentElement 的 `zoom`，整页等比放大缩小 —— 手机上「整个界面太小」
     才是主要诉求，光放大字解决不了。两个实现坑（fixed 浮层要走 --ui-vw/--ui-vh、
     100vw/100vh 不能用）见 src/uiScale.js 头部注释。

     与「启动窗口大小」的区别也说清：那个是**桌面端调整窗口**，这个是**调整窗口里的内容**，
     手机上后者才是唯一可用的那个。

     ⚠️ 边界（别在文案里许下做不到的承诺）：缩放**不改变布局断点**。
     媒体查询按真实窗口宽度判定，`zoom` 与 `html { font-size }` 都影响不了它
     （实测见 src/uiScale.js）。所以放大到 150% 时桌面窗口不会自动变成手机布局，
     只是内容整体变大、可容纳的列数变少。 */
  const uiScale = el("input", {
    type: "range",
    min: String(UI_SCALE_LIMITS.min),
    max: String(UI_SCALE_LIMITS.max),
    step: String(UI_SCALE_LIMITS.step),
    value: String(prefs.uiScale),
    "aria-label": "界面缩放",
  });
  const uiScaleOut = el("output", {}, `${prefs.uiScale}%`);
  // 拖动时实时预览（persist:false），松手才落盘 —— 与「自定义背景」的滑块同一套路，
  // 避免拖动过程中每 5% 写一次盘。
  uiScale.addEventListener("input", () => {
    uiScaleOut.textContent = `${uiScale.value}%`;
    setUiPreferences({ uiScale: Number(uiScale.value) }, { persist: false });
    paintScalePresets();
  });
  uiScale.addEventListener("change", () => {
    const value = setUiPreferences({ uiScale: Number(uiScale.value) }).uiScale;
    // 越界输入会被 normalize 夹回区间并对齐步进，写回控件让用户看到真实生效值。
    uiScale.value = String(value);
    uiScaleOut.textContent = `${value}%`;
    paintScalePresets();
  });

  const scalePresetBox = el("div", { class: "pref-choice", role: "group", "aria-label": "界面缩放档位" });
  const scalePresetButtons = [];
  const paintScalePresets = () => {
    for (const [button, value] of scalePresetButtons) {
      button.classList.toggle("on", value === Number(uiScale.value));
    }
  };
  for (const [value, label] of UI_SCALE_PRESETS) {
    const button = el("button", {
      class: `pref-choice-btn${prefs.uiScale === value ? " on" : ""}`,
      type: "button",
      // 档位按钮与滑块是同一个值的两个视图，点档位就等于把滑块拖过去。
      onclick: () => {
        uiScale.value = String(value);
        setUiPreferences({ uiScale: value });
        uiScaleOut.textContent = `${value}%`;
        paintScalePresets();
      },
    }, label);
    scalePresetButtons.push([button, value]);
    scalePresetBox.append(button);
  }
  paintScalePresets();

  const uiScaleHint = el("small", { class: "ui-scale-hint" });
  const paintScaleHint = () => {
    const value = Number(uiScale.value);
    const base = value === 100
      ? "当前为标准大小。整页（文字、按钮、间距、图标）会一起缩放；只想放大文字请用上面的「文字大小」。"
      : `整个界面按 ${value}% 显示。手机上界面太小、桌面上想一屏多放些内容都可以用这个。缩小到 80% 可在一屏里看到更多内容；放大后一屏能放的内容变少，必要时窗口需拉大。`;
    // 窄屏自适应（v0.49.0）：本机布局宽度不足 NARROW_REFERENCE_WIDTH 时会再乘一个系数。
    // 不提示的话用户会看到「设了 100% 却比预期小」，所以把实际生效值一并写出来。
    // ⚠️ 这里要用 window.innerWidth（缩放前的布局视口），不是 viewportWidth()
    //    —— 后者已经除以生效系数，读出来恰好是基准宽度，会把提示语说反。
    const auto = getAutoScaleFactor();
    const rawW = typeof window !== "undefined" ? Math.round(window.innerWidth) : 0;
    uiScaleHint.textContent = auto < 1 && rawW > 0
      ? `${base}本机布局宽度只有 ${rawW}px（不足 ${NARROW_REFERENCE_WIDTH}px），已自动等比缩小到 ${Math.round(auto * 100)}%，实际生效 ${Math.round((value / 100) * auto * 100)}% —— 否则顶栏与底栏会占掉过多屏幕。`
      : base;
  };
  paintScaleHint();
  // 拖动与点档位都要刷新提示语，两处都调一次（比在事件里各写一遍稳）。
  uiScale.addEventListener("input", paintScaleHint);
  uiScale.addEventListener("change", paintScaleHint);
  for (const [button] of scalePresetButtons) button.addEventListener("click", paintScaleHint);

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
    el("span", { class: "setting-copy" }, el("b", {}, "启动窗口大小")),
    el("div", { class: "win-size-row" },
      windowMode,
      customSize,
      el("button", { class: "btn ghost sm", type: "button", onclick: applyWindowNow }, "立即应用"),
    ),
    windowHint,
  );
  syncWindowRow();

  // 点关闭按钮的行为：直接退出 / 隐藏到系统托盘。
  // closeBox 先声明、后填 click 逻辑：它的状态在上方托盘开关的 onChange 里也要被改写。
  const closeBox = el("select", {});
  // 存 data.json 的 settings.closeToTray（默认开 = 隐藏到托盘），Rust 关闭事件处理时现读。
  settings.closeToTray ??= true;
  closeBox.append(
    el("option", { value: "exit" }, "直接退出应用"),
    el("option", { value: "tray" }, "隐藏到系统托盘"),
  );
  closeBox.value = settings.closeToTray !== false ? "tray" : "exit";
  closeBox.addEventListener("change", () => {
    settings.closeToTray = closeBox.value === "tray";
    S.saveNow();
    toast(settings.closeToTray
      ? "点关闭按钮将隐藏到系统托盘（右键托盘图标可退出）"
      : "点关闭按钮将直接退出应用");
  });
  const closeRow = el("div", { class: "setting-row" },
    el("span", { class: "setting-copy" }, el("b", {}, "点关闭按钮时")),
    closeBox,
  );

  // 系统托盘开关（放在「点关闭按钮时」之后，两者是「总开关 → 细项」的从属关系）。
  // 关掉后不创建托盘图标（存 data.json 的 settings.trayEnabled，默认开）。
  // 图标创建是**启动时**行为，运行期增删容易留残留 ⇒ 改完提示重启生效。
  settings.trayEnabled ??= true;
  const trayRow = el("div", { class: "setting-row" },
    el("span", { class: "setting-copy" }, el("b", {}, "系统托盘")),
    toggleSwitch({
      checked: settings.trayEnabled !== false,
      ariaLabel: "启用系统托盘",
      onChange: (on) => {
        settings.trayEnabled = on;
        // 关掉托盘时「关闭窗口」的语义必须跟着改：细项若还停在「隐藏到托盘」，
        // 点了关闭应用就直接消失、再也叫不回来（Rust 侧另有同样的一手拦截）。
        if (!on) {
          settings.closeToTray = false;
          closeBox.value = "exit";
        }
        S.saveNow();
        closeRow.style.display = on ? "" : "none";
        toast(on ? "已启用系统托盘（重启应用后出现图标）" : "已关闭系统托盘，点关闭按钮会直接退出（重启后生效）");
      },
    }),
  );
  closeRow.style.display = settings.trayEnabled !== false ? "" : "none";

  const applyPreset = (name, patch) => {
    setUiPreferences(patch);
    toast(`已应用「${name}」界面预设`);
    rerender();
  };

  return el("div", { class: "card set-card" },
    el("h2", {}, "界面与交互"),
    el("div", { class: "pref-presets", "aria-label": "界面预设" },
      el("button", { class: "btn ghost sm", onclick: () => applyPreset("舒适", { ...DEFAULT_UI_PREFERENCES }) }, "舒适预设"),
      el("button", { class: "btn ghost sm", onclick: () => applyPreset("高密度", { density: "compact", textScale: 95, motion: "system", showTopStats: true, showViewSubtitle: false }) }, "高密度"),
      el("button", { class: "btn ghost sm", onclick: () => applyPreset("低干扰", { density: "comfortable", textScale: 100, motion: "reduced", showTopStats: false, showViewSubtitle: false }) }, "低干扰"),
    ),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "界面密度")), densityBox),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "底栏高度")), navBarBox),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "文字大小")), el("span", { class: "pref-range" }, textScale, textScaleOut)),
    el("div", { class: "setting-row setting-col" },
      el("div", { class: "setting-row-head" },
        el("span", { class: "setting-copy" }, el("b", {}, "界面缩放")),
        el("span", { class: "ui-scale-value" }, el("span", { class: "pref-range" }, uiScale, uiScaleOut)),
      ),
      scalePresetBox,
      uiScaleHint,
    ),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "页面动效")), motion),
    toggleRow("显示顶部任务统计", prefs.showTopStats, (value) => setUiPreferences({ showTopStats: value })),
    toggleRow("顶部任务统计居中", prefs.centerTopStats, (value) => setUiPreferences({ centerTopStats: value })),
    toggleRow("显示页面副标题", prefs.showViewSubtitle, (value) => setUiPreferences({ showViewSubtitle: value })),
    toggleRow("触摸左右滑动翻页", prefs.swipeNavigation, (value) => setUiPreferences({ swipeNavigation: value })),
    el("div", { class: "setting-row" }, el("span", { class: "setting-copy" }, el("b", {}, "启动后进入")), startup),
    desktopWindow ? windowRow : null,
    desktopWindow ? trayRow : null,
    desktopWindow ? closeRow : null,
    el("div", { class: "data-actions pref-reset" },
      el("button", { class: "btn ghost sm", onclick: () => {
        resetUiPreferences();
        // 界面缩放能到 150%，恢复默认后不重建整页的话，滑块与档位按钮还停在旧值上
        // （而界面已经跳回 100%），看起来像「点了没反应」—— 所以这里必须重渲染。
        toast("界面与交互设置已恢复默认");
        rerender();
      } }, "恢复界面默认"),
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
  );
  const modeNote = el("p", { class: "desc theme-mode-note" });
  const modeBox = el("div", { class: "theme-mode", role: "radiogroup", "aria-label": "显示模式" });
  for (const [id, label] of [
    ["system", "跟随系统"],
    ["light", "浅色模式"],
    ["dark", "深色模式"],
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
    }, el("b", {}, label)));
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
    // 只报「现在实际生效的是哪套配色」这一个状态，不再附带主题数量之类的说明（v0.37.19）。
    modeNote.textContent = `当前生效：${resolved === "dark" ? "深色配色" : "浅色配色"}` +
      (system ? `（跟随系统，检测到系统为${resolved === "dark" ? "深色" : "浅色"}）` : "");
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
      el("span", { class: "theme-card-copy" }, el("b", {}, item.name)),
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
  );
  const bgEnabled = toggleSwitch({ checked: bg.enabled });
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
  const textShadow = toggleSwitch({ checked: bg.textShadow });
  const preview = el("div", { class:"bg-preview" }, el("div", { class:"bg-preview-card" }, el("b", {}, "背景适配预览")));
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
