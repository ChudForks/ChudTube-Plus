import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/lib/settings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = pathToFileURL(root + path.sep).href;
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
  args: ["--allow-file-access-from-files"],
});

assert.equal(mergeSettings({ ytm: { lyricsTheme: "unknown", lyricsSource: "unknown" } }).ytm.lyricsTheme, "classic");
assert.equal(mergeSettings({ ytm: { lyricsSource: "unknown" } }).ytm.lyricsSource, "auto");
assert.deepEqual(mergeSettings({ ytm: { followAlongLyrics: false } }).ytm, { ...DEFAULT_SETTINGS.ytm, followAlongLyrics: false });
assert.equal(mergeSettings({ ytm: { lyricsTheme: "oled-bounce", lyricsSource: "youtube" } }).ytm.lyricsSource, "youtube");
assert.equal(mergeSettings({ ytm: { lyricsTheme: "ytm" } }).ytm.lyricsTheme, "oled-bounce");
for (const lyricsMotion of ["full", "system", "reduced", "unknown"]) {
  assert.equal(Object.hasOwn(mergeSettings({ ytm: { lyricsMotion } }).ytm, "lyricsMotion"), false);
}

const errors = [];
try {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewport({ width: 900, height: 700 });
  await page.goto(base + "scripts/lyrics-preview.html");
  await page.setContent(`<!doctype html><html><head><style>
    html, body { margin: 0; background: #111; color: #fff; }
    ytmusic-player-page { display: block; }
    #tab-renderer { display: block; width: 360px; height: 600px; margin-left: auto; overflow: auto; }
  </style></head><body>
    <ytmusic-app-layout>
      <ytmusic-player-bar><img src="${base}icons/icon-master.png" alt="" style="display:none">
        <yt-formatted-string class="title">Test Song</yt-formatted-string>
        <yt-formatted-string class="byline"><a>Test Artist</a></yt-formatted-string>
        <div class="middle-controls"></div></ytmusic-player-bar>
      <ytmusic-player><video></video></ytmusic-player>
      <ytmusic-player-page><div class="tab-header-container">
        <tp-yt-paper-tab class="tab-header iron-selected" aria-selected="true">Lyrics</tp-yt-paper-tab>
        <tp-yt-paper-tab class="tab-header" aria-selected="false">Up next</tp-yt-paper-tab>
      </div></ytmusic-player-page>
      <ytmusic-tab-renderer id="tab-renderer" page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS">
        <ytmusic-description-shelf-renderer>
          <yt-formatted-string id="description">Official first line<br>Official second line</yt-formatted-string>
          <yt-formatted-string>Source: LyricFind</yt-formatted-string>
        </ytmusic-description-shelf-renderer>
      </ytmusic-tab-renderer>
    </ytmusic-app-layout>
  </body></html>`);
  await page.addStyleTag({ path: path.join(root, "src/content/ytm.css") });
  await page.evaluate(() => {
    window.settings = { ytm: { followAlongLyrics: true, lyricsTheme: "ytm", lyricsSource: "youtube", lyricsMotion: "reduced" } };
    window.listeners = [];
    window.requests = [];
    window.pending = [];
    window.defer = false;
    window.result = { status: "found", source: "lrclib", synced: true,
      lines: [{ time: 0, text: "LRCLIB opening line" }, { time: 10, text: "LRCLIB active line" }, { time: 20, text: "LRCLIB final line" }] };
    window.chrome = {
      storage: {
        sync: { get: async () => ({ settings: window.settings }) },
        onChanged: { addListener: fn => window.listeners.push(fn), removeListener() {} },
      },
      runtime: { sendMessage: request => {
        window.requests.push(request);
        return window.defer ? new Promise(resolve => window.pending.push(resolve)) : Promise.resolve(window.result);
      } },
    };
    const media = document.querySelector("video");
    Object.defineProperty(media, "duration", { configurable: true, get: () => 180 });
    window.setOptions = options => {
      window.settings = { ...window.settings, ytm: { ...window.settings.ytm, ...options } };
      for (const listener of window.listeners) listener({ settings: { newValue: window.settings } }, "sync");
    };
  });
  await page.evaluate(url => import(url), base + "src/content/ytm.js");
  await page.waitForFunction(() => document.querySelectorAll(".ctp-line").length === 2);
  assert.equal(await page.$("#ctp-lyrics-motion"), null);
  assert.equal(await page.$$eval(".ctp-controls select", inputs => inputs.length), 2);
  assert.equal(await page.$eval("#ctp-lyrics-source", el => el.value), "default");
  assert.equal(await page.$eval("#ctp-lyrics-source", el => el.options[0].textContent), "Default: YouTube Music");
  assert.equal(await page.$eval("#ctp-lyrics-theme", el => el.options[0].textContent), "Default: OLED Bounce");
  assert.equal(await page.evaluate(() => window.requests.length), 0);
  assert.equal(await page.$eval(".ctp-footer span", el => el.textContent), "YouTube Music · LyricFind");
  assert.equal(await page.$eval(".ctp-line", el => el.tagName), "DIV");
  assert.equal(await page.$eval(".ctp-time", el => getComputedStyle(el).display), "none");
  console.log("PASS: native source loads official text without LRCLIB requests; untimed lines are noninteractive.");

  await options(page, { lyricsSource: "lrclib" });
  await page.waitForFunction(() => document.querySelectorAll(".ctp-line").length === 3);
  await page.evaluate(() => window.postMessage({ type: "CTP_TIME", currentTime: 12, paused: true }, "*"));
  await page.waitForFunction(() => document.querySelector(".ctp-line-active")?.dataset.index === "1");
  assert.equal(await page.$eval(".ctp-footer span", el => el.textContent), "LRCLIB");
  await page.evaluate(() => {
    window.savedLine = document.querySelector(".ctp-line-active");
    window.requestCount = window.requests.length;
  });

  for (const theme of ["classic", "compact", "oled-bounce"]) {
    await options(page, { lyricsTheme: theme });
    assert.equal(await page.$eval("#ctp-lyrics-root", el => el.dataset.theme), theme);
    assert.equal(await page.evaluate(() => window.savedLine === document.querySelector(".ctp-line-active")), true);
    assert.equal(await page.evaluate(() => window.requests.length === window.requestCount), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".ctp-line-active .ctp-text")).color === "rgb(255, 255, 255)");
    const styles = await page.$eval(".ctp-line-active", line => ({
      background: getComputedStyle(line).backgroundImage,
      shadow: getComputedStyle(line).boxShadow,
      font: parseFloat(getComputedStyle(line.querySelector(".ctp-text")).fontSize),
      color: getComputedStyle(line.querySelector(".ctp-text")).color,
      time: getComputedStyle(line.querySelector(".ctp-time")).display,
      meter: getComputedStyle(line.querySelector(".ctp-meter")).display,
    }));
    assert.equal(styles.color, "rgb(255, 255, 255)");
    if (theme === "oled-bounce") {
      assert.ok(styles.font >= 28);
      assert.equal(styles.time, "none");
      assert.equal(styles.meter, "none");
      assert.equal(styles.background, "none");
      assert.equal(styles.shadow, "none");
      assert.equal(await page.$eval("#ctp-lyrics-root", el => getComputedStyle(el).backgroundColor), "rgb(0, 0, 0)");
      assert.equal(await page.$(".ctp-backdrop"), null);
      for (const selector of ["#ctp-lyrics-root", ".ctp-controls", ".ctp-footer"]) {
        assert.equal(await page.$eval(selector, el => getComputedStyle(el).backgroundImage), "none");
        assert.equal(await page.$eval(selector, el => getComputedStyle(el).backgroundColor), "rgb(0, 0, 0)");
      }
    }
    if (theme === "compact") assert.equal(styles.font, 18);
    assert.equal(await page.$eval(".ctp-line-active .ctp-meter-fill", el => el.getAnimations().length), theme === "classic" ? 1 : 0);
  }
  const panelFonts = [];
  for (const width of [280, 360, 520, 700]) {
    await page.$eval("#tab-renderer", (el, width) => { el.style.width = width + "px"; }, width);
    assert.equal(await page.$eval("#tab-renderer", el => el.scrollWidth <= el.clientWidth), true);
    panelFonts.push(await page.$eval(".ctp-text", el => parseFloat(getComputedStyle(el).fontSize)));
  }
  assert.ok(panelFonts[0] < panelFonts[2], "lyric sizing responds to the panel width");
  assert.ok(panelFonts.every(size => size >= 28 && size <= 40));
  const widePanelFont = panelFonts[3];
  await page.setViewport({ width: 1440, height: 700 });
  assert.equal(await page.$eval(".ctp-text", el => parseFloat(getComputedStyle(el).fontSize)), widePanelFont,
    "widening the window alone does not enlarge lyrics");
  await page.setViewport({ width: 900, height: 700 });
  await page.$eval("#tab-renderer", el => { el.style.width = "360px"; });
  const bounce = await page.$eval(".ctp-line-active .ctp-body", el => el.getAnimations().find(animation => animation.animationName === "ctp-lyric-bounce")?.effect.getTiming());
  assert.ok(bounce.duration >= 500 && bounce.duration <= 800, "spring settles promptly");
  assert.equal(bounce.iterations, 1);
  const samples = await page.$eval(".ctp-line-active .ctp-body", el => {
    const animation = el.getAnimations().find(animation => animation.animationName === "ctp-lyric-bounce");
    animation.pause();
    const samples = [0, 0.34, 0.56, 0.74, 1].map(progress => {
      animation.currentTime = progress * animation.effect.getTiming().duration;
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      return { y: matrix.m42, scale: matrix.m11 };
    });
    animation.finish();
    return samples;
  });
  const travel = Math.max(...samples.map(sample => sample.y)) - Math.min(...samples.map(sample => sample.y));
  assert.ok(travel >= 10 && travel <= 16, "bounce stays visible without excessive travel");
  assert.ok(Math.max(...samples.map(sample => sample.scale)) > 1 && Math.max(...samples.map(sample => sample.scale)) <= 1.025);
  assert.equal(samples.at(-1).scale, 1, "settled text stays within its original layout");
  assert.equal(await page.$eval(".ctp-line-active .ctp-text", el => el.textContent), "LRCLIB active line");
  assert.deepEqual(await page.$$eval(".ctp-line-active .ctp-word", words => words.map(el => el.getAnimations().find(animation => animation.animationName === "ctp-word-bounce")?.effect.getTiming().delay)), [0, 32, 64]);
  await page.waitForFunction(() => document.querySelector(".ctp-line-active .ctp-body").getAnimations().find(animation => animation.animationName === "ctp-lyric-bounce")?.playState === "finished");
  const beforeChange = await page.$eval('.ctp-line[data-index="2"]', el => ({ height: el.offsetHeight, top: el.offsetTop }));
  await page.evaluate(() => window.postMessage({ type: "CTP_TIME", currentTime: 22, paused: true }, "*"));
  await page.waitForFunction(() => document.querySelector(".ctp-line-active")?.dataset.index === "2");
  const newAnimation = await page.$eval(".ctp-line-active .ctp-body", el => el.getAnimations().find(animation => animation.animationName === "ctp-lyric-bounce")?.playState);
  assert.equal(newAnimation, "running");
  assert.deepEqual(await page.$eval('.ctp-line[data-index="2"]', el => ({ height: el.offsetHeight, top: el.offsetTop })), beforeChange);
  assert.equal(await page.$eval('.ctp-line[data-index="1"] .ctp-body', el => el.getAnimations().filter(animation => animation.animationName === "ctp-lyric-bounce").length), 0);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  assert.equal(await page.$eval(".ctp-line-active .ctp-body", el => el.getAnimations().filter(animation => animation.animationName === "ctp-lyric-bounce").length), 1);
  await options(page, { lyricsMotion: "system" });
  await page.evaluate(() => window.postMessage({ type: "CTP_TIME", currentTime: 12, paused: true }, "*"));
  await page.waitForFunction(() => document.querySelector(".ctp-line-active")?.dataset.index === "1");
  assert.equal(await page.$eval(".ctp-line-active .ctp-body", el => el.getAnimations().filter(animation => animation.animationName === "ctp-lyric-bounce").length), 1);
  assert.equal(await page.$$eval(".ctp-line-active .ctp-word", words => words.every(el => el.getAnimations().some(animation => animation.animationName === "ctp-word-bounce"))), true);
  assert.notEqual(await page.$eval(".ctp-line-active .ctp-text", el => getComputedStyle(el).transitionDuration), "0s");
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
  await page.waitForFunction(() => document.querySelector(".ctp-line-active .ctp-body").getAnimations().find(animation => animation.animationName === "ctp-lyric-bounce")?.playState === "finished");
  if (!process.argv.includes("--no-screenshots")) {
    await (await page.$("#tab-renderer")).screenshot({ path: path.join(root, "scripts/verify-lyrics-oled-bounce.png") });
  }
  console.log("PASS: pure black, restrained springs, staggered words, panel-relative sizing, stable layout, and always-full motion despite legacy settings or system preferences.");
  await page.click('.ctp-line[data-index="2"]');
  assert.equal(await page.$eval("video", el => el.currentTime), 20);
  console.log("PASS: all themes preserve lyric nodes and playback, OLED Bounce/compact skip meter animations, layouts fit narrow panels, and click-to-seek works.");

  await page.evaluate(() => { window.defer = true; });
  await options(page, { lyricsSource: "auto" });
  await page.waitForFunction(() => window.pending.length === 1);
  await options(page, { lyricsSource: "youtube" });
  await page.waitForFunction(() => document.querySelector(".ctp-footer span")?.textContent.startsWith("YouTube Music"));
  await page.evaluate(() => { window.pending.shift()(window.result); window.defer = false; });
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
  assert.match(await page.$eval(".ctp-text", el => el.textContent), /^Official/);
  console.log("PASS: an in-flight LRCLIB result cannot overwrite a later native source selection.");

  await page.evaluate(() => { window.result = { status: "not_found", source: "lrclib", lines: [], synced: false }; });
  await options(page, { lyricsSource: "lrclib" });
  await page.waitForFunction(() => document.querySelector(".ctp-status-title")?.textContent === "No lyrics found");
  assert.match(await page.$eval(".ctp-status-detail", el => el.textContent), /^LRCLIB has no lyrics/);
  await options(page, { lyricsSource: "auto" });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official first line");
  await page.evaluate(() => { window.result = { status: "found", source: "lrclib", synced: false, lines: [{ time: null, text: "LRCLIB plain line" }] }; });
  await options(page, { lyricsSource: "lrclib" });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "LRCLIB plain line");
  await options(page, { lyricsSource: "auto" });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official first line");
  await page.evaluate(() => { window.result = { status: "found", source: "lrclib", synced: true, lines: [{ time: 0, text: "LRCLIB timed line" }] }; });
  await options(page, { lyricsSource: "lrclib" });
  await options(page, { lyricsSource: "auto" });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "LRCLIB timed line");
  console.log("PASS: explicit LRCLIB never falls back; Automatic prefers synced LRCLIB and falls back to native over plain or missing LRCLIB.");

  await page.evaluate(() => {
    window.savedPicker = document.querySelector("#ctp-lyrics-source");
    window.requestCount = window.requests.length;
  });
  await page.focus("#ctp-lyrics-source");
  await page.select("#ctp-lyrics-source", "youtube");
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official first line");
  assert.equal(await page.evaluate(() => window.savedPicker === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.requests.length === window.requestCount), true);
  assert.equal(await page.evaluate(() => window.settings.ytm.lyricsSource), "auto");
  await options(page, { lyricsSource: "lrclib" });
  assert.equal(await page.$eval("#ctp-lyrics-source", el => el.value), "youtube");
  assert.equal(await page.$eval("#ctp-lyrics-source", el => el.options[0].textContent), "Default: LRCLIB");
  assert.equal(await page.evaluate(() => window.requests.length === window.requestCount), true);
  await page.select("#ctp-lyrics-source", "default");
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "LRCLIB timed line");
  await page.select("#ctp-lyrics-theme", "classic");
  await options(page, { lyricsTheme: "compact" });
  assert.equal(await page.$eval("#ctp-lyrics-root", el => el.dataset.theme), "classic");
  await page.select("#ctp-lyrics-theme", "default");
  assert.equal(await page.$eval("#ctp-lyrics-root", el => el.dataset.theme), "compact");
  await page.evaluate(() => { window.result = { status: "not_found", source: "lrclib", synced: false, lines: [] }; });
  await page.select("#ctp-lyrics-source", "auto");
  await page.select("#ctp-lyrics-source", "lrclib");
  await page.waitForFunction(() => document.querySelector(".ctp-status-title")?.textContent === "No lyrics found");
  assert.equal(await page.evaluate(() => window.savedPicker === document.querySelector("#ctp-lyrics-source")), true);
  await page.select("#ctp-lyrics-source", "youtube");
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official first line");
  await page.evaluate(() => {
    window.requestsBeforeTrack = window.requests.length;
    document.querySelector("#description").textContent = "Another track's official lyrics";
    window.postMessage({ type: "CTP_SONG", track: { videoId: "tab-choice-track", title: "Another Track", artist: "Artist" } }, "*");
  });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Another track's official lyrics");
  assert.equal(await page.evaluate(() => window.requests.length === window.requestsBeforeTrack), true);
  assert.equal(await page.$eval("#ctp-lyrics-source", el => el.value), "youtube");
  await page.select("#ctp-lyrics-source", "default");
  console.log("PASS: in-tab pickers keep focus through results/errors, preserve popup defaults, persist across songs, and return to saved defaults independently.");

  await options(page, { followAlongLyrics: false });
  assert.equal(await page.$("#ctp-lyrics-root"), null);
  assert.equal(await page.$eval("#tab-renderer", el => el.classList.contains("ctp-lyrics-visible")), false);
  await options(page, { lyricsSource: "youtube", lyricsTheme: "compact", followAlongLyrics: true });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Another track's official lyrics");
  assert.equal(await page.$eval("#ctp-lyrics-root", el => el.dataset.theme), "compact");

  // Advance only the wall clock to exercise the native wait without an 8s sleep.
  await page.evaluate(() => {
    document.querySelector("#description").textContent = "";
    window.realNow = Date.now;
    window.clockOffset = 0;
    Date.now = () => window.realNow() + window.clockOffset;
    window.postMessage({ type: "CTP_SONG", track: { title: "New Song", artist: "Artist", videoId: "new-song" } }, "*");
  });
  await page.waitForFunction(() => document.querySelector(".ctp-status-title")?.textContent === "Waiting for YouTube Music");
  await page.evaluate(() => { window.clockOffset = 10000; });
  await page.waitForFunction(() => document.querySelector(".ctp-status-title")?.textContent === "No lyrics found");
  await page.evaluate(() => { Date.now = window.realNow; document.querySelector("#description").textContent = "Late official lyrics"; });
  await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Late official lyrics");
  console.log("PASS: disabling restores native content; native loading times out cleanly and accepts late lyrics.");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

async function options(page, settings) {
  await page.evaluate(settings => window.setOptions(settings), settings);
}
