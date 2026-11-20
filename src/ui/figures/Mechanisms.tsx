/**
 * Dedicated theory figures, one per mechanism, drawn closer to the real part than the
 * kinematic schema: gear trains seen from the front (with rotation arrows), belt drives,
 * worm and wheel, tooth geometry, screw and nut, lathe feed, change-gear quadrant and
 * power flow, plus a symbol table.
 *
 * Every number comes from the example chain through the same {{…}} template variables
 * as the theory texts (src/core/template.ts), or from the core functions; nothing is
 * typed by hand.
 */
import type { ReactNode } from 'react';
import { DEFAULT_GEARSET, compoundTrains, mountingOk, quadrantRatio } from '../../core/changeGears';
import { fmt } from '../../core/grader';
import { type Chain, type ChainJSON, type Element, chainFromJSON } from '../../core/model';
import { powerAt } from '../../core/power';
import { mul, parse, pr, q, sub, toNumber, toString } from '../../core/rational';
import { solveStateA } from '../../core/solverPath';
import { fillTemplate } from '../../core/template';
import { useT } from '../../i18n';

export const FIG = {
  ink: '#0f1b2d',
  muted: '#5a6779',
  onFill: '#ffd29a',
  onStroke: '#b45309',
  offFill: '#eef1f5',
  offStroke: '#8a96a6',
  blue: '#1d5fd1',
  blueFill: '#dbe7fb',
  belt: '#8a5a14',
  beltFill: '#f3e3c8',
  steel: '#cfd6df',
};
const C = FIG;
const FONT = '"Segoe UI", Arial, sans-serif';

// ---------------------------------------------------------------------------
// drawing helpers
// ---------------------------------------------------------------------------
type Pt = [number, number];
const polar = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
const deg = (d: number) => (d * Math.PI) / 180;

/** Spur gear seen from the front: teeth as a dashed thick rim, pitch circle dashed. */
export function GearFront({ cx, cy, r, z, lit = false, back = false }: { cx: number; cy: number; r: number; z: number; lit?: boolean; back?: boolean }) {
  const tooth = Math.max(3, Math.min(7, r * 0.12));
  const circ = 2 * Math.PI * (r - tooth / 2 + 1);
  const dash = circ / (2 * z);
  const fill = lit ? C.onFill : back ? '#f5f7fa' : C.offFill;
  const stroke = lit ? C.onStroke : C.offStroke;
  return (
    <g opacity={back ? 0.85 : 1}>
      <circle cx={cx} cy={cy} r={r - tooth / 2 + 1} fill="none" stroke={stroke} strokeWidth={tooth} strokeDasharray={`${dash} ${dash}`} />
      <circle cx={cx} cy={cy} r={r - tooth + 1} fill={fill} stroke={stroke} strokeWidth={1.2} />
      <circle cx={cx} cy={cy} r={r - tooth / 2} fill="none" stroke={C.muted} strokeWidth={0.8} strokeDasharray="4 3" />
      <circle cx={cx} cy={cy} r={Math.min(9, r * 0.25)} fill="#fff" stroke={C.ink} strokeWidth={1.2} />
      <path d={`M${cx - 3},${cy - 3}L${cx + 3},${cy + 3}M${cx - 3},${cy + 3}L${cx + 3},${cy - 3}`} stroke={C.ink} strokeWidth={1.2} />
    </g>
  );
}

/** Curved rotation arrow around (cx, cy); cw = clockwise on screen. */
export function TurnArrow({ cx, cy, r, cw, from, span = 90, color = C.blue }: { cx: number; cy: number; r: number; cw: boolean; from?: number; span?: number; color?: string }) {
  // default: over the top of the gear, away from its neighbours
  from ??= cw ? -135 : -45;
  const a0 = deg(from);
  const a1 = deg(from + (cw ? span : -span));
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  // tangent at the end, in the direction of motion
  const tx = cw ? -Math.sin(a1) : Math.sin(a1);
  const ty = cw ? Math.cos(a1) : -Math.cos(a1);
  const tip: Pt = [x1 + tx * 7, y1 + ty * 7];
  const b1: Pt = [x1 - ty * 4.5, y1 + tx * 4.5];
  const b2: Pt = [x1 + ty * 4.5, y1 - tx * 4.5];
  return (
    <g>
      <path d={`M${x0},${y0} A${r},${r} 0 0 ${cw ? 1 : 0} ${x1},${y1}`} fill="none" stroke={color} strokeWidth={2} />
      <polygon points={`${tip.join(',')} ${b1.join(',')} ${b2.join(',')}`} fill={color} />
    </g>
  );
}

/** Straight arrow (single or double headed). */
export function Arrow({ x1, y1, x2, y2, color = C.ink, both = false, w = 1.6 }: { x1: number; y1: number; x2: number; y2: number; color?: string; both?: boolean; w?: number }) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / L;
  const uy = (y2 - y1) / L;
  const head = (x: number, y: number, sx: number, sy: number) => `${x},${y} ${x - sx * 8 - sy * 4},${y - sy * 8 + sx * 4} ${x - sx * 8 + sy * 4},${y - sy * 8 - sx * 4}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} />
      <polygon points={head(x2, y2, ux, uy)} fill={color} />
      {both && <polygon points={head(x1, y1, -ux, -uy)} fill={color} />}
    </g>
  );
}

function Txt({ x, y, children, anchor = 'middle', size = 13, color = C.ink, bold = false }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; size?: number; color?: string; bold?: boolean }) {
  return (
    <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={color} fontWeight={bold ? 700 : 400} stroke="#fff" strokeWidth={3} paintOrder="stroke">
      {children}
    </text>
  );
}

/** Figure frame: white box, SVG scaled to the card width, caption below. */
function Frame({ w, h, label, caption, children }: { w: number; h: number; label: string; caption?: string; children: ReactNode }) {
  return (
    <figure className="fig">
      <div className="schema-box">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w, display: 'block', margin: '0 auto', fontFamily: FONT }} role="img" aria-label={caption ? `${label}. ${caption}` : label}>
          {children}
        </svg>
      </div>
      {caption && <figcaption className="note">{caption}</figcaption>}
    </figure>
  );
}

/** Template filler bound to a chain and the current language. */
function useTpl(chain: Chain | null) {
  const { t, lang } = useT();
  return { t, lang, tpl: (s: string) => fillTemplate(s, chain, {}, lang) };
}

const solved = (chain: Chain) => {
  const s = solveStateA(chain, {});
  if (!s.ok) throw new Error(`figure: chain not solvable (${s.error})`);
  return s;
};

/** Absolute direction (cw on screen) of a shaft: relative direction × input direction (cw if not given). */
const isCw = (chain: Chain, dir: 1 | -1 | null) => (chain.input.direction === 'ccw' ? dir === -1 : dir !== -1);

// ---------------------------------------------------------------------------
// gear train, front view
// ---------------------------------------------------------------------------
/**
 * Simple or compound train of external spur gears joining the shafts in their order.
 * A shaft whose two gears have the same tooth count is drawn as one gear (an idler).
 */
export function GearTrainFigure({ chain: j }: { chain: ChainJSON }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const sol = solved(chain);
  const gears = chain.elements.filter((e): e is Extract<Element, { kind: 'gear' }> => e.kind === 'gear');
  const order = chain.shafts.map((s) => s.id);
  // tooth counts on each shaft: [meshing with the previous shaft, with the next one]
  const zs = order.map((s) => {
    const inn = gears.find((g) => g.to === s);
    const out = gears.find((g) => g.from === s);
    return { s, zIn: inn?.z2, zOut: out?.z1 };
  });
  const maxZ = Math.max(...gears.flatMap((g) => [g.z1, g.z2]));
  const total = gears.reduce((a, g) => a + g.z1 + g.z2, 0) / 2;
  const scale = Math.min(190 / maxZ, 640 / (total + maxZ));
  const R = (z: number) => (z * scale) / 2 + 4;
  const xs: number[] = [];
  let x = 90 + R(zs[0]?.zOut ?? maxZ);
  zs.forEach((g, i) => {
    if (i > 0) {
      const prev = zs[i - 1] as (typeof zs)[0];
      x += R(prev.zOut ?? 0) + R(g.zIn ?? 0) - 8;
    }
    xs.push(x);
  });
  const rTop = R(maxZ);
  const cy = rTop + 80;
  const W = Math.max(560, x + R(zs[zs.length - 1]?.zIn ?? 0) + 70);
  const parts: ReactNode[] = [];
  zs.forEach((g, i) => {
    const cx = xs[i] as number;
    const idler = g.zIn !== undefined && g.zOut !== undefined && g.zIn === g.zOut;
    const list = idler ? [g.zIn as number] : [g.zIn, g.zOut].filter((z): z is number => z !== undefined).sort((a, b) => b - a);
    list.forEach((z, k) => parts.push(<GearFront key={`${g.s}-${k}`} cx={cx} cy={cy} r={R(z)} z={z} back={list.length > 1 && k === 0} lit={i === 0} />));
    const rMax = R(Math.max(...list));
    const dir = sol.shafts[g.s]?.dir ?? null;
    parts.push(<TurnArrow key={`a${g.s}`} cx={cx} cy={cy} r={rMax + 14} cw={isCw(chain, dir)} />);
    parts.push(
      <Txt key={`n${g.s}`} x={cx} y={cy - rMax - 30} color={C.blue} bold>
        {tpl(`{{n:${g.s}}}`)} rpm
      </Txt>,
    );
    const label = chain.shafts.find((s) => s.id === g.s)?.label ?? g.s;
    parts.push(
      <Txt key={`l${g.s}`} x={cx} y={cy + rMax + 22} bold>
        {label}
      </Txt>,
    );
    parts.push(
      <Txt key={`z${g.s}`} x={cx} y={cy + rMax + 38} size={12} color={C.muted}>
        {list.map((z) => `Z = ${z}`).join(' / ')}
      </Txt>,
    );
    if (idler)
      parts.push(
        <Txt key={`i${g.s}`} x={cx} y={cy + rMax + 54} size={12} color={C.onStroke}>
          {t('fig.train.idler')}
        </Txt>,
      );
  });
  return (
    <Frame w={W} h={cy + rTop + 80} label={t('fig.train.title')} caption={t('fig.train.caption')}>
      {parts}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// belt drive
// ---------------------------------------------------------------------------
export function BeltFigure({ chain: j }: { chain: ChainJSON }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const sol = solved(chain);
  const e = chain.elements.find((x): x is Extract<Element, { kind: 'belt' }> => x.kind === 'belt');
  if (!e) throw new Error('BeltFigure: no belt');
  const d1 = toNumber(e.d1);
  const d2 = toNumber(e.d2);
  const s = 140 / Math.max(d1, d2);
  const r1 = (d1 * s) / 2;
  const r2 = (d2 * s) / 2;
  const cy = 165;
  const x1 = 70 + r1 + 20;
  const x2 = x1 + r1 + r2 + 150;
  const L = x2 - x1;
  const crossed = !!e.crossed;
  const phi = Math.asin(crossed ? (r1 + r2) / L : (r1 - r2) / L);
  const t1: Pt = [x1 + r1 * Math.sin(phi), cy - r1 * Math.cos(phi)];
  const t2: Pt = crossed ? [x2 - r2 * Math.sin(phi), cy + r2 * Math.cos(phi)] : [x2 + r2 * Math.sin(phi), cy - r2 * Math.cos(phi)];
  const b1: Pt = [t1[0], 2 * cy - t1[1]];
  const b2: Pt = [t2[0], 2 * cy - t2[1]];
  const dirOf = (sid: string) => isCw(chain, sol.shafts[sid]?.dir ?? null);
  const W = x2 + r2 + 70;
  const slip = e.slip ? fmt(pr(mul(e.slip, q(100))), 2) : null;
  return (
    <Frame w={W} h={330} label={t('fig.belt.title')} caption={t(crossed ? 'fig.belt.crossed' : 'fig.belt.open')}>
      {[
        [x1, r1],
        [x2, r2],
      ].map(([x, r], i) => (
        <g key={i}>
          <circle cx={x} cy={cy} r={(r as number) + 3} fill="none" stroke={C.belt} strokeWidth={6} />
          <circle cx={x} cy={cy} r={r} fill={i === 0 ? C.onFill : C.offFill} stroke={i === 0 ? C.onStroke : C.offStroke} strokeWidth={1.4} />
          <circle cx={x} cy={cy} r={(r as number) * 0.55} fill="none" stroke={C.offStroke} strokeWidth={1} />
          <circle cx={x} cy={cy} r={8} fill="#fff" stroke={C.ink} strokeWidth={1.2} />
        </g>
      ))}
      <line x1={t1[0]} y1={t1[1]} x2={t2[0]} y2={t2[1]} stroke={C.belt} strokeWidth={6} strokeLinecap="round" />
      <line x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} stroke={C.belt} strokeWidth={6} strokeLinecap="round" />
      <TurnArrow cx={x1} cy={cy} r={r1 + 20} cw={dirOf(e.from)} />
      <TurnArrow cx={x2} cy={cy} r={r2 + 20} cw={dirOf(e.to)} />
      <Txt x={x1} y={cy - r1 - 40} color={C.blue} bold>
        {tpl(`{{n:${e.from}}}`)} rpm
      </Txt>
      <Txt x={x2} y={cy - r2 - 40} color={C.blue} bold>
        {tpl(`{{n:${e.to}}}`)} rpm
      </Txt>
      <Txt x={x1} y={cy + r1 + 30} bold>
        D₁ = Ø{tpl(`{{d1:${e.id}}}`)}
      </Txt>
      <Txt x={x2} y={cy + r2 + 30} bold>
        D₂ = Ø{tpl(`{{d2:${e.id}}}`)}
      </Txt>
      <Txt x={x1} y={cy + r1 + 46} size={12} color={C.muted}>
        {t('fig.belt.driver')}
      </Txt>
      <Txt x={x2} y={cy + r2 + 46} size={12} color={C.muted}>
        {t('fig.belt.driven')}
      </Txt>
      {slip && (
        <Txt x={(x1 + x2) / 2} y={cy + 6} size={12} color={C.belt}>
          s = {slip} %
        </Txt>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// worm and wheel
// ---------------------------------------------------------------------------
export function WormFigure({ chain: j }: { chain: ChainJSON }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const e = chain.elements.find((x): x is Extract<Element, { kind: 'worm' }> => x.kind === 'worm');
  if (!e) throw new Error('WormFigure: no worm');
  const cx = 380;
  const rw = 105;
  const cy = 90 + 30 + rw;
  const wy = cy - rw - 14; // worm axis, on top of the wheel
  const threads = Array.from({ length: 21 }, (_, i) => 250 + i * 12).map((x) => <line key={x} x1={x} y1={wy + 16} x2={x + 10} y2={wy - 16} stroke={C.onStroke} strokeWidth={1.4} />);
  return (
    <Frame w={720} h={380} label={t('fig.worm.title')} caption={t('fig.worm.caption', { k: e.starts, z: e.z })}>
      <GearFront cx={cx} cy={cy} r={rw} z={e.z} />
      {/* worm shaft and worm (axis perpendicular to the wheel axis) */}
      <line x1={120} y1={wy} x2={640} y2={wy} stroke={C.ink} strokeWidth={3} />
      <rect x={244} y={wy - 18} width={272} height={36} rx={8} fill={C.onFill} stroke={C.onStroke} strokeWidth={1.6} />
      {threads}
      <TurnArrow cx={128} cy={wy} r={22} cw={true} from={-60} span={120} />
      {/* no arrow on the wheel: its direction depends on the hand of the thread (not asked) */}
      <Txt x={128} y={wy - 34} color={C.blue} bold>
        {tpl(`{{n:${e.from}}}`)} rpm
      </Txt>
      <Txt x={cx + rw + 30} y={cy + 70} color={C.blue} bold anchor="start">
        {tpl(`{{n:${e.to}}}`)} rpm
      </Txt>
      <Txt x={560} y={wy - 26} bold>
        k = {tpl(`{{k:${e.id}}}`)}
      </Txt>
      <Txt x={560} y={wy + 34} size={12} color={C.muted}>
        {t('fig.worm.worm')}
      </Txt>
      <Txt x={cx} y={cy + 36} bold>
        Z = {e.z}
      </Txt>
      <Txt x={cx} y={cy + 54} size={12} color={C.muted}>
        {t('fig.worm.wheel')}
      </Txt>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// tooth geometry of a spur gear
// ---------------------------------------------------------------------------
export function ToothFigure({ chain: j, element, side = 1 }: { chain: ChainJSON; element: string; side?: 1 | 2 }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const e = chain.elements.find((x) => x.id === element);
  if (!e || e.kind !== 'gear' || !e.module) throw new Error('ToothFigure: needs a gear with module');
  const m = toNumber(e.module);
  const z = side === 1 ? e.z1 : e.z2;
  // a sector of the gear, enlarged: visual radii keep the real proportions da : d : df
  const k = 92 / (Math.PI * m); // px per mm: one circular pitch = 92 px
  const cx = 330;
  const cy = 60 + (m * (z + 2) * k) / 2;
  const rd = (m * z * k) / 2;
  const ra = (m * (z + 2) * k) / 2;
  const rf = (m * (z - 2.5) * k) / 2;
  const pitchAng = (2 * Math.PI) / z;
  const teeth: ReactNode[] = [];
  const pts = (a: number) => {
    // tooth around angle a: thick at the root, thin at the tip (approximate involute)
    const hw = pitchAng / 4;
    const P = [polar(cx, cy, rf, a - hw * 1.25), polar(cx, cy, rd, a - hw), polar(cx, cy, ra, a - hw * 0.6), polar(cx, cy, ra, a + hw * 0.6), polar(cx, cy, rd, a + hw), polar(cx, cy, rf, a + hw * 1.25)];
    return P.map((p) => p.join(',')).join(' ');
  };
  const base = -Math.PI / 2;
  [-2, -1, 0, 1, 2].forEach((i) => teeth.push(<polygon key={i} points={pts(base + i * pitchAng)} fill={C.offFill} stroke={C.offStroke} strokeWidth={1.3} />));
  const arc = (r: number, a0: number, a1: number) => {
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`;
  };
  const A0 = base - 2.6 * pitchAng;
  const A1 = base + 2.6 * pitchAng;
  // leader start on each circle, right of the drawn teeth
  const lead = (r: number) => polar(cx, cy, r, base + 2.55 * pitchAng);
  const [, yA] = polar(cx, cy, ra, base);
  const [, yF] = polar(cx, cy, rf, base);
  const pA = polar(cx, cy, rd + 0, base);
  const pB = polar(cx, cy, rd, base + pitchAng);
  const labelX = 640;
  return (
    <Frame w={760} h={330} label={t('fig.tooth.title')} caption={t('fig.tooth.caption', { m: tpl(`{{m:${element}}}`), z })}>
      <path d={`${arc(rf, A0, A1)} L${polar(cx, cy, rf - 60, A1).join(',')} L${polar(cx, cy, rf - 60, A0).join(',')} Z`} fill={C.offFill} stroke="none" />
      {teeth}
      <path d={arc(ra, A0, A1)} fill="none" stroke={C.ink} strokeWidth={1} strokeDasharray="6 4" />
      <path d={arc(rd, A0, A1)} fill="none" stroke={C.onStroke} strokeWidth={1.6} strokeDasharray="10 4 2 4" />
      <path d={arc(rf, A0, A1)} fill="none" stroke={C.ink} strokeWidth={1} strokeDasharray="6 4" />
      {/* leaders to the circle labels */}
      {[
        [lead(ra), `dₐ = ${tpl(`{{da:${element}:${side}}}`)} mm`, C.ink],
        [lead(rd), `d = ${tpl(`{{d:${element}:${side}}}`)} mm`, C.onStroke],
        [lead(rf), `d_f = ${tpl(`{{df:${element}:${side}}}`)} mm`, C.ink],
      ].map(([p, s, col], i) => {
        const [x, y] = p as Pt;
        const ly = y + (i - 1) * 8; // keep the three labels apart
        return (
          <g key={i}>
            <path d={`M${x},${y} L${x + 30},${ly} L${labelX - 6},${ly}`} fill="none" stroke={C.muted} strokeWidth={0.8} strokeDasharray="2 3" />
            <Txt x={labelX} y={ly + 4} anchor="start" color={col as string} bold>
              {s as string}
            </Txt>
          </g>
        );
      })}
      {/* tooth height h */}
      <Arrow x1={cx - 210} y1={yA} x2={cx - 210} y2={yF} both />
      <line x1={cx - 222} y1={yA} x2={cx - 60} y2={yA} stroke={C.muted} strokeWidth={0.8} />
      <line x1={cx - 222} y1={yF} x2={cx - 60} y2={yF} stroke={C.muted} strokeWidth={0.8} />
      <Txt x={cx - 218} y={(yA + yF) / 2 + 4} anchor="end" bold>
        h = {tpl(`{{h:${element}}}`)} mm
      </Txt>
      {/* circular pitch p between two tooth centres on the pitch circle */}
      <path d={arc(rd + 32, base, base + pitchAng)} fill="none" stroke={C.blue} strokeWidth={1.6} />
      <line x1={pA[0]} y1={pA[1]} x2={polar(cx, cy, rd + 40, base)[0]} y2={polar(cx, cy, rd + 40, base)[1]} stroke={C.blue} strokeWidth={0.8} />
      <line x1={pB[0]} y1={pB[1]} x2={polar(cx, cy, rd + 40, base + pitchAng)[0]} y2={polar(cx, cy, rd + 40, base + pitchAng)[1]} stroke={C.blue} strokeWidth={0.8} />
      <Txt x={polar(cx, cy, rd + 50, base + pitchAng / 2)[0]} y={polar(cx, cy, rd + 50, base + pitchAng / 2)[1]} color={C.blue} bold>
        p = {tpl(`{{pc:${element}}}`)} mm
      </Txt>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// lead screw and nut (table)
// ---------------------------------------------------------------------------
export function ScrewFigure({ chain: j }: { chain: ChainJSON }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const e = chain.elements.find((x): x is Extract<Element, { kind: 'screw' }> => x.kind === 'screw');
  if (!e) throw new Error('ScrewFigure: no screw');
  const y = 200;
  const pitchPx = 26;
  const x0 = 110;
  const x1 = 650;
  const crest = Array.from({ length: Math.ceil((x1 - x0) / (pitchPx / 2)) }, (_, i) => x0 + (i * pitchPx) / 2).map((x) => (
    <line key={x} x1={x} y1={y + 16} x2={x + pitchPx / 2} y2={y - 16} stroke={C.ink} strokeWidth={1.3} />
  ));
  const tableX = 330;
  return (
    <Frame w={760} h={330} label={t('fig.screw.title')} caption={t('fig.screw.caption')}>
      <rect x={x0} y={y - 16} width={x1 - x0} height={32} fill="#f7f9fc" stroke={C.ink} strokeWidth={1.2} />
      {crest}
      <rect x={x0 - 40} y={y - 6} width={40} height={12} fill={C.steel} stroke={C.ink} />
      {/* nut fixed to the table */}
      <rect x={tableX} y={y - 28} width={110} height={56} rx={4} fill={C.blueFill} fillOpacity={0.85} stroke={C.blue} strokeWidth={1.6} />
      <rect x={tableX - 70} y={y - 100} width={250} height={60} rx={4} fill={C.blueFill} stroke={C.blue} strokeWidth={1.6} />
      <line x1={tableX + 55} y1={y - 40} x2={tableX + 55} y2={y - 28} stroke={C.blue} strokeWidth={6} />
      <Txt x={tableX + 55} y={y - 64} color={C.blue} bold>
        {t('fig.screw.table')}
      </Txt>
      <Arrow x1={tableX + 190} y1={y - 70} x2={tableX + 290} y2={y - 70} color={C.blue} w={2.4} />
      <Txt x={tableX + 240} y={y - 82} color={C.blue} bold>
        v = {tpl(`{{v:${e.output}}}`)} mm/min
      </Txt>
      {/* pitch and lead */}
      <Arrow x1={x0 + pitchPx * 2} y1={y + 46} x2={x0 + pitchPx * 3} y2={y + 46} both />
      <Txt x={x0 + pitchPx * 2.5} y={y + 66} bold>
        P = {tpl(`{{p:${e.id}}}`)} mm
      </Txt>
      {e.starts > 1 && (
        <>
          <Arrow x1={x0 + pitchPx * 6} y1={y + 46} x2={x0 + pitchPx * (6 + e.starts)} y2={y + 46} both color={C.onStroke} />
          <Txt x={x0 + pitchPx * (6 + e.starts / 2)} y={y + 66} color={C.onStroke} bold>
            {t('fig.screw.lead', { k: e.starts })}
          </Txt>
        </>
      )}
      <Txt x={x1 - 40} y={y + 46} bold>
        k = {tpl(`{{k:${e.id}}}`)}
      </Txt>
      <TurnArrow cx={x0 - 20} cy={y} r={26} cw={true} from={-140} span={110} />
      <Txt x={x0 - 20} y={y - 38} color={C.blue} bold>
        {tpl(`{{n:${e.from}}}`)} rpm
      </Txt>
      <Txt x={x0 + 4} y={y + 100} anchor="start" size={12} color={C.muted}>
        {t('fig.screw.rel')}
      </Txt>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// lathe feed: spindle turns, the carriage advances f mm per revolution
// ---------------------------------------------------------------------------
export function FeedFigure({ chain: j, output, spindle }: { chain: ChainJSON; output: string; spindle: string }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const y = 140;
  // tool path on the workpiece: one turn per feed step (spacing = f, enlarged)
  const path = Array.from({ length: 9 }, (_, i) => <line key={i} x1={250 + i * 30} y1={y - 44} x2={265 + i * 30} y2={y + 44} stroke={C.onStroke} strokeWidth={1} strokeDasharray="4 3" />);
  return (
    <Frame w={760} h={330} label={t('fig.feed.title')} caption={t('fig.feed.caption')}>
      {/* chuck and workpiece */}
      <rect x={90} y={y - 70} width={60} height={140} rx={4} fill={C.steel} stroke={C.ink} strokeWidth={1.4} />
      <rect x={150} y={y - 44} width={430} height={88} fill={C.offFill} stroke={C.ink} strokeWidth={1.4} />
      {path}
      <line x1={60} y1={y} x2={620} y2={y} stroke={C.ink} strokeWidth={0.8} strokeDasharray="14 4 2 4" />
      <TurnArrow cx={120} cy={y} r={88} cw={true} from={-120} span={60} />
      <Txt x={120} y={y - 100} color={C.blue} bold>
        n = {tpl(`{{n:${spindle}}}`)} rpm
      </Txt>
      {/* tool and carriage */}
      <polygon points={`${505},${y + 46} ${525},${y + 46} ${515},${y + 60}`} fill={C.ink} transform={`rotate(180 515 ${y + 53})`} />
      <rect x={490} y={y + 60} width={50} height={26} fill="#fff" stroke={C.ink} strokeWidth={1.4} />
      <rect x={440} y={y + 86} width={150} height={40} rx={4} fill={C.blueFill} stroke={C.blue} strokeWidth={1.6} />
      <Txt x={515} y={y + 112} color={C.blue} bold>
        {t('fig.feed.carriage')}
      </Txt>
      <Arrow x1={590} y1={y + 106} x2={680} y2={y + 106} color={C.blue} w={2.4} />
      <Txt x={640} y={y + 146} color={C.blue} bold>
        v = {tpl(`{{v:${output}}}`)} mm/min
      </Txt>
      {/* feed per revolution */}
      <Arrow x1={400} y1={y - 60} x2={430} y2={y - 60} both color={C.onStroke} />
      <Txt x={415} y={y - 70} color={C.onStroke} bold>
        f = {tpl(`{{f:${output}:${spindle}}}`)} mm/{t('fig.feed.rev')}
      </Txt>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// change-gear quadrant (lira)
// ---------------------------------------------------------------------------
export interface LiraProps {
  threadPitch: string;
  leadScrewPitch: string;
  /** Fixed gearing between quadrant and lead screw (n_screw / n_in), e.g. Norton 1:2 = "1/2". */
  fixedRatio?: string;
  /** Available gears (multiset); default: the default set. */
  set?: number[];
  mountingCondition?: boolean;
  /** false: exercise statement (no tooth counts shown). */
  answer?: boolean;
}

export function LiraFigure({ threadPitch, leadScrewPitch, fixedRatio, set = DEFAULT_GEARSET, mountingCondition = true, answer = true }: LiraProps) {
  const { t } = useTpl(null);
  const P = parse(threadPitch);
  const L = parse(leadScrewPitch);
  const fixed = fixedRatio ? parse(fixedRatio) : undefined;
  const i = quadrantRatio({ threadPitch: P, leadScrewPitch: L, ...(fixed ? { fixedRatio: fixed } : {}) });
  // shown train: prefer four different gears that also meet the mounting condition
  const all = compoundTrains(i, set, { mountingCondition });
  const distinct = (x: { za: number; zb: number; zc: number; zd: number }) => new Set([x.za, x.zb, x.zc, x.zd]).size === 4;
  const found = all.find((x) => distinct(x) && mountingOk(x)) ?? all.find(distinct) ?? all[0];
  if (answer && !found) throw new Error('LiraFigure: no train for this ratio');
  // without the answer, neutral gear sizes and no numbers
  const train = answer && found ? found : { za: 40, zb: 60, zc: 30, zd: 60 };
  const s = 1.05; // px per tooth (radius)
  const r = (z: number) => z * s;
  const A: Pt = [170, 110];
  const aB = deg(28);
  const B: Pt = [A[0] + (r(train.za) + r(train.zb)) * Math.cos(aB), A[1] + (r(train.za) + r(train.zb)) * Math.sin(aB)];
  const aD = deg(100);
  const D: Pt = [B[0] + (r(train.zc) + r(train.zd)) * Math.cos(aD), B[1] + (r(train.zc) + r(train.zd)) * Math.sin(aD)];
  const H = Math.max(330, D[1] + r(train.zd) + 60);
  const gearLabel = (p: Pt, name: string, z: number, dx: number, dy: number) => (
    <Txt x={p[0] + dx} y={p[1] + dy} bold>
      {answer ? `${name} = ${z}` : `${name} = ?`}
    </Txt>
  );
  // Norton box on the lead-screw line, between Zd and the screw
  const nx = D[0] + r(train.zd) + 30;
  const screwX0 = fixed ? nx + 110 : D[0] + r(train.zd) + 20;
  const capKey = fixed ? 'fig.lira.captionFixed' : 'fig.lira.caption';
  return (
    <Frame w={760} h={H} label={t('fig.lira.title')} caption={t(capKey, { P: fmt(pr(P), 2), L: fmt(pr(L), 2), fixed: fixed ? toString(fixed) : '' })}>
      {/* quadrant (lira): slotted arm turning around the lead-screw axis */}
      <path d={`M${D[0] - 30},${D[1] + 24} L${A[0] - 40},${A[1] - 10} L${A[0] + 10},${A[1] - 50} L${D[0] + 34},${D[1] - 6} Z`} fill="#f2f4f7" stroke={C.offStroke} strokeWidth={1.2} />
      <GearFront cx={A[0]} cy={A[1]} r={r(train.za)} z={train.za} lit />
      <GearFront cx={B[0]} cy={B[1]} r={r(train.zb)} z={train.zb} back />
      <GearFront cx={B[0]} cy={B[1]} r={r(train.zc)} z={train.zc} />
      <GearFront cx={D[0]} cy={D[1]} r={r(train.zd)} z={train.zd} />
      {gearLabel(A, 'Za', train.za, 0, -r(train.za) - 10)}
      {gearLabel(B, 'Zb', train.zb, r(train.zb) + 38, -10)}
      {gearLabel(B, 'Zc', train.zc, r(train.zb) + 38, 8)}
      {gearLabel(D, 'Zd', train.zd, 0, r(train.zd) + 22)}
      <Txt x={A[0] - r(train.za) - 12} y={A[1] + 4} anchor="end" size={12} color={C.muted}>
        {t('fig.lira.spindle')}
      </Txt>
      {/* lead screw from Zd (through the Norton box if any), carriage with the thread being cut */}
      <line x1={D[0]} y1={D[1]} x2={720} y2={D[1]} stroke={C.ink} strokeWidth={3} />
      {fixed && (
        <g>
          <rect x={nx} y={D[1] - 26} width={90} height={52} rx={6} fill={C.blueFill} stroke={C.blue} strokeWidth={1.6} />
          <Txt x={nx + 45} y={D[1] - 4} color={C.blue} bold>
            Norton
          </Txt>
          <Txt x={nx + 45} y={D[1] + 14} color={C.blue} size={12}>
            i = {toString(fixed)}
          </Txt>
        </g>
      )}
      {Array.from({ length: Math.max(0, Math.floor((710 - screwX0) / 18)) }, (_, k) => (
        <line key={k} x1={screwX0 + k * 18} y1={D[1] + 8} x2={screwX0 + 9 + k * 18} y2={D[1] - 8} stroke={C.ink} strokeWidth={1.2} />
      ))}
      <Txt x={650} y={D[1] - 16} bold>
        {t('fig.lira.pScrew')} = {fmt(pr(L), 2)} mm
      </Txt>
      <rect x={430} y={60} width={290} height={50} fill={C.offFill} stroke={C.ink} strokeWidth={1.2} />
      {Array.from({ length: 12 }, (_, k) => (
        <line key={k} x1={445 + k * 22} y1={110} x2={456 + k * 22} y2={60} stroke={C.onStroke} strokeWidth={1.2} />
      ))}
      <Txt x={575} y={50} color={C.onStroke} bold>
        {t('fig.lira.pThread')} = {fmt(pr(P), 2)} mm
      </Txt>
      <Txt x={575} y={134} size={12} color={C.muted}>
        {t('fig.lira.piece')}
      </Txt>
      {answer && (
        <Txt x={430} y={H - 16} anchor="start" size={13}>
          i = (Za·Zc)/(Zb·Zd) = ({train.za}·{train.zc})/({train.zb}·{train.zd}) = {toString(i)}
        </Txt>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// power flow with losses
// ---------------------------------------------------------------------------
export function PowerFigure({ chain: j }: { chain: ChainJSON }) {
  const chain = chainFromJSON(j);
  const { t, tpl } = useTpl(chain);
  const sol = solved(chain);
  const inS = chain.input.shaft;
  const outS = chain.shafts.map((s) => s.id).find((s) => s !== inS) as string;
  const Pin = chain.input.power!;
  const Pout = powerAt(chain, {}, sol, outS).P;
  const loss = sub(Pin, Pout);
  const hIn = 90;
  const hOut = (hIn * toNumber(Pout)) / toNumber(Pin);
  const y0 = 90;
  const box = (x: number, s: string, title: string) => (
    <g>
      <rect x={x} y={y0 - 20} width={190} height={hIn + 40} rx={8} fill="#fff" stroke={C.ink} strokeWidth={1.4} />
      <Txt x={x + 95} y={y0 - 30} bold>
        {title}
      </Txt>
      <Txt x={x + 95} y={y0 + 18} color={C.onStroke} bold>
        P = {tpl(`{{P:${s}}}`)} W
      </Txt>
      <Txt x={x + 95} y={y0 + 42} color={C.blue} bold>
        n = {tpl(`{{n:${s}}}`)} rpm
      </Txt>
      <Txt x={x + 95} y={y0 + 66}>T = {tpl(`{{T:${s}}}`)} N·m</Txt>
    </g>
  );
  const eta = Object.values(chain.efficiency ?? {})[0];
  return (
    <Frame w={760} h={300} label={t('fig.power.title')} caption={t('fig.power.caption')}>
      {box(30, inS, t('fig.power.in'))}
      {box(540, outS, t('fig.power.out'))}
      {/* band: width proportional to the power */}
      <path d={`M220,${y0} L540,${y0} L540,${y0 + hOut} L420,${y0 + hOut} Q380,${y0 + hOut} 380,${y0 + hOut + 40} L380,${y0 + 150} L${380 - (hIn - hOut)},${y0 + 150} L${380 - (hIn - hOut)},${y0 + hIn} L220,${y0 + hIn} Z`} fill={C.onFill} stroke={C.onStroke} strokeWidth={1.2} fillOpacity={0.8} />
      <Txt x={380 - (hIn - hOut) / 2} y={y0 + 172} color={C.onStroke} bold>
        {t('fig.power.loss')}: {fmt(pr(loss), 2)} W
      </Txt>
      {eta && (
        <Txt x={460} y={y0 - 34} bold>
          η = {fmt(pr(eta), 4)}
        </Txt>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// symbol table: real mechanism ↔ schema symbol
// ---------------------------------------------------------------------------
export function SymbolsFigure() {
  const { t } = useT();
  const rowH = 96;
  const rows: { key: string; real: ReactNode; sym: ReactNode }[] = [
    {
      key: 'gear',
      real: (
        <>
          <GearFront cx={70} cy={48} r={34} z={20} />
          <GearFront cx={70 + 34 + 22 - 4} cy={48} r={22} z={13} lit />
        </>
      ),
      sym: (
        <>
          <line x1={0} y1={22} x2={120} y2={22} stroke={C.ink} strokeWidth={2.4} />
          <line x1={0} y1={74} x2={120} y2={74} stroke={C.ink} strokeWidth={2.4} />
          <rect x={53} y={8} width={14} height={28} fill={C.onFill} stroke={C.onStroke} />
          <rect x={53} y={36} width={14} height={50} fill={C.offFill} stroke={C.offStroke} />
        </>
      ),
    },
    {
      key: 'belt',
      real: (
        <>
          <circle cx={40} cy={48} r={20} fill={C.onFill} stroke={C.belt} strokeWidth={4} />
          <circle cx={130} cy={48} r={34} fill={C.offFill} stroke={C.belt} strokeWidth={4} />
          <line x1={40} y1={28} x2={130} y2={14} stroke={C.belt} strokeWidth={4} />
          <line x1={40} y1={68} x2={130} y2={82} stroke={C.belt} strokeWidth={4} />
        </>
      ),
      sym: (
        <>
          <line x1={0} y1={14} x2={120} y2={14} stroke={C.ink} strokeWidth={2.4} />
          <line x1={0} y1={82} x2={120} y2={82} stroke={C.ink} strokeWidth={2.4} />
          <rect x={48} y={4} width={24} height={20} fill={C.onFill} stroke={C.onStroke} />
          <rect x={52} y={24} width={16} height={40} fill={C.beltFill} stroke={C.ink} />
          <rect x={48} y={64} width={24} height={30} fill={C.offFill} stroke={C.offStroke} />
        </>
      ),
    },
    {
      key: 'worm',
      real: (
        <>
          <GearFront cx={90} cy={62} r={30} z={30} />
          <rect x={40} y={14} width={100} height={18} rx={5} fill={C.onFill} stroke={C.onStroke} />
          {[50, 62, 74, 86, 98, 110, 122].map((x) => (
            <line key={x} x1={x} y1={31} x2={x + 8} y2={15} stroke={C.onStroke} />
          ))}
        </>
      ),
      sym: (
        <>
          <line x1={60} y1={0} x2={60} y2={50} stroke={C.ink} strokeWidth={2.4} />
          <line x1={0} y1={74} x2={120} y2={74} stroke={C.ink} strokeWidth={2.4} />
          <rect x={50} y={14} width={20} height={34} rx={3} fill="#fff" stroke={C.ink} />
          {[18, 25, 32, 39].map((y) => (
            <line key={y} x1={52} y1={y + 6} x2={68} y2={y} stroke={C.muted} />
          ))}
          <rect x={53} y={50} width={14} height={40} fill={C.offFill} stroke={C.offStroke} />
        </>
      ),
    },
    {
      key: 'rack',
      real: (
        <>
          <GearFront cx={90} cy={36} r={28} z={16} lit />
          <rect x={20} y={66} width={150} height={16} fill={C.blueFill} stroke={C.blue} />
          {Array.from({ length: 13 }, (_, i) => (
            <polygon key={i} points={`${24 + i * 11},66 ${29 + i * 11},60 ${33 + i * 11},66`} fill={C.blue} />
          ))}
        </>
      ),
      sym: (
        <>
          <line x1={0} y1={30} x2={120} y2={30} stroke={C.ink} strokeWidth={2.4} />
          <rect x={53} y={12} width={14} height={36} fill={C.onFill} stroke={C.onStroke} />
          <rect x={10} y={54} width={100} height={10} fill={C.blueFill} stroke={C.blue} />
          <Arrow x1={30} y1={80} x2={90} y2={80} color={C.blue} both />
        </>
      ),
    },
    {
      key: 'screw',
      real: (
        <>
          <rect x={10} y={38} width={160} height={20} fill="#f7f9fc" stroke={C.ink} />
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1={12 + i * 10} y1={58} x2={20 + i * 10} y2={38} stroke={C.ink} />
          ))}
          <rect x={70} y={28} width={44} height={40} rx={3} fill={C.blueFill} fillOpacity={0.85} stroke={C.blue} strokeWidth={1.4} />
        </>
      ),
      sym: (
        <>
          <path d={Array.from({ length: 12 }, (_, i) => `${i ? 'L' : 'M'}${i * 10},${i % 2 ? 40 : 56}`).join('')} fill="none" stroke={C.ink} strokeWidth={1.6} />
          <rect x={44} y={22} width={34} height={14} fill={C.blueFill} stroke={C.blue} />
          <Arrow x1={30} y1={80} x2={90} y2={80} color={C.blue} both />
        </>
      ),
    },
  ];
  const W = 640;
  const H = rows.length * rowH + 40;
  return (
    <Frame w={W} h={H} label={t('fig.sym.title')}>
      <Txt x={110} y={24} color={C.muted} size={12}>
        {t('fig.sym.real')}
      </Txt>
      <Txt x={510} y={24} color={C.muted} size={12}>
        {t('fig.sym.symbol')}
      </Txt>
      {rows.map((r, i) => (
        <g key={r.key} transform={`translate(0, ${36 + i * rowH})`}>
          {i > 0 && <line x1={20} y1={-4} x2={W - 20} y2={-4} stroke="#e3e7ee" />}
          <g transform="translate(20, 0)">{r.real}</g>
          <Txt x={320} y={52} bold>
            {t(`fig.sym.${r.key}`)}
          </Txt>
          <Arrow x1={250} y1={66} x2={390} y2={66} color={C.muted} w={1} />
          <g transform="translate(450, 0)">{r.sym}</g>
        </g>
      ))}
    </Frame>
  );
}
