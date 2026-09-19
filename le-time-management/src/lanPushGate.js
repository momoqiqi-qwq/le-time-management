/**
 * 电脑端的回传确认门。
 *
 * 手机把整份数据 POST 到局域网服务时，Rust 侧一个字都不往数据文件里写，只把它放进
 * 内存里的一次性暂存槽并广播这个事件（原因见 src-tauri/src/lan.rs 顶部）。
 * 要不要用，在这里由人决定 —— 所以这一层有三个不能省的规矩：
 *   ① 先讲清「手机上有多少 / 本机现在有多少」再问，让人有条件判断而不是条件反射点确认；
 *   ② 覆盖之前必须先落一个恢复点，点错了能从 设置 → 数据中心 退回去；
 *   ③ 本机自己的联动凭据不能被手机那份换掉 —— 正在跑的服务用的是电脑这个 token，
 *      被换掉之后下次自启动会用手机的码，发出去的二维码和配对链接会一起错位。
 *
 * 弹窗必须挂在全局而不是设置页里：推送随时可能来，那时候用户多半没开着设置页。
 */
import { api } from "./api.js";
import * as S from "./store.js";
import { appConfirm, toast } from "./ui.js";
import { parseSnapshot } from "./syncLayer.js";
import { createAutoBackup } from "./dataCenter.js";
import { LAN_PUSH_WAIT_MS } from "./lanSync.js";

/** 电脑比手机多等 8 秒：让手机先报「电脑上没人确认」，这边的窗再自己关掉。 */
export const GATE_TIMEOUT_MS = LAN_PUSH_WAIT_MS + 8000;

/** 本机这几项属于「这台机器自己的身份」，回传覆盖数据时原样留着。 */
const LOCAL_ONLY_SETTINGS = ["lanToken", "lanPort", "lanAuto", "sync"];

function keepLocalCredentials(incoming, localSettings) {
  const settings = { ...(incoming.settings || {}) };
  for (const key of LOCAL_ONLY_SETTINGS) {
    if (key in localSettings) settings[key] = localSettings[key];
  }
  return { ...incoming, settings };
}

/**
 * 处理一次推送。串行跑：连着来两条时，前一条的窗还开着就先把人挡在后面一条之外，
 * 而后一条在 Rust 那边已经把暂存槽顶掉了 —— 并发弹窗会点到一个已经不作数的编号。
 */
let chain = Promise.resolve();

async function handleIncoming(meta, appVersion) {
  const id = String(meta?.id || "");
  if (!id) return;
  const before = S.getState();
  const local = before.settings || {};
  const when = meta.exportedAt ? new Date(meta.exportedAt).toLocaleString("zh-CN") : "时间未知";
  const from = meta.appVersion ? ` · 手机端 v${meta.appVersion}` : "";
  const until = Date.now() + GATE_TIMEOUT_MS;
  const answer = await appConfirm(
    "手机要把数据推回本机",
    `手机上是 ${Number(meta.tasks) || 0} 条任务、${Number(meta.blocks) || 0} 个时间块（导出于 ${when}${from}）。\n`
    + `本机现在是 ${before.tasks?.length ?? 0} 条任务、${before.blocks?.length ?? 0} 个时间块。\n\n`
    + "接收 = 用手机上那份整份换掉本机这份。换之前会自动存一个恢复点，退回去的路在 设置 → 数据中心。",
    { confirmText: "接收并覆盖本机", cancelText: "拒绝", danger: true, timeoutMs: GATE_TIMEOUT_MS, timeoutNote: "没人操作" },
  );
  if (!answer) {
    // 「没人操作到点自动取消」和「真有人点了拒绝」必须分开报：手机上看到「电脑上点了拒绝」
    // 而家里其实没人碰过电脑，只会以为自己在被谁动数据。
    const expired = Date.now() > until - 2000;
    await api.lanPushResolve(id, false, expired ? "电脑上没人确认，自动取消了" : "电脑上点了「拒绝」").catch(() => {});
    toast(expired ? "没人在电脑上确认，这次回传已作废" : "已拒绝这次回传，电脑上那份没动");
    return;
  }
  try {
    // take 只认还没被处理过的那条：人磨蹭到被新推送顶掉，这里就会拿不到并停下来，
    // 而不是把「手机上那一份」换成别的东西盖到本机上。
    const snap = parseSnapshot(await api.lanPushTake(id));
    createAutoBackup("局域网回传前", appVersion);
    S.replaceAll(keepLocalCredentials(snap.data, local));
    await S.saveNow();
    await api.lanPushResolve(id, true, "");
    toast(`已接收手机推来的 ${snap.data?.tasks?.length ?? 0} 条任务`);
  } catch (e) {
    await api.lanPushResolve(id, false, `电脑上没能导入：${e.message || e}`).catch(() => {});
    toast(`没能接收：${e.message || e}`);
  }
}

export function initLanPushGate(appVersion = "") {
  import("@tauri-apps/api/event")
    .then(({ listen }) => listen("lan-push-incoming", (event) => {
      const meta = event.payload || {};
      chain = chain.then(() => handleIncoming(meta, appVersion)).catch((e) => console.error("回传处理出错", e));
    }))
    .catch((e) => console.warn("回传确认门没挂上:", e));
}
