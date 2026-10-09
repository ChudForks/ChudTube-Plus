import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
  args: ["--allow-file-access-from-files"],
});
const baseUrl = pathToFileURL(resolve(".")).href + "/";
const cache = {};
const requests = [];
let installed;
let changed;
let message;
let tabPage;
let scriptCalls = 0;

globalThis.chrome = {
  runtime: {
    onInstalled: { addListener(fn) { installed = fn; } },
    onStartup: { addListener() {} },
    onMessage: { addListener(fn) { message = fn; } },
  },
  storage: {
    sync: { async get() { return { settings: { ytm: { theme: "default" } } }; } },
    local: {
      async get(key) { return { [key]: cache[key] }; },
      async set(values) { Object.assign(cache, values); },
      async remove(key) { delete cache[key]; },
    },
    onChanged: { addListener(fn) { changed = fn; } },
  },
  tabs: {
    async query({ url }) {
      return url[0].includes("music.youtube") ? [] : [{ id: 1, url: "https://www.youtube.com/" }];
    },
  },
  scripting: {
    async insertCSS({ files }) {
      for (const path of files) await tabPage.addStyleTag({ path });
    },
    async executeScript({ func, args = [], files = [] }) {
      scriptCalls++;
      if (func) await tabPage.evaluate(func, ...args);
      for (const path of files) await tabPage.addScriptTag({ path });
    },
  },
};
globalThis.fetch = async (url) => {
  const query = new URL(url).searchParams;
  requests.push(query);
  return {
    ok: true,
    status: 200,
    async json() {
      return { trackName: query.get("track_name"), albumName: query.get("album_name"), plainLyrics: `Lyrics for ${query.get("album_name")}` };
    },
  };
};

try {
  await import("../src/background.js");
  const track = { title: "Track", artist: "Artist", album: "First album", duration: 180 };
  const fetchTrack = (track) => new Promise((done) => {
    assert.equal(message({ type: "CTP_FETCH_LYRICS", track }, {}, done), true);
  });
  cache["ctp-lyrics:artist::track::180"] = {
    fetchedAt: Date.now(), result: { status: "found", plain: "Legacy ambiguous lyrics" },
  };
  assert.equal((await fetchTrack(track)).plain, "Lyrics for First album");
  assert.equal((await fetchTrack({ ...track, album: "Second album" })).plain, "Lyrics for Second album");
  assert.equal(requests.length, 2);
  assert.equal((await fetchTrack({ ...track, title: " TRACK ", artist: " ARTIST ", album: " FIRST ALBUM " })).cached, true);
  assert.equal(requests.length, 2);
  await fetchTrack({ ...track, album: "" });
  assert.equal(requests.length, 3);
  assert.equal((await fetchTrack(track)).plain, "Lyrics for First album");
  // Delimiters in metadata must not let distinct artist/title pairs collide.
  await fetchTrack({ ...track, artist: "A::B", title: "C" });
  await fetchTrack({ ...track, artist: "A", title: "B::C" });
  assert.equal(requests.length, 5);
  console.log("PASS: album-specific lyrics cache, normalized hits, missing albums, legacy-cache isolation, and delimiter safety.");

  for (const nativeDark of [false, true]) {
    tabPage = await browser.newPage();
    await tabPage.goto(baseUrl + "scripts/oled-preview.html");
    await tabPage.setContent(`<html ${nativeDark ? 'dark darker-dark-theme' : ''}><head><style>
      html, body, ytd-app { --native-dark-token: #181818; }
      ytd-app { display: block; background: var(--native-dark-token); }
    </style></head><body><ytd-app></ytd-app></body></html>`);
    await installChrome(tabPage, { youtube: { theme: "custom", customTheme: palette("#112233") } });
    const before = await tabPage.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty("background", "#abcdef", "important");
      root.style.setProperty("--yt-spec-base-background", "#abcdef");
      return { background: root.style.getPropertyValue("background"), priority: root.style.getPropertyPriority("background") };
    });
    installed();
    await tabPage.waitForFunction(() => window.__ctpApplyYoutubeSettings && document.body.style.getPropertyValue("color-scheme") === "dark");
    await updateSettings(tabPage, { youtube: { theme: "default" } });
    changed({ settings: { newValue: { youtube: { theme: "default" } } } }, "sync");
    const after = await tabPage.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-ctp-theme"),
      background: document.documentElement.style.getPropertyValue("background"),
      priority: document.documentElement.style.getPropertyPriority("background"),
      token: document.documentElement.style.getPropertyValue("--yt-spec-base-background"),
      dark: document.documentElement.hasAttribute("dark"),
      darker: document.documentElement.hasAttribute("darker-dark-theme"),
      appToken: document.querySelector("ytd-app").style.getPropertyValue("--native-dark-token"),
    }));
    assert.equal(after.theme, null);
    assert.equal(after.background, before.background);
    assert.equal(after.priority, before.priority);
    assert.equal(after.token, "#abcdef");
    assert.equal(after.dark, nativeDark);
    assert.equal(after.darker, nativeDark);
    assert.equal(after.appToken, "");
    await tabPage.close();
  }
  assert.equal(scriptCalls, 2, "only the boot script should paint existing YouTube tabs");
  console.log("PASS: already-open light/dark tabs restore native backgrounds, inline priorities, tokens, and dark attributes.");

  const themes = await browser.newPage();
  await themes.goto(baseUrl + "scripts/oled-preview.html");
  await themes.setContent(`<style>
    html, body, ytd-app { --native-dark-token: #181818; --native-light-token: #f9f9f9; }
  </style><ytd-app></ytd-app>`);
  await installChrome(themes, { youtube: { theme: "default" } });
  await themes.addScriptTag({ path: "src/content/yt-boot.js" });
  await themes.waitForFunction(() => window.__testListeners.length > 0);
  for (const background of ["#112233", "#223344", "#eeeeee", "#dddddd", "#000000"]) {
    await updateSettings(themes, { youtube: { theme: "custom", customTheme: palette(background) } });
    const values = await themes.evaluate(() => [document.documentElement, document.body, document.querySelector("ytd-app")].map(el => ({
      dark: getComputedStyle(el).getPropertyValue("--native-dark-token").trim(),
      light: getComputedStyle(el).getPropertyValue("--native-light-token").trim(),
    })));
    for (const value of values) {
      const light = background === "#eeeeee" || background === "#dddddd";
      assert.equal(value[light ? "light" : "dark"], background);
      assert.equal(value[light ? "dark" : "light"], light ? "#181818" : "#f9f9f9");
    }
  }
  console.log("PASS: consecutive custom palette edits refresh remapped root/body/app colors, including dark/light transitions (already fixed).");

  const music = await browser.newPage();
  await music.goto(baseUrl + "scripts/lyrics-preview.html");
  await music.setContent('<ytmusic-player-bar><yt-formatted-string class="title"></yt-formatted-string><yt-formatted-string class="byline"><a>Artist</a><a>Album</a></yt-formatted-string></ytmusic-player-bar>');
  await installChrome(music, { ytm: { followAlongLyrics: true } });
  await music.evaluate(url => import(url), baseUrl + "src/content/ytm.js");
  await music.waitForFunction(() => document.documentElement.classList.contains("ctp-enabled"));
  // Use the real page bridge, substituting only its hostname guard for a file fixture.
  const bridge = (await readFile("src/inject/ytm-main.js", "utf8")).replace("location.hostname", '"music.youtube.com"');
  await music.evaluate(() => { document.querySelector(".title").textContent = "Track (Official Audio)"; });
  await music.addScriptTag({ content: bridge });
  await music.waitForFunction(() => window.__testRequests.length === 1);
  const requestedTrack = await music.evaluate(() => window.__testRequests[0].track);
  assert.equal(requestedTrack.title, "Track");
  assert.equal(requestedTrack.artist, "Artist");
  assert.equal(requestedTrack.album, "Album");
  await music.evaluate(() => {
    window.postMessage({ type: "CTP_SONG", track: { videoId: "second-song", title: "Song [Official Music Video]", artist: "Artist", album: "Album", duration: 200 } }, "*");
  });
  await music.waitForFunction(() => window.__testRequests.length === 2);
  assert.equal(await music.evaluate(() => window.__testRequests[1].track.title), "Song");
  await music.evaluate(() => {
    window.postMessage({ type: "CTP_SONG", track: { videoId: "empty-song", title: "(Official Audio)", artist: "Artist" } }, "*");
  });
  await music.evaluate(() => new Promise(done => setTimeout(done, 50)));
  assert.equal(await music.evaluate(() => window.__testRequests.length), 2);
  console.log("PASS: real bridge titles are cleaned before lyrics requests; empty cleaned titles are ignored.");
} finally {
  await browser.close();
}

function palette(background) {
  return { background, surface: "#223344", text: "#ddeeff", muted: "#aabbcc", accent: "#ff695b", hover: "#334455", outline: "#445566" };
}

async function installChrome(page, settings) {
  await page.evaluate((baseUrl, settings) => {
    window.__testSettings = settings;
    window.__testListeners = [];
    window.__testRequests = [];
    window.chrome = {
      runtime: {
        getURL: path => baseUrl + path,
        sendMessage: async request => {
          window.__testRequests.push(request);
          return { status: "not_found", source: "lrclib", synced: false, lines: [], plain: "" };
        },
      },
      storage: {
        sync: { get: async (_key, callback) => {
          const result = { settings: window.__testSettings };
          if (callback) setTimeout(() => callback(result), 0);
          return result;
        } },
        onChanged: {
          addListener: fn => window.__testListeners.push(fn),
          removeListener: fn => { window.__testListeners = window.__testListeners.filter(listener => listener !== fn); },
        },
      },
    };
  }, baseUrl, settings);
}

async function updateSettings(page, settings) {
  await page.evaluate(settings => {
    window.__testSettings = settings;
    for (const listener of window.__testListeners) listener({ settings: { newValue: settings } }, "sync");
  }, settings);
}
