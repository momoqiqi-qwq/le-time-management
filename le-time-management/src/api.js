// Tauri 命令封装 —— 在纯浏览器里跑时自动降级到 localStorage（便于前端独立调试）
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke(cmd, args = {}) {
  if (!isTauri) throw new Error(`命令 ${cmd} 仅在 Tauri 环境可用`);
  return window.__TAURI_INTERNALS__.invoke(cmd, args);
}

async function cppuBridge(op, args) {
  const response = await fetch(`/__cppu/${op}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(args)});
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "本地警大网络桥不可用");
  return data.result;
}

const LS_KEY = "tidebalance-data";

export const api = {
  isTauri,
  nativeSchedule: (action, bounds) => invoke("native_schedule", { action, bounds }),

  async loadData() {
    if (isTauri) return invoke("load_data");
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
    throw new Error("no data");
  },

  async saveData(data) {
    if (isTauri) return invoke("save_data", { data });
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  },

  async listPlugins() {
    if (!isTauri) return [];
    return invoke("list_plugins");
  },

  async readPluginFile(relPath) {
    return invoke("read_plugin_file", { relPath });
  },

  async deletePlugin(id) {
    if (!isTauri) throw new Error("插件删除仅在 Tauri 环境可用");
    return invoke("delete_plugin", { id });
  },

  async importPluginZip(bytes) {
    if (!isTauri) throw new Error("插件导入仅在 Tauri 环境可用");
    return invoke("import_plugin_zip", { bytes });
  },

  async exportPluginsZip(ids) {
    if (!isTauri) throw new Error("插件导出仅在 Tauri 环境可用");
    return invoke("export_plugins_zip", { ids });
  },

  async appInfo() {
    if (!isTauri) return { version: "web-dev", os: "browser", arch: navigator.platform || "web", dataDir: "localStorage（浏览器调试模式）" };
    return invoke("app_info");
  },

  // 插件网络桥：Tauri 端由 Rust 发请求（绕开 CORS），浏览器端直接 fetch
  async httpGet(url) {
    if (isTauri) return invoke("http_get", { url });
    const r = await fetch(url);
    return { status: r.status, body: await r.text(), finalUrl: r.url, contentType: r.headers.get("content-type") || "" };
  },

  async openExternal(url) {
    if (isTauri) return invoke("open_external", { url });
    window.open(url, "_blank");
  },

  async schoolImportOpen(url, adapterScript, title) {
    if (isTauri) return invoke("school_import_open", { url, adapterScript, title });
    window.open(url, "_blank");
    throw new Error("在线教务脚本导入需要在 Le 时间管理客户端中使用");
  },

  async schoolImportListen(handler) {
    if (!isTauri) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen("school-import-message", (event) => handler(event.payload));
  },

  // 会话化 HTTP：Tauri 端带 Cookie Jar（登录态跨请求保持）；浏览器端用 include 凭据
  async httpSessionNew() {
    if (isTauri) return invoke("http_session_new");
    return "browser-" + crypto.randomUUID();
  },

  async httpFetch(sid, method, url, opts = {}) {
    if (isTauri) {
      return invoke("http_fetch", {
        sid, method, url,
        headers: opts.headers || null,
        body: opts.body || null,
        binary: opts.binary || null,
        followRedirects: opts.followRedirects ?? null,
      });
    }
    if (import.meta.env.DEV && /^https:\/\/(sso|sso-jw|portal-jw)\.cppu\.edu\.cn(?:\/|$)/.test(url)) {
      api._cppuSessions ||= new Map();
      if (!api._cppuSessions.has(sid)) api._cppuSessions.set(sid, cppuBridge("session", {}));
      const cppuSid = await api._cppuSessions.get(sid);
      return cppuBridge("fetch", { sid: cppuSid, method, url, ...opts });
    }
    const r = await fetch(url, {
      method, headers: opts.headers, body: opts.body, credentials: "include",
      redirect: opts.followRedirects === false ? "manual" : "follow",
    });
    const body = opts.binary ? btoa(String.fromCharCode(...new Uint8Array(await r.arrayBuffer())))
      : await r.text();
    return {
      status: r.status, body, finalUrl: r.url,
      contentType: r.headers.get("content-type") || "",
      location: r.headers.get("location") || "", cookies: [],
    };
  },

  async desEncryptHex(plain, key) {
    if (isTauri) return invoke("des_ecb_encrypt_hex", { plain, key });
    throw new Error("DES 加密仅支持在 Tauri 环境使用");
  },

  // 会话 Cookie 导出/恢复：让插件登录态跨应用重启（免验证码续期）
  async httpSessionExport(sid, urls) {
    if (!isTauri) return [];
    return invoke("http_session_export", { sid, urls });
  },
  async httpSessionRestore(cookies) {
    if (!isTauri) return api.httpSessionNew();
    return invoke("http_session_restore", { cookies });
  },

  // 插件密钥库：密码、会话票据等敏感数据保存在 Rust 侧 AES-256-GCM 加密文件，
  // 不进入 data.json / 普通备份。浏览器调试环境降级为 null（功能不可用但不崩）。
  async pluginVaultSet(pluginId, key, value) {
    if (!isTauri) throw new Error("插件密钥库仅在 Tauri 应用中可用");
    return invoke("plugin_vault_set", { pluginId, key, value });
  },
  async pluginVaultGet(pluginId, key) {
    if (!isTauri) return null;
    return invoke("plugin_vault_get", { pluginId, key });
  },
  async pluginVaultDel(pluginId, key) {
    if (!isTauri) return;
    return invoke("plugin_vault_del", { pluginId, key });
  },

  // 局域网联动服务
  async lanStart(port, token) {
    if (!isTauri) throw new Error("仅 Tauri 环境可用");
    return invoke("lan_start", { port, token });
  },
  async lanStop() {
    if (isTauri) return invoke("lan_stop");
  },
  async lanStatus() {
    if (!isTauri) return { running: false };
    return invoke("lan_status");
  },

  // AI 凭据只保存在 Rust 侧加密保险箱；不会进入 data.json / 普通备份。
  async aiVaultStatus() {
    if (!isTauri) return { configured: false, baseUrl: "", model: "", keyMasked: "" };
    return invoke("ai_vault_status");
  },
  async aiVaultSave(baseUrl, apiKey, model) {
    if (!isTauri) throw new Error("AI 加密凭据仅在 Tauri 应用中可用");
    return invoke("ai_vault_save", { baseUrl, apiKey, model });
  },
  async aiVaultClear() {
    if (!isTauri) return;
    return invoke("ai_vault_clear");
  },
  async aiChat(messages, temperature = 0.2) {
    if (!isTauri) throw new Error("AI 请求仅在 Tauri 应用中可用");
    return invoke("ai_chat", { messages, temperature });
  },
};
