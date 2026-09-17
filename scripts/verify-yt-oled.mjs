import { mergeSettings, DEFAULT_SETTINGS } from "../src/lib/settings.js";
import { DEFAULT_CUSTOM_THEME, OLED_PALETTE } from "../src/lib/theme.js";

const checks = [];

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) console.error("FAIL", name);
  else console.log("ok  ", name);
}

assert("defaults to unified custom theme", DEFAULT_SETTINGS.youtube.theme === "custom");
assert("defaults to the OLED preset", DEFAULT_SETTINGS.youtube.customTheme.background === OLED_PALETTE.background);
assert("Shorts stay visible by default", DEFAULT_SETTINGS.youtube.hideShorts === false);
assert("Playables stay visible by default", DEFAULT_SETTINGS.youtube.hidePlayables === false);
assert("SponsorBlock defaults to skip buttons", DEFAULT_SETTINGS.sponsorBlock.categories.sponsor === "button");
assert("SponsorBlock segment colors show by default", DEFAULT_SETTINGS.sponsorBlock.showSegmentColors === true);
assert(
  "old ytm-only storage still gets youtube theme",
  mergeSettings({ ytm: { followAlongLyrics: false } }).youtube.theme === "custom"
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
  mergeSettings({ youtube: { theme: "neon" } }).youtube.theme === "custom"
);
assert(
  "accepts custom theme",
  mergeSettings({ youtube: { theme: "custom" } }).youtube.theme === "custom"
);
assert(
  "fills new installs with the OLED preset",
  mergeSettings({ youtube: { theme: "custom" } }).youtube.customTheme.accent ===
    OLED_PALETTE.accent
);
assert(
  "migrates the old OLED mode into the custom theme",
  mergeSettings({ youtube: { theme: "oled-black", customTheme: DEFAULT_CUSTOM_THEME } }).youtube.theme === "custom" &&
    mergeSettings({ youtube: { theme: "oled-black", customTheme: DEFAULT_CUSTOM_THEME } }).youtube.customTheme.background === OLED_PALETTE.background
);
assert(
  "preserves personalized colors while removing the old OLED mode",
  mergeSettings({ youtube: { theme: "oled-black", customTheme: { ...DEFAULT_CUSTOM_THEME, background: "#112233" } } }).youtube.customTheme.background === "#112233"
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
