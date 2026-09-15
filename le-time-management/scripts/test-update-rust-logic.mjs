/*
 * 真跑一遍 update.rs 的纯逻辑（不依赖 cargo / 不依赖任何 crate）。
 *
 * 为什么要这么绕：`update.rs` 的版本比较、产物挑选、文件名与 URL 校验是**更新器的安全边界**
 * —— 挑错产物会变成「装完还是旧版，每次启动都提示更新」的死循环；文件名校验漏了就是
 * 路径穿越。这些逻辑必须真跑一遍断言，而不是 grep 源码里有没有某个字符串。
 *
 * 做法：从 update.rs 里**原文切出**「纯逻辑」段与它自带的 `#[cfg(test)] mod tests`，
 * 拼成一个独立 .rs，再用 rustc --test 编译执行。切的是原文而不是抄一份，
 * 所以测的就是仓库里那份代码本身（抄一份会随源码漂移，等于没测）。
 *
 * 没有 rustc 时跳过（不误报失败）—— 本机 / CI 上装了 Rust 就会自动生效。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const updateRs = path.join(appRoot, "src-tauri", "src", "update.rs");

const source = fs.readFileSync(updateRs, "utf8");

/* ── 定位 rustc ── */
function findRustc() {
  const candidates = [
    process.env.RUSTC,
    path.join(os.homedir(), ".rustup", "toolchains", "stable-x86_64-pc-windows-msvc", "bin", "rustc.exe"),
    path.join(os.homedir(), ".cargo", "bin", "rustc"),
    "rustc",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const rustc = findRustc();
if (!rustc) {
  console.log("SKIP: 未找到 rustc，跳过 update.rs 纯逻辑实跑（装了 Rust 会自动生效）");
  process.exit(0);
}

/* ── 切出纯逻辑段与测试模块 ──
   两个锚点必须同时存在：它们一改名，这个测试就该失败并提醒改锚点，
   而不是静默退化成「什么都没测」。 */
const PURE_START = "/* ───────────────────────── 纯逻辑（可单测） ───────────────────────── */";
const PURE_END = "/* ───────────────────────── 命令 ───────────────────────── */";
const TESTS_ANCHOR = "#[cfg(test)]\nmod tests {";

const pureStart = source.indexOf(PURE_START);
const pureEnd = source.indexOf(PURE_END);
const testsStart = source.indexOf(TESTS_ANCHOR);
if (pureStart < 0 || pureEnd < 0 || pureEnd <= pureStart) {
  throw new Error("update.rs 的「纯逻辑」段锚点找不到了，请同步更新 test-update-rust-logic.mjs");
}
if (testsStart < 0) {
  throw new Error("update.rs 里找不到 `#[cfg(test)] mod tests {`，纯逻辑单测被删了？");
}

const pureSection = source.slice(pureStart, pureEnd);
const testsModule = source.slice(testsStart);

/** 去掉行注释与块注释：注释里提到 `reqwest`/`crate::` 不代表真有依赖，不该误判。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

// 纯逻辑段必须真的没有外部依赖，否则这个「独立编译」的做法本身就失效了。
const pureCode = stripComments(pureSection);
for (const forbidden of ["serde", "tauri", "reqwest", "crate::"]) {
  if (pureCode.includes(forbidden)) {
    throw new Error(`纯逻辑段引用了 ${forbidden}，无法独立编译 —— 请把它拆出去或改锚点`);
  }
}

const harness = [
  "// 由 scripts/test-update-rust-logic.mjs 从 src-tauri/src/update.rs 原文切出，勿手改",
  "use std::path::Path;",
  pureSection,
  testsModule,
].join("\n");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "letime-update-rust-"));
const harnessPath = path.join(workDir, "update_logic_harness.rs");
const binaryPath = path.join(workDir, process.platform === "win32" ? "harness.exe" : "harness");
fs.writeFileSync(harnessPath, harness, "utf8");

try {
  const build = spawnSync(rustc, ["--test", "--edition", "2021", "-o", binaryPath, harnessPath], {
    encoding: "utf8",
  });
  if (build.status !== 0) {
    console.error(build.stdout || "");
    console.error(build.stderr || "");
    throw new Error("update.rs 纯逻辑段编译失败（见上方 rustc 输出）");
  }

  const run = spawnSync(binaryPath, ["--test-threads=1"], { encoding: "utf8" });
  process.stdout.write(run.stdout || "");
  process.stderr.write(run.stderr || "");
  if (run.status !== 0) throw new Error("update.rs 纯逻辑单测未通过");

  // 断言「真的跑了测试」，而不是编译出一个 0 用例的空壳二进制还报成功。
  const passed = Number((run.stdout || "").match(/(\d+) passed/)?.[1] || 0);
  if (passed < 8) {
    throw new Error(`只跑了 ${passed} 个用例，预期 ≥8 —— 提取可能失配，等于没测到东西`);
  }
  console.log(`PASS: update.rs 纯逻辑 ${passed} 个用例真跑通过（版本比较 / 产物挑选 / 路径与 URL 校验）`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
