/** Regression: Euskadi OPE 2020 milling machine, values from the user's own animation. */
import fx from './fixtures/euskadi2020.json';
import { globalChecks } from '../src/core/checks';
import { clusterCenterDistance } from '../src/core/geometry';
import { type ChainJSON, allStates, chainFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { maxFeedPerRevA, solveStateA } from '../src/core/solverPath';
import { validateChain } from '../src/core/validate';

const chain = chainFromJSON(fx.chain as unknown as ChainJSON);
const E = fx.expect;

describe('Euskadi 2020 milling machine', () => {
  it('is structurally valid (tooth sums 70 / 64 / 60)', () => {
    expect(validateChain(chain).errors).toEqual([]);
  });
  it('passes every global check (A = B, linearity, centre distance) in all 18 states', () => {
    expect(allStates(chain)).toHaveLength(18);
    expect(globalChecks(chain, R.q(7, 3))).toEqual([]);
  });
  it('a) spindle speed', () => {
    for (const solve of [solveStateA, solveStateB]) {
      const sol = solve(chain, E.a.state);
      if (!sol.ok) throw new Error(sol.error);
      expect(R.toString(sol.shafts[E.a.shaft]!.n)).toBe(E.a.value);
      expect(R.toFixed(sol.shafts[E.a.shaft]!.n, 2)).toBe(E.a.approx);
    }
  });
  it('b) maximum table feed per spindle revolution (solver A, checked state by state with B)', () => {
    const r = maxFeedPerRevA(chain, E.b.output, E.b.spindle);
    expect(R.prToString(r.max)).toBe(E.b.max);
    expect(R.toFixed(r.max.coef, 3)).toBe(E.b.approx);
    expect(r.at).toEqual([E.b.argmax]);
    // independent recomputation with B
    let best: R.Rational | null = null;
    for (const st of allStates(chain)) {
      const s = solveStateB(chain, st);
      if (!s.ok) throw new Error(s.error);
      const f = R.div(s.linear[E.b.output]!.v.coef, s.shafts[E.b.spindle]!.n);
      if (!best || R.gt(f, best)) best = f;
    }
    expect(R.toString(best!)).toBe(E.b.max);
  });
  it('c) cross-slide feed per minute', () => {
    for (const solve of [solveStateA, solveStateB]) {
      const sol = solve(chain, E.c.state);
      if (!sol.ok) throw new Error(sol.error);
      expect(R.prToString(sol.linear[E.c.output]!.v)).toBe(E.c.value);
      expect(R.toFixed(sol.linear[E.c.output]!.v.coef, 2)).toBe(E.c.approx);
    }
  });
  it('d) centre distance II–III', () => {
    expect(R.toString(clusterCenterDistance(chain, E.d.cluster)!)).toBe(E.d.value);
  });
  it('directions are undefined past the worm and bevels, defined before', () => {
    const sol = solveStateA(chain, E.c.state);
    if (!sol.ok) throw new Error(sol.error);
    // signs relative to the motor, as in the user's animation (KZSGN)
    const want: Record<string, number> = { I: 1, II: -1, III: 1, IV: -1, P: -1, Q: -1 };
    for (const [s, d] of Object.entries(want)) expect(sol.shafts[s]!.dir).toBe(d);
    for (const s of ['VT', 'V', 'S1', 'VZ', 'S2']) expect(sol.shafts[s]!.dir).toBeNull();
  });
});
