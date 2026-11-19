/**
 * Power and torque along a chain (spec §3, level 3).
 *   P_out = P_in · Π η (efficiencies of the elements on the path)
 *   ω = 2π·n/60 ;  T = P/ω = 30·P/(π·n)   [N·m with P in W, n in rpm]
 * Torque carries π^-1 and is kept symbolic.
 */
import type { Chain, State, StateSolution } from './model';
import { type PiRational, type Rational, ONE, div, mul, pr, q } from './rational';
import { topology } from './validate';

export interface PowerAt {
  P: Rational; // W
  T: PiRational; // N·m
  omega: PiRational; // rad/s
  etaPath: Rational; // product of efficiencies along the path
  branched: boolean; // true if power splits somewhere on the way (P is then an upper bound)
}

export const torqueFrom = (P: Rational, n: Rational): PiRational => pr(div(mul(q(30), P), n), -1);

export function powerAt(chain: Chain, state: State, sol: StateSolution, shaft: string): PowerAt {
  if (!sol.ok) throw new Error(sol.error);
  if (!chain.input.power) throw new Error('powerAt: chain has no input power');
  const target = sol.shafts[shaft];
  if (!target) throw new Error(`powerAt: shaft ${shaft} is not driven`);
  const topo = topology(chain, state);
  let eta = ONE;
  const pathShafts = new Set<string>([shaft]);
  let cur = shaft;
  while (cur !== chain.input.shaft) {
    const p = topo.parent.get(cur);
    if (!p) throw new Error(`powerAt: no path to ${shaft}`);
    const e = chain.efficiency?.[p.via.id];
    if (e) eta = mul(eta, e);
    cur = p.from;
    pathShafts.add(cur);
  }
  // branched if any shaft on the path (except the target) feeds more than one child
  const children = new Map<string, number>();
  for (const [, p] of topo.parent) children.set(p.from, (children.get(p.from) ?? 0) + 1);
  let branched = false;
  for (const s of pathShafts) if (s !== shaft && (children.get(s) ?? 0) > 1) branched = true;
  const P = mul(chain.input.power, eta);
  return { P, T: torqueFrom(P, target.n), omega: pr(div(target.n, q(30)), 1), etaPath: eta, branched };
}
