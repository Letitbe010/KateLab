/**
 * Formula modules (geometry, units, change gears) with hand-computed values, and
 * the hand-solved examples of the user's own notes 03_BLOKEA_KateZinematikoak.md
 * (extra ground truth, kept apart from the spec goldens).
 */
import fc from 'fast-check';
import { checkSimple, compoundTrains, mountingOk, requiredRatio, simpleTrains } from '../src/core/changeGears';
import { globalChecks } from '../src/core/checks';
import { centerDistance, gearGeometry, pitchDiameter } from '../src/core/geometry';
import { type ChainJSON, chainFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { feedPerRevA, solveStateA } from '../src/core/solverPath';
import { mPerSToMmPerMin, mmPerMinToMPerS, mmToM, radPerSToRpm, rpmToRadPerS, wToKw } from '../src/core/units';

const S = R.toString;
const P = R.prToString;

describe('geometry (m = 2, Z = 20 by hand)', () => {
  it('d, d_a, d_f, h, p', () => {
    const g = gearGeometry(R.q(2), 20);
    expect([S(g.d), S(g.da), S(g.df), S(g.h), P(g.p)]).toEqual(['40', '44', '35', '9/2', '2·π']);
  });
  it('centre distance, external and internal', () => {
    expect(S(centerDistance(R.q(2), 20, 60))).toBe('80');
    expect(S(centerDistance(R.q(2), 20, 60, true))).toBe('40');
    expect(S(centerDistance(R.parse('2,5'), 20, 50))).toBe('175/2'); // notes 3.3: 87,5 mm
  });
  it('formula d = m·Z matches the rack solver: v = π·d·n (1000 random cases)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 12, max: 120 }), fc.constantFrom('1', '5/4', '2', '5/2', '3', '4'), fc.integer({ min: 1, max: 3000 }), (z, m, n) => {
        const j: ChainJSON = {
          shafts: [{ id: 'P', label: 'P' }],
          linear: [{ id: 'R', label: 'R' }],
          elements: [{ kind: 'rack', id: 'r', from: 'P', output: 'R', z, module: m }],
          input: { shaft: 'P', n },
        };
        const sol = solveStateA(chainFromJSON(j), {});
        if (!sol.ok) throw new Error(sol.error);
        const d = pitchDiameter(R.parse(m), z);
        expect(P(sol.linear.R!.v)).toBe(P(R.pr(R.mul(d, R.q(n)), 1)));
      }),
      { numRuns: 1000 },
    );
  });
});

describe('units', () => {
  it('rpm ↔ rad/s, mm/min ↔ m/s, mm → m, W → kW (exact round trips)', () => {
    expect(P(rpmToRadPerS(R.q(320)))).toBe('32/3·π');
    expect(P(radPerSToRpm(rpmToRadPerS(R.q(320))))).toBe('320');
    expect(P(mmPerMinToMPerS(R.pr(R.q(7200), 1)))).toBe('3/25·π');
    expect(P(mPerSToMmPerMin(R.pr(R.q(3, 25), 1)))).toBe('7200·π');
    expect(P(mmToM(R.pr(R.q(60))))).toBe('3/50');
    expect(S(wToKw(R.q(1100)))).toBe('11/10');
  });
});

describe('change gears', () => {
  const set = [20, 25, 30, 40, 50, 60, 60];
  it('simple trains and set limits', () => {
    const i = R.q(1, 3);
    expect(simpleTrains(i, set)).toEqual([{ za: 20, zb: 60 }]);
    expect(checkSimple(i, set, { za: 20, zb: 60 }).valid).toBe(true);
    expect(checkSimple(i, set, { za: 10, zb: 30 }).reasons).toContain('gear-not-in-set');
  });
  it('a gear present twice in the set may be used twice, a single one only once', () => {
    expect(compoundTrains(R.q(1, 6), set)).toContainEqual({ za: 30, zb: 60, zc: 20, zd: 60 }); // 60 twice in the set
    expect(compoundTrains(R.q(1, 9), set)).not.toContainEqual({ za: 20, zb: 60, zc: 20, zd: 60 }); // 20 only once
  });
  it('mounting condition (C = 15, to be confirmed)', () => {
    expect(mountingOk({ za: 20, zb: 40, zc: 30, zd: 60 })).toBe(true); // 60 > 45 and 90 > 55
    expect(mountingOk({ za: 20, zb: 25, zc: 40, zd: 60 })).toBe(false); // 45 > 55 fails
  });
  it('notes 3.6: lead screw 6 mm, M2 thread → i = 1/3', () => {
    expect(S(requiredRatio(R.q(2), R.q(6)))).toBe('1/3');
  });
});

describe("user's notes 03_BLOKEA (hand-solved examples)", () => {
  it('3.1: 1440 rpm, 20/60 and 24/48 → 240 rpm', () => {
    const j: ChainJSON = {
      shafts: [{ id: 'M', label: 'M' }, { id: 'X', label: 'X' }, { id: 'SP', label: 'SP' }],
      elements: [
        { kind: 'gear', id: 'a', from: 'M', to: 'X', z1: 20, z2: 60 },
        { kind: 'gear', id: 'b', from: 'X', to: 'SP', z1: 24, z2: 48 },
      ],
      input: { shaft: 'M', n: 1440 },
    };
    for (const solve of [solveStateA, solveStateB]) {
      const s = solve(chainFromJSON(j), {});
      if (!s.ok) throw new Error(s.error);
      expect(S(s.shafts.SP!.n)).toBe('240');
    }
  });
  it('3.2: P = 6 mm, i = 1/40, n = 600 rpm → 0,15 mm/bira and 90 mm/min', () => {
    const j: ChainJSON = {
      shafts: [{ id: 'SP', label: 'SP' }, { id: 'X', label: 'X' }, { id: 'LS', label: 'LS' }],
      linear: [{ id: 'C', label: 'carriage' }],
      elements: [
        { kind: 'gear', id: 'a', from: 'SP', to: 'X', z1: 20, z2: 80 },
        { kind: 'gear', id: 'b', from: 'X', to: 'LS', z1: 20, z2: 200 },
        { kind: 'screw', id: 's', from: 'LS', output: 'C', pitch: 6, starts: 1 },
      ],
      input: { shaft: 'SP', n: 600 },
    };
    const c = chainFromJSON(j);
    const s = solveStateA(c, {});
    if (!s.ok) throw new Error(s.error);
    expect(P(feedPerRevA(s, 'C', 'SP'))).toBe('3/20');
    expect(P(s.linear.C!.v)).toBe('90');
    expect(globalChecks(c, R.q(2))).toEqual([]);
  });
  it('3.3 exercise 3: m = 3, Z 24/72 → d 72 and 216, a 144', () => {
    expect(S(pitchDiameter(R.q(3), 24))).toBe('72');
    expect(S(pitchDiameter(R.q(3), 72))).toBe('216');
    expect(S(centerDistance(R.q(3), 24, 72))).toBe('144');
  });
});

describe('global power check', () => {
  it('accepts a chain with efficiencies and flags none', () => {
    const j: ChainJSON = {
      shafts: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      elements: [{ kind: 'gear', id: 'g', from: 'A', to: 'B', z1: 20, z2: 60 }],
      input: { shaft: 'A', n: 1500, power: '2200' },
      efficiency: { g: '0,95' },
    };
    expect(globalChecks(chainFromJSON(j), R.q(3))).toEqual([]);
  });
});
