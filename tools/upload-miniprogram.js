#!/usr/bin/env node
// U-Time · 小程序代码上传（miniprogram-ci）
//
// 前置条件（缺一不可）：
//   1. 正式小程序 appid（wx 开头 18 位）——测试号 touristappid 无法上传
//   2. 微信公众平台 → 开发管理 → 开发设置 →「小程序代码上传密钥」下载的 private.key
//   3. 同一页面把本机「公网 IP」加入「IP 白名单」（否则报 47001 / ip not in whitelist）
//
// 用法：
//   node tools/upload-miniprogram.js --appid wx1234... --key ./private.key
//   node tools/upload-miniprogram.js --appid wx1234... --key ./private.key -v 1.0.0 -d "首次提交"
//   node tools/upload-miniprogram.js --check          # 只做环境与配置自检，不上传
//
// 参数也可以走环境变量（CI 友好）：MP_APPID / MP_KEY / MP_VERSION / MP_DESC / MP_ROBOT
// miniprogram-ci 从 node 全局工作区加载：
//   NODE_PATH=<工作区>/node_modules node tools/upload-miniprogram.js ...

const path = require("path");
const fs = require("fs");

// 依赖链里的 punycode 弃用警告跟上传无关，别污染输出
process.noDeprecation = true;

const ROOT = path.resolve(__dirname, "..");
const PROJECT_DIR = path.join(ROOT, "miniprogram");

/* ── 参数解析 ── */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check" || a === "--dry-run") out.check = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--write-appid") out.writeAppid = true;
    else if (a === "--appid") out.appid = argv[++i];
    else if (a === "--key" || a === "--private-key-path") out.key = argv[++i];
    else if (a === "-v" || a === "--version") out.version = argv[++i];
    else if (a === "-d" || a === "--desc") out.desc = argv[++i];
    else if (a === "--robot") out.robot = argv[++i];
    else if (a === "--project") out.project = argv[++i];
  }
  return out;
}

const HELP = `用法: node tools/upload-miniprogram.js --appid <wx...> --key <private.key> [-v 版本] [-d 说明]

  --appid <id>        小程序 appid（必填，正式号；也读 MP_APPID）
  --key <path>        代码上传密钥 private.key 路径（必填；也读 MP_KEY）
  -v, --version <v>   上传版本号，默认取 package 版本或 1.0.0（也读 MP_VERSION）
  -d, --desc <text>   版本备注，默认取最近一条 git commit（也读 MP_DESC）
  --robot <1-30>      指定 CI 机器人序号，不填则走普通提交
  --write-appid       顺手把 appid 写进 miniprogram/project.config.json
  --check             只自检环境与参数，不上传
`;

/* ── 载入 miniprogram-ci（装在隔离工作区，不在项目里留 node_modules） ── */
function loadCI() {
  // 坑：miniprogram-ci 依赖的 npm-conf 在 win32 下直接 path.resolve(process.env.APPDATA, ...)，
  // 某些 shell / CI 环境没设 APPDATA，会抛 "paths[0] must be of type string"。这里先兜底。
  if (process.platform === "win32" && !process.env.APPDATA && process.env.USERPROFILE) {
    process.env.APPDATA = path.join(process.env.USERPROFILE, "AppData", "Roaming");
  }
  const candidates = [
    "miniprogram-ci",
    path.join(process.env.NODE_PATH || "", "miniprogram-ci"),
    path.join(process.env.USERPROFILE || "", ".workbuddy/binaries/node/workspace/node_modules/miniprogram-ci"),
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 继续找 */ }
  }
  return null;
}

function main() {
  const arg = parseArgs(process.argv.slice(2));
  if (arg.help) { process.stdout.write(HELP); return; }

  const appid = arg.appid || process.env.MP_APPID || "";
  const keyPath = arg.key || process.env.MP_KEY || "";
  const robot = arg.robot || process.env.MP_ROBOT || "";
  const projectPath = path.resolve(arg.project || PROJECT_DIR);

  // 版本号：优先参数，其次 miniprogram/package.json，最后 1.0.0
  let version = arg.version || process.env.MP_VERSION || "";
  if (!version) {
    const pkg = path.join(projectPath, "package.json");
    if (fs.existsSync(pkg)) {
      try { version = JSON.parse(fs.readFileSync(pkg, "utf8")).version || ""; } catch (e) { /* ignore */ }
    }
  }
  if (!version) version = "1.0.0";

  // 备注：默认用最近一条 git 提交
  let desc = arg.desc || process.env.MP_DESC || "";
  if (!desc) {
    try {
      desc = require("child_process")
        .execSync("git log -1 --pretty=%s", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
        .toString().trim() || "U-Time 提交";
    } catch (e) { desc = "U-Time 提交"; }
  }
  desc = desc.slice(0, 100); // 微信限制备注长度

  /* ── 自检 ── */
  const problems = [];
  const ci = loadCI();
  if (!ci) problems.push("未找到 miniprogram-ci，先执行：npm i -g miniprogram-ci（或设置 NODE_PATH 指向其所在 node_modules）");
  if (!fs.existsSync(path.join(projectPath, "app.json"))) problems.push(`小程序目录不存在或缺少 app.json：${projectPath}`);
  if (!appid) problems.push("缺少 appid：用 --appid wx... 传入，或设置环境变量 MP_APPID");
  else if (!/^wx[0-9a-zA-Z]{16}$/.test(appid)) problems.push(`appid 格式不对（应形如 wx + 16 位）：${appid}`);
  else if (appid === "touristappid" || appid === "tourist") problems.push("touristappid 是游客测试号，只能本地预览，不能上传。请到微信公众平台注册小程序拿正式 appid");
  if (!keyPath) problems.push("缺少上传密钥：用 --key ./private.key 传入，或设置环境变量 MP_KEY");
  else if (!fs.existsSync(path.resolve(keyPath))) problems.push(`密钥文件不存在：${path.resolve(keyPath)}`);
  if (robot && !(Number(robot) >= 1 && Number(robot) <= 30)) problems.push("--robot 取值应在 1~30 之间");

  if (problems.length) {
    console.error("上传前自检未通过：");
    problems.forEach((p) => console.error("  ✗ " + p));
    if (!appid || appid === "touristappid") {
      console.error("\n当前 project.config.json 里的 appid：");
      try {
        const cfg = JSON.parse(fs.readFileSync(path.join(projectPath, "project.config.json"), "utf8"));
        console.error("  " + cfg.appid + (cfg.appid === "touristappid" ? "  ← 游客号，需替换" : ""));
      } catch (e) { console.error("  (读取失败)"); }
    }
    process.exit(1);
  }

  if (arg.check) {
    console.log("✓ 自检通过，配置齐全：");
    console.log("  项目目录：" + projectPath);
    console.log("  appid   ：" + appid);
    console.log("  密钥    ：" + path.resolve(keyPath));
    console.log("  版本    ：" + version + (robot ? "（机器人 " + robot + "）" : ""));
    console.log("  备注    ：" + desc);
    console.log("\n去掉 --check 即可真正上传。");
    return;
  }

  /* ── 可选：同步 appid 到 project.config.json ── */
  if (arg.writeAppid) {
    const cfgFile = path.join(projectPath, "project.config.json");
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
      if (cfg.appid !== appid) {
        cfg.appid = appid;
        fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n", "utf8");
        console.log("已把 appid 写入 " + cfgFile);
      }
    } catch (e) { console.warn("写入 appid 失败：" + e.message); }
  }

  /* ── 上传 ── */
  const project = new ci.Project({
    appid,
    type: "miniProgram",
    projectPath,
    privateKeyPath: path.resolve(keyPath),
    ignores: ["node_modules/**/*", ".git/**/*", "**/*.md"],
  });

  console.log("开始上传：" + version + " · " + desc);
  ci.upload({
    project,
    version,
    desc,
    setting: { es6: true, minify: true, minifyWXSS: true, minifyWXML: true, minifyJS: true, codeProtect: false, autoPrefixWXSS: true },
    ...(robot ? { robot: Number(robot) } : {}),
    onProgressUpdate: (info) => {
      if (info && info._msg) process.stdout.write("\r  " + info._msg + "   ");
    },
  }).then(() => {
    process.stdout.write("\r");
    console.log("✓ 上传成功，版本 " + version + " 已进入小程序管理后台「版本管理 → 开发版本」，去那里提交审核即可。");
  }).catch((err) => {
    process.stdout.write("\r");
    const msg = String((err && err.message) || err);
    console.error("✗ 上传失败：" + msg);
    if (/whitelist|47001|ip/i.test(msg)) console.error("  → 多半是 IP 白名单没配：微信公众平台 → 开发管理 → 开发设置 → IP 白名单，把当前公网 IP 加进去");
    else if (/private.?key|decrypt|89001/i.test(msg)) console.error("  → 密钥有问题：确认 private.key 与 appid 匹配，且未被重置");
    else if (/appid/i.test(msg)) console.error("  → appid 与密钥不匹配，或该小程序未开通代码上传权限");
    process.exit(1);
  });
}

main();
