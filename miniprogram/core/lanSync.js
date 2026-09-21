// 复用桌面现有 /api/info、/api/state、/api/push、/api/push-status。
// 不修改服务端三道确认门，不自动传输，不在后台轮询。
const net = require("./pluginNet.js");
const transfer = require("./transfer.js");
const PORT = 27123;
function parseTarget(raw, extraToken) {
  const parts = String(raw || "").trim().split(/\s+/);
  let text = parts[0] || "", token = String(extraToken || parts[1] || "").trim();
  if (!text) throw new Error("请粘贴电脑设置中的局域网配对链接");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "http://" + text;
  const match = text.match(/^(https?):\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?(?:[/?#].*)?$/i);
  if (!match) throw new Error("请使用电脑的局域网 IPv4 地址，例如 192.168.1.5:27123");
  const octets = match[2].split(".").map(Number), port = Number(match[3] || PORT);
  const local = octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  if (!local || octets.some(n => n < 0 || n > 255) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("只连接可信局域网地址，不接受公网或本机回环地址");
  const query = text.match(/[?&]token=([^&#]*)/);
  if (query && query[1]) { try { token = decodeURIComponent(query[1].replace(/\+/g, " ")); } catch (e) { throw new Error("配对码编码无效"); } }
  if (!token || token.length > 500) throw new Error("请填写电脑端配对码");
  return { base: match[1].toLowerCase() + "://" + match[2] + ":" + port, token };
}
async function request(target, path, options) {
  const opt = options || {};
  let url = target.base + path + "?token=" + encodeURIComponent(target.token);
  if (opt.id) url += "&id=" + encodeURIComponent(opt.id);
  let response;
  try {
    response = await net.request({ url, method: opt.method || "GET", data: opt.data, header: { "Content-Type": "application/json" }, timeout: 15000 });
  } catch (e) {
    // wx 的错误有时包含完整请求 URL，不能把配对码带进日志/提示。
    throw new Error("局域网连接失败：请确认同一可信 Wi-Fi、电脑联动服务已启动且允许本地网络访问；微信限制时可改用备份文件互传");
  }
  if (response.statusCode === 403) throw new Error("配对码错误，或电脑未开启“允许手机推回本机”");
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("电脑返回 HTTP " + response.statusCode);
  let data = response.data;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch (e) { throw new Error("电脑返回的不是有效 JSON"); } }
  if (!data || typeof data !== "object") throw new Error("电脑响应无效");
  return data;
}
async function info(target) {
  const data = await request(target, "/api/info");
  if (!data.ok || data.dataOk === false || !Number.isFinite(Number(data.tasks)) || !Number.isFinite(Number(data.blocks))) throw new Error("电脑数据尚不可用，请在电脑上打开 U-Time 后重试");
  return data;
}
async function pull(target) { return transfer.parseFullBackup(await request(target, "/api/state")); }
async function push(target, snapshot) {
  await info(target); // 先核对 U-Time 数据接口，再发送私有快照。
  const data = await request(target, "/api/push", { method: "POST", data: JSON.stringify(transfer.validate(transfer.copy(snapshot))) });
  if (!data.ok || data.status !== "pending" || !data.id) throw new Error("电脑未返回待确认编号，请检查版本与接收开关");
  return data; // pending 不是成功：必须等待电脑弹窗确认，然后查询最终状态。
}
async function status(target, id) {
  const data = await request(target, "/api/push-status", { id });
  if (!["pending", "accepted", "rejected", "expired"].includes(data.status)) throw new Error("未取得最终回执，请到电脑端确认；不能据此判断是否已接收");
  return data;
}
module.exports = { PORT, parseTarget, info, pull, push, status };
