/**
 * Madrid OPE 2025, 0590-112, exercise 7 (press feed, pinion and rack with rack pitch).
 * Expected values computed by hand (to be confirmed by the user):
 *   n5 = 320 · 48/60 · 36/56 = 1152/7 ≈ 164,57 rpm
 *   m5 = p/π = 4/π  →  d5 = m·Z = 56/π ≈ 17,83 mm
 *   v  = π·d·n = p·Z·n = 4 · 14 · 1152/7 = 9216 mm/min = 0,1536 m/s
 */
import fc from 'fast-check';
import { compareSolutions } from '../src/core/checks';
import { expectedValues, gradeAsk } from '../src/core/grader';
import { chainFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { mmPerMinToMPerS } from '../src/core/units';
import { validateExercise } from '../src/core/validate';
import { poolById } from '../src/data/pool';

const ex = poolById('ope-madrid-2025-7')!;

describe('Madrid 2025, exercise 7', () => {
  it('is valid and both solvers agree', () => {
    expect(validateExercise(ex).errors).toEqual([]);
    expect(compareSolutions(solveStateA(ex.chain, {}), solveStateB(ex.chain, {}))).toBeNull();
  });
  it('the chain reproduces the diameters of the statement (Dp = m·Z)', () => {
    const g12 = ex.chain.elements.find((e) => e.id === 'g12')!;
    const g34 = ex.chain.elements.find((e) => e.id === 'g34')!;
    if (g12.kind !== 'gear' || g34.kind !== 'gear') throw new Error();
    expect([R.toString(R.mul(g12.module!, R.q(g12.z1))), R.toString(R.mul(g12.module!, R.q(g12.z2)))]).toEqual(['48', '60']);
    expect([R.toString(R.mul(g34.module!, R.q(g34.z1))), R.toString(R.mul(g34.module!, R.q(g34.z2)))]).toEqual(['36', '56']);
  });
  it('hand-computed results', () => {
    const [a, d, v] = ex.asks.map((q) => expectedValues(ex, q)[0]!.value);
    expect(R.prToString(a!)).toBe('1152/7');
    expect(R.prToString(d!)).toBe('56·π^-1');
    expect(R.prToString(v!)).toBe('9216');
    expect(R.prToString(mmPerMinToMPerS(v!))).toBe('96/625'); // 0,1536 m/s
  });
  it('grading: right answers, and the "pitch read as module" mistake is diagnosed', () => {
    expect(gradeAsk(ex, ex.asks[0]!, { value: '164,57' }).status).toBe('correct');
    expect(gradeAsk(ex, ex.asks[1]!, { value: '17,83' }).status).toBe('correct');
    expect(gradeAsk(ex, ex.asks[2]!, { value: '0,1536', unit: 'm/s' }).status).toBe('correct');
    expect(gradeAsk(ex, ex.asks[1]!, { value: '56' }).diagnoses.map((x) => x.code)).toContain('pitch-as-module');
    expect(gradeAsk(ex, ex.asks[2]!, { value: '0,4825', unit: 'm/s' }).diagnoses.map((x) => x.code)).toContain('pitch-as-module');
  });
});

describe('rack given by its pitch (property)', () => {
  it('v = p·Z·n with p = π·m: pitch and module descriptions give the same speed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 12, max: 60 }), fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 3000 }), (z, mTimes10, n) => {
        const m = R.q(mTimes10, 10);
        const byModule = chainFromJSON({ shafts: [{ id: 'P', label: 'P' }], linear: [{ id: 'R', label: 'R' }], elements: [{ kind: 'rack', id: 'r', from: 'P', output: 'R', z, module: R.toString(m) }], input: { shaft: 'P', n } });
        const sA = solveStateA(byModule, {});
        if (!sA.ok) throw new Error();
        // the equivalent pitch is π·m: compare v/π for the module rack with v for a pitch rack of p = m (numerically)
        const byPitch = chainFromJSON({ shafts: [{ id: 'P', label: 'P' }], linear: [{ id: 'R', label: 'R' }], elements: [{ kind: 'rack', id: 'r', from: 'P', output: 'R', z, pitch: R.toString(m) }], input: { shaft: 'P', n } });
        const sP = solveStateA(byPitch, {});
        const sPB = solveStateB(byPitch, {});
        if (!sP.ok) throw new Error();
        expect(compareSolutions(sP, sPB)).toBeNull();
        expect(R.prToString(R.prDiv(sA.linear.R!.v, R.pr(R.ONE, 1)))).toBe(R.prToString(sP.linear.R!.v));
      }),
      { numRuns: 1000 },
    );
  });
});
