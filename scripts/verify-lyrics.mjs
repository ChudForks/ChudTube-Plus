import { activeLineIndex, formatTimestamp, parseLrc } from "../src/lib/lrc.js";
import { fetchLyrics } from "../src/lib/lrclib.js";
import { normalizeLyrics, youtubeLyricsFromText } from "../src/lib/youtube-lyrics.js";

const sample = `[ar:The Weeknd]
[ti:Blinding Lights]
[00:13.13] Yeah
[00:27.16] I've been tryna call
[00:29.96][01:34.36] duplicated stamp test
[00:32.71] Maybe you can show me how to love, maybe
[01:00.73] I said, "Ooh, I'm blinded by the lights"
`;

const lines = parseLrc(sample);
const checks = [];

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) console.error("FAIL", name);
  else console.log("ok  ", name);
}

assert("parses line timestamps", lines[0]?.time === 13.13 && lines[0]?.text === "Yeah");
assert("skips metadata tags", !lines.some((line) => line.text.includes("The Weeknd")));
assert("expands multi-stamp rows", lines.filter((line) => line.text === "duplicated stamp test").length === 2);
assert("formats clocks", formatTimestamp(13.13) === "0:13" && formatTimestamp(80) === "1:20");
assert("active line is previous stamp", activeLineIndex(lines, 28) === 1);

const youtube = youtubeLyricsFromText(" First line \n\n Second   line ", "Source: LyricFind");
assert("normalizes YouTube lyric text", normalizeLyrics(" A  line\r\n\nB ") === "A line\nB");
assert(
  "maps YouTube lyrics to the shared result format",
  youtube?.source === "youtube" &&
    youtube.provider === "LyricFind" &&
    youtube.synced === false &&
    youtube.lines.length === 2
);

const remote = await fetchLyrics({
  title: "Blinding Lights",
  artist: "The Weeknd",
  album: "After Hours",
  duration: 200,
});

assert("lrclib returns found", remote.status === "found");
assert("lrclib returns synced lines", remote.synced === true && remote.lines.length > 10);
assert(
  "first synced line is timed",
  Number.isFinite(remote.lines[0]?.time) && remote.lines[0].text.length > 0
);

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} checks passed. ${remote.lines.length} synced lines from LRCLIB.`);
