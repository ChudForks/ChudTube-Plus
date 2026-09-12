import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "scripts", "inspect-ytm-player.json");

const browser = await puppeteer.connect({
  browserURL: "http://127.0.0.1:9223",
  defaultViewport: null,
});
const pages = await browser.pages();
const page = pages.find((p) => /music\.youtube\.com/.test(p.url())) || pages[0];
if (!page) throw new Error("no page");

await page.evaluate(() => {
  const bar = document.querySelector("ytmusic-player-bar");
  bar?.click();
  document.querySelector("#layout")?.setAttribute("player-ui-state", "PLAYER_PAGE_OPEN");
  document.querySelector("ytmusic-app-layout")?.setAttribute("player-page-open", "");
});

await new Promise((r) => setTimeout(r, 2000));

const shot = path.join(root, "scripts", "inspect-ytm-player.png");
await page.screenshot({ path: shot });

const probe = await page.evaluate(() => {
  const dump = (el) => {
    if (!el) return null;
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      className: String(el.className?.baseVal || el.className || "").slice(0, 200),
      attrs: [...el.attributes].slice(0, 20).map((a) => [a.name, a.value.slice(0, 80)]),
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
      children: [...el.children].slice(0, 12).map((c) => ({
        tag: c.tagName.toLowerCase(),
        id: c.id,
        className: String(c.className?.baseVal || c.className || "").slice(0, 120),
        text: (c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      })),
    };
  };

  const all = [...document.querySelectorAll("*")];
  const interesting = all
    .filter((el) => {
      const name = el.tagName.toLowerCase();
      const label = (el.getAttribute("aria-label") || el.textContent || "").toLowerCase();
      return (
        name.includes("tab") ||
        name.includes("lyric") ||
        name.includes("player-page") ||
        label.includes("lyric") ||
        el.id === "side-panel" ||
        el.id === "tab-renderer" ||
        el.id === "player-page"
      );
    })
    .slice(0, 80)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id,
      aria: el.getAttribute("aria-label"),
      pageType: el.getAttribute("page-type"),
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
    }));

  return {
    href: location.href,
    layoutAttrs: dump(document.querySelector("ytmusic-app-layout")),
    playerPage: dump(document.querySelector("ytmusic-player-page")),
    sidePanel: dump(document.querySelector("#side-panel")),
    tabRenderer: dump(document.querySelector("#tab-renderer")),
    paperTabs: dump(document.querySelector("tp-yt-paper-tabs")),
    interesting,
    buttonsWithLyric: [...document.querySelectorAll("button, [role='button'], [aria-label]")]
      .filter((el) => /lyric/i.test(el.getAttribute("aria-label") || el.textContent || ""))
      .slice(0, 20)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        aria: el.getAttribute("aria-label"),
        text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      })),
    ticker: document.getElementById("ctp-player-ticker")?.textContent || null,
    rootHidden: document.getElementById("ctp-lyrics-root")?.hidden ?? null,
  };
});

fs.writeFileSync(out, JSON.stringify(probe, null, 2));
console.log(JSON.stringify(probe, null, 2));
browser.disconnect();
