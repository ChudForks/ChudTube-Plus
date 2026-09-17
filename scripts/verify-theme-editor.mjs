import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { DEFAULT_CUSTOM_THEME } from "../src/lib/settings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const editor = "file:///" + path.join(root, "src", "theme-editor", "editor.html").replace(/\\/g, "/");
const shot = path.join(root, "scripts", "theme-editor-preview.png");

const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluateOnNewDocument((defaults) => {
    window.saved = {
      sponsorBlock: { showSegmentColors: true },
      ytm: { followAlongLyrics: true, theme: "oled-black" },
      youtube: { theme: "default", hideShorts: false, hidePlayables: false, customTheme: defaults },
    };
    window.chrome = {
      storage: {
        sync: {
          get: async () => ({ settings: window.saved }),
          set: async ({ settings }) => {
            window.saved = settings;
          },
        },
        onChanged: { addListener() {}, removeListener() {} },
      },
    };
  }, DEFAULT_CUSTOM_THEME);
  await page.goto(editor, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#color-background");
  assert.equal(await page.$eval("#color-background", (input) => input.value), DEFAULT_CUSTOM_THEME.background);
  assert.equal(await page.$eval("#preview", (el) => el.dataset.view), "home");
  assert.equal(await page.$eval('[data-preset="custom"]', (button) => button.classList.contains("is-active")), true);
  assert.equal(await page.$('[data-preset="cream"]'), null);

  await page.$eval("#color-background", (input) => {
    input.value = "#112233";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const preview = document.getElementById("preview");
    return getComputedStyle(preview).getPropertyValue("--ctp-theme-bg").trim() === "#112233";
  });
  assert.equal(await page.evaluate(() => window.saved.youtube.customTheme.background), DEFAULT_CUSTOM_THEME.background);
  assert.equal(await page.$eval("#saveCustom", (button) => button.disabled), false);
  await page.click("#saveCustom");
  await page.waitForFunction(() => window.saved.youtube.customTheme.background === "#112233");
  assert.equal(await page.$eval('[data-preset="custom"]', (button) => button.classList.contains("is-active")), true);
  assert.equal(await page.$eval("#useOnYoutube", (input) => input.checked), false);

  await page.click('input[name="previewView"][value="watch"]');
  await page.waitForFunction(() => document.getElementById("preview").dataset.view === "watch");
  const watchVisible = await page.evaluate(() => {
    const watch = document.querySelector(".yt-watch");
    return Boolean(watch) && getComputedStyle(watch).display !== "none";
  });
  assert.equal(watchVisible, true);

  await page.click("#useOnYoutube");
  await page.waitForFunction(() => window.saved.youtube.theme === "custom");

  await page.click('[data-preset="slate"]');
  const slatePreview = await page.$eval("#preview", (el) => ({
    bg: getComputedStyle(el).getPropertyValue("--ctp-theme-bg").trim(),
    text: getComputedStyle(el).getPropertyValue("--ctp-theme-text").trim(),
    accent: getComputedStyle(el).getPropertyValue("--ctp-theme-accent").trim(),
  }));
  assert.equal(slatePreview.bg, "#0f172a");
  assert.equal(slatePreview.text, "#f8fafc");
  assert.equal(slatePreview.accent, "#38bdf8");
  assert.equal(await page.evaluate(() => window.saved.youtube.customTheme.background), "#112233");

  await page.$eval("#color-accent", (input) => {
    input.value = "#abcdef";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#saveCustom");
  await page.waitForFunction(() => window.saved.youtube.customTheme.accent === "#abcdef");
  assert.equal(await page.evaluate(() => window.saved.youtube.customTheme.background), "#0f172a");
  assert.equal(await page.$eval('[data-preset="custom"]', (button) => button.classList.contains("is-active")), true);
  await page.screenshot({ path: shot });

  await page.$eval("#color-text", (input) => {
    input.value = "#0f172a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const hint = document.getElementById("contrastHint");
    return Boolean(hint) && !hint.hidden;
  });

  await page.click("#resetColors");
  assert.equal(await page.evaluate(() => window.saved.youtube.customTheme.background), "#0f172a");
  await page.click("#saveCustom");
  await page.waitForFunction((background) => window.saved.youtube.customTheme.background === background, {}, DEFAULT_CUSTOM_THEME.background);
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

console.log("PASS: theme editor live preview, presets, persistence, contrast hint, reset.");
