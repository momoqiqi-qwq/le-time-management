import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const currentFile = basename(fileURLToPath(import.meta.url));
const tests = readdirSync(scriptsDir)
  .filter((name) => /^test-.+\.mjs$/.test(name) && name !== currentFile)
  .sort();

if (!tests.length) throw new Error("没有找到 test-*.mjs");

const failed = [];

for (const test of tests) {
  const result = spawnSync(process.execPath, [join(scriptsDir, test)], {
    cwd: dirname(scriptsDir),
    encoding: "utf8",
    stdio: "pipe",
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  // 单个红不中断：全跑完再汇总，否则第一个红会遮住后面所有失败，
  // 改一处要重跑一轮才能逐个看见。
  if (result.status !== 0) {
    failed.push(test);
    console.error(`FAIL: ${test}`);
  }
}

if (failed.length) {
  console.error(`\nFAIL: ${failed.length}/${tests.length} 个测试脚本未通过`);
  for (const test of failed) console.error(`  - ${test}`);
  process.exit(1);
}

console.log(`PASS: ${tests.length} 个测试脚本全部通过`);
