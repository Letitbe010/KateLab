/**
 * Automatic layout of a kinematic schema (spec §6), in the usual machine-tool
 * gearbox style: shafts horizontal, one under the other in the order power
 * reaches them; one column per element from left to right; the options of a
 * sliding cluster in adjacent columns (one block); meshing gears in the same
 * column so their pitch circles touch.
 *
 * Pure geometry (SVG user units). No transmission logic.
 */
import type { Chain, Element, ElementId, LinearId, ShaftId } from './model';
import { toNumber } from './rational';

/**
 * A shaft is a straight line: horizontal (o = 'h': y = c, x from a0 to a1) or
 * vertical (o = 'v': x = c, y from a0 to a1).
 */
export interface ShaftLayout {
  o: 'h' | 'v';
  c: number;
  a0: number;
  a1: number;
  row?: number;
  /** Label position; null hides it. Default: left of a horizontal shaft. */
  label?: { x: number; y: number; anchor?: 'start' | 'middle' | 'end' } | null;
  /** Speed tag position (left-centre of the tag); null hides it. */
  tag?: { x: number; y: number } | null;
}

/**
 * Element placement.
 *  - Both shafts parallel: `at` is the coordinate along the shafts (x for
 *    horizontal shafts) where the pair sits; r1/r2 are the drawn radii.
 *  - Shafts crossing (bevel, worm): the pair sits at the crossing point; `off`
 *    moves each gear away from it along its own shaft (default 14).
 *  - Screws: `at` is where the thread starts, `len` its length.
 * n1/n2 are optional gear names (e.g. "Z4") shown instead of the bare numbers.
 */
export interface ElementLayout {
  at: number;
  r1: number;
  r2: number;
  n1?: string;
  n2?: string;
  off?: number;
  len?: number;
}

export interface SchemaLayout {
  width: number;
  height: number;
  /** Top-left corner of the view box (default 0, 0). */
  origin?: { x: number; y: number };
  shafts: Record<ShaftId, ShaftLayout>;
  elements: Record<ElementId, ElementLayout>;
  linear: Record<LinearId, { x: number; y: number }>;
  motor: { x: number; y: number };
  /** Sliding block: range along its shaft; `arrow` = cross coordinate of the double arrow (null: none). */
  clusters: Record<string, { a0: number; a1: number; shaft: ShaftId; arrow?: number | null }>;
  /** Free annotations. */
  texts?: { x: number; y: number; eu: string; es: string; anchor?: 'start' | 'middle' | 'end' }[];
  /** Hand-made layout (speed tags next to the shafts instead of a right-hand column). */
  manual?: boolean;
  /** With gear names (n1/n2): also print the tooth count under the name (default true). */
  showTeeth?: boolean;
}

export const LAYOUT = {
  marginLeft: 120, // room for shaft labels and the motor
  marginRight: 150, // room for the speed tags
  marginTop: 64,
  marginBottom: 56,
  rowGap: 120, // default when no spur gear joins the two rows
  pxPerTooth: 1.3,
  minGap: 72,
  maxGap: 150,
  rackExtra: 46, // extra space under a shaft that drives a rack
  colGear: 46,
  colCluster: 28,
  colBelt: 60,
  colWorm: 64,
  colLinear: 150,
  minR: 9,
};

const isLinearEl = (e: Element): e is Extract<Element, { output: string }> => 'output' in e;

/**
 * Shaft order: depth-first from the input over every element (all cluster options),
 * visiting the smaller branch first so that a long chain keeps adjacent rows.
 */
export function shaftOrder(chain: Chain): ShaftId[] {
  const nbrs = new Map<ShaftId, ShaftId[]>();
  for (const s of chain.shafts) nbrs.set(s.id, []);
  for (const e of chain.elements) {
    if (isLinearEl(e)) continue;
    nbrs.get(e.from)?.push(e.to);
    nbrs.get(e.to)?.push(e.from);
  }
  // spanning tree (BFS) to measure branch sizes
  const parent = new Map<ShaftId, ShaftId | null>([[chain.input.shaft, null]]);
  const bfs = [chain.input.shaft];
  for (let i = 0; i < bfs.length; i++) {
    const s = bfs[i] as ShaftId;
    for (const o of nbrs.get(s) ?? [])
      if (!parent.has(o)) {
        parent.set(o, s);
        bfs.push(o);
      }
  }
  const children = (s: ShaftId) => [...new Set(nbrs.get(s) ?? [])].filter((o) => parent.get(o) === s);
  const size = new Map<ShaftId, number>();
  for (const s of [...bfs].reverse()) size.set(s, 1 + children(s).reduce((a, c) => a + (size.get(c) ?? 0), 0));
  const order: ShaftId[] = [];
  const visit = (s: ShaftId) => {
    order.push(s);
    for (const c of children(s).sort((a, b) => (size.get(a) as number) - (size.get(b) as number))) visit(c);
  };
  visit(chain.input.shaft);
  for (const s of chain.shafts) if (!order.includes(s.id)) order.push(s.id); // disconnected ones last
  return order;
}

export function autoLayout(chain: Chain): SchemaLayout {
  const L = LAYOUT;
  const order = shaftOrder(chain);
  const row = new Map(order.map((s, i) => [s, i] as const));

  // rows: extra room under shafts that drive racks
  const rackUnder = new Set(chain.elements.filter((e) => e.kind === 'rack').map((e) => e.from));
  // gap between consecutive rows: proportional to the largest tooth sum of a spur pair joining them
  const gapAfter = order.map((s, i) => {
    const next = order[i + 1];
    let g = 0;
    for (const e of chain.elements) {
      if (e.kind !== 'gear' || e.internal) continue;
      if ((e.from === s && e.to === next) || (e.to === s && e.from === next)) g = Math.max(g, (e.z1 + e.z2) * L.pxPerTooth);
    }
    return g ? Math.min(L.maxGap, Math.max(L.minGap, g)) : L.rowGap;
  });
  const ys: number[] = [];
  let y = L.marginTop;
  order.forEach((s, i) => {
    ys[i] = y;
    y += (gapAfter[i] as number) + (rackUnder.has(s) ? L.rackExtra : 0);
  });
  const yOf = (s: ShaftId) => ys[row.get(s) as number] as number;

  // element order: by the row of the upper shaft, then declaration; cluster options stay together
  const clusterOf = new Map<ElementId, string>();
  for (const c of chain.clusters) for (const o of c.options) clusterOf.set(o, c.id);
  const upper = (e: Element) => (isLinearEl(e) ? (row.get(e.from) as number) + 0.5 : Math.min(row.get(e.from) as number, row.get(e.to) as number));
  const idx = new Map(chain.elements.map((e, i) => [e.id, i] as const));
  const groups: Element[][] = [];
  const placed = new Set<ElementId>();
  const sorted = [...chain.elements].sort((a, b) => upper(a) - upper(b) || (idx.get(a.id) as number) - (idx.get(b.id) as number));
  for (const e of sorted) {
    if (placed.has(e.id)) continue;
    const cid = clusterOf.get(e.id);
    if (cid) {
      const c = chain.clusters.find((k) => k.id === cid);
      const g = (c?.options ?? []).map((o) => chain.elements.find((x) => x.id === o)).filter((x): x is Element => !!x);
      g.forEach((x) => placed.add(x.id));
      groups.push(g);
    } else {
      placed.add(e.id);
      groups.push([e]);
    }
  }

  const elements: SchemaLayout['elements'] = {};
  const linear: SchemaLayout['linear'] = {};
  const clusters: SchemaLayout['clusters'] = {};
  let x = L.marginLeft + 56 + (groups[0]?.[0]?.kind === 'rack' ? 50 : 0);
  const span = (e: Element) => (isLinearEl(e) ? 0 : Math.abs(yOf(e.to) - yOf(e.from)));
  for (const g of groups) {
    const isCluster = g.length > 1 || clusterOf.has((g[0] as Element).id);
    const x0 = x;
    g.forEach((e, k) => {
      if (k > 0) x += L.colCluster;
      const gap = span(e);
      let r1 = 0;
      let r2 = 0;
      switch (e.kind) {
        case 'gear':
        case 'bevel':
        case 'chain': {
          if (e.kind === 'chain') {
            const m = Math.max(e.z1, e.z2);
            r1 = Math.max(L.minR, (34 * e.z1) / m);
            r2 = Math.max(L.minR, (34 * e.z2) / m);
          } else if (e.kind === 'gear' && e.internal) {
            // ring drawn larger, pinion inside: r_ring − r_pinion = gap (capped for legibility)
            const big = Math.max(e.z1, e.z2);
            const s = Math.min(gap / Math.max(1, Math.abs(e.z2 - e.z1)), (2 * gap) / big);
            r1 = Math.max(L.minR, s * e.z1);
            r2 = Math.max(L.minR, s * e.z2);
          } else {
            r1 = Math.max(L.minR, (gap * e.z1) / (e.z1 + e.z2));
            r2 = Math.max(L.minR, (gap * e.z2) / (e.z1 + e.z2));
          }
          break;
        }
        case 'belt': {
          const d1 = toNumber(e.d1);
          const d2 = toNumber(e.d2);
          const m = Math.max(d1, d2);
          r1 = Math.max(L.minR, (40 * d1) / m);
          r2 = Math.max(L.minR, (40 * d2) / m);
          break;
        }
        case 'worm':
          r1 = 10;
          r2 = Math.max(L.minR, gap - 10);
          break;
        case 'clutch':
          r1 = r2 = 10;
          break;
        case 'rack':
          r1 = Math.max(14, Math.min(34, e.z * 1.1));
          linear[e.output] = { x, y: yOf(e.from) + r1 + 6 };
          break;
        case 'screw':
          r1 = 8;
          linear[e.output] = { x: x + 60, y: yOf(e.from) };
          break;
      }
      elements[e.id] = e.kind === 'screw' ? { at: x, r1, r2, len: 120 } : { at: x, r1, r2 };
    });
    if (isCluster) {
      const first = g[0] as Element;
      const slide = isLinearEl(first) ? first.from : first.to;
      clusters[clusterOf.get(first.id) as string] = { a0: x0 - 12, a1: x + 12, shaft: slide };
    }
    const last = g[g.length - 1] as Element;
    x +=
      last.kind === 'rack' || last.kind === 'screw'
        ? L.colLinear
        : last.kind === 'belt' || last.kind === 'chain'
          ? L.colBelt
          : last.kind === 'worm'
            ? L.colWorm
            : isCluster
              ? L.colGear + 8
              : L.colGear;
  }
  const width = x + L.marginRight;

  // shaft extents: from the first to the last element touching it
  const shafts: SchemaLayout['shafts'] = {};
  for (const s of order) {
    const xs: number[] = [];
    for (const e of chain.elements) {
      const p = elements[e.id];
      if (!p) continue;
      if (e.from === s || (!isLinearEl(e) && e.to === s)) {
        xs.push(p.at);
        if (e.kind === 'screw' && e.from === s) xs.push(p.at + 120);
        if (e.kind === 'rack' && e.from === s) xs.push(p.at + 20);
      }
    }
    const isInput = s === chain.input.shaft;
    const x0 = isInput ? L.marginLeft - 14 : Math.min(...xs, width) - 26;
    const x1 = Math.max(...xs, L.marginLeft) + 26;
    shafts[s] = { o: 'h', c: yOf(s), a0: Math.min(x0, x1 - 40), a1: x1, row: row.get(s) as number };
  }
  // vertical extents of everything drawn (gears above/below their shafts, cluster arrows, racks)
  let top = Infinity;
  let bottom = -Infinity;
  for (const e of chain.elements) {
    const p = elements[e.id];
    if (!p) continue;
    const y1 = yOf(e.from);
    top = Math.min(top, y1 - p.r1 - 24);
    bottom = Math.max(bottom, y1 + p.r1 + 24);
    if (!isLinearEl(e)) {
      const y2 = yOf(e.to);
      top = Math.min(top, y2 - p.r2 - 24);
      bottom = Math.max(bottom, y2 + p.r2 + (clusterOf.has(e.id) ? 54 : 24));
    } else if (e.kind === 'rack') bottom = Math.max(bottom, y1 + p.r1 + 50);
    else top = Math.min(top, y1 - 60);
  }
  for (const s of order) {
    top = Math.min(top, yOf(s) - (s === chain.input.shaft ? 50 : 30)); // input: room for the "n = ..." label
    bottom = Math.max(bottom, yOf(s) + 50);
  }
  const dy = 16 - top; // shift so that the topmost drawing sits 16 units below the edge
  for (const s of Object.values(shafts)) s.c += dy;
  for (const l of Object.values(linear)) l.y += dy;
  const height = bottom + dy + 16;
  return { width, height, shafts, elements, linear, clusters, motor: { x: L.marginLeft - 44, y: yOf(chain.input.shaft) + dy } };
}

/**
 * Checks a hand-made layout against its chain: every shaft and element placed,
 * crossing shafts only for bevel and worm pairs, crossing points inside both shafts.
 * Returns a list of problems (empty = usable).
 */
export function checkLayout(chain: Chain, L: SchemaLayout): string[] {
  const out: string[] = [];
  for (const s of chain.shafts) if (!L.shafts[s.id]) out.push(`shaft ${s.id} not placed`);
  for (const l of chain.linear ?? []) if (!L.linear[l.id]) out.push(`output ${l.id} not placed`);
  for (const c of chain.clusters) if (!L.clusters[c.id]) out.push(`cluster ${c.id} not placed`);
  const inside = (s: { a0: number; a1: number }, v: number) => v >= Math.min(s.a0, s.a1) && v <= Math.max(s.a0, s.a1);
  for (const e of chain.elements) {
    const p = L.elements[e.id];
    if (!p) {
      out.push(`element ${e.id} not placed`);
      continue;
    }
    if (isLinearEl(e)) continue;
    const a = L.shafts[e.from];
    const b = L.shafts[e.to];
    if (!a || !b) continue;
    if (a.o !== b.o) {
      if (e.kind !== 'bevel' && e.kind !== 'worm') out.push(`element ${e.id}: ${e.kind} cannot join crossing shafts`);
      // bevel shafts stop just short of the crossing point: allow the gear offset plus a margin
      const tol = (p.off ?? 14) + 16;
      const [h, v] = a.o === 'h' ? [a, b] : [b, a];
      const near = (s: { a0: number; a1: number }, x: number) => inside({ a0: Math.min(s.a0, s.a1) - tol, a1: Math.max(s.a0, s.a1) + tol }, x);
      if (!near(h, v.c) || !near(v, h.c)) out.push(`element ${e.id}: shafts do not reach their crossing point`);
    } else if (e.kind !== 'clutch' || a.c !== b.c) {
      if (!inside(a, p.at) || !inside(b, p.at)) out.push(`element ${e.id}: position ${p.at} outside its shafts`);
    }
  }
  return out;
}

/** Roman numerals for shaft labels (1 → I ... 20 → XX). */
export function roman(n: number): string {
  const t: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of t)
    while (n >= v) {
      out += s;
      n -= v;
    }
  return out;
}
