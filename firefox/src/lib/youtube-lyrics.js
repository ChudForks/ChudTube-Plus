const SOURCE_PREFIX = /^\s*source\s*:\s*/i;

export function youtubeLyricsFromText(value, attribution = "") {
  const plain = normalizeLyrics(value);
  if (!plain) return null;

  const provider = String(attribution || "").replace(SOURCE_PREFIX, "").trim();
  return {
    status: "found",
    source: "youtube",
    provider,
    synced: false,
    lines: plain.split("\n").map((text) => ({ time: null, text })),
    plain,
  };
}

export function normalizeLyrics(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
