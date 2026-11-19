import fc from 'fast-check';
import { chainArb } from './arbitraries';
import fresa from './fixtures/euskadi2020.json';
import { autoLayout, checkLayout, roman, shaftOrder } from '../src/core/layout';
import { type ChainJSON, chainFromJSON, isRotary } from '../src/core/model';

const fresaChain = chainFromJSON(fresa.chain as unknown as ChainJSON);

describe('autoLayout', () => {
  it('orders shafts depth-first from the input, smaller branch first', () => {
    expect(shaftOrder(fresaChain)).toEqual(['M', 'I', 'II', 'III', 'IV', 'P', 'Q', 'VT', 'V', 'S1', 'VZ', 'S2']);
  });
  it('random chains: distinct shaft rows, one column per element, clusters contiguous, gears touch', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true, consistentLoops: true }), (j) => {
        const c = chainFromJSON(j);
        const L = autoLayout(c);
        const ys = Object.values(L.shafts).map((s) => s.c);
        expect(new Set(ys).size).toBe(c.shafts.length);
        // every element placed, inside the drawing
        for (const e of c.elements) {
          const p = L.elements[e.id];
          expect(p).toBeDefined();
          expect(p!.at).toBeGreaterThan(0);
          expect(p!.at).toBeLessThan(L.width);
        }
        // columns strictly increasing in drawing order, except duplicates of the same pair (loops) never share x with others
        const xs = c.elements.map((e) => L.elements[e.id]!.at);
        expect(new Set(xs).size).toBe(xs.length);
        // cluster options in adjacent columns
        for (const k of c.clusters) {
          const cx = k.options.map((o) => L.elements[o]!.at).sort((a, b) => a - b);
          for (let i = 1; i < cx.length; i++) expect(cx[i]! - cx[i - 1]!).toBeLessThanOrEqual(30);
        }
        // external spur gears: drawn radii fill exactly the gap between the two shafts
        for (const e of c.elements) {
          if (!isRotary(e) || e.kind !== 'gear' || e.internal) continue;
          const p = L.elements[e.id]!;
          const gap = Math.abs(L.shafts[e.to]!.c - L.shafts[e.from]!.c);
          if (p.r1 > 9.0001 && p.r2 > 9.0001) expect(p.r1 + p.r2).toBeCloseTo(gap, 6);
        }
      }),
      { numRuns: 1000 },
    );
  });
  it('the hand-made milling-machine layout is complete and consistent', () => {
    expect(fresaChain.layout).toBeDefined();
    expect(checkLayout(fresaChain, fresaChain.layout!)).toEqual([]);
    // gearbox pairs touch: r1 + r2 = distance between the shafts
    for (const id of ['A0', 'A1', 'A2', 'B0', 'B1', 'C0', 'C1', 'C2', 'g2021']) {
      const e = fresaChain.elements.find((x) => x.id === id)!;
      if (!isRotary(e)) throw new Error();
      const p = fresaChain.layout!.elements[id]!;
      expect(p.r1 + p.r2).toBeCloseTo(Math.abs(fresaChain.layout!.shafts[e.to]!.c - fresaChain.layout!.shafts[e.from]!.c), 6);
    }
  });
  it('automatic layouts always pass checkLayout', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true }), (j) => {
        const c = chainFromJSON(j);
        expect(checkLayout(c, autoLayout(c))).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });
  it('roman numerals', () => {
    expect([1, 2, 3, 4, 5, 9, 12, 14].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'V', 'IX', 'XII', 'XIV']);
  });
});
