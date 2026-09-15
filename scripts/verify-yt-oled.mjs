import { mergeSettings, DEFAULT_SETTINGS } from "../src/lib/settings.js";

const checks = [];

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) console.error("FAIL", name);
  else console.log("ok  ", name);
}

assert("defaults to oled-black", DEFAULT_SETTINGS.youtube.theme === "oled-black");
assert("Shorts stay visible by default", DEFAULT_SETTINGS.youtube.hideShorts === false);
assert("Playables stay visible by default", DEFAULT_SETTINGS.youtube.hidePlayables === false);
assert(
  "old ytm-only storage still gets youtube theme",
  mergeSettings({ ytm: { followAlongLyrics: false } }).youtube.theme === "oled-black"
);
assert(
  "preserves follow-along when merging youtube",
  mergeSettings({ ytm: { followAlongLyrics: false } }).ytm.followAlongLyrics === false
);
assert(
  "accepts default theme",
  mergeSettings({ youtube: { theme: "default" } }).youtube.theme === "default"
);
assert(
  "rejects unknown theme",
  mergeSettings({ youtube: { theme: "neon" } }).youtube.theme === "oled-black"
);
assert(
  "preserves content filters",
  mergeSettings({ youtube: { hideShorts: true, hidePlayables: true } }).youtube.hideShorts &&
    mergeSettings({ youtube: { hideShorts: true, hidePlayables: true } }).youtube.hidePlayables
);

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} settings checks passed.`);
