/** Deterministic pseudo-random numbers (mulberry32), so that a seed always gives the same exercise. */
export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(xs: readonly T[]): T[];
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (xs) => {
      if (!xs.length) throw new Error('pick from empty list');
      return xs[Math.floor(next() * xs.length)] as (typeof xs)[number];
    },
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
  };
  return r;
}

/** murmur3 32-bit finaliser (a bijection on 32-bit integers). */
function fmix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Mix a seed and an attempt counter into a new 32-bit seed. Each input goes through
 * the finaliser before combining, so different (seed, attempt) pairs do not share
 * a random stream (a plain XOR did: 3^5 = 6^0).
 */
export function mix(seed: number, attempt: number): number {
  return fmix(fmix(seed >>> 0) ^ fmix((Math.imul(attempt + 1, 0x9e3779b1) ^ 0x632be5ab) >>> 0));
}
