import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const injectSource = fs.readFileSync(path.join(root, "src/inject/ytm-main.js"), "utf8");
const contentSource = fs.readFileSync(path.join(root, "src/content/ytm.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "src/content/ytm.css"), "utf8");
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
      <ytmusic-player-page>
        <tp-yt-paper-tab class="tab-header iron-selected" aria-selected="true">Lyrics</tp-yt-paper-tab>
      </ytmusic-player-page>
      <ytmusic-tab-renderer id="tab-renderer"></ytmusic-tab-renderer>
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

await page.addStyleTag({ content: cssSource });

const meter = await page.evaluate(async () => {
  const line = document.createElement("button");
  line.className = "ctp-line ctp-line-active";
  line.style.width = "300px";
  line.innerHTML =
    '<span class="ctp-meter" aria-hidden="true"><span class="ctp-meter-fill"></span></span>';
  document.body.appendChild(line);
  const fill = line.querySelector(".ctp-meter-fill");
  const anim = fill.animate(
    [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
    { duration: 1000, easing: "linear", fill: "forwards" }
  );
  anim.currentTime = 0;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  await wait(120);
  const mid = anim.currentTime;
  const width = getComputedStyle(fill).width;
  const transform = getComputedStyle(fill).transform;
  anim.pause();
  await nextFrame();
  await nextFrame();
  const pausedAt = anim.currentTime;
  const pausedState = anim.playState;
  await wait(100);
  const pausedLater = anim.currentTime;
  anim.cancel();
  line.remove();
  return {
    mid,
    pausedAt,
    pausedLater,
    pausedState,
    width,
    transform,
  };
});

const wake = await page.evaluate(async () => {
  const nextTime = 0.2;
  const t = 0.05;
  const lookahead = 0.05;
  const delay = (nextTime - lookahead - t) * 1000;
  const start = performance.now();
  await new Promise((resolve) => setTimeout(resolve, delay > 0 ? delay : 16));
  return { elapsed: performance.now() - start, delay };
});

const page2 = await browser.newPage();
await page2.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "domcontentloaded" });
await page2.addStyleTag({ content: cssSource });
await page2.addScriptTag({ content: inject });
await page2.evaluate(() => {
  window.chrome = {
    storage: {
      sync: {
        get: async () => ({ settings: { ytm: { followAlongLyrics: true } } }),
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
    runtime: {
      sendMessage: async (msg) => {
        if (msg?.type !== "CTP_FETCH_LYRICS") return;
        return {
          status: "found",
          synced: true,
          lines: [
            { time: 0, text: "one" },
            { time: 0.3, text: "two" },
            { time: 2, text: "three" },
          ],
        };
      },
    },
  };

  window.__ctpNeed = [];
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "CTP_TIME_NEED") window.__ctpNeed.push(event.data);
  });

  const video = document.querySelector("video");
  let origin = 0;
  let playing = false;
  Object.defineProperty(video, "paused", { configurable: true, get: () => !playing });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => (playing ? (performance.now() - origin) / 1000 : 0),
  });
  Object.defineProperty(video, "duration", { configurable: true, get: () => 200 });
  Object.defineProperty(video, "playbackRate", { configurable: true, get: () => 1 });
  Object.defineProperty(video, "seeking", { configurable: true, get: () => false });
  Object.defineProperty(video, "readyState", { configurable: true, get: () => 4 });
  video.play = async () => {
    origin = performance.now();
    playing = true;
    video.dispatchEvent(new Event("play"));
    video.dispatchEvent(new Event("playing"));
  };
  video.pause = () => {
    playing = false;
    video.dispatchEvent(new Event("pause"));
  };
});

const ytmUrl = "file:///" + path.join(root, "src/content/ytm.js").replace(/\\/g, "/");
await page2.evaluate(async (url) => {
  await import(url);
}, ytmUrl);
await page2.waitForFunction(
  () => document.querySelectorAll("#ctp-lyrics-root .ctp-line").length >= 3,
  { timeout: 5000 }
);
await page2.evaluate(() => document.querySelector("video").play());
await new Promise((resolve) => setTimeout(resolve, 80));

const live = await page2.evaluate(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const meterAnims = () =>
    (document.getAnimations?.() || []).filter((anim) =>
      anim.effect?.target?.classList?.contains("ctp-meter-fill")
    );
  const fill = document.querySelector(".ctp-line-active .ctp-meter-fill");
  const beforeText = document.querySelector(".ctp-line-active .ctp-text")?.textContent;
  const beforeAnims = meterAnims();
  const beforeTime = beforeAnims[0]?.currentTime || 0;
  await wait(80);
  const midAnims = meterAnims();
  const midTime = midAnims[0]?.currentTime || 0;
  await wait(200);
  const afterText = document.querySelector(".ctp-line-active .ctp-text")?.textContent;
  const afterAnims = meterAnims();
  document.querySelector("video").pause();
  await wait(40);
  const pausedAnims = meterAnims();
  return {
    beforeText,
    afterText,
    beforePlayState: beforeAnims[0]?.playState || "",
    midPlayState: midAnims[0]?.playState || "",
    afterPlayState: afterAnims[0]?.playState || "",
    beforeTime,
    midTime,
    pausedPlayState: pausedAnims[0]?.playState || "",
    animCountBefore: beforeAnims.length,
    animCountAfter: afterAnims.length,
    fillClass: fill?.className || "",
    highResRequested: (window.__ctpNeed || []).some((item) => item.highRes),
    lineCount: document.querySelectorAll("#ctp-lyrics-root .ctp-line").length,
  };
});

await browser.close();

const sourceChecks = [
  ["inject gates RAF on highRes and pause", injectSource.includes("function wantsRaf(")],
  ["inject stops RAF in player fullscreen", injectSource.includes("player-fullscreened")],
  ["inject ignores ticker mutations", injectSource.includes("mutationsFromTicker")],
  ["inject emits waiting/stalled for meter pause", injectSource.includes('"waiting"') && injectSource.includes('"stalled"')],
  ["content never requests high-res", contentSource.includes("const nextHighRes = false")],
  ["content wakes on next line", contentSource.includes("function scheduleLineWake(")],
  ["content uses WAAPI meter", contentSource.includes(".animate(") && contentSource.includes("ctp-meter-fill")],
  ["content does not write --ctp-progress", !contentSource.includes("--ctp-progress")],
  ["ticker skips unchanged text", contentSource.includes("lastTickerText")],
  ["meter fill uses scaleX not width progress", cssSource.includes(".ctp-meter-fill") && !cssSource.includes("var(--ctp-progress")],
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
  ["CSS meter animation advances without JS writes", meter.mid > 80],
  ["CSS meter pauses with the media clock", meter.pausedState === "paused" && Math.abs(meter.pausedLater - meter.pausedAt) < 16],
  ["CSS meter fill is full-width scaleX", Number.parseFloat(meter.width) > 0 && String(meter.transform).includes("matrix")],
  ["next-line wake fires near the boundary", wake.elapsed > 70 && wake.elapsed < 180],
  ["live lyrics render synced lines", live.lineCount === 3],
  ["live lyrics do not request high-res", live.highResRequested === false],
  ["live meter runs as a CSS animation", live.midTime - live.beforeTime > 40],
  ["live wake advances the active line", live.beforeText === "one" && live.afterText === "two"],
  ["live meter pauses with playback", live.pausedPlayState === "paused"],
];

for (const [name, ok] of checks) {
  console.log(ok ? "ok  " : "FAIL", name);
}
console.log(JSON.stringify({ result, meter, wake, live }, null, 2));
if (checks.some(([, ok]) => !ok)) process.exit(1);
