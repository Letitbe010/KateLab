/**
 * Spur gear geometry, ISO normal profile (spec §3). m in mm.
 *   d = m·Z ; d_a = m·(Z + 2) ; d_f = m·(Z − 2,5) ; h = 2,25·m ; p = π·m
 *   a = m·(Z1 + Z2)/2 (external) ; a = m·(Z2 − Z1)/2 (internal, Z2 the ring)
 */
import type { Chain, ClusterId, Element } from './model';
import { type PiRational, type Rational, abs, div, eq, mul, parse, pr, q, sub } from './rational';

export interface GearGeometry {
  d: Rational;
  da: Rational;
  df: Rational;
  h: Rational;
  p: PiRational;
}

export function gearGeometry(m: Rational, z: number): GearGeometry {
  return {
    d: mul(m, q(z)),
    da: mul(m, q(z + 2)),
    df: mul(m, sub(q(z), parse('2,5'))),
    h: mul(parse('2,25'), m),
    p: pr(m, 1),
  };
}

export const pitchDiameter = (m: Rational, z: number): Rational => mul(m, q(z));

/** Pitch diameter of a rack pinion: d = m·Z, or d = p·Z/π when the rack pitch p is given. */
export function rackPinionDiameter(e: Extract<Element, { kind: 'rack' }>): PiRational {
  return e.pitch ? pr(mul(e.pitch, q(e.z)), -1) : pr(mul(e.module as Rational, q(e.z)), 0);
}

export function centerDistance(m: Rational, z1: number, z2: number, internal = false): Rational {
  return div(mul(m, internal ? abs(q(z2 - z1)) : q(z1 + z2)), q(2));
}

/** Centre distance of a gear element, if its module is known. */
export function elementCenterDistance(e: Element): Rational | null {
  if (e.kind === 'gear' && e.module) return centerDistance(e.module, e.z1, e.z2, !!e.internal);
  return null; // bevel pairs have no parallel centre distance
}

/**
 * Centre distance of a sliding cluster: equal for every option (validated).
 * Returns null if modules are not given. Throws if options disagree.
 */
export function clusterCenterDistance(chain: Chain, cluster: ClusterId): Rational | null {
  const c = chain.clusters.find((x) => x.id === cluster);
  if (!c) throw new Error(`Unknown cluster ${cluster}`);
  const values = c.options.map((id) => {
    const e = chain.elements.find((x) => x.id === id);
    return e ? elementCenterDistance(e) : null;
  });
  if (values.some((v) => v === null)) return null;
  const v0 = values[0] as Rational;
  if (values.some((v) => !eq(v as Rational, v0))) throw new Error(`Cluster ${cluster}: centre distances differ`);
  return v0;
}
