const fs = require("node:fs");
const { chromium } = require("playwright");

const cookieFile = process.env.CPPU_COOKIE_FILE;
const adapterFile = process.env.CPPU_ADAPTER_FILE;
if (!cookieFile || !adapterFile) throw new Error("CPPU_COOKIE_FILE and CPPU_ADAPTER_FILE are required");

const cookies = fs.readFileSync(cookieFile, "utf8").split(/\r?\n/).flatMap((originalLine) => {
  if (!originalLine || (originalLine.startsWith("#") && !originalLine.startsWith("#HttpOnly_"))) return [];
  const httpOnly = originalLine.startsWith("#HttpOnly_");
  const line = httpOnly ? originalLine.slice("#HttpOnly_".length) : originalLine;
  const [domain, , path, secure, expires, name, ...valueParts] = line.split("\t");
  if (!domain || !name || !/(^|\.)cppu\.edu\.cn$/.test(domain)) return [];
  const cookie = { domain, path: path || "/", secure: secure === "TRUE", httpOnly, name, value: valueParts.join("\t") };
  if (Number(expires) > 0) cookie.expires = Number(expires);
  return [cookie];
});

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto("https://jw.cppu.edu.cn/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(7000);
    await page.evaluate(() => {
      window.__cppuVerification = { done: false, config: null, courseCount: 0, validCount: 0, error: null };
      window.shiguangBridgePromise = {
        async saveCourseConfig(text) { window.__cppuVerification.config = JSON.parse(text); return true; },
        async saveImportedCourses(text) {
          const courses = JSON.parse(text);
          window.__cppuVerification.courseCount = courses.length;
          window.__cppuVerification.validCount = courses.filter((course) =>
            course.name && course.day >= 1 && course.day <= 7 && course.startSection >= 1 &&
            course.endSection >= course.startSection && Array.isArray(course.weeks) && course.weeks.length
          ).length;
          return true;
        },
      };
      window.shiguangBridge = {
        showToast(message) { if (/\u5931\u8d25/.test(String(message))) window.__cppuVerification.error = String(message); },
        notifyTaskCompletion() { window.__cppuVerification.done = true; },
      };
    });
    await page.evaluate(fs.readFileSync(adapterFile, "utf8"));
    await page.waitForFunction(() => window.__cppuVerification.done || window.__cppuVerification.error, null, { timeout: 70000 });
    const result = await page.evaluate(() => window.__cppuVerification);
    console.log(JSON.stringify(result, null, 2));
    if (!result.done || result.error || result.courseCount < 1 || result.validCount !== result.courseCount) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
