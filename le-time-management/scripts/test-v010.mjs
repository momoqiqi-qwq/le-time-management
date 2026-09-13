import assert from "node:assert/strict";
import { conflictsFor, findAlternatives, previewSchedule } from "../src/scheduleConflict.js";
import { makeSnapshot, parseSnapshot, normalizeWebDavUrl, isPotentiallyUnsafeWebDav } from "../src/syncLayer.js";

const blocks = [
  { id: "a", start: "09:00", durMin: 60, title: "A" },
  { id: "b", start: "11:00", durMin: 30, title: "B" },
];

assert.deepEqual(conflictsFor(blocks, { start: "09:30", durMin: 30 }).map((x) => x.id), ["a"]);
assert.equal(conflictsFor(blocks, { start: "10:00", durMin: 60 }).length, 0, "相邻边界不应算冲突");
assert.equal(conflictsFor(blocks, { start: "09:00", durMin: 60 }, "a").length, 0, "编辑自身时应支持 ignoreId");

const preview = previewSchedule(blocks, { start: "09:15", durMin: 45 }, { dayStart: 8 * 60, dayEnd: 13 * 60, step: 15 });
assert.equal(preview.ok, false);
assert.equal(preview.conflicts[0].id, "a");
assert.equal(preview.alternatives[0].start, "10:00");

const free = findAlternatives(blocks, { start: "11:00", durMin: 30 }, { dayStart: 8 * 60, dayEnd: 13 * 60, step: 15, limit: 3 });
assert.ok(free.length >= 1);
assert.equal(conflictsFor(blocks, { start: free[0].start, durMin: 30 }).length, 0);

const data = { tasks: [{ id: "t1" }], blocks: [{ id: "b1" }], settings: {}, plugins: {} };
const snapshot = makeSnapshot(data, "0.10.0");
assert.equal(snapshot.format, "le-time-management-sync");
assert.equal(snapshot.schema, 1);
assert.equal(parseSnapshot(JSON.stringify(snapshot)).appVersion, "0.10.0");
assert.equal(parseSnapshot(JSON.stringify(data)).format, "legacy-data-json");
assert.throws(() => parseSnapshot('{bad json'), /有效 JSON/);
assert.throws(() => normalizeWebDavUrl("ftp://example.com/a.json"), /http\/https/);
assert.equal(isPotentiallyUnsafeWebDav("http://example.com/a.json"), true);
assert.equal(isPotentiallyUnsafeWebDav("http://127.0.0.1/a.json"), false);
assert.equal(isPotentiallyUnsafeWebDav("https://example.com/a.json"), false);

console.log("v0.10.0 helpers: OK");
