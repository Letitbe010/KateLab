// Phase 6 acceptance (spec §12): KG1 and KG3 solved and graded on a phone-sized
// screen (390 px), in Basque and in Spanish. Needs `npm run dev` and Edge/Chrome.
// Usage: node tools/e2e-practice.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/katelab/';
const out = process.argv[3] ?? 'screenshots/e2e';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

for (const lang of ['eu', 'es']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => check(false, `[${lang}] page error: ${e.message}`));
  await page.goto(base + '#/praktika');
  await page.getByRole('button', { name: lang.toUpperCase(), exact: true }).click();
  const T = (eu, es) => (lang === 'eu' ? eu : es);

  // ---- KG1: two-stage train ----
  await page.goto(base + '#/praktika/pool/oinarria-kg1');
  await page.getByRole('button', { name: T('Ebazten hasi', 'Empezar a resolver') }).click();
  const inputs = page.locator('.ask input');
  await inputs.nth(0).fill('360');
  await inputs.nth(1).fill('0,25');
  await page.getByRole('radio', { name: T('↻ erlojuaren orratzen noranzkoan', '↻ sentido horario') }).click();
  await page.screenshot({ path: `${out}/${lang}_kg1_1_solve.png`, fullPage: true });
  await page.getByRole('button', { name: T('Zuzendu', 'Corregir') }).click();
  const chips1 = await page.locator('.ask .chip').allInnerTexts();
  check(chips1.length === 3 && chips1.every((c) => c.includes('✓')), `[${lang}] KG1: 3/3 correct (${chips1.join(' | ')})`);
  check((await page.locator('.score').innerText()).startsWith('3 / 3'), `[${lang}] KG1 score 3 / 3`);
  await page.screenshot({ path: `${out}/${lang}_kg1_2_graded.png`, fullPage: true });
  await page.getByRole('button', { name: T('Ikusi ebazpena', 'Ver la solución') }).click();
  const solText = await page.locator('.solution').innerText();
  check(solText.includes('20/40') && solText.includes('25/50') && solText.includes('1/4'), `[${lang}] KG1 solution shows 20/40, 25/50 and i = 1/4`);
  await page.screenshot({ path: `${out}/${lang}_kg1_3_solution.png`, fullPage: true });

  // KG1 with a typical mistake: inverted ratios
  await page.getByRole('button', { name: T('Berriro saiatu', 'Intentar de nuevo') }).click();
  await inputs.nth(0).fill('5760');
  await page.getByRole('button', { name: T('Zuzendu', 'Corregir') }).click();
  const fb = await page.locator('.ask').nth(0).innerText();
  check(fb.includes('✗') && fb.includes(T('alderantziz', 'invertido')), `[${lang}] KG1 wrong answer 5760 → diagnosis "inverted"`);
  await page.screenshot({ path: `${out}/${lang}_kg1_4_mistake.png`, fullPage: true });

  // ---- KG3: 3-speed box ----
  await page.goto(base + '#/praktika/pool/oinarria-kg3');
  await page.getByRole('button', { name: T('Ebazten hasi', 'Empezar a resolver') }).click();
  const in3 = page.locator('.ask input');
  await in3.nth(0).fill('1200');
  await in3.nth(1).fill('400');
  await in3.nth(2).fill('3');
  await in3.nth(3).fill('80');
  await page.getByRole('button', { name: T('Zuzendu', 'Corregir') }).click();
  const chips3 = await page.locator('.ask .chip').allInnerTexts();
  check(chips3.length === 3 && chips3.every((c) => c.includes('✓')), `[${lang}] KG3: 3/3 correct (${chips3.join(' | ')})`);
  await page.screenshot({ path: `${out}/${lang}_kg3_1_graded.png`, fullPage: true });
  await page.getByRole('button', { name: T('Ikusi ebazpena', 'Ver la solución') }).click();
  const sol3 = await page.locator('.solution').innerText();
  check(sol3.includes('400') && sol3.includes('720') && sol3.includes('1200') && sol3.includes('2 · (20 + 60) / 2 = 80 mm'), `[${lang}] KG3 solution: speed table 400/720/1200 and a = 2 · (20 + 60) / 2 = 80 mm`);
  await page.screenshot({ path: `${out}/${lang}_kg3_2_solution.png`, fullPage: true });

  // no horizontal page scroll on the phone
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(sw <= 391, `[${lang}] no horizontal page scroll (scrollWidth ${sw})`);
  await page.close();
}

// every pool exercise and one generated exercise per archetype: open, grade empty, show solution, no errors
const r = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
r.on('pageerror', (e) => errors.push(e.message));
await r.goto(base + '#/praktika');
const links = await r.locator('a.tile').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
const targets = [...links.filter((h) => h.includes('/pool/')), ...['tren-sinplea', 'torloju-amaigabea', 'elikadura-kremailera', 'mahaia-torlojua', 'abiadura-kaxa', 'tornu-buru-kaxa', 'fresagailua', 'plater-zatitzailea', 'aldaketa-gurpilak', 'potentzia'].map((a) => `#/praktika/${a}/seed/12345`)];
for (const h of targets) {
  await r.goto(base + h);
  await r.getByRole('button', { name: 'Ebazten hasi' }).click();
  await r.getByRole('button', { name: 'Zuzendu' }).click();
  const n = await r.locator('.ask .chip').count();
  await r.getByRole('button', { name: 'Ikusi ebazpena' }).click();
  const sol = await r.locator('.sol-ask').count();
  check(n > 0 && sol === n && errors.length === 0, `${h}: ${n} asks graded, solution shown${errors.length ? ` — ${errors.join('; ')}` : ''}`);
}
await r.close();

// desktop view of the home and of the milling exercise
const d = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await d.goto(base + '#/praktika');
await d.screenshot({ path: `${out}/desktop_home.png`, fullPage: true });
await d.goto(base + '#/praktika/pool/ope-euskadi-2020-3');
await d.getByRole('button', { name: 'Ebazten hasi' }).click();
await d.screenshot({ path: `${out}/desktop_euskadi2020.png`, fullPage: true });
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
