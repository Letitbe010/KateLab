/**
 * Worked exercises (spec §15): the steps are built from the solvers at run time.
 * Each step has three layers: what (the calculation, with numbers from the solver),
 * why (the reason, with a theory topic) and careful (the usual mistake there).
 * No number is written in the texts: they are templates filled here.
 */
import { DEFAULT_GEARSET, compoundTrains, requiredRatio } from '../core/changeGears';
import { centerDistance, rackPinionDiameter } from '../core/geometry';
import { fmt, gradeAsk, unitsFor } from '../core/grader';
import { indexingFraction, indexingSolutions } from '../core/indexing';
import { type Ask, type Element, type KinExercise, type State, activeElements, exerciseForAsk, stateKey } from '../core/model';
import { powerAt } from '../core/power';
import { type Rational, div, mul, pr, prDiv, q, toString as rs } from '../core/rational';
import { pathSolution } from '../core/solution';
import { maxFeedPerRevA, solveStateA, speedTableA } from '../core/solverPath';
import { mmPerMinToMPerS, rpmToRadPerS } from '../core/units';
import { type Lang, translate } from '../i18n';
import { elementName, outputName, shaftName, stateText } from './describe';

export interface WStep {
  key: string;
  title: string;
  what: string[];
  why?: string;
  careful?: string;
  table?: { head: [string, string]; rows: { label: string; value: string; best?: boolean }[] };
  state: State;
  lit: string[];
  known: Record<string, string>;
}

const KIND: Record<Lang, Record<Element['kind'], string>> = {
  eu: { gear: 'engranajea', bevel: 'engranaje konikoa', chain: 'katea', belt: 'uhala', worm: 'torloju amaigabea', clutch: 'kardana', rack: 'kremailera', screw: 'torlojua' },
  es: { gear: 'engranaje', bevel: 'engranaje cónico', chain: 'cadena', belt: 'correa', worm: 'tornillo sinfín', clutch: 'cardán', rack: 'cremallera', screw: 'husillo' },
};

const n2 = (r: Rational) => fmt(pr(r), 2);
const defaultState = (ex: KinExercise): State => ex.state ?? Object.fromEntries(ex.chain.clusters.map((c) => [c.id, c.options[0] as string]));

/** Shafts that carry only an idler gear (two meshes with the same gear). */
function idlerShafts(ex: KinExercise, st: State): Set<string> {
  const act = activeElements(ex.chain, st);
  const out = new Set<string>();
  for (const s of ex.chain.shafts) {
    const on = act.filter((e) => e.from === s.id || ('to' in e && e.to === s.id));
    if (on.length !== 2 || on.some((e) => e.kind !== 'gear')) continue;
    const zAt = (e: Element) => (e.kind === 'gear' ? (e.from === s.id ? e.z1 : e.z2) : -1);
    if (zAt(on[0] as Element) === zAt(on[1] as Element)) out.add(s.id);
  }
  return out;
}

export function buildWorked(ex: KinExercise, lang: Lang): WStep[] {
  const t = (k: string, v: Record<string, string | number> = {}) => translate(lang, k, v);
  const steps: WStep[] = [];
  const explained = new Map<string, Set<string>>(); // state key → element ids already explained
  const known = new Map<string, Record<string, string>>(); // state key → shaft speeds shown
  const st0 = defaultState(ex);
  const kOf = (st: State) => stateKey(ex.chain, st);
  const litOf = (st: State) => [...(explained.get(kOf(st)) ?? [])];
  const knownOf = (st: State) => ({ ...(known.get(kOf(st)) ?? { [ex.chain.input.shaft]: `${n2(ex.chain.input.n)} rpm` }) });
  const push = (s: Omit<WStep, 'lit' | 'known'> & { lit?: string[]; known?: Record<string, string> }) =>
    steps.push({ lit: litOf(s.state), known: knownOf(s.state), ...s });

  // 1. read the schema
  push({
    key: 'read',
    title: t('wk.read.title'),
    what: [t('wk.read.what', { input: shaftName(ex, ex.chain.input.shaft), n: n2(ex.chain.input.n) })],
    why: t('wk.read.why'),
    ...(ex.chain.clusters.length ? { careful: t('wk.read.careful') } : {}),
    state: st0,
  });

  /** Explain every not-yet-explained stage on the way to `target`. */
  const explainPath = (st: State, target: string) => {
    if (target === ex.chain.input.shaft) return;
    const k = kOf(st);
    if (!explained.has(k)) explained.set(k, new Set());
    if (!known.has(k)) known.set(k, { [ex.chain.input.shaft]: `${n2(ex.chain.input.n)} rpm` });
    const done = explained.get(k) as Set<string>;
    const kn = known.get(k) as Record<string, string>;
    const idlers = idlerShafts(ex, st);
    for (const s of pathSolution(ex.chain, st, target).stages) {
      if (done.has(s.element)) continue;
      done.add(s.element);
      kn[s.to] = `${n2(s.nTo)} rpm`;
      const e = ex.chain.elements.find((x) => x.id === s.element) as Element;
      const vars = { from: shaftName(ex, s.from), to: shaftName(ex, s.to), num: s.num, den: s.den, nfrom: n2(s.nFrom), nto: n2(s.nTo), factor: s.factor ?? '' };
      const careful = idlers.has(s.to) || idlers.has(s.from) ? t('wk.careful.idler') : e.kind === 'gear' || e.kind === 'bevel' || e.kind === 'chain' ? t('wk.careful.gear') : e.kind === 'belt' ? t('wk.careful.belt') : e.kind === 'worm' ? t('wk.careful.worm') : undefined;
      push({
        key: `stage-${k}-${s.element}`,
        title: `${t('wk.stage.title', { from: vars.from, to: vars.to, kind: KIND[lang][e.kind] })} · ${elementName(ex, s.element)}`,
        what: [t(s.factor ? 'wk.stage.whatSlip' : 'wk.stage.what', vars)],
        why: t(`wk.why.${e.kind}`),
        ...(careful ? { careful } : {}),
        state: st,
      });
    }
  };

  ex.asks.forEach((ask, i) => {
    const exA = exerciseForAsk(ex, ask);
    const st = exA.state ?? st0;
    const key = `ask-${i}`;
    switch (ask.type) {
      case 'speed': {
        explainPath(st, ask.shaft);
        const s = solveStateA(ex.chain, st);
        if (!s.ok) throw new Error(s.error);
        push({ key, title: t('wk.res.speed.title', { shaft: shaftName(ex, ask.shaft) }), what: [t('wk.res.speed.what', { shaft: shaftName(ex, ask.shaft), n: n2(s.shafts[ask.shaft]!.n) })], state: st });
        break;
      }
      case 'ratio': {
        explainPath(st, ask.to);
        const s = solveStateA(ex.chain, st);
        if (!s.ok) throw new Error(s.error);
        const a = s.shafts[ask.from]!.n;
        const b = s.shafts[ask.to]!.n;
        const i_ = div(b, a);
        push({
          key,
          title: t('wk.res.ratio.title'),
          what: [t('wk.res.ratio.what', { from: shaftName(ex, ask.from), to: shaftName(ex, ask.to), nfrom: n2(a), nto: n2(b), frac: rs(i_), dec: fmt(pr(i_), 4) })],
          why: t('wk.res.ratio.why'),
          careful: t('wk.res.ratio.careful'),
          state: st,
        });
        break;
      }
      case 'direction': {
        explainPath(st, ask.shaft);
        const s = solveStateA(ex.chain, st);
        if (!s.ok) throw new Error(s.error);
        const stages = pathSolution(ex.chain, st, ask.shaft).stages;
        const flips = stages.filter((x) => {
          const e = ex.chain.elements.find((y) => y.id === x.element);
          return (e?.kind === 'gear' && !e.internal) || (e?.kind === 'belt' && e.crossed);
        }).length;
        const d = s.shafts[ask.shaft]!.dir;
        const inDir = ex.chain.input.direction;
        const res = inDir ? t(`dir.${d === 1 ? inDir : inDir === 'cw' ? 'ccw' : 'cw'}`) : t(`dir.${d === 1 ? 'same' : 'opposite'}`);
        push({ key, title: t('wk.dir.title', { shaft: shaftName(ex, ask.shaft) }), what: [t('wk.dir.what', { count: flips, result: res })], why: t('wk.dir.why'), careful: t('wk.dir.careful'), state: st });
        break;
      }
      case 'linearSpeed':
      case 'feedPerMin':
      case 'feedPerRev': {
        if (ask.type === 'feedPerRev' && ask.max) {
          const m = maxFeedPerRevA(ex.chain, ask.output, ask.spindle);
          const best = m.at[0] as State;
          const rows = m.rows.map((r) => ({ label: stateText(ex, r.state), value: fmt(r.f, 4), best: r.state === best || JSON.stringify(r.state) === JSON.stringify(best) }));
          push({
            key,
            title: t('wk.feedmax.title', { output: outputName(ex, lang, ask.output), spindle: shaftName(ex, ask.spindle) }),
            what: [t('wk.feedmax.what', { output: outputName(ex, lang, ask.output), spindle: shaftName(ex, ask.spindle), f: fmt(m.max, 4), state: stateText(ex, best) })],
            why: t('wk.feedmax.why'),
            careful: t('wk.feedmax.careful'),
            table: { head: [t('sol.state'), 'mm/rev'], rows },
            state: best,
            lit: activeElements(ex.chain, best).map((e) => e.id),
          });
          break;
        }
        const drive = activeElements(ex.chain, st).find((e) => 'output' in e && e.output === ask.output);
        if (!drive || !('output' in drive)) break;
        explainPath(st, drive.from);
        const s = solveStateA(ex.chain, st);
        if (!s.ok) throw new Error(s.error);
        const n = s.shafts[drive.from]!.n;
        const v = s.linear[ask.output]!.v;
        const out = outputName(ex, lang, ask.output);
        explained.get(kOf(st))?.add(drive.id);
        if (drive.kind === 'rack') {
          const d = rackPinionDiameter(drive);
          push({
            key: `${key}-lin`,
            title: t('wk.rack.title', { output: out }),
            what: [
              drive.pitch
                ? t('wk.rackP.what', { p: fmt(pr(drive.pitch), 2), z: drive.z, d: fmt(d, 2), n: n2(n), v: fmt(v, 2), vs: fmt(mmPerMinToMPerS(v), 4) })
                : t('wk.rack.what', { m: fmt(pr(drive.module as Rational), 2), z: drive.z, d: fmt(d, 2), n: n2(n), v: fmt(v, 2), vs: fmt(mmPerMinToMPerS(v), 4) }),
            ],
            why: t('wk.rack.why'),
            careful: t('wk.rack.careful'),
            state: st,
          });
        } else if (drive.kind === 'screw') {
          push({
            key: `${key}-lin`,
            title: t('wk.screw.title', { output: out }),
            what: [t('wk.screw.what', { n: n2(n), k: drive.starts, p: fmt(pr(drive.pitch), 2), v: fmt(v, 2) })],
            why: t('wk.screw.why'),
            careful: t('wk.screw.careful'),
            state: st,
          });
        }
        if (ask.type === 'feedPerRev') {
          explainPath(st, ask.spindle);
          const ns = s.shafts[ask.spindle]!.n;
          push({
            key,
            title: t('wk.feedrev.title', { output: out, spindle: shaftName(ex, ask.spindle) }),
            what: [t('wk.feedrev.what', { spindle: shaftName(ex, ask.spindle), v: fmt(v, 2), n: n2(ns), f: fmt(prDiv(v, pr(ns)), 4) })],
            why: t('wk.feedrev.why'),
            careful: t('wk.feedrev.careful'),
            state: st,
          });
        }
        break;
      }
      case 'speedMaxMin':
      case 'speedCount': {
        if (steps.some((x) => x.key === `table-${ask.shaft}`)) break;
        const tb = speedTableA(ex.chain, ask.shaft);
        const max = tb.distinct[tb.distinct.length - 1] as Rational;
        const min = tb.distinct[0] as Rational;
        push({
          key: `table-${ask.shaft}`,
          title: t('wk.table.title', { shaft: shaftName(ex, ask.shaft) }),
          what: [t('wk.table.what', { count: tb.distinct.length, max: n2(max), min: n2(min) })],
          why: t('wk.table.why'),
          careful: t('wk.table.careful'),
          table: { head: [t('sol.state'), 'rpm'], rows: tb.rows.map((r) => ({ label: stateText(ex, r.state), value: n2(r.n), best: r.n === max || r.n === min || rs(r.n) === rs(max) || rs(r.n) === rs(min) })) },
          state: st,
        });
        break;
      }
      case 'pitchDiameter': {
        const e = ex.chain.elements.find((x) => x.id === ask.element);
        if (e?.kind !== 'rack') break;
        const d = rackPinionDiameter(e);
        push({
          key,
          title: t('ask.pitchDiameter', { what: elementName(ex, e.id) }),
          what: [e.pitch ? t('sol.pitchDiameterP', { p: fmt(pr(e.pitch), 2), z: e.z, d: fmt(d, 2) }) : t('sol.pitchDiameter', { m: fmt(pr(e.module as Rational), 2), z: e.z, d: fmt(d, 2) })],
          careful: t('wk.rack.careful'),
          state: st,
          lit: [e.id],
        });
        break;
      }
      case 'centerDistance': {
        const id = ask.cluster ? ex.chain.clusters.find((c) => c.id === ask.cluster)?.options[0] : ask.element;
        const e = ex.chain.elements.find((x) => x.id === id);
        if (!e || e.kind !== 'gear' || !e.module) break;
        const a = centerDistance(e.module, e.z1, e.z2, !!e.internal);
        const what = ask.cluster ? (ex.chain.clusters.find((c) => c.id === ask.cluster)?.label ?? '') : elementName(ex, e.id);
        push({
          key,
          title: t('wk.centre.title', { what }),
          what: [t(e.internal ? 'sol.centreInt' : 'sol.centre', { m: rs(e.module).replace('.', ','), z1: e.z1, z2: e.z2, a: n2(a) })],
          ...(ask.cluster ? { why: t('wk.centre.why') } : {}),
          careful: t('wk.centre.careful'),
          state: st,
          lit: [e.id],
        });
        break;
      }
      case 'indexing': {
        const K = ex.data?.K ?? 40;
        const plates = ex.data?.platesHoles ?? [];
        const f = indexingFraction(K, ask.N);
        const sols = indexingSolutions(K, ask.N, plates);
        const first = sols[0];
        push({
          key,
          title: t('wk.index.title', { N: ask.N }),
          what: [
            t('wk.index.what', { K, N: ask.N, turns: f.turns, frac: rs(f.fraction) }),
            ...(first ? [t('wk.index.what2', { den: f.fraction.d.toString(), holes: first.holes, circle: first.circle, list: sols.map((s) => `${s.turns} + ${s.holes}/${s.circle}`).join(' · ') })] : []),
          ],
          why: t('wk.index.why'),
          careful: t('wk.index.careful'),
          state: st,
        });
        break;
      }
      case 'changeGears': {
        const i_ = requiredRatio(ask.threadPitch, ask.leadScrewPitch);
        const trains = compoundTrains(i_, ex.data?.changeGears ?? DEFAULT_GEARSET, { mountingCondition: !!ask.mountingCondition });
        const tr = trains[0];
        push({
          key,
          title: t('wk.gears.title'),
          what: [
            t('wk.gears.what', { p: fmt(pr(ask.threadPitch), 3), lead: fmt(pr(ask.leadScrewPitch), 3), i: rs(i_) }),
            ...(tr ? [t('wk.gears.what2', { za: tr.za, zb: tr.zb, zc: tr.zc, zd: tr.zd, i: rs(mul(q(tr.za, tr.zb), q(tr.zc, tr.zd))), list: trains.slice(1, 7).map((x) => `${x.za}/${x.zb}·${x.zc}/${x.zd}`).join(' · ') })] : []),
          ],
          why: t('wk.gears.why'),
          careful: t('wk.gears.careful'),
          state: st,
        });
        break;
      }
      case 'torquePower': {
        explainPath(st, ask.shaft);
        const s = solveStateA(ex.chain, st);
        if (!s.ok) throw new Error(s.error);
        const p = powerAt(ex.chain, st, s, ask.shaft);
        const n = s.shafts[ask.shaft]!.n;
        push({
          key,
          title: t('wk.power.title', { shaft: shaftName(ex, ask.shaft) }),
          what: [t('wk.power.what', { pin: n2(ex.chain.input.power ?? q(0)), eta: fmt(pr(p.etaPath), 4), p: n2(p.P), w: fmt(rpmToRadPerS(n), 2), t: fmt(p.T, 2) })],
          why: t('wk.power.why'),
          careful: t('wk.power.careful'),
          state: st,
        });
        break;
      }
      default:
        break;
    }
  });

  // summary: the expected answer of every ask
  const lines = ex.asks.map((a: Ask, i) => {
    const r = gradeAsk(ex, a, {});
    const label = `${String.fromCharCode(97 + i)})`;
    if (a.type === 'indexing') return `${label} ${r.solutions?.[0] ? `${r.solutions[0].turns} + ${r.solutions[0].holes}/${r.solutions[0].circle}` : ''}`;
    if (a.type === 'changeGears') return `${label} ${r.solutions?.[0] ? Object.values(r.solutions[0]).join(' / ') : ''}`;
    if (a.type === 'direction') return `${label} ${t(`dir.${r.fields[0]?.expected ?? ''}`)}`;
    const unit = unitsFor(a)[0] ?? '';
    return `${label} ${r.fields.map((f) => (r.fields.length > 1 ? `${t(`field.${f.field}`)} = ${f.expected}` : f.expected)).join(' · ')}${unit && a.type !== 'torquePower' ? ` ${unit}` : ''}`;
  });
  push({ key: 'summary', title: t('wk.summary.title'), what: lines, state: st0 });
  return steps;
}
