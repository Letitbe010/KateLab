/**
 * Worked exercises (spec §15.2): "next step" mode or "show all"; each step with
 * what / why / careful; the power path lights up step by step on the schema and
 * the speed of each shaft appears as it is computed. At the end: "now you".
 */
import { useEffect, useMemo, useState } from 'react';
import { markWorked } from './progress';
import worked from '../data/worked.json';
import { poolById } from '../data/pool';
import { useT } from '../i18n';
import { KinematicSchema } from './KinematicSchema';
import { hrefOf } from './router';
import { buildWorked } from './worked';
import { TOPICS } from '../content/theory/topics';

export interface WorkedEntry {
  id: string;
  pool: string;
  title: { eu: string; es: string };
  review?: string;
}
export const WORKED: WorkedEntry[] = worked.worked as WorkedEntry[];

export function WorkedList() {
  const { t, lang } = useT();
  return (
    <section className="card">
      <h1>{t('nav.workedTitle')}</h1>
      <p className="lead">{t('wk.lead')}</p>
      <div className="tiles">
        {WORKED.map((w, i) => (
          <a key={w.id} className="tile" href={hrefOf({ name: 'workedItem', id: w.id })}>
            <span className="tags">
              <span className="tag">{i + 1}</span>
              {w.review !== 'reviewed' && <span className="tag warn">{t('home.draft')}</span>}
            </span>
            <b>{w.title[lang]}</b>
          </a>
        ))}
      </div>
    </section>
  );
}

export function WorkedItem({ id }: { id: string }) {
  const { t, lang } = useT();
  const entry = WORKED.find((w) => w.id === id);
  const ex = entry ? poolById(entry.pool) : undefined;
  const steps = useMemo(() => (ex ? buildWorked(ex, lang) : []), [ex, lang]);
  const [shown, setShown] = useState(1);
  const finished = steps.length > 0 && shown >= steps.length;
  useEffect(() => {
    if (finished && entry) markWorked(entry.id);
  }, [finished, entry]);
  if (!entry || !ex)
    return (
      <section className="card">
        <a href={hrefOf({ name: 'worked' })}>← {t('nav.worked')}</a>
        <p className="note warn">{t('ex.notFound')}</p>
      </section>
    );
  const cur = steps[Math.min(shown, steps.length) - 1];
  const done = shown >= steps.length;
  return (
    <section className="card exercise worked">
      <div className="ex-top">
        <a href={hrefOf({ name: 'worked' })}>← {t('nav.worked')}</a>
        <span className="tags">
          <span className="tag">{t('home.level', { n: ex.difficulty })}</span>
          {entry.review !== 'reviewed' && <span className="tag warn">{t('home.draft')}</span>}
        </span>
      </div>
      <h1>{entry.title[lang]}</h1>
      <p className="statement">{ex.text[lang]}</p>
      {ex.asks.some((a) => a.label) && (
        <ul className="ask-list">
          {ex.asks.map((a, i) => (
            <li key={i}>{a.label?.[lang]}</li>
          ))}
        </ul>
      )}
      {cur && <KinematicSchema chain={ex.chain} state={cur.state} lang={lang} locked lit={cur.lit} speeds={cur.known} />}

      <div className="steps">
        {steps.slice(0, shown).map((s, k) => (
          <article key={s.key} className={`wstep ${k === shown - 1 ? 'current' : ''}`}>
            <header>
              <span className="tag">{t('wk.stepOf', { k: k + 1, n: steps.length })}</span> <b>{s.title}</b>
            </header>
            <div className="layer what">
              <span className="lab">{t('wk.what')}</span>
              {s.what.map((w, j) => (
                <p key={j} className="formula">
                  {w}
                </p>
              ))}
              {s.table && (
                <div className="block">
                  <table>
                    <thead>
                      <tr>
                        <th>{s.table.head[0]}</th>
                        <th>{s.table.head[1]}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((r, j) => (
                        <tr key={j} className={r.best ? 'best' : ''}>
                          <td>{r.label}</td>
                          <td>{r.best ? <b>{r.value}</b> : r.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {s.why && (
              <div className="layer why">
                <span className="lab">{t('wk.why')}</span>
                <p>{s.why}</p>
                {s.topic && TOPICS.find((x) => x.id === s.topic) && (
                  <a href={hrefOf({ name: 'theoryTopic', id: s.topic })}>{t('th.see', { title: TOPICS.find((x) => x.id === s.topic)!.title[lang] })}</a>
                )}
              </div>
            )}
            {s.careful && (
              <div className="layer careful">
                <span className="lab">
                  <span aria-hidden="true">! </span>
                  {t('wk.careful')}
                </span>
                <p>{s.careful}</p>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="actions">
        {!done && (
          <>
            <button className="primary" onClick={() => setShown((x) => x + 1)}>
              {t('wk.next')}
            </button>
            <button onClick={() => setShown(steps.length)}>{t('wk.all')}</button>
          </>
        )}
        {shown > 1 && <button onClick={() => setShown(1)}>{t('wk.restart')}</button>}
        {done && ex.archetype && (
          <a className="button primary" href={hrefOf({ name: 'generated', archetype: ex.archetype, seed: Math.floor(Math.random() * 1_000_000) })}>
            {t('wk.youNow')} →
          </a>
        )}
      </div>
    </section>
  );
}
