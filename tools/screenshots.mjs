// Screenshots of the schema gallery for review (spec §6, §13.4).
// Usage: node tools/screenshots.mjs [baseUrl] [outDir]
// Needs a running dev server (npm run dev) and Microsoft Edge or Chrome installed.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/KateLab/';
const out = process.argv[3] ?? 'screenshots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
const widths = [
  { name: '1280', width: 1280, height: 900 },
  { name: '390', width: 390, height: 844 },
];
for (const vp of widths) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  await page.goto(base);
  const tabs = await page.locator('.demo-pick button').all();
  for (let i = 0; i < tabs.length; i++) {
    await tabs[i].click();
    const name = (await tabs[i].innerText()).replace(/[^\p{L}\p{N}]+/gu, '_');
    await page.locator('.schema').screenshot({ path: `${out}/${vp.name}_${String(i + 1).padStart(2, '0')}_${name}.png` });
  }
  await page.screenshot({ path: `${out}/${vp.name}_00_page.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log(`screenshots written to ${out}/`);
