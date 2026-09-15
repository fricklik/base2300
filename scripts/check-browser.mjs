import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createDemoServer } from './serve-demo.mjs';

// Optional dev-only dependency; not included in the library's runtime dependencies.
const modulePath = process.env.BASE2300_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const server = createDemoServer();
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BASE2300_BROWSER_PATH ? { executablePath: process.env.BASE2300_BROWSER_PATH } : {}) });
  const page = await browser.newPage();
  const failures = [], external = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('request', request => { if (!request.url().startsWith(origin)) external.push(request.url()); });
  await page.goto(`${origin}/demo/`);
  await page.locator('#run').click();
  await page.locator('#result').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#output').inputValue(), 'あ殻律注架霊慮彫需仕林爽模製兆氏9帝否い壁燃克夢浄備餓計麗蹴香懐叔汰体桜');
  assert.match(await page.locator('#comparison').innerText(), /106 B/);
  await page.locator('#roundtrip').click();
  await page.waitForFunction(() => document.querySelector('#output').value === 'Base2300 packs the same bytes into fewer characters.');
  const inputs = ['hello, world!', '\ufeffか\u3099\0e\u0301𠮟😀', '', '同じ文章を繰り返します。'.repeat(80)];
  for (const input of inputs) {
    await page.locator('#action').selectOption('encode');
    await page.locator('#profile').selectOption('experimental');
    await page.locator('#input').fill(input);
    await page.locator('#run').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.match(await page.locator('#result-note').innerText(), /原バイトとの一致を確認/);
    await page.locator('#roundtrip').click();
    await page.waitForFunction(expected => !document.querySelector('#result').hidden && document.querySelector('#output').value === expected, input);
  }
  await page.locator('#action').selectOption('decode');
  await page.locator('#profile').selectOption('checked');
  await page.locator('#input').fill('invalid');
  await page.locator('#run').click();
  await page.locator('#status.error').waitFor();
  assert.equal(await page.locator('#result').isVisible(), false);
  await page.locator('#action').selectOption('encode');
  await page.locator('#input').fill('a'.repeat(65537));
  await page.locator('#run').click();
  await page.locator('#status.error').waitFor();
  assert.match(await page.locator('#status').innerText(), /64 KiB/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const screenshot = process.env.BASE2300_SCREENSHOT;
  if (screenshot) {
    await page.locator('[data-sample="default"]').click();
    await page.locator('#run').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 1280, height: 1080 });
    await page.screenshot({ path: screenshot, fullPage: true });
  }
  assert.deepEqual(failures, []);
  assert.deepEqual(external, []);
  console.log(JSON.stringify({ browser: browser.version(), roundTrips: 5, malformedRejected: true, demoLimitRejected: true, mobileOverflow: false, pageErrors: failures, externalRequests: external }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
