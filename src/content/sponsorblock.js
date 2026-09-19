import { getSettings, onSettingsChanged, SPONSOR_CATEGORIES, sponsorCategoryModes } from "../lib/settings.js";

const MEDIA_SELECTOR = "video.html5-main-video, video.video-stream, video";
const SKIP_HOST_SELECTOR = "#movie_player, ytmusic-player#player, ytmusic-player, .html5-video-player";
const SKIP_EPSILON_SECONDS = 0.05;
const MARKER_LAYER_CLASS = "ctp-sponsorblock-markers";
const MARKER_CLASS = "ctp-sponsorblock-marker";
const SKIP_BUTTON_CLASS = "ctp-sponsorblock-skip";
const SKIP_STYLE_ID = "ctp-sponsorblock-style";
const PROGRESS_HOST_SELECTORS = [
  "#movie_player .ytp-progress-bar",
  "#movie_player .ytp-progress-bar-container",
  "ytmusic-player-bar #progress-bar-container",
  "ytmusic-player-bar .ytp-progress-bar",
  "ytmusic-player-bar .ytp-progress-bar-container",
  "ytmusic-player-page .ytp-progress-bar",
  "ytmusic-player-page .ytp-progress-bar-container",
  ".html5-video-player .ytp-progress-bar",
  ".html5-video-player .ytp-progress-bar-container",
  ".YtPlayerProgressBarProgressBar",
];
const MARKER_COLORS = Object.fromEntries(SPONSOR_CATEGORIES.map((category) => [category.id, category.color]));
const SKIP_LABELS = Object.fromEntries(SPONSOR_CATEGORIES.map((category) => [category.id, category.skipLabel]));

let categoryModes = sponsorCategoryModes();
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
let skipButton = null;
let skipHost = null;
let skipHostPosition = "";
let activeSkipSegment = null;

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
  categoryModes = sponsorCategoryModes(settings);
  showSegmentColors = settings?.showSegmentColors !== false;
  if (!isActive()) {
    requestNumber += 1;
    videoId = "";
    segments = [];
    removeMarkers();
    removeSkipButton();
    return;
  }
  scheduleBind();
  scheduleRefresh();
  renderMarkers();
  maybeSkip();
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
    maybeSkip();
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
  if (!boundMedia) {
    removeSkipButton();
    return;
  }
  boundMedia.addEventListener("timeupdate", maybeSkip);
  boundMedia.addEventListener("playing", maybeSkip);
  boundMedia.addEventListener("seeked", maybeSkip);
  boundMedia.addEventListener("loadedmetadata", renderMarkers);
  boundMedia.addEventListener("durationchange", renderMarkers);
  scheduleRefresh();
  renderMarkers();
  maybeSkip();
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
  hideSkipButton();
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
  if (!boundMedia || !segments.length || isAdPlaying()) {
    hideSkipButton();
    return;
  }
  const time = Number(boundMedia.currentTime);
  if (!Number.isFinite(time)) {
    hideSkipButton();
    return;
  }

  const matches = segments.filter(({ start, end }) => time >= start && time < end - SKIP_EPSILON_SECONDS);
  const autoMatch = matches.find((segment) => categoryModes[segment.category] === "auto");
  if (autoMatch) {
    hideSkipButton();
    skipTo(autoMatch);
    return;
  }

  const buttonMatch = matches.find((segment) => categoryModes[segment.category] === "button");
  if (buttonMatch) showSkipButton(buttonMatch);
  else hideSkipButton();
}

function skipTo(segment) {
  if (!boundMedia || !segment) return;
  const now = performance.now();
  if (lastSkip.id === segment.id && now - lastSkip.at < 500) return;
  lastSkip = { id: segment.id, at: now };
  boundMedia.currentTime = Math.min(segment.end + SKIP_EPSILON_SECONDS, boundMedia.duration || segment.end);
  hideSkipButton();
}

function showSkipButton(segment) {
  const button = ensureSkipButton();
  if (!button) return;
  if (activeSkipSegment?.id === segment.id && !button.hidden) return;
  activeSkipSegment = segment;
  const label = SKIP_LABELS[segment.category] || "Skip segment";
  button.hidden = false;
  button.dataset.category = segment.category;
  button.style.setProperty("--ctp-skip-color", MARKER_COLORS[segment.category] || "#fff");
  button.setAttribute("aria-label", label);
  button.querySelector(".ctp-sponsorblock-skip-label").textContent = label;
}

function hideSkipButton() {
  activeSkipSegment = null;
  if (skipButton) skipButton.hidden = true;
}

function ensureSkipButton() {
  ensureSkipStyles();
  const host = document.querySelector(SKIP_HOST_SELECTOR);
  if (!host) {
    removeSkipButton();
    return null;
  }
  if (skipHost === host && skipButton?.isConnected) return skipButton;

  removeSkipButton();
  skipHost = host;
  skipHostPosition = host.style.position;
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  skipButton = document.createElement("button");
  skipButton.type = "button";
  skipButton.className = SKIP_BUTTON_CLASS;
  skipButton.hidden = true;

  const label = document.createElement("span");
  label.className = "ctp-sponsorblock-skip-label";

  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M5 5v14l11-7zm12 0h2v14h-2z");
  icon.append(path);

  skipButton.append(label, icon);
  skipButton.addEventListener("pointerdown", stopPlayerEvent, true);
  skipButton.addEventListener("click", onSkipButtonClick, true);
  host.append(skipButton);
  return skipButton;
}

function onSkipButtonClick(event) {
  stopPlayerEvent(event);
  if (activeSkipSegment) skipTo(activeSkipSegment);
}

function stopPlayerEvent(event) {
  event.preventDefault();
  event.stopPropagation();
}

function isAdPlaying() {
  return Boolean(document.querySelector("#movie_player.ad-showing, .ad-showing"));
}

function isActive() {
  return showSegmentColors || Object.values(categoryModes).some((mode) => mode !== "off");
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

  ensureSkipStyles();
  if (markerHost !== host) {
    removeMarkers();
    markerHost = host;
    markerHostPosition = host.style.position;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    markerLayer = document.createElement("div");
    markerLayer.className = MARKER_LAYER_CLASS;
    markerLayer.setAttribute("aria-hidden", "true");
  }

  if (markerLayer.parentNode !== host || host.lastElementChild !== markerLayer) {
    host.append(markerLayer);
  }

  markerLayer.replaceChildren(...segments.map((segment) => createMarker(segment, duration)).filter(Boolean));
}

function findProgressHost() {
  for (const selector of PROGRESS_HOST_SELECTORS) {
    for (const host of document.querySelectorAll(selector)) {
      if (isVisibleProgressHost(host)) return host;
    }
  }
  return document.querySelector(PROGRESS_HOST_SELECTORS.join(", "));
}

function isVisibleProgressHost(host) {
  if (!host?.isConnected) return false;
  const style = getComputedStyle(host);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return host.getBoundingClientRect().width >= 8;
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
  marker.style.setProperty("--ctp-sb-color", color);
  marker.style.backgroundColor = color;
  marker.style.left = `${(start / duration) * 100}%`;
  marker.style.width = `${Math.max(((end - start) / duration) * 100, 0.25)}%`;
  return marker;
}

function removeMarkers() {
  markerLayer?.remove();
  if (markerHost) markerHost.style.position = markerHostPosition;
  markerLayer = null;
  markerHost = null;
  markerHostPosition = "";
}

function removeSkipButton() {
  skipButton?.remove();
  if (skipHost) skipHost.style.position = skipHostPosition;
  skipButton = null;
  skipHost = null;
  skipHostPosition = "";
  activeSkipSegment = null;
}

function ensureSkipStyles() {
  if (document.getElementById(SKIP_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SKIP_STYLE_ID;
  style.textContent = `
    .${MARKER_LAYER_CLASS} {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      overflow: visible !important;
      pointer-events: none !important;
      z-index: 42 !important;
      isolation: isolate;
    }
    .${MARKER_CLASS} {
      position: absolute !important;
      top: 0 !important;
      bottom: 0 !important;
      height: 100% !important;
      min-width: 2px;
      pointer-events: none !important;
      background-color: var(--ctp-sb-color) !important;
      background-image: none !important;
      opacity: 0.9 !important;
      box-shadow: 0 0 2px var(--ctp-sb-color);
    }
    .${SKIP_BUTTON_CLASS} {
      position: absolute;
      right: 12px;
      bottom: 24px;
      z-index: 80 !important;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 10px 14px 10px 16px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      background: rgba(15, 15, 15, 0.88);
      box-shadow: inset 3px 0 0 var(--ctp-skip-color, #fff), 0 2px 10px rgba(0, 0, 0, 0.45);
      color: #fff;
      font: 500 14px/1.2 "YouTube Noto", Roboto, "Segoe UI", sans-serif;
      letter-spacing: 0.2px;
      white-space: nowrap;
      cursor: pointer;
      pointer-events: auto;
      appearance: none;
      backdrop-filter: blur(8px);
      touch-action: manipulation;
    }
    .${SKIP_BUTTON_CLASS}[hidden] { display: none !important; }
    .${SKIP_BUTTON_CLASS}:hover {
      background: rgba(36, 36, 36, 0.94);
      border-color: rgba(255, 255, 255, 0.28);
    }
    .${SKIP_BUTTON_CLASS}:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .${SKIP_BUTTON_CLASS} svg {
      width: 16px;
      height: 16px;
      fill: currentColor;
    }
    #movie_player:not(.ytp-autohide):not(.ytp-autohide-active) .${SKIP_BUTTON_CLASS},
    .html5-video-player:not(.ytp-autohide):not(.ytp-autohide-active) .${SKIP_BUTTON_CLASS} {
      bottom: 72px;
    }
    #movie_player.ytp-fullscreen .${SKIP_BUTTON_CLASS},
    .html5-video-player.ytp-fullscreen .${SKIP_BUTTON_CLASS} {
      bottom: 36px;
    }
    #movie_player.ytp-fullscreen:not(.ytp-autohide):not(.ytp-autohide-active) .${SKIP_BUTTON_CLASS},
    .html5-video-player.ytp-fullscreen:not(.ytp-autohide):not(.ytp-autohide-active) .${SKIP_BUTTON_CLASS} {
      bottom: 120px;
    }
    ytmusic-player .${SKIP_BUTTON_CLASS} {
      right: 16px;
      bottom: 16px;
      border-radius: 999px;
      font-size: 13px;
    }
    @media (prefers-reduced-motion: reduce) {
      .${SKIP_BUTTON_CLASS} { transition: none; }
    }
  `;
  document.documentElement.append(style);
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
