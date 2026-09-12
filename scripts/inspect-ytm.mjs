import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave =
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const out = path.join(root, "scripts", "inspect-ytm.json");
const screenshot = path.join(root, "scripts", "inspect-ytm.png");

const probe = () => ({
  href: location.href,
  title: document.title,
  ctpEnabled: document.documentElement.classList.contains("ctp-enabled"),
  bootStatus: document.getElementById("ctp-boot-status")?.textContent || null,
  ticker: document.getElementById("ctp-player-ticker")?.textContent || null,
  root: Boolean(document.getElementById("ctp-lyrics-root")),
  rootHidden: document.getElementById("ctp-lyrics-root")?.hidden ?? null,
  tabRenderer: Boolean(document.querySelector("#tab-renderer")),
  tabPageType: document.querySelector("#tab-renderer")?.getAttribute("page-type") || null,
  playerBar: Boolean(document.querySelector("ytmusic-player-bar")),
  songTitle: document.querySelector("ytmusic-player-bar yt-formatted-string.title")?.textContent?.trim() || null,
  songByline: document.querySelector("ytmusic-player-bar yt-formatted-string.byline")?.textContent?.trim() || null,
  video: Boolean(document.querySelector("video")),
  moviePlayer: Boolean(document.getElementById("movie_player")),
  tabs: [...document.querySelectorAll(".tab-header, tp-yt-paper-tab")].map((tab) => ({
    text: (tab.textContent || "").trim(),
    disabled: tab.hasAttribute("disabled") || tab.getAttribute("aria-disabled") === "true",
    selected: tab.getAttribute("aria-selected") === "true" || tab.classList.contains("iron-selected"),
  })),
  lyricNodes: [...document.querySelectorAll("*")]
    .map((el) => el.tagName.toLowerCase())
    .filter((name, i, arr) => name.includes("lyric") && arr.indexOf(name) === i),
  customTabs: [...document.querySelectorAll("*")]
    .map((el) => el.tagName.toLowerCase())
    .filter((name, i, arr) => name.includes("tab") && arr.indexOf(name) === i)
    .slice(0, 40),
});

async function connectExisting() {
  try {
    return await puppeteer.connect({
      browserURL: "http://127.0.0.1:9222",
      defaultViewport: null,
    });
  } catch {
    return null;
  }
}

const existing = await connectExisting();
const browser =
  existing ||
  (await puppeteer.launch({
    executablePath: brave,
    headless: false,
    defaultViewport: null,
    userDataDir: path.join(root, ".brave-debug"),
    args: [
      `--load-extension=${root}`,
      `--disable-extensions-except=${root}`,
      "--remote-debugging-port=9223",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-allow-origins=*",
    ],
  }));

const pages = await browser.pages();
let page = pages.find((p) => /music\.youtube\.com/.test(p.url())) || pages[0] || (await browser.newPage());
if (!/music\.youtube\.com/.test(page.url())) {
  await page.goto("https://music.youtube.com", { waitUntil: "domcontentloaded", timeout: 60000 });
}
await page.waitForSelector("ytmusic-app, body", { timeout: 30000 });
await new Promise((resolve) => setTimeout(resolve, 5000));

const result = {
  connectedExisting: Boolean(existing),
  url: page.url(),
  probe: await page.evaluate(probe),
};
fs.writeFileSync(out, JSON.stringify(result, null, 2));
await page.screenshot({ path: screenshot, fullPage: false });
console.log(JSON.stringify(result, null, 2));

if (!existing) {
  // Keep the debug window open for live use; disconnect without closing.
  browser.disconnect();
} else {
  browser.disconnect();
}
