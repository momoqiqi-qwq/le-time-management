// 微信小程序插件联网适配：wx.request 的 Promise 封装 + Set-Cookie 提取。
// 只做网络层；Cookie 解析/合并等纯逻辑在 chaoxingCore.js（可被测试覆盖）。
// 注意：wx.request 不自动管理 Cookie，插件需要自己把 Set-Cookie 存进会话并在请求头里带回。
//   开发者工具与多数真机会在 res.header 里返回 Set-Cookie（键名大小写不定、值可能是数组）；
//   个别机型不回传 Set-Cookie 时，账号密码登录后拿不到会话，需要改用「Cookie 登录」。

function request(opt) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: opt.url,
      method: opt.method || "GET",
      data: opt.data,
      header: opt.header || {},
      timeout: opt.timeout || 15000,
      dataType: opt.dataType || "json",
      responseType: "text",
      enableHttp2: false,
      success: (res) => resolve(res),
      fail: (err) => reject(new Error((err && err.errMsg) || "网络请求失败")),
    });
  });
}

/* 从响应头里取 Set-Cookie：兼容 Set-Cookie / set-cookie、字符串 / 数组 / 分号串接 */
function setCookiesOf(header) {
  if (!header) return [];
  const out = [];
  for (const key of Object.keys(header)) {
    if (!/^set-cookie$/i.test(key)) continue;
    const v = header[key];
    if (Array.isArray(v)) out.push(...v);
    else if (typeof v === "string") {
      // 有些实现会把多条 Set-Cookie 用逗号拼成一个字符串；按「过期时间后的逗号」粗切会误伤，
      // 学习通的关键 Cookie（UID/FUID/VC3 等）各自独立返回，这里按原样整条交给 mergeCookies 即可。
      out.push(v);
    }
  }
  return out;
}

/* 带 Cookie 罐的会话：调用方传入 cookie 字符串，请求后返回 {res, cookie} */
async function fetchWithCookie(cookie, opt) {
  const header = Object.assign({}, opt.header || {});
  if (cookie) header.Cookie = cookie;
  const res = await request(Object.assign({}, opt, { header }));
  const fresh = setCookiesOf(res.header);
  return { res, fresh };
}

module.exports = { request, setCookiesOf, fetchWithCookie };
