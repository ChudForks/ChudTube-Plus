import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.BROWSER_PATH || "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.setContent(`<div id="ctp-lyrics-root" class="ctp-lyrics" data-theme="oled-bounce">
    <div class="ctp-list">
      <button class="ctp-line ctp-line-active" data-ctp-time="0"><span class="ctp-body"><span class="ctp-text"><span class="ctp-word">Previous lyric</span></span></span></button>
      <button class="ctp-line ctp-line-next" data-ctp-time="5"><span class="ctp-body"><span class="ctp-text"><span class="ctp-word">Next lyric</span></span></span></button>
    </div>
  </div>`);
  await page.addStyleTag({ content: await readFile(new URL("../src/content/ytm.css", import.meta.url), "utf8") });
  const samples = await page.evaluate(async () => {
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const [previous, next] = document.querySelectorAll(".ctp-line");
    const text = previous.querySelector(".ctp-text");
    const sample = () => ({
      scale: new DOMMatrixReadOnly(getComputedStyle(text).transform).a,
      alpha: Number(getComputedStyle(text).color.match(/[\d.]+/g)[3] ?? 1),
    });
    await wait(850);
    const before = sample();
    previous.classList.remove("ctp-line-active");
    previous.classList.add("ctp-line-past");
    next.classList.replace("ctp-line-next", "ctp-line-active");
    const first = sample();
    const fade = [first];
    for (let i = 0; i < 35; i++) {
      await frame();
      fade.push(sample());
    }
    await wait(600);
    return { before, first, fade, after: sample() };
  });
  console.log(JSON.stringify({ before: samples.before, first: samples.first, after: samples.after }));
  assert.ok(Math.abs(samples.before.scale - samples.first.scale) < 0.002,
    "The outgoing lyric must not snap smaller when its bounce animation is removed");
  assert.ok(samples.first.alpha <= 0.23,
    "The previous lyric must already be dim when follow scrolling starts, rather than linger bright");
  assert.ok(samples.fade.some(s => s.scale > 0.981 && s.scale < 0.999),
    "The outgoing lyric should shrink smoothly toward its inactive size");
  for (let i = 1; i < samples.fade.length; i++) {
    assert.ok(samples.fade[i].alpha <= samples.fade[i - 1].alpha + 0.001,
      "The outgoing lyric must fade without brightening again");
  }
  assert.ok(Math.abs(samples.after.scale - 0.98) < 0.002);
  assert.ok(Math.abs(samples.after.alpha - 0.22) < 0.01);
  const previousBox = await page.$eval(".ctp-line-past", el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(previousBox.x, previousBox.y);
  await new Promise(resolve => setTimeout(resolve, 450));
  const hoveredAlpha = await page.$eval(".ctp-line-past .ctp-text", el =>
    Number(getComputedStyle(el).color.match(/[\d.]+/g)[3] ?? 1));
  assert.ok(hoveredAlpha <= 0.23,
    "A stationary pointer over the outgoing lyric must not brighten it again");
  console.log("PASS: outgoing lyrics dim immediately, keep a smooth size transition, and stay dim under the pointer.");
} finally {
  await browser.close();
}
