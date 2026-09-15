// 警大门户通知 —— 对齐 cppu-notify-skill v1.2.1（Python + tesseract OCR → Le时间管理插件）
// 自动登录：登录成功一次后，密码与门户会话票据（Cookie）加密存入应用密钥库
// （tide.vault，Rust 侧 AES-256-GCM，不进 data.json / 备份）；
// 之后每次打开插件：先恢复票据静默续期直达消息页；票据过期则自动识别验证码
// （内置纯 JS 数字识别 + 失败自动换图重试）完成登录，全程无需手填。
// 保留完整 SSO 链路（主 SSO → sso-jw bridge → 门户 tp_up）与 rememberMe。
(function () {
  const SSO = "https://sso.cppu.edu.cn";
  const JW = "https://sso-jw.cppu.edu.cn";
  const PORTAL = "https://portal-jw.cppu.edu.cn";
  const SERVICE_JW = JW + "/tpass/bridge";
  const LOGIN_URL = SSO + "/tpass/login?service=" + encodeURIComponent(SERVICE_JW);
  const SERVICE_PORTAL = PORTAL + "/tp_up/view?m=up";
  const SILENT_LOGIN = JW + "/tpass/login?service=" + encodeURIComponent(SERVICE_PORTAL);
  const PAGES_MAX = 10, PAGE_SIZE = 50, CHUNK = 15;
  const AUTO_REFRESH_MS = 10 * 60 * 1000;

  // ── 左侧校园服务栏 ──
  // 标题与图标不写死：进入插件时抓一次网页元信息（<title> / favicon / 图标名），
  // 抓不到（内网、未登录、断网）就退回下面的 label 与 icon，因此离线也不会空着。
  const QUICK_LINKS = [
    { url: "https://webvpn.cppu.edu.cn/", label: "WebVPN", icon: "shield-halved" },
    { url: "https://mail.cppu.edu.cn/", label: "教育邮箱", icon: "envelope" },
    { url: "https://jw.cppu.edu.cn/index.html", label: "教务", icon: "school" },
    { url: "https://xg.cppu.edu.cn/XGPhone/Phone/index.html", label: "学工", icon: "id-card" },
    { url: "https://service.cppu.edu.cn/fe/site/service", label: "一网通办", icon: "clipboard-list" },
  ];
  // 需要登录才能进的入口：点一下不直接开裸地址（那样只会落到统一身份认证登录页），
  // 而是用插件自身那份统一身份认证会话（sso.cppu.edu.cn 的 CASTGC，随 rememberMe 保 5 天）
  // 现场换一张一次性 ticket，交给系统浏览器消费 —— 「教务」因此不需要手填任何 token。
  // 刻意不存 token、也不设「粘贴 token」的输入位：票据只活在这一次点击的内存里，不落盘。
  const TICKET_LINKS = {
    // service 就是裸开 https://jw.cppu.edu.cn/index.html 时 302 里的 cas_callback
    "https://jw.cppu.edu.cn/index.html": {
      service: "https://jw.cppu.edu.cn/cas_callback",
      origin: "https://jw.cppu.edu.cn",
      path: "/cas_callback",
    },
  };
  const LINK_META_TTL = 7 * 24 * 60 * 60 * 1000;   // 识别结果一周内复用，避免每次进插件都抓五个站点
  const LINK_META_KEY = "quickLinkMeta";
  let linkMeta = {};

  // Sudy CAS RSAUtils.encryptedString 忠实移植（126 字符分块，16 位小端打包，非 PKCS#1）
  const MODULUS_HEX = "008aed7e057fe8f14c73550b0e6467b023616ddc8fa91846d2613cdb7f7621e3cada4cd5d812d627af6b87727ade4e26d26208b7326815941492b2204c3167ab2d53df1e3a2c9153bdb7c8c2e968df97a5e7e01cc410f92c4c2c2fba529b3ee988ebc1fca99ff5119e036d732c368acf8beba01aa2fdafa45b21e4de4928d0d403";
  const EXPONENT_HEX = "010001";
  function rsaEncrypt(password) {
    const n = BigInt("0x" + MODULUS_HEX), e = BigInt("0x" + EXPONENT_HEX);
    const chunkSize = 2 * Math.max(0, Math.floor((n.toString(2).length - 1) / 16));
    const a = [...password].map((c) => c.charCodeAt(0));
    while (a.length % chunkSize !== 0) a.push(0);
    const blocks = [];
    for (let i = 0; i < a.length; i += chunkSize) {
      let m = 0n;
      const chunk = a.slice(i, i + chunkSize);
      for (let j = 0; j < chunk.length; j += 2) {
        const word = chunk[j] + ((chunk[j + 1] ?? 0) << 8);
        m |= BigInt(word) << BigInt(16 * (j / 2));
      }
      let r = 1n, b = m % n, ee = e;
      while (ee > 0n) { if (ee & 1n) r = r * b % n; b = b * b % n; ee >>= 1n; }
      blocks.push(r.toString(16));
    }
    return blocks.join(" ");
  }

  const state = {
    sid: null, token: "", username: "", rememberUsername: true, autoLogin: true, autoRefresh: true,
    notices: [], page: 1, hasMore: true,
    fetching: false, error: null, fetchedAt: 0,
    expanded: new Set(),
    details: {},           // rid -> {content, loading, error}
    seen: new Set(),
    filter: { kw: "", month: "all", hideSeen: false },
    captcha: "", pending: null, renderedCount: CHUNK,
    savedPassword: "",     // 密钥库取出的密码（仅内存，用于自动登录与表单预填）
    sideOpen: false,       // 校园服务栏：默认收起。只活在本次插件会话里，重进插件回到收起
  };
  let ui = null, io = null, sentinelCb = null, paintToken = 0, autoRefreshTimer = null;

  function observeSentinel(node, cb) {
    sentinelCb = cb;
    if (io) io.disconnect();
    if (node && io) io.observe(node);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function monthOf(m) {
    const t = Number(m.CREATE_TIME || 0);
    if (!t) return "unknown";
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function monthLabel(mo) {
    if (mo === "unknown") return "时间未知";
    const [y, m] = mo.split("-");
    return `${y}年${Number(m)}月`;
  }
  function cleanText(raw) {
    let t = String(raw || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "");
    const ta = document.createElement("textarea");
    ta.innerHTML = t;
    t = ta.value.replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d");
    const out = [];
    for (const ln of t.split("\n").map((s) => s.trim())) {
      if (ln) out.push(ln);
      else if (!ln && out.length && out[out.length - 1] !== "") out.push("");
    }
    return out.join("\n").trim();
  }
  const titleOf = (it) => String(it.PIM_TITLE || "(无标题)").replace(/&ldquo;/g, "\u201c").replace(/&rdquo;/g, "\u201d");
  const itemKey = (it) => String(it.RESOURCE_ID || "");
  function tokenFromText(...parts) {
    for (const part of parts) {
      const m = String(part || "").match(/tp_up[=;]([^&?;\s"'<>]+)/);
      if (m) return m[1];
    }
    return "";
  }
  function redirectTarget(res, base, expectedOrigin, expectedPath) {
    const raw = String(res?.location || "").trim();
    if (!raw || !(res.status >= 300 && res.status < 400)) return "";
    try {
      const target = new URL(raw, base);
      if (target.protocol !== "https:" || target.origin !== expectedOrigin) return "";
      if (expectedPath && target.pathname !== expectedPath) return "";
      return target.href;
    } catch { return ""; }
  }
  function explainHttpError(e) {
    const msg = String(e && (e.message || e) || "");
    if (/Failed to fetch|Load failed|NetworkError/i.test(msg)) {
      return "网络桥不可用：浏览器预览会被智慧警大跨域策略拦截，请在桌面版 Le时间管理 中打开本插件。";
    }
    return msg || "网络请求失败";
  }

  function ensureStyle() {
    if (document.getElementById("pp-notify-style")) return;
    const st = document.createElement("style");
    st.id = "pp-notify-style";
    st.textContent = `
      .pp-wrap{max-width:880px;margin:0 auto}
      .pp-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0}
      .pp-lab{font-size:11px;color:#A9B2BA;letter-spacing:.14em;flex:none;width:34px}
      .pp-chips{display:flex;gap:8px;flex-wrap:wrap;flex:1}
      .pp-kw{flex:1;min-width:170px;height:34px;border:1px solid #E4DFD6;border-radius:9px;padding:0 11px;background:#fff}
      .pp-chip{font-size:12px;border:1px solid #E4DFD6;background:#fff;border-radius:16px;padding:6px 13px;cursor:pointer;color:#7E8B94}
      .pp-chip.on{background:#0F4C5C;color:#fff;border-color:#0F4C5C}
      .gx-btn:hover,.pp-btn:hover{border-color:#0F4C5C;color:#0F4C5C}
      .pp-btn{font-size:12px;border:1px solid #E4DFD6;border-radius:8px;padding:7px 13px;background:#fff;cursor:pointer;color:#22303A;white-space:nowrap}
      .pp-btn.pri{background:#0F4C5C;color:#fff;border-color:#0F4C5C;font-weight:600}
      .pp-btn.pri:hover{background:#0B3D4A;color:#fff}
      .pp-toggle{display:flex;align-items:center;gap:6px;font-size:12px;color:#7E8B94;cursor:pointer;user-select:none}
      .pp-toggle i{width:34px;height:19px;border-radius:10px;background:#D8D2C6;display:inline-block;position:relative;transition:.15s}
      .pp-toggle i::after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.15s}
      .pp-toggle.on i{background:#2EC4B6}
      .pp-toggle.on i::after{left:17px}
      .pp-status{font-size:12px;color:#7E8B94;margin:2px 0 8px}
      .pp-status .err{color:#B03535}
      .pp-month{font-size:12.5px;font-weight:700;color:#0F4C5C;padding:9px 2px 7px;letter-spacing:.05em}
      .pp-card{background:#fff;border:1px solid #E4DFD6;border-radius:14px;padding:12px 14px;margin-bottom:9px;cursor:pointer;content-visibility:auto;contain-intrinsic-size:auto 74px;transition:border-color .28s ease,box-shadow .28s ease,background .28s ease}
      .pp-card.open{border-color:#D5DED9;box-shadow:0 7px 24px rgba(34,48,58,.055)}
      .pp-heading{display:block;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:4px 0;cursor:pointer;font-family:inherit;min-height:44px}
      .pp-expand{margin-top:10px;min-height:44px;display:inline-flex;align-items:center;gap:7px;transition:background .2s ease,border-color .2s ease,color .2s ease}
      .pp-expand::after{content:"⌄";display:inline-block;font-size:14px;line-height:1;transform:translateY(-1px) rotate(0deg);transition:transform .36s cubic-bezier(.22,.8,.22,1)}
      .pp-card.open .pp-expand::after{transform:translateY(1px) rotate(180deg)}
      .pp-heading:focus-visible,.pp-btn:focus-visible{outline:3px solid #2EC4B6;outline-offset:2px}
      @media(max-width:600px){.pp-wrap{width:100%;min-width:0}.pp-login{margin:12px auto;padding:20px 16px;max-width:100%;box-sizing:border-box}.pp-title{font-size:17px!important}.pp-meta{font-size:13px!important}.pp-detail .c{font-size:16px!important;max-height:none!important;overflow-wrap:anywhere}.pp-btn,.pp-chip{min-height:44px;font-size:14px!important}.pp-kw{width:100%;flex-basis:100%;box-sizing:border-box;min-height:44px}.pp-card{padding:14px;cursor:default}.pp-caprow input{min-width:0}.pp-detail .pp-act{flex-wrap:wrap}}
      .pp-card:hover{background:#FBFAF5;border-color:#D8D2C4}
      .pp-card.seen{opacity:.6}
      .pp-title{font-size:13.5px;font-weight:600;line-height:1.5}
      .pp-meta{display:flex;gap:8px;align-items:center;font-size:11px;color:#7E8B94;margin-top:5px;flex-wrap:wrap}
      .pp-tag{border-radius:6px;padding:2px 8px;background:#E1EEF3;color:#0F4C5C;font-size:10px}
      .pp-tag.top{background:#FFF0E1;color:#B26A00}
      .pp-tag.unread{background:#FDE8E8;color:#C64545}
      .pp-detail-shell{display:grid;grid-template-rows:0fr;opacity:0;margin-top:0;transition:grid-template-rows .42s cubic-bezier(.2,.78,.2,1),opacity .24s ease,margin-top .42s cubic-bezier(.2,.78,.2,1)}
      .pp-card.open .pp-detail-shell{grid-template-rows:1fr;opacity:1;margin-top:10px}
      .pp-detail-clip{min-height:0;overflow:hidden}
      .pp-detail{border-top:1px dashed #EFEAE1;padding-top:10px;transform:translateY(-7px);transition:transform .36s cubic-bezier(.2,.78,.2,1)}
      .pp-card.open .pp-detail{transform:translateY(0)}
      .pp-detail .c{font-size:12px;color:#4B565E;line-height:1.9;white-space:pre-wrap;max-height:320px;overflow-y:auto;overscroll-behavior:contain}
      .pp-detail .pp-act{display:flex;gap:8px;margin-top:10px}
      .pp-login{max-width:440px;margin:26px auto;background:#fff;border:1px solid #E4DFD6;border-radius:18px;padding:28px 30px;box-shadow:0 2px 10px rgba(34,48,58,.07)}
      .pp-login h3{font-size:16px;margin-bottom:4px}
      .pp-login .d{font-size:12px;color:#7E8B94;line-height:1.7;margin-bottom:12px}
      .pp-login label{display:block;font-size:12px;color:#7E8B94;margin:12px 0 5px}
      .pp-login input{width:100%;height:38px;border:1px solid #E4DFD6;border-radius:9px;padding:0 12px;background:#fff;box-sizing:border-box}
      .pp-caprow{display:flex;gap:10px;align-items:flex-end}
      .pp-caprow .capbox{flex:none;width:120px;text-align:center;cursor:pointer}
      .pp-caprow img{width:120px;height:40px;border:1px solid #E4DFD6;border-radius:8px;background:#fff;display:block}
      .pp-caprow small{font-size:10px;color:#A9B2BA;display:block;margin-top:3px}
      .pp-login .err{color:#B03535;font-size:12px;margin-top:10px;min-height:16px}
      .pp-login .sec{font-size:10.5px;color:#A9B2BA;margin-top:12px;line-height:1.7}
      .pp-login .saved{background:#F6FBFA;border:1px solid #D6EBE8;color:#42656A;border-radius:10px;padding:9px 11px;font-size:12px;line-height:1.65;margin:10px 0 12px}
      .pp-empty{border:1.5px dashed #CFC8BA;border-radius:12px;padding:20px;text-align:center;color:#A9B2BA;font-size:12.5px;line-height:1.8}
      .pp-banner{background:#FFF7E8;border:1px solid #F2D9A6;color:#8A6420;border-radius:12px;padding:12px 15px;font-size:12px;line-height:1.8;margin-bottom:10px}
      .pp-more{display:flex;justify-content:center;padding:8px 0 4px}
      .pp-more .pp-btn{padding:8px 20px;font-size:12px}
      /* ── 左侧校园服务栏：只用主题变量配色，夜里自动跟随深色 ── */
      .pp-shell{display:flex;align-items:flex-start;max-width:1180px;margin:0 auto;padding:0 20px;box-sizing:border-box;width:100%}
      .pp-main{flex:1;min-width:0}
      /* 校园服务栏可收起：收 / 展靠 .pp-side 的 width 过渡，.pp-main 是 flex:1 会跟着一起走
         （这就是「警大通知随收缩而动」）。内层固定 214px + 外层 overflow:hidden --
         否则宽度动画期间文字一直在重排，看着很脏。
         展开方向 = 内层 transform-origin:left top 的缩放，内容自左上角往右下角长出来。 */
      .pp-side{width:214px;flex:none;position:sticky;top:16px;margin-right:16px;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:11px 11px 9px;box-shadow:0 1px 6px rgba(34,48,58,.05);overflow:hidden;transition:width .34s cubic-bezier(.22,.8,.22,1),margin-right .34s cubic-bezier(.22,.8,.22,1),padding .34s cubic-bezier(.22,.8,.22,1),border-width .3s ease,opacity .24s ease}
      .pp-side-inner{width:214px;transform-origin:left top;transition:transform .34s cubic-bezier(.22,.8,.22,1),opacity .26s ease}
      .pp-shell.side-collapsed .pp-side{width:0;margin-right:0;padding-left:0;padding-right:0;border-left-width:0;border-right-width:0;opacity:0}
      .pp-shell.side-collapsed .pp-side-inner{transform:scale(.88) translate(-10px,-10px);opacity:0}
      /* 收起后留在原地的把手。它是 .pp-shell 的正经 flex 子项（不是浮层），所以永远压不住正文；
         展开时 max-width 收到 0，与侧栏的 width 过渡同时进行 → 没有跳变。
         sticky 保证列表滚很长时也够得着。 */
      .pp-side-toggle{flex:none;display:inline-flex;align-items:center;gap:7px;font-family:inherit;font-size:12px;font-weight:600;color:var(--deep);background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:8px 12px;cursor:pointer;box-shadow:0 1px 6px rgba(34,48,58,.06);position:sticky;top:8px;align-self:flex-start;z-index:4;white-space:nowrap;overflow:hidden;max-width:160px;max-height:52px;margin-right:12px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:max-width .34s cubic-bezier(.22,.8,.22,1),max-height .34s cubic-bezier(.22,.8,.22,1),padding .34s cubic-bezier(.22,.8,.22,1),margin-right .34s cubic-bezier(.22,.8,.22,1),border-width .3s ease,opacity .24s ease,background .16s ease}
      .pp-side-toggle:hover,.pp-side-toggle:active{background:var(--paper)}
      .pp-side-toggle:focus-visible{outline:3px solid #2EC4B6;outline-offset:2px}
      .pp-shell:not(.side-collapsed) .pp-side-toggle{max-width:0;max-height:0;padding-top:0;padding-bottom:0;padding-left:0;padding-right:0;margin-right:0;border-width:0;opacity:0;pointer-events:none}
      .pp-side-head{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:10.5px;letter-spacing:.22em;color:var(--ink-3);padding:2px 4px 9px;border-bottom:1px solid var(--line-soft);margin-bottom:7px}
      .pp-side-acts{display:flex;align-items:center;gap:1px;margin-right:7px}
      .pp-side-sync{border:0;background:transparent;color:var(--ink-3);cursor:pointer;font-size:15px;line-height:1;padding:4px 6px;border-radius:8px;font-family:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      /* 收起箭头是这一栏的主操作，单独放大加深（13px 灰三角小得看不见——用户实测反馈） */
      .pp-side-sync[data-side-toggle]{font-size:18px;padding:3px 8px;color:var(--ink-2)}
      .pp-side-sync:active{background:var(--line-soft)}
      .pp-side-sync:hover{background:var(--paper);color:var(--deep)}
      .pp-side-list{display:flex;flex-direction:column;gap:3px}
      .pp-side-btn{display:flex;align-items:center;gap:9px;width:100%;border:0;background:transparent;border-radius:10px;padding:6px 8px;cursor:pointer;text-align:left;color:var(--ink);font-family:inherit;min-height:46px;transition:background .16s ease,color .16s ease}
      .pp-side-btn:hover{background:var(--paper);color:var(--deep)}
      .pp-side-btn:focus-visible{outline:3px solid #2EC4B6;outline-offset:2px}
      /* 换票要往返 1~3 次请求，期间给出「正在处理」的视觉反馈，避免点了像没反应 */
      .pp-side-btn[aria-busy="1"]{opacity:.55;cursor:progress}
      .pp-side-ico{width:28px;height:28px;flex:none;border-radius:9px;background:var(--paper);border:1px solid var(--line-soft);display:grid;place-items:center;overflow:hidden}
      .pp-side-ico img{width:17px;height:17px;object-fit:contain}
      .pp-side-ico svg{width:14px;height:14px;fill:var(--deep)}
      .pp-side-txt{min-width:0;display:flex;flex-direction:column;gap:1px}
      .pp-side-txt b{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:142px}
      .pp-side-txt small{font-size:10px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:142px}
      .pp-side-note{font-size:10px;color:var(--ink-3);line-height:1.6;padding:8px 4px 1px;border-top:1px solid var(--line-soft);margin-top:7px}
      @media(max-width:820px){
        .pp-shell{flex-direction:column;padding:0 14px}
        /* 窄屏时侧栏是整层叠在正文上面的，收起要收"高度"而不是宽度 */
        .pp-side{width:100%;position:static;padding:10px;margin-right:0;margin-bottom:12px;max-height:1400px;transition:max-height .34s cubic-bezier(.22,.8,.22,1),margin-bottom .34s cubic-bezier(.22,.8,.22,1),padding .34s cubic-bezier(.22,.8,.22,1),border-width .3s ease,opacity .24s ease}
        .pp-side-inner{width:100%}
        .pp-shell.side-collapsed .pp-side{width:100%;max-height:0;padding-top:0;padding-bottom:0;margin-bottom:0;border-top-width:0;border-bottom-width:0;opacity:0}
        /* 手机上把手与头部两个小图标都得有 44px 的点击区，手指才点得准 */
        .pp-side-toggle{margin-right:0;margin-bottom:12px;max-width:100%;min-height:44px;padding:10px 14px;font-size:13px}
        .pp-side-sync{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;font-size:16px;padding:0}
        .pp-side-acts{gap:4px}
        /* 展开时把手要整体藏掉：min-height 会压过 max-height，所以必须把 min-height 也归零，
           否则窄屏上会在侧栏与正文之间留一条 44px 的隐形空隙 */
        .pp-shell:not(.side-collapsed) .pp-side-toggle{margin-bottom:0;min-height:0}
        .pp-side-list{flex-direction:row;flex-wrap:wrap}
        .pp-side-btn{width:auto;flex:1 1 132px;min-width:0;min-height:52px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
        /* 手机上工具栏不能靠自动换行碰运气（原来「刷新」会独占一整行）：
           关键词搜索独占一行，其余按钮/开关挤一行，并统一给到 44px 的点击高度 */
        .pp-toolbar{gap:8px}
        .pp-kw{flex:1 1 100%;order:2;min-width:0;height:44px}
        .pp-toolbar>span:not(.pp-lab){order:1}
        .pp-toolbar>.pp-btn,.pp-toggle{order:1;min-height:44px}
        .pp-toolbar>.pp-btn{padding:0 14px;font-size:13px}
        .pp-side-txt b,.pp-side-txt small{max-width:96px}
        .pp-side-note{display:none}
      }
      @media(prefers-reduced-motion:reduce){.pp-card,.pp-expand,.pp-expand::after,.pp-detail-shell,.pp-detail,.pp-side,.pp-side-inner,.pp-side-toggle{transition-duration:.01ms!important}}
    `;
    document.head.append(st);
  }

  async function loadPrefs() {
    const f = await tide.storage.get("filter", null);
    if (f) state.filter = { ...state.filter, ...f };
    state.username = (await tide.storage.get("username", "")) || "";
    state.rememberUsername = await tide.storage.get("rememberUsername", true) !== false;
    state.autoLogin = await tide.storage.get("autoLogin", true) !== false;
    state.autoRefresh = await tide.storage.get("autoRefresh", true) !== false;
    state.seen = new Set(await tide.storage.get("seen", []));
    if (state.autoLogin && typeof tide.vault?.get === "function") {
      try { state.savedPassword = JSON.parse((await tide.vault.get("secret")) || "null")?.password || ""; } catch { state.savedPassword = ""; }
    }
  }
  const saveFilter = () => tide.storage.set("filter", state.filter);
  const saveSeen = () => tide.storage.set("seen", [...state.seen].slice(-500));

  /* ── 登录态持久化：Cookie 存密钥库，重启后恢复会话免验证码 ── */
  async function saveCookies() {
    if (typeof tide.vault?.set !== "function" || !state.sid) return;
    try {
      const dump = await tide.http.exportCookies(state.sid, [SSO, JW, PORTAL]);
      if (dump.length) await tide.vault.set("cookies", JSON.stringify(dump));
    } catch { /* 密钥库不可用（浏览器调试）时静默跳过 */ }
  }

  async function restoreCookies() {
    if (typeof tide.vault?.get !== "function") return false;
    try {
      const raw = await tide.vault.get("cookies");
      const dump = raw ? JSON.parse(raw) : null;
      if (Array.isArray(dump) && dump.length) {
        state.sid = await tide.http.restoreCookies(dump);
        // tp_up 本身也保存在门户 Cookie 中。先恢复它可直接复用仍有效的门户会话，
        // 即使主 SSO 的 CASTGC 已失效，也不必立刻退回验证码登录。
        state.token = tokenFromText(...dump.map((row) => row?.cookie));
        return !!state.sid;
      }
    } catch { /* 票据损坏按无票据处理 */ }
    return false;
  }

  async function clearSavedLogin() {
    state.savedPassword = "";
    try {
      await tide.vault?.del?.("secret");
      await tide.vault?.del?.("cookies");
    } catch { /* ignore */ }
  }

  /* ── SSO 登录链路 ── */
  async function newSession() { if (!state.sid) state.sid = await tide.http.session(); }
  const referer = () => PORTAL + "/tp_up/view;tp_up=" + state.token + "?m=up";

  async function getPage(url, useBinary = false, opts = {}) {
    try {
      return await tide.http.fetch(state.sid, "GET", url, { ...opts, binary: useBinary });
    } catch (e) {
      throw new Error(explainHttpError(e));
    }
  }

  async function fetchLoginHtml() {
    const res = await getPage(LOGIN_URL);
    const m = res.body.match(/name="execution" value="([^"]+)"/);
    if (!m) throw new Error("登录页加载异常（网络或站点不可达）");
    return m[1];
  }

  async function fetchCaptcha() {
    const res = await getPage(SSO + "/tpass/captcha.jpg?tt=" + Math.random(), true);
    if (res.status !== 200) throw new Error("验证码获取失败");
    state.captcha = "data:image/jpeg;base64," + res.body;
    // 更新页面上所有验证码图（登录表单/换图按钮共用）
    document.querySelectorAll("img[data-cap]").forEach((img) => { img.src = state.captcha; });
    return state.captcha;
  }

  /* ══ 验证码识别（纯 JS，无外部运行时）══
     警大 SSO 验证码：4 位数字、每个数字一种颜色、叠加贯穿细线。
     识别管线：解码 → Otsu 二值化 → 连通域去线去噪 → x 区间分组 →
     归一化 16×16 位图 → 与「内置字体模板 + 历史确认样本」匹配。
     单次识别有误差，由自动登录层用「识别失败就换图重试」兜底；
     登录成功后样本回存，识别率随使用快速提升。 */
  const OCR = (() => {
    const N = 16;
    const SAMPLE_MAX = 240;

    // —— 纯函数：区域归一化（最近邻缩放到 N×N 二值位图）——
    function normalizeRegion(w, get, x0, y0, bw, bh) {
      const out = new Array(N * N).fill(0);
      for (let ry = 0; ry < N; ry++) {
        const sy = Math.min(y0 + bh - 1, y0 + Math.floor((ry + 0.5) * bh / N));
        for (let rx = 0; rx < N; rx++) {
          const sx = Math.min(x0 + bw - 1, x0 + Math.floor((rx + 0.5) * bw / N));
          out[ry * N + rx] = get(sx, sy) ? 1 : 0;
        }
      }
      return out;
    }

    // —— 纯函数：Jaccard 相似度 ——
    function similarity(a, b) {
      let inter = 0, union = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i] && b[i]) inter++;
        if (a[i] || b[i]) union++;
      }
      return union ? inter / union : 0;
    }

    // —— 纯函数：分类（内置模板 + 历史样本里取最优匹配）——
    function classify(bits, templates, samples) {
      let best = { d: -1, score: 0 };
      for (const t of templates) {
        const s = similarity(bits, t.bits);
        if (s > best.score) best = { d: t.d, score: s };
      }
      for (const smp of samples || []) {
        // 样本可能来自 storage（"0101…" 字符串）或当次识别（数组）
        const arr = typeof smp.b === "string" ? [...smp.b].map(Number) : smp.b;
        const s = similarity(bits, arr) * 1.02; // 同源样本略加权
        if (s > best.score) best = { d: smp.d, score: s };
      }
      return best;
    }

    // —— 纯函数：连通域按 x 区间重叠合并成字符组 ——
    function groupByX(comps) {
      const sorted = [...comps].sort((a, b) => a.minX - b.minX);
      const groups = [];
      for (const c of sorted) {
        const g = groups.find((g) => c.minX <= g.maxX + 1 && c.maxX >= g.minX - 1);
        if (g) {
          g.pix.push(...c.pix);
          g.minX = Math.min(g.minX, c.minX); g.maxX = Math.max(g.maxX, c.maxX);
          g.minY = Math.min(g.minY, c.minY); g.maxY = Math.max(g.maxY, c.maxY);
        } else {
          groups.push({ pix: [...c.pix], minX: c.minX, maxX: c.maxX, minY: c.minY, maxY: c.maxY });
        }
      }
      return groups.sort((a, b) => a.minX - b.minX);
    }

    // —— 纯函数：连通域标记（8 邻接）——
    function components(w, h, get) {
      const seen = new Uint8Array(w * h);
      const comps = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!get(x, y) || seen[y * w + x]) continue;
          const pix = [];
          const stack = [y * w + x];
          seen[y * w + x] = 1;
          let minX = x, maxX = x, minY = y, maxY = y;
          while (stack.length) {
            const cur = stack.pop();
            const cx = cur % w, cy = (cur / w) | 0;
            pix.push(cur);
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ni = ny * w + nx;
              if (!seen[ni] && get(nx, ny)) { seen[ni] = 1; stack.push(ni); }
            }
          }
          comps.push({ pix, minX, maxX, minY, maxY, size: pix.length });
        }
      }
      return comps;
    }

    // —— Otsu 全局阈值（返回值配合「亮度 < 阈值 = 墨迹」使用，取最大方差点右移一位）——
    function otsu(histogram, total) {
      let sum = 0;
      for (let i = 0; i < 256; i++) sum += i * histogram[i];
      let sumB = 0, wB = 0, best = 0, threshold = 127;
      for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (!wB) continue;
        const wF = total - wB;
        if (!wF) break;
        sumB += t * histogram[t];
        const mB = sumB / wB, mF = (sum - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best) { best = between; threshold = t; }
      }
      return threshold + 1;
    }

    // —— 内置模板：运行时用 canvas 多字体渲染 0-9 生成（含轻微旋转/斜体变化）——
    let templates = null;
    function buildTemplates() {
      if (templates || typeof document === "undefined") return templates || [];
      templates = [];
      const S = 44;
      const cv = document.createElement("canvas");
      cv.width = S; cv.height = S;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return [];
      const fonts = [
        'bold 30px Georgia, serif', 'bold 30px "Times New Roman", serif',
        'bold 30px Arial, sans-serif', 'bold 30px Verdana, sans-serif',
        'italic bold 30px Georgia, serif', 'serif',
      ];
      for (let d = 0; d <= 9; d++) {
        for (const font of fonts) {
          for (const rot of [-0.1, 0, 0.1]) {
            ctx.clearRect(0, 0, S, S);
            ctx.save();
            ctx.translate(S / 2, S / 2);
            ctx.rotate(rot);
            ctx.font = font;
            ctx.fillStyle = "#000";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(String(d), 0, 1);
            ctx.restore();
            const data = ctx.getImageData(0, 0, S, S).data;
            const get = (x, y) => data[(y * S + x) * 4 + 3] > 100;
            const box = tightBox(S, S, get);
            if (!box) continue;
            templates.push({ d, bits: normalizeRegion(S, get, box.x0, box.y0, box.w, box.h) });
          }
        }
      }
      return templates;
    }

    function tightBox(w, h, get) {
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!get(x, y)) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) return null;
      return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    // —— 历史确认样本（登录成功 = 当次识别全部正确，回存提升识别率）——
    async function loadSamples() {
      try { const s = await tide.storage.get("ocrSamples", []); return Array.isArray(s) ? s.slice(-SAMPLE_MAX) : []; }
      catch { return []; }
    }
    async function confirmSamples(samples) {
      if (!Array.isArray(samples) || !samples.length) return;
      const mine = samples.map((s) => ({ b: String(s.b || "").slice(0, N * N), d: s.d | 0 }));
      const all = (await loadSamples()).concat(mine).slice(-SAMPLE_MAX);
      try { await tide.storage.set("ocrSamples", all); } catch { /* ignore */ }
    }

    // —— 主入口：dataURL → {code, confidence, samples} ——
    async function recognize(dataUrl) {
      if (typeof document === "undefined" || !dataUrl) return { code: "", confidence: 0, samples: [] };
      const img = new Image();
      img.src = dataUrl;
      try { await img.decode(); } catch { return { code: "", confidence: 0, samples: [] }; }
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || w > 600 || h > 300) return { code: "", confidence: 0, samples: [] };
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { code: "", confidence: 0, samples: [] };
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;

      // Otsu 二值化：墨迹 = 亮度低于阈值
      const histogram = new Array(256).fill(0);
      const lum = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const l = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) | 0;
        lum[i] = l;
        histogram[l]++;
      }
      const t = otsu(histogram, w * h);
      const get = (x, y) => lum[y * w + x] < t;

      // 连通域：去噪点、去贯穿细线（宽超过画面 55% 的组件是那条波浪线）
      const comps = components(w, h, get)
        .filter((c) => c.size >= 8 && (c.maxX - c.minX) < w * 0.55);
      if (!comps.length) return { code: "", confidence: 0, samples: [] };

      // x 重叠合并 → 期望 4 个字符组
      let groups = groupByX(comps);
      // 兜底：多余组按 x 均分（细线断片可能被当成独立组）
      if (groups.length > 4) {
        const xs = groups.map((g) => (g.minX + g.maxX) / 2);
        const step = (Math.max(...xs) - Math.min(...xs)) / 4;
        const merged = [[], [], [], []];
        groups.forEach((g, i) => merged[Math.min(3, Math.max(0, Math.floor((xs[i] - xs[0]) / step)))].push(g));
        groups = merged
          .map((list) => list.length ? list.reduce((acc, g) => ({
            minX: Math.min(acc.minX, g.minX), maxX: Math.max(acc.maxX, g.maxX),
            minY: Math.min(acc.minY, g.minY), maxY: Math.max(acc.maxY, g.maxY),
            pix: acc.pix.concat(g.pix),
          })) : null)
          .filter(Boolean);
      }
      if (groups.length !== 4) return { code: "", confidence: 0, samples: [] };

      const lib = buildTemplates();
      const samples = await loadSamples();
      let code = "", worst = 1;
      const out = [];
      for (const g of groups) {
        const getG = (x, y) => g.pix.includes(y * w + x);
        const bits = normalizeRegion(w, getG, g.minX, g.minY, g.maxX - g.minX + 1, g.maxY - g.minY + 1);
        const hit = classify(bits, lib, samples);
        if (hit.d < 0 || hit.score < 0.18) return { code: "", confidence: 0, samples: [] };
        worst = Math.min(worst, hit.score);
        code += String(hit.d);
        out.push({ b: bits.join(""), d: hit.d });
      }
      return { code, confidence: worst, samples: out };
    }

    return { recognize, confirmSamples, loadSamples, normalizeRegion, similarity, classify, groupByX, components, otsu };
  })();

  /* ── 自动登录：恢复票据 → 静默续期 → 密码 + 验证码识别兜底 ── */
  const AUTO_ATTEMPTS = 6;

  async function autoLogin(el) {
    // ① 恢复上次会话票据（CASTGC 有效期内直达，不碰验证码）
    const restored = await restoreCookies();
    if (!restored) await newSession();
    if (state.token) {
      // Cookie 中的 tp_up 可能已过期：先用列表接口做真实校验，失败后继续走
      // 主 SSO/密码兜底，不能把用户留在只有“会话过期”的空列表页。
      if (await loadPage(1)) { buildMain(el); return true; }
      state.token = "";
      state.error = null;
    }
    if (await silentRenew()) {
      await saveCookies();
      tide.notify("已自动恢复门户登录，正在打开通知");
      buildMain(el);
      loadPage(1);
      return true;
    }
    // ② 票据失效：有保存的密码就走「验证码识别 + 换图重试」全自动登录。
    // 残留会话是登录 HTTP 500 的常见来源——恢复的旧 JSESSIONID / 过期票据会让 CAS
    // 对 POST 里的 execution 校验错乱（服务端异常而非验证码错误）。登录前丢弃
    // 恢复的会话，用全新 Cookie 走完整链路：登录页 → execution → 验证码 → 提交。
    if (!state.autoLogin || !state.username || !state.savedPassword) return false;
    state.sid = null;
    await newSession();
    let lastOcr = "";
    let confirmed = null;
    for (let attempt = 1; attempt <= AUTO_ATTEMPTS; attempt++) {
      try {
        // pending 必须带全 username/password：submitLogin 直接从这里读取提交体字段
        state.pending = { username: state.username, password: state.savedPassword, execution: await fetchLoginHtml() };
        await fetchCaptcha();
      } catch (e) {
        paintLogin(el, String(e.message || e));
        return false;
      }
      const ocr = await OCR.recognize(state.captcha);
      if (!ocr.code) continue;           // 没认出来：换一张再来
      lastOcr = ocr.code;
      confirmed = ocr.samples;
      try {
        await submitLogin(ocr.code);
        // 登录成功 → 密码/票据入库 + 本次识别样本确认
        await persistCredentials(state.savedPassword);
        OCR.confirmSamples(confirmed);
        await saveCookies();
        tide.notify("已自动完成登录（含验证码识别），正在打开通知");
        buildMain(el);
        loadPage(1);
        return true;
      } catch (e) {
        if (e && e.fatal) break;         // 密码不对：自动登录无解，转人工表单
        if (e && e.status >= 500) {
          // 服务端 5xx：会话可能已被污染，换全新会话再试剩余次数
          state.sid = null;
          await newSession();
        }
        // 其余失败（多半是验证码）：换图重试
      }
    }
    // ③ 兜底：登录表单，账号/密码/最后一次识别结果全部预填，人工只需核对
    paintLogin(el, "自动登录未成功，已填好账号密码，请核对验证码后点「登 录」", { prefillCode: lastOcr });
    return false;
  }

  async function persistCredentials(password) {
    if (!state.autoLogin || typeof tide.vault?.set !== "function") return;
    try {
      await tide.vault.set("secret", JSON.stringify({ password }));
      state.savedPassword = password;
    } catch { /* 密钥库不可用时跳过 */ }
  }

  async function finishPortalTicket(loginRes) {
    const direct = tokenFromText(loginRes?.finalUrl, loginRes?.location, loginRes?.body, ...(loginRes?.cookies || []));
    if (direct) { state.token = direct; return true; }
    const portalTicket = redirectTarget(loginRes, SILENT_LOGIN, PORTAL);
    if (!portalTicket) return false;
    const portal = await getPage(portalTicket, false, { followRedirects: false }).catch(() => null);
    const token = tokenFromText(portal?.finalUrl, portal?.location, portal?.body, ...(portal?.cookies || []));
    if (token) { state.token = token; return true; }
    return false;
  }

  async function finishPortalLogin(firstRes) {
    const direct = tokenFromText(firstRes?.finalUrl, firstRes?.location, firstRes?.body, ...(firstRes?.cookies || []));
    if (direct) { state.token = direct; return true; }

    // CAS ticket 是一次性的，必须像原 skill 一样逐段消费，不能让 HTTP 客户端
    // 自动跨 sso → sso-jw → portal 跟到底，否则桥接端会把最终 500 当登录结果。
    const bridgeUrl = redirectTarget(firstRes, LOGIN_URL, JW, "/tpass/bridge");
    if (!bridgeUrl) return false;
    const bridge = await getPage(bridgeUrl, false, { followRedirects: false }).catch(() => null);
    if (!bridge) return false;

    const renew = await getPage(SILENT_LOGIN, false, { followRedirects: false }).catch(() => null);
    return finishPortalTicket(renew);
  }

  async function submitLogin(code) {
    const p = state.pending;
    if (!p || !p.username || !p.password) {
      // 缺凭据时绝不提交（否则 POST 体是 username=undefined，服务端会 500）
      throw { retry: "内部错误：登录凭据未就绪，已重置流程", diag: "pending 缺少 username/password" };
    }
    let res;
    try {
      res = await tide.http.fetch(state.sid, "POST", LOGIN_URL, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Referer": LOGIN_URL,
        },
        body: `username=${encodeURIComponent(p.username)}&password=${encodeURIComponent(rsaEncrypt(p.password))}` +
          `&authcode=${encodeURIComponent(code)}&execution=${encodeURIComponent(p.execution)}` +
          `&encrypted=true&_eventId=submit&loginType=1&rememberMe=true&submit=${encodeURIComponent("登 录")}`,
        followRedirects: false,
      });
    } catch (e) {
      throw { retry: explainHttpError(e) };
    }
    if (await finishPortalLogin(res)) { state.pending = null; return; }
    const body = res.body || "";
    let msg = null;
    if (/密码错误|账号或密码/.test(body)) throw { fatal: "账号或密码错误" };
    const plain = cleanText(body);
    const mm = plain.match(/((?:验证码|密码|账号|用户名|锁定|禁止|失败|不正确|不允许|过期)[^\n。；;]{0,40})/);
    if (mm) msg = mm[1].trim();
    // 失败后 execution 已失效：重置登录页（新 execution + 新验证码）
    state.pending.execution = await fetchLoginHtml();
    await fetchCaptcha();
    const isServerErr = res.status >= 500;
    const diag = isServerErr
      ? `诊断：HTTP ${res.status} · 服务端会话异常（残留会话或 execution 失效），自动登录会换新会话重试`
      : `诊断：HTTP ${res.status} · 登录未建立，请核对验证码`;
    throw {
      retry: msg || `登录未通过（HTTP ${res.status}），已重置登录页，请重试`,
      diag,
      status: res.status,
    };
  }

  // 静默续期：先试桥接端；若只剩主 SSO 的 CASTGC，则补走一次主 SSO → bridge 后再换门户票据。
  async function silentRenew() {
    // 先试 sso-jw 自己的 CASTGC；若只有主 SSO 的 CASTGC，再由 finishPortalLogin
    // 显式完成主 SSO → bridge → sso-jw → portal，所有一次性 ticket 均只消费一次。
    const renew = await getPage(SILENT_LOGIN, false, { followRedirects: false }).catch(() => null);
    if (await finishPortalTicket(renew)) return true;
    const primary = await getPage(LOGIN_URL, false, { followRedirects: false }).catch(() => null);
    return finishPortalLogin(primary);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  function startAutoRefresh(el) {
    stopAutoRefresh();
    if (!state.autoRefresh) return;
    autoRefreshTimer = setInterval(() => {
      if (!el.isConnected) { stopAutoRefresh(); return; }
      if (document.visibilityState !== "hidden" && state.token && !state.fetching) loadPage(1);
    }, AUTO_REFRESH_MS);
  }

  /* ── 通知数据 ── */
  async function loadPage(page = 1, renewed = false) {
    if (state.fetching) return;
    state.fetching = true;
    paintStatus();
    try {
      let res;
      try {
        res = await tide.http.fetch(state.sid, "POST", PORTAL + "/tp_up/up/pim/allpim/getAllPimList", {
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Referer": referer(),
            "Cookie": "tp_up=" + state.token,
          },
          body: JSON.stringify({ pageNum: page, pageSize: PAGE_SIZE }),
        });
      } catch (e) {
        throw new Error(explainHttpError(e));
      }
      if (res.status !== 200) throw new Error(`列表接口 HTTP ${res.status}，会话可能已过期`);
      let d;
      try { d = JSON.parse(res.body); } catch { throw new Error("会话已过期，请重新登录"); }
      if (!Array.isArray(d.list)) throw new Error("列表格式异常或会话已过期，请重新登录");
      const items = d.list;
      if (page === 1) state.notices = items;
      else {
        const ids = new Set(state.notices.map((x) => x.RESOURCE_ID));
        state.notices = state.notices.concat(items.filter((x) => !ids.has(x.RESOURCE_ID)));
      }
      state.page = page;
      state.hasMore = items.length >= PAGE_SIZE && page < PAGES_MAX;
      state.fetchedAt = Date.now();
      state.error = null;
      // v0.11.0：新通知先进入统一收件箱，用户确认后再转任务，避免自动化误建日程。
      if (page === 1 && tide.inbox && typeof tide.inbox.create === "function") {
        for (const it of items.slice(0, 12)) {
          const title = titleOf(it);
          const key = itemKey(it);
          tide.inbox.create({ sourceKey: `cppu:${key}`, title, note: "警大门户新通知 · 打开通知详情后可进一步识别日期和时间", suggestion: "create-task" });
        }
      }
    } catch (e) {
      // 会话过期先尝试静默续期一次
      if (!renewed && await silentRenew()) {
        state.fetching = false;
        return loadPage(page, true);
      }
      state.error = String(e.message || e);
    }
    state.fetching = false;
    paintAll();
    return !state.error;
  }

  async function loadDetail(rid) {
    const cur = state.details[rid] || {};
    if (cur.content || cur.loading) return;
    state.details[rid] = { loading: true };
    updateDetail(rid);
    try {
      let res;
      try {
        res = await tide.http.fetch(state.sid, "POST", PORTAL + "/tp_up/up/pim/showpim/getPimDetailInfoById", {
          headers: {
            "Content-Type": "application/json;charset=utf-8",
            "Referer": referer(),
            "Cookie": "tp_up=" + state.token,
          },
          body: JSON.stringify({ RESOURCE_ID: rid }),
        });
      } catch (e) {
        throw new Error(explainHttpError(e));
      }
      if (res.status !== 200) throw new Error(`详情接口 HTTP ${res.status}`);
      const arr = JSON.parse(res.body);
      const d = Array.isArray(arr) ? arr[0] : null;
      let text = "";
      if (d) {
        const cu = d.CONTENT_URL || "";
        if (cu) {
          const url = cu.startsWith("http") ? cu : PORTAL + "/tp_up/" + cu.replace(/^\//, "");
          const cres = await getPage(url, false, { headers: { "Referer": referer(), "Cookie": "tp_up=" + state.token } });
          if (cres.status !== 200) throw new Error(`正文接口 HTTP ${cres.status}`);
          const mm = cres.body.match(/^[^(]*\(([\s\S]*)\)\s*;?\s*$/);
          let obj;
          try { obj = JSON.parse(mm ? mm[1] : cres.body); text = obj.result || obj.content || ""; }
          catch { text = cres.body; }
        } else {
          text = d.PIM_CONTENT || "";
        }
      }
      state.details[rid] = { content: cleanText(text) || "（正文为空，可能内容在附件中）" };
    } catch (e) {
      state.details[rid] = { error: String(e.message || e) };
    }
    updateDetail(rid);
  }

  /* ── 过滤与渲染 ── */
  function filtered() {
    const kw = state.filter.kw.trim().toLowerCase();
    const rows = state.notices.filter((it) => {
      if (state.filter.month !== "all" && monthOf(it) !== state.filter.month) return false;
      if (state.filter.hideSeen && state.seen.has(itemKey(it))) return false;
      if (kw) {
        const hay = `${titleOf(it)} ${it.CREATE_USER_NAME || ""} ${it.BELONG_UNIT_NAME || ""} ${it.TYPE_NAME || ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
    return rows.sort((a, b) => Number(b.IS_TOP || 0) - Number(a.IS_TOP || 0) || Number(b.CREATE_TIME || 0) - Number(a.CREATE_TIME || 0));
  }

  function paintStatus() {
    if (!ui) return;
    if (state.fetching && !state.notices.length) { ui.status.innerHTML = "正在拉取通知…"; return; }
    if (state.error) { ui.status.innerHTML = `<span class="err">${esc(state.error)}</span>`; return; }
    const at = state.fetchedAt ? new Date(state.fetchedAt).toTimeString().slice(0, 5) : "—";
    ui.status.innerHTML = `${esc(state.username ? "学号 " + state.username : "")} · 已更新 ${at} · 拉取 ${state.notices.length} 条 · 显示 <b>${filtered().length}</b> 条`;
  }

  function paintChips() {
    if (!ui) return;
    const months = [...new Set(state.notices.map(monthOf))].filter((mo) => mo !== "unknown").sort().reverse();
    ui.months.replaceChildren(...[{ id: "all", label: "全部" }, ...months.map((mo) => ({ id: mo, label: monthLabel(mo) }))].map((c) => {
      const b = document.createElement("button");
      b.className = "pp-chip" + (state.filter.month === c.id ? " on" : "");
      b.textContent = c.label;
      b.addEventListener("click", () => { state.filter.month = c.id; saveFilter(); paintChips(); paintList(true); });
      return b;
    }));
    ui.hs.classList.toggle("on", !!state.filter.hideSeen);
  }

  function detailHtml(rid) {
    const det = state.details[rid];
    return !det || det.loading ? "正在加载正文…" :
      det.error ? `<span style="color:#B03535;font-size:12px">${esc(det.error)}</span><button class="pp-btn" data-retry>重试加载正文</button>` :
      `<div class="c">${esc(det.content)}</div><div class="pp-act"><button class="pp-btn" data-remind>转为提醒</button></div>`;
  }

  function updateDetail(rid) {
    if (!ui?.list) return;
    const card = [...ui.list.querySelectorAll(".pp-card")].find((node) => node.dataset.rid === rid);
    const detail = card?.querySelector("[data-detail-content]");
    if (detail) detail.innerHTML = detailHtml(rid);
  }

  function setCardExpanded(card, open) {
    if (!card) return;
    card.classList.toggle("open", open);
    card.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.setAttribute("aria-expanded", String(open));
      if (btn.classList.contains("pp-expand")) btn.firstChild && (btn.firstChild.textContent = open ? "收起正文" : "展开正文");
      if (btn.classList.contains("pp-heading")) {
        const title = btn.textContent.trim();
        btn.setAttribute("aria-label", `${title}，${open ? "收起正文" : "展开正文"}`);
      }
    });
    card.querySelector(".pp-detail-shell")?.setAttribute("aria-hidden", String(!open));
  }

  function cardHtml(it) {
    const rid = itemKey(it);
    const key = rid;
    const isNew = !state.seen.has(key);
    const t = Number(it.CREATE_TIME || 0);
    const timeStr = t ? new Date(t).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
    const open = state.expanded.has(rid);
    return `<div class="pp-card${open ? " open" : ""}" data-rid="${esc(rid)}">
      <button class="pp-title pp-heading" data-toggle aria-expanded="${open}" aria-label="${esc(titleOf(it))}，${open ? "收起正文" : "展开正文"}">${esc(titleOf(it))}</button>
      <div class="pp-meta">
        ${it.IS_TOP === "1" ? '<span class="pp-tag top">置顶</span>' : ""}
        ${it.IS_READ === "0" ? '<span class="pp-tag unread">未读</span>' : ""}
        ${it.TYPE_NAME ? `<span class="pp-tag">${esc(it.TYPE_NAME)}</span>` : ""}
        <span>发布：${esc(it.CREATE_USER_NAME || "—")}（${esc(it.BELONG_UNIT_NAME || "—")}）</span>
        <span>${timeStr}</span>
        ${isNew ? '<span class="pp-tag unread">NEW</span>' : ""}
      </div>
      <button class="pp-btn pp-expand" data-toggle aria-expanded="${open}"><span>${open ? "收起正文" : "展开正文"}</span></button>
      <div class="pp-detail-shell" aria-hidden="${!open}"><div class="pp-detail-clip"><div class="pp-detail" data-detail-content>${detailHtml(rid)}</div></div></div>
    </div>`;
  }

  function paintList(reset) {
    if (!ui) return;
    if (reset) state.renderedCount = CHUNK;
    const rows = filtered();
    const slice = rows.slice(0, state.renderedCount);
    const token = ++paintToken;

    if (!slice.length) {
      ui.list.innerHTML = `<div class="pp-empty">${state.notices.length
        ? "没有符合过滤条件的通知<br>试试换个关键词或切回「全部」月份"
        : state.error ? "" : "还没有通知，点上方「刷新」拉取"}</div>`;
      return;
    }

    let html = "", lastMonth = "";
    const counts = {};
    for (const it of rows) counts[monthOf(it)] = (counts[monthOf(it)] || 0) + 1;
    for (const it of slice) {
      const mo = monthOf(it);
      if (mo !== lastMonth) {
        html += `<div class="pp-month">${esc(monthLabel(mo))} · ${counts[mo]} 条</div>`;
        lastMonth = mo;
      }
      html += cardHtml(it);
    }
    ui.list.innerHTML = html;

    const more = document.createElement("div");
    more.className = "pp-more";
    if (state.renderedCount < rows.length) {
      const b = document.createElement("button");
      b.className = "pp-btn";
      b.textContent = `▾ 显示更多（本页还有 ${rows.length - state.renderedCount} 条）`;
      b.addEventListener("click", () => { if (token === paintToken) { state.renderedCount += CHUNK; paintList(); } });
      more.append(b);
    } else if (state.hasMore) {
      const b = document.createElement("button");
      b.className = "pp-btn";
      b.textContent = state.fetching ? "正在加载更早的通知…" : `加载更早的通知（第 ${state.page + 1} 页）`;
      b.addEventListener("click", () => { if (token === paintToken) loadPage(state.page + 1); });
      more.append(b);
    } else if (state.notices.length) {
      more.innerHTML = `<div style="font-size:11px;color:#A9B2BA">已加载的通知全部展示</div>`;
    }
    ui.list.append(more);

    // 哨兵元素：滚到底自动补渲染下一块（IO 异步触发，不占滚动帧）
    if (state.renderedCount < rows.length) {
      const sentinel = document.createElement("div");
      sentinel.style.height = "1px";
      ui.list.append(sentinel);
      observeSentinel(sentinel, () => {
        if (token !== paintToken) return;
        state.renderedCount += CHUNK;
        paintList();
      });
    }
  }

  function paintAll() { paintStatus(); paintChips(); paintList(); }

  async function toReminder(it) {
    const title = titleOf(it);
    const det = state.details[itemKey(it)];
    const content = det && det.content ? det.content : "";
    const p = tide.util.parseWhen(`${title} ${cleanText(content).slice(0, 300)}`);
    const cat = tide.util.guessCategory(`${title} ${content}`);
    const task = tide.tasks.create({
      title, quad: tide.util.guessQuad(p.date),
      estMin: p.endMin ? p.endMin - p.startMin : 60,
      due: p.date, tags: ["警大通知"],
      note: PORTAL + "/tp_up/view?m=up",
    });
    if (p.date && p.startMin !== null) {
      const placement = tide.blocks.createSmart({ date: p.date, start: tide.util.hhmmOf(p.startMin), durMin: p.endMin ? p.endMin - p.startMin : 60, title, taskId: task.id, cat });
      tide.notify(placement.moved
        ? `已创建提醒：「${title.slice(0, 20)}${title.length > 20 ? "…" : ""}」· 原时段冲突，自动改到 ${placement.block.start}`
        : `已创建提醒：「${title.slice(0, 20)}${title.length > 20 ? "…" : ""}」→ ${p.date.slice(5)} ${tide.util.hhmmOf(p.startMin)}`, {
        actionLabel: "查看", ms: 6500, action: () => tide.util.navigate("timeblock"),
      });
    } else if (p.date) {
      const placement = tide.blocks.createSmart({ date: p.date, start: "09:00", durMin: 60, title, taskId: task.id, cat });
      tide.notify(placement.moved ? `识别到日期 ${p.date.slice(5)}；09:00 冲突，已改到 ${placement.block.start}` : `识别到日期 ${p.date.slice(5)}，提醒先放在 09:00`);
    } else {
      tide.notify("通知里没识别到日期，任务已存入象限池");
    }
    state.seen.add(itemKey(it));
    saveSeen();
    paintList();
  }

  function setSeen(rid) { state.seen.add(rid); saveSeen(); }

  /* ── 左侧校园服务栏：标题 / 图标自动识别 ── */
  function faGlyph(name) {
    return `<svg viewBox="0 0 512 512" aria-hidden="true"><use href="/icons/fontawesome/solid.svg#${esc(name || "globe")}"></use></svg>`;
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
  }
  // 站点标题的可用性判定：门户会把人重定向到 SSO，抓到「统一身份认证平台」这类
  // 登录页标题，邮箱页甚至会返回 ' + COMPANY_NAME + ' 这种模板占位符，一律不显示。
  function usableTitle(title) {
    const t = String(title || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 26) return "";
    if (/['"+${}]|COMPANY_NAME|undefined|null|<\/?[a-z]/i.test(t)) return "";
    if (/统一身份认证|身份认证|^登录|登录$|login|sign\s?in|首页|门户首页/i.test(t)) return "";
    return t;
  }
  function linkIcon(item) {
    const meta = linkMeta[item.url] || {};
    // 字形兜底优先用入口自带的语义图标（shield-halved / envelope / school / id-card），
    // 比通用推断出来的图标更好区分；没写才用网页推断结果。
    const fallback = faGlyph(item.icon || meta.iconName || "globe");
    if (!meta.iconUrl) return fallback;
    // 站点 favicon 优先；读图失败（未登录 / 内网 / 跨域）时退回字形图标。
    return `<img src="${esc(meta.iconUrl)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">`
      + `<span style="display:none">${fallback}</span>`;
  }
  function sideHtml() {
    const rows = QUICK_LINKS.map((item) => {
      const meta = linkMeta[item.url] || {};
      const recognized = usableTitle(meta.title);
      const host = meta.host || hostOf(item.url);
      // 主标题用短名（稳定、可扫读），自动识别到的站点标题放副行；没写短名时才拿识别结果当主标题。
      const name = item.label || recognized || host;
      const sub = item.label ? (recognized || host) : host;
      const tip = [item.label, recognized, item.url].filter(Boolean).join(" · ")
        + (TICKET_LINKS[item.url] ? " · 用统一身份认证自动换票，免密直达" : "");
      return `<button type="button" class="pp-side-btn" data-goto="${esc(item.url)}" title="${esc(tip)}">`
        + `<span class="pp-side-ico">${linkIcon(item)}</span>`
        + `<span class="pp-side-txt"><b>${esc(name)}</b><small>${esc(sub)}</small></span>`
        + `</button>`;
    }).join("");
    return `<div class="pp-side-inner">`
      + `<div class="pp-side-head"><span>校园服务</span>`
      + `<span class="pp-side-acts">`
      + `<button type="button" class="pp-side-sync" data-link-sync title="重新识别标题与图标" aria-label="重新识别标题与图标">↻</button>`
      + `<button type="button" class="pp-side-sync" data-side-toggle aria-expanded="true" title="收起校园服务" aria-label="收起校园服务">◂</button>`
      + `</span></div>`
      + `<div class="pp-side-list">${rows}</div>`
      + `<div class="pp-side-note">标题与图标自动识别<br>点一下用浏览器打开</div>`
      + `</div>`;
  }
  // 收起/展开开关。做成 .pp-shell 的 flex 子项而不是浮层：永不压住正文，且收起时它天然落在左上角。
  function sideToggleHtml() {
    return `<button type="button" class="pp-side-toggle" data-side-toggle aria-expanded="${state.sideOpen ? "true" : "false"}" title="展开校园服务" aria-label="展开校园服务"><span aria-hidden="true">▸</span>校园服务</button>`;
  }
  function sideShellClass() { return state.sideOpen ? "pp-shell" : "pp-shell side-collapsed"; }
  function applySideOpen(root, open) {
    state.sideOpen = !!open;
    const shell = root && root.querySelector ? root.querySelector(".pp-shell") : null;
    if (shell) shell.classList.toggle("side-collapsed", !state.sideOpen);
    const btns = root && root.querySelectorAll ? root.querySelectorAll("[data-side-toggle]") : [];
    for (const b of btns) b.setAttribute("aria-expanded", state.sideOpen ? "true" : "false");
  }
  function paintSide(root) {
    const box = root && root.querySelector ? root.querySelector("[data-side]") : null;
    if (box) box.innerHTML = sideHtml();
  }
  async function loadLinkMeta(root, force = false) {
    if (typeof tide.util?.web?.parseSiteMeta !== "function") return;
    try {
      if (!force) {
        const saved = await tide.storage.get(LINK_META_KEY, null);
        if (saved && typeof saved === "object") linkMeta = { ...saved, ...linkMeta };
      }
    } catch { /* 存储不可用时用内存里的 */ }
    let changed = false;
    for (const item of QUICK_LINKS) {
      const cached = linkMeta[item.url];
      if (!force && cached && Date.now() - Number(cached.at || 0) < LINK_META_TTL) continue;
      try {
        const res = await tide.http.getCached(item.url, 10 * 60 * 1000);
        if (res && Number(res.status) >= 400) throw new Error(`HTTP ${res.status}`);
        const meta = tide.util.web.parseSiteMeta(res?.body || "", res?.finalUrl || item.url);
        linkMeta[item.url] = { title: meta.title, host: meta.host || hostOf(item.url), iconUrl: meta.iconUrl, iconName: meta.iconName, at: Date.now() };
      } catch {
        // 抓不到就留旧结果（可能已有识别过的标题），至少保证 host / 图标名可用。
        linkMeta[item.url] = { ...(cached || {}), host: cached?.host || hostOf(item.url), iconName: cached?.iconName || item.icon, at: Date.now() };
      }
      changed = true;
      paintSide(root);   // 识别一条更新一条，不等四个站点全回来
    }
    if (changed) { try { await tide.storage.set(LINK_META_KEY, linkMeta); } catch { /* 忽略 */ } }
  }
  /* ── 需要登录的入口：现场换一张一次性 ticket，交给系统浏览器消费 ──
     ① 会话还在时，直接向 sso-jw 要票，一次请求就够；
     ② 要不到说明 sso-jw 域没会话，就用主 SSO 的 CASTGC 补走一次 bridge 落会话，再要一次。
     全程 followRedirects:false —— ticket 是一次性的，跟着重定向跑到底就等于把票吃了，
     浏览器拿到的反而是一张废票。所以只取 Location，绝不消费。 */
  async function mintTicket(entry) {
    const ask = () => {
      const url = JW + "/tpass/login?service=" + encodeURIComponent(entry.service);
      return getPage(url, false, { followRedirects: false }).then((res) => ({ res, url }));
    };
    const pick = ({ res, url }) => redirectTarget(res, url, entry.origin, entry.path);
    try {
      const direct = pick(await ask());
      if (direct) return direct;
      const bridge = SSO + "/tpass/login?service=" + encodeURIComponent(JW + "/tpass/bridge");
      const hop = await getPage(bridge, false, { followRedirects: false }).catch(() => null);
      const bridgeTicket = hop ? redirectTarget(hop, bridge, JW, "/tpass/bridge") : "";
      if (!bridgeTicket) return "";
      await getPage(bridgeTicket, false, { followRedirects: false }).catch(() => null);
      return pick(await ask());
    } catch { return ""; }
  }

  async function openSideLink(url, btn) {
    const entry = TICKET_LINKS[url];
    if (!entry || !state.sid) { tide.util.openUrl(url); return; }
    if (btn && btn.setAttribute) btn.setAttribute("aria-busy", "1");
    const ticket = await mintTicket(entry);
    if (btn && btn.removeAttribute) btn.removeAttribute("aria-busy");
    if (ticket) { tide.util.openUrl(ticket); return; }
    // 换不到票就退回裸链接（会落到统一身份认证登录页），不能让入口点了没反应
    tide.util.openUrl(url);
    tide.notify("没换到免登票据，已按普通方式打开，可能需要先登录一次");
  }

  function bindSide(root) {
    if (!root || root.dataset.ppSideBound) return;
    root.dataset.ppSideBound = "1";
    root.addEventListener("click", (e) => {
      const go = e.target.closest("[data-goto]");
      if (go) { openSideLink(go.dataset.goto, go); return; }
      if (e.target.closest("[data-side-toggle]")) { applySideOpen(root, !state.sideOpen); return; }
      if (e.target.closest("[data-link-sync]")) {
        loadLinkMeta(root, true).then(() => tide.notify("已重新识别校园服务的标题与图标"));
      }
    });
  }

  /* ── 登录界面 ── */
  function paintLogin(el, errMsg, opts = {}) {
    const hasSaved = !!state.username;
    const canVault = typeof tide.vault?.get === "function";
    el.innerHTML = `<div class="${sideShellClass()}">
      <aside class="pp-side" data-side>${sideHtml()}</aside>${sideToggleHtml()}
      <div class="pp-main"><div class="pp-login">
      <h3>登录智慧警大门户</h3>
      <div class="d">中国人民警察大学统一门户（portal-jw.cppu.edu.cn）。系统会先自动恢复上次会话，失败后自动识别验证码完成登录；都行不通才需要在这里核对信息。</div>
      <div class="d"><b>自动登录状态：</b>记住账号 ${state.rememberUsername ? "✓" : "✗"} · 票据静默续期 ✓ · 加密保存密码 ${state.autoLogin && canVault ? "✓" : "✗"} · 验证码自动识别 ✓</div>
      ${hasSaved ? `<div class="saved">已自动填入账号 ${esc(state.username)}${state.autoLogin && state.savedPassword ? "与保存的密码" : ""}。验证码会自动识别预填，核对无误直接点「登 录」即可。</div>` : ""}
      <label>学号 / 用户名</label><input data-u aria-label="学号 / 用户名" type="text" value="${esc(state.username)}" autocomplete="off">
      <label>密码</label><input data-p aria-label="密码" type="password" autocomplete="current-password" value="${esc(state.autoLogin ? state.savedPassword : "")}">
      <label>验证码</label>
      <div class="pp-caprow">
        <input data-code aria-label="验证码" type="text" maxlength="4" placeholder="4 位字符" value="${esc(opts.prefillCode || "")}">
        <div class="capbox" data-capbox title="点击更换"><img data-cap src="${esc(state.captcha)}"><small>看不清？点图换一张</small></div>
      </div>
      <div class="row" style="margin-top:12px;gap:12px;align-items:center;flex-wrap:wrap">
        <label class="pp-toggle ${state.rememberUsername ? "on" : ""}" data-remember><i></i>记住账号</label>
        ${canVault ? `<label class="pp-toggle ${state.autoLogin ? "on" : ""}" data-autologin><i></i>记住密码并自动登录</label>` : ""}
        <span data-switchuser style="font-size:12px;color:#7E8B94;cursor:pointer">清除上次账号</span>
        ${state.autoLogin && canVault ? `<span data-clearauth style="font-size:12px;color:#7E8B94;cursor:pointer">清除保存的密码</span>` : ""}
      </div>
      <button class="submit" data-go style="width:100%;height:40px;border-radius:10px;background:#0F4C5C;color:#fff;font-size:14px;font-weight:600;margin-top:14px;cursor:pointer">登 录</button>
      <div class="err" data-err>${esc(errMsg || "")}</div>
      <div class="sec">开启「记住密码并自动登录」后，密码与门户会话票据会加密保存在本机密钥库（AES-256-GCM），下次打开自动登录、直达通知列表；不会进入数据备份、同步或其他插件。关闭后只记住账号，密码仅本次内存使用。</div>
      </div></div>
    </div>`;
    bindSide(el);
    loadLinkMeta(el);

    const errEl = el.querySelector("[data-err]");
    const codeEl = el.querySelector("[data-code]");
    const capImg = el.querySelector("[data-cap]");
    const userEl = el.querySelector("[data-u]");
    const passEl = el.querySelector("[data-p]");
    const rememberEl = el.querySelector("[data-remember]");
    const autoEl = el.querySelector("[data-autologin]");
    const prefillSamples = opts.ocrSamples || null;
    el.querySelector("[data-capbox]").addEventListener("click", async () => {
      errEl.textContent = "正在换验证码…";
      try {
        const url = await fetchCaptcha();
        if (capImg) capImg.src = url;   // 直接更新登录表单里的验证码图
        errEl.textContent = "";
        // 换图后同样自动识别预填
        const ocr = await OCR.recognize(url);
        if (ocr.code) {
          codeEl.value = ocr.code;
          state._manualSamples = ocr.samples;
          state._manualCode = ocr.code;
        }
      } catch (e) {
        errEl.textContent = e.message || e;
      }
    });
    rememberEl.addEventListener("click", () => {
      state.rememberUsername = !state.rememberUsername;
      rememberEl.classList.toggle("on", state.rememberUsername);
      tide.storage.set("rememberUsername", state.rememberUsername);
      if (!state.rememberUsername) tide.storage.set("username", "");
    });
    if (autoEl) autoEl.addEventListener("click", () => {
      state.autoLogin = !state.autoLogin;
      autoEl.classList.toggle("on", state.autoLogin);
      tide.storage.set("autoLogin", state.autoLogin);
      if (!state.autoLogin) clearSavedLogin();
      tide.notify(state.autoLogin ? "已开启记住密码并自动登录" : "已关闭自动登录，并清除保存的密码");
    });
    el.querySelector("[data-switchuser]").addEventListener("click", () => {
      state.username = "";
      tide.storage.set("username", "");
      userEl.value = "";
      userEl.focus();
    });
    el.querySelector("[data-clearauth]")?.addEventListener("click", async () => {
      await clearSavedLogin();
      passEl.value = "";
      tide.notify("已清除保存的密码与会话票据");
    });

    let loggingIn = false;
    const doLogin = async () => {
      if (loggingIn) return;
      const username = userEl.value.trim();
      const password = passEl.value;
      const code = codeEl.value.trim();
      if (!username || !password || !code) { errEl.textContent = "请填写学号、密码和验证码"; return; }
      if (!state.pending?.execution) { errEl.textContent = "登录页尚未准备好，请稍候再试"; return; }
      loggingIn = true; el.querySelector("[data-go]").disabled = true;
      errEl.textContent = "正在走 SSO 链路（登录 → bridge → 门户）…";
      try {
        state.pending = { username, password, execution: state.pending?.execution };
        await submitLogin(code);
        state.username = username;
        if (state.rememberUsername) tide.storage.set("username", username);
        else tide.storage.set("username", "");
        await persistCredentials(password);
        await saveCookies();
        // 验证码若来自自动识别且登录成功 → 样本确认，后续识别更准
        if (prefillSamples && code === (opts.prefillCode || "")) OCR.confirmSamples(prefillSamples);
        else if (state._manualSamples && code === state._manualCode) OCR.confirmSamples(state._manualSamples);
        state.savedPassword = state.autoLogin ? password : "";
        passEl.value = "";
        tide.notify("登录成功，正在获取门户通知");
        buildMain(el);
        loadPage(1);
      } catch (e2) {
        if (e2 && e2.fatal) { errEl.textContent = e2.fatal; }
        else {
        errEl.innerHTML = esc((e2 && e2.retry) || e2.message || "登录失败") +
          (e2 && e2.diag ? `<br><span style="font-size:10.5px;color:#A9B2BA;word-break:break-all">${e2.diag}</span>` : "");
        // 失败后 submitLogin 已重置登录页并换了新验证码：顺手再自动识别预填一次
        const ocr = await OCR.recognize(state.captcha).catch(() => null);
        if (ocr?.code) {
          codeEl.value = ocr.code;
          state._manualSamples = ocr.samples;
          state._manualCode = ocr.code;
        }
        }
      } finally {
        loggingIn = false;
        const button = el.querySelector("[data-go]"); if (button) button.disabled = false;
        if (state.pending) delete state.pending.password;
      }
    };
    el.querySelector("[data-go]").addEventListener("click", doLogin);
    for (const input of [userEl, passEl, codeEl]) {
      input.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") doLogin();
      });
    }
    setTimeout(() => (hasSaved && state.savedPassword ? codeEl : userEl).focus(), 0);

    // 首次进入：拉登录页 + 验证码，并自动识别预填
    (async () => {
      try {
        await newSession();
        if (!state.pending?.execution || !state.captcha) {
          state.pending = { execution: await fetchLoginHtml() };
          await fetchCaptcha();
        }
        if (!codeEl.value) {
          const ocr = await OCR.recognize(state.captcha).catch(() => null);
          if (ocr?.code) { codeEl.value = ocr.code; state._manualSamples = ocr.samples; state._manualCode = ocr.code; }
        }
      } catch (e) {
        errEl.textContent = e.message || e;
      }
    })();
  }

  function buildMain(el) {
    el.innerHTML = `<div class="${sideShellClass()}">
      <aside class="pp-side" data-side>${sideHtml()}</aside>${sideToggleHtml()}
      <div class="pp-main"><div class="pp-wrap">
      <div style="font-size:11px;letter-spacing:.3em;color:#7E8B94;margin:16px 0 4px">警 大 门 户 通 知 · 内 置 插 件</div>
      <div class="pp-toolbar">
        <button class="pp-btn pri" data-refresh>刷新</button>
        <input class="pp-kw" data-kw type="text" placeholder="关键词过滤：标题 / 发布人 / 单位 / 分类…">
        <label class="pp-toggle" data-hs><i></i>只看未读</label>
        <label class="pp-toggle" data-ar title="打开插件期间每 10 分钟自动同步一次"><i></i>自动刷新</label>
        <span style="flex:1"></span>
        <button class="pp-btn" data-relogin>重新登录</button>
      </div>
      <div class="pp-toolbar"><span class="pp-lab">月份</span><div class="pp-chips" data-months></div></div>
      <div class="pp-status" data-status></div>
      <div data-list></div>
      <div style="height:30px"></div>
      </div></div>
    </div>`;

    ui = {
      status: el.querySelector("[data-status]"),
      months: el.querySelector("[data-months]"),
      list: el.querySelector("[data-list]"),
      kw: el.querySelector("[data-kw]"),
      hs: el.querySelector("[data-hs]"),
      ar: el.querySelector("[data-ar]"),
      count: document.createElement("b"),
    };
    ui.kw.value = state.filter.kw;
    ui.hs.classList.toggle("on", !!state.filter.hideSeen);
    ui.ar.classList.toggle("on", !!state.autoRefresh);
    let kwTimer = null;
    ui.kw.addEventListener("input", () => {
      clearTimeout(kwTimer);
      kwTimer = setTimeout(() => { state.filter.kw = ui.kw.value; saveFilter(); paintAll(); }, 200);
    });
    ui.kw.addEventListener("keydown", (e) => e.stopPropagation());
    ui.hs.addEventListener("click", () => { state.filter.hideSeen = !state.filter.hideSeen; saveFilter(); paintChips(); paintList(true); });
    ui.ar.addEventListener("click", () => {
      state.autoRefresh = !state.autoRefresh;
      ui.ar.classList.toggle("on", state.autoRefresh);
      tide.storage.set("autoRefresh", state.autoRefresh);
      startAutoRefresh(el);
      tide.notify(state.autoRefresh ? "已开启自动刷新：每 10 分钟同步警大通知" : "已关闭警大通知自动刷新");
    });
    el.querySelector("[data-refresh]").addEventListener("click", () => loadPage(1));
    el.querySelector("[data-relogin]").addEventListener("click", () => {
      stopAutoRefresh();
      state.token = ""; state.notices = []; state.details = {}; state.expanded.clear(); state.pending = null; state.captcha = ""; state.sid = null; ui = null;
      paintLogin(el);
    });

    io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting) && sentinelCb) sentinelCb();
    }, { root: el, rootMargin: "320px" });

    ui.list.addEventListener("click", async (e) => {
      const card = e.target.closest(".pp-card");
      if (!card) return;
      const rid = card.dataset.rid;
      const it = state.notices.find((x) => itemKey(x) === rid);
      if (!it) return;
      if (e.target.closest("[data-remind]")) { await toReminder(it); return; }
      if (e.target.closest("[data-retry]")) { loadDetail(rid); return; }
      if (!e.target.closest("[data-toggle]")) return;
      if (state.expanded.has(rid)) {
        state.expanded.delete(rid);
        setCardExpanded(card, false);
      } else {
        state.expanded.add(rid);
        setSeen(rid);
        setCardExpanded(card, true);
        loadDetail(rid);
      }
    });

    paintAll();
    startAutoRefresh(el);
    if (!state.notices.length && !state.fetching) loadPage(1);
    bindSide(el);
    loadLinkMeta(el);
  }

  function render(el) {
    let disposed = false;
    stopAutoRefresh();
    ensureStyle();
    el.innerHTML = `<div class="${sideShellClass()}"><aside class="pp-side" data-side>${sideHtml()}</aside>${sideToggleHtml()}<div class="pp-main">`
      + `<div style="padding:30px;text-align:center;color:#A9B2BA;font-size:12.5px">正在恢复登录状态…</div>`
      + `</div></div>`;
    bindSide(el);
    loadLinkMeta(el);
    loadPrefs().then(async () => {
      if (disposed) return;
      // 每次进入都重新验证票据，避免插件在应用内放置较久后拿着过期 token 直接进空列表。
      // 自动登录三级链路：恢复票据静默续期 → 保存的密码 + 验证码识别 → 人工表单（预填）
      const ok = await autoLogin(el);
      // autoLogin 失败路径里已经 paintLogin（含预填）；这里只兜「无凭据直接表单」
      if (!ok && !el.querySelector(".pp-login")) {
        try {
          await newSession();
          state.pending = { execution: await fetchLoginHtml() };
          await fetchCaptcha();
        } catch { state.captcha = ""; }
        paintLogin(el, "");
      }
    });
    return () => { disposed = true; stopAutoRefresh(); io?.disconnect(); };
  }

  tide.ui.registerView({ id: "cppu-notify", title: "警大通知", icon: 'building-columns', render });
})();
