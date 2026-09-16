import { fetchLyrics } from "./lib/lrclib.js";
import { SPONSOR_CATEGORIES, mergeSettings } from "./lib/settings.js";

const CACHE_PREFIX = "ctp-lyrics:";
const SPONSOR_CACHE_PREFIX = "ctp-sponsorblock:v2:";
const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;
const SPONSOR_FOUND_TTL_MS = 60 * 60 * 1000;
const SPONSOR_MISS_TTL_MS = 10 * 60 * 1000;
const SPONSORBLOCK_API = "https://sponsor.ajay.app/api/skipSegments";
const SPONSOR_CATEGORY_IDS = SPONSOR_CATEGORIES.map((category) => category.id);

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
  const stored = await chrome.storage.sync.get("settings");
  await applyThemeToYoutubeTabs(mergeSettings(stored.settings).youtube);
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
  const settings = mergeSettings(changes.settings.newValue);
  applyThemeToMusicTabs(settings.ytm.theme);
  applyThemeToYoutubeTabs(settings.youtube);
});

async function applyThemeToYoutubeTabs(youtube) {
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
        func: paintYoutubeTheme,
        args: [
          youtube?.theme || "oled-black",
          youtube?.customTheme || null,
          Boolean(youtube?.hideShorts),
          Boolean(youtube?.hidePlayables),
        ],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["src/content/yt-boot.js"],
      });
    } catch (error) {
      console.warn("[ChudTube+] youtube theme apply failed", tab.id, error);
    }
  }
}

function paintYoutubeTheme(theme, customTheme, hideShorts, hidePlayables) {
  const root = document.documentElement;
  root.toggleAttribute("data-ctp-hide-shorts", Boolean(hideShorts));
  root.toggleAttribute("data-ctp-hide-playables", Boolean(hidePlayables));

  const styleNames = [
    "background",
    "background-color",
    "color",
    "color-scheme",
    "--yt-spec-base-background",
    "--yt-spec-raised-background",
    "--yt-sys-color-baseline--base-background",
    "--ctp-custom-background",
    "--ctp-custom-surface",
    "--ctp-custom-text",
    "--ctp-custom-muted",
    "--ctp-custom-accent",
    "--ctp-custom-hover",
    "--ctp-custom-outline",
    "--ctp-custom-scheme",
  ];

  if (theme !== "oled-black" && theme !== "custom") {
    root.removeAttribute("data-ctp-theme");
    for (const name of styleNames) root.style.removeProperty(name);
    return;
  }

  const colors = customTheme && typeof customTheme === "object" ? customTheme : {};
  const background = theme === "custom" && typeof colors.background === "string" ? colors.background : "#000";
  const surface = theme === "custom" && typeof colors.surface === "string" ? colors.surface : background;
  const text = theme === "custom" && typeof colors.text === "string" ? colors.text : "";
  root.setAttribute("data-ctp-theme", theme);
  if (theme === "oled-black") {
    root.setAttribute("dark", "");
    root.setAttribute("darker-dark-theme", "");
  }
  root.style.setProperty("background", background, "important");
  root.style.setProperty("background-color", background, "important");
  root.style.setProperty("--yt-spec-base-background", background, "important");
  root.style.setProperty("--yt-spec-raised-background", surface, "important");
  root.style.setProperty("--yt-sys-color-baseline--base-background", background, "important");
  if (theme === "custom") {
    root.style.setProperty("--ctp-custom-background", colors.background || background);
    root.style.setProperty("--ctp-custom-surface", colors.surface || surface);
    root.style.setProperty("--ctp-custom-text", colors.text || "#f4f1ef");
    root.style.setProperty("--ctp-custom-muted", colors.muted || "#b4aeb8");
    root.style.setProperty("--ctp-custom-accent", colors.accent || "#ff695b");
    root.style.setProperty("--ctp-custom-hover", colors.hover || "#2b2338");
    root.style.setProperty("--ctp-custom-outline", colors.outline || "#3d344c");
    if (text) root.style.setProperty("color", text, "important");
  } else {
    root.style.removeProperty("color");
    root.style.removeProperty("--ctp-custom-background");
    root.style.removeProperty("--ctp-custom-surface");
    root.style.removeProperty("--ctp-custom-text");
    root.style.removeProperty("--ctp-custom-muted");
    root.style.removeProperty("--ctp-custom-accent");
    root.style.removeProperty("--ctp-custom-hover");
    root.style.removeProperty("--ctp-custom-outline");
  }
}

let themeEditorWindowId = null;
function themeEditorUrl() {
  return chrome.runtime.getURL("src/theme-editor/editor.html");
}

chrome.windows?.onRemoved?.addListener((id) => {
  if (id === themeEditorWindowId) themeEditorWindowId = null;
});

async function openThemeEditor() {
  if (themeEditorWindowId != null) {
    try {
      await chrome.windows.update(themeEditorWindowId, { focused: true });
      return { ok: true, reused: true };
    } catch {
      themeEditorWindowId = null;
    }
  }
  try {
    const win = await chrome.windows.create({
      url: themeEditorUrl(),
      type: "popup",
      width: 1100,
      height: 800,
      focused: true,
    });
    themeEditorWindowId = win?.id ?? null;
    return { ok: true, reused: false };
  } catch (error) {
    await chrome.tabs.create({ url: themeEditorUrl() });
    return { ok: true, reused: false, fallback: error?.message || "window" };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let request;
  if (message?.type === "CTP_OPEN_THEME_EDITOR") request = openThemeEditor();
  else if (message?.type === "CTP_FETCH_LYRICS") request = handleFetch(message.track);
  else if (message?.type === "CTP_FETCH_SPONSOR_SEGMENTS") {
    request = handleSponsorSegments(message.videoId);
  } else return false;

  request
    .then(sendResponse)
    .catch((error) => {
      if (message.type === "CTP_OPEN_THEME_EDITOR") {
        sendResponse({ ok: false, error: error?.message || "Failed to open theme editor" });
      } else if (message.type === "CTP_FETCH_SPONSOR_SEGMENTS") {
        sendResponse({ segments: [], error: error?.message || "Failed to fetch segments" });
      } else {
        sendResponse({
          status: "error",
          source: "lrclib",
          synced: false,
          lines: [],
          plain: "",
          error: error?.message || "Failed to fetch lyrics",
        });
      }
    });
  return true;
});

async function handleSponsorSegments(videoId) {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId || "")) {
    throw new Error("Invalid YouTube video ID");
  }

  const key = `${SPONSOR_CACHE_PREFIX}${videoId}`;
  const cached = await readSponsorCache(key);
  if (cached) return { segments: cached, cached: true };

  const bytes = new TextEncoder().encode(videoId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const prefix = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 4);
  const params = new URLSearchParams({
    service: "YouTube",
    categories: JSON.stringify(SPONSOR_CATEGORY_IDS),
    actionTypes: JSON.stringify(["skip"]),
  });
  const response = await fetch(`${SPONSORBLOCK_API}/${prefix}?${params}`);
  if (response.status === 404) {
    await writeSponsorCache(key, []);
    return { segments: [] };
  }
  if (!response.ok) throw new Error(`SponsorBlock returned HTTP ${response.status}`);

  const matches = await response.json();
  const entry = Array.isArray(matches)
    ? matches.find((candidate) => candidate?.videoID === videoId)
    : null;
  const segments = normalizeSponsorSegments(entry?.segments);
  await writeSponsorCache(key, segments);
  return { segments };
}

function normalizeSponsorSegments(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) =>
      SPONSOR_CATEGORY_IDS.includes(item?.category) &&
      (!item.actionType || item.actionType === "skip") &&
      Array.isArray(item.segment)
    )
    .map((item) => ({
      id: String(item.UUID || `${item.segment[0]}-${item.segment[1]}`),
      category: item.category,
      start: Number(item.segment[0]),
      end: Number(item.segment[1]),
    }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

async function readSponsorCache(key) {
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key];
  if (!Array.isArray(entry?.segments) || !entry.fetchedAt) return null;
  const ttl = entry.segments.length ? SPONSOR_FOUND_TTL_MS : SPONSOR_MISS_TTL_MS;
  if (Date.now() - entry.fetchedAt > ttl) {
    chrome.storage.local.remove(key);
    return null;
  }
  return entry.segments;
}

async function writeSponsorCache(key, segments) {
  try {
    await chrome.storage.local.set({
      [key]: { segments, fetchedAt: Date.now() },
    });
  } catch (error) {
    console.warn("[ChudTube+] SponsorBlock cache write failed", error);
  }
}

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
