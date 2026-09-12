import puppeteer from "puppeteer-core";
import path from "node:path";

const brave = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const file = "file:///" + path.resolve("E:/Projects/ChudTube+/scripts/lyrics-preview.html").replace(/\\/g, "/");
const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
await page.goto(file, { waitUntil: "domcontentloaded", timeout: 30000 });
const el = await page.$("#tab-renderer");
await el.screenshot({ path: "E:/Projects/ChudTube+/scripts/lyrics-preview-panel.png" });
await browser.close();
console.log("wrote panel");
