import { getSettings, onSettingsChanged } from "../lib/settings.js";
import { activeLineIndex, formatTimestamp } from "../lib/lrc.js";
import { cleanTitle, getPlayerVideo, isAdvertisement, readArtwork, readNowPlaying, trackKey } from "../lib/ytm-track.js";
import { normalizeLyrics, youtubeLyricsFromText } from "../lib/youtube-lyrics.js";

const ROOT_ID = "ctp-lyrics-root";
const TICKER_ID = "ctp-player-ticker";
const TAB_RENDERER = "#tab-renderer";
const USER_SCROLL_MS = 4500;

let enabled = false;
let started = false;
let currentKey = "";
let currentTrack = null;
let currentDomTrackKey = "";
let lyricsState = { status: "idle" };
let requestSeq = 0;
let activeIndex = -1;
let userScrollingUntil = 0;
let playbackTime = 0;
let playbackPaused = true;
let pageClockUpdatedAt = 0;
let lyricsTabWanted = false;
let visibilityLock = null;
let showLyricsTimer = 0;
let observers = [];
let tabsObserver = null;
let nativeLyricsObserver = null;
let nativeLyricsRevision = 0;
let lastSeenNativeRevision = 0;
let previousNativeRevision = 0;
let lastSeenNativeDescription = null;
let previousNativeDescription = null;
let lyricsTabIdentity = null;
const nativeTabOverrides = new Map();
let pollId = 0;
let highResWanted = false;
let timeNeedEnabled = false;
let lastTickerText = "";
let lineWakeId = 0;
let meterAnimation = null;
let boundMedia = null;
let mediaAbort = null;
let previousYouTubeLyrics = "";
let lastSeenNativeLyrics = "";
let lastRender = null;

const VISIBILITY_LOCK_MS = 800;

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
  document.addEventListener("iron-select", onIronSelect, true);
  bindObservers();
  document.addEventListener("fullscreenchange", onFullscreenChange);
  document.addEventListener("visibilitychange", onVisibilityChange);
  pollId = window.setInterval(tick, 700);
  tick();
  syncFullscreenState();
  syncTimeNeed();
  log("started");
}

function stop() {
  started = false;
  document.documentElement.classList.remove("ctp-enabled");
  observers.forEach((obs) => obs.disconnect());
  observers = [];
  tabsObserver = null;
  nativeLyricsObserver = null;
  restoreLyricsTabs();
  lyricsTabIdentity = null;
  document.removeEventListener("iron-select", onIronSelect, true);
  document.removeEventListener("fullscreenchange", onFullscreenChange);
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if (pollId) window.clearInterval(pollId);
  pollId = 0;
  if (showLyricsTimer) window.clearTimeout(showLyricsTimer);
  showLyricsTimer = 0;
  lyricsTabWanted = false;
  visibilityLock = null;
  unbindMediaClock();
  clearLineWake();
  cancelMeter();
  teardownUi();
  currentKey = "";
  requestSeq++;
  currentTrack = null;
  currentDomTrackKey = "";
  lyricsState = { status: "idle" };
  previousYouTubeLyrics = lastSeenNativeLyrics = "";
  lastSeenNativeDescription = previousNativeDescription = null;
  nativeLyricsRevision = lastSeenNativeRevision = previousNativeRevision = 0;
  playbackTime = 0;
  pageClockUpdatedAt = 0;
  activeIndex = -1;
  lastTickerText = "";
  document.documentElement.classList.remove("ctp-video-fs");
  syncTimeNeed();
}

function onPageMessage(event) {
  if (event.source !== window || !event.data) return;
  if (!enabled) return;
  if (event.data.type === "CTP_SONG" && event.data.track) {
    applyTrack(event.data.track);
  }
  if (event.data.type === "CTP_TIME" && Number.isFinite(event.data.currentTime)) {
    if (
      event.data.videoId &&
      currentTrack?.videoId &&
      event.data.videoId !== currentTrack.videoId
    ) return;
    playbackTime = event.data.currentTime;
    pageClockUpdatedAt = performance.now();
    if (typeof event.data.paused === "boolean") playbackPaused = event.data.paused;
    onPlayback();
  }
}

function onDocumentClick(event) {
  if (!enabled) return;
  const tab = event.target.closest?.(".tab-header, tp-yt-paper-tab, [role='tab']");
  if (!tab || !isPlayerPageTab(tab)) return;
  onPlayerTabChosen(tab);
}

function onIronSelect(event) {
  const item = event.detail?.item;
  if (!item?.matches?.(".tab-header, tp-yt-paper-tab, [role='tab']")) return;
  if (!isPlayerPageTab(item)) return;
  onPlayerTabChosen(item);
}

function onPlayerTabChosen(tab) {
  if (!enabled) return;
  const show = tabLooksLikeLyrics(tab);
  lockLyricsVisibility(show);
  if (showLyricsTimer) {
    window.clearTimeout(showLyricsTimer);
    showLyricsTimer = 0;
  }
  if (show) {
    log("lyrics tab selected");
    ensureRoot();
    showLyricsTimer = window.setTimeout(() => {
      showLyricsTimer = 0;
      ensureRoot();
      render();
    }, 50);
    return;
  }
  ensureRoot();
}

function bindObservers() {
  let scheduled = false;
  const schedule = (mutations) => {
    if (mutations && mutationsFromOwnUi(mutations)) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      tick();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    attributes: true,
    attributeFilter: [
      "disabled",
      "aria-selected",
      "page-type",
      "is-advertisement",
      "player-ui-state",
      "player-fullscreened",
      "player-fullscreened_",
      "fullscreen",
    ],
  });
  observers.push(observer);

  tabsObserver = new MutationObserver(schedule);
  observers.push(tabsObserver);
  nativeLyricsObserver = new MutationObserver((mutations) => {
    if (mutations.some(isNativeLyricsMutation)) nativeLyricsRevision++;
    schedule(mutations);
  });
  observers.push(nativeLyricsObserver);
  watchPlayerTabs();
  watchNativeLyrics();
}

function watchNativeLyrics() {
  const host = getTabRenderer();
  if (!nativeLyricsObserver || nativeLyricsObserver._ctpTarget === host) return;
  nativeLyricsObserver.disconnect();
  nativeLyricsObserver._ctpTarget = host;
  if (host) nativeLyricsObserver.observe(host, { subtree: true, childList: true, characterData: true });
}

function isNativeLyricsMutation(mutation) {
  const el = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
  const shelf = el?.closest?.("ytmusic-description-shelf-renderer, ytmusic-lyrics-description-shelf-renderer");
  const description = shelf && getNativeLyricsDescription(shelf);
  if (description && (el === description || description.contains(el))) return true;
  return [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])].some((node) =>
    node.nodeType === 1 && (node.matches("ytmusic-description-shelf-renderer, ytmusic-lyrics-description-shelf-renderer, #description, .description") ||
      node.querySelector("ytmusic-description-shelf-renderer, ytmusic-lyrics-description-shelf-renderer"))
  );
}

function mutationsFromOwnUi(mutations) {
  if (!mutations?.length) return false;
  for (const mutation of mutations) {
    const node = mutation.target;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el?.closest?.("#ctp-player-ticker, #ctp-lyrics-root, #ctp-boot-status")) return false;
  }
  return true;
}

function watchPlayerTabs() {
  const tabs = document.querySelector(
    "ytmusic-player-page tp-yt-paper-tabs, ytmusic-player-page .tab-header-container"
  );
  if (!tabs || !tabsObserver) return;
  if (tabsObserver._ctpTarget === tabs) return;
  tabsObserver._ctpTarget = tabs;
  tabsObserver.observe(tabs, {
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-selected", "class", "disabled"],
  });
}

function tick() {
  if (!enabled) return;
  syncFullscreenState();
  watchPlayerTabs();
  watchNativeLyrics();
  enableLyricsTab();
  ensureTicker();
  ensureRoot();
  maybeUseYouTubeLyrics();
  bindMediaClock();
  if (!currentTrack) applyTrack(readNowPlaying());
  else if (!currentTrack.artwork) {
    const art = readArtwork();
    if (art) {
      currentTrack.artwork = art;
      paintAtmosphere();
    }
  }
  if (lastRender && lastRender.ad !== isAdvertisement()) render();
}

function applyTrack(track) {
  if (!track?.title || !track.artist) return;
  const title = cleanTitle(track.title);
  if (!title) return;
  currentDomTrackKey = domTrackKey(readNowPlaying());
  const cleaned = {
    videoId: track.videoId || "",
    title,
    artist: String(track.artist).split(/\s*[•·]\s*/)[0].trim(),
    album: track.album || "",
    duration: Number(track.duration) || readNowPlaying()?.duration || null,
    artwork: track.artwork || readArtwork() || "",
  };
  const sameTrack = currentTrack && (
    currentTrack.videoId && cleaned.videoId
      ? currentTrack.videoId === cleaned.videoId
      : cleanTitle(currentTrack.title).toLowerCase() === cleanTitle(cleaned.title).toLowerCase() &&
        currentTrack.artist.toLowerCase() === cleaned.artist.toLowerCase()
  );
  const key = trackKey(cleaned);
  if (!key || sameTrack) {
    const oldTrack = currentTrack;
    const changed = oldTrack && (oldTrack.title !== cleaned.title || oldTrack.artist !== cleaned.artist);
    const albumChanged = oldTrack && oldTrack.album !== cleaned.album;
    currentTrack = { ...cleaned, videoId: cleaned.videoId || oldTrack?.videoId || "",
      artwork: cleaned.artwork || oldTrack?.artwork || "" };
    if (changed || (albumChanged && lyricsState.source !== "youtube")) {
      currentKey = trackKey(currentTrack);
      reloadLyrics();
    } else {
      // Metadata enrichment preserves the current lyric nodes and playback clock.
      if (albumChanged && oldTrack.album && cleaned.album) void loadLyrics(currentTrack);
      const song = document.querySelector("#ctp-lyrics-root .ctp-song");
      const artist = document.querySelector("#ctp-lyrics-root .ctp-artist");
      if (song) song.textContent = currentTrack.title;
      if (artist) artist.textContent = [currentTrack.artist, currentTrack.album].filter(Boolean).join(" · ");
      paintAtmosphere();
    }
    return;
  }
  currentKey = key;
  previousYouTubeLyrics = lastSeenNativeLyrics;
  previousNativeRevision = lastSeenNativeRevision;
  previousNativeDescription = lastSeenNativeDescription;
  currentTrack = cleaned;
  // YouTube reuses its media element between autoplayed tracks. Its raw
  // currentTime can briefly remain at the previous song's duration, so make
  // the new track start from zero until the page-player clock arrives.
  playbackTime = 0;
  pageClockUpdatedAt = performance.now();
  log("track changed", cleaned);
  reloadLyrics();
}

function reloadLyrics() {
  if (!currentTrack) return;
  lyricsState = { status: "loading", track: currentTrack };
  activeIndex = -1;
  userScrollingUntil = 0;
  clearLineWake();
  cancelMeter();
  render();
  updateTicker();
  syncTimeNeed();
  void loadLyrics(currentTrack);
  maybeUseYouTubeLyrics();
}

async function loadLyrics(track) {
  const seq = ++requestSeq;
  try {
    const result = await sendMessage({ type: "CTP_FETCH_LYRICS", track });
    if (seq !== requestSeq) return;
    const next = result || { status: "error", error: "Empty response" };
    // Keep official YouTube lyrics unless LRCLIB can add timestamps.
    if (lyricsState.source !== "youtube" || (next.status === "found" && next.synced)) {
      lyricsState = next;
    }
    log("lyrics result", lyricsState.status, lyricsState.synced ? "synced" : "plain");
  } catch (error) {
    if (seq !== requestSeq) return;
    if (lyricsState.source !== "youtube") {
      lyricsState = {
        status: "error",
        error: error?.message || "Could not reach the lyrics service",
      };
    }
    log("lyrics fetch failed", error);
  }
  render();
  updateTicker();
  syncTimeNeed();
  onPlayback();
}

function maybeUseYouTubeLyrics() {
  if (!currentTrack || !/LYRICS/i.test(getTabPageType())) return;

  const plain = normalizeLyrics(readNativeLyricsText());
  const description = getNativeLyricsDescription();
  const domTrack = readNowPlaying();
  const matchesTrack = !domTrack || domTrackKey(domTrack) === domTrackKey(currentTrack) || domTrackKey(domTrack) === currentDomTrackKey;
  // Remember outgoing native text even when synced LRCLIB is preferred. A bar
  // already showing the next song must not bind its fresh shelf to this song.
  if (matchesTrack && plain && plain !== lastSeenNativeLyrics) {
    lastSeenNativeLyrics = plain;
    lastSeenNativeRevision = nativeLyricsRevision;
    lastSeenNativeDescription = description;
  }
  if (!matchesTrack) return;
  if (!plain || description !== previousNativeDescription || nativeLyricsRevision > previousNativeRevision) {
    previousYouTubeLyrics = "";
  }
  if (lyricsState.status === "found" && lyricsState.synced) return;
  if (!plain || plain === previousYouTubeLyrics || plain === lyricsState.plain) return;
  const attribution = readNativeLyricsAttribution();
  const result = youtubeLyricsFromText(plain, attribution);
  if (!result) return;

  lastSeenNativeLyrics = plain;
  lastSeenNativeRevision = nativeLyricsRevision;
  lastSeenNativeDescription = description;
  lyricsState = result;
  activeIndex = -1;
  log("lyrics result", "found", "youtube");
  render();
  updateTicker();
  syncTimeNeed();
}

function domTrackKey(track) {
  return JSON.stringify([cleanTitle(track?.title).toLowerCase(), String(track?.artist || "").toLowerCase()]);
}

function getNativeLyricsShelf() {
  const host = getTabRenderer();
  if (!host) return null;
  return (
    host.querySelector("ytmusic-description-shelf-renderer") ||
    host.querySelector("ytmusic-lyrics-description-shelf-renderer")
  );
}

function readNativeLyricsText() {
  return formattedText(getNativeLyricsDescription());
}

function getNativeLyricsDescription(shelf = getNativeLyricsShelf()) {
  if (!shelf) return null;
  return (
    shelf.querySelector("#description") ||
    shelf.querySelector(".description") ||
    [...shelf.querySelectorAll("yt-formatted-string")].find(
      (el) => !/^\s*source\s*:/i.test(el.textContent || "")
    )
  );
}

function readNativeLyricsAttribution() {
  const shelf = getNativeLyricsShelf();
  if (!shelf) return "";
  return (
    [...shelf.querySelectorAll("yt-formatted-string")]
      .map((el) => (el.textContent || "").trim())
      .find((text) => /^source\s*:/i.test(text)) || ""
  );
}

function formattedText(element) {
  if (!element) return "";
  const clone = element.cloneNode(true);
  for (const br of clone.querySelectorAll("br")) br.replaceWith("\n");
  return (clone.textContent || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function onPlayback() {
  const lines = lyricsState.lines;
  if (!lyricsState.synced || !lines?.length) {
    clearLineWake();
    cancelMeter();
    updateTicker();
    return;
  }

  const currentTime = getMediaTime();
  const next = activeLineIndex(lines, currentTime + 0.05);
  const lyricsVisible = isLyricsPanelVisible();

  if (next !== activeIndex) {
    activeIndex = next;
    if (lyricsVisible) paintActiveLine();
    else cancelMeter();
    updateTicker();
  } else if (lyricsVisible) {
    syncMeter(false);
  } else {
    cancelMeter();
  }

  scheduleLineWake();
}

function enableLyricsTab() {
  for (const [tab, saved] of nativeTabOverrides) {
    if (!tab.isConnected) restoreLyricsTab(tab, saved);
  }
  for (const tab of getPlayerTabs()) {
    if (!tabLooksLikeLyrics(tab)) continue;
    let saved = nativeTabOverrides.get(tab);
    if (!saved) {
      saved = { classPresent: tab.classList.contains("ctp-lyrics-tab"), attributes: new Map(), styles: new Map() };
      nativeTabOverrides.set(tab, saved);
    }
    tab.classList.add("ctp-lyrics-tab");
    const disabled =
      tab.hasAttribute("disabled") ||
      tab.getAttribute("aria-disabled") === "true" ||
      tab.disabled === true;
    if (!disabled && tab.style.pointerEvents === "auto") continue;
    if ("disabled" in tab) {
      if (!saved.property || tab.disabled !== saved.property.applied) saved.property = { original: tab.disabled, applied: false };
    }
    for (const [name, value] of [["disabled", null], ["aria-disabled", "false"]]) {
      const old = saved.attributes.get(name);
      if (!old || tab.getAttribute(name) !== old.applied) saved.attributes.set(name, { original: tab.getAttribute(name), applied: value });
    }
    if ("disabled" in tab) tab.disabled = false;
    tab.removeAttribute("disabled");
    tab.setAttribute("aria-disabled", "false");
    for (const [name, value] of [["pointer-events", "auto"], ["opacity", "1"]]) {
      const current = { value: tab.style.getPropertyValue(name), priority: tab.style.getPropertyPriority(name) };
      const old = saved.styles.get(name);
      if (!old || current.value !== old.applied) saved.styles.set(name, { original: current, applied: value });
      tab.style.setProperty(name, value);
    }
  }
}

function restoreLyricsTabs() {
  for (const [tab, saved] of nativeTabOverrides) restoreLyricsTab(tab, saved);
}

function restoreLyricsTab(tab, saved) {
  const attributes = [...saved.attributes].filter(([name, old]) => tab.getAttribute(name) === old.applied);
  if (saved.property && tab.disabled === saved.property.applied) tab.disabled = saved.property.original;
  for (const [name, old] of attributes) {
    if (old.original === null) tab.removeAttribute(name);
    else tab.setAttribute(name, old.original);
  }
  for (const [name, old] of saved.styles) {
    if (tab.style.getPropertyValue(name) !== old.applied || tab.style.getPropertyPriority(name)) continue;
    if (old.original.value) tab.style.setProperty(name, old.original.value, old.original.priority);
    else tab.style.removeProperty(name);
  }
  if (!saved.classPresent) tab.classList.remove("ctp-lyrics-tab");
  nativeTabOverrides.delete(tab);
}

function getPlayerTabs() {
  const page = document.querySelector("ytmusic-player-page");
  const scope = page || document;
  return [...scope.querySelectorAll(".tab-header, tp-yt-paper-tab, [role='tab']")];
}

function isPlayerPageTab(tab) {
  if (!tab?.closest?.("ytmusic-player-page")) return false;
  return Boolean(
    tab.closest?.(".tab-header-container, tp-yt-paper-tabs, #tabsContent, #tabs-content")
  );
}

function tabLooksLikeLyrics(tab) {
  if (!tab) return false;
  const tabs = getPlayerTabs();
  const identity = tabs.find((item) => /LYRICS/i.test([
    item.id, item.getAttribute("aria-controls"), item.getAttribute("page-type"),
    item.dataset.pageType, item.pageType, item.data?.pageType,
  ].filter(Boolean).join(" "))) || tabs.find((item) => /lyric/i.test(item.textContent || "")) ||
    // YTM's player-page tabs are Up next, Lyrics, Related in every locale.
    (tabs.length >= 2 ? tabs[1] : /LYRICS/i.test(getTabPageType()) ? tabs[0] : null);
  if (identity !== lyricsTabIdentity) {
    const saved = nativeTabOverrides.get(lyricsTabIdentity);
    if (saved) restoreLyricsTab(lyricsTabIdentity, saved);
    lyricsTabIdentity = identity;
  }
  return tab === lyricsTabIdentity;
}

function isTabSelected(tab) {
  return tab.getAttribute("aria-selected") === "true" || tab.classList.contains("iron-selected");
}

function getTabPageType() {
  const renderer = getTabRenderer();
  return String(renderer?.getAttribute("page-type") || renderer?.pageType || "");
}

function lockLyricsVisibility(visible) {
  lyricsTabWanted = visible;
  visibilityLock = { visible, until: Date.now() + VISIBILITY_LOCK_MS };
}

function isLyricsTabActive() {
  if (visibilityLock) {
    if (Date.now() < visibilityLock.until) return visibilityLock.visible;
    visibilityLock = null;
  }

  const selected = getPlayerTabs().find(isTabSelected);
  if (selected) {
    lyricsTabWanted = tabLooksLikeLyrics(selected);
    return lyricsTabWanted;
  }

  const pageType = getTabPageType();
  if (pageType) {
    lyricsTabWanted = /LYRICS/i.test(pageType);
    return lyricsTabWanted;
  }

  return lyricsTabWanted;
}

function getTabRenderer() {
  return document.querySelector(TAB_RENDERER) || document.querySelector("ytmusic-tab-renderer");
}

function setLyricsVisible(visible) {
  const show = Boolean(visible) && !isPlayerFullscreen();
  const host = getTabRenderer();
  host?.classList.toggle("ctp-lyrics-visible", show);
  const root = document.getElementById(ROOT_ID);
  const wasShown = Boolean(root && !root.hidden);
  if (root) {
    root.hidden = !show;
    root.setAttribute("aria-hidden", show ? "false" : "true");
  }
  if (show !== wasShown) {
    if (show) paintActiveLine(true);
    else cancelMeter();
  }
  syncFullscreenState();
  syncTimeNeed();
}

function isPlayerFullscreen() {
  const layout = document.querySelector("ytmusic-app-layout, #layout");
  if (layout?.hasAttribute("player-fullscreened")) return true;
  if (layout?.getAttribute("player-ui-state") === "FULLSCREEN") return true;
  const page = document.querySelector("ytmusic-player-page");
  if (page?.hasAttribute("player-fullscreened") || page?.hasAttribute("player-fullscreened_")) return true;
  if (page?.getAttribute("player-ui-state") === "FULLSCREEN") return true;
  const player = document.querySelector("ytmusic-player");
  if (player?.hasAttribute("fullscreen") || player?.hasAttribute("player-fullscreened")) return true;
  if (player?.getAttribute("player-ui-state") === "FULLSCREEN") return true;
  const bar = document.querySelector("ytmusic-player-bar");
  if (bar?.hasAttribute("player-fullscreened") || bar?.hasAttribute("player-fullscreened_")) return true;
  const movie = document.getElementById("movie_player");
  if (movie?.classList.contains("ytp-fullscreen")) return true;
  const fs = document.fullscreenElement;
  if (!fs) return false;
  if (fs.id === "movie_player" || fs.matches?.("video, ytmusic-player")) return true;
  if (fs.closest?.("ytmusic-player, #movie_player")) return true;
  const panel = getTabRenderer();
  return Boolean(panel && !fs.contains(panel));
}

function syncFullscreenState() {
  document.documentElement.classList.toggle("ctp-video-fs", isPlayerFullscreen());
}

function syncTimeNeed() {
  const enabledNeed = Boolean(enabled && started);
  // Line sync is a next-line timer; the meter is a CSS animation. Never
  // request the 60fps MAIN-world pump.
  const nextHighRes = false;
  if (enabledNeed === timeNeedEnabled && nextHighRes === highResWanted) return;
  timeNeedEnabled = enabledNeed;
  highResWanted = nextHighRes;
  window.postMessage(
    { type: "CTP_TIME_NEED", enabled: enabledNeed, highRes: nextHighRes },
    "*"
  );
}

function onFullscreenChange() {
  syncFullscreenState();
  ensureRoot();
  syncTimeNeed();
  onPlayback();
}

function onVisibilityChange() {
  if (document.hidden) {
    pauseMeter();
    clearLineWake();
    return;
  }
  const video = getPlayerVideo();
  if (video) {
    if (!pageClockIsFresh()) playbackTime = video.currentTime;
    playbackPaused = video.paused;
  }
  onPlayback();
}

function ensureRoot() {
  const host = getTabRenderer();
  if (!host) {
    document.getElementById(ROOT_ID)?.remove();
    return null;
  }

  const visible = isLyricsTabActive() && !isPlayerFullscreen();
  let root = document.getElementById(ROOT_ID);
  if (root && root.parentElement !== host) {
    root.remove();
    root = null;
  }

  if (!root && visible) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "ctp-lyrics";
    root.hidden = true;
    host.prepend(root);
    bindRootEvents(root);
    render();
  }

  setLyricsVisible(visible);
  return root;
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
  const ad = isAdvertisement();
  if (lastRender?.root === root && lastRender.state === lyricsState &&
      lastRender.key === currentKey && lastRender.ad === ad) return;
  lastRender = { root, state: lyricsState, key: currentKey, ad };
  cancelMeter();
  root.dataset.ready = "1";

  if (ad) {
    showStatus("Ad playing", "Lyrics resume after the ad.");
    return;
  }

  if (!currentTrack) {
    showStatus("Waiting for a track", "Play a song to load follow-along lyrics.");
    return;
  }

  if (lyricsState.status === "loading" || lyricsState.status === "idle") {
    showStatus("Fetching lyrics", `${currentTrack.title} · YouTube Music + LRCLIB`);
    return;
  }

  if (lyricsState.status === "instrumental") {
    showStatus("Instrumental", "LRCLIB marked this track as instrumental.");
    return;
  }

  if (lyricsState.status === "not_found") {
    showStatus("No lyrics found", "Neither YouTube Music nor LRCLIB has lyrics for this track yet.");
    return;
  }

  if (lyricsState.status === "error") {
    showStatus("Could not load lyrics", lyricsState.error || "Try another track.");
    return;
  }

  const lines = lyricsState.lines || [];
  if (!lines.length) {
    showStatus("No lyrics found", "Neither YouTube Music nor LRCLIB has lyrics for this track yet.");
    return;
  }

  const synced = Boolean(lyricsState.synced);
  const sourceLabel = synced ? "Synced" : "Unsynced";
  const sourceName = lyricsState.source === "youtube" ? "YouTube Music" : "LRCLIB";
  const sourceDetail = lyricsState.provider ? ` · ${lyricsState.provider}` : "";
  root.replaceChildren(
    createLyricsToolbar(currentTrack, sourceLabel),
    createLyricsList(lines, synced),
    createLyricsFooter(sourceName, sourceDetail),
  );
  paintAtmosphere();

  root.querySelector(".ctp-follow")?.addEventListener("click", () => {
    userScrollingUntil = 0;
    root.classList.remove("ctp-user-scrolling");
    paintActiveLine(true);
  });

  paintActiveLine(true);
}

function createLyricsToolbar(track, sourceLabel) {
  const toolbar = createElement("div", "ctp-toolbar");
  const ident = createElement("div", "ctp-ident");
  const art = createElement("div", "ctp-art");
  art.setAttribute("aria-hidden", "true");
  const trackInfo = createElement("div", "ctp-track");
  trackInfo.append(
    createElement("div", "ctp-song", track.title),
    createElement("div", "ctp-artist", [track.artist, track.album].filter(Boolean).join(" · ")),
  );
  ident.append(art, trackInfo);
  toolbar.append(ident, createElement("div", "ctp-badge", sourceLabel));
  return toolbar;
}

function createLyricsList(lines, synced) {
  const list = createElement("div", "ctp-list");
  list.setAttribute("role", "list");
  lines.forEach((line, index) => {
    const button = createElement("button", "ctp-line");
    button.type = "button";
    button.dataset.index = String(index);
    button.classList.toggle("ctp-line-active", index === activeIndex);
    button.classList.toggle("ctp-line-past", index < activeIndex);
    if (synced && Number.isFinite(line.time)) button.dataset.ctpTime = String(line.time);

    const meter = createElement("span", "ctp-meter");
    meter.setAttribute("aria-hidden", "true");
    meter.append(createElement("span", "ctp-meter-fill"));
    const body = createElement("span", "ctp-body");
    body.append(createElement("span", "ctp-text", line.text), meter);
    button.append(createElement("span", "ctp-time", synced ? formatTimestamp(line.time) : ""), body);
    list.append(button);
  });
  return list;
}

function createLyricsFooter(sourceName, sourceDetail) {
  const footer = createElement("div", "ctp-footer");
  const follow = createElement("button", "ctp-follow", "Resume follow");
  follow.type = "button";
  follow.hidden = true;
  footer.append(createElement("span", "", `${sourceName}${sourceDetail}`), follow);
  return footer;
}

function createElement(tagName, className = "", text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text ?? "");
  return element;
}

function paintActiveLine(force = false) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const lines = root.querySelectorAll(".ctp-line");
  if (!lines.length) return;

  lines.forEach((el, index) => {
    el.classList.toggle("ctp-line-active", index === activeIndex);
    el.classList.toggle("ctp-line-past", activeIndex >= 0 && index < activeIndex);
    el.classList.toggle("ctp-line-next", index === activeIndex + 1);
    el.classList.toggle("ctp-line-soon", index === activeIndex + 2);
  });
  syncMeter(true);
  scheduleLineWake();

  const follow = root.querySelector(".ctp-follow");
  const userHeld = Date.now() < userScrollingUntil;
  if (follow) follow.hidden = !userHeld;
  if (userHeld && !force) {
    root.classList.add("ctp-user-scrolling");
    return;
  }
  root.classList.remove("ctp-user-scrolling");
  const current = lines[activeIndex];
  if (!current || root.hidden || !isLyricsTabActive()) return;
  current.scrollIntoView({ block: "center", inline: "nearest", behavior: force ? "auto" : "smooth" });
}

function isLyricsPanelVisible() {
  const root = document.getElementById(ROOT_ID);
  return Boolean(root && !root.hidden);
}

function getMediaTime() {
  if (pageClockIsFresh()) {
    if (playbackPaused) return playbackTime;
    const elapsed = (performance.now() - pageClockUpdatedAt) / 1000;
    return playbackTime + elapsed * getPlaybackRate();
  }
  const video = boundMedia || getPlayerVideo();
  const time = Number(video?.currentTime);
  return Number.isFinite(time) ? time : playbackTime;
}

function pageClockIsFresh() {
  return pageClockUpdatedAt > 0 && performance.now() - pageClockUpdatedAt < 2000;
}

function getPlaybackRate() {
  const rate = Number((boundMedia || getPlayerVideo())?.playbackRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function isMediaWaiting() {
  const video = boundMedia || getPlayerVideo();
  if (!video) return false;
  if (video.seeking) return true;
  return !video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA;
}

function bindMediaClock() {
  const media = getPlayerVideo();
  if (media === boundMedia) return;
  unbindMediaClock();
  boundMedia = media;
  if (!media) return;
  mediaAbort = new AbortController();
  const { signal } = mediaAbort;
  for (const type of [
    "play",
    "pause",
    "playing",
    "waiting",
    "stalled",
    "seeking",
    "seeked",
    "ratechange",
    "timeupdate",
  ]) {
    media.addEventListener(type, onMediaClock, { signal });
  }
}

function unbindMediaClock() {
  mediaAbort?.abort();
  mediaAbort = null;
  boundMedia = null;
}

function onMediaClock(event) {
  if (!enabled || !started) return;
  const video = event.currentTarget;
  if (!pageClockIsFresh()) {
    playbackTime = video.currentTime;
  }
  playbackPaused = video.paused;
  if (event.type === "waiting" || event.type === "stalled" || event.type === "seeking") {
    pauseMeter();
    clearLineWake();
    return;
  }
  onPlayback();
}

function clearLineWake() {
  if (!lineWakeId) return;
  window.clearTimeout(lineWakeId);
  lineWakeId = 0;
}

function scheduleLineWake() {
  clearLineWake();
  if (!enabled || !started) return;
  if (!lyricsState.synced || !lyricsState.lines?.length) return;
  if (playbackPaused || isMediaWaiting() || document.hidden) return;

  const lines = lyricsState.lines;
  const t = getMediaTime();
  const idx = activeLineIndex(lines, t + 0.05);
  const nextLine = lines[idx + 1];
  if (!nextLine || !Number.isFinite(nextLine.time)) return;

  const rate = getPlaybackRate();
  const delay = ((nextLine.time - 0.05) - t) / rate * 1000;
  if (!Number.isFinite(delay)) return;
  lineWakeId = window.setTimeout(onLineWake, delay > 0 ? delay : 16);
}

function onLineWake() {
  lineWakeId = 0;
  const video = boundMedia || getPlayerVideo();
  if (video) {
    if (!pageClockIsFresh()) playbackTime = video.currentTime;
    playbackPaused = video.paused;
  }
  onPlayback();
}

function pauseMeter() {
  meterAnimation?.pause();
}

function cancelMeter() {
  if (!meterAnimation) return;
  try {
    if (meterAnimation.playState !== "idle") meterAnimation.commitStyles();
  } catch {
    // Element may already be gone.
  }
  meterAnimation.cancel();
  meterAnimation = null;
}

function syncMeter(force = false) {
  const root = document.getElementById(ROOT_ID);
  if (!root || root.hidden || !lyricsState.synced) {
    cancelMeter();
    return;
  }
  const fill = root.querySelector(".ctp-line-active .ctp-meter-fill");
  if (!fill) {
    cancelMeter();
    return;
  }

  const lines = lyricsState.lines || [];
  const start = Number(lines[activeIndex]?.time);
  const end = Number(lines[activeIndex + 1]?.time);
  if (!Number.isFinite(start)) {
    cancelMeter();
    return;
  }

  const span = Number.isFinite(end) && end > start ? end - start : 4;
  const duration = span * 1000;
  const mediaTime = getMediaTime();
  const elapsed = Math.max(0, Math.min(span, mediaTime - start)) * 1000;
  const rate = getPlaybackRate();
  const hold = playbackPaused || isMediaWaiting() || document.hidden;
  const computed = meterAnimation?.effect?.getComputedTiming?.();
  const reuse =
    !force &&
    meterAnimation &&
    meterAnimation.playState !== "idle" &&
    meterAnimation.effect?.target === fill &&
    Math.abs(Number(computed?.duration) - duration) < 1;

  if (!reuse) {
    cancelMeter();
    fill.style.transform = "";
    meterAnimation = fill.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration, easing: "linear", fill: "forwards" }
    );
    meterAnimation.playbackRate = rate;
    if (hold) meterAnimation.pause();
    else meterAnimation.play();
    meterAnimation.currentTime = elapsed;
    return;
  }

  if (Math.abs(meterAnimation.playbackRate - rate) > 0.01) {
    meterAnimation.playbackRate = rate;
  }
  const drift = Math.abs((meterAnimation.currentTime || 0) - elapsed);
  if (drift > 80) meterAnimation.currentTime = elapsed;
  if (hold) meterAnimation.pause();
  else if (meterAnimation.playState !== "finished") meterAnimation.play();
}

function paintAtmosphere() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const url = currentTrack?.artwork;
  root.style.setProperty("--ctp-art", url ? `url("${url}")` : "none");
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
  let text = "ChudTube+ · waiting";
  if (currentTrack) {
    if (lyricsState.status === "loading" || lyricsState.status === "idle") {
      text = "ChudTube+ · fetching lyrics";
    } else if (lyricsState.status !== "found") {
      text = `ChudTube+ · ${lyricsState.status.replaceAll("_", " ")}`;
    } else {
      const line = lyricsState.synced
        ? lyricsState.lines?.[activeIndex] || lyricsState.lines?.[0]
        : lyricsState.lines?.[0];
      text = line?.text ? `♪ ${line.text}` : "ChudTube+ · lyrics ready — open Lyrics";
    }
  }
  if (text === lastTickerText && ticker.textContent === text) return;
  lastTickerText = text;
  ticker.textContent = text;
}

function showStatus(title, detail) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const status = createElement("div", "ctp-status");
  status.append(
    createElement("div", "ctp-status-kicker", "ChudTube+"),
    createElement("div", "ctp-status-title", title),
    createElement("div", "ctp-status-detail", detail),
  );
  root.replaceChildren(status);
  paintAtmosphere();
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
