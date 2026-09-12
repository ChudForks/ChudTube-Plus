import { parseLrc } from "./lrc.js";

const API_BASE = "https://lrclib.net/api";
const CLIENT = "ChudTube+/0.1.0";
const RETRY_DELAYS_MS = [400, 1000, 2000];

export async function fetchLyrics(track, fetchFn = fetch) {
  const query = normalizeTrack(track);
  if (!query.title || !query.artist) {
    return notFound("Missing title or artist");
  }

  const exact = await getExact(query, fetchFn);
  if (exact.status === "found" || exact.status === "instrumental") return exact;
  if (exact.status === "error" && exact.fatal) return exact;

  const searched = await searchBest(query, fetchFn);
  if (searched.status !== "idle") return searched;

  return notFound("No lyrics on LRCLIB");
}

function normalizeTrack(track) {
  return {
    title: (track?.title || "").trim(),
    artist: (track?.artist || "").trim(),
    album: (track?.album || "").trim(),
    duration: Number.isFinite(track?.duration) ? Math.round(track.duration) : null,
  };
}

async function getExact(track, fetchFn) {
  const params = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
  });
  if (track.album) params.set("album_name", track.album);
  if (track.duration) params.set("duration", String(track.duration));

  const response = await request(`${API_BASE}/get?${params}`, fetchFn);
  if (response.status === 404) return { status: "idle" };
  if (!response.ok) {
    return {
      status: "error",
      fatal: response.status === 429,
      error: `LRCLIB ${response.status}`,
    };
  }

  return toResult(await response.json(), "get");
}

async function searchBest(track, fetchFn) {
  const params = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
  });
  const response = await request(`${API_BASE}/search?${params}`, fetchFn);
  if (!response.ok) {
    return {
      status: "error",
      fatal: response.status === 429,
      error: `LRCLIB ${response.status}`,
    };
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) return { status: "idle" };

  const ranked = results
    .map((item) => ({ item, score: scoreMatch(track, item) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0]?.item;
  if (!best) return { status: "idle" };
  return toResult(best, "search");
}

function scoreMatch(track, item) {
  let score = 0;
  if (item.syncedLyrics) score += 100;
  else if (item.plainLyrics) score += 20;
  if (item.instrumental) score += 5;

  const title = (item.trackName || item.name || "").toLowerCase();
  const artist = (item.artistName || "").toLowerCase();
  if (title === track.title.toLowerCase()) score += 25;
  else if (title.includes(track.title.toLowerCase()) || track.title.toLowerCase().includes(title)) score += 10;
  if (artist === track.artist.toLowerCase()) score += 20;
  else if (artist.includes(track.artist.toLowerCase()) || track.artist.toLowerCase().includes(artist)) score += 8;

  if (track.duration && Number.isFinite(item.duration)) {
    const delta = Math.abs(item.duration - track.duration);
    if (delta <= 2) score += 30;
    else if (delta <= 5) score += 18;
    else if (delta <= 12) score += 8;
    else score -= Math.min(40, delta);
  }
  return score;
}

function toResult(record, match) {
  if (!record) return notFound("Empty LRCLIB record");
  if (record.instrumental && !record.syncedLyrics && !record.plainLyrics) {
    return {
      status: "instrumental",
      source: "lrclib",
      match,
      id: record.id ?? null,
      trackName: record.trackName || record.name || "",
      artistName: record.artistName || "",
      albumName: record.albumName || "",
      synced: false,
      lines: [],
      plain: "",
    };
  }

  const syncedRaw = record.syncedLyrics?.trim() || "";
  const plain = record.plainLyrics?.trim() || "";
  const lines = parseLrc(syncedRaw);

  if (lines.length) {
    return {
      status: "found",
      source: "lrclib",
      match,
      id: record.id ?? null,
      trackName: record.trackName || record.name || "",
      artistName: record.artistName || "",
      albumName: record.albumName || "",
      synced: true,
      lines,
      plain: plain || lines.map((line) => line.text).join("\n"),
    };
  }

  if (plain) {
    return {
      status: "found",
      source: "lrclib",
      match,
      id: record.id ?? null,
      trackName: record.trackName || record.name || "",
      artistName: record.artistName || "",
      albumName: record.albumName || "",
      synced: false,
      lines: plain.split(/\r?\n/).filter(Boolean).map((text) => ({ time: null, text })),
      plain,
    };
  }

  return notFound("LRCLIB record had no lyrics");
}

async function request(url, fetchFn) {
  let lastError = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetchFn(url, {
        headers: {
          "Lrclib-Client": CLIENT,
          "X-User-Agent": CLIENT,
        },
      });
      if (response.status === 429) {
        const wait = Number(response.headers.get("Retry-After")) * 1000 || RETRY_DELAYS_MS[attempt] || 2000;
        await sleep(wait);
        lastError = response;
        continue;
      }
      if (response.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        lastError = response;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
    }
  }
  if (lastError && typeof lastError.status === "number") return lastError;
  throw lastError || new Error("LRCLIB request failed");
}

function notFound(error) {
  return {
    status: "not_found",
    source: "lrclib",
    synced: false,
    lines: [],
    plain: "",
    error,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
