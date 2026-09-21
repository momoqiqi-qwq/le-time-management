# v0.91.0

## 小程序插件中心：描述默认隐藏

- 插件卡片的两行说明文字（插件清单 `description` 与小程序适配边界 `miniNote`）改为默认不显示，卡片只剩名称 / 版本 / ID、平台标签与操作按钮，插件较多时一屏能多看几条。
- 「设置 → 插件」新增**插件中心显示描述**开关，打开后恢复显示全部说明。开关值写入 `settings.showPluginDesc`，随同一份 JSON 备份跨端保留。
- 描述隐藏时搜索仍然匹配描述文本，筛除逻辑不变，只是不再显示。
- 收起描述后给平台标签补 18rpx 上边距，避免与首行图标 / 开关贴合。

## 影响范围与限制

- 仅小程序端界面改动；Windows / Android 不读该键，插件宿主与清单无变化。
- 无数据迁移：`settings.showPluginDesc` 缺省即隐藏，等同旧行为下的用户偏好重置。
- 未改动「插件使用说明」文档页与各原生插件页面内的说明文案。

## 验证

- `node tools/check-miniprogram.js` 静态校验通过（含事件处理器存在性检查）。
- `node tools/test-miniprogram-core.js` 51 个用例全部通过。
- `sync-version.js` / `gen-theme-dark.js` / `build-schedule-plugin.js` / `sync-android-native.js` 四项 `--check` 通过，三端版本一致 v0.91.0。
- 常规 `npm test` 73 个测试脚本全部通过。
- 未做微信开发者工具模拟器与真机的视觉验收。
