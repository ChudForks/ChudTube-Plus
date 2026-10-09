const TAG_RE = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META_RE = /^\[(ar|ti|al|au|by|offset|length|re|ve):/i;

export function parseLrc(raw) {
  if (!raw || typeof raw !== "string") return [];

  const lines = [];
  for (const original of raw.split(/\r?\n/)) {
    const row = original.trim();
    if (!row || META_RE.test(row)) continue;

    const stamps = [];
    TAG_RE.lastIndex = 0;
    let match;
    let lastIndex = 0;
    while ((match = TAG_RE.exec(row))) {
      stamps.push(toSeconds(match[1], match[2], match[3]));
      lastIndex = match.index + match[0].length;
    }
    if (!stamps.length) continue;

    const text = stripWordSync(row.slice(lastIndex).trim());
    if (!text) continue;

    for (const time of stamps) {
      lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
  return dedupe(lines);
}

export function formatTimestamp(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function activeLineIndex(lines, currentTime) {
  if (!lines?.length) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= currentTime) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function toSeconds(min, sec, fraction) {
  const minutes = Number(min);
  const seconds = Number(sec);
  let extra = 0;
  if (fraction) {
    const padded = fraction.length === 1 ? `${fraction}00` : fraction.length === 2 ? `${fraction}0` : fraction.slice(0, 3);
    extra = Number(padded) / 1000;
  }
  return minutes * 60 + seconds + extra;
}

function stripWordSync(text) {
  return text.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, "").replace(/\s+/g, " ").trim();
}

function dedupe(lines) {
  const out = [];
  const seen = new Set();
  for (const line of lines) {
    const key = `${line.time.toFixed(3)}|${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
