import assert from "node:assert/strict";
import { CURRENT_SCHEMA_VERSION, migrateState } from "../src/migrations.js";

const legacy = {
  version: 1,
  tasks: [{ id: "t1", title: "保留旧任务" }],
  blocks: [],
  settings: { theme: "classic" },
  plugins: {},
  unknownFutureField: { keep: true },
};

const migrated = migrateState(legacy);
assert.equal(migrated.dataSchemaVersion, CURRENT_SCHEMA_VERSION);
assert.equal(migrated.tasks[0].title, "保留旧任务");
assert.deepEqual(migrated.unknownFutureField, { keep: true });
assert.equal(legacy.dataSchemaVersion, undefined, "migration must not mutate the loaded snapshot");
assert.equal(migrateState(migrated).dataSchemaVersion, CURRENT_SCHEMA_VERSION, "migration must be idempotent");
assert.throws(
  () => migrateState({ dataSchemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
  /更新版本/,
  "newer data must not be silently downgraded",
);

console.log("PASS: data schema migration preserves legacy and unknown fields");
