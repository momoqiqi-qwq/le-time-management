#!/usr/bin/env node
// 生成 docs/architecture/*.svg —— 纯文档资产，不进产品 bundle，不需要升版本号。
// 用法：node tools/gen-architecture-diagrams.js

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(import.meta.dirname, "../docs/architecture");
mkdirSync(OUT, { recursive: true });

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei','PingFang SC','Hiragino Sans GB',sans-serif`;

const C = {
  present: { s: "#2563eb", f: "#eff6ff" },
  cross:   { s: "#0d9488", f: "#f0fdfa" },
  flow:    { s: "#7c3aed", f: "#f5f3ff" },
  state:   { s: "#059669", f: "#ecfdf5" },
  ext:     { s: "#d97706", f: "#fffbeb" },
  ipc:     { s: "#0891b2", f: "#ecfeff" },
  native:  { s: "#dc2626", f: "#fef2f2" },
  plat:    { s: "#64748b", f: "#f8fafc" },
  tool:    { s: "#475569", f: "#f1f5f9" },
  mini:    { s: "#16a34a", f: "#f0fdf4" },
  warn:    { s: "#b45309", f: "#fffbeb" },
};

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const overflow = [];
const isWide = (ch) => ch.codePointAt(0) > 0x2e7f;
const textW = (t, fs) => [...String(t)].reduce((w, ch) => w + (isWide(ch) ? fs : fs * 0.55), 0);

function checkBounds(w, h, body) {
  let maxX = 0, maxY = 0;
  for (const m of body.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    const x = +m[1], y = +m[2], rw = +m[3], rh = +m[4];
    if (rw === w && rh === h) continue;
    maxX = Math.max(maxX, x + rw); maxY = Math.max(maxY, y + rh);
  }
  for (const m of body.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    maxX = Math.max(maxX, +m[1], +m[3]); maxY = Math.max(maxY, +m[2], +m[4]);
  }
  for (const m of body.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"(?:[^>]*)font-size="([\d.]+)"([^>]*)>([^<]*)</g)) {
    const x = +m[1], y = +m[2], fs = +m[3];
    const tw = textW(m[5].replace(/&[a-z]+;/g, "x"), fs);
    maxX = Math.max(maxX, m[4].includes('text-anchor="middle"') ? x + tw / 2 : x + tw);
    maxY = Math.max(maxY, y + fs * 0.3);
  }
  if (maxX > w - 4) overflow.push(`画布: 横向超出 maxX=${maxX.toFixed(0)} > ${w}`);
  if (maxY > h - 2) overflow.push(`画布: 纵向超出 maxY=${maxY.toFixed(0)} > ${h}`);
  // 属性值里的双引号会让整张 SVG 不是合法 XML（FONT 是唯一注入到属性里的字符串）
  if (/["'<>]/.test(FONT.replace(/'/g, ""))) overflow.push("FONT 含双引号或尖括号，会破坏 svg 根标签属性");
}

function svgDoc(w, h, body) {
  checkBounds(w, h, body);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">
<defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#334155"/></marker>
<marker id="ahl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#94a3b8"/></marker>
<marker id="ahb" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2563eb"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="#ffffff"/>
${body}
</svg>`;
}

function title(txt, sub, w) {
  return `<text x="36" y="46" font-size="26" font-weight="700" fill="#0f172a">${esc(txt)}</text>
<text x="36" y="74" font-size="15" fill="#475569">${esc(sub)}</text>
<line x1="36" y1="92" x2="${w - 36}" y2="92" stroke="#cbd5e1"/>`;
}

// ── 通用盒子：左侧色条 + 粗体首行 + 若干说明行 ────────────────────────────
function box(x, y, w, h, kind, lines, opts = {}) {
  const c = C[kind] || C.plat;
  const fs = opts.fs || 13.5;
  const lh = opts.lh || 20;
  const pad = opts.pad ?? 12;
  const badge = opts.badge ? String(opts.badge) : "";
  const badgeW = badge ? Math.ceil(textW(badge, 12)) + 16 : 0;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${c.f}" stroke="${c.s}" stroke-width="${opts.sw || 1.4}"${opts.dash ? ` stroke-dasharray="6 4"` : ""}/>`;
  s += `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3" fill="${c.s}"/>`;
  if (badge) {
    s += `<rect x="${x + w - badgeW - 10}" y="${y + 9}" width="${badgeW}" height="21" rx="10.5" fill="${c.s}" fill-opacity=".14" stroke="${c.s}" stroke-opacity=".5"/>`;
    s += `<text x="${x + w - badgeW - 10 + badgeW / 2}" y="${y + 24}" font-size="12" font-weight="700" fill="${c.s}" text-anchor="middle">${esc(badge)}</text>`;
  }
  lines.forEach((ln, i) => {
    const bold = i === 0 && !opts.noBoldFirst;
    const fill = i === 0 ? "#0f172a" : (ln.startsWith("!") ? "#b91c1c" : "#334155");
    const text = ln.startsWith("!") ? ln.slice(1) : ln;
    const size = bold ? fs + 1.5 : fs;
    const avail = w - pad - 8 - (bold ? badgeW + 12 : 0);
    const need = textW(text, size);
    if (need > avail) overflow.push(`[${String(opts.tag || lines[0]).slice(0, 26)}] L${i}: need=${Math.round(need)} avail=${Math.round(avail)} :: ${text.slice(0, 46)}`);
    s += `<text x="${x + pad}" y="${y + pad + 12 + i * lh}" font-size="${size}" font-weight="${bold ? 700 : 400}" fill="${fill}">${esc(text)}</text>`;
  });
  return s;
}

const boxH = (n, lh = 20, pad = 12) => pad + 12 + (n - 1) * lh + pad - 2;

function arrow(x1, y1, x2, y2, label, opts = {}) {
  const col = opts.color || "#334155";
  const mk = opts.color ? "url(#ahb)" : "url(#ah)";
  let s = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2 - (opts.noHead ? 0 : 1)}" stroke="${col}" stroke-width="${opts.w || 1.8}"${opts.dash ? ' stroke-dasharray="5 4"' : ""} marker-end="${mk}"/>`;
  if (label) {
    const lx = opts.lx ?? (x1 + x2) / 2 + (opts.dx || 0);
    const ly = opts.ly ?? (y1 + y2) / 2 + (opts.dy || -8);
    s += `<text x="${lx}" y="${ly}" font-size="12.5" fill="${opts.lc || "#0f172a"}" text-anchor="${opts.anchor || "middle"}" font-weight="${opts.lw || 600}">${esc(label)}</text>`;
  }
  return s;
}

// ── 链路图：主列自上而下，侧注框在右 ─────────────────────────────────────
function chain(file, hdr, sub, steps, opts = {}) {
  const W = 1160, MX = 40, MW = opts.mainW || 700, SX = MX + MW + 44, SW = W - SX - 36;
  let y = 116, body = title(hdr, sub, W);
  for (const st of steps) {
    const lines = Array.isArray(st.t) ? st.t : [st.t];
    const h = boxH(lines.length);
    if (st.arrow !== false && y > 116) {
      body += arrow(MX + MW / 2, y - 30, MX + MW / 2, y, st.arrow, { lw: 600, dy: -6, w: 2 });
    }
    body += box(MX, y, MW, h, st.k, lines, { fs: st.fs, badge: st.layer, tag: `${file} ${st.layer}` });
    const sides = st.side ? (Array.isArray(st.side[0]) ? st.side : [st.side]) : [];
    let sy = y;
    for (const sd of sides) {
      const slines = Array.isArray(sd) ? sd : [sd];
      const sh = boxH(slines.length, 18, 10);
      body += `<line x1="${MX + MW}" y1="${y + 18}" x2="${SX}" y2="${sy + 18}" stroke="#94a3b8" stroke-width="1.3" stroke-dasharray="4 4" marker-end="url(#ahl)"/>`;
      body += box(SX, sy, SW, sh, "warn", slines, { fs: 12, lh: 18, pad: 10, tag: `${file} 侧注` });
      sy += sh + 14;
    }
    y += h + (st.gap || 30);
  }
  const out = svgDoc(W, y + 10, body);
  writeFileSync(`${OUT}/${file}`, out);
  return `${file} (${W}x${y + 10})`;
}

// ── 分层盒子：一行若干芯片 ───────────────────────────────────────────────
function chips(x, y, w, items, kind) {
  let cx = x + 14, cy = y, s = "", rowH = 30;
  for (const it of items) {
    const wid = Math.ceil(textW(it, 12.5)) + 18;
    if (cx + wid > x + w - 10) { cx = x + 14; cy += rowH + 8; s += ""; }
    s += `<rect x="${cx}" y="${cy}" width="${wid}" height="26" rx="6" fill="#ffffff" stroke="${(C[kind] || C.plat).s}" stroke-opacity=".55"/>`;
    s += `<text x="${cx + 9}" y="${cy + 17.5}" font-size="12.5" fill="#1e293b">${esc(it)}</text>`;
    cx += wid + 8;
  }
  return { svg: s, bottom: cy + rowH };
}

// ══════════════════════════════ 00 分层总图 ══════════════════════════════
function layersDiagram() {
  const W = 1500, LX = 30, LW = 150, CX = 196, CR = 1180, RX = 1212, RW = 258;
  const layers = [
    { k: "present", n: "① 界面 / 呈现层", d: "外壳、路由、视图、抽屉、命令面板（视图清单按平台裁剪）", c: ["shell.js 1572行", "renderShell() :156", "switchTo() :1084", "backNav.js", "quadrant.js「任务表」", "timeblock.js 时间块·桌面", "timeViews.js", "timeline.js 时间线·APK", "inbox.js 收件箱·桌面", "drawer.js", "settings.js + settings/*", "aboutCard.js", "commandPalette.js", "coreViewIds() 按平台裁视图"] },
    { k: "cross", n: "② 外观 / 交互横切层", d: "只写 CSS 变量与 DOM 原语，不碰业务数据", c: ["ui.js el()/toast()/pointerDrag()", "theme.js + themeProfiles.js", "theme-derived.css（生成）", "uiScale.js zoom + --ui-vw", "uiPreferences.js data-ui-*", "railWidth.js --rail-w", "motion.js", "icons.js", "switchControl.js", "windowSize.js", "mobileViewport.js", "pinyinInitial.js（生成）"] },
    { k: "flow", n: "③ 功能编排层（用例）", d: "把「一个功能」串起来的无状态逻辑", c: ["capture.js 拖/粘贴入口", "timeParser.js 中文时间", "aiIngest.js AI 兜底", "aiAutomation.js 定时 NL 规则", "scheduleConflict.js 避让", "automation.js", "taskReminder.js", "syncLayer.js WebDAV", "dataCenter.js 备份/ICS/xlsx", "webContent.js 网页抽取", "nativeSchedule.js 原生课表", "globalShortcuts.js", "updateChecker.js"] },
    { k: "state", n: "④ 状态 / 数据层", d: "唯一的可变状态中枢 + 版本迁移", c: ["store.js S（20 个模块 import）", "normalizeState() :49", "migrations.js migrateState()", "blocksOf 缓存 :190", "changed() :99", "scheduleSave 350ms :91", "queueSave 串行 :87"] },
    { k: "ext", n: "⑤ 扩展 / 插件层", d: "tide 契约 + 权限位；插件=填文件夹", c: ["pluginHost.js makeApi() :112", "requirePermission() :44", "new Function(\"tide\", code)", "pluginCatalog.js（生成）", "pluginShortcuts.js", "pluginAppearance.js", "public/plugins/ ×15", "views/settings/plugins.js"] },
    { k: "ipc", n: "⑥ IPC 门面层", d: "一个 api 对象包住所有跨语言调用 + 浏览器兜底", c: ["api.js isTauri :4", "invoke() :6", "35 个 command 名", "localStorage 兜底 :18", "DEV /__cppu 桥 :11"] },
    { k: "native", n: "⑦ Rust 原生能力层", d: "src-tauri/src —— 文件系统 / 网络 / 系统集成", c: ["lib.rs + 各模块共 35 个 #[tauri::command]", "load_data / save_data :721/734", "list_plugins :753", "http_session_* cookie 会话", "des_ecb_encrypt_hex :1263", "plugin_vault_* AES-256-GCM", "ai_chat :609", "lan.rs tiny_http 遥控", "update.rs 自更新", "system_bar.rs Android", "native_schedule.rs"] },
    { k: "plat", n: "⑧ 容器 / 构建层", d: "一套代码三端产物", c: ["Tauri 2：WebView2 / WKWebView / Android WebView", "tray-icon · opener · single-instance · global-shortcut", "Vite 6 bundle → dist/ 编进二进制", "MainActivity.kt edge-to-edge + WindowInsets 注入", "build-windows.sh / scripts/build-android-apk.sh"] },
  ];
  let y = 108, body = title(
    "Le时间管理 · 软件层次总图",
    "依赖方向严格向下：上层可调下层，下层绝不 import 上层。v0.58.2 · 前端 12.7k 行 JS / Rust 2.9k 行 / 15 个内置插件",
    W
  );
  // 层名 + 说明两行文字占掉的高度：pad14 + 基线12 + 行距22 + 下沉留白14
  const HEAD = 62;
  if (HEAD < 14 + 12 + 22 + 6) overflow.push("00: HEAD 小于两行文字高度，芯片会压住说明文字");
  for (const L of layers) {
    const ch = chips(CX, y + HEAD, CR - CX, L.c, L.k);
    const h = HEAD + (ch.bottom - y - HEAD) + 14;
    body += box(CX - 10, y, CR - CX + 20, h, L.k, [L.n, L.d], { fs: 15, lh: 22, pad: 14, tag: `00 ${L.n}` });
    body += ch.svg;
    if (y > 108) body += arrow((CX + CR) / 2, y - 18, (CX + CR) / 2, y - 2, "", { w: 2 });
    y += h + 22;
  }
  const totalBottom = y - 2;
  body += `<text x="${LX + 8}" y="130" font-size="13" fill="#2563eb" font-weight="700">调用方向 ↓</text>`;
  body += arrow(LX + 26, 142, LX + 26, totalBottom - 20, "", { color: "#2563eb", w: 2.4 });
  body += `<text x="${LX + 8}" y="${totalBottom + 4}" font-size="13" fill="#2563eb" font-weight="700">数据回流 ↑</text>`;
  body += arrow(LX + 60, totalBottom - 18, LX + 60, 142, "", { color: "#2563eb", w: 2.4 });
  body += `<text x="${LX + 78}" y="${(totalBottom + 142) / 2}" font-size="12.5" fill="#2563eb" transform="rotate(-90 ${LX + 78} ${(totalBottom + 142) / 2})">changed() → tide:state-changed → 视图 _refresh()</text>`;

  // 右侧横切栏
  body += box(RX, 108, RW, totalBottom - 108, "tool", [
    "横切：代码生成层",
    "改了事实源必须重跑生成器",
    "",
    "sync-version.js → 三端版本",
    "sync-plugins.js → 插件目录",
    "build-schedule-plugin.js",
    "build-exam-calendar-plugin.js",
    "gen-theme-dark.js",
    "gen-plugin-icons.py",
    "sync-android-native.js",
    "gen-pinyin-initial.js",
    "",
    "横切：质量保障层",
    "npm test → 52 个脚本",
    "  · 版本一致性 / 主题对比度",
    "  · 插件权限、生成物 --check",
    "  · 安全区回归断言",
  ], { fs: 13, lh: 20, pad: 14, tag: "00 右侧横切栏" });

  // 底部：小程序同源栈
  y = totalBottom + 40;
  const miniChips = ["tools/test-miniprogram-core.js 260 断言", "tools/check-miniprogram.js 静态校验", "gen-miniprogram-tab-icons.js", "core/appMeta.js 版本由 sync-version.js 写", "备份 JSON 与桌面双向可恢复"];
  const miniLines = [
    "⑨ 微信小程序（同源平行栈，不依赖 Tauri、无 npm 构建）",
    "pages/ 8 页 + 4 tabBar（原生 WXML / WXSS）｜ core/store.js 与桌面同 schema，wx.setStorage 承载",
    "core/timeParser.js 逐行移植（只去掉 lookbehind）｜ core/captureFlow.js 把捕获拆成纯函数",
    "core/pluginRuntime.js = 插件的纯函数平行重写，无 tide、无动态求值｜ core/pluginNet.js 手搓 cookie jar",
    "只有 manifest.platforms.miniprogram === 'native' 的插件才有小程序界面",
  ];
  const mh = boxH(miniLines.length, 22, 14) + 40;
  const mc = chips(CX, y + boxH(miniLines.length, 22, 14) + 6, CR - CX, miniChips, "mini");
  body += box(CX - 10, y, CR - CX + 20, mh, "mini", miniLines, { fs: 14, lh: 22, pad: 14, tag: "00 mini" });
  body += mc.svg;
  body += `<text x="${CX + 10}" y="${y - 10}" font-size="12.5" fill="#16a34a" font-weight="700">与桌面端的关系：备份 JSON 双向可恢复（同 version / tasks / blocks / settings / plugins / inbox 结构）</text>`;

  body += `<text x="36" y="${mc.bottom + 40}" font-size="13" fill="#475569">读图顺序：先看左侧 ①→⑧ 的纵向调用链，再看右侧两组横切层，最后看底部 ⑨ 小程序平行栈 —— 它与桌面共用工具链与数据格式，但运行时互不相干。</text>`;
  const H = mc.bottom + 62;
  writeFileSync(`${OUT}/00-layers.svg`, svgDoc(W, H, body));
  return `00-layers.svg (1500x${H})`;
}

// ══════════════════════════════ 功能链路图 ══════════════════════════════

const f01 = () => chain("01-quadrant.svg", "功能链路 ① 任务表（内部 id 仍是 quadrant）：从点一张卡片到落盘",
  "读路径 store → view，写路径 view → store → 广播 + 防抖落盘；没有虚拟列表，重渲染靠订阅",
  [
    { layer: "① 呈现", k: "present", t: ["renderQuadrant()  views/quadrant.js:336", "顶栏文案「任务表 · 先决定，再动手」= shell.js:46 的 VIEWS 条目", "（v0.58.0 由「四象限」更名，代码里的 quadrant / quad 是内部标识符）", "四格定义来自 QUADS（ui.js:157），面积按权重变形；每格 taskCard()（:12）"] },
    { layer: "④ 状态（读）", k: "state", t: ["S.tasksOfQuad(q)  store.js:222", "排序三层：done 沉底 → 显式 order（v0.52.0 拖拽）→ due 兜底", "blocks 按日期分桶缓存 blocksOf() :190，失效函数 :63"], arrow: "订阅数据" },
    { layer: "② 交互原语", k: "cross", t: ["指针拖拽：pointerDrag()  ui.js:113 → quadrant.js:77-263", "鼠标 / 触摸同一套 pointer 事件；松手时算目标格 + 落点 index"], arrow: "用户在格间拖卡片 / 勾选完成" },
    { layer: "④ 状态（写）", k: "state", t: ["S.moveTaskRelative / toggleTask / addTask / deleteTaskUndoable", "deleteTaskUndoable 先存快照，toast 里给「撤销」"], arrow: "一次 mutation" },
    { layer: "④ 状态（广播 + 排队）", k: "state", t: ["changed()  store.js:99  做两件事：", "① emitChanged() :95 → window 事件 tide:state-changed + subs 回调", "② scheduleSave() :91 → 350ms 防抖 → queueSave() :87 串行 promise 链"], arrow: "同一个函数既通知 UI 又排写入队", side: ["侧注：抽屉是第二条入口", "openTaskDrawer() views/drawer.js:10", "每个字段 → S.updateTask() → 局部 refresh() :234", "只改自己那一片 DOM，不整屏重建"] },
    { layer: "① 重渲染", k: "present", t: ["quadrant.js:365-369  每个格子把自己 subscribe 的 _refresh 注册进去", "shell.js:1393  S.subscribe(renderStat)  只刷顶栏统计"], arrow: "订阅者各自刷自己那块" },
    { layer: "⑥→⑦ 落盘", k: "ipc", t: ["api.saveData → invoke(\"save_data\") → lib.rs:734", "tmp 文件 + fs::rename 原子替换；详见链路 ⑤"], arrow: "350ms 后" },
  ]);

const f02 = () => chain("02-timeblock.svg", "功能链路 ② 时间块规划轴：把任务拖进 24 小时格子",
  "吸附 → 试算冲突 → 自动避让 → 落库；7 种时间视图共用同一份 blocks",
  [
    { layer: "① 呈现", k: "present", t: ["renderTimeblock()  views/timeblock.js:22", "左任务池 S.poolOf()（store.js:213）+ 中 24h 画布 + 右统计侧栏", "curDate / viewMode 读自 settings（:23-25）"] },
    { layer: "② 交互", k: "cross", t: ["pointer/touch 拖拽 → 落点分钟数换算，15 分钟吸附", "mmOf / hhmmOf 由 timeParser 侧提供，桌面/小程序同规则"], arrow: "拖卡片到时间轴" },
    { layer: "③ 编排（冲突试算）", k: "flow", t: ["previewSchedule()  src/scheduleConflict.js:64  —— 先试算不落库", "冲突则 findAlternatives() :33：以 15 分钟步进前向优先找空档", "拿不到空档 → toast 提示，不悄悄覆盖"], arrow: "S.placeTask() store.js:167", side: ["侧注：捕获路径复用同一函数", "placeCapturedBlock() capture.js:132-139", "自动挪到 alternatives[0] 并 toast 告知"] },
    { layer: "④ 状态", k: "state", t: ["addBlock / updateBlock / removeBlock（字段定义 store.js:197）", "changed() → 广播 + 350ms 防抖串行落盘（同链路①）"] },
    { layer: "① 多形态视图", k: "present", t: ["createTimeViewSwitcher()  views/timeViews.js:44", "VIEW_META :4-12 驱动 7 种非日视图（周 / 月 / 节奏 …），本模块只读", "自己不 subscribe —— 由父级 syncView() :317 统一重绘"], arrow: "同一份 blocks 换投影", side: ["侧注：为什么 timeViews 不订阅", "避免父子各刷一次造成闪动；", "父视图是唯一的刷新入口"] },
    { layer: "① 时间线（APK）", k: "present", t: ["collectTimelineEvents()  views/timeline.js:32", "→ buildTimelineModel() :58 交错成卡片流；S.subscribe(render) :216", "!时间线是 APK 专属核心视图，桌面【不出这个入口】", "桌面 = 任务表/时间块/收件箱/插件；APK = 任务表/时间线/插件", "（MOBILE / DESKTOP_CORE_VIEWS，uiPreferences.js:10-11）"], arrow: "窄屏替代方案", side: ["侧注：为什么 APK 换成时间线", "24 小时画布在窄屏放不下，", "收件箱条目也挤不进底栏，", "于是两者都用「按日期串起来」替代"] },
  ]);

const f03 = () => chain("03-capture.svg", "功能链路 ③ 中文时间捕获（招牌功能）：一段聊天文字 → 一个时间块",
  "规则解析器优先，AI 只在规则没命中时兜底；AI 永不直接写库",
  [
    { layer: "③ 入口注册", k: "flow", t: ["initCapture()  src/capture.js:15-22，main.js:46 在 boot 里挂上", "document 级 dragenter / dragover / dragleave / drop / paste 五个监听", "另有 tide:quick-capture 事件（:21）由 globalShortcuts.js:59 / 命令面板触发"] },
    { layer: "③ 载荷分类", k: "flow", t: ["wants() :63 只看 dataTransfer.types，不读内容", "onDrop :84 优先级 Files → text/plain → uri-list → HTML 去标签（:94）", "onPaste :100 在输入框内直接放过；image/* 剪贴板项直送 AI"], arrow: "确定这是什么东西", side: ["⚠ 两个常见误解", "· 拖进来的 URL 不会被抓取，只当纯文本解析", "· 本地没有 OCR（capture.js:266 明说），根目录", "eng.traineddata 是孤儿文件；webContent.js 是给", "插件用的抽取器，不在这条链路上"] },
    { layer: "③ 语义解析（核心）", k: "flow", t: [
      "parseWhen()  src/timeParser.js:4-138 —— 单趟正则表，不是文法",
      "① 全角→半角 :6   ② 语义改写「今晚」→「今天+晚上」:10-13",
      "③ eaten[] 记账 :15-18：命中的片段从标题里删掉，避免重复",
      "④ 日期 7 条候选正则按严格优先级 rel > ymd > md > weekday >",
      "   nextMonthDay > monthEnd > dayOnly（:29-69）",
      "⑤ 时间一条全局正则收齐所有命中 :72，时段词→24h 映射 :84-89",
      "⑥「到 | 至 | ~ | —」后的第二个时间作为结束 :96-109，",
      "   并向下继承时段 —— 所以「下午3点到4点」= 15:00-16:00",
      "⑦ 标题清洗 :121-135",
    ] },
    { layer: "③ 返回值 & 派生", k: "flow", t: ["parseWhen 只返回 { date, startMin, endMin, title } :137", "时长在 capture.js:149 推、分类 guessCategory :148、quad 归类 guessQuad :158", "!相对日期是纯算术，节假日不在这层（属于 cn-holiday 插件）"], arrow: "得到结构化事件" },
    { layer: "③ 分流：规则 or AI", k: "flow", t: ["handleTextSmart() :214-218 —— 规则命中就直接提交", "只有 parseWhen 找不到日期，才 tryAiIngest() :190 走 AI", "成本纪律写在 :207-213 的注释里；AI 失败返回 false → 落回规则/手工弹窗"] },
    { layer: "⑥→⑦ AI 通道", k: "ipc", t: ["aiIngest.aiAnalyzeContent :241 → api.aiChat（api.js:224）→ lib.rs:609", "OpenAI 兼容 POST {base_url}/chat/completions（lib.rs:386）", "key/baseUrl/model 存 Rust AES-256-GCM vault（:396-462），不进 data.json", "上限：24 条消息 / 60k 字符 / N 张图（:619-632）"] },
    { layer: "③ 白名单夹紧", k: "flow", t: ["normalizeIngestEvent()  aiIngest.js:154-182 逐字段钳制", "cleanIngestDate :54 拒绝 2026-02-31 这类假日期", "!AI 输出永不直接写库，一律回落到 app API（applyIngestEvents :316）"], arrow: "不可信输出 → 可信结构" },
    { layer: "① 预览面板", k: "present", t: ["views/ingestPanel.js:67  —— 只有 AI 路径有这一步", "逐行可改：勾选 :19、kind（task|timeblock|inbox|course）:20、标题、日期、开始", "结束/时长/置信度是只读徽标 :31-38；提交时再归一化一次 :107-113", "冲突项降级进收件箱（:370-379），结果报告带「撤销」:132-146"] },
    { layer: "④ 提交", k: "state", t: ["handleText()  capture.js:142-179：永远先建任务再排时间块", "S.addTask :146 → placeCapturedBlock :132（试算 + 自动避让）→ changed()", "确定性文本只 toast 静默提交，不弹预览"], arrow: "落库 + 刷视图" },
  ]);

const f04 = () => chain("04-plugin.svg", "功能链路 ④ 插件系统：一个文件夹怎么变成左侧导航里的一项",
  "沙箱只是「名字上的」隔离，真正的边界是 tide API + 权限位 + 缺权限直接 throw",
  [
    { layer: "③ 启动", k: "flow", t: ["initPluginHost()  src/pluginHost.js:358-393", "main.js:79 —— 故意排在最后且【不 await】，插件慢不阻塞首屏"] },
    { layer: "⑦ 发现", k: "native", t: ["内置：构建期常量 BUILTIN_IDS（src/pluginCatalog.js，由工具生成）", "外部：api.listPlugins() → lib.rs:753 扫 data_dir/plugins/*/manifest.json", "读码走 read_plugin_file :775，canonicalize 之后挡住 .. 越权 :783"], arrow: "两条来源合并" },
    { layer: "⑤ 元数据", k: "ext", t: ["loadManifest() :79：内置读 builtinManifestMap :20，外部读盘", "S.pluginState(id)（store.js:256）懒建 { enabled, storage }", "manifest 字段权威集 = tools/sync-plugins.js:34 compactManifest()：", "id / name / version / author / icon / faIcon / description /", "permissions[] / entry / order / platforms.{windows,android,miniprogram}"] },
    { layer: "⑤ 取码", k: "ext", t: ["loadCode() :90  fetch(\"/plugins/<id>/<entry>?v=<version>\", no-cache)", "!版本号进 query 是刻意的破缓存手段（:97-99）", "codeCache 键 = source:id:version:entry"], arrow: "拿到一段 JS 源码字符串" },
    { layer: "⑤ 求值", k: "ext", t: ["new Function(\"tide\", code)(makeApi(man, source))  :379-391", "每个插件之间 yieldUi() :67 让出主线程，避免长任务卡住渲染", "先 removeRegistrations() :332 再跑，保证幂等（重复加载不叠加）", "!首行还会前置 'use strict'，但 new Function 不屏蔽 document/window", "!所以「沙箱」只在于约定不调，不是真隔离 —— 边界靠权限位"], arrow: "插件开始调用 tide.*" },
    { layer: "⑤ 契约 / 权限", k: "ext", t: [
      "makeApi() :112-301 给出全部能力；每个方法第一行 requirePermission() :44",
      "!缺权限是 throw，不是静默降级 —— 插件作者立刻看到",
      "12 个权限位 :23-36  ui tasks blocks storage notify events http",
      "                   openUrl timeParse vault schoolImport sound",
      "分类：身份(id/manifest/app.links/plugins.list)｜UI(registerView,",
      "  registerTaskAction/navigate/notify/sound)｜数据(tasks/blocks/",
      "  inbox/storage)｜资产(assets.text/json/saveText，路径钳制 :205)",
      "｜事件(events.on/emit)｜网络(http.get/session/fetch/exportCookies,",
      "  desEncryptHex)｜网页解析(util.web.* 13 个)｜时间(util.*)",
      "｜凭据(vault → Rust AES)｜教务导入(schoolImporter)",
    ] },
    { layer: "① 注册视图", k: "present", t: ["tide.ui.registerView({id,title,icon,render,immersive}) :180", "shell.js:90 viewDef() 按 settings.pluginOrder 排序 :105", "落在导航「插 件 视 图」分组（shell.js:648-651），键名 plug:<viewId>"], arrow: "emitNavChanged() :392" },
    { layer: "① 挂载 / 卸载", k: "present", t: ["switchTo → commit()  shell.js:1100（插件段 :1122-1136）", "· immersive 时 .appFrame 加 rail-hidden", "· append .plugview 容器，cleanup = render(box, { refresh })", "· cleanup + 停动效观察器 一起包成 view._unsub，切走时回收", "!render 抛错被 try/catch 接住，就地显示「插件视图出错」:1137", "→ 一个坏插件不会把整个壳打挂"] },
    { layer: "④ 插件写回核心数据", k: "state", t: ["chaoxing-notify/main.js:554 toReminder() 实例：", "util.parseWhen → tide.tasks.create(...) :559", "宿主在 pluginHost.js:147【强制覆写 sourcePlugin】，插件伪造无效", "→ store.addTask :121（uid+unshift+changed()）→ 任务表当场出现", "→ tide.blocks.create({taskId}) :562 → notify({action: navigate('timeblock')})", "!createSmart（:165）会先 previewSchedule 再自动挪位"], arrow: "tide.tasks / tide.blocks" },
    { layer: "⑤ 启停 / 重扫", k: "ext", t: ["setEnabled() :395 → runPlugin 或 removeRegistrations", "（后者清掉视图 / 任务动作 / 事件订阅）", "rescan() :421：清两张注册表 + 重新 initPluginHost()", "UI 在 views/settings/plugins.js:285 开关 / :341 重扫 / :106 导入 zip", "removeExternalPlugin :409 拒删内置；错误落在 rec.error 并 :330 显示"] },
    { layer: "工具链", k: "tool", t: ["!两个 main.js 是生成物：shiguang-schedule（model.js+ui.js+adapter）", "、exam-calendar（template+exam-data.json 内嵌 80 条）—— 直接改白改", "sync-plugins.js 还生成 miniprogram/core/pluginCatalog.js、pluginData/*.js"] },
  ]);

const f05 = () => chain("05-storage.svg", "功能链路 ⑤ 本地存储：一次改动到磁盘的完整旅程",
  "单 JSON 文件、防抖合并、串行写入、原子替换、退出握手",
  [
    { layer: "④ 写入口", k: "state", t: ["所有 mutation 收口于 changed()  store.js:99", "批量场景用 batchChanges() :108-119 合并成一次通知 + 一次写", "只写不刷 UI 的旁路：persistSoon() :105 / touch() :106"] },
    { layer: "④ 合并", k: "state", t: ["scheduleSave() :91 —— 350ms 防抖，连改 20 次只落一次盘", "queueSave() :87 —— saveChain promise 链，写入严格串行"] },
    { layer: "⑥ 跨语言", k: "ipc", t: ["api.saveData → invoke(\"save_data\")  api.js:6", "isTauri=false 时退到 localStorage（键见右下角）"] },
    { layer: "⑦ 原子替换", k: "native", t: ["lib.rs:734  fs::write(\"data.json.tmp\") → fs::rename 覆盖 :737-741", "!全仓库没有任何 sync_all / fsync —— 断电时 OS 缓存里的 rename", "!顺序不保证，只保证「不会看到半截 JSON」", "同样的 tmp+rename 用在 ai-vault（:424）与 plugin-vault.bin（:492）"] },
    { layer: "⑦ 路径解析", k: "native", t: ["data_dir() lib.rs:16 = app.path().app_data_dir()", "Windows  %APPDATA%\\com.yile.letime\\data.json", "Linux    ~/.local/share/com.yile.letime/data.json", "Android  应用内部 files 目录", "插件目录 data_dir/plugins/（:25）；下载走 save_download :976"] },
    { layer: "④ 读回与迁移", k: "state", t: ["initStore() store.js:75 → load_data → migrateState() 才 normalize", "migrations.js:14-27 逐级升 dataSchemaVersion", "!遇到比 App 更新的数据版本直接抛错，不做猜解析", "导入整包用 replaceAll() :270（内部同样先迁移）"], arrow: "冷启动" },
    { layer: "⑦ 退出握手", k: "native", t: ["托盘「退出」→ emit(\"app-quit\") + 起线程等 Condvar（lib.rs:1637）", "main.js:71 收到 → saveNow() :275 → api.quitAck → quit_ack :1576", "!最多等 2 秒，超时照样退出 —— 最后一次改动可能丢"] },
    { layer: "③ 备份 / 导出", k: "flow", t: ["轮转在 JS 侧不在 Rust：dataCenter.js:114-121 写 localStorage 环形备份", "fullBackup :20（schema 2）、CSV :33、ICS :72、xlsx :99（懒 import xlsx）", "WebDAV 手动推拉：syncLayer.js makeSnapshot :24 / PUT+GET over 带 cookie", "!的 Rust HTTP 会话，Basic auth；明文 http 会警告（:66）", "手机遥控是另一条：lan.rs 起 tiny_http，/api/state 直读 data.json"] },
    { layer: "遗留", k: "warn", t: ["!浏览器兜底键名仍是 tidebalance-data（api.js:18）", "违反 AGENTS.md 铁律三（应为 letime-data）", "仅影响 DEV 下的纯浏览器运行，不影响三端产物"] },
  ]);

const f06 = () => chain("06-update.svg", "功能链路 ⑥ 自更新：为什么不用官方 updater",
  "手写 GitHub Releases 客户端，只校验 https 和大小，不校验签名 —— 这是明确取舍",
  [
    { layer: "③ 触发", k: "flow", t: ["initUpdateChecker()  main.js:51 → src/updateChecker.js:191", "UI：views/settings/update.js:24（挂在关于卡片里 aboutCard.js:38）"] },
    { layer: "⑥→⑦ 检查", k: "native", t: ["api.updateCheck → lib.rs(update.rs):266", "GET GitHub Releases API :34（仓库 momoqiqi-qwq/le-time-management）", "Cache-Control: no-cache :275，不吃 CDN 缓存", "parse_version :71 做 semver 比较；asset_score :118 给资产打分挑包"] },
    { layer: "③ 状态机", k: "flow", t: ["check → download :307 → ready :311 → install :360", "进度走 Tauri 事件 update:progress（updateChecker.js:389）"] },
    { layer: "⑦ 下载", k: "native", t: ["update_download :401：validate_release_url :207 强制 github + https", "流式写 app_cache_dir 的 .part，下完 rename :473", "!只有大小校验，没有 checksum / 签名（:397-399 自己写明）"] },
    { layer: "⑦ 安装", k: "native", t: ["Windows :491 起 NSIS 安装器 /S /R 分离进程，然后 app.exit(0) :530", "Android :543 走 ApkInstallerPlugin 的 content:// URI", "!需要 REQUEST_INSTALL_PACKAGES —— 由 sync-android-native.js:51", "!注入到 gen/android 的 AndroidManifest（该目录 gitignored）"] },
  ]);

const f07 = () => chain("07-android.svg", "功能链路 ⑦ Android 适配：同一份前端怎么在手机上不变形",
  "核心矛盾：Android WebView 的 env(safe-area-inset-*) 恒为 0，必须让 Kotlin 注入 CSS 变量",
  [
    { layer: "⑧ 容器", k: "plat", t: ["Android 复用完全相同的 dist/（Vite 产物）—— 没有第二套 UI 代码", "sync-plugins.js:164 有断言守住这件事", "gen/android 是生成目录：tauri android init 会整个重建它"], arrow: "同一份代码" },
    { layer: "① 视图裁剪", k: "present", t: ["同一份代码，但【核心视图清单按平台不同】", "coreViewIds()  uiPreferences.js:12", "桌面 DESKTOP_CORE_VIEWS :11 = 任务表 / 时间块 / 收件箱 / 插件", "APK   MOBILE_CORE_VIEWS :10 = 任务表 / 时间线 / 插件", "窄屏放不下 24h 画布，用「时间线」替代时间块 + 收件箱", "ensureActiveView() shell.js:30 白名单不命中就兜底落 quadrant"], arrow: "壳先按平台挑视图" },
    { layer: "⑧ 系统", k: "plat", t: ["MainActivity.kt:59 → enableEdgeToEdge() :84", "!按 Android 约定，这会让状态栏/导航栏变成透明浮层盖在 WebView 上，", "!应用必须自己消费 WindowInsets —— 而 WebView 里 env() 取值恒为 0，", "viewport-fit=cover 也救不回来"] },
    { layer: "⑦ 注入", k: "native", t: ["MainActivity 读真实四方向 insets + 底部取 max(systemBars.bottom, ime.bottom)", "evaluateJavascript（:171-185）写 --sat / --sab / --sal / --sar 到 documentElement", "onPageFinished 再补注入一次（新文档会重置内联样式）"] },
    { layer: "② CSS 约定", k: "cross", t: ["凡贴顶 / 贴底布局一律双路取值，不裸用 env()：", "padding-top: var(--sat, env(safe-area-inset-top, 0px))", "!绝不在 :root 给 --sat 写兜底默认值 —— 一旦在 :root 生效，", "!var() 第二个参数永远不会被求值，iOS/桌面的原生 env() 直接废掉", "回归断言：scripts/test-android-layout.mjs"] },
    { layer: "② 深浅色同步", k: "cross", t: ["theme.js setThemeMode :180 → api.system_bar → system_bar.rs:60", "Android 上调 SystemBarPlugin.setDarkIcons，让图标在透明浮层下仍有对比度", "桌面分支直接返回 { applied:false }（:77）"] },
    { layer: "⑦ 原生课表桥", k: "native", t: ["native_schedule.rs:69：Windows 起 native/shiguang/ShiguangSchedule.exe", "作为主窗子进程（--le-parent :114），stdin 传 JSON，等 LE_READY :129", "Android 用 Intent 起 com.xingheyuzhuan.shiguangschedule.MainActivity", "JS 侧：pluginHost.js:189 renderNativeSchedule(el, ctx, fallbackRender)", "ResizeObserver 量宿主盒子对位（nativeSchedule.js:77-90），失败 degrade() :41", "!定位：原生是增强，JS 版是兜底 —— 关掉不影响功能"] },
    { layer: "工具链", k: "tool", t: ["事实源 = le-time-management/android/gradle/（纳入版本管理）", "sync-android-native.js 复制 5 个 .kt 进 gen/android :41", "并打补丁：AndroidManifest 权限 :51、注册 .SchoolImportActivity、", "file_paths.xml 的 cache-path :263", "校验：node tools/sync-android-native.js --check"] },
    { layer: "⑧ 构建", k: "plat", t: ["bash scripts/build-android-apk.sh all（aarch64 + x86_64）", "!不要用 npm run tauri android build —— Windows 中文路径会坏", "!不要与 Windows 构建并行：两边都先 vite build 写同一个 dist/"] },
  ]);

const f08 = () => chain("08-miniprogram.svg", "功能链路 ⑧ 小程序同源版：共享什么、分叉什么、靠什么不散",
  "运行时完全独立，靠「同一份工具链 + 同一份数据 schema + 同一套校验脚本」保持同步",
  [
    { layer: "呈现", k: "mini", t: ["原生 WXML/WXSS，无 Tauri、无 npm 构建", "app.json：8 个 page + 4 个 tabBar（设置 / 任务表 / 时间块 / 捕获）", "darkmode: true + theme.json 变量，跟随系统"] },
    { layer: "状态", k: "mini", t: ["core/store.js 与桌面同 schema，wx.setStorage 承载", "设置页导出/导入的 JSON 与桌面端双向可恢复", "appMeta.js 的 version 由 sync-version.js 统一写"] },
    { layer: "解析", k: "mini", t: ["core/timeParser.js:1 自己声明「逐行移植」", "唯一差异：dayOnly 的 lookbehind 换成捕获组 + slice（:45 / :74-76）", "!原因：iOS 16.4 以下 JavaScriptCore 不支持 lookbehind，会解析崩溃", "CJS exports :172"] },
    { layer: "捕获", k: "mini", t: ["core/captureFlow.js 把 handleText 拆成纯函数：", "buildCapture :9-27 / durOptions :30 / createFromCapture :39-62", "pages/capture/index.js:39-45,99 是可编辑预览卡（比桌面的规则路径更显式）", "!砍掉：冲突试算与自动避让、AI 兜底、撤销、toast"] },
    { layer: "提醒", k: "mini", t: ["core/taskReminder.js:10-12 用固定 setInterval(15s) 取代自适应 setTimeout", "声音：wx.createInnerAudioContext + 随包 /sounds/reminder.wav", "!桌面是 Web Audio 现场合成 7 种预设（sound.js:8-28），零音频文件"] },
    { layer: "插件", k: "mini", t: ["!没有插件宿主、没有 tide —— 微信禁止动态求值代码", "core/pluginRuntime.js:1「只放纯数据逻辑，页面负责交互」", "= 每个插件的纯函数平行重写：weeklyReport / holidaySummary /", "  futureExams / examFlow / dormDuty* / inboxDrop*", "core/pluginNet.js：wx.request 不持久 cookie，所以手搓 cookie jar :2-5", "UI 硬编码在 pages/plugin/index.js，开关看", "manifest.platforms.miniprogram === 'native'（plugins/index.js:83）"] },
    { layer: "同源机制", k: "tool", t: ["sync-plugins.js 一次生成：桌面 pluginCatalog.js +", "miniprogram/core/pluginCatalog.js + pluginData/holiday.js（:102）", "+ exams.js（:116，从 exam-calendar 的 main.js 里抠 const DATA）", "+ 插件 PNG 副本（:128）+ 小程序 tab 图标", "sync-version.js 覆盖 miniprogram/core/appMeta.js", "校验：tools/test-miniprogram-core.js（实跑 260 项断言全过）+ check-miniprogram.js"] },
    { layer: "桌面专属", k: "present", t: ["插件沙箱、窗口拖拽 / 截图捕获、图片附件、全局快捷键、", "命令面板、LAN 遥控（桌面是 tiny_http 服务端，手机是客户端）", "!小程序没有的反而更多：暗色跟随系统、7 天日期条、长按放置震动、", "!页面分享（这些是小程序专属，见 README）"] },
  ]);

console.log([layersDiagram(), f01(), f02(), f03(), f04(), f05(), f06(), f07(), f08()].join("\n"));
if (overflow.length) {
  console.log(`\n⚠ ${overflow.length} 处文字可能超出盒子宽度（需拆行）：`);
  console.log(overflow.join("\n"));
} else {
  console.log("\n✓ 无文字溢出");
}
