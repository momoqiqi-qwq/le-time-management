// 应用内自动更新：检查 → 下载 → 交给系统安装。
//
// 三条通道，各管一段（Rust 侧见 src-tauri/src/update.rs）：
//   api.updateCheck()    GitHub Releases 的 latest 与本机版本比一次
//   api.updateDownload() 流式下载，边下边从 "update:progress" 事件回报进度
//   api.updateInstall()  Windows 静默重装并自启；Android 交给系统安装器
//
// 行为约定（都是刻意的，改之前先看这段）：
// - **启动检查是「静默」的**：失败不打扰用户（离线、GitHub 限流都当没事发生）。
//   只有「真的发现了可用新版」才弹提示条。手动检查才把错误显示出来。
// - **两个开关分工明确**（都在「设置 › 关于 › 软件更新」）：
//   `autoCheck` 管「启动要不要去查」，`notify` 管「查到新的要不要在左下角弹通知」。
//   两者独立 —— 关掉 `notify` 保留 `autoCheck`，更新仍会被查到并显示在关于页，只是不主动打扰。
// - **节流 6 小时**：`settings.update.lastCheckAt` 只在成功检查后写入。
//   失败不写 → 下次启动还能再试，但也不会疯狂重试（启动本身就不频繁）。
// - **「忽略此版本」按版本号记住**：`settings.update.skipVersion`。发了更新的版本号
//   之后它自然失效（只比对相等），不需要用户回来清理。
// - **「稍后」只活本次会话**：不落盘，重启还会再提示 —— 否则用户关了提示就再也看不到更新。
// - **下载完不等于装完**：Android 上返回成功只代表「系统安装界面已拉起」，
//   用户在系统界面点取消我们是收不到信号的，所以文案一律说「已交给系统安装」。
import { api } from "./api.js";
import * as S from "./store.js";
import { el, toast, appConfirm } from "./ui.js";

/** 静默检查的最小间隔（6 小时）。 */
const CHECK_THROTTLE_MS = 6 * 60 * 60 * 1000;
/** 启动后延迟多久才去检查：让首屏渲染、插件加载先跑完，别抢带宽。 */
const STARTUP_DELAY_MS = 8000;

export const DEFAULT_UPDATE_SETTINGS = Object.freeze({
  /** 启动时是否去查一次（关掉后仍可在「关于 › 软件更新」手动检查）。 */
  autoCheck: true,
  /** 发现新版本时是否在左下角弹升级通知。关掉后只在「关于 › 软件更新」里显示状态。 */
  notify: true,
  skipVersion: "",
  lastCheckAt: 0,
});

export function getUpdateSettings() {
  const st = S.getState()?.settings;
  if (!st) return { ...DEFAULT_UPDATE_SETTINGS };
  // 与 settings 下其它子对象（autoBackup / taskReminder / ui）同一套约定：
  // 缺字段就地补默认值，不动 migrations.js —— 新增可选字段不需要数据迁移。
  st.update = { ...DEFAULT_UPDATE_SETTINGS, ...(st.update || {}) };
  // 两个开关都只认「显式 false」才算关：配置被外力写成字符串 / 数字时按开处理，
  // 宁可多提示一次，也不要让更新功能静默失效（那样用户永远发现不了新版）。
  st.update.autoCheck = st.update.autoCheck !== false;
  st.update.notify = st.update.notify !== false;
  st.update.skipVersion = typeof st.update.skipVersion === "string" ? st.update.skipVersion : "";
  st.update.lastCheckAt = Number.isFinite(Number(st.update.lastCheckAt)) ? Number(st.update.lastCheckAt) : 0;
  return st.update;
}

export function setUpdateSettings(patch) {
  const st = S.getState()?.settings;
  if (!st) return getUpdateSettings();
  st.update = { ...getUpdateSettings(), ...(patch || {}) };
  S.persistSoon();
  emit();
  return st.update;
}

/* ───────────────────────── 对外状态 ───────────────────────── */

// phase: idle | checking | uptodate | available | downloading | ready | installing | error
const state = {
  phase: "idle",
  info: null,
  progress: { received: 0, total: 0 },
  error: "",
  message: "",
  /**
   * 本次会话里**最近一次成功检查**的时刻（ms）。失败不覆盖。
   *
   * 为什么要有这个：状态回显只写「已是最新版本（vX）」时，用户没法分辨这是刚查的
   * 还是几十分钟前查的 —— 而 GitHub 的 `releases/latest` 在发版瞬间会有一段时间
   * 仍返回上一个版本（release 从创建到发布之间是草稿，草稿不计入 latest）。
   * 于是「我明明刚发了新版，客户端却说已是最新」的误会重复发生。带上时刻，
   * 用户一眼就能看出这条结果是陈旧的，再点一次即可。
   */
  checkedAt: 0,
  /** Android 的安装授权探测结果；其它平台为 null。 */
  installReady: null,
  downloadedPath: "",
};

const subscribers = new Set();

function snapshot() {
  return { ...state, progress: { ...state.progress }, available: Boolean(state.info?.has_update) };
}

function emit() {
  const value = snapshot();
  for (const fn of subscribers) {
    try { fn(value); } catch (error) { console.error("更新状态订阅回调出错", error); }
  }
}

function patchState(next) {
  Object.assign(state, next);
  emit();
}

export function getUpdateState() { return snapshot(); }

export function subscribeUpdateState(fn) {
  subscribers.add(fn);
  // 立刻先交一次当前状态。和 emit() 一样要 try/catch：订阅回调是调用方的代码，
  // 它在构建期抛错不该把 createXxx() → 设置页渲染整条链路带崩。
  try { fn(snapshot()); } catch (error) { console.error("更新状态订阅回调出错", error); }
  return () => subscribers.delete(fn);
}

export function isUpdaterSupported() {
  return Boolean(api.isTauri) && typeof api.updateCheck === "function";
}

/** 把时刻写成 `HH:MM`（不是今天则带上 `M-D`）—— 状态回显里标「这条结果是何时查的」。 */
export function formatCheckTime(ms) {
  const time = Number(ms);
  if (!Number.isFinite(time) || time <= 0) return "";
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return "";
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  return d.toDateString() === today.toDateString() ? hhmm : `${d.getMonth() + 1}-${d.getDate()} ${hhmm}`;
}

/**
 * 状态文案统一的时间戳拼接：`base · [前缀]HH:MM[ 后缀]`。
 *
 * 时刻为空（0 / 非法）时原样返回 base。所有「文案 + 检查时刻」的拼接必须走这里
 * （目前两处：`describeUpdateState` 的状态回显、设置页 idle 行的「上次自动检查」），
 * 避免各处手拼导致分隔符 / 文案顺序漂移。
 */
export function withCheckStamp(base, ms, { prefix = "", suffix = "检查" } = {}) {
  const at = formatCheckTime(ms);
  if (!at) return base;
  return `${base} · ${prefix}${at}${suffix ? ` ${suffix}` : ""}`;
}

/** 人话版的当前状态（状态回显，设置页与提示条共用）。 */
export function describeUpdateState(value = snapshot()) {
  if (!isUpdaterSupported()) return "浏览器调试模式下不检查更新";
  switch (value.phase) {
    case "checking": return "正在检查…";
    case "uptodate":
      return withCheckStamp(`已是最新版本（v${value.info?.current || "?"}）`, value.checkedAt);
    case "available":
      return withCheckStamp(`发现新版本 v${value.info?.latest}，当前 v${value.info?.current}`, value.checkedAt);
    case "downloading": {
      const { received, total } = value.progress;
      const pct = total > 0 ? Math.floor((received / total) * 100) : 0;
      return total > 0 ? `正在下载更新包 ${pct}%（${mb(received)} / ${mb(total)}）` : `正在下载更新包（${mb(received)}）`;
    }
    case "ready": return value.message || "更新包已下载，可以安装了";
    case "installing": return "已交给系统安装，应用即将关闭";
    case "error": return value.error || "更新失败";
    default:
      // idle 时 checkedAt 恒为 0（会话内还没有成功检查过），withCheckStamp 原样返回 base，
      // 与旧逻辑「『尚未检查』不带时刻」等价；一旦回显「最近检查到 vX」则必带时刻。
      return withCheckStamp(
        value.info?.latest ? `最近检查到 v${value.info.latest}` : "尚未检查",
        value.checkedAt,
      );
  }
}

function mb(bytes) {
  return `${(Number(bytes) / 1048576).toFixed(1)} MB`;
}

/* ───────────────────────── 检查 ───────────────────────── */

/**
 * 查一次最新版本。
 *
 * **不抛异常**：把结果写进状态并返回 `info`（失败时返回 `null`）。
 * 是否把错误显示给用户由调用方决定 —— 启动静默检查就该装作无事发生，
 * 手动检查才需要看到「网络不可用」。
 */
export async function checkForUpdates({ manual = false } = {}) {
  if (!isUpdaterSupported()) {
    if (manual) toast("浏览器调试模式下不支持应用内更新");
    return null;
  }
  if (state.phase === "checking" || state.phase === "downloading") return state.info;
  patchState({ phase: "checking", error: "", message: "" });
  try {
    const info = await api.updateCheck();
    // 成功拿到结果才记时刻：失败不能盖掉上一次成功的时间（否则用户会以为刚查过）。
    const checkedAt = Date.now();
    if (!info?.has_update) {
      patchState({ phase: "uptodate", info, error: "", checkedAt });
      if (manual) toast(`已是最新版本 v${info?.current || "?"}`);
      return info;
    }
    if (!info.supported) {
      // 有新版但本平台没有可自动安装的产物：说清楚原因，别让「更新」按钮点了没反应。
      patchState({ phase: "available", info, message: info.message || "当前平台暂不支持应用内更新", checkedAt });
      if (manual) toast(info.message || "当前平台暂不支持应用内更新");
      return info;
    }
    patchState({ phase: "available", info, message: "", checkedAt });
    if (manual) toast(`发现新版本 v${info.latest}`);
    return info;
  } catch (error) {
    const message = String(error?.message || error || "检查更新失败");
    // 失败时保留旧的 checkedAt：面板上「上次成功检查于 HH:MM」是判断结果新鲜度的唯一线索。
    patchState({ phase: "error", error: message });
    if (manual) toast(message);
    return null;
  }
}

/** 启动时的静默检查：节流 + 尊重开关 + 尊重「忽略此版本」。 */
export async function silentUpdateCheck() {
  if (!isUpdaterSupported()) return;
  const cfg = getUpdateSettings();
  if (!cfg.autoCheck) return;
  if (Date.now() - cfg.lastCheckAt < CHECK_THROTTLE_MS) return;

  const info = await checkForUpdates({ manual: false });
  if (!info) return;                       // 失败：静默，且不写 lastCheckAt，下次启动再试
  // 复用这次检查写入 state 的 checkedAt，而不是再取一次 Date.now()：
  // 「状态回显时间」与「节流记录时间」必须同源 —— 两次取时间会有毫秒级分叉，
  // 排查「上次自动检查」时间线时（比如对照 lastCheckAt 与面板显示的 HH:MM）就对不上了。
  setUpdateSettings({ lastCheckAt: state.checkedAt });
  if (!info.has_update || !info.supported) return;
  if (info.latest === getUpdateSettings().skipVersion) return;
  // 「有新版本时弹窗提示」关掉后：仍然照常检查、照常把状态写进 state（关于页看得到），
  // 只是不在左下角弹通知 —— 所以这一条必须放在最后，别提前 return 掉检查本身。
  if (!getUpdateSettings().notify) return;
  showUpdateToast(info);
}

/* ───────────────────────── 提示条 ───────────────────────── */

let toastNode = null;
/** 本次会话是否已经主动关掉过提示（「稍后」/× 都算）。 */
let dismissedThisSession = false;

function closeUpdateToast() {
  toastNode?.remove();
  toastNode = null;
}

function dismissForSession() {
  dismissedThisSession = true;
  closeUpdateToast();
}

/** 「立即升级」不在这里直接下载，而是把用户带到「关于 › 软件更新」—— 那里有进度、说明与安装按钮。 */
function jumpToUpdateSettings() {
  window.dispatchEvent(new CustomEvent("tide:open-settings", { detail: { section: "about" } }));
}

function showUpdateToast(info) {
  if (dismissedThisSession) return;
  closeUpdateToast();
  const node = el("div", { class: "update-toast", role: "status", "aria-live": "polite" },
    el("div", { class: "update-toast-head" },
      el("b", {}, `发现新版本 v${info.latest}`),
      el("button", {
        class: "update-toast-x", type: "button", "aria-label": "关闭", title: "关闭（本次启动不再提示）",
        onclick: dismissForSession,
      }, "×"),
    ),
    el("p", { class: "update-toast-note" }, `当前版本 v${info.current}`),
    el("div", { class: "update-toast-actions" },
      el("button", {
        class: "btn pri sm", type: "button",
        onclick: () => { closeUpdateToast(); jumpToUpdateSettings(); },
      }, "立即升级"),
      el("button", {
        class: "btn ghost sm", type: "button",
        title: `不再提示 v${info.latest}（设置 › 关于 里可恢复）`,
        onclick: () => {
          setUpdateSettings({ skipVersion: info.latest });
          dismissForSession();
          toast(`已忽略 v${info.latest}，可在「设置 › 关于 › 软件更新」恢复`);
        },
      }, "忽略此版本"),
      el("button", { class: "btn ghost sm", type: "button", onclick: dismissForSession }, "稍后"),
    ),
  );
  document.body.append(node);
  toastNode = node;
}

/* ───────────────────────── 下载与安装 ───────────────────────── */

export async function startUpdate() {
  const info = state.info;
  if (!info?.asset_url) return false;
  if (!info.supported) { toast(info.message || "当前平台暂不支持应用内更新"); return false; }
  if (state.phase === "downloading") return false;

  patchState({
    phase: "downloading",
    progress: { received: 0, total: Number(info.asset_size) || 0 },
    error: "",
    message: "",
  });
  try {
    const path = await api.updateDownload(info.asset_url, info.asset_name, Number(info.asset_size) || 0);
    patchState({ phase: "ready", downloadedPath: path, message: "" });
    // Android 要单独问一次「授权开了没」：没开的话点「安装」只会看到安装界面一闪而过。
    if (typeof api.updateReady === "function") {
      const ready = await api.updateReady().catch(() => null);
      if (ready && ready.ready === false) {
        patchState({
          installReady: ready,
          message: ready.reason || "需要先允许安装未知来源应用",
        });
      } else {
        patchState({ installReady: ready });
      }
    }
    return true;
  } catch (error) {
    patchState({ phase: "error", error: String(error?.message || error || "下载失败") });
    return false;
  }
}

/** 跳到「安装未知来源应用」授权页（仅 Android 有意义）。 */
export async function openInstallPermission() {
  if (typeof api.updateOpenInstallSettings !== "function") return false;
  try {
    await api.updateOpenInstallSettings();
    patchState({ message: "已打开授权页面，开启「允许安装未知应用」后回来继续" });
    return true;
  } catch (error) {
    toast(String(error?.message || error || "打不开授权页面"));
    return false;
  }
}

/**
 * 真正开始安装。
 *
 * Windows 上 Rust 侧启动安装器后会立刻 `app.exit(0)` —— **这个 invoke 很可能等不到
 * resolve 就随进程一起没了**，属于预期行为，所以这里不把「没有返回值」当失败。
 */
export async function installUpdate() {
  if (state.phase !== "ready" || !state.downloadedPath) return false;
  if (state.installReady && state.installReady.ready === false) {
    return openInstallPermission();
  }
  const ok = await appConfirm(
    "关闭并安装更新",
    "应用会立即关闭，安装完成后自动重新打开。请先保存正在编辑的内容。",
    { confirmText: "关闭并安装", cancelText: "稍后" },
  );
  if (!ok) return false;
  patchState({ phase: "installing", error: "" });
  try {
    await api.updateInstall(state.downloadedPath);
    return true;
  } catch (error) {
    // 能走到这里说明应用还活着 —— 那是真失败（权限被拒 / 文件被清理）。
    patchState({ phase: "error", error: String(error?.message || error || "安装失败") });
    return false;
  }
}

/** 忘记「忽略此版本」，让提示条重新出现。 */
export function clearSkippedVersion() {
  setUpdateSettings({ skipVersion: "" });
  // 「恢复提示」必须当场生效：`dismissedThisSession` 是「本次启动不再打扰」的闸门，
  // 用户主动要求恢复时还把它留着，按钮就得等到下次启动才起作用 —— 看起来像坏了。
  dismissedThisSession = false;
  // 但「有新版本时弹窗提示」是用户自己关的全局开关，恢复忽略不等于绕过它。
  if (getUpdateSettings().notify && state.info?.has_update && state.info.supported) showUpdateToast(state.info);
  toast("已恢复更新提示");
}

/* ───────────────────────── 启动挂载 ───────────────────────── */

let progressBound = false;

async function bindProgress() {
  if (progressBound || !api.isTauri) return;
  progressBound = true;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen("update:progress", (event) => {
      const payload = event.payload || {};
      // 只在下载阶段刷新，避免迟到的进度事件把「已下载完」的状态打回 downloading。
      if (state.phase !== "downloading") return;
      patchState({ progress: { received: Number(payload.received) || 0, total: Number(payload.total) || 0 } });
    });
  } catch (error) {
    console.warn("更新进度事件订阅失败（不影响下载，只是没有进度条）:", error);
  }
}

/**
 * 在 `boot()` 里调用一次。
 *
 * 刻意**延迟**且**不 await**：更新检查绝不能挡住首屏。
 */
export function initUpdateChecker() {
  if (!isUpdaterSupported()) return;
  getUpdateSettings();
  bindProgress();
  setTimeout(() => { silentUpdateCheck().catch(() => {}); }, STARTUP_DELAY_MS);
}
