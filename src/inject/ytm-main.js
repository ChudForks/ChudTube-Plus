(() => {
  if (!/(^|\.)music\.youtube\.com$/i.test(location.hostname)) return;

  const TICKER_ID = "ctp-player-ticker";
  const MEDIA_EVENTS = [
    "play",
    "pause",
    "playing",
    "waiting",
    "stalled",
    "seeking",
    "seeked",
    "timeupdate",
    "ratechange",
    "emptied",
    "loadedmetadata",
  ];

  const state = {
    videoId: "",
    title: "",
    artist: "",
    album: "",
    duration: 0,
  };

  let timeEnabled = false;
  let highRes = false;
  let rafId = 0;
  let boundVideo = null;
  let mediaAbort = null;
  let lastTimeStamp = "";
  let barObserved = false;
  let playerFullscreen = false;

  function player() {
    return document.getElementById("movie_player");
  }

  function video() {
    return (
      document.querySelector("ytmusic-player video") ||
      document.querySelector("video.video-stream") ||
      document.querySelector("video")
    );
  }

  function readDomTrack() {
    const bar = document.querySelector("ytmusic-player-bar");
    if (!bar) return null;
    const title = bar.querySelector("yt-formatted-string.title")?.textContent?.trim() || "";
    const byline = bar.querySelector("yt-formatted-string.byline");
    const links = [...(byline?.querySelectorAll("a") || [])]
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    const parts = (byline?.textContent || "")
      .split(/\s*[•·]\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      title,
      artist: links[0] || parts[0] || "",
      album: links[1] || parts[1] || "",
    };
  }

  function currentTime() {
    const api = player();
    try {
      if (api?.getCurrentTime) return Number(api.getCurrentTime()) || 0;
    } catch {
      // fall through
    }
    return Number(video()?.currentTime) || 0;
  }

  function duration() {
    const api = player();
    try {
      if (api?.getDuration) return Number(api.getDuration()) || 0;
    } catch {
      // fall through
    }
    return Number(video()?.duration) || 0;
  }

  function videoId() {
    const api = player();
    try {
      return api?.getVideoData?.()?.video_id || "";
    } catch {
      return "";
    }
  }

  function emitSong() {
    const dom = readDomTrack();
    if (!dom?.title || !dom.artist) return;
    const next = {
      ...dom,
      videoId: videoId(),
      duration: duration(),
    };
    const key = `${next.videoId}|${next.title}|${next.artist}`;
    const prev = `${state.videoId}|${state.title}|${state.artist}`;
    if (key === prev && Math.abs((next.duration || 0) - (state.duration || 0)) < 1) return;
    Object.assign(state, next);
    window.postMessage({ type: "CTP_SONG", track: next }, "*");
  }

  function emitTime() {
    if (!timeEnabled) return;
    const media = video();
    const t = currentTime();
    const d = duration();
    const paused = Boolean(media?.paused ?? true);
    const stamp = `${t.toFixed(3)}|${d}|${paused}`;
    if (stamp === lastTimeStamp) return;
    lastTimeStamp = stamp;
    window.postMessage(
      {
        type: "CTP_TIME",
        currentTime: t,
        duration: d,
        paused,
      },
      "*"
    );
  }

  function readPlayerFullscreen() {
    const layout = document.querySelector("ytmusic-app-layout, #layout");
    if (layout?.hasAttribute("player-fullscreened")) return true;
    if (layout?.getAttribute("player-ui-state") === "FULLSCREEN") return true;
    const movie = document.getElementById("movie_player");
    if (movie?.classList.contains("ytp-fullscreen")) return true;
    const fs = document.fullscreenElement;
    if (!fs) return false;
    return Boolean(
      fs.id === "movie_player" ||
        fs.matches?.("video, ytmusic-player") ||
        fs.closest?.("ytmusic-player, #movie_player")
    );
  }

  function refreshFullscreen() {
    const next = readPlayerFullscreen();
    if (next === playerFullscreen) return;
    playerFullscreen = next;
    syncLoop();
  }

  function wantsRaf() {
    const media = boundVideo || video();
    return (
      timeEnabled &&
      highRes &&
      Boolean(media) &&
      !media.paused &&
      !document.hidden &&
      !playerFullscreen
    );
  }

  function stopRaf() {
    if (!rafId) return;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loop() {
    rafId = 0;
    if (!wantsRaf()) return;
    emitTime();
    rafId = requestAnimationFrame(loop);
  }

  function syncLoop() {
    bindVideo();
    if (wantsRaf()) {
      if (!rafId) rafId = requestAnimationFrame(loop);
      return;
    }
    stopRaf();
  }

  function onMediaEvent(event) {
    if (event.type === "play" || event.type === "pause" || event.type === "emptied") {
      syncLoop();
    }
    if (playerFullscreen && event.type === "timeupdate") return;
    if (event.type === "timeupdate" && rafId) return;
    emitTime();
  }

  function bindVideo() {
    const media = video();
    if (media === boundVideo) return;
    mediaAbort?.abort();
    boundVideo = media;
    if (!media) return;
    mediaAbort = new AbortController();
    const { signal } = mediaAbort;
    for (const type of MEDIA_EVENTS) {
      media.addEventListener(type, onMediaEvent, { signal });
    }
  }

  function mutationsFromTicker(mutations) {
    if (!mutations.length) return false;
    for (const mutation of mutations) {
      const node = mutation.target;
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el?.closest?.(`#${TICKER_ID}`)) return false;
    }
    return true;
  }

  function observeBar() {
    const bar = document.querySelector("ytmusic-player-bar");
    if (!bar || barObserved) return;
    barObserved = true;
    new MutationObserver((mutations) => {
      if (mutationsFromTicker(mutations)) return;
      emitSong();
    }).observe(bar, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  function seekTo(time) {
    const api = player();
    try {
      if (api?.seekTo) {
        api.seekTo(time, true);
        return;
      }
    } catch {
      // fall through
    }
    const media = video();
    if (media) media.currentTime = time;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === "CTP_SEEK") {
      const time = Number(event.data.time);
      if (!Number.isFinite(time)) return;
      seekTo(time);
      return;
    }
    if (event.data.type !== "CTP_TIME_NEED") return;
    timeEnabled = Boolean(event.data.enabled);
    highRes = Boolean(event.data.highRes) && timeEnabled;
    lastTimeStamp = "";
    syncLoop();
    emitTime();
  });

  document.addEventListener("visibilitychange", syncLoop);
  document.addEventListener("fullscreenchange", refreshFullscreen);

  function observeFullscreen() {
    const layout = document.querySelector("ytmusic-app-layout, #layout");
    if (!layout || layout._ctpFsObserved) return;
    layout._ctpFsObserved = true;
    new MutationObserver(refreshFullscreen).observe(layout, {
      attributes: true,
      attributeFilter: ["player-fullscreened", "player-ui-state"],
    });
  }

  setInterval(() => {
    observeBar();
    observeFullscreen();
    bindVideo();
    refreshFullscreen();
    emitSong();
  }, 1000);

  observeBar();
  observeFullscreen();
  bindVideo();
  refreshFullscreen();
  emitSong();
})();
