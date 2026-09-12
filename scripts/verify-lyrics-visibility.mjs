import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brave =
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
const css = fs.readFileSync(path.join(root, "src/content/ytm.css"), "utf8");

const html = `<!doctype html>
<html>
  <head>
    <style>${css}</style>
    <style>
      html, body { margin: 0; background: #111; color: #fff; }
      #tab-renderer { width: 420px; height: 100vh; margin-left: auto; overflow: auto; }
      .native { padding: 24px; font-size: 22px; }
    </style>
  </head>
  <body>
    <ytmusic-tab-renderer id="tab-renderer" class="ctp-lyrics-visible">
      <div id="ctp-lyrics-root" class="ctp-lyrics">
        <div class="ctp-status-title">Follow-along lyrics</div>
      </div>
      <div class="native" id="native-pane">Up next queue should be visible on other tabs</div>
    </ytmusic-tab-renderer>
  </body>
</html>`;

const file = path.join(root, "scripts", "verify-lyrics-visibility.html");
fs.writeFileSync(file, html);

const browser = await puppeteer.launch({
  executablePath: brave,
  headless: true,
  args: ["--allow-file-access-from-files"],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700 });
await page.goto("file:///" + file.replace(/\\/g, "/"), {
  waitUntil: "domcontentloaded",
});

async function styles() {
  return page.evaluate(() => {
    const root = document.getElementById("ctp-lyrics-root");
    const native = document.getElementById("native-pane");
    const host = document.getElementById("tab-renderer");
    const cs = (el) => getComputedStyle(el);
    return {
      hostClass: host.className,
      rootHidden: root.hidden,
      rootDisplay: cs(root).display,
      nativeDisplay: cs(native).display,
    };
  });
}

const lyricsTab = await styles();

await page.evaluate(() => {
  const host = document.getElementById("tab-renderer");
  const root = document.getElementById("ctp-lyrics-root");
  host.classList.remove("ctp-lyrics-visible");
  root.hidden = true;
});

const otherTab = await styles();

await page.screenshot({
  path: path.join(root, "scripts", "verify-lyrics-other-tab.png"),
});

await page.evaluate(() => {
  const host = document.getElementById("tab-renderer");
  const root = document.getElementById("ctp-lyrics-root");
  host.classList.add("ctp-lyrics-visible");
  root.hidden = false;
});

const backToLyrics = await styles();

await browser.close();

const checks = [
  ["lyrics tab shows overlay", lyricsTab.rootDisplay !== "none"],
  ["lyrics tab hides native pane", lyricsTab.nativeDisplay === "none"],
  ["other tab hides overlay", otherTab.rootDisplay === "none"],
  ["other tab shows native pane", otherTab.nativeDisplay !== "none"],
  ["returning to lyrics shows overlay", backToLyrics.rootDisplay !== "none"],
  ["returning to lyrics hides native pane", backToLyrics.nativeDisplay === "none"],
];

for (const [name, ok] of checks) {
  console.log(ok ? "ok  " : "FAIL", name);
}

console.log(JSON.stringify({ lyricsTab, otherTab, backToLyrics }, null, 2));

if (checks.some(([, ok]) => !ok)) {
  process.exit(1);
}
