import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../src/store.js';

const memory = new Map();
globalThis.localStorage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
await S.initStore({ tasks: [], blocks: [], inbox: [], settings: {}, plugins: {}, automation: {} });

const AI = await import('../src/aiAutomation.js');
const a = AI.saveAiAutomationRule({ name: '晚间整理', instruction: '整理未完成任务', schedule: { type: 'daily', time: '22:30' } });
const b = AI.saveAiAutomationRule({ name: '工作日晨报', instruction: '总结今天任务', schedule: { type: 'weekdays', time: '08:00', weekdays: [1,2,3,4,5] } });
assert.equal(AI.getAiAutomationRules().length, 2, '支持多个 AI 自动任务');
assert.match(AI.aiScheduleLabel(a), /每天 22:30/);
assert.match(AI.aiScheduleLabel(b), /周一、二、三、四、五 08:00/);
AI.setAiAutomationEnabled(a.id, false);
assert.equal(AI.getAiAutomationRules().find(x => x.id === a.id).enabled, false);
AI.deleteAiAutomationRule(a.id);
assert.equal(AI.getAiAutomationRules().length, 1);

const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const rust = read('../src-tauri/src/lib.rs');
const styles = read('../src/styles.css');
const theme = read('../src/theme.js');
const shell = read('../src/shell.js');
const aiAutomation = read('../src/aiAutomation.js');

assert.match(rust, /AES_256_GCM/);
assert.match(rust, /ai_vault_save/);
assert.match(rust, /ai_vault_clear/);
assert.match(rust, /ai_chat/);
assert.doesNotMatch(theme, /id:\s*["']elder["']/);
assert.doesNotMatch(styles, /\.elder-root|\.care-home/);
assert.match(shell, /view\.animate/);
assert.match(aiAutomation, /禁止.*本地文件|不能读取、写入、删除本地文件/);
assert.match(aiAutomation, /create_task/);
assert.match(aiAutomation, /create_timeblock/);
assert.doesNotMatch(aiAutomation, /readPluginFile|deletePlugin|importPluginZip/);

console.log('PASS: v0.11.6 AI encrypted vault wiring, multiple schedules, no-local-file boundary, and jump animation');
