/**
 * Template variables for theory examples (spec §14.3): texts carry {{…}} variables,
 * never hand-written numbers. Every value is computed here from the solvers.
 *
 *   {{n:S}}            speed of shaft S (rpm)
 *   {{dir:S}}          direction of S relative to the input, in words (eu/es)
 *   {{i:A:B}}          ratio n(B)/n(A) as a fraction;  {{idec:A:B}} as a decimal
 *   {{z:E:1}} {{z:E:2}} tooth count of element E (side 1 or 2); {{d1:E}} {{d2:E}} belt diameters
 *   {{m:E}}            module of E;   {{k:E}} worm or screw starts;  {{p:E}} screw pitch
 *   {{v:O}}            linear speed of output O (mm/min);  {{vs:O}} in m/s
 *   {{f:O:S}}          feed of O per revolution of S (mm/rev)
 *   {{d:E:1}} {{da:E:1}} {{df:E:1}} {{h:E}} {{pc:E}}   spur gear geometry of side 1/2 of E (mm)
 *   {{a:E}}            centre distance of gear E (mm)
 *   {{count:S}} {{max:S}} {{min:S}}   speed table of S over every cluster position
 *   {{w:S}}            angular speed of S (rad/s);  {{T:S}} torque (N·m);  {{P:S}} power (W)
 *   {{n0}}             input speed (rpm)
 *   {{index:K:N}}      simple indexing "turns + fraction";  {{indexN:K:N}} "K/N = turns + fraction"
 *   {{gears:P:L}}      change-gear ratio P/L;  {{gearsN:P:L}} "P/L = i";  {{train:P:L}} first mountable 4-gear train
 *                      of the default set, "(Za·Zc)/(Zb·Zd)"
 */
import { DEFAULT_GEARSET, compoundTrains, requiredRatio } from './changeGears';
import { centerDistance, gearGeometry, rackPinionDiameter } from './geometry';
import { fmt } from './grader';
import { indexingFraction } from './indexing';
import type { Chain, State } from './model';
import { powerAt } from './power';
import { type Rational, div, parse, pr, prDiv, toString as rs } from './rational';
import { solveStateA, speedTableA } from './solverPath';
import { mmPerMinToMPerS, rpmToRadPerS } from './units';

export class TemplateError extends Error {}

const n2 = (r: Rational) => fmt(pr(r), 2);

const DIR = { eu: { same: 'sarrerako ardatzaren noranzko bera', opposite: 'sarrerako ardatzaren kontrakoa' }, es: { same: 'el mismo sentido que el eje de entrada', opposite: 'sentido contrario al eje de entrada' } } as const;

export function fillTemplate(text: string, chain: Chain | null, state: State = {}, lang: 'eu' | 'es' = 'eu'): string {
  const sol = chain ? solveStateA(chain, state) : null;
  if (sol && !sol.ok) throw new TemplateError(sol.error);
  const el = (id: string) => {
    const e = chain?.elements.find((x) => x.id === id);
    if (!e) throw new TemplateError(`unknown element ${id}`);
    return e;
  };
  const shaft = (id: string) => {
    if (!sol || !sol.ok) throw new TemplateError('no chain');
    const s = sol.shafts[id];
    if (!s) throw new TemplateError(`shaft ${id} not driven`);
    return s;
  };
  const side = (e: ReturnType<typeof el>, s: string) => {
    if (!('z1' in e)) throw new TemplateError(`${e.id} has no teeth`);
    return s === '2' ? e.z2 : e.z1;
  };
  return text.replace(/\{\{([^}]+)\}\}/g, (_m, body: string) => {
    const [k, a = '', b = ''] = body.split(':');
    switch (k) {
      case 'n0':
        if (!chain) throw new TemplateError('no chain');
        return n2(chain.input.n);
      case 'n':
        return n2(shaft(a).n);
      case 'dir': {
        const d = shaft(a).dir;
        if (d === null) throw new TemplateError(`direction of ${a} undefined`);
        return DIR[lang][d === 1 ? 'same' : 'opposite'];
      }
      case 'i':
        return rs(div(shaft(b).n, shaft(a).n));
      case 'idec':
        return fmt(pr(div(shaft(b).n, shaft(a).n)), 4);
      case 'z': {
        const e = el(a);
        if (e.kind === 'worm') return String(b === '2' ? e.z : e.starts);
        if (e.kind === 'rack') return String(e.z);
        return String(side(e, b));
      }
      case 'd1':
      case 'd2': {
        const e = el(a);
        if (e.kind !== 'belt') throw new TemplateError(`${a} is not a belt`);
        return n2(k === 'd1' ? e.d1 : e.d2);
      }
      case 'm': {
        const e = el(a);
        if ((e.kind === 'gear' || e.kind === 'rack') && e.module) return fmt(pr(e.module), 2);
        if (e.kind === 'rack' && e.pitch) return fmt(pr(e.pitch, -1), 4); // m = p/π
        throw new TemplateError(`${a} has no module`);
      }
      case 'k': {
        const e = el(a);
        if (e.kind === 'worm' || e.kind === 'screw') return String(e.starts);
        throw new TemplateError(`${a} has no starts`);
      }
      case 'p': {
        const e = el(a);
        if (e.kind === 'screw') return fmt(pr(e.pitch), 2);
        throw new TemplateError(`${a} is not a screw`);
      }
      case 'v':
      case 'vs': {
        if (!sol || !sol.ok) throw new TemplateError('no chain');
        const v = sol.linear[a];
        if (!v) throw new TemplateError(`output ${a} not driven`);
        return k === 'v' ? fmt(v.v, 2) : fmt(mmPerMinToMPerS(v.v), 4);
      }
      case 'f': {
        if (!sol || !sol.ok) throw new TemplateError('no chain');
        const v = sol.linear[a];
        if (!v) throw new TemplateError(`output ${a} not driven`);
        return fmt(prDiv(v.v, pr(shaft(b).n)), 4);
      }
      case 'd':
      case 'da':
      case 'df':
      case 'h':
      case 'pc': {
        const e = el(a);
        if (k === 'd' && e.kind === 'rack') return fmt(rackPinionDiameter(e), 2);
        const m = (e.kind === 'gear' || e.kind === 'rack') && e.module ? e.module : null;
        if (!m) throw new TemplateError(`${a} has no module`);
        const z = e.kind === 'rack' ? e.z : side(e, b || '1');
        const g = gearGeometry(m, z);
        return k === 'pc' ? fmt(g.p, 2) : n2(g[k]);
      }
      case 'a': {
        const e = el(a);
        if (e.kind !== 'gear' || !e.module) throw new TemplateError(`${a}: centre distance needs a gear with module`);
        return n2(centerDistance(e.module, e.z1, e.z2, !!e.internal));
      }
      case 'count':
      case 'max':
      case 'min': {
        if (!chain) throw new TemplateError('no chain');
        const t = speedTableA(chain, a);
        if (k === 'count') return String(t.distinct.length);
        return n2((k === 'max' ? t.distinct[t.distinct.length - 1] : t.distinct[0]) as Rational);
      }
      case 'w':
        return fmt(rpmToRadPerS(shaft(a).n), 2);
      case 'T':
      case 'P': {
        if (!chain || !sol || !sol.ok) throw new TemplateError('no chain');
        const p = powerAt(chain, state, sol, a);
        return k === 'T' ? fmt(p.T, 2) : n2(p.P);
      }
      case 'index': {
        const f = indexingFraction(Number(a), Number(b));
        return `${f.turns} + ${rs(f.fraction)}`;
      }
      case 'indexN': {
        const f = indexingFraction(Number(a), Number(b));
        return `${a}/${b} = ${f.turns} + ${rs(f.fraction)}`;
      }
      case 'gears':
        return rs(requiredRatio(parse(a), parse(b)));
      case 'gearsN':
        return `${a}/${b} = ${rs(requiredRatio(parse(a), parse(b)))}`;
      case 'train': {
        const t = compoundTrains(requiredRatio(parse(a), parse(b)), DEFAULT_GEARSET, { mountingCondition: true })[0];
        if (!t) throw new TemplateError(`no mountable train for ${a}/${b}`);
        return `(${t.za}·${t.zc})/(${t.zb}·${t.zd})`;
      }
      default:
        throw new TemplateError(`unknown variable {{${body}}}`);
    }
  });
}

/** Every {{…}} variable used in a text. */
export const templateVars = (text: string): string[] => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1] as string);

