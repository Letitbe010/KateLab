/**
 * Theory (spec §14.3, phase 8 acceptance: every topic eu/es; formula tests green).
 *  - 13 topics, both languages;
 *  - no hand-written numbers in the prose: examples use solver variables;
 *  - every example fills in both languages;
 *  - every formula marked `check` is compared with the solver on 1000 random cases.
 */
import fc from 'fast-check';
import { TOPICS } from '../src/content/theory/topics';
import type { FormulaId } from '../src/content/theory/types';
import { compoundTrains, requiredRatio } from '../src/core/changeGears';
import { centerDistance, gearGeometry } from '../src/core/geometry';
import { indexingFraction, indexingSolutions } from '../src/core/indexing';
import { type ChainJSON, allStates, chainFromJSON } from '../src/core/model';
import { powerAt } from '../src/core/power';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { feedPerRevA, solveStateA, speedTableA } from '../src/core/solverPath';
import { fillTemplate, templateVars } from '../src/core/template';
import { mmPerMinToMPerS, rpmToRadPerS } from '../src/core/units';
import { DEFAULT_GEARSET } from '../src/core/changeGears';
import { compareSolutions } from '../src/core/checks';

const RUNS = { numRuns: 1000 };
const one = (j: ChainJSON) => {
  const c = chainFromJSON(j);
  const a = solveStateA(c, {});
  const b = solveStateB(c, {});
  expect(compareSolutions(a, b)).toBeNull();
  if (!a.ok) throw new Error(a.error);
  return { c, s: a };
};
const S = (...ids: string[]) => ids.map((id) => ({ id, label: id }));
const zArb = fc.integer({ min: 12, max: 120 });
const nArb = fc.integer({ min: 1, max: 3000 });

/** One property per formula id; each compares the formula of the text with the solver. */
const CHECKS: Record<FormulaId, () => void> = {
  'gear-ratio': () =>
    fc.assert(
      fc.property(zArb, zArb, nArb, (z1, z2, n) => {
        const { s } = one({ shafts: S('A', 'B'), elements: [{ kind: 'gear', id: 'g', from: 'A', to: 'B', z1, z2 }], input: { shaft: 'A', n } });
        expect(R.eq(s.shafts.B!.n, R.div(R.mul(R.q(n), R.q(z1)), R.q(z2)))).toBe(true);
      }),
      RUNS,
    ),
  'belt-ratio': () =>
    fc.assert(
      fc.property(fc.integer({ min: 20, max: 500 }), fc.integer({ min: 20, max: 500 }), nArb, fc.integer({ min: 0, max: 5 }), (d1, d2, n, sPct) => {
        const slip = R.q(sPct, 100);
        const { s } = one({ shafts: S('A', 'B'), elements: [{ kind: 'belt', id: 'u', from: 'A', to: 'B', d1, d2, ...(sPct ? { slip: R.toString(slip) } : {}) }], input: { shaft: 'A', n } });
        expect(R.eq(s.shafts.B!.n, R.mul(R.mul(R.q(n), R.q(d1, d2)), R.sub(R.ONE, slip)))).toBe(true);
      }),
      RUNS,
    ),
  'worm-ratio': () =>
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 20, max: 100 }), nArb, (k, z, n) => {
        const { s } = one({ shafts: S('A', 'B'), elements: [{ kind: 'worm', id: 'w', from: 'A', to: 'B', starts: k, z }], input: { shaft: 'A', n } });
        expect(R.eq(s.shafts.B!.n, R.q(n * k, z))).toBe(true);
      }),
      RUNS,
    ),
  'train-product': () =>
    fc.assert(
      fc.property(fc.array(fc.tuple(zArb, zArb), { minLength: 2, maxLength: 5 }), nArb, (stages, n) => {
        const shafts = S(...stages.map((_, i) => `S${i}`), `S${stages.length}`);
        const elements = stages.map(([z1, z2], i) => ({ kind: 'gear' as const, id: `g${i}`, from: `S${i}`, to: `S${i + 1}`, z1, z2 }));
        const { s } = one({ shafts, elements, input: { shaft: 'S0', n } });
        const prod = stages.reduce((acc, [z1, z2]) => R.mul(acc, R.q(z1, z2)), R.ONE);
        expect(R.eq(R.div(s.shafts[`S${stages.length}`]!.n, R.q(n)), prod)).toBe(true);
      }),
      RUNS,
    ),
  'pitch-diameter': () =>
    fc.assert(
      fc.property(zArb, fc.integer({ min: 1, max: 100 }), (z, m10) => {
        const m = R.q(m10, 10);
        expect(R.eq(gearGeometry(m, z).d, R.mul(m, R.q(z)))).toBe(true);
      }),
      RUNS,
    ),
  'tooth-geometry': () =>
    fc.assert(
      fc.property(zArb, fc.integer({ min: 1, max: 100 }), (z, m10) => {
        const m = R.q(m10, 10);
        const g = gearGeometry(m, z);
        expect(R.eq(R.sub(g.da, g.d), R.mul(R.q(2), m))).toBe(true); // addendum = m
        expect(R.eq(R.sub(g.d, g.df), R.mul(R.parse('2,5'), m))).toBe(true); // dedendum = 1,25·m
        expect(R.eq(R.sub(g.da, g.df), R.mul(R.q(2), g.h))).toBe(true); // h = addendum + dedendum
        expect(R.prToString(g.p)).toBe(R.prToString(R.pr(m, 1))); // p = π·m
      }),
      RUNS,
    ),
  'centre-distance': () =>
    fc.assert(
      fc.property(zArb, zArb, fc.integer({ min: 1, max: 100 }), (z1, z2, m10) => {
        const m = R.q(m10, 10);
        const d1 = R.mul(m, R.q(z1));
        const d2 = R.mul(m, R.q(z2));
        expect(R.eq(centerDistance(m, z1, z2), R.div(R.add(d1, d2), R.q(2)))).toBe(true);
        expect(R.eq(centerDistance(m, z1, z2, true), R.div(R.abs(R.sub(d2, d1)), R.q(2)))).toBe(true);
      }),
      RUNS,
    ),
  'rack-speed': () =>
    fc.assert(
      fc.property(fc.integer({ min: 12, max: 60 }), fc.integer({ min: 1, max: 50 }), nArb, (z, m10, n) => {
        const m = R.q(m10, 10);
        const { s } = one({ shafts: S('P'), linear: [{ id: 'R', label: 'R' }], elements: [{ kind: 'rack', id: 'r', from: 'P', output: 'R', z, module: R.toString(m) }], input: { shaft: 'P', n } });
        // v [m/s] = π·m·Z·n / 60 000 (m in mm, n in rpm)
        expect(R.prToString(mmPerMinToMPerS(s.linear.R!.v))).toBe(R.prToString(R.pr(R.div(R.mul(R.mul(m, R.q(z)), R.q(n)), R.q(60000)), 1)));
      }),
      RUNS,
    ),
  'screw-speed': () =>
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 4 }), nArb, (p, k, n) => {
        const { s } = one({ shafts: S('S'), linear: [{ id: 'T', label: 'T' }], elements: [{ kind: 'screw', id: 's', from: 'S', output: 'T', pitch: p, starts: k }], input: { shaft: 'S', n } });
        expect(R.prToString(s.linear.T!.v)).toBe(String(n * k * p));
      }),
      RUNS,
    ),
  'feed-per-rev': () =>
    fc.assert(
      fc.property(zArb, zArb, fc.integer({ min: 1, max: 10 }), nArb, (z1, z2, p, n) => {
        const { s } = one({ shafts: S('AN', 'S'), linear: [{ id: 'T', label: 'T' }], elements: [{ kind: 'gear', id: 'g', from: 'AN', to: 'S', z1, z2 }, { kind: 'screw', id: 's', from: 'S', output: 'T', pitch: p, starts: 1 }], input: { shaft: 'AN', n } });
        const f = feedPerRevA(s, 'T', 'AN');
        expect(R.eq(R.mul(f.coef, R.q(n)), s.linear.T!.v.coef)).toBe(true); // v = f·n
      }),
      RUNS,
    ),
  omega: () =>
    fc.assert(
      fc.property(nArb, (n) => {
        expect(R.prToString(rpmToRadPerS(R.q(n)))).toBe(R.prToString(R.pr(R.q(2 * n, 60), 1)));
      }),
      RUNS,
    ),
  torque: () =>
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 50000 }), nArb, (P, n) => {
        const { c, s } = one({ shafts: S('A'), elements: [], input: { shaft: 'A', n, power: P } });
        const T = powerAt(c, {}, s, 'A').T;
        expect(R.prToString(T)).toBe(R.prToString(R.pr(R.q(60 * P, 2 * n), -1))); // 60·P/(2π·n)
      }),
      RUNS,
    ),
  'power-efficiency': () =>
    fc.assert(
      fc.property(zArb, zArb, nArb, fc.integer({ min: 100, max: 20000 }), fc.integer({ min: 80, max: 100 }), (z1, z2, n, P, eta) => {
        const e = R.q(eta, 100);
        const j: ChainJSON = { shafts: S('A', 'B'), elements: [{ kind: 'gear', id: 'g', from: 'A', to: 'B', z1, z2 }], input: { shaft: 'A', n, power: P }, efficiency: { g: R.toString(e) } };
        const { c, s } = one(j);
        const out = powerAt(c, {}, s, 'B');
        const inn = powerAt(c, {}, s, 'A');
        expect(R.eq(out.P, R.mul(R.q(P), e))).toBe(true);
        const i = R.div(s.shafts.B!.n, s.shafts.A!.n);
        expect(R.prToString(out.T)).toBe(R.prToString(R.prScale(inn.T, R.mul(R.inv(i), e)))); // T_out = T_in·(1/i)·η
      }),
      RUNS,
    ),
  indexing: () =>
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), fc.constantFrom(40, 60, 90), (N, K) => {
        const f = indexingFraction(K, N);
        expect(R.eq(R.add(R.q(f.turns), f.fraction), R.q(K, N))).toBe(true);
        expect(R.lt(f.fraction, R.ONE) && !R.lt(f.fraction, R.ZERO)).toBe(true);
        for (const sol of indexingSolutions(K, N, [[15, 16, 17, 18, 19, 20], [21, 23, 27, 29, 31, 33], [37, 39, 41, 43, 47, 49]]))
          expect(R.eq(R.add(R.q(sol.turns), R.q(sol.holes, sol.circle)), R.q(K, N))).toBe(true);
      }),
      RUNS,
    ),
  'change-gears': () =>
    fc.assert(
      fc.property(fc.constantFrom('0,5', '0,75', '1', '1,25', '1,5', '1,75', '2', '2,5', '3', '4'), fc.constantFrom('4', '5', '6', '8'), (p, l) => {
        const i = requiredRatio(R.parse(p), R.parse(l));
        expect(R.eq(i, R.div(R.parse(p), R.parse(l)))).toBe(true);
        for (const t of compoundTrains(i, DEFAULT_GEARSET).slice(0, 20)) expect(R.eq(R.mul(R.q(t.za, t.zb), R.q(t.zc, t.zd)), i)).toBe(true);
      }),
      RUNS,
    ),
  'speed-count': () =>
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 17, max: 43 }), { minLength: 2, maxLength: 3 }), fc.uniqueArray(fc.integer({ min: 17, max: 37 }), { minLength: 2, maxLength: 3 }), (a, b) => {
        const j: ChainJSON = {
          shafts: S('I', 'II', 'III'),
          elements: [...a.map((z, k) => ({ kind: 'gear' as const, id: `a${k}`, from: 'I', to: 'II', z1: z, z2: 60 - z })), ...b.map((z, k) => ({ kind: 'gear' as const, id: `b${k}`, from: 'II', to: 'III', z1: z, z2: 54 - z }))],
          clusters: [
            { id: 'A', label: 'A', options: a.map((_, k) => `a${k}`) },
            { id: 'B', label: 'B', options: b.map((_, k) => `b${k}`) },
          ],
          input: { shaft: 'I', n: 1000 },
        };
        const c = chainFromJSON(j);
        const t = speedTableA(c, 'III');
        expect(t.total).toBe(allStates(c).length);
        expect(t.total).toBe(a.length * b.length); // z = Π p_j (combinations)
        expect(t.distinct.length).toBeLessThanOrEqual(t.total);
      }),
      RUNS,
    ),
};

const ALLOWED = [/ISO 3952/g, /K = 40/g, /Madril 2025|Madrid 2025/g, /\+ 15/g, /i < 1/g, /η ≤ 1/g, /1 − s/g, /\bv1\b/g, /\/2(?!\d)/g, /\/60(?!\d)/g];
const hardNumbers = (s: string): string[] => {
  let x = s.replace(/\{\{[^}]+\}\}/g, '');
  for (const re of ALLOWED) x = x.replace(re, '');
  return x.match(/\d+/g) ?? [];
};

describe('theory content', () => {
  it('13 topics with distinct ids, titles and blocks in both languages', () => {
    expect(TOPICS).toHaveLength(13);
    expect(new Set(TOPICS.map((t) => t.id)).size).toBe(13);
    for (const t of TOPICS) {
      expect(t.title.eu && t.title.es).toBeTruthy();
      expect(t.blocks.length).toBeGreaterThan(1);
      for (const b of t.blocks) {
        if (b.t === 'p' || b.t === 'note' || b.t === 'example') expect(b.eu && b.es, t.id).toBeTruthy();
        if (b.t === 'list') expect(b.eu.length, t.id).toBe(b.es.length);
        if (b.t === 'example') expect(templateVars(b.eu).sort(), t.id).toEqual(templateVars(b.es).sort());
      }
    }
  });
  it('no hand-written numbers in the prose (examples use solver variables)', () => {
    for (const t of TOPICS)
      for (const b of t.blocks) {
        const texts = b.t === 'p' || b.t === 'note' || b.t === 'example' ? [b.eu, b.es] : b.t === 'list' ? [...b.eu, ...b.es] : [];
        for (const s of texts) expect(hardNumbers(s), `${t.id}: ${s}`).toEqual([]);
      }
  });
  it('every example fills in both languages', () => {
    for (const t of TOPICS)
      for (const b of t.blocks)
        if (b.t === 'example')
          for (const lang of ['eu', 'es'] as const) {
            const out = fillTemplate(b[lang], chainFromJSON(b.chain), b.state ?? {}, lang);
            expect(out).not.toMatch(/\{\{/);
          }
  });
  it('the examples show the solver values (spot checks)', () => {
    const ex = TOPICS.find((t) => t.id === 'erlazioa')!.blocks.find((b) => b.t === 'example')!;
    if (ex.t !== 'example') throw new Error();
    expect(fillTemplate(ex.eu, chainFromJSON(ex.chain), {}, 'eu')).toContain('= 720 rpm');
    const pw = TOPICS.find((t) => t.id === 'potentzia')!.blocks.find((b) => b.t === 'example')!;
    if (pw.t !== 'example') throw new Error();
    expect(fillTemplate(pw.eu, chainFromJSON(pw.chain), {}, 'eu')).toContain('T = 32,83 N·m'); // KG10
  });
});

describe('formula checks against the solver (1000 cases each)', () => {
  const used = new Set(TOPICS.flatMap((t) => t.blocks.flatMap((b) => (b.t === 'f' && b.check ? [b.check] : []))));
  it('every formula check used in the texts exists', () => {
    for (const id of used) expect(CHECKS).toHaveProperty(id);
  });
  it.each(Object.keys(CHECKS) as FormulaId[])('%s', (id) => {
    CHECKS[id]();
  });
});
