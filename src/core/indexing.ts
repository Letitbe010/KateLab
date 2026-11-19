/**
 * Simple indexing with a dividing head (spec §3, §8.2).
 *   crank turns = K/N = whole turns + holes/circle
 * Several correct answers exist (one per suitable hole circle); answers are
 * checked against the constraint, never against a single stored solution.
 */
import { type Rational, add, div, eq, floor, q, sub } from './rational';

export interface IndexingAnswer {
  turns: number;
  holes: number;
  circle: number;
}
export interface IndexingSolution extends IndexingAnswer {
  plate: number; // index of the plate in the set (0-based)
}

export function indexingFraction(K: number, N: number): { exact: Rational; turns: number; fraction: Rational } {
  if (!Number.isSafeInteger(K) || !Number.isSafeInteger(N) || K <= 0 || N <= 0) throw new RangeError('K and N must be positive integers');
  const exact = q(K, N);
  const turns = Number(floor(exact));
  return { exact, turns, fraction: sub(exact, q(turns)) };
}

/** Every (circle, holes) on the given plates that gives exactly K/N. */
export function indexingSolutions(K: number, N: number, plates: number[][]): IndexingSolution[] {
  const { turns, fraction } = indexingFraction(K, N);
  const out: IndexingSolution[] = [];
  plates.forEach((plate, pi) => {
    for (const circle of plate) {
      // holes = fraction · circle must be an integer
      const h = fraction.n * BigInt(circle);
      if (h % fraction.d === 0n) out.push({ turns, holes: Number(h / fraction.d), circle, plate: pi });
    }
  });
  return out;
}

export interface IndexingCheck {
  valid: boolean;
  reasons: ('circle-not-on-plates' | 'value-mismatch' | 'holes-not-reduced' | 'bad-input')[];
}

export function checkIndexing(K: number, N: number, plates: number[][], a: IndexingAnswer): IndexingCheck {
  const reasons: IndexingCheck['reasons'] = [];
  if (![a.turns, a.holes, a.circle].every((x) => Number.isSafeInteger(x) && x >= 0) || a.circle === 0) {
    return { valid: false, reasons: ['bad-input'] };
  }
  if (!plates.some((p) => p.includes(a.circle))) reasons.push('circle-not-on-plates');
  const given = add(q(a.turns), div(q(a.holes), q(a.circle)));
  if (!eq(given, q(K, N))) reasons.push('value-mismatch');
  if (a.holes >= a.circle) reasons.push('holes-not-reduced');
  return { valid: reasons.length === 0, reasons };
}
