// 演示采图驱动：连接本机 Chrome 的 CDP 端口，执行 JS / 真实点击 / 截图落盘。
// 用法：node dev/demo-capture/cdp.mjs <命令> [参数...]
// 命令：nav <url> | eval <js> | shot <相对路径> | click <x> <y> | key <Key> | size <w> <h> | ping
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const PORT = process.env.CDP_PORT || "9333";
const [cmd, ...rest] = process.argv.slice(2);

async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await res.json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("没有找到 page target");
  return page;
}

let ws;
function open(url) {
  ws = new WebSocket(url);
  return new Promise((ok, bad) => {
    ws.onopen = ok;
    ws.onerror = () => bad(new Error("CDP 连接失败"));
  });
}

let seq = 0;
const waiting = new Map();
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, bad) =>
    waiting.set(id, { ok, bad, method })
  );
}

function drain() {
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const { ok, bad, method } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) bad(new Error(`${method}: ${msg.error.message}`));
      else ok(msg.result);
    }
  };
}

const outRoot = resolve(import.meta.dirname, "../../../_demo_capture");

async function main() {
  const page = await targets();
  await open(page.webSocketDebuggerUrl);
  drain();
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");

  if (cmd === "ping") {
    console.log("ok", page.title, page.url);
  } else if (cmd === "size") {
    const [w, h] = rest.map(Number);
    await send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 1, mobile: false,
    });
    console.log(`viewport ${w}x${h}`);
  } else if (cmd === "nav") {
    await send("Page.navigate", { url: rest[0] });
    await new Promise((r) => setTimeout(r, Number(rest[1] || 1500)));
    console.log("navigated", rest[0]);
  } else if (cmd === "eval") {
    const expr = rest.join(" ");
    const r = await send("Runtime.evaluate", {
      expression: `(async () => { ${expr} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      console.error("JS 异常:", r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      process.exitCode = 2;
    } else {
      console.log(typeof r.result.value === "string" ? r.result.value : JSON.stringify(r.result.value, null, 1));
    }
  } else if (cmd === "click") {
    const [x, y] = rest.map(Number);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await send("Input.dispatchMouseEvent", {
        type, x, y, button: "left", clickCount: type === "mouseMoved" ? 0 : 1,
        buttons: type === "mouseReleased" ? 0 : 1,
      });
    }
    console.log(`click ${x},${y}`);
  } else if (cmd === "key") {
    const key = rest[0];
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: keyCodeOf(key) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: keyCodeOf(key) });
    console.log(`key ${key}`);
  } else if (cmd === "shot") {
    const rel = rest[0];
    if (!rel) throw new Error("shot 需要相对路径参数");
    const file = join(outRoot, rel);
    if (!file.startsWith(outRoot)) throw new Error("路径越界: " + rel);
    const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(data, "base64"));
    console.log(file);
  } else {
    throw new Error("未知命令: " + cmd);
  }
}

function keyCodeOf(key) {
  const map = { Enter: 13, Escape: 27, Backspace: 8, Tab: 9, Control: 17, Shift: 16, Alt: 18, Delete: 46 };
  return map[key] || key.toUpperCase().charCodeAt(0);
}

main().then(
  () => { ws?.close(); process.exit(0); },
  (e) => { console.error(String(e.message || e)); process.exit(1); }
);
