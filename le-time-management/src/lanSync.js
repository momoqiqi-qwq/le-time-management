/**
 * 局域网直连（v0.63.0 起单向拉取；本版补上受确认门的回传）。
 *
 * 拉：手机 → 电脑只是问两句话（/api/info、/api/state），电脑端一个字都不改。
 * 推：手机 → 电脑的整份覆盖走 /api/push，但电脑端要过三道门才算数 ——
 *     设置里「允许手机推回本机」默认关、每次弹确认、落盘前先存恢复点。
 *     之所以能开这条路，就是因为这三道门；把任何一道拿掉，同网段拿到配对码的人
 *     就能整台覆盖电脑数据，而电脑往往是唯一有完整备份的那一端。
 *
 * 为什么手机端不建服务：手机在 Wi-Fi 客户端模式下常被 AP 隔离挡住入站连接，
 * 且切后台就被系统冻结 —— 让手机当服务端会做成一个"时好时坏"的功能，比没有更糟。
 * 所以两个方向都是「手机主动发请求、电脑应答」。
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

function lanUrl({ base, token }, path, params = {}) {
  return `${base}${path}?${new URLSearchParams({ token, ...params })}`;
}

async function lanRequest(target, path, { method = "GET", params = {}, body, headers } = {}) {
  const sid = await api.httpSessionNew();
  return api.httpFetch(sid, method, lanUrl(target, path, params), {
    headers: { Accept: "application/json", ...headers },
    body,
  });
}

async function lanFetch(target, path, params = {}) {
  const res = await lanRequest(target, path, { params });
  if (res.status === 403) throw new Error("配对码不对。到电脑的设置 → 局域网联动 里重新「复制链接」再粘一次");
  if (res.status === 404) throw new Error("连上了但那台电脑没在跑本程序，或者端口写错了（默认 27123）");
  if (res.status < 200 || res.status >= 300) throw new Error(`电脑端返回 HTTP ${res.status}`);
  return res.body;
}

/** 先探一眼：电脑上是几条任务、什么时候存的。拉之前让人心里有底。 */
export async function lanInfo(target) {
  const body = await lanFetch(target, "/api/info");
  let info;
  try { info = JSON.parse(body); } catch { throw new Error("对面不像是 U-Time（返回的不是 JSON）。确认电脑上开着本程序且已启动联动服务"); }
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

/* ── 回传（手机 → 电脑）：两段式，必须等电脑端点「接收」 ── */

/** 轮询节奏。电脑端是人在点，慢无所谓，1.2s 一次不吵到那条单线程服务。 */
export const LAN_PUSH_POLL_MS = 1200;
/** 电脑上没人确认就放弃。让手机永远转圈比说清「没确认」更糟。 */
export const LAN_PUSH_WAIT_MS = 120 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 把本机整份快照推到电脑。
 * POST 只换来一个 pending 编号，真正生效要等电脑端弹窗里点「接收」，所以这里轮询到终端态才返回。
 * onStage 用来把「发过去了 / 等确认」回显到界面上，别让人以为按钮没反应。
 */
export async function lanPushSnapshot(target, snapshot, {
  onStage, pollMs = LAN_PUSH_POLL_MS, waitMs = LAN_PUSH_WAIT_MS,
} = {}) {
  onStage?.("正在把本机数据发到电脑…");
  const res = await lanRequest(target, "/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(snapshot),
  });
  let ack = null; try { ack = JSON.parse(res.body); } catch { /* 对面不是本程序时拿到的是 HTML，按 HTTP 码报错 */ }
  if (res.status === 403) throw new Error(ack?.error || "电脑端拒收：配对码不对，或者没开「允许手机推回本机」");
  if (res.status === 404) throw new Error("电脑端不收回传（那边的本程序版本太旧）。先在电脑上升级再推");
  if (res.status < 200 || res.status >= 300 || !ack?.ok) throw new Error(ack?.error || `电脑端返回 HTTP ${res.status}`);
  if (ack.status !== "pending" || !ack.id) throw new Error("电脑端没给出待确认编号，这次推送没进去");

  const until = Date.now() + waitMs;
  let waiting = false;
  while (Date.now() < until) {
    await sleep(pollMs);
    const body = await lanFetch(target, "/api/push-status", { id: ack.id });
    let st = null; try { st = JSON.parse(body); } catch { throw new Error("电脑端没答上这次推送的状态，确认那边程序还开着再推一次"); }
    if (st.status === "pending") {
      if (!waiting) { waiting = true; onStage?.("已发到电脑，等电脑上点「接收」…"); }
      continue;
    }
    if (st.status === "accepted") { onStage?.("电脑端已接收"); return { status: "accepted", id: ack.id }; }
    throw new Error(st.note ? `电脑端没接收：${st.note}` : "电脑端点了「拒绝」，电脑上那份没动");
  }
  throw new Error(`等满 ${Math.round(waitMs / 1000)} 秒电脑上没人确认，这次推送作废（电脑上那份没动）`);
}
