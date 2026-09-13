import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const injectSource = fs.readFileSync(path.join(root, "src/inject/ytm-main.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src/content/ytm.js"), "utf8");
const inject = injectSource.replace(
  "if (!/(^|\\.)music\\.youtube\\.com$/i.test(location.hostname)) return;",
  ""
);

const html = `<!doctype html>
<html>
  <body>
    <ytmusic-app-layout id="layout">
      <ytmusic-player-bar>
        <yt-formatted-string class="title">Song Title</yt-formatted-string>
        <yt-formatted-string class="byline"><a>Artist</a> · Album</yt-formatted-string>
        <div class="middle-controls"></div>
      </ytmusic-player-bar>
      <ytmusic-player>
        <video></video>
      </ytmusic-player>
    </ytmusic-app-layout>
  </body>
</html>`;

const file = path.join(root, "scripts", "verify-lyrics-cpu.html");
fs.writeFileSync(file, html);

const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "domcontentloaded" });
await page.addScriptTag({ content: inject });

const result = await page.evaluate(async () => {
  const video = document.querySelector("video");
  let playing = false;
  Object.defineProperty(video, "paused", { configurable: true, get: () => !playing });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => (playing ? performance.now() / 1000 : 12),
  });
  Object.defineProperty(video, "duration", { configurable: true, get: () => 200 });

  const times = [];
  const songs = [];
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "CTP_TIME") times.push(event.data);
    if (event.data?.type === "CTP_SONG") songs.push(event.data);
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const countSince = (n) => times.length - n;

  await wait(250);
  const idle = times.length;

  window.postMessage({ type: "CTP_TIME_NEED", enabled: true, highRes: false }, "*");
  playing = true;
  video.dispatchEvent(new Event("play"));
  for (let i = 0; i < 4; i++) {
    video.dispatchEvent(new Event("timeupdate"));
    await wait(40);
  }
  const lowResPlaying = countSince(idle);

  const beforePause = times.length;
  playing = false;
  video.dispatchEvent(new Event("pause"));
  await wait(250);
  const lowResPaused = countSince(beforePause);

  const beforeHigh = times.length;
  window.postMessage({ type: "CTP_TIME_NEED", enabled: true, highRes: true }, "*");
  playing = true;
  video.dispatchEvent(new Event("play"));
  await wait(300);
  const highResPlaying = countSince(beforeHigh);

  const beforeFs = times.length;
  document.querySelector("ytmusic-app-layout").setAttribute("player-fullscreened", "");
  await wait(300);
  const fullscreenPlaying = countSince(beforeFs);
  document.querySelector("ytmusic-app-layout").removeAttribute("player-fullscreened");

  const beforeHighPause = times.length;
  playing = false;
  video.dispatchEvent(new Event("pause"));
  await wait(250);
  const highResPaused = countSince(beforeHighPause);

  const beforeClosed = times.length;
  window.postMessage({ type: "CTP_TIME_NEED", enabled: true, highRes: false }, "*");
  playing = true;
  video.dispatchEvent(new Event("play"));
  await wait(250);
  const closedPlaying = countSince(beforeClosed);

  const ticker = document.createElement("div");
  ticker.id = "ctp-player-ticker";
  document.querySelector(".middle-controls").appendChild(ticker);
  const songsBeforeTicker = songs.length;
  for (let i = 0; i < 20; i++) ticker.textContent = `line ${i % 2}`;
  await wait(50);
  const songsAfterTicker = songs.length - songsBeforeTicker;

  window.postMessage({ type: "CTP_TIME_NEED", enabled: false, highRes: false }, "*");
  const beforeOff = times.length;
  await wait(200);
  const afterOff = countSince(beforeOff);

  return {
    idle,
    lowResPlaying,
    lowResPaused,
    highResPlaying,
    fullscreenPlaying,
    highResPaused,
    closedPlaying,
    songsAfterTicker,
    afterOff,
  };
});

await browser.close();

const sourceChecks = [
  ["inject gates RAF on highRes and pause", injectSource.includes("function wantsRaf(")],
  ["inject stops RAF in player fullscreen", injectSource.includes("player-fullscreened")],
  ["inject ignores ticker mutations", injectSource.includes("mutationsFromTicker")],
  ["content asks for high-res only when needed", contentSource.includes("CTP_TIME_NEED")],
  ["ticker skips unchanged text", contentSource.includes("lastTickerText")],
];

const checks = [
  ...sourceChecks,
  ["no time messages until subscribed", result.idle === 0],
  ["paused low-res does not keep emitting", result.lowResPaused <= 1],
  ["high-res while playing is denser than ticker-only", result.highResPlaying > result.closedPlaying],
  ["video fullscreen stops the 60fps pump", result.fullscreenPlaying <= 2],
  ["high-res stops when paused", result.highResPaused <= 2],
  ["lyrics closed does not run a 60fps pump", result.closedPlaying < 20],
  ["ticker mutations do not emit extra songs", result.songsAfterTicker === 0],
  ["unsubscribe stops time messages", result.afterOff === 0],
];

for (const [name, ok] of checks) {
  console.log(ok ? "ok  " : "FAIL", name);
}
console.log(JSON.stringify(result, null, 2));
if (checks.some(([, ok]) => !ok)) process.exit(1);
