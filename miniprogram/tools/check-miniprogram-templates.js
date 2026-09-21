// 可选：官方 miniprogram-ci 的 WXML 模板词法解析 + 标签配对 + WXSS 语法检查。
// 不依赖宿主 node.dll；这不是完整 WCC 编译，也不上传、不读取密钥。
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const ROOT = path.resolve(__dirname, "..");
const CI = process.env.MINI_CI_ROOT ? path.resolve(process.env.MINI_CI_ROOT) : path.resolve(ROOT, "../tools/.wx-compiler/node_modules/miniprogram-ci");
const { minifyWXML } = require(path.join(CI, "dist/modules/corecompiler/original/workerThread/task/minifywxml.js"));
const postcss = createRequire(path.join(CI,"package.json"))("postcss");
function paired(source, name) {
  const stripped = source.replace(/<!--[\s\S]*?-->/g, "").replace(/\{\{[\s\S]*?\}\}/g, "value");
  const stack=[];
  for (const match of stripped.matchAll(/<\s*(\/?)([a-zA-Z][\w:.-]*)\b[^>]*?(\/?)>/g)) {
    const [,closing,tag,self]=match;
    if (closing) { if (stack.pop() !== tag) throw new Error(name+": 标签未正确配对 "+tag); }
    else if (!self) stack.push(tag);
  }
  if(stack.length) throw new Error(name+": 标签未闭合 "+stack.join(","));
}
async function main() {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT,"app.json"),"utf8"));
  let templates=app.pages.map(page=>page+".wxml"), styles=app.pages.map(page=>page+".wxss").concat(["app.wxss"]);
  if(process.argv.includes("--existing-only")){templates=templates.filter(f=>fs.existsSync(path.join(ROOT,f)));styles=styles.filter(f=>fs.existsSync(path.join(ROOT,f)));}
  for(const file of templates){
    const source=fs.readFileSync(path.join(ROOT,file),"utf8");
    const result=await minifyWXML({filePath:file,code:source,setting:{collapseWhitespace:false,preserveLineBreaks:true}});
    if(result.error)throw new Error(file+": "+result.error.message);
    paired(source,file);
  }
  for(const file of styles)postcss.parse(fs.readFileSync(path.join(ROOT,file),"utf8"),{from:file});
  console.log(JSON.stringify({scope:"official WXML tokenizer + balanced tags + WXSS syntax; not WCC/device acceptance",templates:templates.length,styles:styles.length,uploaded:false},null,2));
}
main().catch(error=>{console.error(error.stack||String(error));process.exitCode=1;});
