// 可选同步层 v1：本地数据仍是事实源；WebDAV 只是显式推送/拉取的远端快照。
// 不保存密码，不引入账号体系，也不会后台自动上传。
import { api } from "./api.js";

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function normalizeWebDavUrl(raw) {
  const url = new URL(String(raw || "").trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("WebDAV 地址只支持 http/https");
  return url.toString();
}

function authHeaders(username, password) {
  const headers = { Accept: "application/json" };
  if (username || password) headers.Authorization = `Basic ${utf8Base64(`${username || ""}:${password || ""}`)}`;
  return headers;
}

export function makeSnapshot(data, appVersion = "") {
  return {
    format: "le-time-management-sync",
    schema: 1,
    appVersion: String(appVersion || ""),
    exportedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(data)),
  };
}

export function parseSnapshot(raw) {
  let obj;
  try { obj = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { throw new Error("远端文件不是有效 JSON"); }
  if (obj?.format === "le-time-management-sync" && obj?.data) return obj;
  // 兼容旧版直接上传 data.json 的情况。
  if (obj && Array.isArray(obj.tasks) && Array.isArray(obj.blocks)) {
    return { format: "legacy-data-json", schema: 0, exportedAt: null, appVersion: "", data: obj };
  }
  throw new Error("远端文件不是 Le时间管理 可识别的同步快照");
}

export async function uploadWebDav({ url, username, password, data, appVersion }) {
  const target = normalizeWebDavUrl(url);
  const sid = await api.httpSessionNew();
  const snapshot = makeSnapshot(data, appVersion);
  const res = await api.httpFetch(sid, "PUT", target, {
    headers: { ...authHeaders(username, password), "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(snapshot, null, 2),
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`WebDAV 上传失败（HTTP ${res.status}）`);
  return { status: res.status, snapshot };
}

export async function downloadWebDav({ url, username, password }) {
  const target = normalizeWebDavUrl(url);
  const sid = await api.httpSessionNew();
  const res = await api.httpFetch(sid, "GET", target, { headers: authHeaders(username, password) });
  if (res.status < 200 || res.status >= 300) throw new Error(`WebDAV 下载失败（HTTP ${res.status}）`);
  return parseSnapshot(res.body);
}

export function isPotentiallyUnsafeWebDav(raw) {
  try {
    const url = new URL(String(raw || "").trim());
    return url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch { return false; }
}
