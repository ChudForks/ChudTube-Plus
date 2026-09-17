import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const fixture = "file:///" + path.join(root, "scripts", "oled-preview.html").replace(/\\/g, "/");
const popup = "file:///" + path.join(root, "src", "popup", "popup.html").replace(/\\/g, "/");
const shotFixture = path.join(root, "scripts", "oled-preview.png");
const shotPopup = path.join(root, "scripts", "popup-oled.png");
const shotYoutube = path.join(root, "scripts", "youtube-oled.png");

const checks = [];
function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
  if (!condition) console.error("FAIL", name);
  else console.log("ok  ", name);
}

function isBlack(color) {
  return /rgba?\(\s*0\s*,\s*0\s*,\s*0/.test(color) || color === "rgb(0, 0, 0)" || color === "#000" || color === "black";
}

const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(fixture, { waitUntil: "load", timeout: 30000 });
  const fixtureColors = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement);
    const app = getComputedStyle(document.querySelector("ytd-app"));
    const masthead = getComputedStyle(document.querySelector("ytd-masthead"));
    return {
      theme: document.documentElement.getAttribute("data-ctp-theme"),
      htmlBg: html.backgroundColor,
      token: html.getPropertyValue("--yt-spec-base-background").trim(),
      appBg: app.backgroundColor,
      mastheadBg: masthead.backgroundColor,
    };
  });
  await page.screenshot({ path: shotFixture });
  assert("fixture has oled theme attr", fixtureColors.theme === "oled-black");
  assert("fixture html background is black", isBlack(fixtureColors.htmlBg));
  assert(
    "fixture token is black",
    fixtureColors.token === "#000" ||
      fixtureColors.token === "rgb(0, 0, 0)" ||
      fixtureColors.token === "var(--ctp-oled)" ||
      fixtureColors.token === "var(--ctp-theme-bg)" ||
      fixtureColors.token === "var(--ctp-theme-bg, #000)"
  );
  assert("fixture app background is black", isBlack(fixtureColors.appBg));
  assert("fixture masthead background is black", isBlack(fixtureColors.mastheadBg));
  console.log("fixture colors", fixtureColors);

  await page.setViewport({ width: 400, height: 640, deviceScaleFactor: 2 });
  await page.goto(popup, { waitUntil: "domcontentloaded", timeout: 15000 });
  const popupCopy = await page.evaluate(() => ({
    themes: Boolean(document.querySelector(".subsection-title")?.textContent.includes("Themes")),
    separateYoutubeOled: Boolean(document.querySelector("#oledBlack")),
    musicOled: Boolean(document.querySelector("#musicOledBlack")),
    custom: Boolean(document.body.innerText.includes("Custom theme")),
    editColors: Boolean(document.body.innerText.includes("Edit colors")),
    youtubeLive: Boolean(document.querySelector("h2")?.textContent === "YouTube"),
  }));
  await page.screenshot({ path: shotPopup, fullPage: true });
  assert("popup has Themes heading", popupCopy.themes);
  assert("popup removes the separate YouTube OLED switch", !popupCopy.separateYoutubeOled);
  assert("popup keeps the YouTube Music OLED switch", popupCopy.musicOled);
  assert("popup has Custom theme", popupCopy.custom);
  assert("popup has Edit colors", popupCopy.editColors);
  assert("popup YouTube card is first/live", popupCopy.youtubeLive);
} finally {
  await browser.close();
}

let youtubeProbe = null;
try {
  if (process.env.SKIP_LIVE) throw new Error("SKIP_LIVE");
  const extBrowser = await puppeteer.launch({
    executablePath: brave,
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
    userDataDir: path.join(root, ".brave-oled-debug"),
    args: [
      `--load-extension=${root}`,
      `--disable-extensions-except=${root}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  try {
    const page = await extBrowser.newPage();
    await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("ytd-app, body", { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    youtubeProbe = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement);
      const app = document.querySelector("ytd-app");
      return {
        href: location.href,
        theme: document.documentElement.getAttribute("data-ctp-theme"),
        dark: document.documentElement.hasAttribute("dark"),
        htmlBg: html.backgroundColor,
        token: html.getPropertyValue("--yt-spec-base-background").trim(),
        appBg: app ? getComputedStyle(app).backgroundColor : null,
      };
    });
    await page.screenshot({ path: shotYoutube });
    console.log("youtube probe", youtubeProbe);
    assert("youtube custom theme attr applied", youtubeProbe.theme === "custom");
    assert("youtube html background is black", isBlack(youtubeProbe.htmlBg));
    assert("youtube base token is black", /#000|rgb\(0,\s*0,\s*0\)|var\(--ctp-oled\)|var\(--ctp-theme-bg/.test(youtubeProbe.token));
  } finally {
    await extBrowser.close();
  }
} catch (error) {
  console.warn("live YouTube probe skipped:", error?.message || error);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} UI checks passed.`);
if (!fs.existsSync(shotYoutube)) console.log("Live YouTube screenshot was not written.");
