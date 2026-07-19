import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const [, , url = 'http://localhost:5183/viewer.html', out = 'renders/blockout.png', view] = process.argv;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (exc) => errors.push(String(exc)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction('window.__modelReady === true', { timeout: 10000 });
if (view) {
  await page.evaluate((v) => window.__setView(v), view);
}
await page.waitForTimeout(300);
await page.screenshot({ path: out });
await browser.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:');
  for (const e of errors) console.error(' -', e);
}
console.log(`saved ${out}`);
