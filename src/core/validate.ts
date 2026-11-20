/**
 * Structural validation (spec §4). A chain that fails here is never shown.
 * Numerical consistency of loops is checked by the solvers (A and B), not here.
 */
import {
  type Chain,
  type Element,
  type KinExercise,
  type RotaryElement,
  type State,
  activeElements,
  allStates,
  isLinear,
  isRotary,
  stateKey,
} from './model';
import { type Rational, ONE, ZERO, eq, gt, lt, mul, q, sign } from './rational';

export interface Issue {
  code: string;
  message: string;
  ref?: string;
  state?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
}

const posInt = (x: number): boolean => Number.isSafeInteger(x) && x > 0;
const pos = (r: Rational): boolean => sign(r) > 0;

/** Kinds that keep the axes parallel, so a rotation direction can be compared. */
const PARALLEL_KINDS = new Set(['gear', 'belt', 'chain', 'clutch']);

export interface StateTopology {
  reached: Set<string>; // shafts reached from the input
  reachedLinear: Set<string>;
  directionDefined: Set<string>; // shafts whose direction is comparable with the input
  hasLoop: boolean;
  wormBackdriven: string[]; // worm ids driven from the wheel side
  parent: Map<string, { via: Element; from: string }>; // BFS tree
}

/** Breadth-first exploration of the active graph from the input shaft (no ratios involved). */
export function topology(chain: Chain, state: State): StateTopology {
  const act = activeElements(chain, state);
  const reached = new Set<string>([chain.input.shaft]);
  const reachedLinear = new Set<string>();
  const directionDefined = new Set<string>([chain.input.shaft]);
  const parent = new Map<string, { via: Element; from: string }>();
  const usedEdges = new Set<string>();
  const wormBackdriven: string[] = [];
  let hasLoop = false;
  const queue = [chain.input.shaft];
  while (queue.length) {
    const s = queue.shift() as string;
    for (const e of act) {
      if (usedEdges.has(e.id)) continue;
      if (isLinear(e)) {
        if (e.from !== s) continue;
        usedEdges.add(e.id);
        if (reachedLinear.has(e.output)) hasLoop = true; // two drives on one output
        reachedLinear.add(e.output);
        continue;
      }
      let other: string;
      if (e.from === s) other = e.to;
      else if (e.to === s) {
        other = e.from;
        if (e.kind === 'worm') wormBackdriven.push(e.id);
      } else continue;
      usedEdges.add(e.id);
      if (reached.has(other)) {
        hasLoop = true;
        continue;
      }
      reached.add(other);
      parent.set(other, { via: e, from: s });
      if (directionDefined.has(s) && PARALLEL_KINDS.has(e.kind)) directionDefined.add(other);
      queue.push(other);
    }
  }
  // A shaft reached by a non-parallel edge first but also by a parallel path is still comparable.
  // Close directionDefined over parallel active edges (fixed point).
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of act) {
      if (!isRotary(e) || !PARALLEL_KINDS.has(e.kind)) continue;
      const a = directionDefined.has(e.from);
      const b = directionDefined.has(e.to);
      if (a !== b) {
        directionDefined.add(a ? e.to : e.from);
        changed = true;
      }
    }
  }
  return { reached, reachedLinear, directionDefined, hasLoop, wormBackdriven, parent };
}

/** Centre-distance "signature" of a gear pair: m·(z1+z2) external, m·|z2−z1| internal (×2 of a). */
function twiceCentre(e: Extract<RotaryElement, { kind: 'gear' }>, m: Rational): Rational {
  const zs = e.internal ? Math.abs(e.z2 - e.z1) : e.z1 + e.z2;
  return mul(m, q(zs));
}

export function validateChain(chain: Chain): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (code: string, message: string, ref?: string, st?: string) =>
    errors.push({ code, message, ...(ref ? { ref } : {}), ...(st ? { state: st } : {}) });
  const warn = (code: string, message: string, ref?: string, st?: string) =>
    warnings.push({ code, message, ...(ref ? { ref } : {}), ...(st ? { state: st } : {}) });

  // ---- ids ----
  const shaftIds = new Set<string>();
  const linearIds = new Set<string>();
  const allIds = new Set<string>();
  const claim = (id: string, what: string) => {
    if (!id) err('id.empty', `${what} without id`);
    else if (allIds.has(id)) err('id.duplicate', `Duplicate id "${id}"`, id);
    allIds.add(id);
  };
  if (chain.shafts.length === 0) err('shafts.empty', 'Chain has no shafts');
  for (const s of chain.shafts) {
    claim(s.id, 'Shaft');
    shaftIds.add(s.id);
  }
  for (const l of chain.linear ?? []) {
    claim(l.id, 'Linear output');
    linearIds.add(l.id);
  }
  for (const e of chain.elements) claim(e.id, 'Element');
  for (const c of chain.clusters) claim(c.id, 'Cluster');

  // ---- elements ----
  const byId = new Map(chain.elements.map((e) => [e.id, e] as const));
  for (const e of chain.elements) {
    if (!shaftIds.has(e.from)) err('ref.shaft', `Element ${e.id}: unknown shaft "${e.from}"`, e.id);
    if (isRotary(e)) {
      if (!shaftIds.has(e.to)) err('ref.shaft', `Element ${e.id}: unknown shaft "${e.to}"`, e.id);
      if (e.from === e.to) err('element.selfloop', `Element ${e.id} connects a shaft to itself`, e.id);
    } else if (!linearIds.has(e.output)) err('ref.linear', `Element ${e.id}: unknown linear output "${e.output}"`, e.id);
    switch (e.kind) {
      case 'gear':
      case 'bevel':
      case 'chain':
        if (!posInt(e.z1) || !posInt(e.z2)) err('element.teeth', `Element ${e.id}: teeth must be positive integers`, e.id);
        if ('module' in e && e.module && !pos(e.module)) err('element.module', `Element ${e.id}: module must be > 0`, e.id);
        if (e.kind === 'gear' && e.internal && e.z1 === e.z2)
          err('element.internal', `Element ${e.id}: internal pair needs different tooth counts`, e.id);
        break;
      case 'belt':
        if (!pos(e.d1) || !pos(e.d2)) err('element.diameter', `Element ${e.id}: diameters must be > 0`, e.id);
        if (e.slip && (lt(e.slip, ZERO) || !lt(e.slip, ONE))) err('element.slip', `Element ${e.id}: slip must be in [0, 1)`, e.id);
        break;
      case 'worm':
        if (!posInt(e.starts) || !posInt(e.z)) err('element.worm', `Element ${e.id}: starts and Z must be positive integers`, e.id);
        break;
      case 'rack':
        if (!posInt(e.z)) err('element.teeth', `Element ${e.id}: teeth must be a positive integer`, e.id);
        if (!!e.module === !!e.pitch) err('element.rack', `Element ${e.id}: give either the module or the rack pitch`, e.id);
        else if (!pos((e.module ?? e.pitch) as Rational)) err('element.module', `Element ${e.id}: module / pitch must be > 0`, e.id);
        break;
      case 'screw':
        if (!pos(e.pitch)) err('element.pitch', `Element ${e.id}: pitch must be > 0`, e.id);
        if (!posInt(e.starts)) err('element.starts', `Element ${e.id}: starts must be a positive integer`, e.id);
        break;
      case 'clutch':
        break;
    }
  }

  // ---- input ----
  if (!shaftIds.has(chain.input.shaft)) err('input.shaft', `Unknown input shaft "${chain.input.shaft}"`);
  if (!pos(chain.input.n)) err('input.n', 'Input speed must be > 0');
  if (chain.input.power && !pos(chain.input.power)) err('input.power', 'Input power must be > 0');
  for (const [id, eta] of Object.entries(chain.efficiency ?? {})) {
    if (!byId.has(id)) err('efficiency.ref', `Efficiency for unknown element "${id}"`, id);
    if (!pos(eta) || gt(eta, ONE)) err('efficiency.range', `Efficiency of ${id} must be in (0, 1]`, id);
  }

  // ---- clusters ----
  const owner = new Map<string, string>();
  for (const c of chain.clusters) {
    if (c.options.length < 2) err('cluster.options', `Cluster ${c.id} needs at least 2 options`, c.id);
    const opts: Element[] = [];
    for (const o of c.options) {
      const e = byId.get(o);
      if (!e) {
        err('cluster.ref', `Cluster ${c.id}: unknown element "${o}"`, c.id);
        continue;
      }
      if (owner.has(o)) err('cluster.shared', `Element ${o} belongs to two clusters`, o);
      owner.set(o, c.id);
      opts.push(e);
    }
    if (opts.some((e) => e.kind !== 'gear')) {
      err('cluster.kind', `Cluster ${c.id}: only spur-gear options are supported`, c.id);
      continue;
    }
    const gears = opts as Extract<Element, { kind: 'gear' }>[];
    if (gears.length < 2) continue;
    const pair = (e: { from: string; to: string }) => [e.from, e.to].sort().join('|');
    const p0 = pair(gears[0] as Extract<Element, { kind: 'gear' }>);
    if (gears.some((g) => pair(g) !== p0)) {
      err('cluster.shafts', `Cluster ${c.id}: all options must connect the same pair of shafts`, c.id);
      continue;
    }
    const withM = gears.filter((g) => g.module);
    if (withM.length > 0 && withM.length < gears.length) {
      err('cluster.module', `Cluster ${c.id}: module given for some options only`, c.id);
      continue;
    }
    if (new Set(gears.map((g) => !!g.internal)).size > 1) {
      err('cluster.mixed', `Cluster ${c.id}: mixes internal and external pairs`, c.id);
      continue;
    }
    const sig = gears.map((g) => twiceCentre(g, g.module ?? ONE));
    if (sig.some((s) => !eq(s, sig[0] as Rational)))
      err(
        'cluster.centre',
        withM.length
          ? `Cluster ${c.id}: centre distance m·ΣZ/2 differs between options`
          : `Cluster ${c.id}: tooth sums ΣZ differ between options (fixed centre distance)`,
        c.id,
      );
  }

  // ---- per state ----
  if (errors.length === 0) {
    const states = allStates(chain);
    if (states.length > 4096) err('states.many', `Too many cluster combinations (${states.length})`);
    else
      for (const st of states) {
        const key = stateKey(chain, st);
        const t = topology(chain, st);
        for (const w of t.wormBackdriven) err('worm.backdriven', `Worm ${w} would be driven from the wheel`, w, key);
        for (const s of chain.shafts)
          if (!t.reached.has(s.id)) warn('state.disconnected', `Shaft ${s.id} is not driven`, s.id, key);
        for (const l of chain.linear ?? [])
          if (!t.reachedLinear.has(l.id)) warn('state.disconnected', `Output ${l.id} is not driven`, l.id, key);
        if (t.hasLoop) warn('state.loop', 'Closed loop: consistency is checked by the solvers', undefined, key);
      }
  }
  return { ok: errors.length === 0, errors, warnings };
}

const STATE_DEPENDENT = new Set(['speed', 'ratio', 'direction', 'linearSpeed', 'feedPerMin', 'torquePower']);

/** Chain validation plus checks that every ask makes sense for this exercise. */
export function validateExercise(ex: KinExercise): ValidationResult {
  const res = validateChain(ex.chain);
  const errors = [...res.errors];
  const err = (code: string, message: string, ref?: string) => errors.push({ code, message, ...(ref ? { ref } : {}) });
  if (!res.ok) return { ok: false, errors, warnings: res.warnings };
  const chain = ex.chain;
  const shaftIds = new Set(chain.shafts.map((s) => s.id));
  const linearIds = new Set((chain.linear ?? []).map((l) => l.id));
  const needsState = chain.clusters.length > 0;
  if (ex.state) {
    for (const c of chain.clusters)
      if (!ex.state[c.id] || !c.options.includes(ex.state[c.id] as string))
        err('state.invalid', `State does not select a valid option of cluster ${c.id}`, c.id);
  }
  for (const a of ex.asks) {
    const st = a.state ?? ex.state;
    if (a.state)
      for (const c of chain.clusters)
        if (!a.state[c.id] || !c.options.includes(a.state[c.id] as string))
          err('state.invalid', `Ask "${a.type}": state does not select a valid option of cluster ${c.id}`, c.id);
    const topo = st || !needsState ? topology(chain, st ?? {}) : null;
    if (STATE_DEPENDENT.has(a.type) || (a.type === 'feedPerRev' && !a.max)) {
      if (needsState && !st) err('ask.state', `Ask "${a.type}" needs a cluster state`);
    }
    const shaft = 'shaft' in a ? a.shaft : undefined;
    if (shaft !== undefined) {
      if (!shaftIds.has(shaft)) err('ask.ref', `Ask "${a.type}": unknown shaft ${shaft}`, shaft);
      else if (topo && STATE_DEPENDENT.has(a.type) && !topo.reached.has(shaft))
        err('ask.disconnected', `Ask "${a.type}": shaft ${shaft} is not driven in this state`, shaft);
    }
    if (a.type === 'direction' && topo && !topo.directionDefined.has(a.shaft))
      err('ask.direction', `Direction of ${a.shaft} is not defined (non-parallel axes on the way)`, a.shaft);
    if ((a.type === 'linearSpeed' || a.type === 'feedPerMin' || a.type === 'feedPerRev') && !linearIds.has(a.output))
      err('ask.ref', `Ask "${a.type}": unknown output ${a.output}`, a.output);
    if (a.type === 'torquePower' && !chain.input.power) err('ask.power', 'torquePower needs an input power');
    if (a.type === 'indexing' && (!posInt(a.N) || !ex.data?.platesHoles?.length))
      err('ask.indexing', 'indexing needs N > 0 and a plate set in data.platesHoles');
    if (a.type === 'changeGears' && !ex.data?.changeGears?.length) err('ask.changeGears', 'changeGears needs a gear set');
    if (a.type === 'changeGears' && a.fixedRatio && a.fixedRatio.n <= 0n) err('ask.changeGears', 'changeGears: fixedRatio must be positive');
    if (a.type === 'pitchDiameter' && !chain.elements.some((e) => e.id === a.element && (e.kind === 'rack' || (e.kind === 'gear' && e.module))))
      err('ask.ref', `pitchDiameter: ${a.element} must be a rack pinion or a gear with module`, a.element);
    if (a.type === 'missingTeeth' && !chain.elements.some((e) => e.id === a.element))
      err('ask.ref', `missingTeeth: unknown element ${a.element}`, a.element);
  }
  return { ok: errors.length === 0, errors, warnings: res.warnings };
}
