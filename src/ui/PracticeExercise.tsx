/**
 * Practice exercise screen (spec §13.1): ① statement → ② solve → ③ grading → ④ solution.
 * The schema stays on top; it shows the cluster position of the ask being answered,
 * locked; in the solution step it shows the speed of every shaft and the power path.
 */
import { useMemo, useState } from 'react';
import { GeneratorError, generate } from '../core/generator';
import { archetypeById } from '../core/generator/archetypes';
import { type AskAnswer, type AskResult, ExerciseError, gradeAsk } from '../core/grader';
import { type KinExercise, type State, exerciseForAsk } from '../core/model';
import { toFixed } from '../core/rational';
import { solveStateA } from '../core/solverPath';
import { poolById } from '../data/pool';
import { useT } from '../i18n';
import { AnswerForm } from './AnswerForm';
import { exerciseTitle } from './describe';
import { KinematicSchema } from './KinematicSchema';
import { DividingHead } from './figures/DividingHead';
import { indexingSolutions } from '../core/indexing';
import { hrefOf } from './router';
import { SolutionSteps } from './SolutionSteps';
import { defaultUnit } from './units';
import { recordAttempts, useProgress } from './progress';

export type ExerciseSource = { kind: 'generated'; archetype: string; seed: number } | { kind: 'pool'; id: string };

type Loaded = { ok: true; ex: KinExercise } | { ok: false; reason: 'notFound' | 'error' };

function load(src: ExerciseSource): Loaded {
  try {
    if (src.kind === 'pool') {
      const ex = poolById(src.id);
      return ex ? { ok: true, ex } : { ok: false, reason: 'notFound' };
    }
    if (!archetypeById(src.archetype)) return { ok: false, reason: 'notFound' };
    return { ok: true, ex: generate(src.archetype, src.seed) };
  } catch (e) {
    if (e instanceof GeneratorError || e instanceof ExerciseError) return { ok: false, reason: 'error' };
    throw e;
  }
}

const trimNum = (s: string) => s.replace(/\.?0+$/, '').replace('.', ',');

const STEPS = ['steps.statement', 'steps.solve', 'steps.grade', 'steps.solution'] as const;

export function PracticeExercise({ source }: { source: ExerciseSource }) {
  const { t, lang } = useT();
  const loaded = useMemo(() => load(source), [source]);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AskAnswer[]>([]);
  const [results, setResults] = useState<AskResult[] | undefined>();
  const [active, setActive] = useState(0);
  const settings = useProgress().settings;

  if (!loaded.ok)
    return (
      <section className="card">
        <a href={hrefOf({ name: 'home' })}>{t('ex.back')}</a>
        <p className="note warn">{t(loaded.reason === 'notFound' ? 'ex.notFound' : 'ex.error')}</p>
      </section>
    );
  const ex = loaded.ex;
  const arch = ex.archetype ? archetypeById(ex.archetype) : undefined;
  const ask = ex.asks[active] ?? ex.asks[0];
  const shownState: State = (ask && exerciseForAsk(ex, ask).state) ?? ex.state ?? Object.fromEntries(ex.chain.clusters.map((c) => [c.id, c.options[0] as string]));

  // speeds on the schema only in the solution step
  let speeds: Record<string, string> | undefined;
  if (step === 3) {
    const s = solveStateA(ex.chain, shownState);
    if (s.ok) speeds = Object.fromEntries(Object.entries(s.shafts).map(([k, v]) => [k, `${trimNum(toFixed(v.n, 2))} rpm`]));
  }

  const setField = (i: number, f: string, v: string) =>
    setAnswers((prev) => {
      const next = [...prev];
      next[i] = { ...(next[i] ?? {}), [f]: v };
      return next;
    });
  const check = () => {
    const filled = ex.asks.map((a, i) => ({ ...(answers[i] ?? {}), unit: answers[i]?.unit ?? defaultUnit(a, settings) }));
    const rs = ex.asks.map((a, i) => gradeAsk(ex, a, filled[i] ?? {}));
    setResults(rs);
    setStep(2);
    recordAttempts(
      rs.map((r, i) => ({
        ts: Date.now(),
        exercise: ex.id,
        ...(ex.archetype ? { archetype: ex.archetype } : {}),
        origin: ex.origin,
        level: ex.difficulty,
        ask: ex.asks[i]!.type,
        status: r.status,
        diagnoses: r.diagnoses.map((d) => d.code),
      })),
    );
  };
  const ok = results?.filter((r) => r.status === 'correct').length ?? 0;
  const another = () => {
    if (source.kind === 'generated') window.location.hash = hrefOf({ name: 'generated', archetype: source.archetype, seed: Math.floor(Math.random() * 1_000_000) });
    else if (ex.archetype) window.location.hash = hrefOf({ name: 'generated', archetype: ex.archetype, seed: Math.floor(Math.random() * 1_000_000) });
  };

  const indexAsk = ex.asks.find((a): a is Extract<typeof a, { type: 'indexing' }> => a.type === 'indexing');

  return (
    <section className="card exercise">
      <div className="ex-top">
        <a href={hrefOf({ name: 'home' })}>{t('ex.back')}</a>
        <span className="tags">
          <span className={`tag origin-${ex.origin}`}>{t(`origin.${ex.origin}`)}</span>
          <span className="tag">{t('home.level', { n: ex.difficulty })}</span>
          {ex.seed !== undefined && source.kind === 'generated' && <span className="tag">{t('ex.seed', { s: ex.seed })}</span>}
          {ex.review && ex.review !== 'reviewed' && <span className="tag warn">{t('home.draft')}</span>}
        </span>
      </div>
      <h1>{exerciseTitle(ex, lang, arch?.title)}</h1>

      <ol className="stepper" aria-label="steps">
        {STEPS.map((k, i) => (
          <li key={k} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="num">{i + 1}</span> <span className="lbl">{t(k)}</span>
          </li>
        ))}
      </ol>

      <p className="statement">{ex.text[lang]}</p>
      {ex.chain.input.direction && ex.chain.viewpoint && <p className="pos">{t('ex.viewpoint', { v: ex.chain.viewpoint[lang] })}</p>}

      {indexAsk ? (
        // a dividing head is shown as such, not as a generic kinematic chain
        <DividingHead K={ex.data?.K ?? 40} N={indexAsk.N} plates={ex.data?.platesHoles ?? []} answer={step === 3 ? (indexingSolutions(ex.data?.K ?? 40, indexAsk.N, ex.data?.platesHoles ?? [])[0] ?? null) : null} />
      ) : (
        <KinematicSchema chain={ex.chain} state={shownState} lang={lang} locked {...(speeds ? { speeds } : {})} highlight={step === 3} />
      )}

      {step === 0 ? (
        <div className="actions">
          <button className="primary" onClick={() => setStep(1)}>
            {t('ex.start')}
          </button>
        </div>
      ) : (
        <>
          <AnswerForm ex={ex} answers={answers.map((a, i) => ({ unit: defaultUnit(ex.asks[i]!, settings), ...(a ?? {}) }))} onChange={setField} results={results} active={active} onFocusAsk={setActive} disabled={step >= 2} />
          <div className="actions">
            {step === 1 && (
              <button className="primary" onClick={check}>
                {t('ex.check')}
              </button>
            )}
            {step >= 2 && (
              <>
                <span className="score" role="status">
                  {t('ex.score', { ok, n: ex.asks.length })}
                </span>
                {step === 2 && (
                  <button className="primary" onClick={() => setStep(3)}>
                    {t('ex.showSolution')}
                  </button>
                )}
                <button
                  onClick={() => {
                    setResults(undefined);
                    setStep(1);
                  }}
                >
                  {t('ex.retry')}
                </button>
                {(source.kind === 'generated' || ex.archetype) && <button onClick={another}>{t('ex.another')}</button>}
              </>
            )}
          </div>
        </>
      )}
      {step === 3 && <SolutionSteps ex={ex} />}
    </section>
  );
}
