import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});

try {
  const page = await browser.newPage();
  const fixtureBase = "file:///" + path.join(root, "scripts", "lyrics-preview.html").replace(/\\/g, "/");
  await page.goto(fixtureBase);
  await page.setContent(`<!doctype html>
    <ytmusic-app-layout>
      <ytmusic-player-bar>
        <yt-formatted-string class="title">Official Song</yt-formatted-string>
        <yt-formatted-string class="byline"><a>Official Artist</a></yt-formatted-string>
        <div class="middle-controls"></div>
      </ytmusic-player-bar>
      <ytmusic-player><video></video></ytmusic-player>
      <ytmusic-player-page>
        <div class="tab-header-container">
          <tp-yt-paper-tab class="tab-header iron-selected" aria-selected="true">Lyrics</tp-yt-paper-tab>
        </div>
      </ytmusic-player-page>
      <ytmusic-tab-renderer id="tab-renderer" page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS">
        <ytmusic-description-shelf-renderer>
          <yt-formatted-string id="description">YouTube first line<br>YouTube second line</yt-formatted-string>
          <yt-formatted-string>Source: LyricFind</yt-formatted-string>
        </ytmusic-description-shelf-renderer>
      </ytmusic-tab-renderer>
    </ytmusic-app-layout>`);

  await page.evaluate(() => {
    window.lyricsRequests = 0;
    window.chrome = {
      storage: {
        sync: { get: async () => ({ settings: { ytm: { followAlongLyrics: true } } }) },
        onChanged: { addListener() {}, removeListener() {} },
      },
      runtime: {
        sendMessage: async () => (window.lyricsRequests++, {
          status: "not_found",
          source: "lrclib",
          synced: false,
          lines: [],
          plain: "",
        }),
      },
    };
    const video = document.querySelector("video");
    Object.defineProperty(video, "duration", { configurable: true, get: () => 180 });
  });

  const ytmUrl = "file:///" + path.join(root, "src/content/ytm.js").replace(/\\/g, "/");
  await page.evaluate(async (url) => import(url), ytmUrl);
  await page.waitForFunction(
    () => document.querySelectorAll("#ctp-lyrics-root .ctp-line").length === 2,
    { timeout: 5000 }
  );

  const result = await page.evaluate(() => ({
    lines: [...document.querySelectorAll("#ctp-lyrics-root .ctp-text")].map((el) => el.textContent),
    footer: document.querySelector("#ctp-lyrics-root .ctp-footer span")?.textContent,
    badge: document.querySelector("#ctp-lyrics-root .ctp-badge")?.textContent,
  }));

  const checks = [
    ["renders YouTube's native lyric lines", result.lines.join("|") === "YouTube first line|YouTube second line"],
    ["shows YouTube and its lyric provider", result.footer === "YouTube Music · LyricFind"],
    ["marks native lyrics as unsynced", result.badge === "Unsynced"],
  ];
  const stability = await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const line = document.querySelector(".ctp-line");
    const requests = window.lyricsRequests;
    document.querySelector("#description").innerHTML = "YouTube   first line<br>YouTube second line";
    const song = { title: "Official Song", artist: "Official Artist", videoId: "song-a", duration: 181 };
    window.postMessage({ type: "CTP_SONG", track: song }, "*");
    await wait(100);
    window.postMessage({ type: "CTP_SONG", track: { ...song, duration: 183, album: "Album" } }, "*");
    await wait(1500);
    const stable = line === document.querySelector(".ctp-line") && window.lyricsRequests === requests;
    document.querySelector(".tab-header").click();
    await wait(100);
    const tabStable = line === document.querySelector(".ctp-line");
    window.postMessage({ type: "CTP_SONG", track: { ...song, videoId: "song-b" } }, "*");
    await wait(100);
    return { stable, tabStable, changed: window.lyricsRequests === requests + 1 };
  });
  checks.push(
    ["metadata and whitespace updates preserve lyrics nodes and request count", stability.stable],
    ["reselecting Lyrics preserves existing lines", stability.tabStable],
    ["a different playback video fetches new lyrics", stability.changed],
  );
  for (const [name, ok] of checks) {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  }
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
} finally {
  await browser.close();
}
