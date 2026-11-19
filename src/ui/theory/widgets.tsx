/**
 * Interactive theory widgets (spec §14.2). Every number shown comes from the
 * solver (a tiny chain is built and solved); the animation only illustrates it.
 * Animations stop when the user prefers reduced motion.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ChainJSON, type State, chainFromJSON } from '../../core/model';
import { fmt } from '../../core/grader';
import { pr, q, toFixed } from '../../core/rational';
import { pitchDiameter } from '../../core/geometry';
import { solveStateA, speedTableA } from '../../core/solverPath';
import { mmPerMinToMPerS } from '../../core/units';
import { HEAD } from '../../content/theory/topics';
import { useT } from '../../i18n';
import { KinematicSchema } from '../KinematicSchema';

const TAU = Math.PI * 2;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const trim = (s: string) => s.replace(/\.?0+$/, '').replace('.', ',');

/** requestAnimationFrame loop with a time step, paused when `run` is false. */
function useFrames(run: boolean, step: (dt: number) => void) {
  const ref = useRef(step);
  ref.current = step;
  useEffect(() => {
    if (!run) return;
    let last = 0;
    let id = 0;
    const loop = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      ref.current(dt);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [run]);
}

function gearPath(cx: number, cy: number, z: number, r: number, ang: number): string {
  const ra = r + 6;
  const rf = r - 7;
  const pts: string[] = [];
  for (let i = 0; i < z; i++) {
    const a0 = ang + (TAU * i) / z;
    const h = TAU / z;
    for (const [rr, f] of [
      [rf, -0.5],
      [rf, -0.27],
      [ra, -0.13],
      [ra, 0.13],
      [rf, 0.27],
      [rf, 0.5],
    ] as const)
      pts.push(`${(cx + rr * Math.cos(a0 + f * h)).toFixed(1)},${(cy + rr * Math.sin(a0 + f * h)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>
        {label} = <b>{value}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function PlayButton({ run, setRun }: { run: boolean; setRun: (b: boolean) => void }) {
  const { lang } = useT();
  return (
    <button className="small" onClick={() => setRun(!run)} aria-pressed={run}>
      {run ? (lang === 'eu' ? 'Gelditu' : 'Parar') : lang === 'eu' ? 'Martxan jarri' : 'Poner en marcha'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Two meshing gears
// ---------------------------------------------------------------------------
export function GearsWidget() {
  const { lang } = useT();
  const [z1, setZ1] = useState(20);
  const [z2, setZ2] = useState(40);
  const [n1, setN1] = useState(600);
  const [run, setRun] = useState(!reducedMotion());
  const [ang, setAng] = useState(0);
  const chain = useMemo(
    () =>
      chainFromJSON({
        shafts: [
          { id: '1', label: '1' },
          { id: '2', label: '2' },
        ],
        elements: [{ kind: 'gear', id: 'g', from: '1', to: '2', z1, z2 }],
        input: { shaft: '1', n: n1 },
      }),
    [z1, z2, n1],
  );
  const sol = solveStateA(chain, {});
  const n2 = sol.ok ? sol.shafts['2']!.n : null;
  const dir = sol.ok ? sol.shafts['2']!.dir : null;
  useFrames(run, (dt) => setAng((a) => (a + (n1 / 60) * TAU * dt * 0.02) % (TAU * 1000)));
  const s = 2.2; // px per tooth (radius = s·Z/2·…)
  const r1 = s * z1;
  const r2 = s * z2;
  const W = 2 * (r1 + r2) + 60;
  const H = 2 * Math.max(r1, r2) + 40;
  const cx1 = 20 + r1 + 6;
  const cx2 = cx1 + r1 + r2;
  const cy = H / 2;
  const a2 = Math.PI + Math.PI / z2 - (ang * z1) / z2;
  return (
    <div className="widget">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-svg" role="img" aria-label={lang === 'eu' ? 'Bi gurpil engranatzen' : 'Dos ruedas engranando'}>
        <polygon points={gearPath(cx1, cy, z1, r1, ang)} fill="#dbe7fb" stroke="#0f1b2d" strokeWidth={1.2} />
        <polygon points={gearPath(cx2, cy, z2, r2, a2)} fill="#ffe3c2" stroke="#0f1b2d" strokeWidth={1.2} />
        <line x1={cx1} y1={cy} x2={cx1 + (r1 - 10) * Math.cos(ang)} y2={cy + (r1 - 10) * Math.sin(ang)} stroke="#c62828" strokeWidth={2.5} />
        <line x1={cx2} y1={cy} x2={cx2 + (r2 - 10) * Math.cos(a2)} y2={cy + (r2 - 10) * Math.sin(a2)} stroke="#c62828" strokeWidth={2.5} />
        <circle cx={cx1} cy={cy} r={5} fill="#fff" stroke="#0f1b2d" />
        <circle cx={cx2} cy={cy} r={5} fill="#fff" stroke="#0f1b2d" />
      </svg>
      <div className="w-controls">
        <Slider label="Z₁" value={z1} min={12} max={60} onChange={setZ1} />
        <Slider label="Z₂" value={z2} min={12} max={60} onChange={setZ2} />
        <Slider label="n₁ (rpm)" value={n1} min={100} max={3000} step={50} onChange={setN1} />
        <PlayButton run={run} setRun={setRun} />
      </div>
      {n2 && (
        <p className="formula">
          n₂ = n₁ · Z₁/Z₂ = {n1} · {z1}/{z2} = <b>{trim(toFixed(n2, 2))} rpm</b> · {dir === -1 ? (lang === 'eu' ? 'noranzko kontrakoa' : 'sentido contrario') : ''}
        </p>
      )}
    </div>
  );
}

/** SVG path of the rack teeth, shifted by the rolled arc length. */
function rackTeeth(W: number, pitchPx: number, shift: number, y: number): string[] {
  const out: string[] = [];
  for (let x = -pitchPx * 2 - shift; x < W + pitchPx; x += pitchPx) out.push(`M${x.toFixed(1)},${y}l${(pitchPx / 4).toFixed(1)},-12h${(pitchPx / 4).toFixed(1)}l${(pitchPx / 4).toFixed(1)},12`);
  return out;
}

// ---------------------------------------------------------------------------
// Pinion and rack
// ---------------------------------------------------------------------------
export function RackWidget() {
  const { lang } = useT();
  const [m, setM] = useState(3);
  const [z, setZ] = useState(20);
  const [n, setN] = useState(60);
  const [run, setRun] = useState(!reducedMotion());
  const [ang, setAng] = useState(0);
  const chain = useMemo(
    () =>
      chainFromJSON({
        shafts: [{ id: 'P', label: 'P' }],
        linear: [{ id: 'R', label: 'R' }],
        elements: [{ kind: 'rack', id: 'r', from: 'P', output: 'R', z, module: String(m) }],
        input: { shaft: 'P', n },
      }),
    [m, z, n],
  );
  const sol = solveStateA(chain, {});
  const v = sol.ok ? sol.linear.R!.v : null;
  useFrames(run, (dt) => setAng((a) => (a + (n / 60) * TAU * dt * 0.15) % (TAU * 1000)));
  const s = 1.6 * m; // px per tooth on the drawing
  const r = (s * z) / 2;
  const W = 520;
  const H = 2 * r + 80;
  const cx = W / 2;
  const cy = r + 20;
  const pitchPx = Math.PI * s; // one tooth pitch on the drawing
  const shift = (((ang * r) % pitchPx) + pitchPx) % pitchPx; // rack moves the arc length rolled
  const teeth = rackTeeth(W, pitchPx, shift, cy + r + 6);
  return (
    <div className="widget">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-svg" role="img" aria-label={lang === 'eu' ? 'Pinoi-kremailera' : 'Piñón-cremallera'}>
        <polygon points={gearPath(cx, cy, z, r, -ang)} fill="#ffe3c2" stroke="#0f1b2d" strokeWidth={1.2} />
        <line x1={cx} y1={cy} x2={cx + (r - 10) * Math.cos(-ang)} y2={cy + (r - 10) * Math.sin(-ang)} stroke="#c62828" strokeWidth={2.5} />
        <circle cx={cx} cy={cy} r={5} fill="#fff" stroke="#0f1b2d" />
        <rect x={0} y={cy + r + 6} width={W} height={18} fill="#dbe7fb" stroke="#1d5fd1" />
        <path d={teeth.join('')} fill="#dbe7fb" stroke="#1d5fd1" />
      </svg>
      <div className="w-controls">
        <Slider label="m (mm)" value={m} min={1} max={5} onChange={setM} />
        <Slider label="Z" value={z} min={12} max={40} onChange={setZ} />
        <Slider label="n (rpm)" value={n} min={10} max={300} step={10} onChange={setN} />
        <PlayButton run={run} setRun={setRun} />
      </div>
      {v && (
        <p className="formula">
          d = m·Z = {fmt(pr(pitchDiameter(q(m), z)), 2)} mm; v = π·d·n = {fmt(v, 2)} mm/min = <b>{fmt(mmPerMinToMPerS(v), 4)} m/s</b>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gearbox simulator: move the clusters, watch the power path and the speeds
// ---------------------------------------------------------------------------
export function GearboxWidget() {
  const { lang } = useT();
  const chain = useMemo(() => chainFromJSON(HEAD as ChainJSON), []);
  const [state, setState] = useState<State>({ A: 'a1', B: 'b1' });
  const sol = solveStateA(chain, state);
  const speeds = sol.ok ? Object.fromEntries(Object.entries(sol.shafts).map(([k, v]) => [k, `${trim(toFixed(v.n, 2))} rpm`])) : undefined;
  const t = speedTableA(chain, 'III');
  return (
    <div className="widget">
      <KinematicSchema chain={chain} state={state} lang={lang} onStateChange={setState} {...(speeds ? { speeds } : {})} />
      <p className="formula">
        {lang === 'eu' ? 'Abiadura kopurua' : 'Número de velocidades'}: {t.distinct.length} · max {fmt(pr(t.distinct[t.distinct.length - 1]!), 2)} rpm · min {fmt(pr(t.distinct[0]!), 2)} rpm
      </p>
    </div>
  );
}

export function TheoryWidget({ w }: { w: 'gearbox' | 'gears' | 'rack' }) {
  if (w === 'gears') return <GearsWidget />;
  if (w === 'rack') return <RackWidget />;
  return <GearboxWidget />;
}
