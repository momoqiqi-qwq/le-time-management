#!/usr/bin/env node
// 把 Android 端「原生代码」从版本化镜像同步进 Tauri 的生成目录，并补齐只能靠补丁生效的声明。
//
// ── 为什么需要这个脚本 ──
// `src-tauri/gen/android/` 是 Tauri 的生成目录（被 .gitignore 忽略），**重新执行一次
// `tauri android init` 就会把它整个重建**。可手机端真正干活的 Kotlin 只活在那里：
//   · v0.37.12 SchoolImportActivity（教务窗口 close 关不掉）
//   · v0.37.15 MainActivity 安全区注入（WebView 不实现 env(safe-area-inset-*)）
//   · v0.37.17 MainActivity 返回键 handleBackNavigation + 双指缩放
//   · v0.38.0 ApkInstallerPlugin（应用内一键升级）
// 只要有人 init 一次，上面全部静默消失，而且因为目录不进 git，**回滚都没得回**。
//
// ── 事实源与目标 ──
//   事实源：le-time-management/android/gradle/      （版本化镜像，与 gen/android 路径 1:1）
//   目标：  le-time-management/src-tauri/gen/android/
//
// ── 三类处理（刻意分开，别合并成「整目录覆盖」）──
//   ① Kotlin 源码：整份覆盖。这部分百分之百是我们写的，没有上游模板会被盖坏的问题。
//   ② AndroidManifest.xml：**只加不删的补丁** —— 补 REQUEST_INSTALL_PACKAGES、注册
//      .SchoolImportActivity（v0.37.12 手加，不是 Tauri 模板内容）、删 MainActivity 的 label。
//      不做整份覆盖 —— 否则将来 Tauri 模板新增的 permission/provider 会被我们的旧副本吃掉。
//      FileProvider 的 provider 块是 Tauri 模板自带的，**只校验不合成**（合成容易写错一整个块）。
//   ③ res/xml/file_paths.xml：确保 `<cache-path>` 存在。Rust 侧把更新包暂存在
//      `app_cache_dir()`（＝Android 的 `getCacheDir`，内部缓存），FileProvider 靠这条声明才肯共享。
//
// ── 用法 ──
//   node tools/sync-android-native.js            应用（同步 Kotlin + 打补丁）
//   node tools/sync-android-native.js --check    只校验，不写文件
//   node tools/sync-android-native.js --capture  反向：把 gen 里的 Kotlin 现状采纳为镜像
//                                                （只在 `tauri android init` 重建过、需要重建基线时用）
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "le-time-management");
const MIRROR = path.join(APP, "android", "gradle");
const GEN = path.join(APP, "src-tauri", "gen", "android");

const KOTLIN_DIR = "app/src/main/java/com/yile/letime";
/** 我们完整拥有的 Kotlin 源文件（镜像 → gen 整份覆盖）。加新文件就加一条。 */
const SOURCES = [
  "MainActivity.kt",
  "SchoolImportActivity.kt",
  "NativeSchedulePlugin.kt",
  "ApkInstallerPlugin.kt",
];
const MANIFEST = "app/src/main/AndroidManifest.xml";
const FILE_PATHS = "app/src/main/res/xml/file_paths.xml";
/** Android 8.0 起「安装未知来源应用」是按应用授权，没有它系统安装器会被静默拦掉。 */
const INSTALL_PERMISSION = "android.permission.REQUEST_INSTALL_PACKAGES";

const CHECK = process.argv.includes("--check");
const CAPTURE = process.argv.includes("--capture");
const failures = [];
const changes = [];

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
const write = (file, text) => fs.writeFileSync(file, text);

/** gen/android 还不存在（全新 clone 没跑过 `tauri android init`）—— 不是错误，跳过即可。 */
if (!fs.existsSync(GEN)) {
  console.log("── gen/android 尚未生成，跳过 Android 原生同步（先跑一次 `tauri android init`）──");
  process.exit(0);
}

/* ─────────────── ① Kotlin 源码 ─────────────── */

function captureKotlin() {
  const genDir = path.join(GEN, KOTLIN_DIR);
  const mirrorDir = path.join(MIRROR, KOTLIN_DIR);
  fs.mkdirSync(mirrorDir, { recursive: true });
  let captured = 0;
  const present = new Set(fs.existsSync(genDir) ? fs.readdirSync(genDir).filter((f) => f.endsWith(".kt")) : []);
  for (const name of SOURCES) {
    const from = path.join(genDir, name);
    const to = path.join(mirrorDir, name);
    const text = read(from);
    if (text === null) {
      console.log(`  [gen 缺] ${name}`);
      continue;
    }
    present.delete(name);
    if (read(to) === text) {
      console.log(`  [已一致] ${name}`);
      continue;
    }
    write(to, text);
    console.log(`  [已采纳] ${name} → android/gradle/${KOTLIN_DIR}/${name}`);
    captured++;
  }
  if (present.size) {
    console.log(`  ⚠ gen 里还有未纳入镜像的 Kotlin：${[...present].join(", ")}`);
    console.log("    如果是我们写的，请加进 tools/sync-android-native.js 的 SOURCES 后重跑 --capture。");
  }
  console.log(`✓ 已从 gen 采纳 ${captured} 个 Kotlin 文件到版本化镜像`);
}

function syncKotlin() {
  for (const name of SOURCES) {
    const from = path.join(MIRROR, KOTLIN_DIR, name);
    const to = path.join(GEN, KOTLIN_DIR, name);
    const text = read(from);
    if (text === null) {
      failures.push(`镜像缺源文件：android/gradle/${KOTLIN_DIR}/${name}`);
      continue;
    }
    if (read(to) === text) {
      console.log(`  [已一致] ${name}`);
      continue;
    }
    if (CHECK) {
      failures.push(`${name}：gen/android 里的副本与版本化镜像不一致`);
      console.log(`  [不一致] ${name}`);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      write(to, text);
      changes.push(name);
      console.log(`  [已同步] ${name}`);
    }
  }
}

/* ─────────────── ② AndroidManifest.xml 补丁 ─────────────── */

/** 幂等：已存在就原样返回，不重复插入。 */
function ensurePermission(xml, permission) {
  if (xml.includes(permission)) return { xml, changed: false };
  const line = `    <uses-permission android:name="${permission}" />`;
  const usesPermission = /^[ \t]*<uses-permission\b[^>]*\/>/m;
  if (usesPermission.test(xml)) {
    return { xml: xml.replace(usesPermission, (m) => `${m}\n${line}`), changed: true };
  }
  const manifestTag = /<manifest\b[^>]*>/;
  if (manifestTag.test(xml)) {
    return { xml: xml.replace(manifestTag, (m) => `${m}\n${line}`), changed: true };
  }
  return { xml, changed: false, anchorMissing: true };
}

/**
 * 删掉 MainActivity 的 `android:label`。launcher 图标显示的是 activity 级 label，
 * 留着会变成「Le时间管理 · 时间块与四象限」，手机桌面放不下被截断。
 * 教务窗口（SchoolImportActivity）的 label 是**有意保留**的应用内标题，只按 android:name 精确删。
 */
function stripMainActivityLabel(xml) {
  const pat = /(<activity\b(?:(?!>).)*?android:name="\.MainActivity")((?:(?!>).)*?>)/s;
  if (!pat.test(xml)) return { xml, changed: false };
  const out = xml.replace(pat, (_m, head, tail) => {
    const strip = (s) => s.replace(/\n[ \t]*android:label="@string\/main_activity_title"/, "");
    return strip(head) + strip(tail);
  });
  return { xml: out, changed: out !== xml };
}

/** 教务导入窗口专用 Activity 的声明块（v0.37.12 手加，不是 Tauri 模板内容）。 */
const SCHOOL_IMPORT_ACTIVITY_BLOCK = `
        <!-- 教务导入窗口（school_import_open 在 Android 上指定 activity_name）：
             仅应用内启动，不 exported；singleTop 避免重复实例堆栈 -->
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:label="@string/main_activity_title"
            android:launchMode="singleTop"
            android:name=".SchoolImportActivity"
            android:exported="false" />`;

/**
 * 教务导入窗口必须在清单里注册，否则 `startActivity` 直接崩（它是 abstract 的
 * TauriActivity 之外唯一能承载教务页的具体 Activity）。
 *
 * 插入位置优先选 `<provider` **之前**，让两个 activity 挨在一起 —— `<application>` 子元素
 * 顺序在 Android 里不影响行为，但这里的定位原则是「生成结果要能跟 android/gradle 下的
 * 参考副本逐行对上」：`tauri android init` 之后人工比对是唯一的恢复手段，
 * 输出顺序随机的话那次比对就没法做了。
 */
function ensureSchoolImportActivity(xml) {
  if (xml.includes('android:name=".SchoolImportActivity"')) return { xml, changed: false };
  const provider = /^[ \t]*<provider\b/m;
  if (provider.test(xml)) {
    return { xml: xml.replace(provider, (m) => `${SCHOOL_IMPORT_ACTIVITY_BLOCK}\n\n${m}`), changed: true };
  }
  const anchor = "</application>";
  if (xml.includes(anchor)) {
    return { xml: xml.replace(anchor, `${SCHOOL_IMPORT_ACTIVITY_BLOCK}\n    ${anchor}`), changed: true };
  }
  return { xml, changed: false, anchorMissing: true };
}

/**
 * FileProvider 的 provider 块由 Tauri 模板自带，**这里只校验不合成** ——
 * 合成整个 provider 块要把 authority / meta-data 写全，写错一个字母就是运行期才炸的
 * "Failed to find configured root"，不值得。丢了说明模板变了，该由人来看。
 * 它是 APK 一键升级的必要条件：`content://` URI 就是它签发的。
 */
function checkFileProvider(xml) {
  const ok = /android:name="androidx\.core\.content\.FileProvider"/.test(xml);
  if (!ok) {
    failures.push(
      "AndroidManifest.xml：缺 FileProvider（androidx.core.content.FileProvider）声明，" +
        "APK 无法以 content:// 交给系统安装器（Tauri 模板应自带，检查是否被 init 覆盖）",
    );
  }
  return ok;
}

function patchManifest() {
  const file = path.join(GEN, MANIFEST);
  const src = read(file);
  if (src === null) {
    failures.push(`缺少 ${MANIFEST}（gen 未初始化？）`);
    return;
  }
  let xml = src;
  const perm = ensurePermission(xml, INSTALL_PERMISSION);
  xml = perm.xml;
  const activity = ensureSchoolImportActivity(xml);
  xml = activity.xml;
  const label = stripMainActivityLabel(xml);
  xml = label.xml;

  if (!checkFileProvider(xml)) console.log("  [缺失] AndroidManifest.xml 的 FileProvider 声明");

  if (xml === src) {
    console.log(`  [已一致] AndroidManifest.xml（权限 / 教务窗口 / label 都已就位）`);
    return;
  }
  const detail = [
    perm.changed && "补安装权限",
    activity.changed && "注册 SchoolImportActivity",
    label.changed && "去 MainActivity label",
  ]
    .filter(Boolean)
    .join(" + ");
  if (CHECK) {
    failures.push(`AndroidManifest.xml：需要${detail}`);
    console.log(`  [待补] AndroidManifest.xml（${detail}）`);
    return;
  }
  write(file, xml);
  changes.push("AndroidManifest.xml");
  console.log(`  [已补] AndroidManifest.xml（${detail}）`);
}

/* ─────────────── ③ file_paths.xml ─────────────── */

function patchFilePaths() {
  const file = path.join(GEN, FILE_PATHS);
  const src = read(file);
  if (src === null) {
    failures.push(`缺少 ${FILE_PATHS}（更新包暂存目录将无法被 FileProvider 共享）`);
    return;
  }
  // 只要求「有任意一条 cache-path 根」，path 值不锁死 —— 上游换了名字也不算错。
  if (/<cache-path\b[^>]*\/>/.test(src)) {
    console.log("  [已一致] file_paths.xml（cache-path 已声明）");
    return;
  }
  if (CHECK) {
    failures.push("file_paths.xml：缺 <cache-path />，更新包无法通过 FileProvider 交给安装器");
    console.log("  [待补] file_paths.xml（缺 cache-path）");
    return;
  }
  const out = src.replace(/(<paths\b[^>]*>)/, `$1\n  <cache-path name="my_cache_images" path="." />`);
  if (out === src) {
    failures.push("file_paths.xml：找不到 <paths> 根标签，无法补 cache-path");
    return;
  }
  write(file, out);
  changes.push("file_paths.xml");
  console.log("  [已补] file_paths.xml（cache-path）");
}

/* ─────────────── 主流程 ─────────────── */

console.log(`── Android 原生代码${CAPTURE ? "采纳" : CHECK ? "校验" : "同步"}（gen/android）──`);
if (CAPTURE) {
  captureKotlin();
  process.exit(0);
}

syncKotlin();
patchManifest();
patchFilePaths();

if (failures.length) {
  console.error(CHECK ? "\nAndroid 原生一致性检查失败：" : "\nAndroid 原生同步出现问题：");
  failures.forEach((x) => console.error("- " + x));
  if (CHECK) {
    console.error("（Kotlin 差异用 `node tools/sync-android-native.js` 同步；补丁类差异运行同一命令即可）");
  }
  process.exit(1);
}
console.log(
  CHECK
    ? "✓ Android 原生代码与版本化镜像一致（Kotlin / 清单权限与教务窗口 / FileProvider 路径）"
    : changes.length
      ? `✓ 已同步 Android 原生代码：${changes.join("、")}`
      : "✓ Android 原生代码已是最新，无需改动",
);
