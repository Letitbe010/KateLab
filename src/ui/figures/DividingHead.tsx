/**
 * Dividing head (simple indexing), two views:
 *  - left: the mechanism as a kinematic sketch: crank and index plate → worm (k = 1)
 *    → worm wheel (Z = K) on the spindle → workpiece with N divisions;
 *  - right: the index plate seen from the front, with its hole circles; with an
 *    answer, the crank pin, the sector arms and the holes to advance.
 * Every number comes from the props (K, N, plates, answer); nothing is typed by hand.
 */
import { useT } from '../../i18n';
import type { IndexingAnswer } from '../../core/indexing';

const C = {
  ink: '#0f1b2d',
  muted: '#5a6779',
  onFill: '#ffd29a',
  onStroke: '#b45309',
  offFill: '#eef1f5',
  offStroke: '#8a96a6',
  blue: '#1d5fd1',
  blueFill: '#dbe7fb',
};

export interface DividingHeadProps {
  K: number;
  N: number;
  /** Hole circles of each plate. */
  plates: number[][];
  /** Shown in the solution / theory: whole turns + holes on a circle. */
  answer?: IndexingAnswer | null;
}

const W = 780;
const H = 364;

export function DividingHead({ K, N, plates, answer }: DividingHeadProps) {
  const { t } = useT();
  // plate shown on the right: the one with the answer circle, else the first one
  const plate = (answer && plates.find((p) => p.includes(answer.circle))) ?? plates[0] ?? [];
  const circles = [...plate].sort((a, b) => a - b);
  const cx = 600;
  const cy = 186;
  const rOf = (i: number) => 50 + (i * 82) / Math.max(1, circles.length - 1);
  const active = answer ? circles.indexOf(answer.circle) : -1;
  const ang = (k: number, n: number) => -Math.PI / 2 + (2 * Math.PI * k) / n; // hole k of n, clockwise from the top
  const P = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

  const right: JSX.Element[] = [];
  let key = 0;
  const K_ = () => `d${key++}`;
  // plate disc
  right.push(<circle key={K_()} cx={cx} cy={cy} r={146} fill="#f7f9fc" stroke={C.ink} strokeWidth={1.4} />);
  circles.forEach((n, i) => {
    const r = rOf(i);
    const on = i === active;
    for (let k = 0; k < n; k++) {
      const [x, y] = P(r, ang(k, n));
      const inSector = on && answer && k > 0 && k <= answer.holes;
      right.push(<circle key={K_()} cx={x} cy={y} r={on ? 2.6 : 1.7} fill={inSector ? C.onStroke : on ? C.ink : C.offStroke} />);
    }
    // circle number on a ray to the lower left
    const [lx, ly] = P(r, Math.PI);
    right.push(
      <text key={K_()} x={lx} y={ly + 4} fontSize={on ? 13 : 11} textAnchor="middle" fill={on ? C.onStroke : C.muted} fontWeight={on ? 700 : 400} stroke="#f7f9fc" strokeWidth={4} paintOrder="stroke">
        {n}
      </text>,
    );
  });
  right.push(<circle key={K_()} cx={cx} cy={cy} r={9} fill="#fff" stroke={C.ink} strokeWidth={1.4} />);
  if (answer && active >= 0) {
    const r = rOf(active);
    const a1 = ang(answer.holes, answer.circle);
    // sector between the arms: the holes to advance
    if (answer.holes > 0) {
      const [x0, y0] = P(r + 12, ang(0, 1));
      const [x1, y1] = P(r + 12, a1);
      const large = answer.holes / answer.circle > 0.5 ? 1 : 0;
      right.push(<path key={K_()} d={`M${cx},${cy} L${x0},${y0} A${r + 12},${r + 12} 0 ${large} 1 ${x1},${y1} Z`} fill={C.onFill} fillOpacity={0.45} stroke="none" />);
    }
    for (const a of [ang(0, 1), a1]) {
      const [x, y] = P(r + 16, a);
      right.push(<line key={K_()} x1={cx} y1={cy} x2={x} y2={y} stroke={C.onStroke} strokeWidth={2.2} />);
    }
    // crank arm with the pin in hole 0 and the knob
    const [px, py] = P(r, ang(0, 1));
    const [ex, ey] = P(158, ang(0, 1));
    right.push(<line key={K_()} x1={cx} y1={cy} x2={ex} y2={ey} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />);
    right.push(<circle key={K_()} cx={px} cy={py} r={5} fill="#fff" stroke={C.ink} strokeWidth={2} />);
    right.push(<circle key={K_()} cx={ex} cy={ey} r={9} fill={C.ink} />);
  }

  // ---- left: mechanism sketch ----
  const sy = 70; // spindle axis
  const wx = 175; // worm wheel / crank shaft
  const wr = 56; // wheel radius (edge view)
  const left = (
    <g transform="translate(0, 24)">
      {/* spindle with bearings */}
      <line x1={60} y1={sy} x2={372} y2={sy} stroke={C.ink} strokeWidth={2.6} />
      {[72, 262].map((x) => (
        <rect key={x} x={x - 4} y={sy - 7} width={8} height={14} fill="#fff" stroke={C.ink} strokeWidth={1.2} />
      ))}
      {/* worm wheel Z = K */}
      <rect x={wx - 11} y={sy - wr} width={22} height={2 * wr} rx={2} fill={C.offFill} stroke={C.offStroke} strokeWidth={1.3} />
      <path d={`M${wx - 3},${sy - 3}L${wx + 3},${sy + 3}M${wx - 3},${sy + 3}L${wx + 3},${sy - 3}`} stroke={C.ink} strokeWidth={1.3} />
      {/* workpiece with N divisions */}
      <rect x={318} y={sy - 40} width={34} height={80} rx={2} fill={C.blueFill} stroke={C.blue} strokeWidth={1.4} />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1={318} y1={sy - 36 + i * 9} x2={352} y2={sy - 36 + i * 9} stroke={C.blue} strokeWidth={0.8} />
      ))}
      {/* crank shaft (perpendicular to the spindle) with the worm */}
      <line x1={wx} y1={sy + wr + 2} x2={wx} y2={292} stroke={C.ink} strokeWidth={2.6} />
      <rect x={wx - 12} y={sy + wr + 2} width={24} height={46} rx={3} fill="#fff" stroke={C.ink} strokeWidth={1.4} />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={wx - 10} y1={sy + wr + 12 + i * 7} x2={wx + 10} y2={sy + wr + 6 + i * 7} stroke={C.muted} strokeWidth={1.2} />
      ))}
      {/* index plate (edge view, fixed) and crank */}
      <rect x={wx - 60} y={244} width={120} height={8} fill="#f7f9fc" stroke={C.ink} strokeWidth={1.3} />
      <line x1={wx} y1={274} x2={wx + 46} y2={274} stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
      <line x1={wx + 40} y1={274} x2={wx + 40} y2={253} stroke={C.ink} strokeWidth={2} />
      <circle cx={wx + 52} cy={282} r={8} fill={C.ink} />
      {/* labels */}
      <text x={wx} y={sy - wr - 8} fontSize={13} textAnchor="middle" fill={C.ink} fontWeight={700}>
        Z = {K}
      </text>
      <text x={wx + 20} y={sy + wr + 30} fontSize={13} fill={C.ink} fontWeight={700}>
        k = 1
      </text>
      <text x={wx + 20} y={sy + wr + 46} fontSize={12} fill={C.muted}>
        {t('fig.dh.worm')}
      </text>
      <text x={wx + 18} y={sy - 30} fontSize={12} fill={C.muted}>
        {t('fig.dh.wheel')}
      </text>
      <text x={335} y={sy + 58} fontSize={13} textAnchor="middle" fill={C.blue} fontWeight={700}>
        N = {N}
      </text>
      <text x={335} y={sy + 74} fontSize={12} textAnchor="middle" fill={C.muted}>
        {t('fig.dh.piece')}
      </text>
      <text x={66} y={sy - 12} fontSize={12} fill={C.muted}>
        {t('fig.dh.spindle')}
      </text>
      <text x={wx - 66} y={252} fontSize={12} textAnchor="end" fill={C.muted}>
        {t('fig.dh.plate')}
      </text>
      <text x={wx + 66} y={294} fontSize={12} fill={C.muted}>
        {t('fig.dh.crank')}
      </text>
      <text x={20} y={326} fontSize={13} fill={C.ink}>
        {t('fig.dh.relation', { K })}
      </text>
    </g>
  );

  const caption = answer
    ? t('fig.dh.answer', { turns: answer.turns, holes: answer.holes, circle: answer.circle })
    : t('fig.dh.question', { N });
  return (
    <figure className="fig">
      <div className="schema-box">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block', fontFamily: '"Segoe UI", Arial, sans-serif' }} role="img" aria-label={`${t('fig.dh.title')}. ${caption}`}>
          {left}
          <line x1={410} y1={20} x2={410} y2={320} stroke="#d6dce4" strokeWidth={1} />
          <text x={cx} y={H - 6} fontSize={12} textAnchor="middle" fill={C.muted}>
            {t('fig.dh.front')}
          </text>
          {right}
        </svg>
      </div>
      <figcaption className="note">{caption}</figcaption>
    </figure>
  );
}
