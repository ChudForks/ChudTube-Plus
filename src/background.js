import { fetchLyrics } from "./lib/lrclib.js";

const CACHE_PREFIX = "ctp-lyrics:";
const FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 30 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  console.info("[ChudTube+] service worker ready");
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
