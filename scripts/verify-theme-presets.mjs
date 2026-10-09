import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const custom = {
  background: "#112233", surface: "#223344", text: "#ddeeff", muted: "#aabbcc",
  accent: "#ffaa33", hover: "#334455", outline: "#445566",
};
const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
  args: ["--allow-file-access-from-files"],
});

try {
  for (const variant of ["", "firefox/"]) {
    const { mergeSettings } = await import(new URL(`../${variant}src/lib/settings.js`, import.meta.url));
    const { CUSTOM_THEME_PRESETS, youtubeThemePalette } = await import(new URL(`../${variant}src/lib/theme.js`, import.meta.url));
    // Upgrade existing users without inferring a preset from, or changing, their colors.
    const legacy = mergeSettings({ youtube: { theme: "custom", customTheme: custom } });
    assert.equal(legacy.youtube.themePreset, "custom");
    assert.deepEqual(legacy.youtube.customTheme, custom);
    const invalid = mergeSettings({ youtube: { themePreset: "missing", customTheme: custom } });
    assert.equal(invalid.youtube.themePreset, "custom");
    assert.deepEqual(youtubeThemePalette(invalid.youtube), custom);
    for (const preset of CUSTOM_THEME_PRESETS) {
      const next = mergeSettings({ youtube: { themePreset: preset.id, customTheme: custom } });
      assert.deepEqual(next.youtube.customTheme, custom);
      assert.deepEqual(youtubeThemePalette(next.youtube), preset.colors || custom);
    }

    let saved = mergeSettings({ youtube: { theme: "default", customTheme: custom, hideShorts: true } });
    const pages = [];
    const errors = [];
    const baseUrl = pathToFileURL(path.join(root, variant) + path.sep).href;
    async function newPage() {
      const page = await browser.newPage();
      page.setDefaultTimeout(10000);
      pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.exposeFunction("ctpRead", () => structuredClone(saved));
      await page.exposeFunction("ctpWrite", async (next) => {
        saved = structuredClone(next);
        for (const target of pages.filter((item) => !item.isClosed())) {
          await target.evaluate((newValue) => {
            for (const listener of window.storageListeners || []) {
              listener({ settings: { newValue } }, "sync");
            }
          }, saved);
        }
      });
      await page.evaluateOnNewDocument((baseUrl) => {
        window.storageListeners = [];
        window.chrome = {
          runtime: { getURL: (name) => baseUrl + name, sendMessage: async () => ({ segments: [] }) },
          storage: {
            sync: {
              get: async (_key, callback) => {
                const result = { settings: await window.ctpRead() };
                if (callback) callback(result);
                return result;
              },
              set: async ({ settings }) => window.ctpWrite(settings),
            },
            onChanged: {
              addListener: (listener) => window.storageListeners.push(listener),
              removeListener: (listener) => { window.storageListeners = window.storageListeners.filter((item) => item !== listener); },
            },
          },
        };
      }, baseUrl);
      return page;
    }
    async function waitTheme(page, background) {
      await page.waitForFunction((background) => {
        return getComputedStyle(document.body).backgroundColor === background;
      }, { polling: 50 }, background);
    }
    async function editColor(page, id, value) {
      await page.$eval(`#color-${id}`, (input, value) => {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    }
    async function click(page, selector) {
      await page.bringToFront();
      await page.click(selector);
    }

    try {
      const editor = await newPage();
      await editor.setViewport({ width: 1100, height: 800 });
      await editor.goto(baseUrl + "src/theme-editor/editor.html");
      await editor.waitForFunction(() => document.querySelector("#color-background")?.value === "#112233", { polling: 50 });
      assert.equal(await editor.$eval('[data-preset="custom"]', (el) => el.getAttribute("aria-pressed")), "true");
      await click(editor, '[data-preset="slate"]');
      assert.equal(saved.youtube.theme, "default", "choosing a preset only previews it");
      assert.equal(saved.youtube.themePreset, "custom");
      assert.deepEqual(saved.youtube.customTheme, custom);
      assert.equal(await editor.$eval("#applyPreset", (el) => el.disabled), false);
      await click(editor, "#applyPreset");
      await editor.waitForFunction(() => document.querySelector("#applyPreset").disabled && document.querySelector("#useOnYoutube").checked, { polling: 50 });
      assert.equal(saved.youtube.theme, "custom", "Apply enables the selected preset");
      assert.equal(saved.youtube.themePreset, "slate");
      assert.deepEqual(saved.youtube.customTheme, custom, "Apply never saves over Custom");
      assert.equal(saved.youtube.hideShorts, true);
      await editor.reload();
      await editor.waitForFunction(() => document.querySelector('[data-preset="slate"]')?.getAttribute("aria-pressed") === "true", { polling: 50 });
      assert.equal(await editor.$eval("#color-background", (el) => el.value), "#0f172a", "editor reopens at the applied preset");
      assert.equal(await editor.$eval('[data-preset="custom"] .preset-bar i', (el) => el.style.backgroundColor), "rgb(17, 34, 51)");

      const youtube = await newPage();
      await youtube.goto(pathToFileURL(path.join(root, "scripts/oled-preview.html")).href);
      await youtube.setContent("<html><head></head><body><ytd-app></ytd-app></body></html>");
      await youtube.addScriptTag({ path: path.join(root, variant, "src/content/yt-boot.js") });
      await waitTheme(youtube, "rgb(15, 23, 42)");
      assert.equal(await youtube.$eval("html", (el) => el.style.getPropertyValue("--ctp-theme-accent")), "#38bdf8");

      const popup = await newPage();
      await popup.setViewport({ width: 388, height: 800 });
      await popup.goto(baseUrl + "src/popup/popup.html");
      await popup.waitForFunction(() => document.querySelector("#custom-theme-help").textContent.startsWith("Slate"), { polling: 50 });
      assert.equal(await popup.$eval("#customSwatches i", (el) => el.style.backgroundColor), "rgb(15, 23, 42)");
      await click(popup, "#customTheme");
      await youtube.waitForFunction(() => !document.documentElement.hasAttribute("data-ctp-theme"), { polling: 50 });
      assert.equal(saved.youtube.themePreset, "slate", "turning the theme off preserves the applied preset");
      await click(popup, "#customTheme");
      await waitTheme(youtube, "rgb(15, 23, 42)");
      assert.deepEqual(saved.youtube.customTheme, custom);

      // Apply each built-in preset live, then recover every original Custom color.
      for (const [id, background] of [["oled", "rgb(0, 0, 0)"], ["chudtube", "rgb(20, 15, 24)"], ["custom", "rgb(17, 34, 51)"]]) {
        await click(editor, `[data-preset="${id}"]`);
        await click(editor, "#applyPreset");
        await waitTheme(youtube, background);
        assert.equal(saved.youtube.themePreset, id);
        assert.deepEqual(saved.youtube.customTheme, custom);
        await popup.waitForFunction((id) => {
          const labels = { oled: "OLED", chudtube: "ChudTube", custom: "Custom" };
          return document.querySelector("#custom-theme-help").textContent.startsWith(labels[id]);
        }, { polling: 50 }, id);
      }

      await click(editor, '[data-preset="slate"]');
      await editColor(editor, "accent", "#abcdef");
      assert.equal(await editor.$eval("#applyPreset", (el) => el.disabled), true, "edited colors require an explicit Custom save");
      assert.deepEqual(saved.youtube.customTheme, custom);
      await click(editor, "#saveCustom");
      await editor.waitForFunction(() => document.querySelector("#saveCustom").disabled && document.querySelector('[data-preset="custom"]').getAttribute("aria-pressed") === "true", { polling: 50 });
      assert.equal(saved.youtube.themePreset, "custom");
      assert.equal(saved.youtube.customTheme.background, "#0f172a");
      assert.equal(saved.youtube.customTheme.accent, "#abcdef", "only Save to Custom replaces saved colors");
      await waitTheme(youtube, "rgb(15, 23, 42)");

      // Updating the applied preset elsewhere keeps a dirty editor draft intact.
      await editColor(editor, "background", "#556677");
      await popup.evaluate(async () => {
        const settings = await window.ctpRead();
        await chrome.storage.sync.set({ settings: { ...settings, youtube: { ...settings.youtube, themePreset: "oled" } } });
      });
      await waitTheme(youtube, "rgb(0, 0, 0)");
      assert.equal(await editor.$eval("#color-background", (el) => el.value), "#556677");
      assert.equal(await editor.$eval("#applyPreset", (el) => el.disabled), true);
      assert.equal(saved.youtube.customTheme.background, "#0f172a");
      await click(editor, '[data-preset="oled"]');
      assert.equal(await editor.$eval("#applyPreset", (el) => el.disabled), true, "already applied presets need no duplicate write");
      await click(editor, "#resetColors");
      assert.equal(saved.youtube.themePreset, "oled", "Reset colors only changes the preview");
      assert.equal(saved.youtube.customTheme.background, "#0f172a");
      await click(editor, "#applyPreset");
      await waitTheme(youtube, "rgb(20, 15, 24)");
      assert.equal(saved.youtube.customTheme.background, "#0f172a");
      assert.equal(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS: ${variant || "Chromium/"} preset application, preserved Custom, reload, live YouTube colors, popup toggles, explicit Custom save, drafts, and settings migration.`);
    } finally {
      for (const page of pages) await page.close();
    }
  }
} finally {
  await browser.close();
}
