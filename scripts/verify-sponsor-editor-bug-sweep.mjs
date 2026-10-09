import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import puppeteer from "puppeteer-core";

// Serve the real modules without changing repository files or browser profiles.
const projectRoot = new URL("../", import.meta.url);
const fixture = `<style>
  #movie_player { position: relative; width: 640px; height: 360px; }
  .ytp-progress-bar { width: 600px; height: 6px; }
</style><div id="movie_player"><video></video><div class="ytp-progress-bar"></div></div>`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/fixture") {
    response.setHeader("Content-Type", "text/html");
    response.end(fixture);
    return;
  }
  try {
    const contents = await readFile(new URL(`.${pathname}`, projectRoot));
    const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".png": "image/png" };
    response.setHeader("Content-Type", types[extname(pathname)] || "application/octet-stream");
    response.end(contents);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}/`;
let assertions = 0;
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
}

async function installChrome(page, settings) {
  await page.evaluateOnNewDocument((initialSettings) => {
    window.saved = initialSettings;
    window.storageListeners = [];
    window.segments = [
      { id: "sponsor", category: "sponsor", start: 10, end: 20 },
      { id: "intro", category: "intro", start: 30, end: 35 },
    ];
    window.chrome = {
      runtime: { sendMessage: async () => ({ segments: structuredClone(window.segments) }) },
      storage: {
        sync: {
          get: async () => ({ settings: structuredClone(window.saved) }),
          set: async ({ settings: next }) => {
            const oldValue = window.saved;
            window.saved = structuredClone(next);
            for (const listener of window.storageListeners) {
              listener({ settings: { oldValue, newValue: window.saved } }, "sync");
            }
          },
        },
        onChanged: {
          addListener: (listener) => window.storageListeners.push(listener),
          removeListener: (listener) => {
            window.storageListeners = window.storageListeners.filter((item) => item !== listener);
          },
        },
      },
    };
    window.markerBuilds = 0;
    const replaceChildren = Element.prototype.replaceChildren;
    Element.prototype.replaceChildren = function (...children) {
      if (this.classList.contains("ctp-sponsorblock-markers")) window.markerBuilds += 1;
      return replaceChildren.apply(this, children);
    };
  }, settings);
}

async function updateSettings(page, partial) {
  await page.evaluate((patch) => {
    const oldValue = window.saved;
    window.saved = {
      ...window.saved,
      ...patch,
      youtube: { ...window.saved.youtube, ...patch.youtube },
    };
    for (const listener of window.storageListeners) {
      listener({ settings: { oldValue, newValue: window.saved } }, "sync");
    }
  }, partial);
}

async function frames(page, count = 4) {
  await page.evaluate((remaining) => new Promise((resolve) => {
    const next = () => {
      if (--remaining <= 0) resolve();
      else requestAnimationFrame(next);
    };
    requestAnimationFrame(next);
  }), count);
}

async function sponsorChecks(browser, prefix) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await installChrome(page, { sponsorBlock: { autoSkip: false, showSegmentColors: true } });
    await page.goto(baseUrl + "fixture");
    await page.evaluate(() => {
      window.mediaDuration = 100;
      Object.defineProperty(document.querySelector("video"), "duration", { get: () => window.mediaDuration });
    });
    await page.addScriptTag({ type: "module", content: `import ${JSON.stringify(baseUrl + prefix + "src/content/sponsorblock.js")};` });
    await page.waitForFunction(() => window.storageListeners.length === 1);
    await page.evaluate(() => window.postMessage({ type: "CTP_SONG", track: { videoId: "abcdefghijk" } }, "*"));
    await page.waitForFunction(() => document.querySelectorAll(".ctp-sponsorblock-marker").length === 2);
    await frames(page);
    const initial = await page.evaluate(() => {
      window.originalMarker = document.querySelector(".ctp-sponsorblock-marker");
      return window.markerBuilds;
    });
    await frames(page, 18);
    equal(await page.evaluate(() => window.markerBuilds), initial, "idle markers must not rebuild each frame");
    equal(await page.evaluate(() => document.querySelector("video").paused), true);
    equal(await page.evaluate(() => document.querySelector(".ctp-sponsorblock-marker") === window.originalMarker), true);

    await page.evaluate(() => document.body.append(document.createElement("aside")));
    await frames(page);
    equal(await page.evaluate(() => window.markerBuilds), initial, "unrelated DOM changes preserve marker nodes");

    await page.evaluate(() => {
      window.mediaDuration = 200;
      document.querySelector("video").dispatchEvent(new Event("durationchange"));
    });
    await frames(page);
    equal(await page.$eval(".ctp-sponsorblock-marker", (marker) => [marker.style.left, marker.style.width]), ["5%", "5%"]);
    equal(await page.evaluate(() => window.markerBuilds), initial + 1, "duration changes rebuild once");
    await page.evaluate(() => document.querySelector("video").dispatchEvent(new Event("loadedmetadata")));
    await updateSettings(page, { sponsorBlock: { categories: { sponsor: "button" }, showSegmentColors: true } });
    await frames(page);
    equal(await page.evaluate(() => window.markerBuilds), initial + 1, "unchanged duration and skip mode do not rebuild markers");

    await page.evaluate(() => document.querySelector(".ctp-sponsorblock-markers").replaceChildren());
    await page.waitForFunction(() => document.querySelectorAll(".ctp-sponsorblock-marker").length === 2);
    await frames(page);
    equal(await page.$eval(".ctp-sponsorblock-marker", (marker) => marker.style.left), "5%", "removed marker children recover");

    await page.evaluate(() => {
      const replacement = document.createElement("div");
      replacement.className = "ytp-progress-bar";
      replacement.id = "replacement-progress";
      document.querySelector(".ytp-progress-bar").replaceWith(replacement);
    });
    await page.waitForSelector("#replacement-progress .ctp-sponsorblock-marker");
    equal(await page.$eval("#replacement-progress .ctp-sponsorblock-marker", (marker) => marker.style.left), "5%");
    await frames(page);
    const replaced = await page.evaluate(() => window.markerBuilds);
    await page.evaluate(() => document.querySelector(".ctp-sponsorblock-markers").remove());
    await page.waitForSelector("#replacement-progress .ctp-sponsorblock-markers");
    await frames(page);
    equal(await page.evaluate(() => window.markerBuilds), replaced, "a detached layer is reattached without rebuilding");

    await page.evaluate(() => document.querySelector(".ytp-progress-bar").append(document.createElement("span")));
    await frames(page);
    equal(await page.$eval(".ytp-progress-bar", (host) => host.lastElementChild.className), "ctp-sponsorblock-markers");
    equal(await page.evaluate(() => window.markerBuilds), replaced, "native progress insertion keeps marker stacking without rebuilding");

    await page.evaluate(() => document.querySelector(".ytp-progress-bar").remove());
    await frames(page);
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.className = "ytp-progress-bar";
      document.querySelector("#movie_player").append(host);
    });
    await page.waitForSelector(".ytp-progress-bar .ctp-sponsorblock-marker");
    equal(await page.$eval(".ctp-sponsorblock-marker", (marker) => marker.style.left), "5%", "a later progress host is discovered");

    await page.evaluate(() => {
      window.segments = [{ id: "new", category: "intro", start: 40, end: 60 }];
      window.postMessage({ type: "CTP_SONG", track: { videoId: "lmnopqrstuv" } }, "*");
    });
    await page.waitForFunction(() => document.querySelectorAll(".ctp-sponsorblock-marker").length === 1 && document.querySelector(".ctp-sponsorblock-marker").style.left === "20%");
    equal(await page.$eval(".ctp-sponsorblock-marker", (marker) => [marker.dataset.category, marker.style.width, marker.style.backgroundColor]), ["intro", "10%", "rgb(0, 255, 255)"]);
    await updateSettings(page, { sponsorBlock: { categories: { sponsor: "button" }, showSegmentColors: false } });
    equal(await page.$(".ctp-sponsorblock-markers"), null);
    await updateSettings(page, { sponsorBlock: { categories: { sponsor: "button" }, showSegmentColors: true } });
    await page.waitForSelector(".ctp-sponsorblock-marker");
    await frames(page);
    const final = await page.evaluate(() => window.markerBuilds);
    await frames(page, 18);
    equal(await page.evaluate(() => window.markerBuilds), final, "reenabled markers settle again");
    equal(errors, []);
    return `0 idle rebuilds across 18 frames; ${final} necessary marker builds`;
  } finally {
    await page.close();
  }
}

async function editorChecks(browser, prefix) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await installChrome(page, { youtube: { theme: "custom", customTheme: { background: "#000000" } } });
    await page.goto(baseUrl + prefix + "src/theme-editor/editor.html");
    await page.waitForFunction(() => document.querySelector("#color-background").value === "#000000");
    await page.$eval("#color-background", (input) => {
      input.value = "#112233";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await updateSettings(page, { ytm: { theme: "default" } });
    equal(await page.$eval("#color-background", (input) => input.value), "#112233", "unrelated settings keep the draft");
    equal(await page.$eval("#saveCustom", (button) => button.disabled), false);
    equal(await page.$eval("#saveStatus", (status) => status.textContent), "Unsaved changes");
    await updateSettings(page, { youtube: { theme: "default" } });
    equal(await page.$eval("#useOnYoutube", (input) => input.checked), false);
    equal(await page.$eval("#color-background", (input) => input.value), "#112233", "theme enablement changes keep the draft");

    await updateSettings(page, { youtube: { customTheme: { background: "#334455" } } });
    equal(await page.$eval("#color-background", (input) => input.value), "#112233", "external palette changes keep a dirty draft");
    equal(await page.$eval("#saveCustom", (button) => button.disabled), false);
    equal(await page.$eval('[data-preset="custom"] .preset-bar i', (swatch) => swatch.style.backgroundColor), "rgb(51, 68, 85)", "Custom swatches follow the saved palette");
    await page.click('[data-preset="custom"]');
    equal(await page.$eval("#color-background", (input) => input.value), "#334455", "explicitly selecting Custom loads the external palette");
    equal(await page.$eval("#saveCustom", (button) => button.disabled), true);

    await updateSettings(page, { youtube: { customTheme: { background: "#556677" } } });
    equal(await page.$eval("#color-background", (input) => input.value), "#556677", "a clean Custom view follows external palette changes");
    equal(await page.$eval("#saveCustom", (button) => button.disabled), true);
    equal(await page.$eval("#saveStatus", (status) => status.textContent), "Saved in Custom");
    await page.$eval("#color-background", (input) => {
      input.value = "#112233";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.click("#saveCustom");
    await page.waitForFunction(() => window.saved.youtube.customTheme.background === "#112233" && document.querySelector("#saveCustom").disabled);
    equal(await page.$eval("#saveStatus", (status) => status.textContent), "Saved in Custom");
    equal(await page.evaluate(() => window.saved.youtube.theme), "default", "saving a draft preserves theme enablement");
    equal(errors, []);
  } finally {
    await page.close();
  }
}

let browser;
try {
  browser = await puppeteer.launch({
    browser: process.env.BROWSER_TYPE || "chrome",
    executablePath: process.env.BROWSER_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
    headless: true,
  });
  for (const prefix of ["", "firefox/"]) {
    const before = assertions;
    const markers = await sponsorChecks(browser, prefix);
    await editorChecks(browser, prefix);
    console.log(`PASS: ${prefix || "main/"}: ${assertions - before} assertions; ${markers}; dirty drafts and saved Custom updates preserved.`);
  }
  console.log(`PASS: all ${assertions} SponsorBlock/editor bug-sweep assertions; no repository or user-profile writes.`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
