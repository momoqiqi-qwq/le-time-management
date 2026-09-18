/**
 * 「可选同步」引导卡。
 *
 * 拆成独立模块的原因和 ai.js / appearance.js 一样：设置主文件已经太长。
 * 但这一张卡另有历史包袱 —— 它原先只是三个输入框加两个按钮，默认「用户已经知道
 * WebDAV 是什么、坚果云的应用密码去哪拿」。现在改成 ①选网盘 ②填账号 ③一键配好
 * 三段引导，把小白会卡死的三处补齐：根地址长什么样、应用密码在哪生成、
 * 目录不存在时 PUT 会拿 409（这一步直接交给 MKCOL 自动建）。
 *
 * 密码只进 Rust 侧密钥库，绝不写进 data.json —— 否则密码会跟着快照一起同步到网盘上。
 */
import { api } from "../../api.js";
import * as S from "../../store.js";
import { el, toast } from "../../ui.js";
import { toggleSwitch } from "../../switchControl.js";
import {
  WEBDAV_PRESETS, DEFAULT_SYNC_FILE_NAME, getPreset,
  buildDavUrl, migrateLegacyUrl,
  ensureWebDavFolder, testWebDavConnection,
  describeSyncError,
  saveStoredSyncPassword, loadStoredSyncPassword, clearStoredSyncPassword,
  uploadWebDav, downloadWebDav, isPotentiallyUnsafeWebDav,
} from "../../syncLayer.js";

export async function createSyncCard({ rerender = () => {}, appVersion = "" } = {}) {
  const settings = S.getState().settings;
  settings.sync ??= {};
  const cfg = settings.sync.webdav ??= {};
  migrateLegacyUrl(cfg);

  // 卡片是每次打开设置重建一张，preset 必须留在闭包里；提到模块级会让两张卡互相串状态。
  let preset = getPreset(cfg.presetId || "jianguoyun");
  let hasStoredPassword = Boolean(await loadStoredSyncPassword());

  const stateChip = el("span", { class: "ai-vault-state" });

  /* ── ① 选网盘 ── */
  const presetChips = el("div", { class: "sync-presets" });
  const rootInput = el("input", { type: "url", placeholder: "https://…/dav", autocomplete: "off", spellcheck: "false" });
  const folderInput = el("input", { type: "text", placeholder: "Le时间管理", autocomplete: "off", spellcheck: "false" });
  const userInput = el("input", { type: "text", autocomplete: "username", spellcheck: "false" });
  const passInput = el("input", { type: "password", autocomplete: "new-password", spellcheck: "false" });
  const remember = toggleSwitch({ checked: cfg.remember !== false, ariaLabel: "在本机记住应用密码" });
  const result = el("div", { class: "shortcut-status sync-result" });

  rootInput.value = cfg.root || preset.root || "";
  folderInput.value = cfg.folder ?? preset.folder;
  userInput.value = cfg.username || "";
  userInput.placeholder = preset.accountPlaceholder;
  passInput.placeholder = passwordPlaceholder();
  rootInput.readOnly = !preset.rootEditable;

  function passwordPlaceholder() {
    return hasStoredPassword ? "已加密保存，留空即沿用" : preset.passwordPlaceholder;
  }

  /* ── ② 应用密码获取指引（每个预设自带自己的文案）── */
  const howtoList = el("ol", { class: "sync-howto" });
  const howtoNote = el("p", { class: "sync-howto-note" });
  const howtoToggle = el("button", { class: "btn ghost sm", type: "button" });
  let howtoOpen = false;
  howtoToggle.addEventListener("click", () => { howtoOpen = !howtoOpen; paintPresetTexts(); });

  const helpLink = el("button", {
    class: "btn ghost sm", type: "button",
    onclick: () => { api.openExternal(preset.helpUrl).catch(() => window.open(preset.helpUrl, "_blank")); },
  });
  const passRow = el("div", { class: "sync-pass-row" }, passInput, helpLink, howtoToggle);
  const accountLabel = el("span", {});
  const passwordLabel = el("span", {});

  /** 换预设要一起换掉的文案：字段名、后台入口、分步说明。分散在四处，收在一个函数里刷。 */
  function paintPresetTexts() {
    helpLink.textContent = preset.helpLinkText || "打开后台";
    helpLink.style.display = preset.helpUrl ? "" : "none";
    accountLabel.textContent = preset.accountLabel;
    passwordLabel.textContent = preset.passwordLabel;
    howtoList.replaceChildren(...(preset.howto || []).map((line) => el("li", {}, line)));
    howtoList.style.display = howtoOpen ? "" : "none";
    howtoToggle.style.display = (preset.howto || []).length ? "" : "none";
    howtoToggle.textContent = howtoOpen ? "收起说明" : "怎么填这一栏？";
    howtoNote.textContent = preset.howtoNote || "";
    howtoNote.style.display = preset.howtoNote ? "" : "none";
    paintStepNote();
  }

  /* ── 三段步骤壳 ── */
  const step1 = el("div", { class: "sync-step" },
    el("div", { class: "sync-step-head" }, el("i", { class: "sync-step-badge" }, "1"), el("b", {}, "选一个网盘")),
    el("p", { class: "sync-step-note" }, "不知道选哪个就点「坚果云」：国内能直连，免费版就够用。"),
    el("div", { class: "sync-step-body" }, presetChips),
  );
  const step2Note = el("p", { class: "sync-step-note" });
  const paintStepNote = () => {
    step2Note.textContent = preset.id === "jianguoyun"
      ? "文件夹不用先去网盘里手动建，下一步会自动创建。密码那一栏必须你自己去坚果云网页生成 —— 程序没法代你登录。"
      : "根地址填到能列出文件的那一层，不要带文件名。";
  };
  const step2 = el("div", { class: "sync-step" },
    el("div", { class: "sync-step-head" }, el("i", { class: "sync-step-badge" }, "2"), el("b", {}, "填上账号和密码")),
    step2Note,
    el("div", { class: "sync-step-body sync-form" },
      el("label", { class: "sync-field" }, el("span", {}, "网盘根地址"), rootInput),
      el("label", { class: "sync-field" }, el("span", {}, "文件夹名"), folderInput),
      el("label", { class: "sync-field" }, accountLabel, userInput),
      el("label", { class: "sync-field" }, passwordLabel, passRow),
      el("div", { class: "sync-remember-row" },
        el("span", {}, "记住密码"),
        el("div", { class: "sync-remember-hint" }, "加密存在本机，不会跟着快照上传到网盘"), remember),
      howtoNote, howtoList,
    ),
  );
  const runBtn = el("button", { class: "btn pri sync-run", type: "button" });
  const step3 = el("div", { class: "sync-step" },
    el("div", { class: "sync-step-head" }, el("i", { class: "sync-step-badge" }, "3"), el("b", {}, "一键配好")),
    el("div", { class: "sync-step-body" },
      runBtn,
      el("p", { class: "desc sync-run-note" }, "点一下就按顺序走完：核对账号 → 在网盘里建好文件夹 → 把当前数据传成第一份快照。全程只碰这一个文件，不会动你网盘里的别的东西。"),
      result,
    ),
  );
  const steps = [step1, step2, step3];

  /* ── 配好之后的日常操作 ── */
  const dailyBtns = el("div", { class: "data-actions" });
  const dailyCard = el("div", { class: "sync-daily" },
    el("div", { class: "data-section-title" }, "配好了，以后怎么同步"),
    dailyBtns,
    el("p", { class: "desc" }, "换到另一台设备（比如手机上的 APK）：装好本程序，回到这一页选同一个网盘、填同样的账号和应用密码，点「从网盘拉回本地」。"),
  );

  const card = el("div", { class: "card set-card sync-card" },
    el("div", { class: "ai-card-title-row" }, el("div", {}, el("h2", {}, "可选同步")), stateChip),
    el("p", { class: "desc" },
      "把你的网盘当成一个远端仓库：本地数据永远本机说了算，网盘上只存一份快照。",
      el("br"),
      "不自动上传、不注册账号，不点按钮就没有任何东西离开这台设备。",
    ),
    ...steps, dailyCard,
  );

  const isConfigured = () => Boolean(cfg.root && cfg.lastSyncAt);

  function paintPresets() {
    presetChips.replaceChildren(...WEBDAV_PRESETS.map((p) => el("button", {
      class: `sync-preset${p.id === preset.id ? " on" : ""}`,
      type: "button",
      onclick: () => {
        cfg.presetId = p.id;
        preset = p;
        // 不可编辑根地址的预设（坚果云）直接覆盖；可编辑的只换占位提示，别把用户填的抹掉。
        if (!p.rootEditable) rootInput.value = p.root;
        rootInput.readOnly = !p.rootEditable;
        rootInput.placeholder = p.rootPlaceholder || "https://…/dav";
        if (!folderInput.value.trim()) folderInput.value = p.folder;
        userInput.placeholder = p.accountPlaceholder;
        passInput.placeholder = passwordPlaceholder();
        paintAll();
        S.saveNow();
      },
    }, el("b", {}, p.label), el("small", {}, p.tagline))));
  }

  function paintAll() {
    step1.classList.toggle("is-done", Boolean(cfg.presetId));
    step2.classList.toggle("is-done", Boolean(cfg.root && cfg.username));
    step3.classList.toggle("is-done", isConfigured());
    dailyCard.style.display = isConfigured() ? "" : "none";
    stateChip.textContent = isConfigured() ? `已配好 · ${preset.label}` : "未配置";
    stateChip.classList.toggle("ok", isConfigured());
    runBtn.textContent = isConfigured() ? "重新走一遍（会覆盖网盘上那份快照）" : "一键配好";
    paintPresetTexts();
    paintPresets();
    paintDaily();
  }

  const readForm = () => ({
    root: rootInput.value.trim(),
    folder: folderInput.value.trim(),
    fileName: cfg.fileName || DEFAULT_SYNC_FILE_NAME,
    username: userInput.value.trim(),
  });
  const persist = async (patch) => {
    const form = readForm();
    Object.assign(cfg, { presetId: preset.id, ...form, fileName: form.fileName, ...patch });
    cfg.url = buildDavUrl(form);
    await S.saveNow();
  };
  /** 留空 = 沿用密钥库里那串。和 AI 的 API Key 同一套交互，别一清空输入框就把人配好的设置废掉。 */
  async function resolvePassword() {
    const typed = passInput.value.trim();
    if (typed) return typed;
    const stored = await loadStoredSyncPassword();
    if (!stored) throw new Error("还没填密码。填一次就好，勾上「记住密码」以后不用再输");
    return stored;
  }
  /** 三种回显态：进行中（中性）、成功（is-ok）、失败（is-error）。都写在同一行里，别到处拼 className。 */
  function say(msg, tone = "") {
    result.className = `shortcut-status sync-result${tone ? ` ${tone}` : ""}`;
    result.textContent = msg;
  }
  function fail(e) {
    const msg = describeSyncError(e);
    say(msg, "is-error");
    toast(msg.length > 26 ? "同步失败，原因写在下面的提示里" : msg);
  }
  function succeed(msg) {
    say(msg, "is-ok");
  }

  runBtn.addEventListener("click", async () => {
    const form = readForm();
    if (!form.root) { fail(new Error("先填网盘根地址")); return; }
    if (!form.username) { fail(new Error("先填账号")); return; }
    runBtn.disabled = true;
    try {
      const password = await resolvePassword();
      const url = buildDavUrl(form);
      if (isPotentiallyUnsafeWebDav(url)
        && !window.confirm("这个网盘地址是明文 http://，账号密码会在网络上裸奔。只在自己家里路由器下面用可以接受，公网链接请换成 https。确定继续吗？")) return;
      say("第 1 步 · 正在核对账号…");
      await testWebDavConnection({ ...form, password });
      say("第 2 步 · 正在准备文件夹…");
      const { created } = await ensureWebDavFolder({ ...form, password });
      say(`${created.length ? `第 2 步 · 已新建 ${created.join("/")}｜` : "第 2 步 · 文件夹本来就有｜"}第 3 步 · 正在上传快照…`);
      const out = await uploadWebDav({ url, username: form.username, password, data: S.getState(), appVersion });
      hasStoredPassword = await applyPasswordPreference(password);
      passInput.value = "";
      passInput.placeholder = passwordPlaceholder();
      await persist({ lastSyncAt: out.snapshot.exportedAt });
      succeed(`全部完成 · ${new Date(out.snapshot.exportedAt).toLocaleString("zh-CN")} 的快照已在网盘上`);
      toast("网盘同步已配好");
      paintAll();
    } catch (e) {
      await persist({}).catch(() => {});
      fail(e);
      paintAll();
    } finally {
      runBtn.disabled = false;
    }
  });

  /** 「记住密码」开则入库、关则把已存的那串删掉 —— 别让开关和实际存储状态各说各话。 */
  async function applyPasswordPreference(password) {
    if (!password) return Boolean(await loadStoredSyncPassword());
    if (!remember.checked) {
      await clearStoredSyncPassword();
      return false;
    }
    try {
      await saveStoredSyncPassword(password);
      return true;
    } catch {
      toast("密码没能存进本机密钥库（浏览器调试模式没有密钥库），下次还要再输一次");
      return false;
    }
  }

  function paintDaily() {
    dailyBtns.replaceChildren(
      el("button", { class: "btn pri sm", type: "button", onclick: async () => {
        const form = readForm();
        try {
          const password = await resolvePassword();
          say("正在上传本地快照…");
          const out = await uploadWebDav({ url: buildDavUrl(form), username: form.username, password, data: S.getState(), appVersion });
          await applyPasswordPreference(password);
          passInput.value = "";
          await persist({ lastSyncAt: out.snapshot.exportedAt });
          succeed(`上传成功 · ${new Date(out.snapshot.exportedAt).toLocaleString("zh-CN")}`);
          toast("快照已上传");
          paintAll();
        } catch (e) { fail(e); }
      } }, "上传本地 → 网盘"),
      el("button", { class: "btn ghost sm", type: "button", onclick: async () => {
        const form = readForm();
        try {
          const password = await resolvePassword();
          say("正在读取网盘上的快照…");
          const snap = await downloadWebDav({ url: buildDavUrl(form), username: form.username, password });
          const when = snap.exportedAt ? new Date(snap.exportedAt).toLocaleString("zh-CN") : "时间未知";
          if (!window.confirm(`网盘上的快照：${when}${snap.appVersion ? ` · v${snap.appVersion}` : ""}\n\n拉回来会把这台设备现在的数据整份换掉。拿不准就先点一次「上传本地 → 网盘」留个底。确定继续？`)) {
            say("已取消，本地数据没动");
            return;
          }
          S.replaceAll(snap.data);
          await S.saveNow();
          await applyPasswordPreference(password);
          passInput.value = "";
          await persist({ lastSyncAt: new Date().toISOString() });
          succeed(`已从网盘拉回本地 · ${when}`);
          toast("远端快照已恢复到本机");
          rerender();
        } catch (e) { fail(e); }
      } }, "从网盘拉回本地"),
      el("button", { class: "btn ghost sm", type: "button", onclick: async () => {
        const form = readForm();
        try {
          const password = await resolvePassword();
          say("正在核对账号…");
          await testWebDavConnection({ ...form, password });
          succeed("账号能登录，这串密码仍然有效");
        } catch (e) { fail(e); }
      } }, "只测连接"),
      hasStoredPassword ? el("button", { class: "btn ghost sm", type: "button", onclick: async () => {
        if (!window.confirm("忘掉本机记住的密码？网盘上的快照不会被删。")) return;
        await clearStoredSyncPassword();
        hasStoredPassword = false;
        toast("已清除本机保存的密码");
        paintAll();
      } }, "忘掉密码") : null,
    );
  }

  paintAll();
  return card;
}

