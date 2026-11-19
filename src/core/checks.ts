/**
 * Global checks (spec §5.3). An exercise is shown only if every check passes.
 */
import { clusterCenterDistance } from './geometry';
import { type Chain, type State, type StateSolution, allStates, stateKey } from './model';
import { powerAt } from './power';
import { type Rational, eq, gt, mul, pr, prEq, prMul, prScale, q } from './rational';
import { solveStateB } from './solverLinear';
import { solveStateA } from './solverPath';

export interface CheckFailure {
  check: 'solve' | 'agreement' | 'linearity' | 'centre' | 'power';
  state?: string;
  detail: string;
}

/** Field-by-field comparison of two solutions (exact). Returns a description of the first mismatch. */
export function compareSolutions(a: StateSolution, b: StateSolution): string | null {
  if (a.ok !== b.ok) return `A ${a.ok ? 'solved' : 'failed'} but B ${b.ok ? 'solved' : 'failed'}`;
  if (!a.ok || !b.ok) return null; // both failed: they agree that the chain is ill-defined
  const sa = Object.keys(a.shafts).sort();
  const sb = Object.keys(b.shafts).sort();
  if (sa.join() !== sb.join()) return `driven shafts differ: A[${sa}] B[${sb}]`;
  for (const s of sa) {
    const x = a.shafts[s];
    const y = b.shafts[s];
    if (!x || !y) return `shaft ${s} missing`;
    if (!eq(x.n, y.n)) return `n(${s}) differs`;
    if (x.dir !== y.dir) return `direction(${s}) differs: A ${x.dir} B ${y.dir}`;
  }
  const la = Object.keys(a.linear).sort();
  const lb = Object.keys(b.linear).sort();
  if (la.join() !== lb.join()) return `driven outputs differ: A[${la}] B[${lb}]`;
  for (const l of la) {
    const x = a.linear[l];
    const y = b.linear[l];
    if (!x || !y || !prEq(x.v, y.v)) return `v(${l}) differs`;
  }
  return null;
}

/** Scale the input speed by k and check that every output scales by k (linearity). */
export function linearityHolds(chain: Chain, state: State, k: Rational): boolean {
  const base = solveStateA(chain, state);
  const scaled = solveStateA({ ...chain, input: { ...chain.input, n: mul(chain.input.n, k) } }, state);
  if (!base.ok || !scaled.ok) return base.ok === scaled.ok;
  for (const [s, v] of Object.entries(base.shafts)) {
    const w = scaled.shafts[s];
    if (!w || !eq(w.n, mul(v.n, k)) || w.dir !== v.dir) return false;
  }
  for (const [l, v] of Object.entries(base.linear)) {
    const w = scaled.linear[l];
    if (!w || !prEq(w.v, prScale(v.v, k))) return false;
  }
  return true;
}

/**
 * Power check (only if the chain has an input power): P ≤ P_in on every driven
 * shaft, and with all efficiencies = 1, T·n = 30·P/π on every shaft.
 */
export function powerProblem(chain: Chain, state: State, sol: StateSolution): string | null {
  const Pin = chain.input.power;
  if (!Pin || !sol.ok) return null;
  const ideal: Chain = { ...chain };
  delete ideal.efficiency;
  const ref = pr(mul(q(30), Pin), -1);
  for (const [s, v] of Object.entries(sol.shafts)) {
    if (gt(powerAt(chain, state, sol, s).P, Pin)) return `P(${s}) > P_in`;
    const T = powerAt(ideal, state, sol, s).T;
    if (!prEq(prMul(T, pr(v.n)), ref)) return `T·n not constant at ${s}`;
  }
  return null;
}

/** Run every global check on every cluster combination. Empty array = chain accepted. */
export function globalChecks(chain: Chain, k: Rational): CheckFailure[] {
  const fails: CheckFailure[] = [];
  for (const st of allStates(chain)) {
    const key = stateKey(chain, st);
    const a = solveStateA(chain, st);
    const b = solveStateB(chain, st);
    const diff = compareSolutions(a, b);
    if (diff) fails.push({ check: 'agreement', state: key, detail: diff });
    if (!a.ok) fails.push({ check: 'solve', state: key, detail: a.error });
    else {
      if (!linearityHolds(chain, st, k)) fails.push({ check: 'linearity', state: key, detail: 'outputs do not scale with input' });
      const p = powerProblem(chain, st, a);
      if (p) fails.push({ check: 'power', state: key, detail: p });
    }
  }
  for (const c of chain.clusters) {
    try {
      clusterCenterDistance(chain, c.id);
    } catch (e) {
      fails.push({ check: 'centre', detail: (e as Error).message });
    }
  }
  return fails;
}
