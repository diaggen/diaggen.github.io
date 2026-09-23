// Optional browser checks: install Playwright, serve the repo, then run this file.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

execFileSync('python3', [path.join(__dirname, 'version-site-assets.py'), '--check'], { stdio: 'inherit' });

const baseURL = process.env.SITE_URL || 'http://127.0.0.1:8765';
const outputDir = process.env.SITE_QA_DIR || path.resolve(__dirname, '..', '.qa');
fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
  });
  const report = { checks: [], errors: [], screenshots: [] };
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(baseURL) && response.status() >= 400) {
      report.errors.push(`${response.status()} ${response.url()}`);
    }
  });
  async function check(name, run) {
    await run(); report.checks.push(name); console.log('PASS:', name);
  }
  async function center(selector) {
    await page.locator(selector).evaluate(element => {
      const box = element.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + box.top + box.height / 2 - window.innerHeight / 2, behavior: 'instant' });
    });
  }
  async function playing(id) {
    await page.waitForFunction(id => {
      const v = document.getElementById(id);
      return !v.paused && v.currentTime > 0.1 && v.readyState >= 2;
    }, id, { timeout: 30000 });
  }
  async function screenshot(name, selector) {
    if (selector) await center(selector);
    await page.screenshot({ path: path.join(outputDir, name + '.png') });
    report.screenshots.push(name + '.png');
  }
  try {
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await check('Five sections, full film, then citation; three Method blocks', async () => {
      const ids = await page.locator('main > section.chapter').evaluateAll(nodes => nodes.map(n => n.id));
      assert.deepEqual(ids, ['overview','interactive-viewer','method','simulation','real-world','video','BibTeX']);
      assert.equal(await page.locator('.method-block').count(), 3);
    });
    await check('Inactive tabs and lower videos are deferred on first load', async () => {
      assert.equal(await page.locator('#video-real-bottle').getAttribute('src'), null);
      assert.equal(await page.locator('#video-sim-dragon').getAttribute('src'), null);
      assert.equal(await page.locator('#video-pipeline').getAttribute('src'), null);
    });
    await screenshot('desktop-top');
    await check('Overview autoplays muted on arrival', async () => {
      await center('#video-overview'); await playing('video-overview');
      assert.equal(await page.locator('#video-overview').evaluate(v => v.muted), true);
    });
    await screenshot('desktop-overview', '#video-overview');
    await check('Offscreen media pauses and resumes on return', async () => {
      await center('#video-pipeline'); await playing('video-pipeline');
      await page.waitForFunction(() => document.getElementById('video-overview').paused);
      await center('#video-overview'); await playing('video-overview');
      await page.waitForFunction(() => document.getElementById('video-pipeline').paused);
    });
    await check('Manual pause is preserved across scroll-away/return', async () => {
      await page.locator('#video-overview').evaluate(v => v.pause());
      await center('#video-pipeline'); await playing('video-pipeline');
      await center('#video-overview');
      await page.waitForTimeout(350);
      assert.equal(await page.locator('#video-overview').evaluate(v => v.paused), true);
    });
    await check('Diagnostics starts independently when reached', async () => {
      await center('#video-diagnostics'); await playing('video-diagnostics');
      assert.equal(await page.locator('#video-diagnostics').evaluate(v=>v.duration),26);
    });
    await check('Repair pair autoplays and stays synchronized', async () => {
      await center('#video-repair-before'); await playing('video-repair-before'); await playing('video-repair-after');
      await page.waitForTimeout(500);
      const difference = await page.evaluate(() => Math.abs(document.getElementById('video-repair-before').currentTime - document.getElementById('video-repair-after').currentTime));
      assert.ok(difference < 0.2, `Pair drift ${difference}`);
      const pair = page.locator('[data-paired]').first();
      await pair.locator('[data-toggle-play]').click();
      await page.waitForFunction(() => document.getElementById('video-repair-before').paused && document.getElementById('video-repair-after').paused);
      await pair.locator('[data-seek]').fill('500');
      await pair.locator('[data-seek]').dispatchEvent('input');
      assert.ok(Math.abs(await page.locator('#video-repair-before').evaluate(v => v.currentTime) - 7) < 0.2);
      await pair.locator('[data-replay]').click();
      await playing('video-repair-before');
    });
    await check('Paired comparison loops without pausing at the boundary', async () => {
      const pair = page.locator('[data-paired]').first();
      await pair.locator('[data-seek]').fill('970');
      await page.waitForFunction(() => {
        const a = document.getElementById('video-repair-before');
        const b = document.getElementById('video-repair-after');
        return !a.paused && !b.paused && a.currentTime > 0.1 && a.currentTime < 2 && Math.abs(a.currentTime-b.currentTime)<0.2;
      }, undefined, { timeout: 15000 });
    });
    await screenshot('desktop-repair', '#repair-title');
    await screenshot('desktop-results', '.results-card');
    await check('All simulation tabs autoplay full-length scenes with close-up insets at 1×', async () => {
      await center('#simulation .experiment-gallery');
      for (const [id, duration] of [['dino',11],['dragon',7],['plunger',24],['sauce',15.033333]]) {
        await page.locator('#sim-tab-'+id).click();
        await center('#video-sim-'+id); await playing('video-sim-'+id);
        const state = await page.locator('#video-sim-'+id).evaluate(v => ({duration:v.duration,rate:v.playbackRate}));
        assert.ok(Math.abs(state.duration - duration) < 0.05);
        assert.equal(state.rate,1);
        assert.equal(await page.locator('#simulation [role="tab"][aria-selected="true"]').count(),1);
        assert.equal(await page.locator('#simulation [role="tabpanel"]:not([hidden])').count(),1);
        const hiddenPlaying = await page.locator('#simulation [hidden] video').evaluateAll(vs => vs.some(v => !v.paused));
        assert.equal(hiddenPlaying,false);
      }
    });
    await screenshot('desktop-simulation', '#simulation .experiment-gallery');
    await check('Arrow keys and Home/End switch accessible tabs', async () => {
      await page.locator('#sim-tab-sauce').focus(); await page.keyboard.press('Home');
      assert.equal(await page.locator('#sim-tab-dino').getAttribute('aria-selected'),'true');
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#sim-tab-dragon').getAttribute('aria-selected'),'true');
      await page.keyboard.press('End');
      assert.equal(await page.locator('#sim-tab-sauce').getAttribute('aria-selected'),'true');
    });
    await check('Plush, Dino and Bottle share one native-player layout and autoplay', async () => {
      assert.equal(await page.locator('#real-world .pair-controls').count(),0);
      assert.equal(await page.locator('#method .pair-controls').count(),1);
      for (const [id,duration] of [['plush',11.4],['dino',23],['bottle',18]]) {
        assert.equal(await page.locator('#real-panel-'+id+' video[controls]').count(),1);
        assert.equal(await page.locator('#real-panel-'+id+' .comparison-labels').count(),1);
        await page.locator('#real-tab-'+id).click(); await center('#video-real-'+id); await playing('video-real-'+id);
        const actual = await page.locator('#video-real-'+id).evaluate(v => v.duration);
        assert.ok(Math.abs(actual-duration) < 0.05);
        const size=await page.locator('#video-real-'+id).evaluate(v=>[v.videoWidth,v.videoHeight]);
        assert.deepEqual(size,[2560,720]);
      }
      assert.equal(await page.locator('#video-real-plush').evaluate(v => v.paused),true);
    });
    await screenshot('desktop-real-world', '#real-world .experiment-gallery');
    await page.locator('#real-tab-plush').click();
    await screenshot('desktop-plush', '#real-world .experiment-gallery');
    await check('Full film before Citation autoplays on arrival', async () => {
      await center('#video-full-film'); await playing('video-full-film');
      assert.ok(Math.abs(await page.locator('#video-full-film').evaluate(v => v.duration) - 180.4) < 0.05);
    });
    await check('All videos preserve their natural aspect ratio', async () => {
      for (const selector of ['#video-full-film','#video-real-bottle','#video-sim-plunger']) {
        const values = await page.locator(selector).evaluate(v => ({ratio:v.videoWidth/v.videoHeight, css:getComputedStyle(v).objectFit}));
        assert.equal(values.css,'contain');
        assert.ok(values.ratio>0);
      }
    });
    await check('Interactive viewer still loads and switches display modes', async () => {
      await center('#asset-panel');
      await page.waitForFunction(() => document.getElementById('asset-status').dataset.state==='ready', undefined, { timeout: 45000 });
      await page.locator('#asset-mode-segmentation').check();
      await page.waitForFunction(() => document.getElementById('asset-status').textContent.includes('labeled parts'));
      await page.locator('#asset-tab-dino').click();
      await page.waitForFunction(() => document.getElementById('asset-title').textContent==='Dino' && document.getElementById('asset-status').dataset.state==='ready');
      await page.locator('#asset-mode-surface').check();
      await page.waitForFunction(() => document.getElementById('asset-status').dataset.state==='ready');
    });
    await screenshot('desktop-gallery', '#asset-panel');
    await check('Horizontal section navigation sits below publication links and jumps to sections', async () => {
      const layout = await page.evaluate(() => {
        const nav=document.querySelector('.section-nav');
        const buttons=document.querySelector('.publication-links');
        const content=document.querySelector('#overview .container').getBoundingClientRect();
        return {below:nav.getBoundingClientRect().top>=buttons.getBoundingClientRect().bottom,
          inHeader:!!nav.closest('.publication-header'),position:getComputedStyle(nav).position,
          centered:Math.abs(content.left+content.width/2-innerWidth/2)<1};
      });
      assert.deepEqual(layout,{below:true,inHeader:true,position:'static',centered:true});
      assert.equal(await page.locator('.section-nav a').count(),7);
      await page.locator('.section-nav a[href="#method"]').click();
      await page.waitForFunction(()=>location.hash==='#method' && document.querySelector('.section-nav a[href="#method"]').getAttribute('aria-current')==='location');
    });
    for (const width of [390,768,1024]) {
      await page.setViewportSize({width,height:844});
      await check(`No horizontal page overflow at ${width}px`, async () => {
        for (const id of ['overview','method','simulation','real-world','BibTeX']) {
          await center('#'+id+' .chapter-heading');
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth+1), id);
        }
      });
      if (width===390) {
        await screenshot('mobile-navigation','.section-nav');
        await screenshot('mobile-overview','#video-overview');
        await screenshot('mobile-results','.results-card');
        await screenshot('mobile-simulation','#simulation .experiment-gallery');
        await page.locator('#real-tab-plush').click();
        await screenshot('mobile-plush','#real-world .experiment-gallery');
      }
    }
    await check('No browser errors or local HTTP failures', async () => assert.deepEqual(report.errors,[]));
  } finally {
    fs.writeFileSync(path.join(outputDir,'browser-report.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
