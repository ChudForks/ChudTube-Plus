import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless:true, args:['--allow-file-access-from-files']});
try {
  const page = await browser.newPage();
  await page.setViewport({width:388,height:560,deviceScaleFactor:2});
  await page.evaluateOnNewDocument(() => {
    window.saved = {sponsorBlock:{autoSkip:false},ytm:{followAlongLyrics:true},youtube:{theme:'oled-black',hideShorts:false,hidePlayables:false}};
    window.chrome = {storage:{sync:{get:async()=>({settings:window.saved}),set:async({settings})=>{window.saved=settings;}}}};
  });
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(new URL('../src/popup/popup.html',import.meta.url).href);
  await page.waitForFunction(()=>document.querySelector('#oledBlack').checked);
  assert.equal(await page.$eval('#followAlongLyrics',e=>e.checked),true);
  await page.click('#oledBlack');
  await page.waitForFunction(()=>window.saved.youtube.theme==='default');
  assert.equal(await page.$eval('#followAlongLyrics',e=>e.checked),true);
  await page.click('#hideShorts');
  await page.waitForFunction(()=>window.saved.youtube.hideShorts===true);
  await page.click('#hidePlayables');
  await page.waitForFunction(()=>window.saved.youtube.hidePlayables===true);
  await page.click('#sponsorBlockAutoSkip');
  await page.waitForFunction(()=>window.saved.sponsorBlock.autoSkip===true);
  await page.click('#oledBlack');
  await page.focus('#followAlongLyrics');
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.saved.ytm.followAlongLyrics===false);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.saved.ytm.followAlongLyrics===true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=388),true);
  assert.equal(await page.$eval('.logo',e=>e.complete && e.naturalWidth===128),true);
  assert.deepEqual(errors,[]);
  await page.$eval('#followAlongLyrics',e=>e.blur());
  const height=await page.evaluate(()=>document.body.scrollHeight);
  await page.setViewport({width:388,height,deviceScaleFactor:2});
  await page.screenshot({path:'scripts/popup-premium.png'});
  console.log('PASS: initial settings, click persistence, keyboard toggle, independent settings, content filters, icon load, layout, no JS errors.');
} finally { await browser.close(); }
