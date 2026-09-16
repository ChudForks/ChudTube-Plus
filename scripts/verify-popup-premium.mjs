import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless:true, args:['--allow-file-access-from-files']});
try {
  const page = await browser.newPage();
  await page.setViewport({width:388,height:560,deviceScaleFactor:2});
  await page.evaluateOnNewDocument(() => {
    window.saved = {sponsorBlock:{showSegmentColors:true},ytm:{followAlongLyrics:true},youtube:{theme:'oled-black',hideShorts:false,hidePlayables:false}};
    window.chrome = {
      storage:{sync:{get:async()=>({settings:window.saved}),set:async({settings})=>{window.saved=settings;}}},
      runtime:{sendMessage:(message)=>{window.lastMessage=message;}}
    };
  });
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(new URL('../src/popup/popup.html',import.meta.url).href);
  await page.waitForFunction(()=>document.querySelector('#oledBlack').checked);
  await page.waitForSelector('input[name="sponsorBlock-sponsor"][value="off"]');
  assert.equal(await page.$eval('#followAlongLyrics',e=>e.checked),true);
  assert.equal(await page.$eval('input[name="sponsorBlock-sponsor"][value="off"]',e=>e.checked),true);
  await page.click('#oledBlack');
  await page.waitForFunction(()=>window.saved.youtube.theme==='default');
  assert.equal(await page.$eval('#followAlongLyrics',e=>e.checked),true);
  await page.click('#customTheme');
  await page.waitForFunction(()=>window.saved.youtube.theme==='custom');
  assert.equal(await page.$eval('#oledBlack',e=>e.checked),false);
  await page.click('#editCustomTheme');
  assert.equal(await page.evaluate(()=>window.lastMessage?.type),'CTP_OPEN_THEME_EDITOR');
  await page.click('#oledBlack');
  await page.waitForFunction(()=>window.saved.youtube.theme==='oled-black');
  assert.equal(await page.$eval('#customTheme',e=>e.checked),false);
  await page.click('#oledBlack');
  await page.waitForFunction(()=>window.saved.youtube.theme==='default');
  await page.click('#hideShorts');
  await page.waitForFunction(()=>window.saved.youtube.hideShorts===true);
  await page.click('#hidePlayables');
  await page.waitForFunction(()=>window.saved.youtube.hidePlayables===true);
  await page.$eval('input[name="sponsorBlock-sponsor"][value="auto"]', (input) => input.click());
  await page.waitForFunction(()=>window.saved.sponsorBlock.categories.sponsor==='auto');
  await page.$eval('input[name="sponsorBlock-intro"][value="button"]', (input) => input.click());
  await page.waitForFunction(()=>window.saved.sponsorBlock.categories.intro==='button');
  assert.equal(await page.$eval('input[name="sponsorBlock-intro"][value="off"]',e=>e.checked),false);
  assert.equal(await page.$eval('#sponsorBlockShowSegmentColors',e=>e.checked),true);
  await page.click('#sponsorBlockShowSegmentColors');
  await page.waitForFunction(()=>window.saved.sponsorBlock.showSegmentColors===false);
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
} finally { await browser.close(); }
console.log('PASS: initial settings, click persistence, keyboard toggle, independent settings, content filters, SponsorBlock modes, icon load, layout, no JS errors.');
