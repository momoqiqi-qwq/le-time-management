#!/usr/bin/env node
// 把 Markdown 里的相对路径图片内联成 data URI，产出一个单文件自包含版本。
// 用途：参赛材料要单发给评委，收件人那边没有 docs/architecture/ 目录，相对链接必然不出图。
//
//   node tools/embed-doc-images.js docs/设计原则与整体架构说明.md
//   → output/设计原则与整体架构说明（图片内嵌版）.md
//
// 内联一律用 base64 SVG：九张图合计约 155 KB，且放大不失真；
// 同一批图转成 1.5x 位图要 2 MB 以上，单文件反而更难发送。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join, extname, basename } from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("用法：node tools/embed-doc-images.js <markdown 文件路径> [输出路径]");
  process.exit(1);
}
const srcPath = resolve(src);
const text = readFileSync(srcPath, "utf8");
const outPath = resolve(process.argv[3] || join("output", `${basename(srcPath, extname(srcPath))}（图片内嵌版）.md`));

const misses = [];
const embedded = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, href) => {
  if (/^data:|^https?:/i.test(href)) return m;
  let file;
  try {
    file = resolve(dirname(srcPath), decodeURI(href));
  } catch {
    misses.push(href);
    return m;
  }
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    misses.push(href);
    return m;
  }
  const mime = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" }[extname(file).toLowerCase()];
  if (!mime) {
    misses.push(href);
    return m;
  }
  return `![${alt}](data:${mime};base64,${buf.toString("base64")})`;
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, embedded);

const left = [...embedded.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].filter((m) => !m[1].startsWith("data:")).length;
console.log(`${outPath}`);
console.log(`图片：内联 ${(embedded.match(/data:image\//g) || []).length} 张，仍为相对链接 ${left} 张`);
if (misses.length) console.log(`读不到的图片（原样保留）：${[...new Set(misses)].join(", ")}`);
console.log(`体积：${(Buffer.byteLength(embedded) / 1024).toFixed(0)} KB`);
