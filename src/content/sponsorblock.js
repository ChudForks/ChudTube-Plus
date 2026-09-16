import { getSettings, onSettingsChanged } from "../lib/settings.js";

const MEDIA_SELECTOR = "video.html5-main-video, video.video-stream, video";
const SKIP_EPSILON_SECONDS = 0.05;

let enabled = false;
let videoId = "";
let segments = [];
let requestNumber = 0;
let boundMedia = null;
let bindTimer = 0;
let lastSkip = { id: "", at: 0 };

if (!globalThis.__ctpSponsorBlockInit) {
  globalThis.__ctpSponsorBlockInit = true;
  init();
}

async function init() {
  const settings = await getSettings();
  applySetting(settings.sponsorBlock.autoSkip);
  onSettingsChanged((next) => applySetting(next.sponsorBlock.autoSkip));

  document.addEventListener("yt-navigate-finish", scheduleRefresh, true);
  document.addEventListener("yt-page-data-updated", scheduleRefresh, true);
  window.addEventListener("popstate", scheduleRefresh, true);
  window.addEventListener("message", onPlayerMessage);

  const observer = new MutationObserver(scheduleBind);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleBind();
  scheduleRefresh();
}

function applySetting(value) {
  enabled = Boolean(value);
  if (!enabled) {
    requestNumber += 1;
    videoId = "";
    segments = [];
    return;
  }
  scheduleBind();
  scheduleRefresh();
}

function onPlayerMessage(event) {
  if (event.source !== window || event.data?.type !== "CTP_SONG") return;
  const nextId = validVideoId(event.data.track?.videoId);
  if (nextId) refresh(nextId);
}

function scheduleBind() {
  if (bindTimer) return;
  bindTimer = window.requestAnimationFrame(() => {
    bindTimer = 0;
    bindMedia();
  });
}

function bindMedia() {
  const media = document.querySelector(MEDIA_SELECTOR);
  if (media === boundMedia) return;
  if (boundMedia) {
    boundMedia.removeEventListener("timeupdate", maybeSkip);
    boundMedia.removeEventListener("playing", maybeSkip);
    boundMedia.removeEventListener("seeked", maybeSkip);
  }
  boundMedia = media;
  if (!boundMedia) return;
  boundMedia.addEventListener("timeupdate", maybeSkip);
  boundMedia.addEventListener("playing", maybeSkip);
  boundMedia.addEventListener("seeked", maybeSkip);
  scheduleRefresh();
}

function scheduleRefresh() {
  queueMicrotask(() => {
    if (!enabled) return;
    const nextId = videoIdFromLocation();
    if (nextId) refresh(nextId);
  });
}

async function refresh(nextId) {
  if (!enabled || !nextId || nextId === videoId) return;
  videoId = nextId;
  segments = [];
  const currentRequest = ++requestNumber;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "CTP_FETCH_SPONSOR_SEGMENTS",
      videoId: nextId,
    });
    if (!enabled || currentRequest !== requestNumber || videoId !== nextId) return;
    segments = Array.isArray(response?.segments) ? response.segments : [];
    maybeSkip();
  } catch (error) {
    if (currentRequest === requestNumber) {
      console.warn("[ChudTube+] SponsorBlock lookup failed", error);
    }
  }
}

function maybeSkip() {
  if (!enabled || !boundMedia || !segments.length) return;
  const time = Number(boundMedia.currentTime);
  if (!Number.isFinite(time)) return;
  const match = segments.find(({ start, end }) => time >= start && time < end - SKIP_EPSILON_SECONDS);
  if (!match) return;

  const now = performance.now();
  if (lastSkip.id === match.id && now - lastSkip.at < 500) return;
  lastSkip = { id: match.id, at: now };
  boundMedia.currentTime = Math.min(match.end + SKIP_EPSILON_SECONDS, boundMedia.duration || match.end);
}

function videoIdFromLocation() {
  const url = new URL(location.href);
  const queryId = validVideoId(url.searchParams.get("v"));
  if (queryId) return queryId;
  return validVideoId(url.pathname.match(/^\/shorts\/([^/?#]+)/)?.[1]);
}

function validVideoId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : "";
}
