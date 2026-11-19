// Phase 6 acceptance (spec §12): KG1 and KG3 solved and graded on a phone-sized
// screen (390 px), in Basque and in Spanish. Needs `npm run dev` and Edge/Chrome.
// Usage: node tools/e2e-practice.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173/KateLab/';
const out = process.argv[3] ?? 'screenshots/e2e';
mkdirSync(out, { recursive: true });
const launched = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
// every page starts with the first-visit intro already seen (the intro itself is tested below)
const SEEN = `localStorage.setItem('katelab.progress.v1', JSON.stringify({ version: 1, attempts: [], theorySeen: [], workedDone: [], introSeen: true, settings: { theme: 'auto', showInverseRatio: false, speedUnit: 'rpm', linearUnit: 'mm/min' } }))`;
const browser = {
  newPage: async (opts) => {
    const p = await launched.newPage(opts);
    await p.addInitScript(`if (!sessionStorage.getItem('e2e')) { sessionStorage.setItem('e2e', '1'); ${SEEN} }`);
    return p;
  },
  close: () => launched.close(),
};
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

// worked exercises: every one opens, shows all steps without errors; KG1 shows the solver numbers
const w = await browser.newPage({ viewport: { width: 390, height: 844 } });
const werr = [];
w.on('pageerror', (e) => werr.push(e.message));
await w.goto(base + '#/ebatziak');
const wl = await w.locator('a.tile').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
check(wl.length === 11, `worked list has 11 exercises (${wl.length})`);
for (const h of wl) {
  await w.goto(base + h);
  await w.getByRole('button', { name: 'Hurrengo urratsa' }).click();
  await w.getByRole('button', { name: 'Dena erakutsi' }).click();
  const n = await w.locator('.wstep').count();
  const youNow = await w.getByText('Orain zuk').count();
  check(n >= 3 && werr.length === 0 && youNow === 1, `${h}: ${n} steps shown, "Orain zuk" link${werr.length ? ' — ' + werr.join('; ') : ''}`);
  if (h.endsWith('tren-bi-etapa')) {
    const txt = await w.locator('.steps').innerText();
    check(txt.includes('1440 · 20/40 = 720 rpm') && txt.includes('720 · 25/50 = 360 rpm'), 'KG1 worked: 1440 · 20/40 = 720 and 720 · 25/50 = 360');
    await w.screenshot({ path: `${out}/eu_worked_kg1.png`, fullPage: true });
  }
  if (h.endsWith('fresagailua')) await w.screenshot({ path: `${out}/eu_worked_fresagailua.png`, fullPage: true });
}
await w.close();

// theory: every topic opens without errors, formulas rendered by KaTeX, widgets present
const th = await browser.newPage({ viewport: { width: 390, height: 844 } });
const therr = [];
th.on('pageerror', (e) => therr.push(e.message));
await th.goto(base + '#/teoria');
await th.locator('.topic-list a').first().waitFor(); // theory is lazy-loaded
const tl = await th.locator('.topic-list a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
check(tl.length === 13, `theory list has 13 topics (${tl.length})`);
for (const h of tl) {
  await th.goto(base + h);
  await th.locator('.theory').waitFor();
  const tex = await th.locator('.katex').count();
  const unfilled = (await th.locator('.theory').innerText()).includes('{{');
  check(therr.length === 0 && !unfilled, `${h}: ${tex} formulas, examples filled${therr.length ? ' — ' + therr.join('; ') : ''}`);
  if (h.endsWith('erlazioa')) {
    check((await th.locator('.widget').count()) === 1, 'erlazioa: gears widget present');
    await th.screenshot({ path: `${out}/eu_theory_erlazioa.png`, fullPage: true });
  }
  if (h.endsWith('kaxak')) {
    await th.getByRole('button', { name: /Z?40/ }).first().click().catch(() => {});
    await th.screenshot({ path: `${out}/eu_theory_kaxak.png`, fullPage: true });
  }
}
await th.close();

// first visit: intro shown, can be skipped, not shown again; the learning path is the home
{
  const ctx = await launched.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(base);
  check(await p.getByRole('dialog').isVisible(), 'first visit: intro dialog shown');
  await p.getByRole('button', { name: 'Hurrengoa' }).click();
  await p.getByRole('button', { name: 'Hurrengoa' }).click();
  await p.getByRole('button', { name: 'Hasi' }).click();
  check((await p.getByRole('dialog').count()) === 0, 'intro closed');
  await p.reload();
  check((await p.getByRole('dialog').count()) === 0, 'intro not shown again');
  check(await p.getByRole('heading', { name: 'Ikasbidea' }).isVisible(), 'home is the learning path');
  // progress is recorded: answer KG1 and see it on the progress page
  await p.goto(base + '#/praktika/pool/oinarria-kg1');
  await p.getByRole('button', { name: 'Ebazten hasi' }).click();
  await p.locator('.ask input').nth(0).fill('5760');
  await p.getByRole('button', { name: 'Zuzendu' }).click();
  await p.goto(base + '#/aurrerapena');
  const ptxt = await p.locator('main').innerText();
  check(ptxt.includes('Erantzunak guztira: 1') && ptxt.includes('alderantziz'), 'progress page shows the attempts and the most common mistake');
  await p.goto(base);
  check(await p.getByRole('link', { name: /Jarraitu utzi duzun tokitik/ }).isVisible(), '"continue where you left off" button');
  // dark theme from the settings
  await p.goto(base + '#/ezarpenak');
  await p.getByRole('radio', { name: 'Iluna' }).click();
  check((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme applied');
  await p.screenshot({ path: `${out}/eu_settings_dark.png`, fullPage: true });
  await p.goto(base + '#/honi-buruz');
  check(/0\.\d+\.\d+/.test(await p.locator('main').innerText()), 'about page shows the version');
  await ctx.close();
}

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
