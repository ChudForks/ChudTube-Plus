import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const localCache = {};
let messageListener;
let fetchedUrl = "";

globalThis.chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener(listener) { messageListener = listener; } },
  },
  storage: {
    sync: { async get() { return {}; } },
    local: {
      async get(key) { return { [key]: localCache[key] }; },
      async set(values) { Object.assign(localCache, values); },
      remove(key) { delete localCache[key]; },
    },
    onChanged: { addListener() {} },
  },
  tabs: { async query() { return []; } },
  scripting: { async insertCSS() {}, async executeScript() {} },
};

globalThis.fetch = async (url) => {
  fetchedUrl = String(url);
  return {
    ok: true,
    status: 200,
    async json() {
      return [{
        videoID: "abcdefghijk",
        segments: [
          { UUID: "valid", category: "sponsor", actionType: "skip", segment: [10, 20] },
          { UUID: "intro", category: "intro", actionType: "skip", segment: [1, 2] },
          { UUID: "bad", category: "sponsor", actionType: "skip", segment: [30, 29] },
        ],
      }];
    },
  };
};

const { mergeSettings, SPONSOR_CATEGORIES } = await import(`../src/lib/settings.js?verify=${Date.now()}`);
assert.equal(mergeSettings({ sponsorBlock: { autoSkip: true } }).sponsorBlock.categories.sponsor, "auto");
assert.equal(mergeSettings({ sponsorBlock: { autoSkip: true } }).sponsorBlock.categories.intro, "auto");
assert.equal(mergeSettings({}).sponsorBlock.categories.sponsor, "button");
assert.equal(mergeSettings({ sponsorBlock: { categories: { sponsor: "button" } } }).sponsorBlock.categories.sponsor, "button");
assert.equal(mergeSettings({ sponsorBlock: { categories: { sponsor: "button" } } }).sponsorBlock.categories.intro, "button");
assert.equal(mergeSettings({ sponsorBlock: { categories: { sponsor: "nope" } } }).sponsorBlock.categories.sponsor, "button");
assert.equal(mergeSettings({ sponsorBlock: { autoSkip: false } }).sponsorBlock.categories.sponsor, "off");

await import(`../src/background.js?verify=${Date.now()}`);
const response = await new Promise((resolve) => {
  const asyncResponse = messageListener(
    { type: "CTP_FETCH_SPONSOR_SEGMENTS", videoId: "abcdefghijk" },
    {},
    resolve
  );
  assert.equal(asyncResponse, true);
});

const expectedPrefix = createHash("sha256").update("abcdefghijk").digest("hex").slice(0, 4);
const apiUrl = new URL(fetchedUrl);
assert.equal(apiUrl.pathname, `/api/skipSegments/${expectedPrefix}`);
assert.equal(apiUrl.searchParams.get("categories"), '["sponsor","selfpromo","interaction","intro","outro","preview","music_offtopic","filler"]');
assert.equal(apiUrl.searchParams.get("actionTypes"), '["skip"]');
assert.deepEqual(response.segments, [
  { id: "intro", category: "intro", start: 1, end: 2 },
  { id: "valid", category: "sponsor", start: 10, end: 20 },
]);

const allAuto = Object.fromEntries(SPONSOR_CATEGORIES.map((category) => [category.id, "auto"]));
const controllerPath = new URL("../src/content/sponsorblock.js", import.meta.url);
const controllerSource = (await readFile(controllerPath, "utf8"))
  .replace(/^import .*?;\s*/m, "")
  .replace(
    "const MEDIA_SELECTOR",
    `const SPONSOR_CATEGORIES = ${JSON.stringify(SPONSOR_CATEGORIES)};
     const sponsorCategoryModes = (settings) => {
       const source = settings && typeof settings === "object" ? settings : {};
       const stored = source.categories && typeof source.categories === "object" ? source.categories : {};
       const fallback = source.autoSkip ? "auto" : "off";
       const categories = {};
       for (const { id } of SPONSOR_CATEGORIES) {
         const value = stored[id] ?? fallback;
         categories[id] = value === "auto" || value === "button" || value === "off" ? value : "off";
       }
       return categories;
     };
     const getSettings = async () => ({ sponsorBlock: { categories: ${JSON.stringify(allAuto)}, showSegmentColors: true } });
     const onSettingsChanged = (callback) => { window.__settingsChanged = callback; };
     const MEDIA_SELECTOR`
  );

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 500, deviceScaleFactor: 2 });
  await page.setContent(`
    <style>
      html, body { margin: 0; background: #000; }
      #movie_player { position: relative; width: 640px; height: 360px; background: #111; }
      video { width: 100%; height: 100%; background: #222; }
      .ytp-progress-bar-container { position: absolute; left: 12px; right: 12px; bottom: 8px; height: 6px; background: #444; }
    </style>
    <div id="movie_player"><div class="ytp-progress-bar-container"></div><video></video></div>
  `);
  await page.evaluate(() => {
    window.chrome = {
      runtime: {
        sendMessage: async () => ({ segments: [
          { id: "intro", category: "intro", start: 1, end: 2 },
          { id: "valid", category: "sponsor", start: 10, end: 20 },
        ] }),
      },
    };
    const media = document.querySelector("video");
    let time = 0;
    Object.defineProperty(media, "currentTime", {
      configurable: true,
      get: () => time,
      set: (value) => { time = value; },
    });
    Object.defineProperty(media, "duration", { configurable: true, get: () => 100 });
  });
  await page.addScriptTag({ type: "module", content: controllerSource });
  await page.evaluate(() => {
    window.postMessage({ type: "CTP_SONG", track: { videoId: "abcdefghijk" } }, "*");
  });
  await page.waitForFunction(() => typeof window.__settingsChanged === "function");
  await page.waitForFunction(() => document.querySelectorAll(".ctp-sponsorblock-marker").length === 2);
  assert.deepEqual(
    await page.$$eval(".ctp-sponsorblock-marker", (markers) => markers.map((marker) => [marker.dataset.category, marker.style.backgroundColor])),
    [["intro", "rgb(0, 255, 255)"], ["sponsor", "rgb(0, 212, 0)"]]
  );
  await page.waitForFunction(() => {
    const media = document.querySelector("video");
    media.currentTime = 12;
    media.dispatchEvent(new Event("timeupdate"));
    return media.currentTime > 20;
  });

  await page.evaluate(() => {
    window.__settingsChanged({
      sponsorBlock: {
        showSegmentColors: true,
        categories: { sponsor: "off", intro: "button" },
      },
    });
    const media = document.querySelector("video");
    media.currentTime = 12;
    media.dispatchEvent(new Event("timeupdate"));
  });
  assert.equal(await page.$eval("video", (media) => media.currentTime), 12);
  assert.equal(
    await page.$eval(".ctp-sponsorblock-skip", (button) => !button.hidden).catch(() => false),
    false
  );

  await page.evaluate(() => {
    const media = document.querySelector("video");
    media.currentTime = 1.2;
    media.dispatchEvent(new Event("timeupdate"));
  });
  await page.waitForFunction(() => {
    const button = document.querySelector(".ctp-sponsorblock-skip");
    return button && !button.hidden && button.getAttribute("aria-label") === "Skip intro";
  });
  assert.equal(await page.$eval(".ctp-sponsorblock-skip-label", (label) => label.textContent), "Skip intro");
  assert.equal(await page.$eval(".ctp-sponsorblock-skip", (button) => getComputedStyle(button).bottom), "72px");
  await page.$eval("#movie_player", (player) => player.classList.add("ytp-fullscreen"));
  assert.equal(await page.$eval(".ctp-sponsorblock-skip", (button) => getComputedStyle(button).bottom), "120px");
  await page.screenshot({ path: "scripts/sponsorblock-skip-button.png" });
  await page.$eval("#movie_player", (player) => player.classList.remove("ytp-fullscreen"));
  await page.$eval(".ctp-sponsorblock-skip", (button) => button.click());
  assert.ok(await page.$eval("video", (media) => media.currentTime > 2));

  await page.evaluate(() => {
    window.__settingsChanged({
      sponsorBlock: {
        showSegmentColors: true,
        categories: { sponsor: "off", intro: "off" },
      },
    });
    const media = document.querySelector("video");
    media.currentTime = 1.2;
    media.dispatchEvent(new Event("timeupdate"));
  });
  assert.equal(await page.$eval("video", (media) => media.currentTime), 1.2);
  assert.equal(await page.$eval(".ctp-sponsorblock-skip", (button) => button.hidden), true);

  await page.evaluate(() => {
    window.__settingsChanged({ sponsorBlock: { autoSkip: false, showSegmentColors: false } });
  });
  await page.waitForFunction(() => !document.querySelector(".ctp-sponsorblock-markers"));
  assert.equal(await page.$(".ctp-sponsorblock-skip"), null);
} finally {
  await browser.close();
}

console.log("PASS: read-only API query, response filtering, per-category auto-skip, skip button, and live disable.");
