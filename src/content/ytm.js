import { getSettings, onSettingsChanged } from "../lib/settings.js";
import { activeLineIndex, formatTimestamp } from "../lib/lrc.js";
import { getPlayerVideo, isAdvertisement, readNowPlaying, trackKey } from "../lib/ytm-track.js";

const ROOT_ID = "ctp-lyrics-root";
const TICKER_ID = "ctp-player-ticker";
const TAB_RENDERER = "#tab-renderer";
const USER_SCROLL_MS = 4500;

let enabled = false;
let started = false;
let currentKey = "";
let currentTrack = null;
let lyricsState = { status: "idle" };
let requestSeq = 0;
let activeIndex = -1;
let userScrollingUntil = 0;
let playbackTime = 0;
let lyricsTabWanted = false;
let observers = [];
let pollId = 0;

const bootStatus = document.getElementById("ctp-boot-status");
if (bootStatus && bootStatus.dataset.error !== "1") {
  bootStatus.remove();
}

init();

async function init() {
  const settings = await getSettings();
  enabled = Boolean(settings.ytm.followAlongLyrics);
  log("settings loaded", settings);
  window.addEventListener("message", onPageMessage);
  document.addEventListener("click", onDocumentClick, true);
  if (enabled) start();
  onSettingsChanged((next) => {
    const shouldEnable = Boolean(next.ytm.followAlongLyrics);
    if (shouldEnable === enabled) return;
    enabled = shouldEnable;
    log("setting toggled", shouldEnable);
    if (enabled) start();
    else stop();
  });
}

function start() {
  if (started) return;
  started = true;
  document.documentElement.classList.add("ctp-enabled");
  bindObservers();
  pollId = window.setInterval(tick, 700);
  tick();
  log("started");
}

function stop() {
  started = false;
  document.documentElement.classList.remove("ctp-enabled");
  observers.forEach((obs) => obs.disconnect());
  observers = [];
  if (pollId) window.clearInterval(pollId);
  pollId = 0;
  teardownUi();
  currentKey = "";
  currentTrack = null;
  lyricsState = { status: "idle" };
  activeIndex = -1;
}

function onPageMessage(event) {
  if (event.source !== window || !event.data) return;
  if (event.data.type === "CTP_SONG" && event.data.track) {
    applyTrack(event.data.track);
  }
  if (event.data.type === "CTP_TIME" && Number.isFinite(event.data.currentTime)) {
    playbackTime = event.data.currentTime;
    if (enabled) onPlayback();
  }
}

function onDocumentClick(event) {
  const tab = event.target.closest?.(".tab-header, tp-yt-paper-tab, [role='tab']");
  if (!tab) return;
  if (/lyric/i.test(tab.textContent || "")) {
    lyricsTabWanted = true;
    log("lyrics tab clicked");
    window.setTimeout(() => {
      ensureRoot();
      render();
    }, 50);
    return;
  }
  if (tab.closest("ytmusic-player-page, .tab-header-container, #tabs-content, tp-yt-paper-tabs")) {
    lyricsTabWanted = false;
  }
}

function bindObservers() {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      tick();
    });
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "aria-selected", "page-type", "is-advertisement", "player-ui-state"],
  });
  observers.push(observer);
}

function tick() {
  if (!enabled) return;
  enableLyricsTab();
  ensureTicker();
  ensureRoot();
  if (!currentTrack) applyTrack(readNowPlaying());
}

function applyTrack(track) {
  if (!track?.title || !track.artist) return;
  const cleaned = {
    title: track.title,
    artist: String(track.artist).split(/\s*[•·]\s*/)[0].trim(),
    album: track.album || "",
    duration: Number(track.duration) || readNowPlaying()?.duration || null,
  };
  const key = trackKey(cleaned);
  if (!key || key === currentKey) {
    currentTrack = currentTrack || cleaned;
    return;
  }
  currentKey = key;
  currentTrack = cleaned;
  lyricsState = { status: "loading", track: cleaned };
  activeIndex = -1;
  log("track changed", cleaned);
  render();
  updateTicker();
  void loadLyrics(cleaned);
}

async function loadLyrics(track) {
  const seq = ++requestSeq;
  try {
    const result = await sendMessage({ type: "CTP_FETCH_LYRICS", track });
    if (seq !== requestSeq || trackKey(track) !== currentKey) return;
    lyricsState = result || { status: "error", error: "Empty response" };
    log("lyrics result", lyricsState.status, lyricsState.synced ? "synced" : "plain");
  } catch (error) {
    if (seq !== requestSeq) return;
    lyricsState = {
      status: "error",
      error: error?.message || "Could not reach the lyrics service",
    };
    log("lyrics fetch failed", error);
  }
  render();
  updateTicker();
}

function onPlayback() {
  const lines = lyricsState.lines;
  if (!lyricsState.synced || !lines?.length) {
    updateTicker();
    return;
  }
  const next = activeLineIndex(lines, playbackTime + 0.05);
  if (next === activeIndex) return;
  activeIndex = next;
  paintActiveLine();
  updateTicker();
}

function enableLyricsTab() {
  const tabs = document.querySelectorAll(".tab-header, tp-yt-paper-tab, [role='tab']");
  for (const tab of tabs) {
    const label = (tab.textContent || "").trim().toLowerCase();
    if (!label.includes("lyric")) continue;
    tab.removeAttribute("disabled");
    tab.removeAttribute("aria-disabled");
    tab.setAttribute("aria-disabled", "false");
    tab.style.pointerEvents = "auto";
    tab.style.opacity = "1";
    if ("disabled" in tab) tab.disabled = false;
  }
}

function isLyricsTabActive() {
  if (lyricsTabWanted) return true;
  const renderer = getTabRenderer();
  const pageType = String(renderer?.getAttribute("page-type") || renderer?.pageType || "");
  if (pageType.includes("LYRICS")) return true;

  const tabs = [...document.querySelectorAll(".tab-header, tp-yt-paper-tab, [role='tab']")];
  for (const tab of tabs) {
    const selected =
      tab.getAttribute("aria-selected") === "true" || tab.classList.contains("iron-selected");
    if (selected && /lyric/i.test(tab.textContent || "")) return true;
  }

  return Boolean(
    renderer?.querySelector(
      "ytmusic-description-shelf-renderer, ytmusic-message-renderer, ytmusic-lyrics-renderer, ytmusic-timed-lyrics-renderer"
    )
  );
}

function getTabRenderer() {
  return document.querySelector(TAB_RENDERER) || document.querySelector("ytmusic-tab-renderer");
}

function ensureRoot() {
  const host = getTabRenderer();
  if (!host) return null;

  let root = document.getElementById(ROOT_ID);
  if (root && root.parentElement !== host) {
    root.remove();
    root = null;
  }
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ctp-lyrics";
    host.prepend(root);
    bindRootEvents(root);
    render();
  }

  const visible = isLyricsTabActive();
  host.classList.toggle("ctp-lyrics-visible", visible);
  root.hidden = !visible;
  return visible ? root : root;
}

function teardownUi() {
  getTabRenderer()?.classList.remove("ctp-lyrics-visible");
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(TICKER_ID)?.remove();
}

function bindRootEvents(root) {
  root.addEventListener("click", (event) => {
    const line = event.target.closest("[data-ctp-time]");
    if (!line) return;
    const time = Number(line.dataset.ctpTime);
    if (!Number.isFinite(time)) return;
    seekTo(time);
    userScrollingUntil = 0;
  });

  const hold = () => {
    userScrollingUntil = Date.now() + USER_SCROLL_MS;
    root.classList.add("ctp-user-scrolling");
  };
  root.addEventListener("wheel", hold, { passive: true });
  root.addEventListener("touchmove", hold, { passive: true });
}

function seekTo(time) {
  window.postMessage({ type: "CTP_SEEK", time }, "*");
  const video = getPlayerVideo();
  if (video) video.currentTime = time;
}

function render() {
  const root = document.getElementById(ROOT_ID) || ensureRoot();
  if (!root) return;
  root.dataset.ready = "1";

  if (isAdvertisement()) {
    root.innerHTML = statusMarkup("Ad playing", "Lyrics resume after the ad.");
    return;
  }

  if (!currentTrack) {
    root.innerHTML = statusMarkup("Waiting for a track", "Play a song to load follow-along lyrics.");
    return;
  }

  if (lyricsState.status === "loading" || lyricsState.status === "idle") {
    root.innerHTML = statusMarkup("Fetching lyrics", `${escapeHtml(currentTrack.title)} · LRCLIB`);
    return;
  }

  if (lyricsState.status === "instrumental") {
    root.innerHTML = statusMarkup("Instrumental", "LRCLIB marked this track as instrumental.");
    return;
  }

  if (lyricsState.status === "not_found") {
    root.innerHTML = statusMarkup("No lyrics on LRCLIB", "This track is not in the LRCLIB catalog yet.");
    return;
  }

  if (lyricsState.status === "error") {
    root.innerHTML = statusMarkup("Could not load lyrics", lyricsState.error || "Try another track.");
    return;
  }

  const lines = lyricsState.lines || [];
  if (!lines.length) {
    root.innerHTML = statusMarkup("No lyrics on LRCLIB", "This track is not in the LRCLIB catalog yet.");
    return;
  }

  const synced = Boolean(lyricsState.synced);
  const items = lines
    .map((line, index) => {
      const timeAttr = synced && Number.isFinite(line.time) ? ` data-ctp-time="${line.time}"` : "";
      const stamp = synced ? formatTimestamp(line.time) : "--:--";
      const state = index === activeIndex ? " ctp-line-active" : index < activeIndex ? " ctp-line-past" : "";
      return `<button class="ctp-line${state}" type="button"${timeAttr} data-index="${index}">
        <span class="ctp-time">${stamp}</span>
        <span class="ctp-text">${escapeHtml(line.text)}</span>
      </button>`;
    })
    .join("");

  const sourceLabel = synced ? "Follow-along · LRCLIB" : "Unsynced · LRCLIB";
  root.innerHTML = `
    <div class="ctp-toolbar">
      <div class="ctp-track">
        <div class="ctp-song">${escapeHtml(currentTrack.title)}</div>
        <div class="ctp-artist">${escapeHtml(currentTrack.artist)}</div>
      </div>
      <div class="ctp-badge">${sourceLabel}</div>
    </div>
    <div class="ctp-list" role="list">${items}</div>
    <div class="ctp-footer">
      <span>Timestamps from LRCLIB</span>
      <button class="ctp-follow" type="button" hidden>Follow</button>
    </div>
  `;

  root.querySelector(".ctp-follow")?.addEventListener("click", () => {
    userScrollingUntil = 0;
    root.classList.remove("ctp-user-scrolling");
    paintActiveLine(true);
  });

  paintActiveLine(true);
}

function paintActiveLine(force = false) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const lines = root.querySelectorAll(".ctp-line");
  if (!lines.length) return;

  lines.forEach((el, index) => {
    el.classList.toggle("ctp-line-active", index === activeIndex);
    el.classList.toggle("ctp-line-past", activeIndex >= 0 && index < activeIndex);
  });

  const follow = root.querySelector(".ctp-follow");
  const userHeld = Date.now() < userScrollingUntil;
  if (follow) follow.hidden = !userHeld;
  if (userHeld && !force) {
    root.classList.add("ctp-user-scrolling");
    return;
  }
  root.classList.remove("ctp-user-scrolling");
  const current = lines[activeIndex];
  if (!current || root.hidden) return;
  current.scrollIntoView({ block: "center", inline: "nearest", behavior: force ? "auto" : "smooth" });
}

function ensureTicker() {
  const bar = document.querySelector("ytmusic-player-bar");
  if (!bar) return;
  let ticker = document.getElementById(TICKER_ID);
  if (!ticker) {
    ticker = document.createElement("div");
    ticker.id = TICKER_ID;
    ticker.title = "ChudTube+ follow-along lyrics";
    const mount = bar.querySelector(".middle-controls") || bar;
    mount.appendChild(ticker);
  }
  updateTicker();
}

function updateTicker() {
  const ticker = document.getElementById(TICKER_ID);
  if (!ticker) return;
  if (!currentTrack) {
    ticker.textContent = "ChudTube+ · waiting";
    return;
  }
  if (lyricsState.status === "loading" || lyricsState.status === "idle") {
    ticker.textContent = "ChudTube+ · fetching lyrics";
    return;
  }
  if (lyricsState.status !== "found") {
    ticker.textContent = `ChudTube+ · ${lyricsState.status.replaceAll("_", " ")}`;
    return;
  }
  const line = lyricsState.synced
    ? lyricsState.lines?.[activeIndex] || lyricsState.lines?.[0]
    : lyricsState.lines?.[0];
  ticker.textContent = line?.text ? `♪ ${line.text}` : "ChudTube+ · lyrics ready — open Lyrics";
}

function statusMarkup(title, detail) {
  return `
    <div class="ctp-status">
      <div class="ctp-status-title">${escapeHtml(title)}</div>
      <div class="ctp-status-detail">${escapeHtml(detail)}</div>
    </div>
  `;
}

async function sendMessage(message) {
  try {
    const result = await chrome.runtime.sendMessage(message);
    if (result !== undefined) return result;
  } catch {
    // Service worker may still be waking up on the first call.
  }
  return chrome.runtime.sendMessage(message);
}

function log(...args) {
  console.info("[ChudTube+]", ...args);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
