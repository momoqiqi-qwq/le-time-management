// 插件宿主：加载内置插件与用户插件目录里的插件，注入受控 API
import { api } from "./api.js";
import * as S from "./store.js";
import { toast } from "./ui.js";
import { parseWhen, guessCategory, guessQuad } from "./timeParser.js";
import { BUILTIN_IDS, BUILTIN_PLUGINS } from "./pluginCatalog.js";
import { normalizeWebUrl, resolveWebUrl, parseSiteMeta, inferSiteIconName, extractNoticeLinks, detectLoginForm, formEncode } from "./webContent.js";
import { PROJECT_LINKS } from "./projectLinks.js";
import { previewSchedule } from "./scheduleConflict.js";
import { pushInbox } from "./automation.js";

const registry = new Map();   // id -> { manifest, source, enabled, error }
const eventBus = new Map();   // event -> Set<{ pluginId, fn }>
const listeners = { navChanged: new Set(), taskActionsChanged: new Set() };
const httpCache = new Map();
const HTTP_CACHE_MAX = 80;
const builtinManifestMap = new Map(BUILTIN_PLUGINS.map((p) => [p.id, p]));
const codeCache = new Map();

export const PLUGIN_PERMISSION_LABELS = {
  ui: "界面 / 视图",
  tasks: "任务读写",
  blocks: "时间块读写",
  storage: "插件本地存储",
  notify: "应用内通知",
  events: "插件事件",
  http: "网络访问",
  openUrl: "打开外部链接",
  timeParse: "时间语义解析",
  vault: "加密密钥库（保存密码 / 登录票据等敏感凭据）",
};

function isPermissionAllowed(man, pid, perm) {
  // v0.11.4：用户只需要决定“插件开 / 关”。manifest.permissions 继续作为
  // 能力声明与运行时边界，避免插件调用未声明的 API；不再提供逐项权限开关。
  return (man.permissions || []).includes(perm);
}

function requirePermission(man, pid, perm) {
  if (!isPermissionAllowed(man, pid, perm)) {
    throw new Error(`插件“${man.name || pid}”没有「${PLUGIN_PERMISSION_LABELS[perm] || perm}」权限`);
  }
}

function cachedHttpGet(url, ttlMs = 5 * 60 * 1000) {
  const key = String(url || "");
  const now = Date.now();
  const hit = httpCache.get(key);
  if (hit && now - hit.at < Math.max(0, Number(ttlMs) || 0)) return hit.promise;
  const promise = api.httpGet(key).then((res) => {
    httpCache.set(key, { at: Date.now(), promise: Promise.resolve(res) });
    if (httpCache.size > HTTP_CACHE_MAX) httpCache.delete(httpCache.keys().next().value);
    return res;
  }).catch((err) => { httpCache.delete(key); throw err; });
  httpCache.set(key, { at: now, promise });
  return promise;
}

export const pluginViews = [];       // { id, title, icon, render, pluginId }
export const taskActions = [];       // { id, label, icon, run(task), pluginId }

const yieldUi = () => new Promise((resolve) => {
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 40 });
  else setTimeout(resolve, 0);
});

export function onNavChanged(fn) { listeners.navChanged.add(fn); return () => listeners.navChanged.delete(fn); }
export function onTaskActionsChanged(fn) { listeners.taskActionsChanged.add(fn); return () => listeners.taskActionsChanged.delete(fn); }
function emitNavChanged() { listeners.navChanged.forEach((f) => f()); }


export function getRegistry() { return [...registry.values()]; }

async function loadManifest(id, source) {
  // 内置插件清单已经在构建时生成到 pluginCatalog，启动时不再重复发 manifest 请求。
  if (source === "builtin") {
    const man = builtinManifestMap.get(id);
    if (!man) throw new Error(`内置插件清单不存在：${id}`);
    return { ...man, platforms: man.platforms ? { ...man.platforms } : undefined };
  }
  const raw = await api.readPluginFile(`${id}/manifest.json`);
  return JSON.parse(raw);
}

async function loadCode(man, source) {
  const entry = man.entry || "main.js";
  const version = String(man.version || "0");
  const key = `${source}:${man.id}:${version}:${entry}`;
  if (codeCache.has(key)) return codeCache.get(key);
  const pending = (async () => {
    if (source === "builtin") {
      // 内置插件会独立升版本。入口 URL 必须带版本，否则 WebView/浏览器会长期命中
      // 旧的 main.js 强缓存，出现“清单已升级、实际仍运行旧插件”的错位。
      const url = `/plugins/${man.id}/${entry}?v=${encodeURIComponent(version)}`;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`入口拉取失败 (${res.status})`);
      return res.text();
    }
    return api.readPluginFile(`${man.id}/${entry}`);
  })();
  codeCache.set(key, pending);
  try { return await pending; }
  catch (e) { codeCache.delete(key); throw e; }
}

/* ── 注入给插件的 API ── */
function makeApi(man, source) {
  const pid = man.id;
  const ns = () => S.pluginState(pid).storage;
  return {
    id: pid,
    manifest: man,

    app: {
      links: {
        website: PROJECT_LINKS.website || "",
        repository: PROJECT_LINKS.repository,
      },
    },

    plugins: {
      list: () => BUILTIN_PLUGINS.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        author: plugin.author,
        description: plugin.description,
        icon: plugin.icon,
        platforms: plugin.platforms ? { ...plugin.platforms } : {},
      })),
    },

    storage: {
      async get(key, fallback = null) { requirePermission(man, pid, "storage"); return ns()[key] ?? fallback; },
      async set(key, value) { requirePermission(man, pid, "storage"); ns()[key] = value; S.persistSoon(); },
    },

    tasks: {
      list: () => { requirePermission(man, pid, "tasks"); return JSON.parse(JSON.stringify(S.getState().tasks)); },
      create: (patch) => { requirePermission(man, pid, "tasks"); return S.addTask(patch); },
      update: (id, patch) => { requirePermission(man, pid, "tasks"); return S.updateTask(id, patch); },
      remove: (id) => { requirePermission(man, pid, "tasks"); return S.removeTask(id); },
    },

    inbox: {
      create: (item) => { requirePermission(man, pid, "tasks"); return pushInbox({ source: man.name || pid, ...item }); },
    },

    blocks: {
      list: (date) => { requirePermission(man, pid, "blocks"); return JSON.parse(JSON.stringify(S.blocksOf(date))); },
      preview: (patch, ignoreId = null) => {
        requirePermission(man, pid, "blocks");
        const date = patch?.date || S.todayStr();
        const startMin = patch?.startMin ?? S.mmOf(patch?.start || "09:00");
        return JSON.parse(JSON.stringify(previewSchedule(S.blocksOf(date), { ...patch, startMin }, { ignoreId })));
      },
      create: (patch) => { requirePermission(man, pid, "blocks"); return S.addBlock(patch); },
      createSmart: (patch) => {
        requirePermission(man, pid, "blocks");
        const date = patch?.date || S.todayStr();
        const startMin = patch?.startMin ?? S.mmOf(patch?.start || "09:00");
        const preview = previewSchedule(S.blocksOf(date), { ...patch, startMin });
        if (preview.ok) return { block: S.addBlock(patch), moved: false, conflicts: [] };
        const alt = preview.alternatives[0];
        if (!alt) throw new Error("目标时段冲突，且当天没有足够的连续空闲时间");
        return { block: S.addBlock({ ...patch, start: alt.start }), moved: true, requestedStart: patch?.start || S.hhmmOf(startMin), conflicts: preview.conflicts };
      },
      update: (id, patch) => { requirePermission(man, pid, "blocks"); return S.updateBlock(id, patch); },
      remove: (id) => { requirePermission(man, pid, "blocks"); return S.removeBlock(id); },
    },

    ui: {
      registerView(def) {
        requirePermission(man, pid, "ui");
        pluginViews.push({ ...def, pluginId: pid });
        emitNavChanged();
      },
      registerTaskAction(def) {
        requirePermission(man, pid, "ui");
        taskActions.push({ ...def, pluginId: pid });
        listeners.taskActionsChanged.forEach((f) => f());
      },
    },

    assets: {
      async text(path) {
        requirePermission(man, pid, "ui");
        const clean = String(path || "").replace(/\\/g, "/");
        if (!clean || clean.startsWith("/") || clean.includes("..")) throw new Error("资源路径必须是插件目录内的相对路径");
        if (source === "builtin") {
          const version = encodeURIComponent(String(man.version || "0"));
          const res = await fetch(`/plugins/${pid}/${clean}?v=${version}`, { cache: "no-cache" });
          if (!res.ok) throw new Error(`资源拉取失败 (${res.status})`);
          return res.text();
        }
        return api.readPluginFile(`${pid}/${clean}`);
      },
      async json(path) { return JSON.parse(await this.text(path)); },
    },

    notify: (msg, opts) => { requirePermission(man, pid, "notify"); return toast(`${man.name}：${msg}`, opts); },
    events: {
      on(name, fn) {
        requirePermission(man, pid, "events");
        if (!eventBus.has(name)) eventBus.set(name, new Set());
        eventBus.get(name).add({ pluginId: pid, fn });
      },
      emit(name, data) {
        requirePermission(man, pid, "events");
        (eventBus.get(name) || []).forEach((entry) => { try { entry.fn(data); } catch (e) { console.error(e); } });
      },
    },

    // 网络桥：Rust 端抓取，绕开 WebView CORS；每次调用都会校验插件是否在 manifest 中声明了 http 能力。
    http: {
      get: (url) => { requirePermission(man, pid, "http"); return api.httpGet(url); },
      getCached: (url, ttlMs) => { requirePermission(man, pid, "http"); return cachedHttpGet(url, ttlMs); },
      session: () => { requirePermission(man, pid, "http"); return api.httpSessionNew(); },
      fetch: (sid, method, url, opts) => { requirePermission(man, pid, "http"); return api.httpFetch(sid, method, url, opts); },
      // Cookie 整体导出/恢复：插件把登录态存进密钥库，应用重启后恢复，免验证码续期。
      exportCookies: (sid, urls) => { requirePermission(man, pid, "http"); return api.httpSessionExport(sid, urls); },
      restoreCookies: (cookies) => { requirePermission(man, pid, "http"); return api.httpSessionRestore(cookies); },
    },

    // 加密密钥库：值只存 Rust 侧 AES-256-GCM 文件，不进 data.json / 备份 / 同步。
    vault: {
      get: (key) => { requirePermission(man, pid, "vault"); return api.pluginVaultGet(pid, key); },
      set: (key, value) => { requirePermission(man, pid, "vault"); return api.pluginVaultSet(pid, key, value); },
      del: (key) => { requirePermission(man, pid, "vault"); return api.pluginVaultDel(pid, key); },
    },

    util: {
      today: S.todayStr, addDays: S.addDays, mmOf: S.mmOf, hhmmOf: S.hhmmOf, durLabel: S.durLabel,
      openUrl: (url) => { requirePermission(man, pid, "openUrl"); return api.openExternal(url); },
      parseWhen: (...args) => { requirePermission(man, pid, "timeParse"); return parseWhen(...args); },
      guessCategory: (...args) => { requirePermission(man, pid, "timeParse"); return guessCategory(...args); },
      guessQuad: (...args) => { requirePermission(man, pid, "timeParse"); return guessQuad(...args); },
      navigate: (view) => { requirePermission(man, pid, "ui"); return window.dispatchEvent(new CustomEvent("tide:navigate", { detail: view })); },
      desEncryptHex: (plain, key) => { requirePermission(man, pid, "http"); return api.desEncryptHex(plain, key); },
      web: {
        normalizeUrl: (...args) => { requirePermission(man, pid, "http"); return normalizeWebUrl(...args); },
        resolveUrl: (...args) => { requirePermission(man, pid, "http"); return resolveWebUrl(...args); },
        parseSiteMeta: (...args) => { requirePermission(man, pid, "http"); return parseSiteMeta(...args); },
        inferIconName: (...args) => { requirePermission(man, pid, "http"); return inferSiteIconName(...args); },
        extractNoticeLinks: (...args) => { requirePermission(man, pid, "http"); return extractNoticeLinks(...args); },
        detectLoginForm: (...args) => { requirePermission(man, pid, "http"); return detectLoginForm(...args); },
        formEncode: (...args) => { requirePermission(man, pid, "http"); return formEncode(...args); },
      },
    },
  };
}

function removeRegistrations(id) {
  for (let i = pluginViews.length - 1; i >= 0; i--) if (pluginViews[i].pluginId === id) pluginViews.splice(i, 1);
  for (let i = taskActions.length - 1; i >= 0; i--) if (taskActions[i].pluginId === id) taskActions.splice(i, 1);
  for (const [name, set] of eventBus) {
    for (const entry of [...set]) if (entry.pluginId === id) set.delete(entry);
    if (!set.size) eventBus.delete(name);
  }
  listeners.taskActionsChanged.forEach((f) => f());
}

async function runPlugin(id, source) {
  const rec = registry.get(id);
  try {
    rec.error = null;
    rec.loaded = false;
    removeRegistrations(id);
    const code = await loadCode(rec.manifest, source);
    // 受控沙箱：插件只拿到 tide API，拿不到全局 window
    new Function("tide", `"use strict";\n${code}`)(makeApi(rec.manifest, source));
    rec.loaded = true;
  } catch (e) {
    rec.error = String(e && e.message || e);
    console.error(`插件 ${id} 加载失败:`, e);
  }
}

export async function initPluginHost() {
  const sources = [
    ...BUILTIN_IDS.map((id) => ({ id, source: "builtin" })),
    ...(await api.listPlugins().catch(() => [])).map((p) => ({ id: p.id, source: "external" })),
  ];
  const fresh = sources.filter(({ id }) => !registry.has(id));
  const records = await Promise.all(fresh.map(async ({ id, source }) => {
    const rec = { id, source, manifest: null, enabled: true, error: null, loaded: false, code: null };
    registry.set(id, rec);
    try {
      rec.manifest = await loadManifest(id, source);
      rec.manifest.id = rec.manifest.id || id;
      S.pluginState(id);
      if (S.pluginState(id).enabled !== false) rec.code = await loadCode(rec.manifest, source);
    } catch (e) {
      rec.error = String(e && e.message || e);
    }
    return rec;
  }));

  // 清单和入口文件并行读取；插件执行之间主动让出主线程，避免大插件连续解析造成首屏卡顿。
  for (const rec of records) {
    if (!rec.manifest || rec.error || S.pluginState(rec.id).enabled === false) continue;
    await yieldUi();
    try {
      removeRegistrations(rec.id);
      new Function("tide", `"use strict";\n${rec.code}`)(makeApi(rec.manifest, rec.source));
      rec.loaded = true;
      rec.code = null;
    } catch (e) {
      rec.error = String(e && e.message || e);
      console.error(`插件 ${rec.id} 加载失败:`, e);
    }
  }
  emitNavChanged();
}

export async function setEnabled(id, on) {
  S.setPluginEnabled(id, on);
  const rec = registry.get(id);
  if (!rec) return;
  rec.enabled = on;
  if (on) await runPlugin(id, rec.source);
  if (!on) {
    // 从导航、任务动作、事件订阅里摘掉该插件注册的内容
    removeRegistrations(id);
    rec.loaded = false;
  }
  emitNavChanged();
}

export async function removeExternalPlugin(id) {
  const rec = registry.get(id);
  if (!rec) throw new Error("插件不存在");
  if (rec.source === "builtin") throw new Error("内置插件不能删除，可停用");
  await setEnabled(id, false);
  await api.deletePlugin(id);
  S.removePluginState(id);
  registry.delete(id);
  emitNavChanged();
}

// 清空注册表后重新发现并加载插件（设置页「重新扫描」用）
export async function rescan() {
  pluginViews.length = 0;
  taskActions.length = 0;
  registry.clear();
  await initPluginHost();
}

export function emitLocal(name, data) {
  (eventBus.get(name) || []).forEach((entry) => { try { entry.fn(data); } catch (e) { console.error(e); } });
}
