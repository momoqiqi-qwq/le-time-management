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

for (const test of tests) {
  const result = spawnSync(process.execPath, [join(scriptsDir, test)], {
    cwd: dirname(scriptsDir),
    encoding: "utf8",
    stdio: "pipe",
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) {
    console.error(`FAIL: ${test}`);
    process.exit(result.status || 1);
  }
}

console.log(`PASS: ${tests.length} 个测试脚本全部通过`);
