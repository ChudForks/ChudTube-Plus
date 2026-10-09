const TITLE_NOISE =
  /\s*[\(\[](?:official(?:\s+(?:music|lyric|audio))?|music|lyric|audio)?\s*(?:video|audio|visualizer|lyrics?|mv|hd|4k|remaster(?:ed)?|video\s+clip)[\)\]]/gi;

export function readNowPlaying(root = document) {
  const bar = root.querySelector("ytmusic-player-bar");
  if (!bar) return null;

  const titleEl = bar.querySelector("yt-formatted-string.title");
  const title = cleanTitle(titleEl?.textContent || "");
  if (!title) return null;

  const { artist, album } = readByline(bar);
  if (!artist) return null;

  const duration = readDuration(root, bar);
  return { title, artist, album, duration, artwork: readArtwork(root) };
}

export function readArtwork(root = document) {
  const img =
    root.querySelector("ytmusic-player-bar img.ytmusic-player-bar") ||
    root.querySelector("ytmusic-player-bar .image img") ||
    root.querySelector("ytmusic-player-bar img") ||
    root.querySelector("#song-image img") ||
    root.querySelector("ytmusic-player img");
  const src = img?.currentSrc || img?.src || "";
  if (!src || src.startsWith("data:")) return "";
  return upgradeArt(src);
}

export function getPlayerVideo(root = document) {
  return (
    root.querySelector("ytmusic-player video") ||
    root.querySelector("video.video-stream") ||
    root.querySelector("#song-video video") ||
    root.querySelector("video")
  );
}

export function isAdvertisement(root = document) {
  return Boolean(root.querySelector("ytmusic-player-bar[is-advertisement]"));
}

export function trackKey(track) {
  if (!track) return "";
  return [track.videoId || "", track.title, track.artist, track.album || "", track.duration || ""]
    .join("|||")
    .toLowerCase();
}

export function cleanTitle(value) {
  return String(value || "")
    .replace(TITLE_NOISE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function readByline(bar) {
  const byline = bar.querySelector("yt-formatted-string.byline");
  if (!byline) return { artist: "", album: "" };

  const links = [...byline.querySelectorAll("a")]
    .map((el) => el.textContent.trim())
    .filter(Boolean);

  if (links.length) {
    return {
      artist: links[0],
      album: links[1] || "",
    };
  }

  const parts = (byline.textContent || "")
    .split(/\s*[•·]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    artist: parts[0] || "",
    album: parts[1] || "",
  };
}

function readDuration(root, bar) {
  const video = getPlayerVideo(root);
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    return video.duration;
  }

  const info = bar.querySelector(".time-info")?.textContent || "";
  const match = info.match(/\/\s*(\d+:\d+(?::\d+)?)/);
  if (!match) return null;
  return parseClock(match[1]);
}

function upgradeArt(url) {
  return url
    .replace(/=w\d+-h\d+[^&?]*/g, "=w800-h800")
    .replace(/=s\d+(?:-c)?/g, "=s800")
    .replace(/([?&]sz=)\d+/g, "$1800");
}

function parseClock(value) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}
