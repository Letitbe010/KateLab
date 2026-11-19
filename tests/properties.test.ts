/**
 * Property-based tests (spec §11.1) on 10 000 random chains.
 */
import fc from 'fast-check';
import { chainArb } from './arbitraries';
import { compareSolutions, linearityHolds, powerProblem } from '../src/core/checks';
import { clusterCenterDistance } from '../src/core/geometry';
import { type ChainJSON, type ElementJSON, allStates, chainFromJSON } from '../src/core/model';
import { powerAt } from '../src/core/power';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { topology, validateChain } from '../src/core/validate';

const RUNS = 10_000;
const opts = { numRuns: RUNS };

describe('properties on random chains', () => {
  it('generated chains are structurally valid', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true, consistentLoops: true }), (j) => {
        expect(validateChain(chainFromJSON(j)).errors).toEqual([]);
      }),
      { numRuns: 2000 },
    );
  });

  it('A = B on every state (tree chains, clusters, consistent loops)', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true, consistentLoops: true }), (j) => {
        const c = chainFromJSON(j);
        for (const st of allStates(c)) {
          const a = solveStateA(c, st);
          const b = solveStateB(c, st);
          expect(compareSolutions(a, b)).toBeNull();
          expect(a.ok).toBe(true);
        }
      }),
      opts,
    );
  });

  it('A = B also when a random extra edge closes a loop (both accept or both reject)', () => {
    fc.assert(
      fc.property(chainArb({ loops: true }), (j) => {
        const c = chainFromJSON(j);
        for (const st of allStates(c)) expect(compareSolutions(solveStateA(c, st), solveStateB(c, st))).toBeNull();
      }),
      opts,
    );
  });

  it('linearity: n_in × k → every output × k', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true }), fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 9 }), (j, kn, kd) => {
        const c = chainFromJSON(j);
        for (const st of allStates(c)) expect(linearityHolds(c, st, R.q(kn, kd))).toBe(true);
      }),
      opts,
    );
  });

  it('reversing one stage inverts that stage ratio', () => {
    fc.assert(
      fc.property(chainArb(), fc.nat(), (j, pick) => {
        const rot = j.elements.filter((e) => e.kind === 'gear' || e.kind === 'chain' || e.kind === 'bevel');
        fc.pre(rot.length > 0);
        const e = rot[pick % rot.length] as Extract<ElementJSON, { z1: number }>;
        fc.pre(!(e.kind === 'gear' && e.internal));
        const swapped: ChainJSON = { ...j, elements: j.elements.map((x) => (x.id === e.id ? ({ ...e, z1: e.z2, z2: e.z1 } as ElementJSON) : x)) };
        for (const solve of [solveStateA, solveStateB]) {
          const a = solve(chainFromJSON(j), {});
          const b = solve(chainFromJSON(swapped), {});
          if (!a.ok || !b.ok) throw new Error('unsolved');
          const ia = R.div(a.shafts[e.to]!.n, a.shafts[e.from]!.n);
          const ib = R.div(b.shafts[e.to]!.n, b.shafts[e.from]!.n);
          expect(R.toString(ib)).toBe(R.toString(R.inv(ia)));
        }
      }),
      opts,
    );
  });

  it('inserting an idler keeps |n| downstream and flips the direction', () => {
    fc.assert(
      fc.property(chainArb(), fc.nat(), fc.integer({ min: 15, max: 80 }), (j, pick, zi) => {
        const ext = j.elements.filter((e) => e.kind === 'gear' && !e.internal) as Extract<ElementJSON, { kind: 'gear' }>[];
        fc.pre(ext.length > 0);
        const e = ext[pick % ext.length] as Extract<ElementJSON, { kind: 'gear' }>;
        const withIdler: ChainJSON = {
          ...j,
          shafts: [...j.shafts, { id: 'IDL', label: 'idler' }],
          elements: [
            ...j.elements.filter((x) => x.id !== e.id),
            { kind: 'gear', id: `${e.id}_a`, from: e.from, to: 'IDL', z1: e.z1, z2: zi },
            { kind: 'gear', id: `${e.id}_b`, from: 'IDL', to: e.to, z1: zi, z2: e.z2 },
          ],
        };
        for (const solve of [solveStateA, solveStateB]) {
          const a = solve(chainFromJSON(j), {});
          const b = solve(chainFromJSON(withIdler), {});
          if (!a.ok || !b.ok) throw new Error('unsolved');
          // the shaft on the far side of the gear from the input
          const da = a.shafts[e.to]!;
          const db = b.shafts[e.to]!;
          const fa = a.shafts[e.from]!;
          const fb = b.shafts[e.from]!;
          expect(R.eq(da.n, db.n) && R.eq(fa.n, fb.n)).toBe(true);
          if (da.dir !== null) {
            // exactly one side of the gear sees a flip relative to before
            const flippedTo = db.dir === -da.dir;
            const flippedFrom = fb.dir === -(fa.dir as number);
            expect(flippedTo !== flippedFrom).toBe(true);
          }
        }
      }),
      opts,
    );
  });

  it('sliding clusters: centre distance is the same for every option', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true }), (j) => {
        const c = chainFromJSON(j);
        for (const k of c.clusters) {
          const a = clusterCenterDistance(c, k.id);
          expect(a).not.toBeNull();
        }
        // breaking one option's tooth sum must be rejected
        if (c.clusters.length) {
          const id = (c.clusters[0] as { options: string[] }).options[0];
          const broken: ChainJSON = { ...j, elements: j.elements.map((e) => (e.id === id && e.kind === 'gear' ? { ...e, z2: e.z2 + 1 } : e)) };
          expect(validateChain(chainFromJSON(broken)).errors.map((x) => x.code)).toContain('cluster.centre');
        }
      }),
      opts,
    );
  });

  it('power never increases along the chain; with η = 1, T·n is constant', () => {
    fc.assert(
      fc.property(chainArb({ efficiencies: true, power: true }), (j) => {
        const c = chainFromJSON(j);
        const sol = solveStateA(c, {});
        if (!sol.ok) throw new Error(sol.error);
        const Pin = c.input.power!;
        for (const s of Object.keys(sol.shafts)) {
          const p = powerAt(c, {}, sol, s);
          expect(R.gt(p.P, Pin)).toBe(false);
        }
        const ideal = chainFromJSON({ ...j, efficiency: {} } as ChainJSON);
        delete ideal.efficiency;
        const solI = solveStateA(ideal, {});
        if (!solI.ok) throw new Error(solI.error);
        const ref = R.mul(Pin, R.q(30)); // T·n = 30·P/π
        for (const [s, v] of Object.entries(solI.shafts)) {
          const p = powerAt(ideal, {}, solI, s);
          expect(R.prToString(R.prMul(p.T, R.pr(v.n)))).toBe(R.prToString(R.pr(ref, -1)));
        }
        expect(powerProblem(c, {}, sol)).toBeNull();
      }),
      opts,
    );
  });

  it('validate.topology agrees with both solvers on driven shafts and defined directions', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true, consistentLoops: true }), (j) => {
        const c = chainFromJSON(j);
        for (const st of allStates(c)) {
          const t = topology(c, st);
          for (const sol of [solveStateA(c, st), solveStateB(c, st)]) {
            if (!sol.ok) throw new Error(sol.error);
            expect([...t.reached].sort()).toEqual(Object.keys(sol.shafts).sort());
            const defined = Object.entries(sol.shafts).filter(([, v]) => v.dir !== null).map(([k]) => k);
            expect([...t.directionDefined].sort()).toEqual(defined.sort());
            expect([...t.reachedLinear].sort()).toEqual(Object.keys(sol.linear).sort());
          }
        }
      }),
      opts,
    );
  });
});
