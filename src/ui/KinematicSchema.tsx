/**
 * Kinematic schema (spec §6), drawn as SVG in the style of kate-zinematikoa.html:
 * shafts as thick lines (horizontal or vertical), gears as narrow rectangles seen
 * edge-on, sliding clusters with a hub bar, the active power path in orange,
 * linear outputs in blue. Works with the automatic layout or a hand-made one.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ElementLayout, type SchemaLayout, type ShaftLayout, SLIDE_PITCH, autoLayout, slidePlan } from '../core/layout';
import { type Chain, type Element, type State, activeElements } from '../core/model';
import { toString as rs } from '../core/rational';
import { topology } from '../core/validate';

export type Lang = 'eu' | 'es';

const TXT = {
  eu: {
    zoomIn: 'Handitu',
    zoomOut: 'Txikitu',
    fit: 'Doitu',
    table: 'Elementuen taula',
    el: 'Elementua',
    kind: 'Mota',
    data: 'Datuak',
    shafts: 'Ardatzak',
    active: 'Aktiboa',
    yes: 'bai',
    no: 'ez',
    clickCluster: 'Ukitu gurpil-multzo bat edo erabili botoiak posizioz aldatzeko',
    kinds: { gear: 'engranajea', bevel: 'engranaje konikoa', belt: 'uhala', chain: 'katea', worm: 'torloju amaigabea', rack: 'pinoi-kremailera', screw: 'aitzinapen-torlojua', clutch: 'enbragea / kardana' },
    schema: 'Eskema zinematikoa',
  },
  es: {
    zoomIn: 'Ampliar',
    zoomOut: 'Reducir',
    fit: 'Ajustar',
    table: 'Tabla de elementos',
    el: 'Elemento',
    kind: 'Tipo',
    data: 'Datos',
    shafts: 'Ejes',
    active: 'Activo',
    yes: 'sí',
    no: 'no',
    clickCluster: 'Toca un tren desplazable o usa los botones para cambiarlo de posición',
    kinds: { gear: 'engranaje', bevel: 'engranaje cónico', belt: 'correa', chain: 'cadena', worm: 'tornillo sinfín', rack: 'piñón-cremallera', screw: 'husillo de avance', clutch: 'embrague / cardán' },
    schema: 'Esquema cinemático',
  },
} as const;

const C = {
  ink: '#0f1b2d',
  muted: '#5a6779',
  onFill: '#ffd29a',
  onStroke: '#b45309',
  offFill: '#eef1f5',
  offStroke: '#8a96a6',
  blue: '#1d5fd1',
  blueFill: '#dbe7fb',
  mag: '#c0267d',
};

export interface KinematicSchemaProps {
  chain: Chain;
  state: State;
  layout?: SchemaLayout;
  lang?: Lang;
  locked?: boolean;
  onStateChange?: (s: State) => void;
  /** Formatted speed per shaft (e.g. "360 rpm"); shafts in `masked` show "?". */
  speeds?: Record<string, string>;
  masked?: string[];
  highlight?: boolean; // colour the power path (default true)
  /** Colour only these elements (step-by-step worked exercises); overrides the power path. */
  lit?: string[];
}

function elementData(e: Element): string {
  switch (e.kind) {
    case 'gear':
    case 'bevel':
    case 'chain':
      return `Z ${e.z1} / ${e.z2}${'module' in e && e.module ? `, m = ${rs(e.module)}` : ''}${e.kind === 'gear' && e.internal ? ' (int.)' : ''}`;
    case 'belt':
      return `Ø ${rs(e.d1)} / ${rs(e.d2)}${e.crossed ? ' (X)' : ''}${e.slip ? `, s = ${rs(e.slip)}` : ''}`;
    case 'worm':
      return `k = ${e.starts}, Z = ${e.z}`;
    case 'rack':
      return e.pitch ? `Z = ${e.z}, p = ${rs(e.pitch)} mm` : `Z = ${e.z}, m = ${rs(e.module as NonNullable<typeof e.module>)}`;
    case 'screw':
      return `P = ${rs(e.pitch)} mm, k = ${e.starts}`;
    case 'clutch':
      return '1:1';
  }
}

type O = 'h' | 'v';
/** Point on a shaft: `a` along it, `w` across it. */
const pt = (o: O, a: number, w: number): [number, number] => (o === 'h' ? [a, w] : [w, a]);
/** Rectangle spanning [a0,a1] along and [w0,w1] across. */
function rectAW(o: O, a0: number, a1: number, w0: number, w1: number) {
  const [x0, y0] = pt(o, Math.min(a0, a1), Math.min(w0, w1));
  const [x1, y1] = pt(o, Math.max(a0, a1), Math.max(w0, w1));
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}
const path = (o: O, pts: [number, number][], close = true) =>
  pts
    .map(([a, w], i) => {
      const [x, y] = pt(o, a, w);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join('') + (close ? 'Z' : '');

interface Slide {
  o: O;
  /** Rest position of each block gear along its shaft. */
  base: Record<string, number>;
  /** Current shift of the block (selected pair aligned). */
  d: number;
  hub: [number, number];
  /** Largest radius in the block: common baseline of its labels. */
  maxR: number;
  parts: JSX.Element[];
  labels: JSX.Element[];
}
const slideShift = (b: Slide) => (b.o === 'h' ? `translate(${b.d}px, 0px)` : `translate(0px, ${b.d}px)`);

export function KinematicSchema(props: KinematicSchemaProps) {
  const { chain, state, lang = 'eu', locked = false, onStateChange, speeds, masked = [], highlight = true, lit: litOnly } = props;
  const t = TXT[lang];
  const L = useMemo(() => props.layout ?? chain.layout ?? autoLayout(chain), [props.layout, chain]);

  // ---- zoom: CSS width of the SVG; the container scrolls (native pan on touch) ----
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(800);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // "fit" never goes below 0.86 so labels stay ≥ 12 px (14 px × 0.86)
  const fit = Math.max(0.86, Math.min(1.25, (boxW - 2) / L.width));
  const k = zoom ?? fit;

  const act = new Set(activeElements(chain, state).map((e) => e.id));
  const topo = topology(chain, state);
  const litSet = litOnly ? new Set(litOnly) : null;
  const on = (e: Element) => (litSet ? litSet.has(e.id) : highlight && act.has(e.id) && topo.reached.has(e.from));
  const clusterOf = new Map<string, string>();
  for (const c of chain.clusters) for (const o of c.options) clusterOf.set(o, c.id);
  const canSwitch = !locked && !!onStateChange && chain.clusters.length > 0;

  const select = (cid: string, opt: string) => {
    if (canSwitch) onStateChange?.({ ...state, [cid]: opt });
  };
  const cycle = (cid: string) => {
    const c = chain.clusters.find((x) => x.id === cid);
    if (!c) return;
    const i = c.options.indexOf(state[cid] ?? (c.options[0] as string));
    select(cid, c.options[(i + 1) % c.options.length] as string);
  };

  const S = (id: string): ShaftLayout => L.shafts[id] ?? { o: 'h', c: 0, a0: 0, a1: 0 };
  const parts: JSX.Element[] = [];
  const labels: JSX.Element[] = [];
  let key = 0;
  const K = () => `k${key++}`;
  const fill = (lit: boolean) => (lit ? C.onFill : C.offFill);
  const stroke = (lit: boolean) => (lit ? C.onStroke : C.offStroke);

  const text = (x: number, y: number, s: string, o: { lit?: boolean; anchor?: 'start' | 'middle' | 'end'; color?: string; size?: number; bold?: boolean } = {}, into: JSX.Element[] = labels) =>
    into.push(
      <text key={K()} x={x} y={y} fontSize={o.size ?? 14} textAnchor={o.anchor ?? 'middle'} fill={o.color ?? (o.lit === false ? C.muted : C.ink)} fontWeight={(o.bold ?? o.lit) ? 700 : 400}>
        {s}
      </text>,
    );

  /** Gear (or pulley) seen edge-on on shaft s at position a along it. */
  const gear = (s: ShaftLayout, a: number, r: number, lit: boolean, w = 14, sliding = false, into: JSX.Element[] = parts) => {
    into.push(<rect key={K()} {...rectAW(s.o, a - w / 2, a + w / 2, s.c - r, s.c + r)} rx={1.5} fill={fill(lit)} stroke={stroke(lit)} strokeWidth={lit ? 1.7 : 1.1} />);
    const [x, y] = pt(s.o, a, s.c);
    into.push(
      sliding ? (
        <line key={K()} x1={x - 3} y1={y + 4} x2={x + 3} y2={y - 4} stroke={C.ink} strokeWidth={1.4} />
      ) : (
        <path key={K()} d={`M${x - 3},${y - 3}L${x + 3},${y + 3}M${x - 3},${y + 3}L${x + 3},${y - 3}`} stroke={C.ink} strokeWidth={1.3} />
      ),
    );
  };

  /** Label of a gear on the outer side of shaft s (away from the mating shaft): name, then the value smaller. */
  const gearLabel = (s: ShaftLayout, a: number, r: number, otherC: number, name: string | undefined, value: string, lit: boolean, into: JSX.Element[] = labels, stagger = 0) => {
    const before = s.c < otherC;
    const main = name ?? value;
    const sub = name && value && L.showTeeth !== false ? value : undefined;
    if (s.o === 'h') {
      const st = stagger * (sub ? 30 : 15);
      const y = before ? s.c - r - 7 - st : s.c + r + 18 + st;
      text(a, y, main, { lit }, into);
      if (sub) text(a, before ? y - 15 : y + 15, sub, { size: 12, color: C.muted, bold: false }, into);
    } else {
      text(before ? s.c - r - 6 : s.c + r + 6, a + 5, sub ? `${main} (${sub})` : main, { lit, anchor: before ? 'end' : 'start' }, into);
    }
  };

  // ---- shafts ----
  const autoTagX = L.width - 136;
  for (const [id, s] of Object.entries(L.shafts)) {
    const sh = chain.shafts.find((x) => x.id === id);
    const driven = topo.reached.has(id);
    const [x0, y0] = pt(s.o, s.a0, s.c);
    const [x1, y1] = pt(s.o, s.a1, s.c);
    parts.push(<line key={K()} x1={x0} y1={y0} x2={x1} y2={y1} stroke={driven || !highlight ? C.ink : C.offStroke} strokeWidth={2.6} />);
    for (const a of [s.a0 + 6, s.a1 - 6]) parts.push(<rect key={K()} {...rectAW(s.o, a - 4, a + 4, s.c - 7, s.c + 7)} fill="#fff" stroke={C.ink} strokeWidth={1.2} />);
    if (s.label !== null) {
      const name = sh && sh.label.length <= 3 ? sh.label : id;
      const lp = s.label ?? (s.o === 'h' ? { x: 20, y: s.c + 5, anchor: 'start' as const } : { x: s.c, y: s.a0 - 10, anchor: 'middle' as const });
      text(lp.x, lp.y, name, { anchor: lp.anchor ?? 'start', size: 15, bold: true });
    }
    if (speeds && speeds[id] !== undefined && s.tag !== null) {
      const isMasked = masked.includes(id);
      const txt = isMasked ? '? rpm' : (speeds[id] as string);
      const w = 16 + txt.length * 8;
      const tp = s.tag ?? (L.manual ? (s.o === 'h' ? { x: s.a1 + 10, y: s.c } : { x: s.c + 10, y: s.a0 - 16 }) : { x: autoTagX, y: s.c });
      const leader = !s.tag && !L.manual && s.o === 'h';
      labels.push(
        <g key={K()}>
          {leader && <line x1={s.a1 + 2} y1={s.c} x2={tp.x} y2={s.c} stroke={C.blue} strokeWidth={1} strokeDasharray="2 4" />}
          <rect x={tp.x} y={tp.y - 13} width={w} height={26} rx={6} fill="#fff" stroke={C.blue} strokeWidth={1.3} />
          <text x={tp.x + 8} y={tp.y + 5} fontSize={14} fontWeight={700} fill={isMasked ? C.mag : C.blue}>
            {txt}
          </text>
        </g>,
      );
    }
  }

  // ---- motor: circle on the axis of the input shaft, joined to its nearer end ----
  const inS = L.shafts[chain.input.shaft];
  if (inS) {
    const { x: mx, y: my } = L.motor;
    const A = pt(inS.o, inS.a0, inS.c);
    const B = pt(inS.o, inS.a1, inS.c);
    const near = Math.hypot(A[0] - mx, A[1] - my) < Math.hypot(B[0] - mx, B[1] - my) ? A : B;
    parts.push(<line key={K()} x1={mx} y1={my} x2={near[0]} y2={near[1]} stroke={C.ink} strokeWidth={2.2} />);
    parts.push(<circle key={K()} cx={mx} cy={my} r={16} fill="#fff" stroke={C.ink} strokeWidth={1.8} />);
    text(mx, my + 5, 'M', { size: 15, bold: true });
    text(mx, my - 26, `n = ${rs(chain.input.n)} rpm`, { lit: true });
  }

  // ---- sliding blocks: the gears on the sliding shaft form one block that moves
  // along it, so only the selected pair is in mesh and the others run free ----
  const slides = new Map<string, Slide>();
  for (const c of chain.clusters) {
    const cl = L.clusters[c.id];
    if (!cl) continue;
    const plan = slidePlan(chain, L, c.id, state[c.id]);
    if (!plan) continue;
    const s = S(cl.shaft);
    const maxR = Math.max(
      ...c.options.map((o) => {
        const e = chain.elements.find((x) => x.id === o);
        const q = L.elements[o];
        return !e || !q || !('to' in e) ? 0 : e.from === cl.shaft ? q.r1 : q.r2;
      }),
    );
    const blk: Slide = { ...plan, o: s.o, maxR, parts: [], labels: [] };
    blk.parts.push(<rect key={K()} {...rectAW(s.o, plan.hub[0], plan.hub[1], s.c - 5, s.c + 5)} rx={3} fill="#cfd6df" stroke={C.ink} strokeWidth={1} />);
    slides.set(c.id, blk);
  }

  // ---- cluster hubs (under the gears) ----
  for (const [cid, cl] of Object.entries(L.clusters)) {
    const s = S(cl.shaft);
    if (!slides.has(cid)) parts.push(<rect key={K()} {...rectAW(s.o, cl.a0, cl.a1, s.c - 5, s.c + 5)} rx={3} fill="#cfd6df" stroke={C.ink} strokeWidth={1} />);
    if (cl.arrow === null) continue;
    const c = chain.clusters.find((x) => x.id === cid);
    let w = cl.arrow;
    if (w === undefined) {
      const opts = (c?.options ?? []).map((o) => chain.elements.find((e) => e.id === o)).filter((e): e is Element => !!e);
      const maxR = Math.max(...opts.map((e) => ('to' in e && e.to === cl.shaft ? L.elements[e.id]?.r2 : L.elements[e.id]?.r1) ?? 0));
      w = s.c + maxR + (slides.has(cid) ? 48 : 30); // a sliding block has staggered labels above the arrow
    }
    labels.push(<path key={K()} d={path(s.o, [[cl.a0 + 4, w], [cl.a1 - 4, w]], false)} stroke={C.ink} strokeWidth={1.4} markerStart="url(#arr)" markerEnd="url(#arr)" />);
    const [lx, ly] = pt(s.o, (cl.a0 + cl.a1) / 2, w + 18);
    text(lx, ly, c?.label ?? cid, { color: C.muted, size: 13 });
  }

  // ---- elements ----
  for (const e of chain.elements) {
    const p: ElementLayout | undefined = L.elements[e.id];
    if (!p) continue;
    const lit = on(e);
    const sliding = clusterOf.has(e.id);
    const slideOn = sliding ? L.clusters[clusterOf.get(e.id) as string]?.shaft : undefined;

    if ('to' in e) {
      const s1 = S(e.from);
      const s2 = S(e.to);
      if (s1.o === s2.o) {
        const o = s1.o;
        const a = p.at;
        switch (e.kind) {
          case 'gear':
          case 'chain': {
            const blk = sliding ? slides.get(clusterOf.get(e.id) as string) : undefined;
            if (blk && e.kind === 'gear') {
              // the gear on the sliding shaft is drawn in the block (rest position); its mate stays
              const fromSlides = slideOn === e.from;
              const [sl, fx] = fromSlides ? [s1, s2] : [s2, s1];
              const [rl, rf] = fromSlides ? [p.r1, p.r2] : [p.r2, p.r1];
              const [nl, nf] = fromSlides ? [p.n1, p.n2] : [p.n2, p.n1];
              const [zl, zf] = fromSlides ? [e.z1, e.z2] : [e.z2, e.z1];
              const b = blk.base[e.id] as number;
              gear(sl, b, rl, lit, 14, true, blk.parts);
              gear(fx, a, rf, lit);
              // neighbouring block gears are only SLIDE_PITCH apart: alternate the label height
              const rank = Math.round((b - Math.min(...Object.values(blk.base))) / SLIDE_PITCH);
              gearLabel(sl, b, blk.maxR, fx.c, nl, `${zl}`, lit, blk.labels, rank % 2);
              gearLabel(fx, a, rf, sl.c, nf, `${zf}`, lit);
              break;
            }
            gear(s1, a, p.r1, lit, 14, sliding && slideOn === e.from);
            gear(s2, a, p.r2, lit, 14, sliding && slideOn === e.to);
            if (e.kind === 'chain') {
              const [lo, hi] = s1.c < s2.c ? [s1.c - p.r1, s2.c + p.r2] : [s2.c - p.r2, s1.c + p.r1];
              for (const d of [-9, 9])
                parts.push(<path key={K()} d={path(o, [[a + d, lo], [a + d, hi]], false)} stroke={lit ? C.onStroke : C.muted} strokeWidth={1.6} strokeDasharray="5 4" />);
            }
            gearLabel(s1, a, p.r1, s2.c, p.n1, `${e.z1}`, lit);
            gearLabel(s2, a, p.r2, s1.c, p.n2, `${e.z2}`, lit);
            break;
          }
          case 'bevel': {
            // trapezoids, the narrow end towards the mating gear
            for (const [s, r, other] of [
              [s1, p.r1, s2.c],
              [s2, p.r2, s1.c],
            ] as const) {
              const d = other > s.c ? 1 : -1;
              parts.push(<path key={K()} d={path(o, [[a - 8, s.c - d * r], [a + 8, s.c - d * r], [a + 8, s.c + d * r], [a, s.c + d * r]])} fill={fill(lit)} stroke={stroke(lit)} strokeWidth={1.4} />);
            }
            gearLabel(s1, a, p.r1, s2.c, p.n1, `${e.z1}`, lit);
            gearLabel(s2, a, p.r2, s1.c, p.n2, `${e.z2}`, lit);
            break;
          }
          case 'belt': {
            gear(s1, a, p.r1, lit, 24);
            gear(s2, a, p.r2, lit, 24);
            const top = s1.c < s2.c ? s1.c + p.r1 : s2.c + p.r2;
            const bot = s1.c < s2.c ? s2.c - p.r2 : s1.c - p.r1;
            if (e.crossed)
              parts.push(<path key={K()} d={path(o, [[a - 8, top], [a + 8, bot]], false) + path(o, [[a + 8, top], [a - 8, bot]], false)} stroke={lit ? '#8a5a14' : C.muted} strokeWidth={2.4} />);
            else parts.push(<rect key={K()} {...rectAW(o, a - 8, a + 8, top, Math.max(top, bot))} fill="#f3e3c8" stroke={C.ink} strokeWidth={1} />);
            gearLabel(s1, a, p.r1, s2.c, p.n1, `Ø${rs(e.d1)}`, lit);
            gearLabel(s2, a, p.r2, s1.c, p.n2, `Ø${rs(e.d2)}`, lit);
            break;
          }
          case 'worm': {
            parts.push(<rect key={K()} {...rectAW(o, a - 18, a + 18, s1.c - 10, s1.c + 10)} rx={3} fill={lit ? C.onFill : '#fff'} stroke={lit ? C.onStroke : C.ink} strokeWidth={1.4} />);
            for (let i = -12; i <= 12; i += 6)
              parts.push(<path key={K()} d={path(o, [[a + i - 3, s1.c + 9], [a + i + 3, s1.c - 9]], false)} stroke={lit ? C.onStroke : C.muted} strokeWidth={1.2} />);
            gear(s2, a, p.r2, lit);
            const [kx, ky] = pt(o, a + 24, s1.c + (s1.c < s2.c ? -14 : 24));
            text(kx, ky, `k = ${e.starts}`, { lit, anchor: 'start' });
            gearLabel(s2, a, p.r2, s1.c, p.n2, `Z = ${e.z}`, lit);
            break;
          }
          case 'clutch': {
            if (s1.c === s2.c) {
              // coaxial: cardan shaft between the facing ends
              const [ea, eb] = s1.a1 <= s2.a0 ? [s1.a1, s2.a0] : [s2.a1, s1.a0];
              const [x0, y0] = pt(o, ea + 3, s1.c);
              const [x1, y1] = pt(o, eb - 3, s1.c);
              parts.push(<line key={K()} x1={x0} y1={y0} x2={x1} y2={y1} stroke={C.ink} strokeWidth={7} strokeLinecap="round" />);
              parts.push(<line key={K()} x1={x0} y1={y0} x2={x1} y2={y1} stroke={fill(lit)} strokeWidth={4.4} strokeLinecap="round" />);
              parts.push(<circle key={K()} cx={x0} cy={y0} r={3.5} fill="#fff" stroke={C.ink} />);
              parts.push(<circle key={K()} cx={x1} cy={y1} r={3.5} fill="#fff" stroke={C.ink} />);
            } else {
              parts.push(<path key={K()} d={path(o, [[a, s1.c], [a, s2.c]], false)} stroke={C.ink} strokeWidth={2.2} />);
              for (const [s, other] of [
                [s1, s2.c],
                [s2, s1.c],
              ] as const) {
                const d = other > s.c ? 1 : -1;
                parts.push(<path key={K()} d={path(o, [[a - 9, s.c + d * 14], [a - 9, s.c + d * 8], [a + 9, s.c + d * 8], [a + 9, s.c + d * 14]], false)} fill="none" stroke={lit ? C.onStroke : C.ink} strokeWidth={1.8} />);
              }
            }
            break;
          }
        }
        if (sliding && canSwitch) {
          const lo = Math.min(s1.c - p.r1, s2.c - p.r2) - 4;
          const hi = Math.max(s1.c + p.r1, s2.c + p.r2) + 4;
          const cid = clusterOf.get(e.id) as string;
          parts.push(
            <rect key={K()} {...rectAW(o, a - 14, a + 14, lo, hi)} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => cycle(cid)} role="button" aria-label={chain.clusters.find((c) => c.id === cid)?.label ?? cid} />,
          );
        }
      } else {
        // crossing shafts (bevel, worm): the pair sits at the crossing point
        const H = s1.o === 'h' ? s1 : s2;
        const V = s1.o === 'h' ? s2 : s1;
        const X = V.c;
        const Y = H.c;
        const off = p.off ?? 14;
        const fromIsH = s1 === H;
        const rH = fromIsH ? p.r1 : p.r2;
        const rV = fromIsH ? p.r2 : p.r1;
        const nH = fromIsH ? p.n1 : p.n2;
        const nV = fromIsH ? p.n2 : p.n1;
        if (e.kind === 'bevel') {
          const zH = fromIsH ? e.z1 : e.z2;
          const zV = fromIsH ? e.z2 : e.z1;
          const hSide = (H.a0 + H.a1) / 2 < X ? -1 : 1; // side of the crossing where the shaft's body lies
          const vSide = (V.a0 + V.a1) / 2 < Y ? -1 : 1;
          const ah = X + hSide * off; // gear on the horizontal shaft; its narrow side faces the crossing
          parts.push(<path key={K()} d={path('h', [[ah + hSide * 7, Y - rH], [ah + hSide * 7, Y + rH], [ah - hSide * 7, Y + rH - 5], [ah - hSide * 7, Y - rH + 5]])} fill={fill(lit)} stroke={stroke(lit)} strokeWidth={1.4} />);
          const av = Y + vSide * off;
          parts.push(<path key={K()} d={path('v', [[av + vSide * 7, X - rV], [av + vSide * 7, X + rV], [av - vSide * 7, X + rV - 5], [av - vSide * 7, X - rV + 5]])} fill={fill(lit)} stroke={stroke(lit)} strokeWidth={1.4} />);
          text(ah, Y + (vSide < 0 ? rH + 18 : -rH - 8), nH ?? `${zH}`, { lit });
          text(X + (hSide < 0 ? rV + 6 : -rV - 6), av + 5, nV ?? `${zV}`, { lit, anchor: hSide < 0 ? 'start' : 'end' });
        } else if (e.kind === 'worm') {
          // wheel on the driven shaft at the crossing, worm on the driving shaft drawn over it
          const wheel = fromIsH ? V : H;
          const worm = fromIsH ? H : V;
          const wheelName = fromIsH ? nV : nH;
          gear(wheel, worm.c, p.r2, lit);
          parts.push(<rect key={K()} {...rectAW(worm.o, wheel.c - 20, wheel.c + 20, worm.c - 8, worm.c + 8)} rx={3} fill="#fff" stroke={C.ink} strokeWidth={1.3} />);
          for (let i = -14; i <= 14; i += 7)
            parts.push(<path key={K()} d={path(worm.o, [[wheel.c + i - 3, worm.c + 7], [wheel.c + i + 3, worm.c - 7]], false)} stroke={lit ? C.onStroke : C.muted} strokeWidth={1.4} />);
          const [cx, cy] = pt(wheel.o, worm.c, wheel.c);
          text(cx + 14, cy + 30, `k = ${e.starts}`, { lit, anchor: 'start', size: 13 });
          if (wheel.o === 'h') {
            text(cx + 22, cy - p.r2 + 4, wheelName ?? `Z = ${e.z}`, { lit, anchor: 'start' });
            if (wheelName && L.showTeeth !== false) text(cx + 22, cy - p.r2 + 19, `${e.z}`, { size: 12, color: C.muted });
          } else text(cx - p.r2 - 6, cy - 12, wheelName ? (L.showTeeth !== false ? `${wheelName} (${e.z})` : wheelName) : `Z = ${e.z}`, { lit, anchor: 'end' });
        }
      }
    } else {
      // linear outputs on a horizontal shaft
      const s = S(e.from);
      const lp = L.linear[e.output];
      const out = chain.linear?.find((l) => l.id === e.output);
      if (!lp) continue;
      const lab = out?.label ?? e.output;
      if (e.kind === 'rack') {
        gear(s, p.at, p.r1, lit);
        const ry = lp.y;
        const x = p.at;
        parts.push(<rect key={K()} x={x - 70} y={ry} width={140} height={10} fill={C.blueFill} stroke={C.blue} strokeWidth={1.4} />);
        for (let i = -66; i <= 66; i += 8) parts.push(<line key={K()} x1={x + i} y1={ry} x2={x + i + 4} y2={ry - 5} stroke={C.blue} strokeWidth={1.1} />);
        labels.push(<path key={K()} d={`M${x - 50},${ry + 24}H${x + 50}`} stroke={C.blue} strokeWidth={1.6} markerStart="url(#arrb)" markerEnd="url(#arrb)" />);
        text(x + 76, ry + 9, lab, { anchor: 'start', color: C.blue, bold: true });
        text(x, s.c - p.r1 - 7, p.n1 ?? (e.pitch ? `Z = ${e.z}, p = ${rs(e.pitch)} mm` : `Z = ${e.z}, m = ${rs(e.module as NonNullable<typeof e.module>)}`), { lit });
      } else {
        const len = p.len ?? 120;
        const pts: [number, number][] = [];
        for (let a = p.at; a <= p.at + len; a += 3) pts.push([a, s.c + 6 * Math.sin(((a - p.at) * 2 * Math.PI) / 14)]);
        parts.push(<path key={K()} d={path(s.o, pts, false)} fill="none" stroke={lit ? C.onStroke : C.ink} strokeWidth={1.6} />);
        parts.push(<rect key={K()} x={lp.x - 30} y={lp.y - 32} width={60} height={22} fill={C.blueFill} stroke={C.blue} strokeWidth={1.4} />);
        parts.push(<rect key={K()} x={lp.x - 12} y={lp.y - 10} width={24} height={20} fill="none" stroke={C.blue} strokeWidth={1.2} />);
        labels.push(<path key={K()} d={`M${lp.x - 40},${lp.y - 42}H${lp.x + 40}`} stroke={C.blue} strokeWidth={1.6} markerStart="url(#arrb)" markerEnd="url(#arrb)" />);
        text(lp.x, lp.y - 50, lab, { color: C.blue, bold: true });
        text(lp.x, lp.y + 26, `P = ${rs(e.pitch)} mm, k = ${e.starts}`, { lit });
      }
    }
  }

  for (const tx of L.texts ?? []) text(tx.x, tx.y, tx[lang], { anchor: tx.anchor ?? 'start', color: C.muted, size: 13 });

  const aria = `${t.schema}: ${chain.shafts.length} ${t.shafts.toLowerCase()}, ${chain.elements.length} ${t.el.toLowerCase()}`;
  const z = (f: number) => setZoom(Math.max(0.5, Math.min(3, k * f)));
  const optName = (id: string) => {
    const p = L.elements[id];
    return p?.n1 && p?.n2 ? `${p.n1}–${p.n2}` : id;
  };

  return (
    <div className="schema">
      {canSwitch && (
        <div className="cluster-bar">
          {chain.clusters.map((c) => (
            <div key={c.id} className="grp" role="group" aria-label={c.label}>
              <span>{c.label}</span>
              {c.options.map((o) => (
                <button key={o} className={state[c.id] === o ? 'small sel' : 'small'} aria-pressed={state[c.id] === o} onClick={() => select(c.id, o)}>
                  {optName(o)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="schema-tools">
        {canSwitch && <span className="schema-hint">{t.clickCluster}</span>}
        <button className="small" onClick={() => z(1 / 1.25)} aria-label={t.zoomOut}>
          −
        </button>
        <button className="small" onClick={() => setZoom(null)}>
          {t.fit}
        </button>
        <button className="small" onClick={() => z(1.25)} aria-label={t.zoomIn}>
          +
        </button>
      </div>
      <div className="schema-box" ref={box}>
        <svg viewBox={`${L.origin?.x ?? 0} ${L.origin?.y ?? 0} ${L.width} ${L.height}`} width={L.width * k} height={L.height * k} role="img" aria-label={aria} style={{ display: 'block', fontFamily: '"Segoe UI", Arial, sans-serif' }}>
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L10,5 L0,9z" fill={C.ink} />
            </marker>
            <marker id="arrb" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L10,5 L0,9z" fill={C.blue} />
            </marker>
          </defs>
          <g>{parts}</g>
          {[...slides.values()].map((b, i) => (
            <g key={`sp${i}`} className="slide" style={{ transform: slideShift(b) }}>
              {b.parts}
            </g>
          ))}
          <g>{labels}</g>
          {[...slides.values()].map((b, i) => (
            <g key={`sl${i}`} className="slide" style={{ transform: slideShift(b) }}>
              {b.labels}
            </g>
          ))}
        </svg>
      </div>
      <details className="schema-table">
        <summary>{t.table}</summary>
        <table>
          <thead>
            <tr>
              <th>{t.el}</th>
              <th>{t.kind}</th>
              <th>{t.data}</th>
              <th>{t.shafts}</th>
              <th>{t.active}</th>
            </tr>
          </thead>
          <tbody>
            {chain.elements.map((e) => (
              <tr key={e.id}>
                <td>{optName(e.id)}</td>
                <td>{t.kinds[e.kind]}</td>
                <td>{elementData(e)}</td>
                <td>{'to' in e ? `${e.from} → ${e.to}` : `${e.from} → ${e.output}`}</td>
                <td>{on(e) ? t.yes : t.no}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
