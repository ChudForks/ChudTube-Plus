import { getSettings, onSettingsChanged } from "../lib/settings.js";

const MEDIA_SELECTOR = "video.html5-main-video, video.video-stream, video";
const SKIP_EPSILON_SECONDS = 0.05;
const MARKER_LAYER_CLASS = "ctp-sponsorblock-markers";
const MARKER_CLASS = "ctp-sponsorblock-marker";
const MARKER_COLORS = {
  sponsor: "#00d400",
  selfpromo: "#ffff00",
  interaction: "#cc00ff",
  intro: "#00ffff",
  outro: "#0202ed",
  preview: "#008fd6",
  music_offtopic: "#ff9900",
  filler: "#7300ff",
};

let autoSkipEnabled = false;
let showSegmentColors = true;
let videoId = "";
let segments = [];
let requestNumber = 0;
let boundMedia = null;
let bindTimer = 0;
let lastSkip = { id: "", at: 0 };
let markerLayer = null;
let markerHost = null;
let markerHostPosition = "";

if (!globalThis.__ctpSponsorBlockInit) {
  globalThis.__ctpSponsorBlockInit = true;
  init();
}

async function init() {
  const settings = await getSettings();
  applySettings(settings.sponsorBlock);
  onSettingsChanged((next) => applySettings(next.sponsorBlock));

  document.addEventListener("yt-navigate-finish", scheduleRefresh, true);
  document.addEventListener("yt-page-data-updated", scheduleRefresh, true);
  window.addEventListener("popstate", scheduleRefresh, true);
  window.addEventListener("message", onPlayerMessage);

  const observer = new MutationObserver(scheduleBind);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleBind();
  scheduleRefresh();
}

function applySettings(settings) {
  autoSkipEnabled = Boolean(settings?.autoSkip);
  showSegmentColors = settings?.showSegmentColors !== false;
  if (!isActive()) {
    requestNumber += 1;
    videoId = "";
    segments = [];
    removeMarkers();
    return;
  }
  scheduleBind();
  scheduleRefresh();
  renderMarkers();
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
  if (media === boundMedia) {
    renderMarkers();
    return;
  }
  if (boundMedia) {
    boundMedia.removeEventListener("timeupdate", maybeSkip);
    boundMedia.removeEventListener("playing", maybeSkip);
    boundMedia.removeEventListener("seeked", maybeSkip);
    boundMedia.removeEventListener("loadedmetadata", renderMarkers);
    boundMedia.removeEventListener("durationchange", renderMarkers);
  }
  boundMedia = media;
  if (!boundMedia) return;
  boundMedia.addEventListener("timeupdate", maybeSkip);
  boundMedia.addEventListener("playing", maybeSkip);
  boundMedia.addEventListener("seeked", maybeSkip);
  boundMedia.addEventListener("loadedmetadata", renderMarkers);
  boundMedia.addEventListener("durationchange", renderMarkers);
  scheduleRefresh();
  renderMarkers();
}

function scheduleRefresh() {
  queueMicrotask(() => {
    if (!isActive()) return;
    const nextId = videoIdFromLocation();
    if (nextId) refresh(nextId);
  });
}

async function refresh(nextId) {
  if (!isActive() || !nextId || nextId === videoId) return;
  videoId = nextId;
  segments = [];
  renderMarkers();
  const currentRequest = ++requestNumber;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "CTP_FETCH_SPONSOR_SEGMENTS",
      videoId: nextId,
    });
    if (!isActive() || currentRequest !== requestNumber || videoId !== nextId) return;
    segments = Array.isArray(response?.segments) ? response.segments : [];
    renderMarkers();
    maybeSkip();
  } catch (error) {
    if (currentRequest === requestNumber) {
      console.warn("[ChudTube+] SponsorBlock lookup failed", error);
    }
  }
}

function maybeSkip() {
  if (!autoSkipEnabled || !boundMedia || !segments.length) return;
  const time = Number(boundMedia.currentTime);
  if (!Number.isFinite(time)) return;
  const match = segments.find(({ start, end }) => time >= start && time < end - SKIP_EPSILON_SECONDS);
  if (!match) return;

  const now = performance.now();
  if (lastSkip.id === match.id && now - lastSkip.at < 500) return;
  lastSkip = { id: match.id, at: now };
  boundMedia.currentTime = Math.min(match.end + SKIP_EPSILON_SECONDS, boundMedia.duration || match.end);
}

function isActive() {
  return autoSkipEnabled || showSegmentColors;
}

function renderMarkers() {
  if (!showSegmentColors || !segments.length || !boundMedia) {
    removeMarkers();
    return;
  }

  const duration = Number(boundMedia.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    removeMarkers();
    return;
  }
  const host = findProgressHost();
  if (!host) return;

  if (markerHost !== host) {
    removeMarkers();
    markerHost = host;
    markerHostPosition = host.style.position;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    markerLayer = document.createElement("div");
    markerLayer.className = MARKER_LAYER_CLASS;
    markerLayer.setAttribute("aria-hidden", "true");
    Object.assign(markerLayer.style, {
      position: "absolute",
      inset: "0",
      overflow: "hidden",
      pointerEvents: "none",
      zIndex: "2",
    });
    host.append(markerLayer);
  }

  markerLayer.replaceChildren(...segments.map((segment) => createMarker(segment, duration)).filter(Boolean));
}

function findProgressHost() {
  return document.querySelector(
    "#movie_player .ytp-progress-bar-container, ytmusic-player-page .ytp-progress-bar-container, ytmusic-player-bar .ytp-progress-bar-container, ytmusic-player-bar #progress-bar"
  );
}

function createMarker(segment, duration) {
  const start = Math.max(0, Number(segment.start));
  const end = Math.min(duration, Number(segment.end));
  const color = MARKER_COLORS[segment.category];
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !color) return null;

  const marker = document.createElement("span");
  marker.className = MARKER_CLASS;
  marker.dataset.category = segment.category;
  marker.title = `SponsorBlock: ${segment.category.replace("_", " ")}`;
  Object.assign(marker.style, {
    position: "absolute",
    top: "0",
    bottom: "0",
    left: `${(start / duration) * 100}%`,
    width: `${Math.max(((end - start) / duration) * 100, 0.25)}%`,
    backgroundColor: color,
    opacity: "0.9",
    boxShadow: `0 0 2px ${color}`,
  });
  return marker;
}

function removeMarkers() {
  markerLayer?.remove();
  if (markerHost) markerHost.style.position = markerHostPosition;
  markerLayer = null;
  markerHost = null;
  markerHostPosition = "";
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
