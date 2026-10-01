import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const css = await readFile('src/content/yt.css', 'utf8');
const theme = (await readFile('src/lib/theme.js', 'utf8')).replace(/^export /gm, '');
const controller = (await readFile('src/content/yt.js', 'utf8')).replace(/^import[\s\S]*?;\s*/gm, '');
for (const file of ['content/yt.css', 'content/yt.js', 'lib/theme.js']) {
  assert.equal(await readFile(`src/${file}`, 'utf8'), await readFile(`firefox/src/${file}`, 'utf8'));
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
const red = { background: '#000000', surface: '#181818', text: '#ff0000', muted: '#aabbcc', accent: '#5900ff', hover: '#272727', outline: '#333333' };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(`<style>
    html { --t0123456789abcdef: #0f0f0f; --t123456789abcdef0: #606060; --t23456789abcdef01: #717171; }
    html[dark] { --t0123456789abcdef: #f1f1f1; --t123456789abcdef0: #aaa; --t23456789abcdef01: #909090; }
    #generated { color: var(--t0123456789abcdef); }
    #metadata { color: var(--t123456789abcdef0); }
    #legacy { color: var(--yt-spec-text-primary, #f1f1f1); }
    #modern { color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); }
    #disabled { color: var(--yt-sys-color-baseline--text-disabled, #717171); }
    #inverse { color: var(--yt-sys-color-baseline--text-primary-inverse, #0f0f0f); }
    #link { color: var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
    #icon { color: var(--t0123456789abcdef); fill: currentColor; }
    .overlay { color: #fff; }
  </style><ytd-app>
    <h1 id="generated">Video title</h1><p id="metadata">Channel · views</p>
    <button id="modern">Modern button</button><button id="legacy">Legacy button</button>
    <span id="disabled">Disabled</span><span id="inverse">Selected chip text</span><a id="link">Link</a>
    <svg id="icon"><path d="M0 0h10v10H0z"/></svg><span class="overlay">Player overlay</span>
    <ytd-topbar-logo-renderer><div id="logo-icon"><svg><g><path id="brand"/><path id="glyph"/></g><g id="youtube-paths_yt999"><path id="wordmark"/></g></svg></div></ytd-topbar-logo-renderer>
  </ytd-app>`);
  await install(page);
  for (const palette of [red, { ...red, background: '#f9f9f9', text: '#0f0f0f', muted: '#606060' }, { ...red, background: '#112233', text: '#181818' }, { ...red, accent: '#ffff00' }]) {
    await apply(page, palette);
    const colors = await readColors(page);
    for (const key of ['generated', 'legacy', 'modern', 'icon', 'wordmark']) assert.equal(colors[key], rgb(palette.text), key);
    assert.equal(colors.glyph, palette.accent === '#ffff00' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)');
    for (const key of ['metadata', 'disabled']) assert.equal(colors[key], rgb(palette.muted), key);
    assert.equal(colors.inverse, rgb(palette.background));
    assert.equal(colors.link, rgb(palette.accent));
    assert.equal(colors.brand, rgb(palette.accent));
    assert.equal(colors.overlay, 'rgb(255, 255, 255)');
  }
  await page.evaluate(() => window.__ctpApplyYoutubeSettings({ theme: 'default' }));
  assert.equal((await readColors(page)).generated, 'rgb(15, 15, 15)');
  await apply(page, red);
  assert.equal((await readColors(page)).generated, rgb(red.text));
  assert.deepEqual(errors, []);
  console.log('PASS: generated/legacy/system text, metadata, buttons, icons, logo, light/dark palette updates, and disable/re-enable.');

  if (process.argv.includes('--live')) {
    const live = await browser.newPage();
    await live.setBypassCSP(true);
    await live.goto('https://www.youtube.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await live.waitForSelector('.ytSearchboxComponentInput');
    await live.waitForSelector('[id^="youtube-paths"] path');
    await install(live);
    for (const palette of [red, { ...red, background: '#f9f9f9', text: '#0f0f0f' }]) {
      await apply(live, palette);
      const actual = await live.evaluate(() => {
        const color = selector => getComputedStyle(document.querySelector(selector)).color;
        const fill = selector => getComputedStyle(document.querySelector(selector)).fill;
        return { search: color('.ytSearchboxComponentInput'), icon: color('yt-icon'), title: color('h1'), wordmark: fill('[id^="youtube-paths"] path'), glyph: fill('ytd-topbar-logo-renderer #logo-icon svg > g:first-child > path:nth-child(2)') };
      });
      for (const [key, value] of Object.entries(actual)) assert.equal(value, key === 'glyph' ? 'rgb(255, 255, 255)' : rgb(palette.text), `live ${key}`);
    }
    console.log('PASS: live YouTube search, masthead icon, title, and generated logo wordmark with dark and light themes.');
  }
} finally { await browser.close(); }

function rgb(hex) { return `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`; }
async function install(page) {
  await page.evaluate(css => {
    window.__testSettings = { youtube: { theme: 'default' } };
    window.chrome = { runtime: { getURL: () => `data:text/css;base64,${btoa(css)}` } };
  }, css);
  await page.addScriptTag({ content: `const getSettings = async () => window.__testSettings; const onSettingsChanged = () => {};\n${theme}\n${controller}` });
  await page.waitForFunction(() => typeof window.__ctpApplyYoutubeSettings === 'function');
}
async function apply(page, palette) {
  await page.evaluate(customTheme => {
    window.__testSettings = { youtube: { theme: 'custom', customTheme } };
    window.__ctpApplyYoutubeSettings(window.__testSettings.youtube);
  }, palette);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function readColors(page) {
  return page.evaluate(() => Object.fromEntries(
    ['generated', 'metadata', 'legacy', 'modern', 'disabled', 'inverse', 'link', 'icon', 'brand', 'glyph', 'wordmark', 'overlay'].map(key => {
      const el = document.querySelector(key === 'overlay' ? '.overlay' : `#${key}`);
      return [key, getComputedStyle(el)[['brand', 'glyph', 'wordmark'].includes(key) ? 'fill' : 'color']];
    })
  ));
}
