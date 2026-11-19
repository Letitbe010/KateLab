/**
 * Golden cases KG1–KG10 (spec §11.2). Expected values live in tests/golden/golden.json
 * and are NEVER edited to match the implementation. Both solvers must reproduce them.
 */
import golden from './golden/golden.json';
import { checkCompound, compoundTrains, requiredRatio } from '../src/core/changeGears';
import { clusterCenterDistance, pitchDiameter } from '../src/core/geometry';
import { checkIndexing, indexingFraction, indexingSolutions } from '../src/core/indexing';
import { type ChainJSON, type StateSolution, allStates, chainFromJSON } from '../src/core/model';
import { powerAt } from '../src/core/power';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { mmPerMinToMPerS, rpmToRadPerS } from '../src/core/units';
import { validateChain } from '../src/core/validate';

type Case = (typeof golden.cases)[number] & Record<string, unknown>;
const cases = golden.cases as Case[];
const SOLVERS = { A: solveStateA, B: solveStateB } as const;
const dirOf = (s: string) => (s === 'same' ? 1 : s === 'opposite' ? -1 : null);
const approx = (x: number, decimals: number) => x.toFixed(decimals);

function ok(sol: StateSolution) {
  if (!sol.ok) throw new Error(sol.error);
  return sol;
}

describe.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
  const chain = c.chain ? chainFromJSON(c.chain as unknown as ChainJSON) : null;

  if (chain) {
    it('passes structural validation', () => {
      expect(validateChain(chain).errors).toEqual([]);
    });
  }

  const states = (c.states ?? []) as {
    state: Record<string, string>;
    speeds?: Record<string, string>;
    directions?: Record<string, string>;
    ratios?: { from: string; to: string; value: string }[];
    linear_mm_per_min?: Record<string, string>;
    linear_m_per_s?: Record<string, { exact: string; approx: string; decimals: number }>;
    feedPerRev?: { output: string; spindle: string; value: string }[];
  }[];

  for (const [name, solve] of Object.entries(SOLVERS)) {
    for (const st of states) {
      it(`solver ${name}: state ${JSON.stringify(st.state)}`, () => {
        const sol = ok(solve(chain!, st.state));
        for (const [s, v] of Object.entries(st.speeds ?? {})) expect(R.toString(sol.shafts[s]!.n)).toBe(R.toString(R.parse(v)));
        for (const [s, d] of Object.entries(st.directions ?? {})) expect(sol.shafts[s]!.dir).toBe(dirOf(d));
        for (const r of st.ratios ?? [])
          expect(R.toString(R.div(sol.shafts[r.to]!.n, sol.shafts[r.from]!.n))).toBe(R.toString(R.parse(r.value)));
        for (const [l, v] of Object.entries(st.linear_mm_per_min ?? {})) expect(R.prToString(sol.linear[l]!.v)).toBe(R.prToString(R.prParse(v)));
        for (const [l, v] of Object.entries(st.linear_m_per_s ?? {})) {
          const mps = mmPerMinToMPerS(sol.linear[l]!.v);
          expect(R.prToString(mps)).toBe(R.prToString(R.prParse(v.exact)));
          expect(approx(R.prToNumber(mps), v.decimals)).toBe(v.approx);
        }
        for (const f of st.feedPerRev ?? []) {
          const fr = R.prDiv(sol.linear[f.output]!.v, R.pr(sol.shafts[f.spindle]!.n));
          expect(R.prToString(fr)).toBe(R.prToString(R.prParse(f.value)));
        }
      });
    }

    const set = c.speedSet as { shaft: string; values: string[] } | undefined;
    if (set) {
      it(`solver ${name}: set of speeds of ${set.shaft}`, () => {
        const got = allStates(chain!).map((st) => R.toString(ok(solve(chain!, st)).shafts[set.shaft]!.n));
        expect([...new Set(got)].sort()).toEqual(set.values.map((v) => R.toString(R.parse(v))).sort());
        expect(got).toHaveLength(set.values.length);
      });
    }
  }

  const cd = c.centerDistance as { cluster: string; value: string } | undefined;
  if (cd) it('centre distance of the cluster', () => expect(R.toString(clusterCenterDistance(chain!, cd.cluster)!)).toBe(cd.value));

  const pd = c.pitchDiameter as { element: string; value: string } | undefined;
  if (pd)
    it('pitch diameter', () => {
      const e = chain!.elements.find((x) => x.id === pd.element);
      if (!e || e.kind !== 'rack') throw new Error('rack expected');
      expect(R.toString(pitchDiameter(e.module, e.z))).toBe(pd.value);
    });

  const ix = c.indexing as
    | { K: number; N: number; plates: number[][]; turns: string; fraction: string; valid: { turns: number; holes: number; circle: number }[]; invalid: { turns: number; holes: number; circle: number }[] }
    | undefined;
  if (ix) {
    it('indexing fraction', () => {
      const f = indexingFraction(ix.K, ix.N);
      expect(String(f.turns)).toBe(ix.turns);
      expect(R.toString(f.fraction)).toBe(ix.fraction);
    });
    it('every listed valid answer is accepted, every invalid one rejected', () => {
      for (const a of ix.valid) expect(checkIndexing(ix.K, ix.N, ix.plates, a).valid).toBe(true);
      for (const a of ix.invalid) expect(checkIndexing(ix.K, ix.N, ix.plates, a).valid).toBe(false);
    });
    it('the solution search returns exactly the circles that are multiples of 3, and each one is valid', () => {
      const sols = indexingSolutions(ix.K, ix.N, ix.plates);
      expect(sols.map((s) => s.circle).sort((a, b) => a - b)).toEqual(ix.plates.flat().filter((h) => h % 3 === 0).sort((a, b) => a - b));
      for (const s of sols) expect(checkIndexing(ix.K, ix.N, ix.plates, s).valid).toBe(true);
      for (const a of ix.valid) expect(sols).toContainEqual(expect.objectContaining(a));
    });
  }

  const cg = c.changeGears as { threadPitch: string; leadScrewPitch: string; ratio: string; gearSet: number[]; valid: { za: number; zb: number; zc: number; zd: number }[] } | undefined;
  if (cg) {
    const i = requiredRatio(R.parse(cg.threadPitch), R.parse(cg.leadScrewPitch));
    it('required ratio', () => expect(R.toString(i)).toBe(cg.ratio));
    it('listed solution is valid and found by the search; every found train is valid', () => {
      for (const t of cg.valid) expect(checkCompound(i, cg.gearSet, t).valid).toBe(true);
      const all = compoundTrains(i, cg.gearSet);
      for (const t of cg.valid) expect(all).toContainEqual(t);
      for (const t of all) expect(checkCompound(i, cg.gearSet, t).valid).toBe(true);
      expect(checkCompound(i, cg.gearSet, { za: 20, zb: 40, zc: 30, zd: 50 }).reasons).toContain('ratio-mismatch');
      expect(checkCompound(i, cg.gearSet, { za: 20, zb: 40, zc: 20, zd: 40 }).reasons).toContain('gear-reused');
    });
  }

  const pw = c.power as { shaft: string; omega_rad_s: { approx: string; decimals: number }; torque_Nm: { approx: string; decimals: number } } | undefined;
  if (pw) {
    it('angular speed and torque', () => {
      for (const solve of Object.values(SOLVERS)) {
        const sol = ok(solve(chain!, {}));
        const w = rpmToRadPerS(sol.shafts[pw.shaft]!.n);
        expect(approx(R.prToNumber(w), pw.omega_rad_s.decimals)).toBe(pw.omega_rad_s.approx);
        const p = powerAt(chain!, {}, sol, pw.shaft);
        expect(approx(R.prToNumber(p.T), pw.torque_Nm.decimals)).toBe(pw.torque_Nm.approx);
        // T·ω = P exactly
        expect(R.prToString(R.prMul(p.T, w))).toBe(R.toString(chain!.input.power!));
      }
    });
  }
});
