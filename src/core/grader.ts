/**
 * Grader (spec §8). Deterministic: every expected value comes from the solvers
 * (A, cross-checked with B), never from stored answers or AI.
 *
 *  - Single-answer asks: tolerance §8.1 (relative error ≤ 0,5 %, or the answer
 *    equals the exact result rounded to 2 decimals, or, in rpm, to the unit).
 *  - Multi-solution asks (indexing, change gears, missing teeth): constraints
 *    are checked (§8.2); every valid answer is accepted.
 *  - Wrong answers are diagnosed by recomputing the usual mistakes (§8.3).
 */
import { DEFAULT_GEARSET, checkCompound, checkSimple, compoundTrains, mountingOk, quadrantRatio, requiredRatio, simpleTrains } from './changeGears';
import { compareSolutions } from './checks';
import { centerDistance, clusterCenterDistance, gearGeometry, rackPinionDiameter } from './geometry';
import { checkIndexing, indexingSolutions } from './indexing';
import { type Ask, type Chain, type Element, type KinExercise, type State, type StateSolution, activeElements, allStates, exerciseForAsk } from './model';
import { powerAt } from './power';
import {
  type PiRational,
  type Rational,
  ONE,
  div,
  eq,
  inv,
  isInteger,
  mul,
  parse,
  pr,
  prDiv,
  prEq,
  prScale,
  prToNumber,
  q,
  toFixed,
  toNumber,
  toString as rs,
} from './rational';
import { solveStateB } from './solverLinear';
import { maxFeedPerRevA, solveStateA, speedTableA } from './solverPath';
import { topology, validateChain } from './validate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Unit = 'rpm' | 'rad/s' | 'mm/min' | 'm/s' | 'mm' | 'm' | 'mm/rev' | 'N·m' | 'kW' | '';

/** Raw answer of one ask, as typed in the form: field → text. Field names per ask type (see FIELDS). */
export type AskAnswer = Record<string, string | undefined>;

export const FIELDS: Record<Ask['type'], string[]> = {
  speed: ['value'],
  speedMaxMin: ['max', 'min'],
  speedCount: ['value'],
  ratio: ['value'],
  direction: ['value'],
  linearSpeed: ['value'],
  feedPerRev: ['value'],
  feedPerMin: ['value'],
  centerDistance: ['value'],
  gearGeometry: ['d', 'da', 'df', 'h', 'p'],
  pitchDiameter: ['value'],
  missingTeeth: ['value'],
  indexing: ['turns', 'holes', 'circle'],
  changeGears: ['za', 'zb', 'zc', 'zd'],
  torquePower: ['T', 'P'],
};

export type Status = 'correct' | 'wrong' | 'missing' | 'invalid';

export type DiagCode =
  | 'inverse-stage'
  | 'inverse-all'
  | 'idler-in-ratio'
  | 'idler-direction'
  | 'wrong-position'
  | 'screw-starts'
  | 'feed-units'
  | 'rack-radius'
  | 'rack-no-60'
  | 'mm-m'
  | 'centre-no-half'
  | 'centre-difference'
  | 'rpm-rads'
  | 'indexing-inverted'
  | 'indexing-not-reduced'
  | 'circle-not-on-plates'
  | 'local-max'
  | 'kw-w'
  | 'efficiency-ignored'
  | 'counted-duplicates'
  | 'ratio-mismatch'
  | 'gear-not-in-set'
  | 'gear-reused'
  | 'mounting-condition'
  | 'cluster-sum'
  | 'pitch-as-module'
  | 'fixed-ratio-ignored'
  | 'unknown';

export interface Diagnosis {
  code: DiagCode;
  detail?: Record<string, string>;
}

export interface FieldResult {
  field: string;
  status: Status;
  given?: string;
  expected?: string; // display form of the expected value (decimal comma)
}

export interface AskResult {
  ask: Ask;
  status: Status;
  fields: FieldResult[];
  diagnoses: Diagnosis[];
  /** Multi-solution asks: other valid answers (to show after a correct one, or in the solution). */
  solutions?: Record<string, string>[];
}

export interface GradeResult {
  asks: AskResult[];
  score: number; // fraction of asks correct (0..1)
}

export class ExerciseError extends Error {}

// ---------------------------------------------------------------------------
// Numbers, units, tolerance
// ---------------------------------------------------------------------------

const BASE_UNIT: Partial<Record<Ask['type'], Unit>> = {
  speed: 'rpm',
  speedMaxMin: 'rpm',
  linearSpeed: 'mm/min',
  feedPerRev: 'mm/rev',
  feedPerMin: 'mm/min',
  centerDistance: 'mm',
  missingTeeth: '',
  ratio: '',
  speedCount: '',
};

/** Units the user may choose for an ask (§8.1 unit selector); first = default. */
export function unitsFor(ask: Ask): Unit[] {
  switch (ask.type) {
    case 'speed':
    case 'speedMaxMin':
      return ['rpm', 'rad/s'];
    case 'linearSpeed':
      return ask.unit === 'm/s' ? ['m/s', 'mm/min'] : ['mm/min', 'm/s'];
    case 'feedPerMin':
      return ['mm/min', 'm/s'];
    case 'feedPerRev':
      return ['mm/rev'];
    case 'centerDistance':
    case 'gearGeometry':
    case 'pitchDiameter':
      return ['mm', 'm'];
    default:
      return [''];
  }
}

/** Convert a value from its base unit (rpm, mm/min, mm) to `unit`. Exact. */
export function convert(v: PiRational, from: Unit, to: Unit): PiRational {
  if (from === to || !to) return v;
  if (from === 'rpm' && to === 'rad/s') return pr(div(v.coef, q(30)), v.piPower + 1);
  if (from === 'rad/s' && to === 'rpm') return pr(mul(v.coef, q(30)), v.piPower - 1);
  if (from === 'mm/min' && to === 'm/s') return prScale(v, q(1, 60000));
  if (from === 'm/s' && to === 'mm/min') return prScale(v, q(60000));
  if (from === 'mm' && to === 'm') return prScale(v, q(1, 1000));
  if (from === 'm' && to === 'mm') return prScale(v, q(1000));
  throw new Error(`cannot convert ${from} → ${to}`);
}

/** Parse a typed number exactly ("1,5", "3/4"); null if it is not a number. */
export function parseAnswer(s: string | undefined): Rational | null {
  if (s === undefined || s.trim() === '') return null;
  try {
    return parse(s);
  } catch {
    return null;
  }
}

/** Decimal string of a value rounded to `d` places (exact when no π; π through double precision otherwise). */
function decimals(v: PiRational, d: number): string {
  return v.piPower === 0 ? toFixed(v.coef, d) : prToNumber(v).toFixed(d);
}

/** Display form: decimal comma, trailing zeros removed. */
export function fmt(v: PiRational, d = 2): string {
  let s = decimals(v, d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',').replace(/^-0$/, '0');
}

/**
 * Tolerance §8.1: relative error ≤ 0,5 %, OR the answer equals the exact result
 * rounded to 2 decimals, OR (rpm) equals it rounded to the unit.
 * The 2-decimal rule applies only when |expected| ≥ 1 in the chosen unit (user's
 * decision, 2026-11-19): below 1 it would accept nonsense (0,00278 m/s → "0").
 */
export function numMatch(given: Rational, expected: PiRational, unit: Unit = ''): boolean {
  const e = prToNumber(expected);
  const g = toNumber(given);
  if (e === 0) return g === 0;
  if (Math.abs(g - e) / Math.abs(e) <= 0.005) return true;
  if (Math.abs(e) >= 1 && eq(given, parse(decimals(expected, 2)))) return true;
  if (unit === 'rpm' && eq(given, parse(decimals(expected, 0)))) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Solving with both solvers (A must agree with B)
// ---------------------------------------------------------------------------

function solve(chain: Chain, state: State): Extract<StateSolution, { ok: true }> {
  const a = solveStateA(chain, state);
  const b = solveStateB(chain, state);
  const diff = compareSolutions(a, b);
  if (diff) throw new ExerciseError(`Solvers disagree: ${diff}`);
  if (!a.ok) throw new ExerciseError(a.error);
  return a;
}

/** Solver A only, for hypothetical (mistaken) chains in the diagnosis. */
function trySolve(chain: Chain, state: State): Extract<StateSolution, { ok: true }> | null {
  const a = solveStateA(chain, state);
  return a.ok ? a : null;
}

const stateOf = (ex: KinExercise): State => ex.state ?? Object.fromEntries(ex.chain.clusters.map((c) => [c.id, c.options[0] as string]));

// ---------------------------------------------------------------------------
// Chain mutations used to reproduce the usual mistakes
// ---------------------------------------------------------------------------

function replaceElement(chain: Chain, id: string, f: (e: Element) => Element | null): Chain {
  return { ...chain, elements: chain.elements.flatMap((e) => (e.id === id ? (f(e) ? [f(e) as Element] : []) : [e])) };
}

/** Same element with its ratio inverted (Z2/Z1 instead of Z1/Z2). Null if inversion changes nothing. */
function inverted(e: Element): Element | null {
  switch (e.kind) {
    case 'gear':
    case 'bevel':
    case 'chain':
      return e.z1 === e.z2 ? null : { ...e, z1: e.z2, z2: e.z1 };
    case 'belt':
      return eq(e.d1, e.d2) ? null : { ...e, d1: e.d2, d2: e.d1 };
    case 'worm':
      return { kind: 'gear', id: e.id, from: e.from, to: e.to, z1: e.z, z2: e.starts }; // n·Z/k
    default:
      return null;
  }
}

/** Elements on the power path from the input to a shaft (in order). */
function pathTo(chain: Chain, state: State, shaft: string): Element[] {
  const t = topology(chain, state);
  const out: Element[] = [];
  let cur = shaft;
  while (cur !== chain.input.shaft) {
    const p = t.parent.get(cur);
    if (!p) return [];
    out.unshift(p.via);
    cur = p.from;
  }
  return out;
}

/** Idler shafts on a path: two gear meshes with the same gear (Z out of one = Z into the next), nothing else on the shaft. */
function idlersOn(chain: Chain, state: State, path: Element[]): string[] {
  const act = activeElements(chain, state);
  const res: string[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as Element;
    const b = path[i + 1] as Element;
    if (a.kind !== 'gear' || b.kind !== 'gear' || a.internal || b.internal) continue;
    const mid = a.to === b.from ? a.to : a.from === b.to ? a.from : a.to === b.to ? a.to : a.from;
    const za = a.to === mid ? a.z2 : a.z1;
    const zb = b.from === mid ? b.z1 : b.z2;
    const onShaft = act.filter((e) => e.from === mid || ('to' in e && e.to === mid));
    if (za === zb && onShaft.length === 2) res.push(mid);
  }
  return res;
}

interface Alt {
  code: DiagCode;
  value: PiRational;
  detail?: Record<string, string>;
}

/**
 * Alternative (mistaken) values of a quantity q(chain, state) under the §8.3 hypotheses
 * that act on the chain: one stage inverted, all stages inverted, other cluster position,
 * screw starts forgotten.
 */
/** `linear`: the quantity depends on a linear output (screw starts can then be forgotten). */
function chainAlternatives(chain: Chain, state: State, targetShafts: string[], quantity: (c: Chain, s: State) => PiRational | null, linear = false): Alt[] {
  const alts: Alt[] = [];
  const path = [...new Set(targetShafts.flatMap((s) => pathTo(chain, state, s)))];
  for (const e of path) {
    const inv_ = inverted(e);
    if (!inv_) continue;
    const v = quantity(replaceElement(chain, e.id, () => inv_), state);
    if (v) alts.push({ code: 'inverse-stage', value: v, detail: { element: e.id } });
  }
  const invertible = path.filter((e) => inverted(e));
  if (invertible.length > 1) {
    let c = chain;
    for (const e of invertible) c = replaceElement(c, e.id, () => inverted(e));
    const v = quantity(c, state);
    if (v) alts.push({ code: 'inverse-all', value: v });
  }
  // other positions only of the clusters that lie on the power path of the target
  // (moving a cluster of another branch is not a mistake: it does not change the result)
  const onPath = new Set(path.map((e) => e.id));
  const relevant = chain.clusters.filter((k) => k.options.some((o) => onPath.has(o)));
  for (const st of allStates(chain)) {
    if (chain.clusters.some((k) => !relevant.includes(k) && st[k.id] !== state[k.id])) continue;
    if (relevant.every((k) => st[k.id] === state[k.id])) continue;
    const v = quantity(chain, st);
    if (v) alts.push({ code: 'wrong-position', value: v, detail: { state: JSON.stringify(st) } });
  }
  for (const e of linear ? activeElements(chain, state) : []) {
    if (e.kind !== 'screw' || e.starts === 1) continue;
    const v = quantity(replaceElement(chain, e.id, (x) => ({ ...(x as typeof e), starts: 1 })), state);
    if (v) alts.push({ code: 'screw-starts', value: v });
  }
  return alts;
}

// ---------------------------------------------------------------------------
// Expected values and their alternatives, per ask
// ---------------------------------------------------------------------------

interface NumericSpec {
  field: string;
  expected: PiRational;
  base: Unit;
  alts: Alt[];
}

const shaftN = (c: Chain, s: State, shaft: string): PiRational | null => {
  const sol = trySolve(c, s);
  const v = sol?.shafts[shaft];
  return v ? pr(v.n) : null;
};
const linV = (c: Chain, s: State, out: string): PiRational | null => {
  const sol = trySolve(c, s);
  const v = sol?.linear[out];
  return v ? v.v : null;
};
const feed = (c: Chain, s: State, out: string, spindle: string): PiRational | null => {
  const sol = trySolve(c, s);
  const v = sol?.linear[out];
  const n = sol?.shafts[spindle];
  return v && n ? prDiv(v.v, pr(n.n)) : null;
};

/** Unit mix-ups on the final value, expressed in the base unit (§8.3 items 6 and 8). */
function unitAlternatives(ex: KinExercise, ask: Ask, sp: NumericSpec): Alt[] {
  const v = sp.expected;
  const out: Alt[] = [];
  if (sp.base === 'rpm') {
    out.push({ code: 'rpm-rads', value: pr(div(v.coef, q(30)), v.piPower + 1) }); // rad/s value typed as rpm
    out.push({ code: 'rpm-rads', value: pr(mul(v.coef, q(30)), v.piPower - 1) }); // rpm value typed as rad/s
  }
  if (sp.base === 'mm/min' || sp.base === 'mm') {
    for (const k of [q(1000), q(1, 1000), q(60000), q(1, 60000)]) out.push({ code: 'mm-m', value: prScale(v, k) });
    const drive = 'output' in ask ? activeElements(ex.chain, stateOf(ex)).find((e) => 'output' in e && e.output === ask.output) : undefined;
    if (drive?.kind === 'rack') for (const k of [q(60), q(1, 60)]) out.push({ code: 'rack-no-60', value: prScale(v, k) });
  }
  return out;
}

function numericSpecs(ex: KinExercise, ask: Ask): NumericSpec[] {
  return rawSpecs(ex, ask).map((sp) => ({ ...sp, alts: [...sp.alts, ...unitAlternatives(ex, ask, sp)] }));
}

function rawSpecs(ex: KinExercise, ask: Ask): NumericSpec[] {
  const chain = ex.chain;
  const st = stateOf(ex);
  switch (ask.type) {
    case 'speed': {
      const sol = solve(chain, st);
      const n = sol.shafts[ask.shaft];
      if (!n) throw new ExerciseError(`shaft ${ask.shaft} not driven`);
      const alts = chainAlternatives(chain, st, [ask.shaft], (c, s) => shaftN(c, s, ask.shaft));
      const path = pathTo(chain, st, ask.shaft);
      for (const idl of idlersOn(chain, st, path)) {
        const v = sol.shafts[idl];
        if (v) alts.push({ code: 'idler-in-ratio', value: pr(v.n), detail: { shaft: idl } });
      }
      return [{ field: 'value', expected: pr(n.n), base: 'rpm', alts }];
    }
    case 'speedMaxMin': {
      for (const s of allStates(chain)) solve(chain, s); // A = B on every state
      const table = speedTableA(chain, ask.shaft);
      if (!table.rows.length) throw new ExerciseError('shaft never driven');
      const ns = table.rows.map((r) => r.n);
      const max = table.distinct[table.distinct.length - 1] as Rational;
      const min = table.distinct[0] as Rational;
      // local extremes: any other combination's speed
      const others = (v: Rational): Alt[] => ns.filter((x) => !eq(x, v)).map((x) => ({ code: 'local-max' as const, value: pr(x) }));
      return [
        { field: 'max', expected: pr(max), base: 'rpm', alts: others(max) },
        { field: 'min', expected: pr(min), base: 'rpm', alts: others(min) },
      ];
    }
    case 'speedCount': {
      const ns = allStates(chain)
        .map((s) => solve(chain, s).shafts[ask.shaft]?.n)
        .filter((x): x is Rational => !!x);
      const distinct = ns.filter((x, i) => ns.findIndex((y) => eq(x, y)) === i).length;
      const alts: Alt[] = distinct !== ns.length ? [{ code: 'counted-duplicates', value: pr(q(ns.length)) }] : [];
      return [{ field: 'value', expected: pr(q(distinct)), base: '', alts }];
    }
    case 'ratio': {
      const sol = solve(chain, st);
      const a = sol.shafts[ask.from];
      const b = sol.shafts[ask.to];
      if (!a || !b) throw new ExerciseError('ratio: shaft not driven');
      const i = div(b.n, a.n);
      const alts: Alt[] = eq(i, ONE) ? [] : [{ code: 'inverse-all', value: pr(inv(i)) }];
      alts.push(
        ...chainAlternatives(chain, st, [ask.to], (c, s) => {
          const x = trySolve(c, s);
          const na = x?.shafts[ask.from];
          const nb = x?.shafts[ask.to];
          return na && nb ? pr(div(nb.n, na.n)) : null;
        }).filter((x) => x.code === 'inverse-stage'),
      );
      return [{ field: 'value', expected: pr(i), base: '', alts }];
    }
    case 'linearSpeed':
    case 'feedPerMin': {
      const v = solve(chain, st).linear[ask.output];
      if (!v) throw new ExerciseError(`output ${ask.output} not driven`);
      const drive = activeElements(chain, st).find((e) => 'output' in e && e.output === ask.output);
      const alts = chainAlternatives(chain, st, drive ? [drive.from] : [], (c, s) => linV(c, s, ask.output), true);
      if (drive?.kind === 'rack') {
        alts.push({ code: 'rack-radius', value: prScale(v.v, q(1, 2)) });
        alts.push({ code: 'rack-radius', value: prScale(v.v, q(2)) });
        // rack pitch read as the module: v = π·p·Z·n instead of p·Z·n
        if (drive.pitch) alts.push({ code: 'pitch-as-module', value: pr(v.v.coef, v.v.piPower + 1) });
      }
      // feed per revolution given instead of per minute: the spindle is not named in this ask, so try every driven shaft
      if (ask.type === 'feedPerMin') {
        const sol = solve(chain, st);
        for (const [s, n] of Object.entries(sol.shafts)) alts.push({ code: 'feed-units', value: prDiv(v.v, pr(n.n)), detail: { shaft: s } });
      }
      return [{ field: 'value', expected: v.v, base: 'mm/min', alts }];
    }
    case 'feedPerRev': {
      if (ask.max) {
        for (const s of allStates(chain)) solve(chain, s); // A = B on every state
        const m = maxFeedPerRevA(chain, ask.output, ask.spindle); // exact comparison
        const best = { s: m.at[0] as State, f: m.max };
        const alts: Alt[] = m.rows.filter((r) => !prEq(r.f, best.f)).map((r) => ({ code: 'local-max', value: r.f, detail: { state: JSON.stringify(r.state) } }));
        const v = linV(chain, best.s, ask.output);
        if (v) alts.push({ code: 'feed-units', value: v });
        for (const e of activeElements(chain, best.s))
          if (e.kind === 'screw' && e.starts > 1) {
            const f = feed(replaceElement(chain, e.id, (x) => ({ ...(x as typeof e), starts: 1 })), best.s, ask.output, ask.spindle);
            if (f) alts.push({ code: 'screw-starts', value: f });
          }
        return [{ field: 'value', expected: best.f, base: 'mm/rev', alts }];
      }
      const f = feed(chain, st, ask.output, ask.spindle);
      solve(chain, st);
      if (!f) throw new ExerciseError('feed not defined');
      const drive = activeElements(chain, st).find((e) => 'output' in e && e.output === ask.output);
      const alts = chainAlternatives(chain, st, [ask.spindle, ...(drive ? [drive.from] : [])], (c, s) => feed(c, s, ask.output, ask.spindle), true);
      const v = linV(chain, st, ask.output);
      if (v) alts.push({ code: 'feed-units', value: v });
      return [{ field: 'value', expected: f, base: 'mm/rev', alts }];
    }
    case 'centerDistance': {
      let a: Rational | null = null;
      let alts: Alt[] = [];
      const gearEl = (id: string) => chain.elements.find((e) => e.id === id);
      const fromGear = (e: Element | undefined) => {
        if (!e || e.kind !== 'gear' || !e.module) throw new ExerciseError('centerDistance needs a spur gear with module');
        const val = centerDistance(e.module, e.z1, e.z2, !!e.internal);
        alts = [
          { code: 'centre-no-half', value: pr(mul(val, q(2))) },
          { code: 'centre-difference', value: pr(centerDistance(e.module, e.z1, e.z2, !e.internal)) },
        ];
        return val;
      };
      if (ask.cluster) {
        a = clusterCenterDistance(chain, ask.cluster);
        const c = chain.clusters.find((x) => x.id === ask.cluster);
        fromGear(gearEl(c?.options[0] ?? ''));
      } else if (ask.element) a = fromGear(gearEl(ask.element));
      if (!a) throw new ExerciseError('centre distance undefined (module missing)');
      return [{ field: 'value', expected: pr(a), base: 'mm', alts }];
    }
    case 'pitchDiameter': {
      const e = chain.elements.find((x) => x.id === ask.element);
      if (e?.kind === 'rack') {
        const d = rackPinionDiameter(e);
        const alts: Alt[] = [{ code: 'rack-radius', value: prScale(d, q(1, 2)) }];
        // rack pitch read as if it were the module: d = p·Z
        if (e.pitch) alts.push({ code: 'pitch-as-module', value: pr(mul(e.pitch, q(e.z))) });
        return [{ field: 'value', expected: d, base: 'mm', alts }];
      }
      if (e?.kind === 'gear' && e.module) {
        const d = pr(mul(e.module, q(e.z1)));
        return [{ field: 'value', expected: d, base: 'mm', alts: [{ code: 'rack-radius', value: prScale(d, q(1, 2)) }] }];
      }
      throw new ExerciseError('pitchDiameter needs a rack pinion or a gear with module');
    }
    case 'gearGeometry': {
      const e = chain.elements.find((x) => x.id === ask.element);
      if (!e || e.kind !== 'gear' || !e.module) throw new ExerciseError('gearGeometry needs a spur gear with module');
      const g = gearGeometry(e.module, e.z1);
      return [
        { field: 'd', expected: pr(g.d), base: 'mm', alts: [{ code: 'rack-radius', value: pr(div(g.d, q(2))) }] },
        { field: 'da', expected: pr(g.da), base: 'mm', alts: [] },
        { field: 'df', expected: pr(g.df), base: 'mm', alts: [] },
        { field: 'h', expected: pr(g.h), base: 'mm', alts: [] },
        { field: 'p', expected: g.p, base: 'mm', alts: [] },
      ];
    }
    case 'torquePower': {
      const sol = solve(chain, st);
      const p = powerAt(chain, st, sol, ask.shaft);
      const n = sol.shafts[ask.shaft]!.n;
      const Pin = chain.input.power!;
      const T = p.T;
      const PkW = pr(div(p.P, q(1000)));
      const tAlts: Alt[] = [
        { code: 'rpm-rads', value: pr(div(p.P, n)) }, // T = P/n with n in rpm
        { code: 'kw-w', value: prScale(T, q(1, 1000)) }, // P in kW used as if W
      ];
      if (!eq(p.etaPath, ONE)) tAlts.push({ code: 'efficiency-ignored', value: pr(div(mul(q(30), Pin), n), -1) });
      tAlts.push(
        ...chainAlternatives(chain, st, [ask.shaft], (c, s) => {
          const x = trySolve(c, s);
          const nn = x?.shafts[ask.shaft];
          return x && nn ? powerAt(c, s, x, ask.shaft).T : null;
        }).filter((a) => a.code === 'inverse-stage' || a.code === 'inverse-all'),
      );
      const pAlts: Alt[] = [{ code: 'kw-w', value: pr(p.P) }];
      if (!eq(p.etaPath, ONE)) pAlts.push({ code: 'efficiency-ignored', value: pr(div(Pin, q(1000))) });
      return [
        { field: 'T', expected: T, base: 'N·m', alts: tAlts },
        { field: 'P', expected: PkW, base: 'kW', alts: pAlts },
      ];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

const dedupe = (ds: Diagnosis[]): Diagnosis[] => ds.filter((d, i) => ds.findIndex((x) => x.code === d.code && JSON.stringify(x.detail) === JSON.stringify(d.detail)) === i);

function gradeNumeric(ex: KinExercise, ask: Ask, ans: AskAnswer): AskResult {
  const specs = numericSpecs(ex, ask);
  const unit = (ans.unit as Unit | undefined) ?? unitsFor(ask)[0] ?? '';
  const fields: FieldResult[] = [];
  if (!unitsFor(ask).includes(unit) && !(ask.type === 'torquePower' && !ans.unit))
    return { ask, status: 'invalid', fields: specs.map((sp) => ({ field: sp.field, status: 'invalid' as const, ...(ans[sp.field] ? { given: ans[sp.field] } : {}) })), diagnoses: [] };
  const diagnoses: Diagnosis[] = [];
  for (const sp of specs) {
    const raw = ans[sp.field];
    const shownUnit = sp.base === 'N·m' || sp.base === 'kW' || sp.base === 'mm/rev' || sp.base === '' ? sp.base : unit;
    const exp = convert(sp.expected, sp.base, shownUnit);
    const fr: FieldResult = { field: sp.field, status: 'missing', expected: fmt(exp, shownUnit === 'm/s' || shownUnit === 'm' ? 4 : 2) };
    const g = parseAnswer(raw);
    if (raw === undefined || raw.trim() === '') fields.push(fr);
    else if (!g) fields.push({ ...fr, status: 'invalid', given: raw });
    else if (numMatch(g, exp, shownUnit)) fields.push({ ...fr, status: 'correct', given: raw });
    else {
      fields.push({ ...fr, status: 'wrong', given: raw });
      const found: Diagnosis[] = [];
      for (const a of sp.alts) {
        if (prEq(a.value, sp.expected)) continue; // indistinguishable: never blame
        if (numMatch(g, convert(a.value, sp.base, shownUnit), shownUnit)) found.push({ code: a.code, ...(a.detail ? { detail: a.detail } : {}) });
      }
      diagnoses.push(...(found.length ? found : [{ code: 'unknown' as const }]));
    }
  }
  return { ask, status: overall(fields), fields, diagnoses: dedupe(diagnoses) };
}

function overall(fields: FieldResult[]): Status {
  if (fields.every((f) => f.status === 'correct')) return 'correct';
  if (fields.every((f) => f.status === 'missing')) return 'missing';
  if (fields.some((f) => f.status === 'invalid') && !fields.some((f) => f.status === 'wrong')) return 'invalid';
  return 'wrong';
}

function gradeDirection(ex: KinExercise, ask: Extract<Ask, { type: 'direction' }>, ans: AskAnswer): AskResult {
  const st = stateOf(ex);
  const sol = solve(ex.chain, st);
  const d = sol.shafts[ask.shaft]?.dir;
  if (d === null || d === undefined) throw new ExerciseError(`direction of ${ask.shaft} is not defined`);
  const inDir = ex.chain.input.direction;
  const name = (rel: 1 | -1): string => (inDir ? (rel === 1 ? inDir : inDir === 'cw' ? 'ccw' : 'cw') : rel === 1 ? 'same' : 'opposite');
  const expected = name(d);
  const raw = ans.value?.trim();
  const fr: FieldResult = { field: 'value', status: 'missing', expected };
  if (!raw) return { ask, status: 'missing', fields: [fr], diagnoses: [] };
  if (!['cw', 'ccw', 'same', 'opposite'].includes(raw)) return { ask, status: 'invalid', fields: [{ ...fr, status: 'invalid', given: raw }], diagnoses: [] };
  // normalise "same/opposite" ↔ "cw/ccw" when the input direction is known
  const rel = raw === 'same' ? 1 : raw === 'opposite' ? -1 : inDir ? (raw === inDir ? 1 : -1) : null;
  if (rel === null) return { ask, status: 'invalid', fields: [{ ...fr, status: 'invalid', given: raw }], diagnoses: [] };
  if (rel === d) return { ask, status: 'correct', fields: [{ ...fr, status: 'correct', given: raw }], diagnoses: [] };
  const idlers = idlersOn(ex.chain, st, pathTo(ex.chain, st, ask.shaft));
  const diag: Diagnosis[] = idlers.length % 2 === 1 ? [{ code: 'idler-direction', detail: { shaft: idlers[0] as string } }] : [{ code: 'unknown' }];
  return { ask, status: 'wrong', fields: [{ ...fr, status: 'wrong', given: raw }], diagnoses: diag };
}

function intField(s: string | undefined): number | null {
  const r = parseAnswer(s);
  if (!r || !isInteger(r)) return null;
  const n = Number(r.n);
  return Number.isSafeInteger(n) ? n : null;
}

function gradeIndexing(ex: KinExercise, ask: Extract<Ask, { type: 'indexing' }>, ans: AskAnswer): AskResult {
  const K = ex.data?.K ?? 40;
  const plates = ex.data?.platesHoles ?? [];
  const all = indexingSolutions(K, ask.N, plates);
  const solutions = all.map((s) => ({ turns: String(s.turns), holes: String(s.holes), circle: String(s.circle) }));
  const expected = all[0] ? `${all[0].turns} + ${all[0].holes}/${all[0].circle}` : '—';
  const fieldsBase = ['turns', 'holes', 'circle'];
  if (fieldsBase.every((f) => !ans[f]?.trim())) return { ask, status: 'missing', fields: fieldsBase.map((f) => ({ field: f, status: 'missing' })), diagnoses: [], solutions };
  const t = intField(ans.turns);
  const h = intField(ans.holes);
  const c = intField(ans.circle);
  if (t === null || h === null || c === null || c <= 0 || t < 0 || h < 0)
    return { ask, status: 'invalid', fields: fieldsBase.map((f) => ({ field: f, status: 'invalid', given: ans[f] ?? '', expected })), diagnoses: [], solutions };
  const chk = checkIndexing(K, ask.N, plates, { turns: t, holes: h, circle: c });
  const status: Status = chk.valid ? 'correct' : 'wrong';
  const diagnoses: Diagnosis[] = [];
  if (!chk.valid) {
    const val = q(t * c + h, c);
    if (chk.reasons.includes('holes-not-reduced') && eq(val, q(K, ask.N))) {
      const whole = Math.floor(h / c);
      diagnoses.push({ code: 'indexing-not-reduced', detail: { turns: String(t + whole), holes: String(h - whole * c), circle: String(c) } });
    }
    if (eq(val, q(ask.N, K))) diagnoses.push({ code: 'indexing-inverted' });
    if (chk.reasons.includes('circle-not-on-plates')) diagnoses.push({ code: 'circle-not-on-plates' });
    if (!diagnoses.length) diagnoses.push({ code: 'unknown' });
  }
  return { ask, status, fields: fieldsBase.map((f) => ({ field: f, status, given: ans[f] ?? '', expected })), diagnoses, solutions };
}

function gradeChangeGears(ex: KinExercise, ask: Extract<Ask, { type: 'changeGears' }>, ans: AskAnswer): AskResult {
  const set = ex.data?.changeGears ?? DEFAULT_GEARSET;
  const i = quadrantRatio(ask);
  const opt = { mountingCondition: !!ask.mountingCondition };
  const four = compoundTrains(i, set, opt);
  const two = simpleTrains(i, set);
  const solutions = [...two.map((t) => ({ za: String(t.za), zb: String(t.zb) })), ...four.map((t) => ({ za: String(t.za), zb: String(t.zb), zc: String(t.zc), zd: String(t.zd) }))];
  const expected = solutions[0] ? Object.values(solutions[0]).join(' / ') : '—';
  const names = ['za', 'zb', 'zc', 'zd'];
  if (names.every((f) => !ans[f]?.trim())) return { ask, status: 'missing', fields: names.map((f) => ({ field: f, status: 'missing' })), diagnoses: [], solutions };
  const za = intField(ans.za);
  const zb = intField(ans.zb);
  const zcRaw = ans.zc?.trim();
  const zdRaw = ans.zd?.trim();
  const isTwo = !zcRaw && !zdRaw;
  const zc = isTwo ? null : intField(ans.zc);
  const zd = isTwo ? null : intField(ans.zd);
  if (za === null || zb === null || (!isTwo && (zc === null || zd === null)))
    return { ask, status: 'invalid', fields: names.map((f) => ({ field: f, status: 'invalid', given: ans[f] ?? '', expected })), diagnoses: [], solutions };
  const chk = isTwo ? checkSimple(i, set, { za, zb }) : checkCompound(i, set, { za, zb, zc: zc as number, zd: zd as number }, opt);
  const status: Status = chk.valid ? 'correct' : 'wrong';
  const diagnoses: Diagnosis[] = chk.valid ? [] : chk.reasons.map((r) => ({ code: (r === 'bad-input' ? 'unknown' : r) as DiagCode }));
  if (!chk.valid && chk.reasons.includes('ratio-mismatch')) {
    const got = isTwo ? q(za, zb) : mul(q(za, zb), q(zc as number, zd as number));
    if (!isTwo && eq(got, inv(i))) diagnoses.unshift({ code: 'inverse-all' });
    // the fixed gearing (Norton box) left out: the gears give P_thread / P_screw
    if (ask.fixedRatio && eq(got, requiredRatio(ask.threadPitch, ask.leadScrewPitch))) diagnoses.unshift({ code: 'fixed-ratio-ignored' });
  }
  return { ask, status, fields: names.map((f) => ({ field: f, status, given: ans[f] ?? '', expected })), diagnoses, solutions };
}

/** All tooth counts that make the exercise work (target speed reached, chain still valid). */
export function missingTeethSolutions(ex: KinExercise, ask: Extract<Ask, { type: 'missingTeeth' }>, maxZ = 400): number[] {
  const st = stateOf(ex);
  const el = ex.chain.elements.find((e) => e.id === ask.element);
  if (!el || !('z1' in el || 'z' in el)) throw new ExerciseError('missingTeeth: element without teeth');
  const out: number[] = [];
  for (let z = 1; z <= maxZ; z++) {
    const c = withTeeth(ex.chain, ask, z);
    const sol = trySolve(c, st);
    const b = solveStateB(c, st);
    const n = sol?.shafts[ask.target.shaft]?.n;
    if (!n || !eq(n, ask.target.n) || compareSolutions(sol as StateSolution, b)) continue;
    if (clusterSumBroken(c, ask.element)) continue;
    out.push(z);
  }
  return out;
}

/** Chain with the asked tooth count replaced by z. */
function withTeeth(chain: Chain, ask: Extract<Ask, { type: 'missingTeeth' }>, z: number): Chain {
  return replaceElement(chain, ask.element, (e) => {
    const key = 'z1' in e ? ask.side : ask.side === 'z1' ? 'starts' : 'z';
    return { ...e, [key]: z } as Element;
  });
}

/** Does the element belong to a sliding cluster whose constant tooth sum / centre distance is now broken? */
function clusterSumBroken(chain: Chain, elementId: string): boolean {
  if (!chain.clusters.some((c) => c.options.includes(elementId))) return false;
  return validateChain(chain).errors.some((e) => e.code === 'cluster.centre');
}

function gradeMissingTeeth(ex: KinExercise, ask: Extract<Ask, { type: 'missingTeeth' }>, ans: AskAnswer): AskResult {
  const sols = missingTeethSolutions(ex, ask);
  const expected = sols.join(', ') || '—';
  const solutions = sols.map((z) => ({ value: String(z) }));
  const raw = ans.value?.trim();
  if (!raw) return { ask, status: 'missing', fields: [{ field: 'value', status: 'missing', expected }], diagnoses: [], solutions };
  const z = intField(raw);
  if (z === null || z <= 0) return { ask, status: 'invalid', fields: [{ field: 'value', status: 'invalid', given: raw, expected }], diagnoses: [], solutions };
  if (sols.includes(z)) return { ask, status: 'correct', fields: [{ field: 'value', status: 'correct', given: raw, expected }], diagnoses: [], solutions };
  // the target speed is reached but the cluster tooth sum is broken
  const c = withTeeth(ex.chain, ask, z);
  const n = trySolve(c, stateOf(ex))?.shafts[ask.target.shaft]?.n;
  const diagnoses: Diagnosis[] = n && eq(n, ask.target.n) && clusterSumBroken(c, ask.element) ? [{ code: 'cluster-sum' }] : [{ code: 'unknown' }];
  return { ask, status: 'wrong', fields: [{ field: 'value', status: 'wrong', given: raw, expected }], diagnoses, solutions };
}

export function gradeAsk(exercise: KinExercise, ask: Ask, ans: AskAnswer): AskResult {
  const ex = exerciseForAsk(exercise, ask);
  switch (ask.type) {
    case 'direction':
      return gradeDirection(ex, ask, ans);
    case 'indexing':
      return gradeIndexing(ex, ask, ans);
    case 'changeGears':
      return gradeChangeGears(ex, ask, ans);
    case 'missingTeeth':
      return gradeMissingTeeth(ex, ask, ans);
    default:
      return gradeNumeric(ex, ask, ans);
  }
}

export function grade(ex: KinExercise, answers: AskAnswer[]): GradeResult {
  const asks = ex.asks.map((a, i) => gradeAsk(ex, a, answers[i] ?? {}));
  return { asks, score: asks.filter((r) => r.status === 'correct').length / Math.max(1, asks.length) };
}

/**
 * Generator filter §10.3: every diagnosable mistake must give a value different
 * from the correct one (otherwise the grader could not tell them apart).
 * Returns the colliding hypotheses (empty = fine).
 */
export function diagnosticCollisions(ex: KinExercise): { ask: number; field: string; code: DiagCode }[] {
  const out: { ask: number; field: string; code: DiagCode }[] = [];
  ex.asks.forEach((a, i) => {
    if (a.type === 'indexing' && a.N === (ex.data?.K ?? 40)) out.push({ ask: i, field: 'turns', code: 'indexing-inverted' });
    if (a.type === 'changeGears' && eq(quadrantRatio(a), ONE)) out.push({ ask: i, field: 'za', code: 'inverse-all' });
    for (const sp of numericSpecs(exerciseForAsk(ex, a), a))
      for (const alt of sp.alts) if (numMatch(parse(decimals(alt.value, 6)), sp.expected)) out.push({ ask: i, field: sp.field, code: alt.code });
  });
  return out;
}

/** The exact expected values (for the solution view and tests). */
export function expectedValues(ex: KinExercise, ask: Ask): { field: string; value: PiRational; unit: Unit }[] {
  return numericSpecs(exerciseForAsk(ex, ask), ask).map((s) => ({ field: s.field, value: s.expected, unit: s.base }));
}

export { BASE_UNIT, mountingOk, rs as rationalToString };
