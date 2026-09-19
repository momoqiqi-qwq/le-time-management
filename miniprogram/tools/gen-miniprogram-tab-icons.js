// Generate Mini Program tab icons from the Font Awesome Free SVG sprite bundled with U-Time.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const python = process.platform === "win32" ? "python" : "python3";
const result = spawnSync(python, [path.join(__dirname, "sync-tab-icons.py")], { stdio: "inherit" });
process.exit(result.status ?? 1);
