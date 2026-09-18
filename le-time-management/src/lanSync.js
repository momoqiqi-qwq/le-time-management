/**
 * 局域网直连（v0.63.0）：**单向**从电脑拉一份数据到本机。
 *
 * 为什么只有拉、没有推：电脑端的联动服务对数据只读（见 src-tauri/src/lan.rs 顶部注释）。
 * 手机 → 电脑的推送一旦开出来，同网段里任何拿到配对码的人都能整台覆盖电脑的数据，
 * 而这个场景下电脑往往是唯一有完整备份的那一端。
 *
 * 为什么手机端不建服务：手机在 Wi-Fi 客户端模式下常被 AP 隔离挡住入站连接，
 * 且切后台就被系统冻结 —— 让手机当服务端会做成一个"时好时坏"的功能，比没有更糟。
 */
import { api } from "./api.js";
import { parseSnapshot } from "./syncLayer.js";

/** 与设置页「局域网联动」的默认端口保持一致（st.lanPort ??= 27123）。 */
export const DEFAULT_LAN_PORT = 27123;

/**
 * 把用户手里那串东西认出来。它可能是：
 *   电脑「局域网联动」卡里复制的整条链接 http://192.168.1.5:27123/m?token=ab12
 *   只有地址 192.168.1.5、192.168.1.5:27123、http://192.168.1.5:27123
 *   地址后面空一格跟配对码
 * 小白只会粘一样东西进来，所以这几种都得吃下。
 */
export function parseLanTarget(raw, tokenExtra = "") {
  const text = String(raw || "").trim();
  if (!text) throw new Error("先把电脑上的地址或配对链接贴进来");
  let base = "";
  let token = String(tokenExtra || "").trim();

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let url;
    try { url = new URL(text); } catch { throw new Error("这个链接读不出来，确认是从电脑上「复制链接」得来的"); }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("只支持 http:// 开头的局域网地址");
    base = url.origin;
    const q = url.searchParams.get("token");
    if (q) token = q;
  } else {
    const parts = text.split(/[\s,]+/);
    let host = parts[0].replace(/\/+$/, "");
    if (/^\d+$/.test(host.replace(/:/g, ""))) {
      // 只写了端口或纯数字，多半是漏了 IP
      throw new Error("地址要写成 192.168.1.5 这种形式（电脑「局域网联动」卡上有完整链接，复制过来最省事）");
    }
    if (!host.includes(":")) host = `${host}:${DEFAULT_LAN_PORT}`;
    base = `http://${host}`;
    if (!token && parts[1]) token = parts[1];
  }
  if (!token) throw new Error("少了配对码。在电脑上点「复制链接」会带上配对码，或者手填到下面那一栏");
  return { base, token };
}

function lanUrl({ base, token }, path) {
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

async function lanFetch(target, path) {
  const sid = await api.httpSessionNew();
  const res = await api.httpFetch(sid, "GET", lanUrl(target, path), { headers: { Accept: "application/json" } });
  if (res.status === 403) throw new Error("配对码不对。到电脑的设置 → 局域网联动 里重新「复制链接」再粘一次");
  if (res.status === 404) throw new Error("连上了但那台电脑没在跑本程序，或者端口写错了（默认 27123）");
  if (res.status < 200 || res.status >= 300) throw new Error(`电脑端返回 HTTP ${res.status}`);
  return res.body;
}

/** 先探一眼：电脑上是几条任务、什么时候存的。拉之前让人心里有底。 */
export async function lanInfo(target) {
  const body = await lanFetch(target, "/api/info");
  let info;
  try { info = JSON.parse(body); } catch { throw new Error("对面不像是 Le时间管理（返回的不是 JSON）。确认电脑上开着本程序且已启动联动服务"); }
  if (!info?.ok) throw new Error("电脑端没应答，确认「局域网联动」服务是启动状态");
  if (info.dataOk === false) throw new Error("电脑上的数据文件读不出来，先在那台电脑上打开一次本程序再试");
  return {
    ...info,
    savedAt: info.savedAtEpoch ? new Date(info.savedAtEpoch * 1000).toISOString() : "",
  };
}

/** 取电脑上的整份数据。服务端读的是 data.json，所以电脑端刚改完的 ≤1 秒内可能还差一点。 */
export async function lanPullSnapshot(target) {
  return parseSnapshot(await lanFetch(target, "/api/state"));
}

/** 概况文案，给引导卡的结果区用。 */
export function describeLanInfo(info) {
  const when = info.savedAt ? new Date(info.savedAt).toLocaleString("zh-CN") : "时间未知";
  const ver = info.appVersion ? ` · 电脑上是 v${info.appVersion}` : "";
  return `电脑上有 ${info.tasks} 条任务、${info.blocks} 个时间块，存于 ${when}${ver}`;
}
