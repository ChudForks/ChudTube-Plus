import { fetchLyrics } from "./lib/lrclib.js";

const CACHE_PREFIX = "ctp-lyrics:";
const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;

const THEME_TAB_URLS = [
  "*://www.youtube.com/*",
  "*://youtube.com/*",
  "*://m.youtube.com/*",
];

const MUSIC_TAB_URLS = [
  "*://music.youtube.com/*",
  "*://*.music.youtube.com/*",
];

chrome.runtime.onInstalled.addListener(() => {
  console.info("[ChudTube+] service worker ready");
  injectThemeIntoOpenTabs();
  applyThemeToMusicTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectThemeIntoOpenTabs();
  applyThemeToMusicTabs();
});

async function injectThemeIntoOpenTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: THEME_TAB_URLS });
  } catch (error) {
    console.warn("[ChudTube+] tab query failed", error);
    return;
  }
  for (const tab of tabs) {
    if (tab.id == null) continue;
    if (/music\.youtube\.com/i.test(tab.url || "")) continue;
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["src/content/yt.css"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/yt-boot.js"],
      });
    } catch (error) {
      console.warn("[ChudTube+] theme inject failed", tab.id, error);
    }
  }
}

async function applyThemeToMusicTabs(theme) {
  if (theme === undefined) {
    const stored = await chrome.storage.sync.get("settings");
    theme = stored.settings?.ytm?.theme === "default" ? "default" : "oled-black";
  }
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: MUSIC_TAB_URLS });
  } catch (error) {
    console.warn("[ChudTube+] music tab query failed", error);
    return;
  }
  for (const tab of tabs) {
    if (tab.id == null) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (nextTheme) => {
          const root = document.documentElement;
          const enabled = nextTheme === "oled-black";
          root.toggleAttribute("data-ctp-ytm-theme", enabled);
          if (enabled) root.setAttribute("data-ctp-ytm-theme", "oled-black");
        },
        args: [theme],
      });
    } catch (error) {
      console.warn("[ChudTube+] music theme apply failed", tab.id, error);
    }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.settings) return;
  const theme = changes.settings.newValue?.ytm?.theme === "default" ? "default" : "oled-black";
  applyThemeToMusicTabs(theme);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CTP_FETCH_LYRICS") return false;
  handleFetch(message.track)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        status: "error",
        source: "lrclib",
        synced: false,
        lines: [],
        plain: "",
        error: error?.message || "Failed to fetch lyrics",
      });
    });
  return true;
});

async function handleFetch(track) {
  const key = cacheKey(track);
  const cached = await readCache(key);
  if (cached) return cached;

  const result = await fetchLyrics(track);
  if (result.status === "found" || result.status === "instrumental" || result.status === "not_found") {
    await writeCache(key, result);
  }
  return result;
}

function cacheKey(track) {
  const title = (track?.title || "").trim().toLowerCase();
  const artist = (track?.artist || "").trim().toLowerCase();
  const duration = Number.isFinite(track?.duration) ? Math.round(track.duration) : "";
  return `${CACHE_PREFIX}${artist}::${title}::${duration}`;
}

async function readCache(key) {
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key];
  if (!entry?.result || !entry.fetchedAt) return null;
  const ttl = entry.result.status === "found" || entry.result.status === "instrumental"
    ? FOUND_TTL_MS
    : MISS_TTL_MS;
  if (Date.now() - entry.fetchedAt > ttl) {
    chrome.storage.local.remove(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

async function writeCache(key, result) {
  try {
    await chrome.storage.local.set({
      [key]: { result, fetchedAt: Date.now() },
    });
  } catch (error) {
    console.warn("[ChudTube+] cache write failed", error);
  }
}
