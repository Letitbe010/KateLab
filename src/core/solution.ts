/**
 * Step-by-step solution data (spec §8.4). Pure data; the UI turns it into text.
 *  1. power path (active, driven elements) for the colouring of the schema;
 *  2. ratio of every stage as a fraction, oriented in the direction of power;
 *  3. total ratio (simplified fraction and decimal);
 *  4. speed of every shaft;
 *  5. linear outputs with their formula inputs;
 *  6. speed table over every cluster combination (when asked).
 */
import { type Chain, type Element, type KinExercise, type RelDir, type State, activeElements, allStates } from './model';
import { type PiRational, type Rational, ONE, div, mul, pr, q } from './rational';
import { solveStateA } from './solverPath';
import { topology } from './validate';

export interface Stage {
  element: string;
  kind: Element['kind'];
  from: string; // shaft the power comes from
  to: string;
  num: string; // numerator as written (e.g. "35", "100", "1")
  den: string; // denominator as written (e.g. "50", "360", "30")
  factor?: string; // extra factor (belt slip: "1 − s")
  ratio: Rational; // n_to / n_from
  nFrom: Rational;
  nTo: Rational;
}

export interface PathSolution {
  target: string;
  stages: Stage[];
  total: Rational; // n_target / n_input
}

export interface LinearStep {
  output: string;
  element: string;
  kind: 'rack' | 'screw';
  shaft: string;
  n: Rational;
  /** rack: module and Z (v = π·m·Z·n); screw: pitch and starts (v = n·k·P). */
  module?: Rational;
  z?: number;
  pitch?: Rational;
  starts?: number;
  v: PiRational; // mm/min
}

export interface SolutionData {
  state: State;
  active: string[]; // element ids on the power path
  shafts: { shaft: string; n: Rational; dir: RelDir }[];
  paths: PathSolution[];
  linear: LinearStep[];
  speedTable?: { shaft: string; rows: { state: State; n: Rational }[]; max: Rational; min: Rational };
}

const frac = (e: Element, forward: boolean): { num: string; den: string; factor?: string } => {
  const f = (a: string, b: string) => (forward ? { num: a, den: b } : { num: b, den: a });
  switch (e.kind) {
    case 'gear':
    case 'bevel':
    case 'chain':
      return f(String(e.z1), String(e.z2));
    case 'belt': {
      const r = f(fmtR(e.d1), fmtR(e.d2));
      return e.slip ? { ...r, factor: `1 − ${fmtR(e.slip)}` } : r;
    }
    case 'worm':
      return f(String(e.starts), String(e.z));
    default:
      return { num: '1', den: '1' };
  }
};
const fmtR = (r: Rational): string => (r.d === 1n ? r.n.toString() : `${r.n}/${r.d}`);

export function pathSolution(chain: Chain, state: State, target: string): PathSolution {
  const sol = solveStateA(chain, state);
  if (!sol.ok) throw new Error(sol.error);
  const t = topology(chain, state);
  const stages: Stage[] = [];
  let cur = target;
  while (cur !== chain.input.shaft) {
    const p = t.parent.get(cur);
    if (!p) throw new Error(`no path to ${target}`);
    const e = p.via;
    const forward = 'to' in e && e.from === p.from;
    const nFrom = sol.shafts[p.from]!.n;
    const nTo = sol.shafts[cur]!.n;
    stages.unshift({ element: e.id, kind: e.kind, from: p.from, to: cur, ...frac(e, forward), ratio: div(nTo, nFrom), nFrom, nTo });
    cur = p.from;
  }
  const total = stages.reduce((acc, s) => mul(acc, s.ratio), ONE);
  return { target, stages, total };
}

export function solutionData(ex: KinExercise): SolutionData {
  const chain = ex.chain;
  const state = ex.state ?? Object.fromEntries(chain.clusters.map((c) => [c.id, c.options[0] as string]));
  const sol = solveStateA(chain, state);
  if (!sol.ok) throw new Error(sol.error);
  const t = topology(chain, state);
  const active = activeElements(chain, state)
    .filter((e) => t.reached.has(e.from))
    .map((e) => e.id);
  const shafts = chain.shafts.filter((s) => sol.shafts[s.id]).map((s) => ({ shaft: s.id, n: sol.shafts[s.id]!.n, dir: sol.shafts[s.id]!.dir }));

  // targets: shafts and outputs named by the asks
  const targets = new Set<string>();
  const outputs = new Set<string>();
  let tableShaft: string | undefined;
  for (const a of ex.asks) {
    if ('shaft' in a && a.type !== 'speedMaxMin' && a.type !== 'speedCount') targets.add(a.shaft);
    if (a.type === 'speedMaxMin' || a.type === 'speedCount') tableShaft = a.shaft;
    if (a.type === 'ratio') targets.add(a.to);
    if ('output' in a) outputs.add(a.output);
    if (a.type === 'feedPerRev') targets.add(a.spindle);
  }
  const linear: LinearStep[] = [];
  for (const e of activeElements(chain, state)) {
    if (!('output' in e) || !outputs.has(e.output)) continue;
    targets.add(e.from);
    const n = sol.shafts[e.from]!.n;
    const v = sol.linear[e.output]!.v;
    linear.push(
      e.kind === 'rack'
        ? { output: e.output, element: e.id, kind: 'rack', shaft: e.from, n, module: e.module, z: e.z, v }
        : { output: e.output, element: e.id, kind: 'screw', shaft: e.from, n, pitch: e.pitch, starts: e.starts, v },
    );
  }
  const paths = [...targets].filter((s) => s !== chain.input.shaft && sol.shafts[s]).map((s) => pathSolution(chain, state, s));

  const data: SolutionData = { state, active, shafts, paths, linear };
  if (tableShaft) {
    const rows = allStates(chain)
      .map((st) => {
        const r = solveStateA(chain, st);
        return r.ok && r.shafts[tableShaft as string] ? { state: st, n: r.shafts[tableShaft as string]!.n } : null;
      })
      .filter((r): r is { state: State; n: Rational } => !!r)
      .sort((a, b) => (a.n.n * b.n.d < b.n.n * a.n.d ? -1 : 1));
    if (rows.length) data.speedTable = { shaft: tableShaft, rows, max: rows[rows.length - 1]!.n, min: rows[0]!.n };
  }
  return data;
}

/** Linear speed recomputed from the step data (used by tests to check the formulas shown). */
export function linearFromStep(s: LinearStep): PiRational {
  return s.kind === 'rack' ? pr(mul(mul(s.module!, q(s.z!)), s.n), 1) : pr(mul(mul(s.pitch!, q(s.starts!)), s.n), 0);
}
