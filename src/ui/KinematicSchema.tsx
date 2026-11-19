/**
 * Kinematic schema (spec §6), drawn as SVG in the style of kate-zinematikoa.html:
 * shafts as thick horizontal lines, gears as narrow rectangles seen edge-on,
 * sliding clusters with a hub bar and a double arrow, the active power path in
 * orange, linear outputs in blue.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type SchemaLayout, autoLayout } from '../core/layout';
import { type Chain, type Element, type State, activeElements } from '../core/model';
import { toString as rs } from '../core/rational';
import { topology } from '../core/validate';

export type Lang = 'eu' | 'es';

const TXT = {
  eu: {
    motor: 'motorra',
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
    clickCluster: 'Ukitu gurpil-multzo bat posizioz aldatzeko',
    kinds: { gear: 'engranajea', bevel: 'engranaje konikoa', belt: 'uhala', chain: 'katea', worm: 'torloju amaigabea', rack: 'pinoi-kremailera', screw: 'aitzinapen-torlojua', clutch: 'enbragea' },
    schema: 'Eskema zinematikoa',
  },
  es: {
    motor: 'motor',
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
    clickCluster: 'Toca un tren desplazable para cambiarlo de posición',
    kinds: { gear: 'engranaje', bevel: 'engranaje cónico', belt: 'correa', chain: 'cadena', worm: 'tornillo sinfín', rack: 'piñón-cremallera', screw: 'husillo de avance', clutch: 'embrague' },
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
}

function elementData(e: Element): string {
  switch (e.kind) {
    case 'gear':
    case 'bevel':
    case 'chain':
      return `Z ${e.z1} / ${e.z2}${'module' in e && e.module ? `, m = ${rs(e.module).replace('.', ',')}` : ''}${e.kind === 'gear' && e.internal ? ' (int.)' : ''}`;
    case 'belt':
      return `Ø ${rs(e.d1)} / ${rs(e.d2)}${e.crossed ? ' (X)' : ''}${e.slip ? `, s = ${rs(e.slip)}` : ''}`;
    case 'worm':
      return `k = ${e.starts}, Z = ${e.z}`;
    case 'rack':
      return `Z = ${e.z}, m = ${rs(e.module)}`;
    case 'screw':
      return `P = ${rs(e.pitch)} mm, k = ${e.starts}`;
    case 'clutch':
      return '1:1';
  }
}

export function KinematicSchema(props: KinematicSchemaProps) {
  const { chain, state, lang = 'eu', locked = false, onStateChange, speeds, masked = [], highlight = true } = props;
  const t = TXT[lang];
  const L = useMemo(() => props.layout ?? autoLayout(chain), [props.layout, chain]);

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
  const on = (e: Element) => highlight && act.has(e.id) && topo.reached.has(e.from);
  const clusterOf = new Map<string, string>();
  for (const c of chain.clusters) for (const o of c.options) clusterOf.set(o, c.id);

  const cycle = (cid: string) => {
    if (locked || !onStateChange) return;
    const c = chain.clusters.find((x) => x.id === cid);
    if (!c) return;
    const i = c.options.indexOf(state[cid] ?? (c.options[0] as string));
    onStateChange({ ...state, [cid]: c.options[(i + 1) % c.options.length] as string });
  };

  const shY = (id: string) => L.shafts[id]?.y ?? 0;
  const parts: JSX.Element[] = [];
  const labels: JSX.Element[] = [];
  let key = 0;
  const K = () => `k${key++}`;

  const gearRect = (x: number, y: number, r: number, lit: boolean, w = 14, sliding = false) => {
    parts.push(
      <rect key={K()} x={x - w / 2} y={y - r} width={w} height={2 * r} rx={1.5} fill={lit ? C.onFill : C.offFill} stroke={lit ? C.onStroke : C.offStroke} strokeWidth={lit ? 1.7 : 1.1} />,
    );
    // key symbol: x = fixed (keyed), / = sliding (feather key)
    parts.push(
      sliding ? (
        <line key={K()} x1={x - 3} y1={y + 4} x2={x + 3} y2={y - 4} stroke={C.ink} strokeWidth={1.4} />
      ) : (
        <path key={K()} d={`M${x - 3},${y - 3}L${x + 3},${y + 3}M${x - 3},${y + 3}L${x + 3},${y - 3}`} stroke={C.ink} strokeWidth={1.3} />
      ),
    );
  };
  const label = (x: number, y: number, text: string, lit: boolean, anchor: 'middle' | 'start' | 'end' = 'middle', color?: string) =>
    labels.push(
      <text key={K()} x={x} y={y} fontSize={14} textAnchor={anchor} fill={color ?? (lit ? C.ink : C.muted)} fontWeight={lit ? 700 : 400}>
        {text}
      </text>,
    );

  // ---- shafts ----
  const order = Object.entries(L.shafts).sort((a, b) => a[1].row - b[1].row);
  for (const [id, s] of order) {
    const sh = chain.shafts.find((x) => x.id === id);
    const driven = topo.reached.has(id);
    parts.push(<line key={K()} x1={s.x0} y1={s.y} x2={s.x1} y2={s.y} stroke={driven || !highlight ? C.ink : C.offStroke} strokeWidth={2.6} />);
    for (const bx of [s.x0 + 6, s.x1 - 6])
      parts.push(<rect key={K()} x={bx - 4} y={s.y - 7} width={8} height={14} fill="#fff" stroke={C.ink} strokeWidth={1.2} />);
    labels.push(
      <text key={K()} x={20} y={s.y + 5} fontSize={15} textAnchor="start" fontWeight={700} fill={C.ink}>
        {sh && sh.label.length <= 3 ? sh.label : id}
      </text>,
    );
    if (speeds && speeds[id] !== undefined) {
      const isMasked = masked.includes(id);
      const txt = isMasked ? '? rpm' : (speeds[id] as string);
      const w = 16 + txt.length * 8;
      const tx = L.width - 136; // speed tags in one column on the right, with a dotted leader
      labels.push(
        <g key={K()}>
          <line x1={s.x1 + 2} y1={s.y} x2={tx} y2={s.y} stroke={C.blue} strokeWidth={1} strokeDasharray="2 4" />
          <rect x={tx} y={s.y - 13} width={w} height={26} rx={6} fill="#fff" stroke={C.blue} strokeWidth={1.3} />
          <text x={tx + 8} y={s.y + 5} fontSize={14} fontWeight={700} fill={isMasked ? C.mag : C.blue}>
            {txt}
          </text>
        </g>,
      );
    }
  }

  // ---- motor ----
  const inShaft = L.shafts[chain.input.shaft];
  if (inShaft) {
    const mx = L.motor.x;
    const my = L.motor.y;
    parts.push(<line key={K()} x1={mx + 16} y1={my} x2={inShaft.x0} y2={my} stroke={C.ink} strokeWidth={2.6} />);
    parts.push(<circle key={K()} cx={mx} cy={my} r={16} fill="#fff" stroke={C.ink} strokeWidth={1.8} />);
    labels.push(
      <text key={K()} x={mx} y={my + 5} fontSize={15} fontWeight={700} textAnchor="middle" fill={C.ink}>
        M
      </text>,
    );
    label(mx, my - 26, `n = ${rs(chain.input.n).replace('.', ',')} rpm`, true, 'middle');
  }

  // ---- cluster hubs (drawn under the gears) ----
  for (const [cid, cl] of Object.entries(L.clusters)) {
    const y = shY(cl.shaft);
    parts.push(<rect key={K()} x={cl.x0} y={y - 5} width={cl.x1 - cl.x0} height={10} rx={3} fill="#cfd6df" stroke={C.ink} strokeWidth={1} />);
    const c = chain.clusters.find((x) => x.id === cid);
    const opts = (c?.options ?? []).map((o) => chain.elements.find((e) => e.id === o)).filter((e): e is Element => !!e);
    const maxR = Math.max(...opts.map((e) => (('to' in e && e.to === cl.shaft) ? L.elements[e.id]?.r2 : L.elements[e.id]?.r1) ?? 0));
    const ay = y + maxR + 30;
    const mx = (cl.x0 + cl.x1) / 2;
    labels.push(
      <g key={K()}>
        <path d={`M${cl.x0 + 4},${ay}H${cl.x1 - 4}`} stroke={C.ink} strokeWidth={1.4} markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x={mx} y={ay + 18} fontSize={13} textAnchor="middle" fill={C.muted}>
          {c?.label ?? cid}
        </text>
      </g>,
    );
  }

  // ---- elements ----
  for (const e of chain.elements) {
    const p = L.elements[e.id];
    if (!p) continue;
    const lit = on(e);
    const x = p.x;
    const sliding = clusterOf.has(e.id);
    if ('to' in e) {
      const y1 = shY(e.from);
      const y2 = shY(e.to);
      const up1 = y1 < y2; // is the from-shaft the upper one?
      const lab = (y: number, r: number, upper: boolean, text: string) => label(x, upper ? y - r - 7 : y + r + 18, text, lit);
      const slideOn = clusterOf.has(e.id) ? L.clusters[clusterOf.get(e.id) as string]?.shaft : undefined;
      switch (e.kind) {
        case 'gear':
        case 'chain': {
          const w = 14;
          gearRect(x, y1, p.r1, lit, w, sliding && slideOn === e.from);
          gearRect(x, y2, p.r2, lit, w, sliding && slideOn === e.to);
          if (e.kind === 'chain') {
            const top = Math.min(y1, y2);
            const bot = Math.max(y1, y2);
            const rT = up1 ? p.r1 : p.r2;
            const rB = up1 ? p.r2 : p.r1;
            for (const dx of [-9, 9])
              parts.push(<line key={K()} x1={x + dx} y1={top - rT} x2={x + dx} y2={bot + rB} stroke={lit ? C.onStroke : C.muted} strokeWidth={1.6} strokeDasharray="5 4" />);
          }
          lab(y1, p.r1, up1, `${e.z1}`);
          lab(y2, p.r2, !up1, `${e.z2}`);
          break;
        }
        case 'bevel': {
          const d = 9;
          const tri = (y: number, r: number, towardsDown: boolean) => {
            const ty = towardsDown ? y + r : y - r;
            const by = towardsDown ? y - r : y + r;
            return `M${x - 8},${by}L${x + 8},${by}L${x + 8 - d * 0},${ty}L${x - 8 + d},${ty}Z`;
          };
          parts.push(<path key={K()} d={tri(y1, p.r1, up1)} fill={lit ? C.onFill : C.offFill} stroke={lit ? C.onStroke : C.offStroke} strokeWidth={1.4} />);
          parts.push(<path key={K()} d={tri(y2, p.r2, !up1)} fill={lit ? C.onFill : C.offFill} stroke={lit ? C.onStroke : C.offStroke} strokeWidth={1.4} />);
          lab(y1, p.r1, up1, `${e.z1}`);
          lab(y2, p.r2, !up1, `${e.z2}`);
          break;
        }
        case 'belt': {
          gearRect(x, y1, p.r1, lit, 24);
          gearRect(x, y2, p.r2, lit, 24);
          const top = Math.min(y1, y2) + (up1 ? p.r1 : p.r2);
          const bot = Math.max(y1, y2) - (up1 ? p.r2 : p.r1);
          if (e.crossed)
            parts.push(<path key={K()} d={`M${x - 8},${top}L${x + 8},${bot}M${x + 8},${top}L${x - 8},${bot}`} stroke={lit ? '#8a5a14' : C.muted} strokeWidth={2.4} />);
          else parts.push(<rect key={K()} x={x - 8} y={top} width={16} height={Math.max(0, bot - top)} fill="#f3e3c8" stroke={C.ink} strokeWidth={1} />);
          lab(y1, p.r1, up1, `Ø${rs(e.d1)}`);
          lab(y2, p.r2, !up1, `Ø${rs(e.d2)}`);
          break;
        }
        case 'worm': {
          // worm on the from-shaft (thread lines), wheel on the to-shaft
          const wy = y1;
          parts.push(<rect key={K()} x={x - 18} y={wy - 10} width={36} height={20} rx={3} fill={lit ? C.onFill : '#fff'} stroke={lit ? C.onStroke : C.ink} strokeWidth={1.4} />);
          for (let i = -12; i <= 12; i += 6)
            parts.push(<line key={K()} x1={x + i - 3} y1={wy + 9} x2={x + i + 3} y2={wy - 9} stroke={lit ? C.onStroke : C.muted} strokeWidth={1.2} />);
          gearRect(x, y2, p.r2, lit);
          label(x + 24, wy + (up1 ? -14 : 24), `k = ${e.starts}`, lit, 'start');
          lab(y2, p.r2, !up1, `Z = ${e.z}`);
          break;
        }
        case 'clutch': {
          const top = Math.min(y1, y2);
          const bot = Math.max(y1, y2);
          parts.push(<line key={K()} x1={x} y1={top} x2={x} y2={bot} stroke={C.ink} strokeWidth={2.2} />);
          const jaw = (y: number, dir: 1 | -1) => `M${x - 9},${y + dir * 14}V${y + dir * 8}H${x + 9}V${y + dir * 14}`;
          parts.push(<path key={K()} d={jaw(top, 1)} fill="none" stroke={lit ? C.onStroke : C.ink} strokeWidth={1.8} />);
          parts.push(<path key={K()} d={jaw(bot, -1)} fill="none" stroke={lit ? C.onStroke : C.ink} strokeWidth={1.8} />);
          break;
        }
      }
      if (sliding && !locked && onStateChange) {
        const cid = clusterOf.get(e.id) as string;
        const top = Math.min(y1, y2) - Math.max(p.r1, p.r2) - 4;
        const bot = Math.max(y1, y2) + Math.max(p.r1, p.r2) + 4;
        parts.push(
          <rect
            key={K()}
            x={x - 14}
            y={top}
            width={28}
            height={bot - top}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => cycle(cid)}
            role="button"
            aria-label={`${chain.clusters.find((c) => c.id === cid)?.label ?? cid}`}
          />,
        );
      }
    } else {
      const y = shY(e.from);
      const lp = L.linear[e.output];
      const out = chain.linear?.find((l) => l.id === e.output);
      if (!lp) continue;
      if (e.kind === 'rack') {
        gearRect(x, y, p.r1, lit);
        const ry = lp.y;
        parts.push(<rect key={K()} x={x - 70} y={ry} width={140} height={10} fill={C.blueFill} stroke={C.blue} strokeWidth={1.4} />);
        for (let i = -66; i <= 66; i += 8) parts.push(<line key={K()} x1={x + i} y1={ry} x2={x + i + 4} y2={ry - 5} stroke={C.blue} strokeWidth={1.1} />);
        labels.push(
          <path key={K()} d={`M${x - 50},${ry + 24}H${x + 50}`} stroke={C.blue} strokeWidth={1.6} markerStart="url(#arrb)" markerEnd="url(#arrb)" />,
        );
        label(x + 76, ry + 9, out?.label ?? e.output, true, 'start', C.blue);
        label(x, y - p.r1 - 7, `Z = ${e.z}, m = ${rs(e.module)}`, lit);
      } else {
        // screw: thread along the shaft, nut / table on it
        let d = '';
        for (let xx = x; xx <= x + 120; xx += 3) d += `${xx === x ? 'M' : 'L'}${xx},${(y + 6 * Math.sin(((xx - x) * 2 * Math.PI) / 14)).toFixed(1)}`;
        parts.push(<path key={K()} d={d} fill="none" stroke={lit ? C.onStroke : C.ink} strokeWidth={1.6} />);
        parts.push(<rect key={K()} x={lp.x - 26} y={y - 30} width={52} height={22} fill={C.blueFill} stroke={C.blue} strokeWidth={1.4} />);
        parts.push(<rect key={K()} x={lp.x - 12} y={y - 9} width={24} height={18} fill="none" stroke={C.blue} strokeWidth={1.2} />);
        labels.push(
          <path key={K()} d={`M${lp.x - 36},${y - 40}H${lp.x + 36}`} stroke={C.blue} strokeWidth={1.6} markerStart="url(#arrb)" markerEnd="url(#arrb)" />,
        );
        label(lp.x, y - 48, out?.label ?? e.output, true, 'middle', C.blue);
        label(lp.x, y + 26, `P = ${rs(e.pitch).replace('.', ',')} mm, k = ${e.starts}`, lit);
      }
    }
  }

  const aria = `${t.schema}: ${chain.shafts.length} ${t.shafts.toLowerCase()}, ${chain.elements.length} ${t.el.toLowerCase()}`;
  const hasClusters = chain.clusters.length > 0 && !locked && !!onStateChange;
  const z = (f: number) => setZoom(Math.max(0.5, Math.min(3, k * f)));

  return (
    <div className="schema">
      <div className="schema-tools">
        {hasClusters && <span className="schema-hint">{t.clickCluster}</span>}
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
        <svg
          viewBox={`0 0 ${L.width} ${L.height}`}
          width={L.width * k}
          height={L.height * k}
          role="img"
          aria-label={aria}
          style={{ display: 'block', fontFamily: '"Segoe UI", Arial, sans-serif' }}
        >
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L10,5 L0,9z" fill={C.ink} />
            </marker>
            <marker id="arrb" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M0,1 L10,5 L0,9z" fill={C.blue} />
            </marker>
          </defs>
          <g>{parts}</g>
          <g>{labels}</g>
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
                <td>{e.id}</td>
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

