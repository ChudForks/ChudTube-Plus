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
assert.equal(apiUrl.searchParams.get("categories"), '["sponsor"]');
assert.equal(apiUrl.searchParams.get("actionTypes"), '["skip"]');
assert.deepEqual(response.segments, [{ id: "valid", start: 10, end: 20 }]);

const controllerPath = new URL("../src/content/sponsorblock.js", import.meta.url);
const controllerSource = (await readFile(controllerPath, "utf8"))
  .replace(/^import .*?;\s*/m, "")
  .replace(
    "const MEDIA_SELECTOR",
    `const getSettings = async () => ({ sponsorBlock: { autoSkip: true } });
     const onSettingsChanged = (callback) => { window.__settingsChanged = callback; };
     const MEDIA_SELECTOR`
  );

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setContent("<video></video>");
  await page.evaluateOnNewDocument(() => {});
  await page.evaluate(() => {
    window.chrome = {
      runtime: {
        sendMessage: async () => ({ segments: [{ id: "valid", start: 10, end: 20 }] }),
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
  await page.waitForFunction(() => {
    const media = document.querySelector("video");
    media.currentTime = 12;
    media.dispatchEvent(new Event("timeupdate"));
    return media.currentTime > 20;
  });
  await page.evaluate(() => {
    window.__settingsChanged({ sponsorBlock: { autoSkip: false } });
    const media = document.querySelector("video");
    media.currentTime = 12;
    media.dispatchEvent(new Event("timeupdate"));
  });
  assert.equal(await page.$eval("video", (media) => media.currentTime), 12);
} finally {
  await browser.close();
}

console.log("PASS: read-only API query, response filtering, auto-skip, and live disable.");
