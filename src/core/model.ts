/**
 * Data model of a kinematic chain (spec §4), with the deviations agreed in phase 1:
 *  - every element has an `id` (clusters reference elements by id);
 *  - `bevel` added (bevel gear pair, non-parallel axes: direction not tracked);
 *  - idler gears are modelled as two `gear` elements through an idler shaft
 *    (no separate `idler` kind: it was ambiguous);
 *  - a cardan joint is a `clutch` (ratio 1).
 *
 * Internal units: lengths mm, time min, speeds rpm, linear speeds mm/min, power W.
 * Conversions to m/s, rad/s, kW happen only in the output layer (units.ts).
 *
 * This module holds data shapes and plain helpers only. It deliberately contains
 * no transmission-ratio logic, so that solver A and solver B stay independent.
 */
import type { SchemaLayout } from './layout';
import { type PiRational, type Rational, from, toString } from './rational';

export type ShaftId = string;
export type LinearId = string;
export type ElementId = string;
export type ClusterId = string;

export interface Shaft {
  id: ShaftId;
  label: string;
}
export interface LinearOutput {
  id: LinearId;
  label: string;
}

export type Element =
  | { kind: 'gear'; id: ElementId; from: ShaftId; to: ShaftId; z1: number; z2: number; module?: Rational; internal?: boolean }
  | { kind: 'bevel'; id: ElementId; from: ShaftId; to: ShaftId; z1: number; z2: number; module?: Rational }
  | { kind: 'belt'; id: ElementId; from: ShaftId; to: ShaftId; d1: Rational; d2: Rational; crossed?: boolean; slip?: Rational }
  | { kind: 'chain'; id: ElementId; from: ShaftId; to: ShaftId; z1: number; z2: number }
  | { kind: 'worm'; id: ElementId; from: ShaftId; to: ShaftId; starts: number; z: number }
  | { kind: 'rack'; id: ElementId; from: ShaftId; output: LinearId; z: number; module: Rational }
  | { kind: 'screw'; id: ElementId; from: ShaftId; output: LinearId; pitch: Rational; starts: number }
  | { kind: 'clutch'; id: ElementId; from: ShaftId; to: ShaftId };

export type RotaryElement = Extract<Element, { to: ShaftId }>;
export type LinearElement = Extract<Element, { output: LinearId }>;

export const isRotary = (e: Element): e is RotaryElement => 'to' in e;
export const isLinear = (e: Element): e is LinearElement => 'output' in e;

/** Sliding gear cluster: exactly one option active at a time. */
export interface Cluster {
  id: ClusterId;
  label: string;
  options: ElementId[];
}

export type Direction = 'cw' | 'ccw';

export interface ChainInput {
  shaft: ShaftId;
  n: Rational; // rpm, > 0
  direction?: Direction; // as seen from the fixed viewpoint of the schema
  power?: Rational; // W
}

export interface Chain {
  shafts: Shaft[];
  linear?: LinearOutput[];
  elements: Element[];
  clusters: Cluster[];
  input: ChainInput;
  efficiency?: Record<ElementId, Rational>;
  viewpoint?: { eu: string; es: string }; // e.g. "motorraren aldetik begiratuta"
  layout?: SchemaLayout; // hand-made schema layout (pool exercises); automatic if absent
}

/** Selected option per cluster. */
export type State = Record<ClusterId, ElementId>;

/** Cartesian product of all cluster options, in declaration order. */
export function allStates(chain: Chain): State[] {
  let acc: State[] = [{}];
  for (const c of chain.clusters) {
    const next: State[] = [];
    for (const s of acc) for (const opt of c.options) next.push({ ...s, [c.id]: opt });
    acc = next;
  }
  return acc;
}

/** Elements transmitting motion in a given state (cluster options not selected are idle). */
export function activeElements(chain: Chain, state: State): Element[] {
  const owner = new Map<ElementId, ClusterId>();
  for (const c of chain.clusters) for (const o of c.options) owner.set(o, c.id);
  return chain.elements.filter((e) => {
    const c = owner.get(e.id);
    return c === undefined || state[c] === e.id;
  });
}

export const stateKey = (chain: Chain, state: State): string =>
  chain.clusters.map((c) => `${c.id}=${state[c.id] ?? '?'}`).join(',');

// ---------------------------------------------------------------------------
// Solver output shape (shared by solver A and solver B; data only).
// ---------------------------------------------------------------------------

/** Rotation direction relative to the input shaft: 1 same, -1 opposite, null not defined. */
export type RelDir = 1 | -1 | null;

export interface ShaftSolution {
  n: Rational; // rpm, magnitude (> 0)
  dir: RelDir;
}
export interface LinearSolution {
  v: PiRational; // mm/min, magnitude
}

export type StateSolution =
  | { ok: true; shafts: Record<ShaftId, ShaftSolution>; linear: Record<LinearId, LinearSolution> }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Exercises and asks (spec §7). The grader (phase 4) consumes these.
// ---------------------------------------------------------------------------

export type Ask =
  | { type: 'speed'; shaft: ShaftId }
  | { type: 'speedMaxMin'; shaft: ShaftId }
  | { type: 'speedCount'; shaft: ShaftId }
  | { type: 'ratio'; from: ShaftId; to: ShaftId }
  | { type: 'direction'; shaft: ShaftId }
  | { type: 'linearSpeed'; output: LinearId; unit: 'm/s' | 'mm/min' }
  | { type: 'feedPerRev'; output: LinearId; spindle: ShaftId; max?: boolean }
  | { type: 'feedPerMin'; output: LinearId }
  | { type: 'centerDistance'; cluster?: ClusterId; element?: ElementId }
  | { type: 'gearGeometry'; element: ElementId }
  | { type: 'missingTeeth'; element: ElementId; side: 'z1' | 'z2'; target: { shaft: ShaftId; n: Rational } }
  | { type: 'indexing'; N: number }
  | { type: 'changeGears'; threadPitch: Rational; leadScrewPitch: Rational; mountingCondition?: boolean }
  | { type: 'torquePower'; shaft: ShaftId };

export interface KinExercise {
  id: string;
  origin: 'ope' | 'adapted' | 'generated';
  sourceNote?: string;
  sourceUrl?: string;
  seed?: number;
  difficulty: 1 | 2 | 3;
  chain: Chain;
  state?: State;
  asks: Ask[];
  data?: { platesHoles?: number[][]; changeGears?: number[]; K?: number };
  text: { eu: string; es: string };
  review?: 'draft' | 'review-needed' | 'reviewed';
}

// ---------------------------------------------------------------------------
// JSON form: rationals are written as strings ("2,5", "3/4", "1440").
// ---------------------------------------------------------------------------

type Num = string | number;
export type ElementJSON =
  | { kind: 'gear'; id: string; from: string; to: string; z1: number; z2: number; module?: Num; internal?: boolean }
  | { kind: 'bevel'; id: string; from: string; to: string; z1: number; z2: number; module?: Num }
  | { kind: 'belt'; id: string; from: string; to: string; d1: Num; d2: Num; crossed?: boolean; slip?: Num }
  | { kind: 'chain'; id: string; from: string; to: string; z1: number; z2: number }
  | { kind: 'worm'; id: string; from: string; to: string; starts: number; z: number }
  | { kind: 'rack'; id: string; from: string; output: string; z: number; module: Num }
  | { kind: 'screw'; id: string; from: string; output: string; pitch: Num; starts: number }
  | { kind: 'clutch'; id: string; from: string; to: string };

export interface ChainJSON {
  shafts: Shaft[];
  linear?: LinearOutput[];
  elements: ElementJSON[];
  clusters?: Cluster[];
  input: { shaft: string; n: Num; direction?: Direction; power?: Num };
  efficiency?: Record<string, Num>;
  viewpoint?: { eu: string; es: string };
  layout?: SchemaLayout;
}

const R = (x: Num): Rational => from(typeof x === 'number' && !Number.isInteger(x) ? String(x) : x);
const Ro = (x: Num | undefined): Rational | undefined => (x === undefined ? undefined : R(x));

function elementFromJSON(e: ElementJSON): Element {
  switch (e.kind) {
    case 'gear': {
      const m = Ro(e.module);
      return { ...e, ...(m ? { module: m } : {}) } as Element;
    }
    case 'bevel': {
      const m = Ro(e.module);
      return { ...e, ...(m ? { module: m } : {}) } as Element;
    }
    case 'belt': {
      const s = Ro(e.slip);
      return { ...e, d1: R(e.d1), d2: R(e.d2), ...(s ? { slip: s } : {}) } as Element;
    }
    case 'rack':
      return { ...e, module: R(e.module) };
    case 'screw':
      return { ...e, pitch: R(e.pitch) };
    default:
      return { ...e };
  }
}

export function chainFromJSON(j: ChainJSON): Chain {
  const chain: Chain = {
    shafts: j.shafts.map((s) => ({ ...s })),
    linear: (j.linear ?? []).map((l) => ({ ...l })),
    elements: j.elements.map(elementFromJSON),
    clusters: (j.clusters ?? []).map((c) => ({ ...c, options: [...c.options] })),
    input: {
      shaft: j.input.shaft,
      n: R(j.input.n),
      ...(j.input.direction ? { direction: j.input.direction } : {}),
      ...(j.input.power !== undefined ? { power: R(j.input.power) } : {}),
    },
  };
  if (j.efficiency) chain.efficiency = Object.fromEntries(Object.entries(j.efficiency).map(([k, v]) => [k, R(v)]));
  if (j.viewpoint) chain.viewpoint = j.viewpoint;
  if (j.layout) chain.layout = j.layout;
  return chain;
}

function elementToJSON(e: Element): ElementJSON {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) {
    out[k] = typeof v === 'object' && v !== null && 'n' in v && 'd' in v ? toString(v as Rational) : v;
  }
  return out as unknown as ElementJSON;
}

export function chainToJSON(c: Chain): ChainJSON {
  const j: ChainJSON = {
    shafts: c.shafts,
    elements: c.elements.map(elementToJSON),
    clusters: c.clusters,
    input: {
      shaft: c.input.shaft,
      n: toString(c.input.n),
      ...(c.input.direction ? { direction: c.input.direction } : {}),
      ...(c.input.power ? { power: toString(c.input.power) } : {}),
    },
  };
  if (c.linear && c.linear.length) j.linear = c.linear;
  if (c.efficiency) j.efficiency = Object.fromEntries(Object.entries(c.efficiency).map(([k, v]) => [k, toString(v)]));
  if (c.viewpoint) j.viewpoint = c.viewpoint;
  if (c.layout) j.layout = c.layout;
  return j;
}
