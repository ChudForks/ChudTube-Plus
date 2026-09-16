export const YOUTUBE_THEMES = ["default", "oled-black"];
export const YTM_THEMES = ["default", "oled-black"];

export const DEFAULT_SETTINGS = {
  sponsorBlock: {
    autoSkip: false,
    showSegmentColors: true,
  },
  ytm: {
    followAlongLyrics: true,
    theme: "oled-black",
  },
  youtube: {
    theme: "oled-black",
    hideShorts: false,
    hidePlayables: false,
  },
};

export function mergeSettings(stored) {
  const incoming = stored && typeof stored === "object" ? stored : {};
  const theme = incoming.youtube?.theme;
  return {
    sponsorBlock: {
      autoSkip: incoming.sponsorBlock?.autoSkip ?? DEFAULT_SETTINGS.sponsorBlock.autoSkip,
      showSegmentColors:
        incoming.sponsorBlock?.showSegmentColors ?? DEFAULT_SETTINGS.sponsorBlock.showSegmentColors,
    },
    ytm: {
      followAlongLyrics:
        incoming.ytm?.followAlongLyrics ?? DEFAULT_SETTINGS.ytm.followAlongLyrics,
      theme: YTM_THEMES.includes(incoming.ytm?.theme)
        ? incoming.ytm.theme
        : DEFAULT_SETTINGS.ytm.theme,
    },
    youtube: {
      theme: YOUTUBE_THEMES.includes(theme) ? theme : DEFAULT_SETTINGS.youtube.theme,
      hideShorts: incoming.youtube?.hideShorts ?? DEFAULT_SETTINGS.youtube.hideShorts,
      hidePlayables: incoming.youtube?.hidePlayables ?? DEFAULT_SETTINGS.youtube.hidePlayables,
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
