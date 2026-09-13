import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const css = fs.readFileSync(path.join(root, "src/content/ytm.css"), "utf8");
const outDir = path.join(root, "scripts");

const html = `<!doctype html>
<html>
  <head>
    <style>${css}</style>
    <style>
      html, body { margin: 0; background: #111; color: #fff; }
      #tab-renderer { display: block; width: 320px; height: 100vh; margin-left: auto; overflow: hidden; }
      tp-yt-paper-tab[disabled] { opacity: 0.4; pointer-events: none; }
    </style>
  </head>
  <body>
    <ytmusic-app-layout>
      <ytmusic-player-bar>
        <div class="middle-controls">
          <div id="ctp-player-ticker">ChudTube+ · waiting</div>
        </div>
      </ytmusic-player-bar>
      <ytmusic-player-page>
        <tp-yt-paper-tab class="tab-header" disabled>Comments</tp-yt-paper-tab>
        <tp-yt-paper-tab class="tab-header ctp-lyrics-tab" disabled>Lyrics</tp-yt-paper-tab>
      </ytmusic-player-page>
    <ytmusic-tab-renderer id="tab-renderer" class="ctp-lyrics-visible">
      <div id="ctp-lyrics-root" class="ctp-lyrics">
        <div class="ctp-toolbar">
          <div class="ctp-ident">
            <div class="ctp-art" aria-hidden="true"></div>
            <div class="ctp-track">
              <div class="ctp-song">Natural Born Killer (Live at the Honda Center with an Extremely Long Subtitle)</div>
              <div class="ctp-artist">Avenged Sevenfold · Nightmare · Deluxe Edition Bonus Track</div>
            </div>
          </div>
          <div class="ctp-badge">Synced</div>
        </div>
        <div class="ctp-list">
          <button class="ctp-line ctp-line-active" type="button">
            <span class="ctp-time">0:39</span>
            <span class="ctp-body"><span class="ctp-text">I'm begging you to walk in my shoes any time with extra words that wrap</span><span class="ctp-meter" aria-hidden="true"><span class="ctp-meter-fill" style="transform: scaleX(0.62)"></span></span></span>
          </button>
        </div>
      </div>
    </ytmusic-tab-renderer>
    </ytmusic-app-layout>
  </body>
</html>`;

const file = path.join(outDir, "verify-lyrics-layout.html");
fs.writeFileSync(file, html);

const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700, deviceScaleFactor: 2 });
await page.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "domcontentloaded" });

const metrics = await page.evaluate(() => {
  const host = document.getElementById("tab-renderer");
  const line = document.querySelector(".ctp-line");
  const toolbar = document.querySelector(".ctp-toolbar");
  const badge = document.querySelector(".ctp-badge");
  const song = document.querySelector(".ctp-song");
  const comments = document.querySelector("tp-yt-paper-tab:not(.ctp-lyrics-tab)");
  const lyricsTab = document.querySelector("tp-yt-paper-tab.ctp-lyrics-tab");
  const ticker = document.getElementById("ctp-player-ticker");
  const hostBox = host.getBoundingClientRect();
  const lineBox = line.getBoundingClientRect();
  const toolbarBox = toolbar.getBoundingClientRect();
  const badgeBox = badge.getBoundingClientRect();
  const songOverflow = song.scrollWidth - song.clientWidth;
  return {
    hostWidth: hostBox.width,
    lineWidth: lineBox.width,
    lineOverflowsHost: lineBox.right - hostBox.right > 1,
    badgeInsideToolbar: badgeBox.right <= toolbarBox.right + 1 && badgeBox.left >= toolbarBox.left - 1,
    songTruncates: songOverflow > 8,
    commentsPointer: getComputedStyle(comments).pointerEvents,
    commentsOpacity: getComputedStyle(comments).opacity,
    lyricsPointer: getComputedStyle(lyricsTab).pointerEvents,
    lyricsOpacity: getComputedStyle(lyricsTab).opacity,
    tickerDisplay: getComputedStyle(ticker).display,
  };
});

await page.screenshot({
  path: path.join(outDir, "verify-lyrics-layout.png"),
  fullPage: true,
});

const inApp = await page.evaluate(() => {
  document.querySelector("ytmusic-app-layout").setAttribute("player-fullscreened", "");
  return {
    ticker: getComputedStyle(document.getElementById("ctp-player-ticker")).display,
    lyrics: getComputedStyle(document.getElementById("ctp-lyrics-root")).display,
    host: getComputedStyle(document.getElementById("tab-renderer")).display,
  };
});

await page.evaluate(() => {
  document.querySelector("ytmusic-app-layout").removeAttribute("player-fullscreened");
  document.documentElement.classList.add("ctp-video-fs");
});
const classFs = await page.evaluate(() => ({
  ticker: getComputedStyle(document.getElementById("ctp-player-ticker")).display,
  lyrics: getComputedStyle(document.getElementById("ctp-lyrics-root")).display,
}));

await browser.close();

const unscopedDisabled = /(?:^|,)\s*\.tab-header\[disabled\]/m.test(css);
const checks = [
  ["line stays inside 320px panel", !metrics.lineOverflowsHost],
  ["Synced badge stays in toolbar", metrics.badgeInsideToolbar],
  ["long title truncates", metrics.songTruncates],
  ["disabled-tab CSS is scoped to lyrics tab", !unscopedDisabled],
  ["lyrics disabled tab is clickable", metrics.lyricsPointer === "auto" && metrics.lyricsOpacity === "1"],
  ["comments disabled tab stays dimmed", Number(metrics.commentsOpacity) < 0.5],
  ["in-app video fullscreen hides lyrics", inApp.lyrics === "none"],
  ["in-app video fullscreen hides ticker", inApp.ticker === "none"],
  ["ctp-video-fs hides lyrics", classFs.lyrics === "none"],
];

for (const [name, ok] of checks) {
  console.log(ok ? "ok  " : "FAIL", name);
}
console.log(JSON.stringify({ metrics, inApp, classFs }, null, 2));
if (checks.some(([, ok]) => !ok)) process.exit(1);
