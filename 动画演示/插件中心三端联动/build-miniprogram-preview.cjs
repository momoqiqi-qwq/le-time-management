const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");
const catalog = require(path.join(projectRoot, "miniprogram", "core", "pluginCatalog.js"));
const plugins = catalog.plugins;
const nativeCount = plugins.filter((item) => item.platforms?.miniprogram === "native").length;
const iconRoot = "../../miniprogram/images/plugins/";

const status = { full: "完整", native: "原生适配", conditional: "需运行时", unavailable: "暂不可用" };
const cards = plugins.slice(0, 5).map((item) => {
  const miniNative = item.platforms?.miniprogram === "native";
  const platforms = [
    ["Win", item.platforms?.windows],
    ["Android", item.platforms?.android],
    ["小程序", item.platforms?.miniprogram],
  ].map(([label, value]) => `<span class="plat ${value}"><b>${label}</b>${status[value] || value}</span>`).join("");
  return `<article class="plugin card">
    <div class="row"><div class="identity"><span class="icon"><img src="${iconRoot}${item.id}.png"></span><span><strong>${item.name}</strong><small>v${item.version} · ${item.id}</small></span></div><i class="switch"></i></div>
    <p>${item.description}</p><div class="platforms">${platforms}</div>
    <button class="${miniNative ? "pri" : "ghost"}">${miniNative ? "打开插件" : "查看平台说明"}</button>
  </article>`;
}).join("");

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>U-Time 小程序插件中心</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;font-family:"Microsoft YaHei UI","PingFang SC",sans-serif;background:#F2EFEA;color:#22303A}.page{padding:12px}.card{background:#fff;border:1px solid #E4DFD6;border-radius:10px;padding:12px;margin-bottom:9px;box-shadow:0 1px 3px rgba(15,23,42,.035)}
.head{padding-bottom:11px}.eyebrow{font-size:10.5px;letter-spacing:.16em;color:#A9B2BA;margin-bottom:6px}.title{font-size:17px;line-height:1.35;font-weight:750;margin-bottom:6px}.desc{font-size:12px;color:#7E8B94;line-height:1.65}.mono{font-family:monospace;color:#0F4C5C}
.tools{padding:10px 11px}.search{height:36px;border:1px solid #E4DFD6;border-radius:8px;background:#F7F6F2;padding:0 10px;font-size:12.5px;color:#A9B2BA;display:flex;align-items:center}.filters{display:flex;gap:5px;margin-top:8px;align-items:center}.chip{padding:5px 8px;border:1px solid #E4DFD6;border-radius:999px;color:#7E8B94;background:#F7F6F2;font-size:10px}.chip.on{color:#fff;background:#0F4C5C;border-color:#0F4C5C}.count{margin-left:auto;color:#A9B2BA;font-size:10px}
.plugin{padding:11px}.row,.identity{display:flex;align-items:center}.row{justify-content:space-between;gap:9px}.identity{gap:9px;min-width:0}.icon{width:35px;height:35px;border-radius:8px;background:#F7F6F2;border:1px solid #E4DFD6;display:grid;place-items:center;flex:none}.icon img{width:21px;height:21px;object-fit:contain}.identity strong{display:block;font-size:14.5px}.identity small{display:block;margin-top:2px;font-size:10px;color:#A9B2BA}.switch{width:37px;height:22px;border-radius:99px;background:#0F4C5C;padding:3px}.switch:after{content:"";display:block;margin-left:auto;width:16px;height:16px;border-radius:50%;background:white}.plugin p{font-size:11px;line-height:1.55;color:#7E8B94;margin:9px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.platforms{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}.plat{display:inline-flex;gap:4px;padding:4px 6px;border-radius:7px;background:#F7F6F2;border:1px solid #E4DFD6;color:#7E8B94;font-size:9.5px}.plat b{color:#22303A}.plat.full,.plat.native{border-color:rgba(46,196,182,.45)}button{width:100%;height:36px;border-radius:7px;border:0;font-size:12.5px;font-weight:600}.pri{background:#0F4C5C;color:#fff}.ghost{background:#fff;border:1px solid #E4DFD6;color:#22303A}
</style></head><body><main class="page"><section class="head card"><div class="eyebrow">三 端 插 件 中 心</div><div class="title">${plugins.length} 个内置插件 · ${nativeCount} 个小程序原生适配</div><div class="desc">Windows 与 Android 共用同一套插件宿主；小程序展示同一清单，并对可移植插件提供原生页面。</div></section><section class="tools card"><div class="search">搜索插件名称 / ID / 功能…</div><div class="filters"><span class="chip on">全部</span><span class="chip">已启用</span><span class="chip">小程序可用</span><span class="count">${plugins.length} / ${plugins.length}</span></div></section>${cards}</main></body></html>`;

fs.writeFileSync(path.join(__dirname, "real-miniprogram-preview.html"), html, "utf8");
console.log(`Generated from miniprogram/core/pluginCatalog.js: ${plugins.length} plugins, ${nativeCount} native`);
