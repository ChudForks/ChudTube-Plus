import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = pathToFileURL(root + path.sep).href;
const browser = await puppeteer.launch({
  browser: process.env.BROWSER_TYPE || "chrome",
  executablePath: process.env.BROWSER_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
  args: ["--allow-file-access-from-files"],
  extraPrefsFirefox: { "security.fileuri.strict_origin_policy": false },
});
const errors = [];
const first = { videoId: "song-a", title: "Song A", artist: "Artist A", album: "Album A" };
const timed = (label) => ({ status: "found", source: "lrclib", synced: true,
  lines: [{ time: 0, text: `${label} opening` }, { time: 10, text: `${label} middle` }, { time: 20, text: `${label} ending` }] });

try {
  for (const variant of ["src", "firefox/src"]) {
    await metadataCorrections(variant);
    await nativeLyricsLifecycle(variant);
    await preferredSyncedTransitions(variant);
    await nativeAlbumCorrection(variant);
    await localizedTabsAndRestoration(variant);
    await stagedLocalizedTabs(variant);
    console.log(`PASS: ${variant} metadata corrections, native lyric lifecycle, localized visibility, and native-tab restoration.`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

async function fixture(variant, { native = "", source = "auto", deferred = false, localized = false, disabled = false, album = "Album A" } = {}) {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "scripts/lyrics-preview.html");
  await page.setContent(`<!doctype html><html><head><style>
    ytmusic-player-page, #tab-renderer { display:block; }
    #tab-renderer { height:400px; overflow:auto; }
    tp-yt-paper-tab[disabled] { opacity:.4; pointer-events:none; }
  </style></head><body>
    <ytmusic-player-bar><yt-formatted-string class="title">Song A</yt-formatted-string>
      <yt-formatted-string class="byline"><a>Artist A</a><a>${album}</a></yt-formatted-string>
      <div class="middle-controls"></div></ytmusic-player-bar>
    <ytmusic-player><video></video></ytmusic-player>
    <ytmusic-player-page><div class="tab-header-container">
      <tp-yt-paper-tab id="queue-tab" class="tab-header" aria-selected="false">${localized ? "À suivre" : "Up next"}</tp-yt-paper-tab>
      <tp-yt-paper-tab id="native-tab" class="tab-header iron-selected" aria-selected="true" ${disabled ? 'disabled="native" aria-disabled="true"' : ""}>${localized ? "Paroles" : "Lyrics"}</tp-yt-paper-tab>
      <tp-yt-paper-tab id="related-tab" class="tab-header" aria-selected="false">${localized ? "Similaires" : "Related"}</tp-yt-paper-tab>
    </div></ytmusic-player-page>
    <ytmusic-tab-renderer id="tab-renderer" page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS">
      <ytmusic-description-shelf-renderer><yt-formatted-string id="description"></yt-formatted-string>
      <yt-formatted-string>Source: LyricFind</yt-formatted-string></ytmusic-description-shelf-renderer>
    </ytmusic-tab-renderer>
  </body></html>`);
  await page.addStyleTag({ path: path.join(root, variant, "content/ytm.css") });
  await page.evaluate(({ native, source, deferred, disabled }) => {
    document.querySelector("#description").textContent = native;
    window.settings = { ytm: { followAlongLyrics: true, lyricsSource: source } };
    window.listeners = [];
    window.requests = [];
    window.pending = [];
    window.deferred = deferred;
    window.chrome = {
      storage: {
        sync: { get: async () => ({ settings: window.settings }) },
        onChanged: { addListener: (fn) => window.listeners.push(fn), removeListener() {} },
      },
      runtime: { sendMessage: (request) => {
        window.requests.push(request);
        return window.deferred ? new Promise((resolve) => window.pending.push(resolve)) :
          Promise.resolve({ status: "not_found", source: "lrclib", synced: false, lines: [] });
      } },
    };
    const tab = document.querySelector("#native-tab");
    tab.disabled = disabled;
    if (disabled) {
      tab.style.setProperty("pointer-events", "none", "important");
      tab.style.setProperty("opacity", "0.35", "important");
    }
    window.setOptions = (options) => {
      window.settings.ytm = { ...window.settings.ytm, ...options };
      for (const listener of window.listeners) listener({ settings: { newValue: window.settings } }, "sync");
    };
  }, { native, source, deferred, disabled });
  await page.evaluate((url) => import(url), base + variant + "/content/ytm.js");
  await page.waitForFunction(() => document.documentElement.classList.contains("ctp-enabled"));
  return page;
}

async function song(page, track, updateDom = true) {
  await page.evaluate(({ track, updateDom }) => {
    if (updateDom) {
      document.querySelector("ytmusic-player-bar .title").textContent = track.title;
      const links = document.querySelectorAll("ytmusic-player-bar .byline a");
      links[0].textContent = track.artist;
      links[1].textContent = track.album || "";
    }
    window.postMessage({ type: "CTP_SONG", track }, "*");
  }, { track, updateDom });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 30)));
}

async function metadataCorrections(variant) {
  const page = await fixture(variant, { source: "lrclib", deferred: true });
  try {
    await page.waitForFunction(() => window.requests.length === 1);
    await song(page, first);
    assert.equal(await page.evaluate(() => window.requests.length), 1, "video ID enrichment keeps the original request");
    await page.evaluate(() => window.postMessage({ type: "CTP_TIME", videoId: "song-a", currentTime: 12, paused: true }, "*"));
    await song(page, { ...first, title: "Song B (Official Audio)", artist: "Artist B", album: "Album B" });
    assert.equal(await page.evaluate(() => window.requests.length), 2, "same-ID corrected metadata fetches corrected lyrics");
    assert.deepEqual(await page.evaluate(() => ({ title: window.requests[1].track.title, artist: window.requests[1].track.artist, album: window.requests[1].track.album })),
      { title: "Song B", artist: "Artist B", album: "Album B" });
    await page.evaluate((result) => window.pending[1](result), timed("Correct"));
    await page.waitForFunction(() => document.querySelector(".ctp-line-active")?.dataset.index === "1");
    assert.equal(await page.$eval(".ctp-song", (el) => el.textContent), "Song B");
    await page.evaluate((result) => window.pending[0](result), timed("Obsolete"));
    await settle(page);
    assert.equal(await page.$eval(".ctp-line-active .ctp-text", (el) => el.textContent), "Correct middle", "obsolete pending metadata cannot overwrite correction");
    await song(page, { ...first, title: "Song B", artist: "Artist B", album: "Corrected album" });
    assert.equal(await page.evaluate(() => window.requests.length), 3, "LRCLIB album correction uses its new lookup identity");
    await page.evaluate((result) => window.pending[2](result), timed("Album"));
    await page.waitForFunction(() => document.querySelector(".ctp-line-active .ctp-text")?.textContent === "Album middle");
    await song(page, { ...first, title: "Song B", artist: "Artist B", album: "Corrected album", duration: 183 });
    assert.equal(await page.evaluate(() => window.requests.length), 3, "duration-only enrichment does not restart lyrics");
  } finally { await page.close(); }
}

async function nativeLyricsLifecycle(variant) {
  const page = await fixture(variant, { native: "Shared official lyrics", source: "youtube" });
  try {
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Shared official lyrics");
    await song(page, first);
    await song(page, { ...first, videoId: "song-b" });
    assert.equal(await page.$(".ctp-text"), null, "untouched previous-track text stays rejected");
    await page.evaluate(() => {
      const description = document.querySelector("#description");
      description.textContent = "";
      description.textContent = "Shared official lyrics";
    });
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Shared official lyrics");
    await song(page, { ...first, videoId: "song-c" });
    assert.equal(await page.$(".ctp-text"), null, "fresh text becomes the next track's stale baseline");
    await page.evaluate(() => {
      const old = document.querySelector("#description");
      const replacement = old.cloneNode(true);
      old.replaceWith(replacement);
    });
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Shared official lyrics");
    await song(page, { ...first, videoId: "song-d" });
    assert.equal(await page.$(".ctp-text"), null);
    await page.evaluate(() => document.querySelector("ytmusic-description-shelf-renderer").replaceWith(document.querySelector("ytmusic-description-shelf-renderer").cloneNode(true)));
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Shared official lyrics");
  } finally { await page.close(); }
}

async function preferredSyncedTransitions(variant) {
  const page = await fixture(variant, { deferred: true });
  try {
    await song(page, first);
    await page.evaluate((result) => window.pending[0](result), timed("A"));
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "A opening");
    await page.evaluate(() => document.querySelector("#description").textContent = "Outgoing native A");
    await settle(page);
    await song(page, { ...first, videoId: "song-b", title: "Song B" });
    assert.equal(await page.$(".ctp-text"), null, "unadopted outgoing text is still rejected while B loads");
    await page.evaluate(() => window.pending[1]({ status: "not_found", source: "lrclib", lines: [] }));
    await settle(page);
    assert.equal(await page.$(".ctp-text"), null, "missing B must not fall back to native A");
    await page.evaluate(() => document.querySelector("#description").textContent = "Official B");
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official B");
    await page.evaluate((result) => window.pending[1](result), timed("ignored"));
    // New native text and bar metadata can arrive before the CTP_SONG bridge message.
    await page.evaluate(() => {
      document.querySelector("ytmusic-player-bar .title").textContent = "Song C";
      document.querySelector("#description").textContent = "Official C";
    });
    await settle(page);
    assert.equal(await page.$eval(".ctp-text", (el) => el.textContent), "Official B", "incoming text does not bind to the outgoing song");
    await song(page, { ...first, videoId: "song-c", title: "Song C" });
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official C");
  } finally { await page.close(); }
  const pending = await fixture(variant, { deferred: true });
  try {
    await song(pending, first);
    await pending.evaluate(() => {
      document.querySelector("ytmusic-player-bar .title").textContent = "Song B";
      document.querySelector("#description").textContent = "Incoming B while A loads";
    });
    await settle(pending);
    assert.equal(await pending.$(".ctp-text"), null, "incoming native text cannot bind to outgoing loading track");
    await song(pending, { ...first, videoId: "song-b", title: "Song B" });
    await pending.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Incoming B while A loads");
  } finally { await pending.close(); }
}

async function nativeAlbumCorrection(variant) {
  const page = await fixture(variant, { native: "Official lyrics", deferred: true });
  try {
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official lyrics");
    await song(page, first);
    await page.evaluate(() => { window.savedLine = document.querySelector(".ctp-line"); });
    await song(page, { ...first, album: "Corrected album", duration: 183 });
    assert.equal(await page.evaluate(() => window.savedLine === document.querySelector(".ctp-line")), true);
    assert.equal(await page.evaluate(() => window.requests.length), 2, "known album correction replaces its pending lookup while preserving native nodes");
    await page.evaluate((result) => window.pending[0](result), timed("Wrong album"));
    await settle(page);
    assert.equal(await page.$eval(".ctp-text", (el) => el.textContent), "Official lyrics", "obsolete old-album synced response cannot replace official text");
    assert.equal(await page.$eval(".ctp-artist", (el) => el.textContent), "Artist A · Corrected album");
    await page.evaluate((result) => window.pending[1](result), timed("Correct album"));
    await page.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Correct album opening");
  } finally { await page.close(); }
  const enriched = await fixture(variant, { native: "Official lyrics", deferred: true, album: "" });
  try {
    await enriched.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Official lyrics");
    await song(enriched, first);
    assert.equal(await enriched.evaluate(() => window.requests.length), 1, "empty-to-known album enrichment preserves pending native upgrade");
    await enriched.evaluate((result) => window.pending[0](result), timed("Enriched"));
    await enriched.waitForFunction(() => document.querySelector(".ctp-text")?.textContent === "Enriched opening");
  } finally { await enriched.close(); }
}

async function localizedTabsAndRestoration(variant) {
  const page = await fixture(variant, { native: "Official lyrics", localized: true, disabled: true });
  try {
    await page.waitForFunction(() => document.querySelector("#ctp-lyrics-root")?.hidden === false);
    assert.equal(await page.$eval("#native-tab", (el) => el.disabled), false, "localized Lyrics tab becomes clickable");
    for (const id of ["queue-tab", "related-tab"]) {
      await selectTab(page, id);
      await settle(page);
      assert.equal(await page.$eval("#ctp-lyrics-root", (el) => el.hidden), true, "selected nonlyrics tab wins over stale LYRICS page-type");
      await selectTab(page, "native-tab");
      await page.waitForFunction(() => document.querySelector("#ctp-lyrics-root")?.hidden === false);
    }
    await page.evaluate(() => window.setOptions({ followAlongLyrics: false }));
    assert.deepEqual(await page.$eval("#native-tab", (el) => ({ disabled: el.disabled, attr: el.getAttribute("disabled"), aria: el.getAttribute("aria-disabled"), marker: el.classList.contains("ctp-lyrics-tab"),
      pointer: el.style.getPropertyValue("pointer-events"), pointerPriority: el.style.getPropertyPriority("pointer-events"), opacity: el.style.getPropertyValue("opacity"), opacityPriority: el.style.getPropertyPriority("opacity") })),
    { disabled: true, attr: "native", aria: "true", marker: false, pointer: "none", pointerPriority: "important", opacity: "0.35", opacityPriority: "important" });
    assert.equal(await page.$("#ctp-lyrics-root"), null);
    await page.evaluate(() => window.setOptions({ followAlongLyrics: true }));
    await page.waitForFunction(() => document.querySelector("#ctp-lyrics-root")?.hidden === false);
    await page.evaluate(() => {
      const tab = document.querySelector("#native-tab");
      tab.style.setProperty("opacity", "0.6", "important");
      tab.setAttribute("aria-disabled", "native-update");
      window.setOptions({ followAlongLyrics: false });
    });
    assert.equal(await page.$eval("#native-tab", (el) => el.style.getPropertyValue("opacity")), "0.6", "later native style changes survive teardown");
    assert.equal(await page.$eval("#native-tab", (el) => el.getAttribute("aria-disabled")), "native-update");
    await page.evaluate(() => window.setOptions({ followAlongLyrics: true }));
    await page.evaluate(() => {
      window.detachedTab = document.querySelector("#native-tab");
      const replacement = window.detachedTab.cloneNode(true);
      replacement.disabled = true;
      replacement.setAttribute("disabled", "replacement");
      replacement.setAttribute("aria-disabled", "true");
      replacement.classList.remove("ctp-lyrics-tab");
      replacement.style.setProperty("pointer-events", "none");
      window.detachedTab.replaceWith(replacement);
    });
    await page.waitForFunction(() => !document.querySelector("#native-tab").hasAttribute("disabled"));
    await page.evaluate(() => window.setOptions({ followAlongLyrics: false }));
    assert.equal(await page.$eval("#native-tab", (el) => el.getAttribute("disabled")), "replacement", "replacement tab restores its own baseline");
    assert.equal(await page.$eval("#native-tab", (el) => el.disabled), true);
    assert.equal(await page.evaluate(() => window.detachedTab.classList.contains("ctp-lyrics-tab")), false);
  } finally { await page.close(); }
}

async function selectTab(page, id) {
  await page.evaluate((id) => {
    document.querySelector(`#${id}`).click();
    for (const tab of document.querySelectorAll(".tab-header")) {
      const selected = tab.id === id;
      tab.setAttribute("aria-selected", String(selected));
      tab.classList.toggle("iron-selected", selected);
    }
  }, id);
}

async function stagedLocalizedTabs(variant) {
  const page = await fixture(variant, { localized: true, disabled: true });
  try {
    await page.evaluate(() => {
      document.querySelector("#native-tab").remove();
      document.querySelector("#related-tab").remove();
      const queue = document.querySelector("#queue-tab");
      queue.setAttribute("aria-selected", "true");
      queue.setAttribute("disabled", "queue-native");
      queue.setAttribute("aria-disabled", "true");
    });
    await page.waitForFunction(() => document.querySelector("#queue-tab").classList.contains("ctp-lyrics-tab"));
    await page.evaluate(() => {
      const lyrics = document.createElement("tp-yt-paper-tab");
      lyrics.id = "late-native-tab";
      lyrics.className = "tab-header";
      lyrics.textContent = "Paroles";
      lyrics.setAttribute("disabled", "lyrics-native");
      lyrics.setAttribute("aria-disabled", "true");
      lyrics.setAttribute("aria-selected", "false");
      document.querySelector(".tab-header-container").append(lyrics);
    });
    await page.waitForFunction(() => document.querySelector("#late-native-tab").classList.contains("ctp-lyrics-tab"));
    assert.equal(await page.$eval("#late-native-tab", (el) => el.hasAttribute("disabled")), false);
    assert.equal(await page.$eval("#queue-tab", (el) => el.classList.contains("ctp-lyrics-tab")), false, "stronger complete-header evidence replaces sole-tab inference");
    assert.equal(await page.$eval("#queue-tab", (el) => el.getAttribute("disabled")), "queue-native", "superseded tab regains its native attributes");
    assert.equal(await page.$eval("#ctp-lyrics-root", (el) => el.hidden), true, "selected queue stays hidden despite stale native Lyrics page-type");
  } finally { await page.close(); }
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 850)));
}
