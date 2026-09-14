async (page) => {
  const records = [];
  const byRequest = new Map();

  const describe = (value, depth = 0) => {
    if (depth > 4) return typeof value;
    if (Array.isArray(value)) {
      return {
        type: "array",
        length: value.length,
        item: value.length ? describe(value[0], depth + 1) : null,
      };
    }
    if (value && typeof value === "object") {
      const keys = Object.keys(value).slice(0, 80);
      return {
        type: "object",
        keys,
        fields: Object.fromEntries(keys.map((key) => [key, describe(value[key], depth + 1)])),
      };
    }
    return value === null ? "null" : typeof value;
  };

  const parameterKeys = (request) => {
    const text = request.postData() || "";
    const contentType = request.headers()["content-type"] || "";
    try {
      if (contentType.includes("application/json")) {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? Object.keys(parsed) : [];
      }
      return [...new Set([...new URLSearchParams(text).keys()])];
    } catch {
      return [];
    }
  };

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "jw.cppu.edu.cn" || request.method() !== "POST" || !url.pathname.startsWith("/je/")) return;
    const record = {
      method: request.method(),
      path: url.pathname,
      queryKeys: [...url.searchParams.keys()],
      bodyKeys: parameterKeys(request),
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
    try {
      const contentType = response.headers()["content-type"] || "";
      if (contentType.includes("json") || contentType.includes("javascript") || contentType.includes("text")) {
        record.responseShape = describe(JSON.parse(await response.text()));
      }
    } catch {
      record.responseShape = "non-json";
    }
  });

  await page.goto("https://jw.cppu.edu.cn/index.html", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  const steps = [];
  for (const label of ["学生服务", "我的课程表", "我的课表", "课表明细"]) {
    const locator = page.getByText(label, { exact: true }).first();
    const count = await locator.count();
    let clicked = false;
    if (count) {
      try {
        await locator.click({ timeout: 5000 });
        clicked = true;
        await page.waitForTimeout(1500);
      } catch {
        clicked = false;
      }
    }
    steps.push({ label, found: count > 0, clicked });
  }

  await page.waitForTimeout(8000);
  return {
    finalHost: new URL(page.url()).hostname,
    finalPath: new URL(page.url()).pathname,
    steps,
    requests: records,
  };
}
