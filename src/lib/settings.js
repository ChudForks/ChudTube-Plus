import { CUSTOM_THEME_PRESETS, DEFAULT_CUSTOM_THEME, OLED_PALETTE, mergeCustomTheme } from "./theme.js";

export { DEFAULT_CUSTOM_THEME, mergeCustomTheme } from "./theme.js";

export const YOUTUBE_THEMES = ["default", "custom"];
export const YTM_THEMES = ["default", "oled-black"];
export const LYRIC_THEMES = ["classic", "oled-bounce", "compact"];
export const LYRIC_SOURCES = ["auto", "youtube", "lrclib"];
export const SPONSOR_SKIP_MODES = ["auto", "button", "off"];

export const SPONSOR_CATEGORIES = [
  {
    id: "sponsor",
    label: "Sponsor",
    skipLabel: "Skip sponsor",
    description: "Paid promotions, referrals, and direct advertisements",
    color: "#00d400",
  },
  {
    id: "selfpromo",
    label: "Self promotion",
    skipLabel: "Skip promo",
    description: "Unpaid or self promotion",
    color: "#ffff00",
  },
  {
    id: "interaction",
    label: "Interaction",
    skipLabel: "Skip reminder",
    description: "Subscribe, like, and follow reminders",
    color: "#cc00ff",
  },
  {
    id: "intro",
    label: "Intro",
    skipLabel: "Skip intro",
    description: "Intermission or intro animation",
    color: "#00ffff",
  },
  {
    id: "outro",
    label: "Outro",
    skipLabel: "Skip outro",
    description: "Endcards and credits",
    color: "#0202ed",
  },
  {
    id: "preview",
    label: "Preview",
    skipLabel: "Skip preview",
    description: "Preview, recap, or hook",
    color: "#008fd6",
  },
  {
    id: "music_offtopic",
    label: "Non-music",
    skipLabel: "Skip non-music",
    description: "Non-music section in music videos",
    color: "#ff9900",
  },
  {
    id: "filler",
    label: "Filler",
    skipLabel: "Skip filler",
    description: "Filler tangents and jokes",
    color: "#7300ff",
  },
];

const DEFAULT_CATEGORY_MODES = Object.fromEntries(
  SPONSOR_CATEGORIES.map((category) => [category.id, "button"])
);

export const DEFAULT_SETTINGS = {
  sponsorBlock: {
    showSegmentColors: true,
    categories: { ...DEFAULT_CATEGORY_MODES },
  },
  ytm: {
    followAlongLyrics: true,
    lyricsTheme: "classic",
    lyricsSource: "auto",
    theme: "oled-black",
  },
  youtube: {
    theme: "custom",
    themePreset: "custom",
    hideShorts: false,
    hidePlayables: false,
    customTheme: { ...OLED_PALETTE },
  },
};

export function sponsorCategoryModes(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const stored = source.categories && typeof source.categories === "object" ? source.categories : {};
  const fallback = typeof source.autoSkip === "boolean"
    ? source.autoSkip ? "auto" : "off"
    : "button";
  const categories = {};
  for (const { id } of SPONSOR_CATEGORIES) {
    const value = stored[id] ?? fallback;
    categories[id] = SPONSOR_SKIP_MODES.includes(value) ? value : DEFAULT_CATEGORY_MODES[id];
  }
  return categories;
}

export function mergeSettings(stored) {
  const incoming = stored && typeof stored === "object" ? stored : {};
  const lyricsTheme = incoming.ytm?.lyricsTheme === "ytm" ? "oled-bounce" : incoming.ytm?.lyricsTheme;
  const theme = incoming.youtube?.theme;
  const migratedOledTheme = theme === "oled-black";
  const incomingCustomTheme = incoming.youtube?.customTheme;
  const savedCustomTheme = incomingCustomTheme ? mergeCustomTheme(incomingCustomTheme) : null;
  const hasPersonalizedTheme = savedCustomTheme && Object.keys(DEFAULT_CUSTOM_THEME).some(
    (key) => savedCustomTheme[key] !== DEFAULT_CUSTOM_THEME[key]
  );
  return {
    sponsorBlock: {
      showSegmentColors:
        incoming.sponsorBlock?.showSegmentColors ?? DEFAULT_SETTINGS.sponsorBlock.showSegmentColors,
      categories: sponsorCategoryModes(incoming.sponsorBlock),
    },
    ytm: {
      followAlongLyrics:
        incoming.ytm?.followAlongLyrics ?? DEFAULT_SETTINGS.ytm.followAlongLyrics,
      lyricsTheme: LYRIC_THEMES.includes(lyricsTheme)
        ? lyricsTheme
        : DEFAULT_SETTINGS.ytm.lyricsTheme,
      lyricsSource: LYRIC_SOURCES.includes(incoming.ytm?.lyricsSource)
        ? incoming.ytm.lyricsSource
        : DEFAULT_SETTINGS.ytm.lyricsSource,
      theme: YTM_THEMES.includes(incoming.ytm?.theme)
        ? incoming.ytm.theme
        : DEFAULT_SETTINGS.ytm.theme,
    },
    youtube: {
      theme: migratedOledTheme
        ? "custom"
        : YOUTUBE_THEMES.includes(theme)
          ? theme
          : DEFAULT_SETTINGS.youtube.theme,
      hideShorts: incoming.youtube?.hideShorts ?? DEFAULT_SETTINGS.youtube.hideShorts,
      hidePlayables: incoming.youtube?.hidePlayables ?? DEFAULT_SETTINGS.youtube.hidePlayables,
      themePreset: CUSTOM_THEME_PRESETS.some((preset) => preset.id === incoming.youtube?.themePreset)
        ? incoming.youtube.themePreset
        : DEFAULT_SETTINGS.youtube.themePreset,
      customTheme: migratedOledTheme && !hasPersonalizedTheme
        ? { ...OLED_PALETTE }
        : savedCustomTheme
          ? savedCustomTheme
          : { ...DEFAULT_SETTINGS.youtube.customTheme },
    },
  };
}

export async function getSettings() {
  const result = await chrome.storage.sync.get("settings");
  return mergeSettings(result.settings);
}

export async function setSettings(next) {
  const merged = mergeSettings(next);
  await chrome.storage.sync.set({ settings: merged });
  return merged;
}

export function onSettingsChanged(callback) {
  const listener = (changes, area) => {
    if (area !== "sync" || !changes.settings) return;
    callback(mergeSettings(changes.settings.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
