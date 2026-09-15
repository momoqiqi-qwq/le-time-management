// 设置视图：数据、插件管理、关于
import { api } from "../api.js";
import * as S from "../store.js";
import { el, toast } from "../ui.js";
import { onNavChanged } from "../pluginHost.js";
import { DEFAULT_REMINDER_SETTINGS, PRESET_OFFSETS, normalizeOffsets, playReminderSound, reminderLabel } from "../taskReminder.js";
import { BUILTIN_SOUNDS, CUSTOM_SOUND_ID, DEFAULT_SOUND_ID, resolveSound } from "../sound.js";
import { createAboutCard } from "./aboutCard.js";
import { DEFAULT_GLOBAL_SHORTCUTS, getShortcutConfig, getGlobalShortcutStatus, applyGlobalShortcuts } from "../globalShortcuts.js";
import { uploadWebDav, downloadWebDav, isPotentiallyUnsafeWebDav } from "../syncLayer.js";
import { fullBackup, parseFullBackup, downloadText, tasksToCsv, blocksToCsv, importTasksCsv, toIcs, importIcs, exportXlsx, importXlsx, listAutoBackups, createAutoBackup, restoreAutoBackup, deleteAutoBackup } from "../dataCenter.js";
import { createInterfaceCard, createThemeCard, createBackgroundCard } from "./settings/appearance.js";
import { createSettingsNavigator } from "./settings/navigator.js";
import { createPluginSettingsCard } from "./settings/plugins.js";
import { createAiSettingsCard } from "./settings/ai.js";

let info = null;
let navUnsub = null;
const settingsNavState = { query: "", filter: "all" };

export function renderSettings(container) {
  // 插件是异步加载的：注册表变化（导航变化）时重渲染，避免卡片缺位
  navUnsub?.();
  navUnsub = onNavChanged(() => { if (container.isConnected) render(); });

  const wrap = el("div", { class: "set-wrap" });
  container.append(wrap);

  const render = async () => {
    if (!info) info = await api.appInfo().catch(() => null);
    const settings = S.getState().settings;

    /* 外观与交互：拆成独立模块，避免设置主文件继续膨胀 */
    const uiCard = createInterfaceCard({ rerender: render });
    const themeCard = createThemeCard();
    const bgCard = createBackgroundCard({ rerender: render });

    /* 任务提醒 */
    settings.taskReminder ??= JSON.parse(JSON.stringify(DEFAULT_REMINDER_SETTINGS));
    const rc = settings.taskReminder;
    rc.defaultOffsets = normalizeOffsets(rc.defaultOffsets || DEFAULT_REMINDER_SETTINGS.defaultOffsets);
    const reminderCard = el("div", { class: "card set-card" },
      el("h2", {}, "任务提醒"),
      el("p", { class: "desc" }, "设置任务截止提醒的默认预警时间、提示音和音量。每个任务仍可在任务详情里覆盖默认预警。"),
    );
    const enabled = el("input", { type: "checkbox", checked: rc.enabled !== false ? true : null });
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
      el("p", { class: "desc reminder-note" }, "提醒在 Le时间管理运行期间触发；任务完成后不会继续提醒。"),
    );

    /* 数据中心：完整备份 + CSV / Excel / ICS + 自动备份 */
    settings.autoBackup ??= { enabled: true, frequency: "daily", keep: 7 };
    const ab = settings.autoBackup;
    const dataCard = el("div", { class: "card set-card" },
      el("h2", {}, "数据中心"),
      el("p", { class: "desc" }, "完整备份、表格交换、日历交换和自动恢复点集中在这里。导入前会先创建恢复点；密码、Cookie 和 WebDAV 密码不会进入普通备份。"),
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
    const abEnabled = el("input", { type: "checkbox", checked: ab.enabled !== false ? true : null });
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

    /* 可选同步层：WebDAV 显式推送/拉取，不保存密码 */
    settings.sync ??= {};
    settings.sync.webdav ??= { url: "", username: "" };
    const syncCfg = settings.sync.webdav;
    const syncUrl = el("input", { type: "url", value: syncCfg.url || "", placeholder: "https://dav.example.com/LeTime/data.json", autocomplete: "off" });
    const syncUser = el("input", { type: "text", value: syncCfg.username || "", placeholder: "WebDAV 用户名", autocomplete: "username" });
    const syncPass = el("input", { type: "password", value: "", placeholder: "仅本次使用，不保存", autocomplete: "current-password" });
    const syncStatus = el("div", { class: "shortcut-status" }, "同步为手动操作：本地数据仍是事实源，应用不会在后台自动上传。密码不会写入 data.json。");
    const persistSyncProfile = async () => {
      syncCfg.url = syncUrl.value.trim();
      syncCfg.username = syncUser.value.trim();
      await S.saveNow();
    };
    const syncCard = el("div", { class: "card set-card" },
      el("h2", {}, "可选同步"),
      el("p", { class: "desc" }, "v0.10.0 提供 WebDAV 快照同步。适合 Nextcloud / 坚果云兼容 WebDAV 等服务；无需 Le时间管理账号，也不会改变本地优先的数据模型。"),
      el("div", { class: "sync-fields" },
        el("span", {}, "远端 JSON 地址"), syncUrl,
        el("span", {}, "用户名"), syncUser,
        el("span", {}, "密码 / 应用密码"), syncPass,
      ),
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" },
        el("button", { class: "btn pri sm", onclick: async () => {
          if (!syncUrl.value.trim()) return toast("先填写 WebDAV JSON 地址");
          if (isPotentiallyUnsafeWebDav(syncUrl.value) && !window.confirm("这个 WebDAV 地址使用明文 HTTP，账号密码可能被同网络的人看到。仍然继续上传吗？")) return;
          try {
            syncStatus.textContent = "正在上传本地快照…";
            await persistSyncProfile();
            const out = await uploadWebDav({ url: syncUrl.value, username: syncUser.value, password: syncPass.value, data: S.getState(), appVersion: info?.version || "" });
            syncStatus.textContent = `上传成功 · ${new Date(out.snapshot.exportedAt).toLocaleString("zh-CN")}`;
            toast("WebDAV 快照已上传");
          } catch (e) { syncStatus.textContent = `上传失败：${e.message || e}`; toast(`同步失败：${e.message || e}`); }
        } }, "上传本地 → WebDAV"),
        el("button", { class: "btn ghost sm", onclick: async () => {
          if (!syncUrl.value.trim()) return toast("先填写 WebDAV JSON 地址");
          if (isPotentiallyUnsafeWebDav(syncUrl.value) && !window.confirm("这个 WebDAV 地址使用明文 HTTP，账号密码可能被同网络的人看到。仍然继续下载吗？")) return;
          try {
            syncStatus.textContent = "正在读取远端快照…";
            await persistSyncProfile();
            const snap = await downloadWebDav({ url: syncUrl.value, username: syncUser.value, password: syncPass.value });
            const when = snap.exportedAt ? new Date(snap.exportedAt).toLocaleString("zh-CN") : "时间未知";
            const ok = window.confirm(`远端快照：${when}${snap.appVersion ? ` · v${snap.appVersion}` : ""}\n\n下载会用远端数据替换当前本地数据。建议先导出备份。是否继续？`);
            if (!ok) { syncStatus.textContent = "已取消覆盖本地数据"; return; }
            S.replaceAll(snap.data);
            await S.saveNow();
            syncStatus.textContent = `已从 WebDAV 恢复 · ${when}`;
            toast("远端快照已恢复到本机");
            render();
          } catch (e) { syncStatus.textContent = `下载失败：${e.message || e}`; toast(`同步失败：${e.message || e}`); }
        } }, "下载 WebDAV → 本地"),
        el("button", { class: "btn ghost sm", onclick: async () => { await persistSyncProfile(); toast("已保存 WebDAV 地址和用户名；密码不会保存"); } }, "保存地址"),
      ),
      syncStatus,
    );

    /* 全局快捷键 */
    const shortcutCfg = getShortcutConfig();
    const shortcutEnabled = el("input", { type: "checkbox", checked: shortcutCfg.enabled !== false ? true : null });
    const commandShortcut = el("input", { type: "text", value: shortcutCfg.commandPalette || DEFAULT_GLOBAL_SHORTCUTS.commandPalette, placeholder: DEFAULT_GLOBAL_SHORTCUTS.commandPalette, spellcheck: "false" });
    const captureShortcut = el("input", { type: "text", value: shortcutCfg.quickCapture || DEFAULT_GLOBAL_SHORTCUTS.quickCapture, placeholder: DEFAULT_GLOBAL_SHORTCUTS.quickCapture, spellcheck: "false" });
    const shortcutStatus = el("div", { class: "shortcut-status" });
    const paintShortcutStatus = (status = getGlobalShortcutStatus()) => {
      if (!status.supported) shortcutStatus.textContent = `${status.errors?.[0] || "当前环境不支持系统级快捷键"}；应用内 Ctrl+K 仍可用。`;
      else shortcutStatus.textContent = [...(status.registered || []).map((x) => `已注册 ${x}`), ...(status.errors || []).map((x) => `失败 ${x}`)].join(" · ") || "全局快捷键已关闭";
    };
    paintShortcutStatus();
    const shortcutCard = el("div", { class: "card set-card" },
      el("h2", {}, "全局快捷键"),
      el("p", { class: "desc" }, "桌面端即使应用不在前台也能呼出命令面板或快速捕获。应用内 Ctrl+K 始终打开全局搜索。"),
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
      el("p", { class: "desc" },
        "启动后，手机连同一 Wi-Fi，用相机扫码或浏览器打开链接，即可查看今日时间块/任务、勾选完成、快速添加——改动实时回写Le时间管理。配对令牌用于防蹭访问。"),
    );
    const lanBody = el("div", { style: "margin-top:10px" });
    lanCard.append(lanBody);

    const renderLan = () => {
      lanBody.replaceChildren();
      if (lanStatus.running) {
        lanBody.append(
          el("div", { class: "path-code" }, lanStatus.url),
          el("div", { style: "display:flex;gap:14px;margin-top:12px;align-items:center" },
            el("img", { src: `${lanStatus.url.replace("/m?", "/qr.svg?")}`, style: "width:132px;height:132px;border-radius:10px;border:1px solid var(--line);background:#fff" }),
            el("div", { style: "flex:1" },
              el("p", { class: "desc" }, "手机相机扫码 → 浏览器打开即可使用；也可把链接发到手机。"),
              el("div", { style: "display:flex;gap:8px;margin-top:10px" },
                el("button", { class: "btn ghost sm", onclick: () => { navigator.clipboard?.writeText(lanStatus.url); toast("链接已复制"); } }, "复制链接"),
                el("button", {
                  class: "btn danger sm",
                  onclick: async () => { await api.lanStop(); st.lanAuto = false; S.saveNow(); renderLan(); },
                }, "停止服务"),
              ),
            ),
          ),
        );
      } else {
        const portIn = el("input", { type: "number", value: st.lanPort, style: "width:110px;height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:#fff" });
        lanBody.append(
          el("div", { style: "display:flex;gap:8px;align-items:center;margin-top:4px" },
            el("span", { style: "font-size:12px;color:var(--ink-2)" }, "端口"),
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
            el("span", { style: "font-size:11px;color:var(--ink-2)" }, "令牌已自动生成，随链接/二维码分发"),
          ),
        );
      }
    };
    renderLan();

    /* 关于 */
    const aboutCard = createAboutCard(info, regs);

    const settingEntries = [
      { id: "ui", node: uiCard, label: "界面与交互", icon: "sliders", hint: "密度 / 字号 / 动效 / 窗口", keywords: "密度 文字 字号 动效 手势 滑动 启动页 窗口 大小 尺寸 最大化 分辨率 顶部统计 副标题" },
      { id: "theme", node: themeCard, label: "主题", icon: "palette", hint: "配色与阅读模式", keywords: "颜色 夜间 深海 樱花 松林 暮光 极简" },
      { id: "background", node: bgCard, label: "自定义背景", icon: "image", hint: "壁纸 / 遮罩 / 毛玻璃", keywords: "壁纸 图片 纯色 透明 模糊 毛玻璃 遮罩 亮度 饱和度" },
      { id: "reminders", node: reminderCard, label: "任务提醒", icon: "bell", hint: "预警时间与提示音", keywords: "提醒 预警 音量 提示音 音频 截止" },
      { id: "data", node: dataCard, label: "数据中心", icon: "database", hint: "备份 / 恢复 / 交换", keywords: "备份 恢复 JSON CSV Excel ICS 自动恢复点 导入 导出" },
      { id: "sync", node: syncCard, label: "可选同步", icon: "cloud-arrow-up", hint: "WebDAV 双向同步", keywords: "WebDAV 上传 下载 Nextcloud 坚果云" },
      { id: "ai", node: aiCard, label: "AI 与自动任务", icon: "wand-magic-sparkles", hint: "Base / API Key / 安全边界", keywords: "AI Base API Key 模型 自动任务 加密 定时" },
      { id: "shortcuts", node: shortcutCard, label: "全局快捷键", icon: "keyboard", hint: "命令面板与快速捕获", keywords: "快捷键 命令面板 快速捕获 Ctrl" },
      { id: "lan", node: lanCard, label: "局域网联动", icon: "network-wired", hint: "手机联动与二维码", keywords: "手机 WiFi 二维码 端口 配对" },
      { id: "plugins", node: plugCard, label: "插件管理", icon: "puzzle-piece", hint: "启用 / 导入 / 导出", keywords: "插件 权限 导入 ZIP 启用 停用 开发文档" },
      { id: "about", node: aboutCard, label: "关于", icon: "circle-info", hint: "版本与开源信息", keywords: "版本 更新 开源 框架" },
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
  };
  render();
}

