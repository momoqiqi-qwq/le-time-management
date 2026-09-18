// 设置视图：数据、插件管理、关于
import { api } from "../api.js";
import * as S from "../store.js";
import { el, toast } from "../ui.js";
import { onNavChanged } from "../pluginHost.js";
import { computePluginShortcutMap, getPluginShortcutCustoms, setPluginShortcut } from "../pluginShortcuts.js";
import { pluginShortcutEntries } from "../pluginShortcutEntries.js";
import { DEFAULT_REMINDER_SETTINGS, PRESET_OFFSETS, normalizeOffsets, playReminderSound, reminderLabel } from "../taskReminder.js";
import { BUILTIN_SOUNDS, CUSTOM_SOUND_ID, DEFAULT_SOUND_ID, resolveSound } from "../sound.js";
import { createAboutCard } from "./aboutCard.js";
import { DEFAULT_GLOBAL_SHORTCUTS, getShortcutConfig, getGlobalShortcutStatus, applyGlobalShortcuts } from "../globalShortcuts.js";
import { fullBackup, parseFullBackup, downloadText, tasksToCsv, blocksToCsv, importTasksCsv, toIcs, importIcs, exportXlsx, importXlsx, listAutoBackups, createAutoBackup, restoreAutoBackup, deleteAutoBackup } from "../dataCenter.js";
import { createInterfaceCard, createThemeCard } from "./settings/appearance.js";
import { createSettingsNavigator } from "./settings/navigator.js";
import { createPluginSettingsCard, isPluginBatchBusy } from "./settings/plugins.js";
import { createAiSettingsCard } from "./settings/ai.js";
import { createSyncCard } from "./settings/sync.js";
import { toggleSwitch } from "../switchControl.js";
import {
  getUpdateSettings, setUpdateSettings, getUpdateState, subscribeUpdateState,
  describeUpdateState, isUpdaterSupported, checkForUpdates, startUpdate,
  installUpdate, openInstallPermission, clearSkippedVersion,
} from "../updateChecker.js";

let info = null;
let navUnsub = null;
// expanded 是窄屏（手机 / APK）手风琴里已展开的分区 id。它必须活在这里而不是 navigator 内部：
// 在设置里改任何一项都会重渲染整页，状态存在局部变量里会让刚展开的面板当场塌掉。
// 但每次「打开设置」都清空 —— 一进来先给一张分类目录，不预展开任何分区（v0.49.1）。
const settingsNavState = { query: "", filter: "all", expanded: [] };

export function renderSettings(container, opts = {}) {
  settingsNavState.expanded = [];
  // 插件是异步加载的：注册表变化（导航变化）时重渲染，避免卡片缺位。
  // 批量启停插件时先跳过 —— 每关一个插件都会 emitNavChanged()，不挡就会整页重建 N 次。
  navUnsub?.();
  navUnsub = onNavChanged(() => { if (container.isConnected && !isPluginBatchBusy()) render(); });

  const wrap = el("div", { class: "set-wrap" });
  container.append(wrap);

  const render = async () => {
    if (!info) info = await api.appInfo().catch(() => null);
    const settings = S.getState().settings;

    /* 外观与交互：拆成独立模块，避免设置主文件继续膨胀 */
    const uiCard = createInterfaceCard({ rerender: render });
    const themeCard = createThemeCard();

    /* 任务提醒 */
    settings.taskReminder ??= JSON.parse(JSON.stringify(DEFAULT_REMINDER_SETTINGS));
    const rc = settings.taskReminder;
    rc.defaultOffsets = normalizeOffsets(rc.defaultOffsets || DEFAULT_REMINDER_SETTINGS.defaultOffsets);
    const reminderCard = el("div", { class: "card set-card" },
      el("h2", {}, "任务提醒"),
    );
    const enabled = toggleSwitch({ checked: rc.enabled !== false });
    enabled.addEventListener("change", () => { rc.enabled = enabled.checked; S.saveNow(); });
    const vol = el("input", { type: "range", min: "0", max: "100", step: "1", value: Math.round((Number(rc.volume) || 0) * 100) });
    const volText = el("b", {}, `${vol.value}%`);
    vol.addEventListener("input", () => { volText.textContent = `${vol.value}%`; rc.volume = Number(vol.value) / 100; S.persistSoon(); });
    const sound = el("select", {});
    for (const preset of BUILTIN_SOUNDS) sound.append(el("option", { value: preset.id }, preset.label));
    sound.append(el("option", { value: CUSTOM_SOUND_ID }, "自定义音频"));
    sound.value = resolveSound(rc.sound || DEFAULT_SOUND_ID);
    sound.addEventListener("change", () => { rc.sound = sound.value; S.saveNow(); });
    const audioInput = el("input", { type: "file", accept: "audio/*,.mp3,.wav,.m4a,.aac,.ogg", style: "display:none" });
    const audioName = el("span", { class: "audio-name" }, rc.customAudioName || "尚未导入音频");
    audioInput.addEventListener("change", async () => {
      const f = audioInput.files?.[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast("音频文件请控制在 8MB 以内"); audioInput.value = ""; return; }
      const reader = new FileReader();
      reader.onload = async () => { rc.customAudio = String(reader.result || ""); rc.customAudioName = f.name; rc.sound = "custom"; sound.value = "custom"; await S.saveNow(); audioName.textContent = f.name; toast("自定义提醒音已导入"); };
      reader.onerror = () => toast("音频读取失败");
      reader.readAsDataURL(f);
    });
    const defaultBox = el("div", { class: "reminder-picks settings-reminder-picks" });
    const customDefault = el("input", { type: "number", min: "0", max: "43200", placeholder: "自定义分钟", class: "reminder-custom" });
    const renderDefaults = () => {
      defaultBox.replaceChildren();
      const cur = normalizeOffsets(rc.defaultOffsets);
      for (const off of PRESET_OFFSETS) {
        const on = cur.includes(off);
        defaultBox.append(el("button", { type: "button", class: `reminder-chip${on ? " on" : ""}`, onclick: () => { rc.defaultOffsets = on ? cur.filter(x => x !== off) : normalizeOffsets([...cur, off]); S.saveNow(); renderDefaults(); } }, off === 0 ? "到点" : reminderLabel(off).replace("截止", "")));
      }
      for (const off of cur.filter(x => !PRESET_OFFSETS.includes(x))) defaultBox.append(el("button", { type: "button", class: "reminder-chip on", onclick: () => { rc.defaultOffsets = cur.filter(x => x !== off); S.saveNow(); renderDefaults(); } }, `${off} 分钟 ×`));
      defaultBox.append(customDefault, el("button", { type: "button", class: "btn ghost sm", onclick: () => { const n = Math.round(Number(customDefault.value)); if (!Number.isFinite(n) || n < 0 || n > 43200) return toast("请输入 0～43200 分钟"); rc.defaultOffsets = normalizeOffsets([...cur, n]); customDefault.value = ""; S.saveNow(); renderDefaults(); } }, "添加"));
    };
    renderDefaults();
    reminderCard.append(
      el("div", { class: "setting-row" }, el("span", {}, "启用任务提醒"), enabled),
      el("div", { class: "setting-row" }, el("span", {}, "提醒音量"), el("span", { class: "volume-row" }, vol, volText)),
      el("div", { class: "setting-row" }, el("span", {}, "提示音"), sound),
      el("div", { class: "setting-row" }, el("span", {}, "自定义音频"), el("span", { class: "audio-actions" }, audioName, el("button", { class: "btn ghost sm", onclick: () => audioInput.click() }, "导入音频"), el("button", { class: "btn ghost sm", onclick: () => playReminderSound(true) }, "试听"))),
      audioInput,
      el("div", { class: "setting-row setting-col" }, el("span", {}, "默认提前预警"), defaultBox),
    );

    /* 数据中心：完整备份 + CSV / Excel / ICS + 自动备份 */
    settings.autoBackup ??= { enabled: true, frequency: "daily", keep: 7 };
    const ab = settings.autoBackup;
    const dataCard = el("div", { class: "card set-card" },
      el("h2", {}, "数据中心"),
      el("div", { style: "margin:10px 0" }, el("div", { class: "path-code" }, info ? (info.data_dir || info.dataDir || "未知") : "读取中…")),
    );
    const backupInput = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    const csvInput = el("input", { type: "file", accept: ".csv,text/csv", style: "display:none" });
    const xlsxInput = el("input", { type: "file", accept: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", style: "display:none" });
    const icsInput = el("input", { type: "file", accept: ".ics,text/calendar", style: "display:none" });
    const mergeImported = async ({ tasks = [], blocks = [] }, label) => {
      createAutoBackup(`导入 ${label} 前`, info?.version || "");
      const st = S.getState();
      const taskIds = new Set(st.tasks.map(x => x.id));
      const blockIds = new Set(st.blocks.map(x => x.id));
      const cleanTasks = tasks.filter(x => !taskIds.has(x.id));
      const cleanBlocks = blocks.filter(x => !blockIds.has(x.id));
      const ok = window.confirm(`准备导入：任务 ${cleanTasks.length} 条，时间块 ${cleanBlocks.length} 条。\n\n将与现有数据合并，并已创建自动恢复点。是否继续？`);
      if (!ok) return;
      st.tasks.push(...cleanTasks); st.blocks.push(...cleanBlocks); await S.saveNow();
      toast(`已导入 ${cleanTasks.length} 个任务、${cleanBlocks.length} 个时间块`); render();
    };
    backupInput.addEventListener("change", async () => { const f = backupInput.files?.[0]; if (!f) return; try { const next = parseFullBackup(await f.text()); createAutoBackup("恢复完整备份前", info?.version || ""); if (!confirm(`此操作会替换当前全部数据。\n备份中包含 ${next.tasks.length} 个任务、${next.blocks.length} 个时间块。继续？`)) return; S.replaceAll(next); await S.saveNow(); toast("完整备份已恢复"); render(); } catch (e) { toast(`导入失败：${e.message}`); } finally { backupInput.value = ""; } });
    csvInput.addEventListener("change", async () => { const f = csvInput.files?.[0]; if (!f) return; try { await mergeImported({ tasks: importTasksCsv(await f.text()), blocks: [] }, "CSV"); } catch (e) { toast(`CSV 导入失败：${e.message}`); } finally { csvInput.value = ""; } });
    xlsxInput.addEventListener("change", async () => { const f = xlsxInput.files?.[0]; if (!f) return; try { await mergeImported(await importXlsx(f), "Excel"); } catch (e) { toast(`Excel 导入失败：${e.message}`); } finally { xlsxInput.value = ""; } });
    icsInput.addEventListener("change", async () => { const f = icsInput.files?.[0]; if (!f) return; try { await mergeImported(importIcs(await f.text()), "ICS"); } catch (e) { toast(`ICS 导入失败：${e.message}`); } finally { icsInput.value = ""; } });
    dataCard.append(
      el("div", { class: "data-section-title" }, "完整备份 / 恢复"),
      el("div", { class: "data-actions" },
        el("button", { class: "btn pri", onclick: () => { downloadText(`Le时间管理-full-backup-${S.todayStr()}.json`, JSON.stringify(fullBackup(info?.version || ""), null, 2), "application/json"); toast("完整备份已导出"); } }, "导出 JSON 完整备份"),
        el("button", { class: "btn ghost", onclick: () => backupInput.click() }, "恢复 JSON 备份"),
        el("button", { class: "btn ghost", onclick: async () => { await S.saveNow(); toast("已立即保存"); } }, "立即保存"),
      ),
      el("div", { class: "data-section-title" }, "表格 / 日历交换"),
      el("div", { class: "data-actions" },
        el("button", { class: "btn ghost sm", onclick: () => downloadText(`Le时间管理-任务-${S.todayStr()}.csv`, tasksToCsv(), "text/csv;charset=utf-8") }, "导出任务 CSV"),
        el("button", { class: "btn ghost sm", onclick: () => downloadText(`Le时间管理-时间块-${S.todayStr()}.csv`, blocksToCsv(), "text/csv;charset=utf-8") }, "导出时间块 CSV"),
        el("button", { class: "btn ghost sm", onclick: () => csvInput.click() }, "导入任务 CSV"),
        el("button", { class: "btn ghost sm", onclick: async () => { try { await exportXlsx(); } catch (e) { toast(`Excel 导出失败：${e.message}`); } } }, "导出 Excel .xlsx"),
        el("button", { class: "btn ghost sm", onclick: () => xlsxInput.click() }, "导入 Excel .xlsx"),
        el("button", { class: "btn ghost sm", onclick: () => downloadText(`Le时间管理-${S.todayStr()}.ics`, toIcs(), "text/calendar;charset=utf-8") }, "导出 ICS"),
        el("button", { class: "btn ghost sm", onclick: () => icsInput.click() }, "导入 ICS"),
      ),
      backupInput, csvInput, xlsxInput, icsInput,
    );
    const abEnabled = toggleSwitch({ checked: ab.enabled !== false });
    const abFreq = el("select", {}, el("option", { value: "daily" }, "每天"), el("option", { value: "weekly" }, "每周")); abFreq.value = ab.frequency || "daily";
    const abKeep = el("input", { type: "number", min: "3", max: "30", value: ab.keep || 7, style: "width:84px" });
    const backupList = el("div", { class: "backup-list" });
    const paintBackups = () => { backupList.replaceChildren(); const rows = listAutoBackups(); if (!rows.length) { backupList.append(el("p", { class: "desc" }, "还没有自动恢复点。")); return; } for (const row of rows.slice(0, 10)) backupList.append(el("div", { class: "backup-row" }, el("span", {}, el("b", {}, row.reason), el("small", {}, new Date(row.at).toLocaleString("zh-CN"))), el("span", {}, el("button", { class: "btn ghost sm", onclick: async () => { if (!confirm("恢复这个自动备份？当前数据会先再建一个恢复点。")) return; createAutoBackup("手动恢复前", info?.version || ""); await restoreAutoBackup(row.id); toast("已恢复自动备份"); render(); } }, "恢复"), el("button", { class: "btn ghost sm", onclick: () => { deleteAutoBackup(row.id); paintBackups(); } }, "删除")))); };
    dataCard.append(
      el("div", { class: "data-section-title" }, "自动备份 / 恢复点"),
      el("div", { class: "setting-row" }, el("span", {}, "启用自动备份"), abEnabled),
      el("div", { class: "setting-row" }, el("span", {}, "频率"), abFreq),
      el("div", { class: "setting-row" }, el("span", {}, "保留数量"), abKeep),
      el("div", { class: "data-actions" }, el("button", { class: "btn ghost sm", onclick: () => { createAutoBackup("手动恢复点", info?.version || ""); paintBackups(); toast("恢复点已创建"); } }, "现在创建恢复点")),
      backupList,
    );
    const persistAb = () => { ab.enabled = abEnabled.checked; ab.frequency = abFreq.value; ab.keep = Math.min(30, Math.max(3, Number(abKeep.value) || 7)); S.saveNow(); };
    abEnabled.onchange = persistAb; abFreq.onchange = persistAb; abKeep.onchange = persistAb; paintBackups();

    /* 可选同步：网盘快照的分步引导与一键配置，实现拆在 views/settings/sync.js（和 ai.js 同一个理由）*/
    const syncCard = await createSyncCard({ appVersion: info?.version || "", os: info?.os || "" });

    /* 全局快捷键 */
    const shortcutCfg = getShortcutConfig();
    const shortcutEnabled = toggleSwitch({ checked: shortcutCfg.enabled !== false });
    const commandShortcut = el("input", { type: "text", value: shortcutCfg.commandPalette || DEFAULT_GLOBAL_SHORTCUTS.commandPalette, placeholder: DEFAULT_GLOBAL_SHORTCUTS.commandPalette, spellcheck: "false" });
    const captureShortcut = el("input", { type: "text", value: shortcutCfg.quickCapture || DEFAULT_GLOBAL_SHORTCUTS.quickCapture, placeholder: DEFAULT_GLOBAL_SHORTCUTS.quickCapture, spellcheck: "false" });
    const shortcutStatus = el("div", { class: "shortcut-status" });
    const paintShortcutStatus = (status = getGlobalShortcutStatus()) => {
      if (!status.supported) shortcutStatus.textContent = `${status.errors?.[0] || "当前环境不支持系统级快捷键"}；应用内 Ctrl+K 仍可用。`;
      else shortcutStatus.textContent = [...(status.registered || []).map((x) => `已注册 ${x}`), ...(status.errors || []).map((x) => `失败 ${x}`)].join(" · ") || "全局快捷键已关闭";
    };
    paintShortcutStatus();

    /* 插件快捷键：Alt + 字母直达插件视图。分配规则与侧栏徽标 / 按键命中同源
       （computePluginShortcutMap）：显式指定优先，没设的按**插件中文名首字母（拼音）**
       自动分配、撞车退回插件 ID 首字母，字母先到先得。
       插件视图是异步注册的 —— 每次重渲染现取（pluginShortcutEntries 是统一取数口径）。 */
    const pluginShortcutBox = el("div", {});
    const paintPluginShortcuts = () => {
      pluginShortcutBox.replaceChildren();
      const entries = pluginShortcutEntries();
      if (!entries.length) {
        pluginShortcutBox.append(el("p", { class: "shortcut-hint" }, "暂无已启用且有界面的插件；启用插件后可在这里给它分配 Alt + 字母快捷键。"));
        return;
      }
      // 名字取自 entries 本身，别再各自查一遍显示名 —— 两处取数一旦不同源，
      // 「设置页显示的字母」和「侧栏徽标 / 实际按键」就会对不上。
      const nameOf = new Map(entries.map((e) => [e.pluginId, e.name]));
      const map = computePluginShortcutMap(entries, getPluginShortcutCustoms());
      pluginShortcutBox.append(
        el("p", { class: "shortcut-hint" }, "按 Alt + 字母直接打开对应插件（桌面键盘生效）。输入框留空 = 按插件中文名首字母（拼音）自动分配，撞车时退回插件 ID 首字母；字母先到先得，重复时先设置的生效。"),
        el("div", { class: "shortcut-grid" },
          ...[...map.entries()].flatMap(([pluginId, info]) => {
            const name = nameOf.get(pluginId) || pluginId;
            const input = el("input", {
              type: "text", maxlength: "1", spellcheck: "false",
              value: getPluginShortcutCustoms()[pluginId] || "",
              placeholder: "自动", "aria-label": `${name}的快捷键字母`,
            });
            input.addEventListener("change", () => {
              setPluginShortcut(pluginId, input.value);
              S.saveNow();
              paintPluginShortcuts();
            });
            return [
              el("span", { class: "shortcut-name" },
                el("span", { class: "shortcut-name-text" }, name),
                info.letter ? el("kbd", { class: "shortcut-kbd" }, `Alt+${info.letter}`) : el("span", { class: "shortcut-none" }, "无"),
              ),
              input,
            ];
          }),
        ),
      );
    };
    paintPluginShortcuts();

    const shortcutCard = el("div", { class: "card set-card" },
      el("h2", {}, "全局快捷键"),
      el("div", { class: "setting-row" }, el("span", {}, "启用系统级快捷键"), shortcutEnabled),
      el("div", { class: "shortcut-grid" },
        el("span", {}, "命令面板"), commandShortcut,
        el("span", {}, "快速捕获"), captureShortcut,
      ),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" },
        el("button", { class: "btn pri sm", onclick: async () => {
          shortcutCfg.enabled = shortcutEnabled.checked;
          shortcutCfg.commandPalette = commandShortcut.value.trim() || DEFAULT_GLOBAL_SHORTCUTS.commandPalette;
          shortcutCfg.quickCapture = captureShortcut.value.trim() || DEFAULT_GLOBAL_SHORTCUTS.quickCapture;
          await S.saveNow();
          const status = await applyGlobalShortcuts();
          paintShortcutStatus(status);
          toast(status.errors?.length ? "快捷键已应用，但有冲突或注册失败" : "全局快捷键已应用");
        } }, "应用快捷键"),
        el("button", { class: "btn ghost sm", onclick: async () => {
          shortcutEnabled.checked = true;
          commandShortcut.value = DEFAULT_GLOBAL_SHORTCUTS.commandPalette;
          captureShortcut.value = DEFAULT_GLOBAL_SHORTCUTS.quickCapture;
          shortcutCfg.enabled = true; shortcutCfg.commandPalette = commandShortcut.value; shortcutCfg.quickCapture = captureShortcut.value;
          await S.saveNow();
          paintShortcutStatus(await applyGlobalShortcuts());
          toast("已恢复默认快捷键");
        } }, "恢复默认"),
      ),
      shortcutStatus,
      el("div", { class: "plugin-shortcut-block" },
        el("b", { class: "shortcut-sub-title" }, "插件快捷键"),
        pluginShortcutBox,
      ),
    );

    /* AI：凭据在 Rust 侧加密保存；自动任务只拿白名单操作。 */
    const aiCard = await createAiSettingsCard();

    /* 插件管理：独立模块，避免设置主视图承担市场/权限/导入导出细节 */
    const { card: plugCard, registry: regs } = createPluginSettingsCard({ rerender: render });

    /* 局域网联动 */
    const st = S.getState().settings;
    st.lanPort ??= 27123;
    st.lanToken ??= Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);
    let lanStatus = { running: false, url: "" };
    try { lanStatus = await api.lanStatus(); } catch {}

    const lanCard = el("div", { class: "card set-card" },
      el("h2", {}, "局域网联动"),
    );
    const lanBody = el("div", { style: "margin-top:10px" });
    lanCard.append(lanBody);

    const renderLan = () => {
      lanBody.replaceChildren();
      // 状态行：两种状态下都展示，填满卡片下方空间
      const statusRow = (running, port, host) =>
        el("div", { style: "margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)" },
          el("div", { style: "display:flex;flex-wrap:wrap;gap:6px 26px;font-size:calc(12.5px * var(--ui-text-scale));color:var(--ink-2)" },
            el("span", {}, "状态 ", running
              ? el("span", { style: "font-weight:600;color:var(--mint)" }, "● 运行中")
              : el("span", { style: "font-weight:600;color:var(--ink-3)" }, "○ 已停止")),
            port ? el("span", {}, "端口 ", el("b", {}, port)) : null,
            host ? el("span", {}, "本机地址 ", el("b", {}, host)) : null,
          ),
          running
            ? el("div", { style: "margin-top:6px;font-size:calc(12px * var(--ui-text-scale));color:var(--ink-3)" }, "手机需与电脑处于同一 Wi-Fi / 局域网，扫码或打开链接即可配对联动。")
            : el("div", { style: "margin-top:6px;font-size:calc(12px * var(--ui-text-scale));color:var(--ink-3)" }, "启动后手机浏览器 / 小程序可通过二维码或链接远程操作本机任务。"),
        );
      if (lanStatus.running) {
        const lanPort = (lanStatus.url.match(/:(\d+)/) || [])[1] || st.lanPort;
        const lanHost = (lanStatus.url.match(/^http:\/\/([^:/]+)/) || [])[1] || "";
        lanBody.append(
          el("div", { class: "path-code" }, lanStatus.url),
          el("div", { style: "display:flex;gap:14px;margin-top:12px;align-items:center" },
            el("img", { src: `${lanStatus.url.replace("/m?", "/qr.svg?")}`, style: "width:132px;height:132px;border-radius:10px;border:1px solid var(--line);background:#fff" }),
            el("div", { style: "flex:1" },
              el("div", { style: "display:flex;gap:8px;margin-top:10px;flex-wrap:wrap" },
                el("button", { class: "btn ghost sm", onclick: () => { navigator.clipboard?.writeText(lanStatus.url); toast("链接已复制"); } }, "复制链接"),
                el("button", {
                  class: "btn ghost sm",
                  onclick: async () => {
                    try { await api.openExternal(lanStatus.url); }
                    catch { window.open(lanStatus.url, "_blank"); }
                  },
                }, "从浏览器打开"),
                el("button", {
                  class: "btn danger sm",
                  onclick: async () => {
                    try { await api.lanStop(); }
                    catch (e) { toast(`停止失败：${e.message || e}`); return; }
                    // 关键：lanStop 成功后必须更新本地状态再重渲染，
                    // 否则 lanStatus 仍是 running，界面看起来「按了没反应」。
                    lanStatus = { running: false };
                    st.lanAuto = false;
                    S.saveNow();
                    toast("联动服务已停止");
                    renderLan();
                  },
                }, "停止服务"),
              ),
            ),
          ),
          statusRow(true, lanPort, lanHost),
        );
      } else {
        const portIn = el("input", { type: "number", value: st.lanPort, style: "width:110px;height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:#fff" });
        lanBody.append(
          el("div", { style: "display:flex;gap:8px;align-items:center;margin-top:4px" },
            el("span", { style: "font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2)" }, "端口"),
            portIn,
            el("button", {
              class: "btn pri sm",
              onclick: async () => {
                st.lanPort = Number(portIn.value) || 27123;
                st.lanAuto = true;
                S.saveNow();
                try {
                  lanStatus = { running: true, url: await api.lanStart(st.lanPort, st.lanToken) };
                  toast("联动服务已启动");
                  renderLan();
                } catch (e) { toast(`启动失败：${e.message || e}`); }
              },
            }, "启动服务"),
          ),
          statusRow(false, st.lanPort, ""),
        );
      }
    };
    renderLan();

    /* 关于 */
    const aboutCard = createAboutCard(info, regs);

    const settingEntries = [
      { id: "ui", node: uiCard, label: "界面与交互", icon: "sliders", hint: "密度 / 字号 / 缩放 / 动效 / 窗口", keywords: "密度 文字 字号 缩放 界面大小 整体缩放 放大 缩小 太大 太小 看不清 动效 手势 滑动 启动页 窗口 大小 尺寸 最大化 分辨率 顶部统计 副标题 托盘 关闭 退出 最小化" },
      { id: "theme", node: themeCard, label: "主题", icon: "palette", hint: "配色与阅读模式", keywords: "颜色 夜间 深海 樱花 松林 暮光 极简" },
      { id: "reminders", node: reminderCard, label: "任务提醒", icon: "bell", hint: "预警时间与提示音", keywords: "提醒 预警 音量 提示音 音频 截止" },
      { id: "data", node: dataCard, label: "数据中心", icon: "database", hint: "备份 / 恢复 / 交换", keywords: "备份 恢复 JSON CSV Excel ICS 自动恢复点 导入 导出" },
      { id: "sync", node: syncCard, label: "可选同步", icon: "cloud-arrow-up", hint: "网盘快照 / 一键配置引导", keywords: "同步 网盘 WebDAV 上传 下载 备份 恢复 坚果云 Nextcloud 应用密码 换手机 换电脑 一键配置" },
      { id: "ai", node: aiCard, label: "AI 与自动任务", icon: "wand-magic-sparkles", hint: "Base / API Key / 安全边界", keywords: "AI Base API Key 模型 自动任务 加密 定时" },
      { id: "shortcuts", node: shortcutCard, label: "全局快捷键", icon: "keyboard", hint: "命令面板 / 快速捕获 / 插件快捷键", keywords: "快捷键 命令面板 快速捕获 Ctrl Alt 插件快捷键 字母" },
      { id: "lan", node: lanCard, label: "局域网联动", icon: "network-wired", hint: "手机联动与二维码", keywords: "手机 WiFi 二维码 端口 配对" },
      { id: "plugins", node: plugCard, label: "插件管理", icon: "puzzle-piece", hint: "启用 / 导入 / 导出", keywords: "插件 权限 导入 ZIP 启用 停用 开发文档" },
      // 更新入口在「关于」里（软件更新）：关键词挂这儿，搜「更新 / 升级」也能落到关于。
      { id: "about", node: aboutCard, label: "关于", icon: "circle-info", hint: "版本 / 软件更新 / 开源信息", keywords: "版本 更新 升级 检查更新 自动更新 弹窗提示 忽略此版本 开源 框架" },
    ];
    for (const entry of settingEntries) {
      entry.node.classList.add("settings-section");
      entry.node.id = `settings-${entry.id}`;
    }
    const settingsNavigator = createSettingsNavigator(settingEntries, settingsNavState);
    // 窄屏走手风琴：分区由 navigator 包成「标题行 + 可收放内容」，这里按它给的顺序渲染
    const content = el("div", { class: "settings-content" }, ...settingsNavigator.panels);
    const layout = el("div", { class: "settings-layout" }, settingsNavigator.node, content);
    // 设置中心头卡已移除：纯展示内容占掉首屏空间，左侧分类导航本身已承担引导职责。
    wrap.replaceChildren(layout);
    settingsNavigator.apply();
    // 外部（如更新提示条的「立即更新」）可以点名要停在哪一节。
    // 放在 apply() 之后：select() 会校验 visibleIds，而那正是 apply() 填的。
    if (opts.section) settingsNavigator.select(opts.section, { animate: false });
  };
  render();
}

