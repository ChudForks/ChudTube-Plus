import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const fixture = "file:///" + path.join(root, "scripts", "thumbnail-progress-preview.html").replace(/\\/g, "/");
const shot = path.join(root, "scripts", "thumbnail-progress-preview.png");
const cssPath = path.join(root, "src", "content", "yt.css");
const firefoxCssPath = path.join(root, "firefox", "src", "content", "yt.css");

const css = await readFile(cssPath, "utf8");
const firefoxCss = await readFile(firefoxCssPath, "utf8");
assert.match(css, /WatchedProgressBarSegment/);
assert.match(css, /ytd-thumbnail-overlay-resume-playback-renderer #progress/);
assert.match(css, /--ctp-theme-accent/);
assert.equal(css, firefoxCss);

const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 360, deviceScaleFactor: 1 });
  await page.goto(fixture, { waitUntil: "load", timeout: 15000 });
  const colors = await page.evaluate(() => {
    const read = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      polymer: read("#progress"),
      viewModel: read(".ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment"),
      watch: read(".ytwThumbnailOverlayResumePlaybackRendererThumbnailOverlayResumePlaybackProgress"),
      accent: getComputedStyle(document.documentElement).getPropertyValue("--ctp-theme-accent").trim(),
    };
  });
  assert.equal(colors.accent, "#38bdf8");
  assert.equal(colors.polymer, "rgb(56, 189, 248)");
  assert.equal(colors.viewModel, "rgb(56, 189, 248)");
  assert.equal(colors.watch, "rgb(56, 189, 248)");
  await page.hover('#hover-preview');
  const playedSelectors = [
    '.ytProgressBarLineProgressBarPlayed',
    '.ytProgressBarPlayheadProgressBarPlayheadDot',
    '.ytChapteredProgressBarChapteredPlayerBarChapterSeen',
    '.ytChapteredProgressBarChapteredPlayerBarFill',
    '.ytFocusedChapterProgressBarLineProgressBarPlayed',
    '.ytp-play-progress',
  ];
  for (const accent of ['#38bdf8', '#5900ff']) {
    await page.evaluate(accent => document.documentElement.style.setProperty('--ctp-custom-accent', accent), accent);
    const expected = accent === '#38bdf8' ? 'rgb(56, 189, 248)' : 'rgb(89, 0, 255)';
    for (const selector of playedSelectors) {
      const style = await page.$eval(selector, el => ({ color: getComputedStyle(el).backgroundColor, image: getComputedStyle(el).backgroundImage }));
      assert.equal(style.color, expected, selector);
      assert.equal(style.image, 'none', selector);
    }
    assert.equal(await page.$eval('.ytProgressBarLineProgressBarLoaded', el => getComputedStyle(el).backgroundColor), 'rgba(255, 255, 255, 0.6)');
  }
  await page.screenshot({ path: shot });
  await page.evaluate(() => document.documentElement.removeAttribute('data-ctp-theme'));
  assert.match(await page.$eval('.ytProgressBarLineProgressBarPlayed', el => getComputedStyle(el).backgroundImage), /rgb\(255, 0, 51\)/);
} finally {
  await browser.close();
}

console.log("PASS: theme accent applies to resume bars and dynamically inserted hover-player progress, chapters, and playhead; palette updates and disabling work; buffer color is preserved.");
