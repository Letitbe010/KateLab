/** Targeted solver cases: loops, locked trains, directions, disconnection. */
import fc from 'fast-check';
import { chainArb } from './arbitraries';
import { compareSolutions } from '../src/core/checks';
import { type ChainJSON, allStates, chainFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveLinearSystem, solveStateB } from '../src/core/solverLinear';
import { solveStateA, speedTableA } from '../src/core/solverPath';

const sh = (...ids: string[]) => ids.map((id) => ({ id, label: id }));
const both = (j: ChainJSON) => {
  const c = chainFromJSON(j);
  return [solveStateA(c, {}), solveStateB(c, {})] as const;
};

describe('loops', () => {
  it('three external gears in a triangle are locked (direction conflict)', () => {
    const j: ChainJSON = {
      shafts: sh('A', 'B', 'C'),
      elements: [
        { kind: 'gear', id: 'ab', from: 'A', to: 'B', z1: 20, z2: 20 },
        { kind: 'gear', id: 'bc', from: 'B', to: 'C', z1: 20, z2: 20 },
        { kind: 'gear', id: 'ca', from: 'C', to: 'A', z1: 20, z2: 20 },
      ],
      input: { shaft: 'A', n: 100 },
    };
    const [a, b] = both(j);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });
  it('the same triangle behind a worm is still detected as locked', () => {
    const j: ChainJSON = {
      shafts: sh('W', 'A', 'B', 'C'),
      elements: [
        { kind: 'worm', id: 'w', from: 'W', to: 'A', starts: 1, z: 40 },
        { kind: 'gear', id: 'ab', from: 'A', to: 'B', z1: 20, z2: 20 },
        { kind: 'gear', id: 'bc', from: 'B', to: 'C', z1: 20, z2: 20 },
        { kind: 'gear', id: 'ca', from: 'C', to: 'A', z1: 20, z2: 20 },
      ],
      input: { shaft: 'W', n: 100 },
    };
    const [a, b] = both(j);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
  });
  it('a magnitude conflict is locked; a consistent parallel path is accepted', () => {
    const bad: ChainJSON = {
      shafts: sh('A', 'B'),
      elements: [
        { kind: 'gear', id: 'g1', from: 'A', to: 'B', z1: 20, z2: 40 },
        { kind: 'gear', id: 'g2', from: 'A', to: 'B', z1: 30, z2: 50 },
      ],
      input: { shaft: 'A', n: 100 },
    };
    expect(both(bad).map((s) => s.ok)).toEqual([false, false]);
    // same ratio but gear (flips) vs chain (keeps): directions conflict → locked
    const mixed: ChainJSON = { ...bad, elements: [bad.elements[0]!, { kind: 'chain', id: 'c', from: 'A', to: 'B', z1: 10, z2: 20 }] };
    expect(both(mixed).map((s) => s.ok)).toEqual([false, false]);
    const good: ChainJSON = { ...bad, elements: [bad.elements[0]!, { kind: 'gear', id: 'g3', from: 'A', to: 'B', z1: 30, z2: 60 }] };
    const [a, b] = both(good);
    expect(compareSolutions(a, b)).toBeNull();
    expect(a.ok).toBe(true);
  });
});

describe('directions', () => {
  it('external flips, internal keeps, crossed belt flips, open belt and chain keep', () => {
    const j: ChainJSON = {
      shafts: sh('A', 'B', 'C', 'D', 'E', 'F'),
      elements: [
        { kind: 'gear', id: 'ext', from: 'A', to: 'B', z1: 20, z2: 40 },
        { kind: 'gear', id: 'int', from: 'B', to: 'C', z1: 20, z2: 60, internal: true },
        { kind: 'belt', id: 'x', from: 'C', to: 'D', d1: 100, d2: 100, crossed: true },
        { kind: 'belt', id: 'o', from: 'D', to: 'E', d1: 100, d2: 200 },
        { kind: 'chain', id: 'k', from: 'E', to: 'F', z1: 15, z2: 30 },
      ],
      input: { shaft: 'A', n: 1200 },
    };
    for (const s of both(j)) {
      if (!s.ok) throw new Error(s.error);
      expect(['B', 'C', 'D', 'E', 'F'].map((x) => s.shafts[x]!.dir)).toEqual([-1, -1, 1, 1, 1]);
      expect(R.toString(s.shafts.F!.n)).toBe('50'); // 1200 · 20/40 · 20/60 · 100/100 · 100/200 · 15/30
    }
  });
  it('belt slip reduces the driven speed', () => {
    const j: ChainJSON = {
      shafts: sh('A', 'B'),
      elements: [{ kind: 'belt', id: 'u', from: 'A', to: 'B', d1: 100, d2: 200, slip: '2/100' }],
      input: { shaft: 'A', n: 1000 },
    };
    for (const s of both(j)) {
      if (!s.ok) throw new Error(s.error);
      expect(R.toString(s.shafts.B!.n)).toBe('490');
    }
  });
  it('a chain driven "backwards" (input on the to-side) gives the inverse ratio', () => {
    const j: ChainJSON = {
      shafts: sh('A', 'B'),
      elements: [{ kind: 'gear', id: 'g', from: 'A', to: 'B', z1: 20, z2: 60 }],
      input: { shaft: 'B', n: 100 },
    };
    for (const s of both(j)) {
      if (!s.ok) throw new Error(s.error);
      expect(R.toString(s.shafts.A!.n)).toBe('300');
    }
  });
  it('disconnected shafts are reported as not driven by both solvers', () => {
    const j: ChainJSON = {
      shafts: sh('A', 'B', 'Z'),
      elements: [{ kind: 'gear', id: 'g', from: 'A', to: 'B', z1: 20, z2: 60 }],
      input: { shaft: 'A', n: 100 },
    };
    for (const s of both(j)) {
      if (!s.ok) throw new Error(s.error);
      expect(s.shafts.Z).toBeUndefined();
    }
  });
});

describe('speed table (KG3-like box)', () => {
  it('lists every combination, distinct speeds, max and min', () => {
    const j: ChainJSON = {
      shafts: sh('I', 'II', 'III'),
      elements: [
        { kind: 'gear', id: 'a1', from: 'I', to: 'II', z1: 20, z2: 40 },
        { kind: 'gear', id: 'a2', from: 'I', to: 'II', z1: 30, z2: 30 },
        { kind: 'gear', id: 'b1', from: 'II', to: 'III', z1: 25, z2: 50 },
        { kind: 'gear', id: 'b2', from: 'II', to: 'III', z1: 50, z2: 25 },
      ],
      clusters: [
        { id: 'A', label: 'A', options: ['a1', 'a2'] },
        { id: 'B', label: 'B', options: ['b1', 'b2'] },
      ],
      input: { shaft: 'I', n: 1000 },
    };
    const t = speedTableA(chainFromJSON(j), 'III');
    expect(t.total).toBe(4);
    expect(t.distinct.map(R.toString)).toEqual(['250', '500', '1000', '2000']);
    expect(t.max[0]!.state).toEqual({ A: 'a2', B: 'b2' });
    expect(t.min[0]!.state).toEqual({ A: 'a1', B: 'b1' });
  });
});

describe('Gauss–Jordan', () => {
  it('detects inconsistency and free variables', () => {
    const r = (...xs: number[]) => xs.map((x) => R.q(x));
    expect(solveLinearSystem([r(1, 1), r(1, 1)], r(1, 2), 2).status).toBe('inconsistent');
    const s = solveLinearSystem([r(1, 0, 0), r(0, 1, -1)], r(5, 0), 3);
    if (s.status !== 'ok') throw new Error();
    expect(s.x[0] && R.toString(s.x[0])).toBe('5');
    expect(s.x[1]).toBeNull();
    expect(s.x[2]).toBeNull();
  });
});

describe('the random loop generator is not vacuous', () => {
  it('produces both accepted and rejected loop chains, and A = B on all of them', () => {
    let accepted = 0;
    let rejected = 0;
    fc.assert(
      fc.property(chainArb({ loops: true }), (j) => {
        const c = chainFromJSON(j);
        for (const st of allStates(c)) {
          const a = solveStateA(c, st);
          expect(compareSolutions(a, solveStateB(c, st))).toBeNull();
          if (a.ok) accepted++;
          else rejected++;
        }
      }),
      { numRuns: 2000 },
    );
    expect(accepted).toBeGreaterThan(100);
    expect(rejected).toBeGreaterThan(100);
  });
});
