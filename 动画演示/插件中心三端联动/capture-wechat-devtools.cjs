const path = require("path");
const automator = require(path.resolve(__dirname, "../../output/miniprogram-automation/node_modules/miniprogram-automator"));

(async () => {
  const miniProgram = await automator.launch({
    cliPath: "E:/E-Develop-Project/微信web开发者工具/cli.bat",
    projectPath: path.resolve(__dirname, "../../miniprogram"),
    port: 32552,
    trustProject: true,
    timeout: 120000,
  });
  try {
    await miniProgram.reLaunch("/pages/plugins/index");
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const current = await miniProgram.currentPage();
    console.log(`Current WeChat page: ${current.path}`);
    console.log("System:", await miniProgram.systemInfo());
    await miniProgram.screenshot({ path: path.join(__dirname, "real-wechat-plugin-center.png") });
  } finally {
    miniProgram.disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
