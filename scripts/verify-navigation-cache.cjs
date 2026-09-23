// Reproduce the deployed regression with a real warm browser cache, then verify the fix.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputDir = process.env.SITE_QA_DIR || path.join(root, '.qa', 'navigation-cache');
fs.mkdirSync(outputDir, { recursive: true });
const fromGit = (commit, file) => execFileSync('git', ['show', `${commit}:${file}`], { cwd: root });
const legacy = {
  html: fromGit('b827fc5', 'index.html'),
  css: fromGit('b827fc5', 'static/css/site.css'),
  js: fromGit('b827fc5', 'static/js/site.js'),
};
const brokenHTML = fromGit('d0b8ffb', 'index.html');
const rollbackHTML = fromGit('b5f1804', 'index.html');
let stage = 'legacy';
const requests = [];
const mime = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript',
  '.json':'application/json', '.mp4':'video/mp4', '.jpg':'image/jpeg', '.png':'image/png' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  requests.push({ stage, pathname });
  if (pathname === '/') {
    const html = stage === 'legacy' ? legacy.html : stage === 'broken' ? brokenHTML
      : stage === 'rollback' ? rollbackHTML : fs.readFileSync(path.join(root, 'index.html'));
    response.writeHead(200, { 'Content-Type':'text/html', 'Cache-Control':'no-store' });
    response.end(html);
    return;
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  let contents;
  if (stage === 'legacy' && pathname === '/static/css/site.css') contents = legacy.css;
  else if (stage === 'legacy' && pathname === '/static/js/site.js') contents = legacy.js;
  else contents = fs.readFileSync(file);
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  const headers = { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream',
    'Cache-Control':'public, max-age=600', 'Accept-Ranges':'bytes' };
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), contents.length-1) : contents.length-1;
    headers['Content-Range'] = `bytes ${start}-${end}/${contents.length}`;
    contents = contents.subarray(start, end+1);
  }
  headers['Content-Length'] = contents.length;
  response.writeHead(range ? 206 : 200, headers); response.end(contents);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const report = { checks: [], requests };
  try {
    browser = await chromium.launch({ headless:true,
      ...(process.env.CHROME_EXECUTABLE ? { executablePath:process.env.CHROME_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
    async function navigate(next) {
      stage = next;
      await page.goto(`${baseURL}/?stage=${next}`, { waitUntil:'load' });
    }
    await navigate('legacy');
    assert.equal(await page.locator('.progress-track').evaluate(e=>getComputedStyle(e).display), 'block');
    await navigate('broken');
    assert.equal(await page.locator('.section-nav .progress-track').evaluate(e=>getComputedStyle(e).display), 'block');
    assert.equal(requests.filter(r=>r.pathname==='/static/css/site.css').length, 1);
    report.checks.push('Reproduced vertical navigation with new HTML and cached legacy CSS');
    await page.screenshot({ path:path.join(outputDir,'reproduced-stale-css.png') });

    await navigate('fixed');
    assert.equal(await page.locator('.section-nav .progress-track').evaluate(e=>getComputedStyle(e).display), 'flex');
    const tops = await page.locator('.section-nav a').evaluateAll(nodes=>nodes.map(e=>Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1);
    assert.ok(requests.some(r=>r.stage==='fixed' && /\/site\.[a-f0-9]{12}\.css$/.test(r.pathname)));
    assert.ok(requests.some(r=>r.stage==='fixed' && /\/site\.[a-f0-9]{12}\.js$/.test(r.pathname)));
    report.checks.push('Versioned CSS and JS bypass the stale cache and restore a single horizontal row');
    await page.screenshot({ path:path.join(outputDir,'fixed-warm-cache.png') });

    await navigate('rollback');
    assert.equal(await page.locator('.page-rail').evaluate(e=>getComputedStyle(e).position), 'fixed');
    assert.equal(await page.locator('.progress-track').evaluate(e=>getComputedStyle(e).display), 'block');
    report.checks.push('Previously generated assets still support the restored sidebar document');

    await page.setViewportSize({ width:390, height:844 });
    await navigate('fixed');
    assert.equal(await page.locator('.section-nav a').count(), 7);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const bounds = await page.locator('.section-nav a').evaluateAll(nodes=>nodes.map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
    assert.ok(bounds.every(b=>b.left>=0 && b.right<=390));
    report.checks.push('All seven mobile links remain visible without page overflow after a cached upgrade');
    report.checks.forEach(name=>console.log('PASS:',name));
  } finally {
    fs.writeFileSync(path.join(outputDir,'cache-report.json'),JSON.stringify(report,null,2));
    if (browser) await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
