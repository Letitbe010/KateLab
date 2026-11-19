/**
 * Solver B: linear system (spec §5.2). Independent of solver A: it does not walk
 * paths and does not reuse A's ratio functions. Every active element contributes
 * one linear constraint written directly from its raw fields; the system is
 * solved by Gauss–Jordan elimination over exact rationals.
 *
 * Two systems are solved:
 *  1. magnitudes (all elements), unknowns n_shaft ≥ 0 and the π-coefficient of
 *     every linear output speed;
 *  2. signed speeds w_shaft across parallel-axis elements only (gear, belt,
 *     chain, clutch). A shaft's direction is defined only if w is determined.
 */
import {
  type Chain,
  type LinearSolution,
  type RelDir,
  type ShaftSolution,
  type State,
  type StateSolution,
  activeElements,
} from './model';
import { type Rational, ONE, ZERO, abs, div, eq, isZero, mul, neg, pr, q, sign, sub } from './rational';

export type LinSolveResult =
  | { status: 'inconsistent' }
  | { status: 'ok'; x: (Rational | null)[] }; // null = not determined by the system

/** Gauss–Jordan elimination on [A | b]. Returns the determined unknowns. */
export function solveLinearSystem(A: Rational[][], b: Rational[], nVars: number): LinSolveResult {
  const M = A.map((row, i) => [...row, b[i] as Rational]);
  const rows = M.length;
  const pivotCol: number[] = [];
  let r = 0;
  for (let c = 0; c < nVars && r < rows; c++) {
    let p = -1;
    for (let i = r; i < rows; i++) if (!isZero((M[i] as Rational[])[c] as Rational)) { p = i; break; }
    if (p < 0) continue;
    [M[r], M[p]] = [M[p] as Rational[], M[r] as Rational[]];
    const pr_ = M[r] as Rational[];
    const pv = pr_[c] as Rational;
    for (let j = 0; j <= nVars; j++) pr_[j] = div(pr_[j] as Rational, pv);
    for (let i = 0; i < rows; i++) {
      if (i === r) continue;
      const row = M[i] as Rational[];
      const f = row[c] as Rational;
      if (isZero(f)) continue;
      for (let j = 0; j <= nVars; j++) row[j] = sub(row[j] as Rational, mul(f, pr_[j] as Rational));
    }
    pivotCol.push(c);
    r++;
  }
  // inconsistency: a zero row with non-zero right-hand side
  for (let i = r; i < rows; i++) if (!isZero((M[i] as Rational[])[nVars] as Rational)) return { status: 'inconsistent' };
  const x: (Rational | null)[] = new Array(nVars).fill(null);
  const isPivot = new Set(pivotCol);
  pivotCol.forEach((c, i) => {
    const row = M[i] as Rational[];
    let free = false;
    for (let j = 0; j < nVars; j++) if (j !== c && !isPivot.has(j) && !isZero(row[j] as Rational)) free = true;
    if (!free) x[c] = row[nVars] as Rational;
  });
  return { status: 'ok', x };
}

export function solveStateB(chain: Chain, state: State): StateSolution {
  const act = activeElements(chain, state);
  const shaftIdx = new Map(chain.shafts.map((s, i) => [s.id, i] as const));
  const nS = chain.shafts.length;
  const linIds = (chain.linear ?? []).map((l) => l.id);
  const linIdx = new Map(linIds.map((id, i) => [id, nS + i] as const));
  const nV = nS + linIds.length;
  const S = (id: string): number => shaftIdx.get(id) as number;

  // ---------- system 1: magnitudes ----------
  const A1: Rational[][] = [];
  const b1: Rational[] = [];
  const row = (): Rational[] => new Array(nV).fill(ZERO);
  const piPow = new Map<string, number>();
  {
    const r0 = row();
    r0[S(chain.input.shaft)] = ONE;
    A1.push(r0);
    b1.push(chain.input.n);
  }
  for (const e of act) {
    const r = row();
    switch (e.kind) {
      case 'gear':
      case 'bevel':
      case 'chain': // z2·n_to − z1·n_from = 0
        r[S(e.to)] = q(e.z2);
        r[S(e.from)] = neg(q(e.z1));
        break;
      case 'belt': // d2·n_to − d1·(1 − s)·n_from = 0
        r[S(e.to)] = e.d2;
        r[S(e.from)] = neg(e.slip ? sub(e.d1, mul(e.d1, e.slip)) : e.d1);
        break;
      case 'worm': // Z·n_wheel − k·n_worm = 0
        r[S(e.to)] = q(e.z);
        r[S(e.from)] = neg(q(e.starts));
        break;
      case 'clutch':
        r[S(e.to)] = ONE;
        r[S(e.from)] = neg(ONE);
        break;
      case 'rack': {
        // v = π·m·Z·n  →  c − m·Z·n = 0, with v = c·π
        const p = piPow.get(e.output);
        if (p !== undefined && p !== 1) return { ok: false, error: `Output ${e.output} mixes rack and screw drives` };
        piPow.set(e.output, 1);
        r[linIdx.get(e.output) as number] = ONE;
        r[S(e.from)] = neg(mul(e.module, q(e.z)));
        break;
      }
      case 'screw': {
        // v = n·k·P  →  c − k·P·n = 0
        const p = piPow.get(e.output);
        if (p !== undefined && p !== 0) return { ok: false, error: `Output ${e.output} mixes rack and screw drives` };
        piPow.set(e.output, 0);
        r[linIdx.get(e.output) as number] = ONE;
        r[S(e.from)] = neg(mul(q(e.starts), e.pitch));
        break;
      }
    }
    A1.push(r);
    b1.push(ZERO);
  }
  const s1 = solveLinearSystem(A1, b1, nV);
  if (s1.status === 'inconsistent') return { ok: false, error: 'Inconsistent speeds (locked loop)' };

  // ---------- system 2: signed speeds across parallel axes ----------
  const A2: Rational[][] = [];
  const b2: Rational[] = [];
  const row2 = (): Rational[] => new Array(nS).fill(ZERO);
  {
    const r0 = row2();
    r0[S(chain.input.shaft)] = ONE;
    A2.push(r0);
    b2.push(chain.input.n);
  }
  for (const e of act) {
    const r = row2();
    switch (e.kind) {
      case 'gear': // external: z2·w2 + z1·w1 = 0 ; internal: z2·w2 − z1·w1 = 0
        r[S(e.to)] = q(e.z2);
        r[S(e.from)] = e.internal ? neg(q(e.z1)) : q(e.z1);
        break;
      case 'chain':
        r[S(e.to)] = q(e.z2);
        r[S(e.from)] = neg(q(e.z1));
        break;
      case 'belt': {
        const d1eff = e.slip ? sub(e.d1, mul(e.d1, e.slip)) : e.d1;
        r[S(e.to)] = e.d2;
        r[S(e.from)] = e.crossed ? d1eff : neg(d1eff);
        break;
      }
      case 'clutch':
        r[S(e.to)] = ONE;
        r[S(e.from)] = neg(ONE);
        break;
      default:
        continue; // worm, bevel, rack, screw: no direction constraint
    }
    A2.push(r);
    b2.push(ZERO);
  }
  const s2 = solveLinearSystem(A2, b2, nS);
  if (s2.status === 'inconsistent') return { ok: false, error: 'Inconsistent rotation directions (locked loop)' };

  const shafts: Record<string, ShaftSolution> = {};
  for (const s of chain.shafts) {
    const i = S(s.id);
    const n = s1.x[i];
    if (n === null || n === undefined || isZero(n)) continue; // not driven
    if (sign(n) < 0) return { ok: false, error: `Negative speed magnitude on ${s.id}` };
    const w = s2.x[i];
    let dir: RelDir = null;
    if (w !== null && w !== undefined) {
      if (isZero(w)) return { ok: false, error: `Shaft ${s.id} is locked by its gear loop` };
      if (!eq(abs(w), n)) return { ok: false, error: `Magnitude and signed systems disagree on ${s.id}` };
      dir = sign(w) > 0 ? 1 : -1;
    }
    shafts[s.id] = { n, dir };
  }
  const linear: Record<string, LinearSolution> = {};
  for (const id of linIds) {
    const c = s1.x[linIdx.get(id) as number];
    if (c === null || c === undefined || isZero(c)) continue;
    linear[id] = { v: pr(abs(c), piPow.get(id) ?? 0) };
  }
  return { ok: true, shafts, linear };
}
