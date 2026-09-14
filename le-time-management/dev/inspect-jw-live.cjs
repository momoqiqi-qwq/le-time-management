const fs = require("node:fs");
const { chromium } = require("playwright");

const cookieFile = process.env.CPPU_COOKIE_FILE;
if (!cookieFile) throw new Error("CPPU_COOKIE_FILE is required");

const cookies = fs.readFileSync(cookieFile, "utf8")
  .split(/\r?\n/)
  .flatMap((originalLine) => {
    if (!originalLine || (originalLine.startsWith("#") && !originalLine.startsWith("#HttpOnly_"))) return [];
    const httpOnly = originalLine.startsWith("#HttpOnly_");
    const line = httpOnly ? originalLine.slice("#HttpOnly_".length) : originalLine;
    const [domain, , path, secure, expires, name, ...valueParts] = line.split("\t");
    if (!domain || !name || !/(^|\.)cppu\.edu\.cn$/.test(domain)) return [];
    const cookie = {
      domain,
      path: path || "/",
      secure: secure === "TRUE",
      httpOnly,
      name,
      value: valueParts.join("\t"),
    };
    if (Number(expires) > 0) cookie.expires = Number(expires);
    return [cookie];
  });

const describe = (value) => {
  if (Array.isArray(value)) return { type: "array", length: value.length, itemKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]) : [] };
  if (value && typeof value === "object") {
    const result = { type: "object", keys: Object.keys(value) };
    for (const key of ["rows", "data", "obj", "result"]) {
      if (key in value) result[key] = describe(value[key]);
    }
    return result;
  }
  return value === null ? "null" : typeof value;
};

const parameterKeys = (request) => {
  const body = request.postData() || "";
  try {
    if ((request.headers()["content-type"] || "").includes("application/json")) return Object.keys(JSON.parse(body));
    return [...new Set([...new URLSearchParams(body).keys()])];
  } catch {
    return [];
  }
};

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  const records = [];
  const byRequest = new Map();

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "jw.cppu.edu.cn" || request.method() !== "POST" || !url.pathname.startsWith("/je/")) return;
    const params = new URLSearchParams(request.postData() || "");
    const tableCode = params.get("tableCode");
    const functionCode = params.get("FUNCINFO_FUNCCODE");
    const record = {
      path: url.pathname,
      queryKeys: [...url.searchParams.keys()],
      bodyKeys: parameterKeys(request),
      tableCode: tableCode && /^[A-Z0-9_]+$/.test(tableCode) ? tableCode : null,
      functionCode: functionCode && /^[A-Z0-9_]+$/.test(functionCode) ? functionCode : null,
      queryShape: (() => {
        try { const value = JSON.parse(params.get("j_query") || "null"); return describe(value); }
        catch { return null; }
      })(),
      status: null,
      responseShape: null,
    };
    records.push(record);
    byRequest.set(request, record);
  });
  page.on("response", async (response) => {
    const record = byRequest.get(response.request());
    if (!record) return;
    record.status = response.status();
    try { record.responseShape = describe(JSON.parse(await response.text())); }
    catch { record.responseShape = "non-json"; }
  });

  const steps = [];
  try {
    await page.goto("https://jw.cppu.edu.cn/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(7000);
    const probes = await page.evaluate(async () => {
      const post = async (path, params) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
          response = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
            body: new URLSearchParams(params),
            signal: controller.signal,
          });
        } catch (error) {
          return { status: null, json: null, error: error.name };
        } finally {
          clearTimeout(timer);
        }
        let json = null;
        try { json = await response.json(); } catch {}
        return { status: response.status, json };
      };
      const config = await post("/je/develop/funcInfo/getStaticFuncByCode", {
        refresh: "false",
        tableCode: "JE_CORE_FUNCINFO",
        FUNCINFO_FUNCCODE: "V_JWBZK_PK_XSKBZHCX",
        perm: "true",
      });
      return {
        config: {
          status: config.status,
          error: config.error || null,
          rootKeys: config.json ? Object.keys(config.json) : [],
          funcInfoKeys: config.json?.funcInfo ? Object.keys(config.json.funcInfo) : [],
          funcKeys: config.json?.func ? Object.keys(config.json.func) : [],
        },
      };
    });
    const opened = await page.evaluate(() => {
      if (!window.JE || typeof window.JE.openFuncById !== "function") return false;
      window.JE.openFuncById("nrZ3d05LtXB6IN9XWB4");
      return true;
    });
    probes.openedNativeCourseFunction = opened;
    await page.waitForTimeout(20000);
    probes.fullCourseLoad = await page.evaluate(async () => {
      if (!window.Ext?.ComponentQuery) return null;
      const grid = window.Ext.ComponentQuery.query("jegridview").find((item) =>
        item?.funcData?.info?.funcCode === "V_JWBZK_PK_XSKBZHCX"
      );
      if (!grid?.store) return null;
      return await Promise.race([
        new Promise((resolve) => grid.store.load({
          params: { page: 1, start: 0, limit: 5000 },
          callback(records, operation, success) {
            resolve({ success, count: records?.length || 0, total: grid.store.getTotalCount() });
          },
        })),
        new Promise((resolve) => setTimeout(() => resolve({ success: false, timeout: true }), 30000)),
      ]);
    });
    probes.courseFieldStats = await page.evaluate(() => {
      if (!window.Ext?.ComponentQuery) return null;
      const grid = window.Ext.ComponentQuery.query("jegridview").find((item) =>
        item?.funcData?.info?.funcCode === "V_JWBZK_PK_XSKBZHCX"
      );
      if (!grid?.store) return null;
      const rows = grid.store.getRange().map((record) => record.data || record.raw || {});
      const fields = ["XQ", "JC", "SKRQ", "KXXS", "XNXQ_CODE", "ZXS", "KX"];
      return Object.fromEntries(fields.map((field) => [field, [...new Set(rows.map((row) => String(row[field] ?? "")))]]));
    });
    const keywordMatches = [];
    for (const frame of page.frames()) {
      const text = await frame.locator("body").innerText().catch(() => "");
      const matches = [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /(课表|学生服务)/.test(line)))].slice(0, 40);
      if (matches.length) keywordMatches.push({ frameHost: new URL(frame.url()).hostname, matches });
    }
    const relevantRequests = records.filter((record) =>
      record.tableCode === "V_JWBZK_PK_XSKBZHCX" || record.functionCode === "V_JWBZK_PK_XSKBZHCX"
    );
    console.log(JSON.stringify({ finalHost: new URL(page.url()).hostname, finalPath: new URL(page.url()).pathname, probes, steps, keywordMatches, requests: relevantRequests }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
