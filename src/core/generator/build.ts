/**
 * Building blocks for the generator (spec §10.1): "nice" ratios turned into
 * tooth counts, a small chain builder, roman shaft labels.
 */
import { roman } from '../layout';
import type { Cluster, ElementJSON, ChainJSON, Direction } from '../model';
import type { Rng } from './rng';

export const MOTOR_RPM = [1440, 1450, 960, 2880] as const;
export const Z_MIN = 17;
export const Z_MAX = 80;

/** Ratios with small primes, inside the usual machine-tool limits [1/4, 2] (spec §10.1). */
export const NICE: readonly [number, number][] = [
  [1, 4], [1, 3], [2, 5], [1, 2], [3, 5], [2, 3], [3, 4], [4, 5], [5, 6],
  [6, 5], [5, 4], [4, 3], [3, 2], [5, 3], [2, 1],
];
export const REDUCING: readonly [number, number][] = NICE.filter(([p, q]) => p < q);
/** Pulley diameters (mm). */
export const PULLEYS = [60, 70, 75, 80, 90, 100, 110, 120, 125, 140, 150, 160, 180, 200, 210, 225, 240, 250, 280, 300, 320, 360, 400];
/** Common tooth sums of sliding clusters (spec §10.1). */
export const SUMS = [60, 64, 70, 72, 80, 84, 90, 96] as const;
export const MODULES = ['1,5', '2', '2,5', '3', '4'] as const;

/** Tooth pair (z1, z2) with z1/z2 = p/q, both in [Z_MIN, Z_MAX]; random multiple. */
export function teethFor(rng: Rng, p: number, q: number, zmin = Z_MIN, zmax = Z_MAX): [number, number] | null {
  const ks: number[] = [];
  for (let k = 1; p * k <= zmax && q * k <= zmax; k++) if (p * k >= zmin && q * k >= zmin) ks.push(k);
  if (!ks.length) return null;
  const k = rng.pick(ks);
  return [p * k, q * k];
}

/** Tooth pair with z1/z2 = p/q and z1 + z2 = S (sliding cluster); null if not integer or out of range. */
export function teethWithSum(p: number, q: number, S: number): [number, number] | null {
  if ((S * p) % (p + q) !== 0) return null;
  const z1 = (S * p) / (p + q);
  const z2 = S - z1;
  return z1 >= Z_MIN && z2 >= Z_MIN ? [z1, z2] : null;
}

/** Pulley pair with d1/d2 = p/q from the standard list. */
export function pulleysFor(rng: Rng, p: number, q: number): [number, number] | null {
  const pairs: [number, number][] = [];
  for (const d1 of PULLEYS) for (const d2 of PULLEYS) if (d1 * q === d2 * p) pairs.push([d1, d2]);
  return pairs.length ? rng.pick(pairs) : null;
}

/** Minimal chain builder producing ChainJSON (rationals as strings). */
export class ChainBuilder {
  shafts: { id: string; label: string }[] = [];
  linear: { id: string; label: string }[] = [];
  elements: ElementJSON[] = [];
  clusters: Cluster[] = [];
  private n = 0;

  shaft(label?: string): string {
    const id = roman(this.shafts.length + 1);
    this.shafts.push({ id, label: label ?? id });
    return id;
  }
  out(id: string, label: string): string {
    this.linear.push({ id, label });
    return id;
  }
  private id(prefix: string) {
    this.n += 1;
    return `${prefix}${this.n}`;
  }
  gear(from: string, to: string, z1: number, z2: number, module?: string, id?: string): string {
    const e: ElementJSON = { kind: 'gear', id: id ?? this.id('g'), from, to, z1, z2, ...(module ? { module } : {}) };
    this.elements.push(e);
    return e.id;
  }
  belt(from: string, to: string, d1: number, d2: number): string {
    const id = this.id('u');
    this.elements.push({ kind: 'belt', id, from, to, d1: String(d1), d2: String(d2) });
    return id;
  }
  worm(from: string, to: string, starts: number, z: number): string {
    const id = this.id('w');
    this.elements.push({ kind: 'worm', id, from, to, starts, z });
    return id;
  }
  bevel(from: string, to: string, z1: number, z2: number): string {
    const id = this.id('b');
    this.elements.push({ kind: 'bevel', id, from, to, z1, z2 });
    return id;
  }
  clutch(from: string, to: string): string {
    const id = this.id('c');
    this.elements.push({ kind: 'clutch', id, from, to });
    return id;
  }
  rack(from: string, output: string, z: number, module: string): string {
    const id = this.id('r');
    this.elements.push({ kind: 'rack', id, from, output, z, module });
    return id;
  }
  screw(from: string, output: string, pitch: string, starts: number): string {
    const id = this.id('s');
    this.elements.push({ kind: 'screw', id, from, output, pitch, starts });
    return id;
  }
  cluster(label: string, options: string[]): string {
    const id = `K${this.clusters.length + 1}`;
    this.clusters.push({ id, label, options });
    return id;
  }
  build(input: { shaft: string; n: number | string; direction?: Direction; power?: string }, efficiency?: Record<string, string>): ChainJSON {
    return {
      shafts: this.shafts,
      ...(this.linear.length ? { linear: this.linear } : {}),
      elements: this.elements,
      clusters: this.clusters,
      input: { shaft: input.shaft, n: String(input.n), ...(input.direction ? { direction: input.direction } : {}), ...(input.power ? { power: input.power } : {}) },
      ...(efficiency && Object.keys(efficiency).length ? { efficiency } : {}),
      viewpoint: { eu: 'motorraren aldetik begiratuta', es: 'mirando desde el motor' },
    };
  }
}
