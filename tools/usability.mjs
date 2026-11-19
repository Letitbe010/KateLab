// Phase 9 checks on the production build (spec §12, §13.4):
//  - PWA: manifest, service worker, works offline after the first visit;
//  - usability: screenshots of every screen at 390 px and 1280 px; active section
//    visible, home one tap away, no horizontal page scroll, no clipped text.
// Usage: npm run build && npx vite preview --port 4173 ; node tools/usability.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/KateLab/';
const out = process.argv[3] ?? 'screenshots/usability';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch({ channel: 'chrome' }));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};
const SEEN = `localStorage.setItem('katelab.progress.v1', JSON.stringify({ version: 1, attempts: [], theorySeen: [], workedDone: [], introSeen: true, settings: { theme: 'auto', showInverseRatio: false, speedUnit: 'rpm', linearUnit: 'mm/min' } }))`;

// ---------------- PWA ----------------
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.addInitScript(SEEN);
  await p.goto(base);
  const man = await p.evaluate(async () => {
    const href = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
    if (!href) return null;
    return (await fetch(href)).json();
  });
  check(!!man && man.start_url === '/KateLab/' && man.scope === '/KateLab/' && man.display === 'standalone' && man.icons?.some((i) => i.sizes === '512x512'), 'manifest: start_url, scope, standalone, 512 px icon');
  const sw = await p.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  check(sw, 'service worker active');
  await p.reload(); // let the SW control the page
  await p.waitForTimeout(500);
  await ctx.setOffline(true);
  for (const h of ['', '#/praktika/pool/oinarria-kg1', '#/ebatziak/tren-bi-etapa', '#/teoria/erlazioa']) {
    await p.goto(base + h).catch(() => {});
    const ok = await p.locator('h1').first().waitFor({ timeout: 5000 }).then(() => true, () => false);
    check(ok, `offline: ${h || 'home'} renders`);
  }
  await ctx.close();
}

// ---------------- usability (§13.4) ----------------
const SCREENS = [
  ['start', ''],
  ['practice', '#/praktika'],
  ['ex-kg1', '#/praktika/pool/oinarria-kg1'],
  ['ex-euskadi', '#/praktika/pool/ope-euskadi-2020-3'],
  ['ex-madrid', '#/praktika/pool/ope-madrid-2025-7'],
  ['worked-list', '#/ebatziak'],
  ['worked-fresa', '#/ebatziak/fresagailua'],
  ['theory-list', '#/teoria'],
  ['theory-kaxak', '#/teoria/kaxak'],
  ['progress', '#/aurrerapena'],
  ['settings', '#/ezarpenak'],
  ['about', '#/honi-buruz'],
];
for (const [w, h] of [
  [390, 844],
  [1280, 900],
]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.addInitScript(SEEN);
  for (const [name, hash] of SCREENS) {
    await p.goto(base + hash);
    await p.locator('h1').first().waitFor();
    if (name.startsWith('ex-')) await p.getByRole('button', { name: 'Ebazten hasi' }).click();
    if (name.startsWith('worked-') && name !== 'worked-list') await p.getByRole('button', { name: 'Dena erakutsi' }).click();
    await p.waitForTimeout(150);
    const r = await p.evaluate((wide) => {
      const visible = (el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const nav = document.querySelector(wide ? 'nav.side' : 'nav.bottom');
      const active = [...document.querySelectorAll('[aria-current="page"]')].filter(visible);
      const home = [...document.querySelectorAll('a[href="#/"]')].filter(visible).length;
      // clipped text: an element whose text overflows its own box without a scroll container on purpose
      const scrollers = '.schema-box, .tex, .block, .w-svg';
      const clipped = [...document.querySelectorAll('h1, h2, h3, p, li, a, button, label, td, th, b, span')]
        .filter((el) => visible(el) && !el.closest(scrollers) && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible')
        .map((el) => el.textContent?.slice(0, 40));
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        navVisible: !!nav && visible(nav),
        active: active.length,
        home,
        clipped,
      };
    }, w >= 900);
    const label = `${w}px ${name}`;
    check(r.overflow <= 0, `${label}: no horizontal page scroll (${r.overflow})`);
    check(r.navVisible && (r.active > 0 || name === 'ex-kg1' || name === 'ex-euskadi' || name === 'ex-madrid' || name === 'about'), `${label}: navigation visible, active section marked (${r.active})`);
    check(r.home > 0, `${label}: home one tap away`);
    check(r.clipped.length === 0, `${label}: no clipped text${r.clipped.length ? ' — ' + r.clipped.join(' | ') : ''}`);
    await p.screenshot({ path: `${out}/${w}_${name}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all checks passed');
process.exit(failures ? 1 : 0);
