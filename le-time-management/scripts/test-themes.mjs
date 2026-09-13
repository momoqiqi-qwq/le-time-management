import assert from "node:assert/strict";
import { THEMES, getThemeProfile } from "../src/themeProfiles.js";

assert.equal(new Set(THEMES.map((theme) => theme.id)).size, THEMES.length, "theme ids must be unique");
assert.equal(getThemeProfile("missing").id, "classic", "unknown themes fall back safely");
assert.equal(getThemeProfile("night").colorScheme, "dark");
assert.equal(getThemeProfile("chatgpt").colors.length, 3);
assert.equal(getThemeProfile("claude").colors.length, 3);
assert.equal(getThemeProfile("shadcn").colors.length, 3);
assert.equal(getThemeProfile("shadcn").name, "Shadcn 锌灰");
for (const id of ["celadon", "dunhuang", "blueprint", "citrus", "frost"]) {
  const theme = getThemeProfile(id);
  assert.equal(theme.colors.length, 3, `${id} 要有 3 个预览色`);
  assert.ok(theme.id !== "classic" && theme.name.length > 0 && theme.note.length > 0, `${id} 元数据完整`);
}
assert.ok(THEMES.every((theme) => theme.name && theme.note && Object.isFrozen(theme.colors)));

console.log("PASS: theme profiles, fallbacks and new theme metadata");
