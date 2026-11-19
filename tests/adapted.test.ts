/**
 * Adapted external exercises (spec §9.2–9.3).
 * 1. The ORIGINAL data of each source are re-solved with solvers A and B and compared
 *    with the published solution (sources are never taken as truth).
 * 2. The adapted pool exercises are valid, both solvers agree, and the hand-computed
 *    results hold.
 */
import { compareSolutions } from '../src/core/checks';
import { expectedValues, gradeAsk } from '../src/core/grader';
import { type ChainJSON, chainFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { validateExercise } from '../src/core/validate';
import { poolById } from '../src/data/pool';
import adapted from '../src/data/pool/adapted.json';

const shafts = (ids: string[]) => ids.map((id) => ({ id, label: id }));

/** Solve a chain with both solvers, require agreement, return the speed of a shaft. */
function speed(j: ChainJSON, shaft: string): string {
  const c = chainFromJSON(j);
  const a = solveStateA(c, {});
  const b = solveStateB(c, {});
  expect(compareSolutions(a, b)).toBeNull();
  if (!a.ok) throw new Error('chain not solvable');
  return R.toString(a.shafts[shaft]!.n);
}

describe('original data of the external sources vs published solutions', () => {
  const andalucia = (input: { shaft: string; n: string }): ChainJSON => ({
    shafts: shafts(['I', 'II', 'III', 'IV']),
    elements: [
      { kind: 'gear', id: 'a', from: 'I', to: 'II', z1: 20, z2: 40 },
      { kind: 'gear', id: 'b', from: 'II', to: 'III', z1: 20, z2: 40 },
      { kind: 'gear', id: 'c', from: 'III', to: 'IV', z1: 20, z2: 40 },
    ],
    input,
  });
  it('Andalucía 2020: 240 rpm in → 30 rpm out; 45 rpm out ← 360 rpm in', () => {
    expect(speed(andalucia({ shaft: 'I', n: '240' }), 'IV')).toBe('30');
    expect(speed(andalucia({ shaft: 'IV', n: '45' }), 'I')).toBe('360');
  });
  const pair = (z1: number, z2: number, n: string, worm = false): ChainJSON => ({
    shafts: shafts(['I', 'II']),
    elements: [worm ? { kind: 'worm', id: 'w', from: 'I', to: 'II', starts: z1, z: z2 } : { kind: 'gear', id: 'g', from: 'I', to: 'II', z1, z2 }],
    input: { shaft: 'I', n },
  });
  it('Xunta 1: worm 2 starts / 40 teeth, wheel at 3000 rpm ⇐ worm at 60 000 rpm', () => {
    // solved forward (a worm driven from the wheel side is invalid in KateLab)
    expect(speed(pair(2, 40, '60000', true), 'II')).toBe('3000');
  });
  it('Xunta 2 and 4: 14/56 and 16/64 at 4000 rpm → 1000 rpm', () => {
    expect(speed(pair(14, 56, '4000'), 'II')).toBe('1000');
    expect(speed(pair(16, 64, '4000'), 'II')).toBe('1000');
  });
  it('Xunta 3: 250/50, driven at 1000 rpm ⇐ driver at 200 rpm', () => {
    expect(speed(pair(250, 50, '200'), 'II')).toBe('1000');
  });
});

describe('adapted pool exercises', () => {
  const ids = adapted.exercises.map((e) => e.id);
  it.each(ids)('%s is in the pool, valid, solvers agree, and has a source', (id) => {
    const ex = poolById(id)!;
    expect(ex).toBeDefined();
    expect(ex.origin).toBe('adapted');
    expect(ex.sourceUrl).toMatch(/^https:\/\//);
    expect(validateExercise(ex).errors).toEqual([]);
    expect(compareSolutions(solveStateA(ex.chain, {}), solveStateB(ex.chain, {}))).toBeNull();
  });
  const results: Record<string, string[]> = {
    // i = 18/54 · 20/50 · 24/48 = 1/15; 1500/15 = 100; three external meshes → ccw
    'kanpo-andaluzia-2020': ['1/15', '100', 'ccw'],
    'kanpo-xunta-parea': ['1/4', '700', 'ccw'],
    'kanpo-xunta-biderkatzailea': ['4', '1200'],
    'kanpo-xunta-torlojua': ['1/25', '60'],
  };
  it.each(Object.entries(results))('%s: hand-computed results', (id, want) => {
    const ex = poolById(id)!;
    const got = ex.asks.map((q) => {
      if (q.type !== 'direction') return R.prToString(expectedValues(ex, q)[0]!.value);
      // direction: the grader accepts exactly one of cw / ccw
      const ok = ['cw', 'ccw'].filter((d) => gradeAsk(ex, q, { value: d }).status === 'correct');
      expect(ok).toHaveLength(1);
      return ok[0]!;
    });
    expect(got).toEqual(want);
  });
});
