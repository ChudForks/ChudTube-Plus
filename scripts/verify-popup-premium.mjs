import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const browser = await puppeteer.launch({executablePath:'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless:true, args:['--allow-file-access-from-files']});
try {
  const page = await browser.newPage();
  await page.setViewport({width:388,height:560,deviceScaleFactor:2});
  await page.evaluateOnNewDocument(() => {
    window.saved = {sponsorBlock:{showSegmentColors:true},ytm:{followAlongLyrics:true,lyricsMotion:'reduced'},youtube:{theme:'oled-black',hideShorts:false,hidePlayables:false}};
    window.storageListeners = [];
    window.chrome = {
      storage:{
        sync:{
          get:async()=>({settings:window.saved}),
          set:async({settings})=>{
            const oldValue=window.saved;
            window.saved=settings;
            for(const listener of window.storageListeners) listener({settings:{oldValue,newValue:settings}},'sync');
          }
        },
        onChanged:{
          addListener:(listener)=>window.storageListeners.push(listener),
          removeListener:(listener)=>{window.storageListeners=window.storageListeners.filter(item=>item!==listener);}
        }
      },
      runtime:{sendMessage:(message)=>{window.lastMessage=message;}}
    };
  });
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto(new URL('../src/popup/popup.html',import.meta.url).href);
  await page.waitForFunction(()=>document.querySelector('#customTheme').checked);
  await page.waitForSelector('input[name="sponsorBlock-sponsor"][value="off"]');
  assert.equal(await page.$('#oledBlack'),null);
  assert.equal(await page.$eval('#followAlongLyrics',e=>e.checked),true);
  assert.equal(await page.$eval('#lyricsTheme',e=>e.value),'classic');
  assert.equal(await page.$eval('#lyricsSource',e=>e.value),'auto');
  assert.equal(await page.$('#lyricsMotion'),null);
  await page.select('#lyricsTheme','oled-bounce');
  await page.waitForFunction(()=>window.saved.ytm.lyricsTheme==='oled-bounce');
  await page.select('#lyricsSource','youtube');
  await page.waitForFunction(()=>window.saved.ytm.lyricsSource==='youtube');
  assert.match(await page.$eval('#lyrics-source-help',e=>e.textContent),/no LRCLIB lookup/);
  assert.equal(await page.evaluate(()=>window.saved.ytm.lyricsTheme),'oled-bounce');
  assert.equal(await page.evaluate(()=>Object.hasOwn(window.saved.ytm,'lyricsMotion')),false);
  assert.equal(await page.$eval('input[name="sponsorBlock-sponsor"][value="button"]',e=>e.checked),true);
  await page.click('#customTheme');
  await page.waitForFunction(()=>window.saved.youtube.theme==='default');
  assert.equal(await page.$eval('#followAlongLyrics',e=>e.checked),true);
  await page.click('#customTheme');
  await page.waitForFunction(()=>window.saved.youtube.theme==='custom');
  await page.click('#editCustomTheme');
  assert.equal(await page.evaluate(()=>window.lastMessage?.type),'CTP_OPEN_THEME_EDITOR');
  await page.evaluate(()=>{
    const next={...window.saved,youtube:{...window.saved.youtube,theme:'default',hideShorts:true}};
    window.saved=next;
    for(const listener of window.storageListeners) listener({settings:{newValue:next}},'sync');
  });
  await page.waitForFunction(()=>!document.querySelector('#customTheme').checked && document.querySelector('#hideShorts').checked);
  await page.click('#hideShorts');
  await page.waitForFunction(()=>window.saved.youtube.hideShorts===false);
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
  await page.focus('#followAlongLyrics');
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.saved.ytm.followAlongLyrics===false);
  assert.equal(await page.$eval('#lyricsTheme',e=>e.disabled),true);
  assert.equal(await page.$eval('#lyricsSource',e=>e.disabled),true);
  await page.keyboard.press('Space');
  await page.waitForFunction(()=>window.saved.ytm.followAlongLyrics===true);
  assert.equal(await page.$eval('#lyricsTheme',e=>e.disabled),false);
  assert.equal(await page.$eval('#lyricsSource',e=>e.disabled),false);
  assert.equal(await page.evaluate(()=>window.saved.ytm.lyricsSource),'youtube');
  assert.equal(await page.evaluate(()=>window.saved.ytm.lyricsTheme),'oled-bounce');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=388),true);
  assert.equal(await page.$eval('.logo',e=>e.complete && e.naturalWidth===128),true);
  assert.deepEqual(errors,[]);
  await page.$eval('#followAlongLyrics',e=>e.blur());
  const height=await page.evaluate(()=>document.body.scrollHeight);
  await page.setViewport({width:388,height,deviceScaleFactor:2});
  await page.screenshot({path:'scripts/popup-premium.png'});
} finally { await browser.close(); }
console.log('PASS: initial settings, lyrics theme/source defaults, click persistence, keyboard toggle, independent settings, content filters, SponsorBlock modes, icon load, layout, no JS errors.');
