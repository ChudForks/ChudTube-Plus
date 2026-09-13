(() => {
  if (!/(^|\.)music\.youtube\.com$/i.test(location.hostname)) return;

  const state = {
    videoId: "",
    title: "",
    artist: "",
    album: "",
    duration: 0,
  };

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
    window.postMessage(
      {
        type: "CTP_TIME",
        currentTime: currentTime(),
        duration: duration(),
        paused: Boolean(video()?.paused),
      },
      "*"
    );
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "CTP_SEEK") return;
    const time = Number(event.data.time);
    if (!Number.isFinite(time)) return;
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
  });

  const bar = document.querySelector("ytmusic-player-bar");
  if (bar) {
    new MutationObserver(() => emitSong()).observe(bar, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  setInterval(emitSong, 1000);
  const loop = () => {
    emitTime();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  emitSong();
})();
