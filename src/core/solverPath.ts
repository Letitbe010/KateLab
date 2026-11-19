/**
 * Solver A: path multiplication (spec §5.1).
 *
 * Walks the active graph from the input shaft, multiplying the ratio of each
 * element. Magnitudes and directions are propagated in two separate passes:
 * directions only across parallel-axis elements (gear, belt, chain, clutch).
 *
 * Independent of solver B: shares only model.ts (data shapes) and rational.ts.
 */
import {
  type Chain,
  type Element,
  type LinearSolution,
  type RelDir,
  type ShaftSolution,
  type State,
  type StateSolution,
  activeElements,
  allStates,
} from './model';
import { type PiRational, type Rational, ONE, div, eq, mul, pr, prDiv, prEq, q, sub } from './rational';

/** Speed multiplier from `from` shaft to `to` shaft (n_to = n_from · k). */
function forwardFactor(e: Element): Rational {
  switch (e.kind) {
    case 'gear':
    case 'bevel':
    case 'chain':
      return q(e.z1, e.z2);
    case 'belt':
      return mul(div(e.d1, e.d2), e.slip ? sub(ONE, e.slip) : ONE);
    case 'worm':
      return q(e.starts, e.z);
    case 'clutch':
      return ONE;
    default:
      throw new Error(`forwardFactor: ${e.kind} is not a rotary element`);
  }
}

/** Does the element reverse the direction (parallel axes only)? */
function reverses(e: Element): boolean {
  switch (e.kind) {
    case 'gear':
      return !e.internal;
    case 'belt':
      return !!e.crossed;
    default:
      return false; // chain, clutch
  }
}
const parallel = (e: Element): boolean => e.kind === 'gear' || e.kind === 'belt' || e.kind === 'chain' || e.kind === 'clutch';

/** Linear speed (mm/min) of a rack or screw driven at n rpm. */
function linearSpeed(e: Element, n: Rational): PiRational {
  if (e.kind === 'rack') return pr(mul(mul(e.module, q(e.z)), n), 1); // v = π·m·Z·n
  if (e.kind === 'screw') return pr(mul(mul(e.pitch, q(e.starts)), n), 0); // v = n·k·p
  throw new Error(`linearSpeed: ${e.kind} is not a linear element`);
}

export function solveStateA(chain: Chain, state: State): StateSolution {
  const act = activeElements(chain, state);
  const n = new Map<string, Rational>([[chain.input.shaft, chain.input.n]]);
  const linear: Record<string, LinearSolution> = {};

  // ---- pass 1: magnitudes ----
  const queue = [chain.input.shaft];
  while (queue.length) {
    const s = queue.shift() as string;
    const ns = n.get(s) as Rational;
    for (const e of act) {
      if ('output' in e) {
        if (e.from !== s) continue;
        const v = linearSpeed(e, ns);
        const prev = linear[e.output];
        if (prev && !prEq(prev.v, v)) return { ok: false, error: `Output ${e.output} driven at two different speeds` };
        linear[e.output] = { v };
        continue;
      }
      let other: string;
      let nOther: Rational;
      if (e.from === s) {
        other = e.to;
        nOther = mul(ns, forwardFactor(e));
      } else if (e.to === s) {
        other = e.from;
        nOther = div(ns, forwardFactor(e));
      } else continue;
      const known = n.get(other);
      if (known) {
        if (!eq(known, nOther)) return { ok: false, error: `Shaft ${other} would turn at two different speeds (locked loop)` };
        continue;
      }
      n.set(other, nOther);
      queue.push(other);
    }
  }

  // ---- pass 2: directions, per parallel-connected component ----
  const dir = new Map<string, 1 | -1>();
  const comp = new Map<string, string>(); // shaft -> component root
  const roots = [chain.input.shaft, ...[...n.keys()].filter((s) => s !== chain.input.shaft)];
  for (const root of roots) {
    if (dir.has(root)) continue;
    dir.set(root, 1);
    comp.set(root, root);
    const qq = [root];
    while (qq.length) {
      const s = qq.shift() as string;
      const ds = dir.get(s) as 1 | -1;
      for (const e of act) {
        if (!('to' in e) || !parallel(e)) continue;
        let other: string;
        if (e.from === s) other = e.to;
        else if (e.to === s) other = e.from;
        else continue;
        const d: 1 | -1 = reverses(e) ? (-ds as 1 | -1) : ds;
        const known = dir.get(other);
        if (known !== undefined) {
          if (known !== d) return { ok: false, error: `Shaft ${other} would turn both ways (locked loop)` };
          continue;
        }
        dir.set(other, d);
        comp.set(other, root);
        qq.push(other);
      }
    }
  }

  const shafts: Record<string, ShaftSolution> = {};
  for (const [s, ns] of n) {
    const d: RelDir = comp.get(s) === chain.input.shaft ? (dir.get(s) as 1 | -1) : null;
    shafts[s] = { n: ns, dir: d };
  }
  return { ok: true, shafts, linear };
}

// ---------------------------------------------------------------------------
// Derived quantities built on solver A
// ---------------------------------------------------------------------------

export interface SpeedRow {
  state: State;
  n: Rational;
}

export interface SpeedTable {
  rows: SpeedRow[]; // one per cluster combination, ascending by n
  total: number; // number of combinations
  distinct: Rational[]; // distinct speeds, ascending
  max: SpeedRow[]; // all combinations reaching the maximum
  min: SpeedRow[];
}

/** Speed of one shaft over every cluster combination. Throws if a state cannot be solved. */
export function speedTableA(chain: Chain, shaft: string): SpeedTable {
  const rows: SpeedRow[] = [];
  for (const st of allStates(chain)) {
    const sol = solveStateA(chain, st);
    if (!sol.ok) throw new Error(sol.error);
    const s = sol.shafts[shaft];
    if (s) rows.push({ state: st, n: s.n });
  }
  rows.sort((a, b) => (a.n.n * b.n.d < b.n.n * a.n.d ? -1 : a.n.n * b.n.d > b.n.n * a.n.d ? 1 : 0));
  const distinct: Rational[] = [];
  for (const r of rows) if (!distinct.some((d) => eq(d, r.n))) distinct.push(r.n);
  const top = distinct[distinct.length - 1];
  const bottom = distinct[0];
  return {
    rows,
    total: rows.length,
    distinct,
    max: top ? rows.filter((r) => eq(r.n, top)) : [],
    min: bottom ? rows.filter((r) => eq(r.n, bottom)) : [],
  };
}

/** i = n_to / n_from. */
export function ratioA(sol: StateSolution, fromShaft: string, toShaft: string): Rational {
  if (!sol.ok) throw new Error(sol.error);
  const a = sol.shafts[fromShaft];
  const b = sol.shafts[toShaft];
  if (!a || !b) throw new Error('ratioA: shaft not driven');
  return div(b.n, a.n);
}

/** Feed per spindle revolution (mm/rev) = v (mm/min) / n_spindle (rpm). */
export function feedPerRevA(sol: StateSolution, output: string, spindle: string): PiRational {
  if (!sol.ok) throw new Error(sol.error);
  const v = sol.linear[output];
  const s = sol.shafts[spindle];
  if (!v || !s) throw new Error('feedPerRevA: output or spindle not driven');
  return prDiv(v.v, pr(s.n, 0));
}

export interface FeedRow {
  state: State;
  f: PiRational;
}

/** Maximum feed per spindle revolution over all cluster combinations (all argmax states returned). */
export function maxFeedPerRevA(chain: Chain, output: string, spindle: string): { max: PiRational; at: State[]; rows: FeedRow[] } {
  const rows: FeedRow[] = [];
  for (const st of allStates(chain)) {
    const sol = solveStateA(chain, st);
    if (!sol.ok) throw new Error(sol.error);
    if (sol.linear[output] && sol.shafts[spindle]) rows.push({ state: st, f: feedPerRevA(sol, output, spindle) });
  }
  if (!rows.length) throw new Error('maxFeedPerRevA: never driven');
  const p0 = (rows[0] as FeedRow).f.piPower;
  if (rows.some((r) => r.f.piPower !== p0)) throw new Error('maxFeedPerRevA: mixed powers of π');
  let best = (rows[0] as FeedRow).f;
  for (const r of rows) if (r.f.coef.n * best.coef.d > best.coef.n * r.f.coef.d) best = r.f;
  return { max: best, at: rows.filter((r) => prEq(r.f, best)).map((r) => r.state), rows };
}
