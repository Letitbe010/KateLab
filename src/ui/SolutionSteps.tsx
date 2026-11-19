/**
 * Step-by-step solution (spec §8.4), rendered from solver data only: stage
 * fractions, total ratio, shaft speeds, linear outputs, speed table, and the
 * expected answers with every valid solution for multi-solution asks.
 */
import { requiredRatio } from '../core/changeGears';
import { centerDistance } from '../core/geometry';
import { type AskResult, fmt, gradeAsk } from '../core/grader';
import { indexingFraction } from '../core/indexing';
import { type Ask, type KinExercise, exerciseForAsk } from '../core/model';
import { pr, toString as rs } from '../core/rational';
import { solutionData } from '../core/solution';
import { mmPerMinToMPerS } from '../core/units';
import { useT } from '../i18n';
import { letter } from './AnswerForm';
import { STATE_ASKS } from './solutionAsks';
import { askLabel, elementName, outputName, shaftName, stateText } from './describe';

const n2 = (r: Parameters<typeof pr>[0]) => fmt(pr(r), 2);


/** Formula line for the asks that are not a path through the chain. */
function formulaLine(ex: KinExercise, ask: Ask, t: (k: string, v?: Record<string, string | number>) => string): string | null {
  if (ask.type === 'centerDistance') {
    const id = ask.cluster ? ex.chain.clusters.find((c) => c.id === ask.cluster)?.options[0] : ask.element;
    const e = ex.chain.elements.find((x) => x.id === id);
    if (!e || e.kind !== 'gear' || !e.module) return null;
    const a = centerDistance(e.module, e.z1, e.z2, !!e.internal);
    return t(e.internal ? 'sol.centreInt' : 'sol.centre', { m: rs(e.module).replace('.', ','), z1: e.z1, z2: e.z2, a: fmt(pr(a), 2) });
  }
  if (ask.type === 'indexing') {
    const K = ex.data?.K ?? 40;
    const f = indexingFraction(K, ask.N);
    return t('sol.indexing', { K, N: ask.N, turns: f.turns, frac: rs(f.fraction), den: f.fraction.d.toString() });
  }
  if (ask.type === 'changeGears') {
    const i = requiredRatio(ask.threadPitch, ask.leadScrewPitch);
    return t('sol.changeGears', { p: fmt(pr(ask.threadPitch), 3), lead: fmt(pr(ask.leadScrewPitch), 3), i: rs(i) });
  }
  return null;
}

function AskSolution({ ex, ask, index }: { ex: KinExercise; ask: Ask; index: number }) {
  const { t, lang } = useT();
  const exA = exerciseForAsk(ex, ask);
  const expected: AskResult = gradeAsk(ex, ask, {});
  const multi = ask.type === 'indexing' || ask.type === 'changeGears' || ask.type === 'missingTeeth';
  const data = multi ? null : solutionData({ ...exA, asks: [ask] });
  const showState = ex.chain.clusters.length > 0 && STATE_ASKS.has(ask.type) && !(ask.type === 'feedPerRev' && ask.max);
  const formula = formulaLine(ex, ask, t);
  return (
    <section className="sol-ask">
      <h3>
        {letter(index)} {askLabel(ex, ask, lang)}
      </h3>
      {showState && data && (
        <p className="pos">
          {t('sol.state')}: {stateText(ex, data.state)}
        </p>
      )}
      {data?.paths.map((p) => (
        <div key={p.target} className="block">
          <h4>{t('sol.stages', { target: shaftName(ex, p.target) })}</h4>
          <table>
            <thead>
              <tr>
                <th>{t('sol.stage')}</th>
                <th>{t('sol.ratio')}</th>
                <th>{t('sol.n')}</th>
              </tr>
            </thead>
            <tbody>
              {p.stages.map((s) => (
                <tr key={s.element}>
                  <td>
                    {shaftName(ex, s.from)} → {shaftName(ex, s.to)} <small>({elementName(ex, s.element)})</small>
                  </td>
                  <td>
                    {s.num}/{s.den}
                    {s.factor ? ` · (${s.factor})` : ''}
                  </td>
                  <td>
                    {n2(s.nFrom)} → <b>{n2(s.nTo)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="formula">{t('sol.total', { frac: rs(p.total), dec: fmt(pr(p.total), 4) })}</p>
        </div>
      ))}
      {data?.linear.map((l) => (
        <p key={l.output} className="formula">
          {l.kind === 'rack'
            ? t('sol.rack', { output: outputName(ex, lang, l.output), m: rs(l.module!), z: l.z!, n: n2(l.n), v: fmt(l.v, 2), vs: fmt(mmPerMinToMPerS(l.v), 4) })
            : t('sol.screw', { output: outputName(ex, lang, l.output), n: n2(l.n), k: l.starts!, p: rs(l.pitch!), v: fmt(l.v, 2) })}
        </p>
      ))}
      {data?.speedTable && (
        <div className="block">
          <h4>{t('sol.table', { shaft: shaftName(ex, data.speedTable.shaft) })}</h4>
          <table>
            <thead>
              <tr>
                <th>{t('sol.state')}</th>
                <th>{t('sol.n')}</th>
              </tr>
            </thead>
            <tbody>
              {data.speedTable.rows.map((r, k) => {
                const ext = k === 0 || k === data.speedTable!.rows.length - 1;
                return (
                  <tr key={k} className={ext ? 'best' : ''}>
                    <td>{stateText(ex, r.state)}</td>
                    <td>{ext ? <b>{n2(r.n)}</b> : n2(r.n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {formula && <p className="formula">{formula}</p>}
      <div className="answer">
        <b>{t('sol.answers')}:</b>{' '}
        {multi
          ? null
          : expected.fields.map((f) => (
              <span key={f.field} className="ans">
                {expected.fields.length > 1 ? `${t(`field.${f.field}`)} = ` : ''}
                {ask.type === 'direction' ? t(`dir.${f.expected}`) : f.expected}
              </span>
            ))}
        {multi && expected.solutions && (
          <span className="ans">
            {t('sol.solutions')}: {expected.solutions.slice(0, 12).map((s) => (ask.type === 'indexing' ? `${s.turns} + ${s.holes}/${s.circle}` : Object.values(s).join('/'))).join(' · ')}
            {expected.solutions.length > 12 ? ' …' : ''}
          </span>
        )}
      </div>
    </section>
  );
}

export function SolutionSteps({ ex }: { ex: KinExercise }) {
  const { t } = useT();
  return (
    <div className="solution">
      <h2 className="sec">{t('sol.title')}</h2>
      <p className="note">{t('sol.path')}</p>
      {ex.asks.map((a, i) => (
        <AskSolution key={i} ex={ex} ask={a} index={i} />
      ))}
    </div>
  );
}
