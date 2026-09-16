import { mergeSettings, DEFAULT_SETTINGS, DEFAULT_CUSTOM_THEME } from "../src/lib/settings.js";

const checks = [];

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) console.error("FAIL", name);
  else console.log("ok  ", name);
}

assert("defaults to oled-black", DEFAULT_SETTINGS.youtube.theme === "oled-black");
assert("Shorts stay visible by default", DEFAULT_SETTINGS.youtube.hideShorts === false);
assert("Playables stay visible by default", DEFAULT_SETTINGS.youtube.hidePlayables === false);
assert("SponsorBlock is opt-in", DEFAULT_SETTINGS.sponsorBlock.categories.sponsor === "off");
assert("SponsorBlock segment colors show by default", DEFAULT_SETTINGS.sponsorBlock.showSegmentColors === true);
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
  "accepts custom theme",
  mergeSettings({ youtube: { theme: "custom" } }).youtube.theme === "custom"
);
assert(
  "fills custom theme defaults",
  mergeSettings({ youtube: { theme: "custom" } }).youtube.customTheme.accent ===
    DEFAULT_CUSTOM_THEME.accent
);
assert(
  "preserves a custom color",
  mergeSettings({ youtube: { customTheme: { background: "#112233" } } }).youtube.customTheme
    .background === "#112233"
);
assert(
  "rejects invalid custom colors",
  mergeSettings({ youtube: { customTheme: { background: "red" } } }).youtube.customTheme
    .background === DEFAULT_CUSTOM_THEME.background
);
assert(
  "preserves content filters",
  mergeSettings({ youtube: { hideShorts: true, hidePlayables: true } }).youtube.hideShorts &&
    mergeSettings({ youtube: { hideShorts: true, hidePlayables: true } }).youtube.hidePlayables
);
assert(
  "migrates SponsorBlock auto-skip to per-category auto",
  mergeSettings({ sponsorBlock: { autoSkip: true } }).sponsorBlock.categories.sponsor === "auto" &&
    mergeSettings({ sponsorBlock: { autoSkip: true } }).sponsorBlock.categories.intro === "auto"
);
assert(
  "preserves SponsorBlock skip button mode",
  mergeSettings({ sponsorBlock: { categories: { intro: "button" } } }).sponsorBlock.categories.intro === "button"
);
assert(
  "preserves SponsorBlock marker preference",
  mergeSettings({ sponsorBlock: { showSegmentColors: false } }).sponsorBlock.showSegmentColors === false
);

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} settings checks passed.`);
