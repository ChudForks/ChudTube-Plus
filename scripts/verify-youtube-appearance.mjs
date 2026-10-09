import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";

const projectRoot = path.resolve(".");
const fixture = pathToFileURL(path.join(projectRoot, "scripts/oled-preview.html")).href;
const browser = await puppeteer.launch({
  browser: process.env.BROWSER_TYPE || "chrome",
  executablePath: process.env.BROWSER_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
  args: ["--allow-file-access-from-files"],
  extraPrefsFirefox: { "security.fileuri.strict_origin_policy": false },
});

try {
  for (const variant of ["", "firefox"]) {
    const baseUrl = pathToFileURL(path.join(projectRoot, variant) + path.sep).href;
    for (const nativeAttributes of [{}, { dark: "", "darker-dark-theme": "" }, { dark: "native" }]) {
      for (const firstBackground of ["#f9f9f9", "#112233"]) {
        const page = await browser.newPage();
        try {
          await page.goto(fixture);
          await page.setContent("<html><head></head><body><ytd-app></ytd-app></body></html>");
          await page.evaluate((baseUrl, nativeAttributes, background) => {
            const root = document.documentElement;
            for (const name of ["dark", "darker-dark-theme"]) root.removeAttribute(name);
            for (const [name, value] of Object.entries(nativeAttributes)) root.setAttribute(name, value);
            window.settings = { youtube: { theme: "custom", customTheme: { background } } };
            window.listeners = [];
            window.chrome = {
              runtime: { getURL: name => baseUrl + name, sendMessage: async () => ({ segments: [] }) },
              storage: {
                sync: { get: async (_key, callback) => {
                  const result = { settings: window.settings };
                  if (callback) setTimeout(() => callback(result), 0);
                  return result;
                } },
                onChanged: { addListener: fn => window.listeners.push(fn), removeListener() {} },
              },
            };
            window.updateYoutube = youtube => {
              window.settings = { youtube };
              for (const fn of window.listeners) fn({ settings: { newValue: window.settings } }, "sync");
            };
          }, baseUrl, nativeAttributes, firstBackground);
          await page.addScriptTag({ path: path.join(projectRoot, variant, "src/content/yt-boot.js") });
          await page.waitForFunction(() => window.listeners.length > 0 && document.body.style.getPropertyValue("color-scheme"));
          for (const backgrounds of [["#ffffff"], ["#000000", "#ffffff", "#112233"], ["#eeeeee", "#000000"]]) {
            for (const background of backgrounds) {
              await page.evaluate(background => window.updateYoutube({ theme: "custom", customTheme: { background } }), background);
            }
            await page.evaluate(() => window.updateYoutube({ theme: "default" }));
            const restored = await page.evaluate(() => ({
              theme: document.documentElement.getAttribute("data-ctp-theme"),
              attributes: Object.fromEntries(["dark", "darker-dark-theme"]
                .filter(name => document.documentElement.hasAttribute(name))
                .map(name => [name, document.documentElement.getAttribute(name)])),
            }));
            assert.equal(restored.theme, null);
            assert.deepEqual(restored.attributes, nativeAttributes, `${variant || "Chromium"}: restore native attributes after ${backgrounds}`);
          }
          // A later themed session must follow changes made while Default is active.
          const nextNativeAttributes = Object.hasOwn(nativeAttributes, "dark") ? {} : { dark: "new-native" };
          await page.evaluate(attributes => {
            for (const name of ["dark", "darker-dark-theme"]) document.documentElement.removeAttribute(name);
            for (const [name, value] of Object.entries(attributes)) document.documentElement.setAttribute(name, value);
            window.updateYoutube({ theme: "custom", customTheme: { background: "#ffffff" } });
            window.updateYoutube({ theme: "default" });
          }, nextNativeAttributes);
          assert.deepEqual(await page.evaluate(() => Object.fromEntries(["dark", "darker-dark-theme"]
            .filter(name => document.documentElement.hasAttribute(name))
            .map(name => [name, document.documentElement.getAttribute(name)]))), nextNativeAttributes);
          await page.evaluate(async () => {
            window.updateYoutube({ theme: "custom", customTheme: { background: "#ffffff" } });
            document.dispatchEvent(new Event("yt-navigate-finish"));
            window.updateYoutube({ theme: "default" });
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          assert.equal(await page.$eval("html", root => root.style.getPropertyValue("background")), "",
            "a queued remap must not repaint a disabled theme");
        } finally {
          await page.close();
        }
      }
    }
    console.log(`PASS: ${variant || "Chromium"} restores native light/dark attributes and values after startup and repeated palette/default changes.`);
  }
} finally {
  await browser.close();
}
