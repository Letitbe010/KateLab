/** Phase 9 screens (spec §13.1): learning path, first-visit intro, progress, settings, about. */
import { useRef, useState } from 'react';
import { TOPICS } from '../content/theory/topics';
import { ARCHETYPES } from '../core/generator/archetypes';
import { POOL } from '../data/pool';
import worked from '../data/worked.json';
import { type Lang, useT } from '../i18n';
import { hrefOf } from './router';
import { exportJSON, importJSON, ratesBy, resetProgress, setIntroSeen, setSettings, topMistakes, useProgress } from './progress';

const ASK_NAME: Record<Lang, Record<string, string>> = {
  eu: {
    speed: 'Abiadura', speedMaxMin: 'Abiadura max/min', speedCount: 'Abiadura kopurua', ratio: 'Erlazioa', direction: 'Noranzkoa', linearSpeed: 'Abiadura lineala',
    feedPerRev: 'Aitzinapena (mm/bira)', feedPerMin: 'Aitzinapena (mm/min)', centerDistance: 'Ardatzen arteko distantzia', gearGeometry: 'Geometria', pitchDiameter: 'Diametro primitiboa',
    missingTeeth: 'Falta den Z', indexing: 'Zatiketa', changeGears: 'Aldaketa-gurpilak', torquePower: 'Momentua eta potentzia',
  },
  es: {
    speed: 'Velocidad', speedMaxMin: 'Velocidad máx/mín', speedCount: 'Número de velocidades', ratio: 'Relación', direction: 'Sentido', linearSpeed: 'Velocidad lineal',
    feedPerRev: 'Avance (mm/rev)', feedPerMin: 'Avance (mm/min)', centerDistance: 'Distancia entre ejes', gearGeometry: 'Geometría', pitchDiameter: 'Diámetro primitivo',
    missingTeeth: 'Z que falta', indexing: 'División', changeGears: 'Ruedas de recambio', torquePower: 'Par y potencia',
  },
};
/** Theory topic for each kind of mistake (link from the progress page). */
const DIAG_TOPIC: Record<string, string> = {
  'inverse-stage': 'erlazioa', 'inverse-all': 'erlazioa', 'idler-in-ratio': 'trenak', 'idler-direction': 'trenak', 'wrong-position': 'kaxak', 'screw-starts': 'translazioa',
  'feed-units': 'aitzinapena', 'rack-radius': 'translazioa', 'rack-no-60': 'translazioa', 'mm-m': 'translazioa', 'centre-no-half': 'geometria', 'centre-difference': 'geometria',
  'rpm-rads': 'potentzia', 'indexing-inverted': 'zatiketa', 'indexing-not-reduced': 'zatiketa', 'circle-not-on-plates': 'zatiketa', 'local-max': 'kaxak', 'kw-w': 'potentzia',
  'efficiency-ignored': 'potentzia', 'counted-duplicates': 'kaxak', 'ratio-mismatch': 'aldaketa', 'gear-not-in-set': 'aldaketa', 'gear-reused': 'aldaketa',
  'mounting-condition': 'aldaketa', 'cluster-sum': 'geometria', 'pitch-as-module': 'translazioa',
};

const pct = (ok: number, n: number) => (n ? Math.round((100 * ok) / n) : 0);

function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <i style={{ width: `${max ? (100 * value) / max : 0}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
export function StartPage() {
  const { t, lang } = useT();
  const p = useProgress();
  const levels = [1, 2, 3] as const;
  const ope = POOL.filter((e) => e.origin === 'ope');
  return (
    <section className="card">
      <h1>{t('start.title')}</h1>
      <p className="lead">{t('start.lead')}</p>
      {p.lastRoute && p.lastRoute !== '#/' && (
        <p>
          <a className="button primary" href={p.lastRoute}>
            {t('start.continue')} →
          </a>
        </p>
      )}
      <ol className="path">
        <li className="step-card">
          <span className="num">1</span>
          <div>
            <b>{t('start.step1')}</b>
            <small>{t('start.step1.sub', { n: p.theorySeen.filter((x) => TOPICS.some((tp) => tp.id === x)).length, total: TOPICS.length })}</small>
            <Bar value={p.theorySeen.length} max={TOPICS.length} label={t('start.step1')} />
          </div>
          <a className="button" href={hrefOf({ name: 'theory' })}>
            {t('start.go')}
          </a>
        </li>
        <li className="step-card">
          <span className="num">2</span>
          <div>
            <b>{t('start.step2')}</b>
            <small>{t('start.step2.sub', { n: p.workedDone.length, total: worked.worked.length })}</small>
            <Bar value={p.workedDone.length} max={worked.worked.length} label={t('start.step2')} />
          </div>
          <a className="button" href={hrefOf({ name: 'worked' })}>
            {t('start.go')}
          </a>
        </li>
        <li className="step-card">
          <span className="num">3</span>
          <div>
            <b>{t('start.step3')}</b>
            {levels.map((lv) => {
              const a = p.attempts.filter((x) => x.level === lv && x.status !== 'missing');
              const ok = a.filter((x) => x.status === 'correct').length;
              return (
                <div key={lv}>
                  <small>{t('start.step3.sub', { n: lv, ok, total: a.length })}</small>
                  <Bar value={ok} max={a.length} label={`${t('start.step3')} ${lv}`} />
                </div>
              );
            })}
          </div>
          <a className="button" href={hrefOf({ name: 'home' })}>
            {t('start.go')}
          </a>
        </li>
        <li className="step-card">
          <span className="num">4</span>
          <div>
            <b>{t('start.step4')}</b>
            <small>{t('start.step4.sub')}</small>
            <ul className="plain">
              {ope.map((e) => (
                <li key={e.id}>
                  <a href={hrefOf({ name: 'pool', id: e.id })}>{e.title?.[lang] ?? e.id}</a>
                </li>
              ))}
            </ul>
          </div>
        </li>
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
export function Intro() {
  const { t } = useT();
  const [k, setK] = useState(1);
  return (
    <div className="intro-backdrop" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro card">
        <p className="tags">
          <span className="tag">{k} / 3</span>
        </p>
        <h2 id="intro-title">{t(`intro.${k}.title`)}</h2>
        <p>{t(`intro.${k}.text`)}</p>
        <div className="actions">
          <button onClick={setIntroSeen}>{t('intro.skip')}</button>
          {k < 3 ? (
            <button className="primary" onClick={() => setK(k + 1)}>
              {t('intro.next')}
            </button>
          ) : (
            <button className="primary" onClick={setIntroSeen}>
              {t('intro.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function ProgressPage() {
  const { t, lang } = useT();
  const p = useProgress();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const answered = p.attempts.filter((a) => a.status !== 'missing');
  const ok = answered.filter((a) => a.status === 'correct').length;
  const byAsk = ratesBy(p.attempts, (a) => a.ask);
  const byArch = ratesBy(p.attempts, (a) => a.archetype);
  const mistakes = topMistakes(p.attempts);
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'katelab-aurrerapena.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card">
      <h1>{t('prog.title')}</h1>
      {answered.length === 0 ? (
        <p className="note">{t('prog.empty')}</p>
      ) : (
        <>
          <p className="lead">{t('prog.total', { n: answered.length, ok, pct: pct(ok, answered.length) })}</p>
          <h2 className="sec">{t('prog.byAsk')}</h2>
          <table className="stats">
            <tbody>
              {byAsk.map((r) => (
                <tr key={r.key}>
                  <td>{ASK_NAME[lang][r.key] ?? r.key}</td>
                  <td>
                    {r.correct} / {r.total}
                  </td>
                  <td className="w-bar">
                    <Bar value={r.correct} max={r.total} label={ASK_NAME[lang][r.key] ?? r.key} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {byArch.length > 0 && (
            <>
              <h2 className="sec">{t('prog.byArch')}</h2>
              <table className="stats">
                <tbody>
                  {byArch.map((r) => (
                    <tr key={r.key}>
                      <td>{ARCHETYPES.find((a) => a.id === r.key)?.title[lang] ?? r.key}</td>
                      <td>
                        {r.correct} / {r.total}
                      </td>
                      <td className="w-bar">
                        <Bar value={r.correct} max={r.total} label={r.key} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {mistakes.length > 0 && (
            <>
              <h2 className="sec">{t('prog.mistakes')}</h2>
              <ul className="mistakes">
                {mistakes.map((m) => (
                  <li key={m.code}>
                    <span>{t(`diag.${m.code}`, { what: '…' })}</span> <span className="tag">{t('prog.times', { n: m.count })}</span>{' '}
                    {DIAG_TOPIC[m.code] && <a href={hrefOf({ name: 'theoryTopic', id: DIAG_TOPIC[m.code] as string })}>{t('th.see', { title: TOPICS.find((x) => x.id === DIAG_TOPIC[m.code])?.title[lang] ?? '' })}</a>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2 className="sec">{t('prog.history')}</h2>
          <ul className="history">
            {[...p.attempts]
              .reverse()
              .slice(0, 15)
              .map((a, i) => (
                <li key={i}>
                  <span className={`chip ${a.status}`}>{a.status === 'correct' ? '✓' : a.status === 'wrong' ? '✗' : '!'}</span> {ASK_NAME[lang][a.ask] ?? a.ask} · {new Date(a.ts).toLocaleString(lang === 'eu' ? 'eu-ES' : 'es-ES')}
                </li>
              ))}
          </ul>
        </>
      )}
      <div className="actions">
        <button onClick={download}>{t('prog.export')}</button>
        <button onClick={() => file.current?.click()}>{t('prog.import')}</button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setMsg(importJSON(await f.text()) ? t('prog.importOk') : t('prog.importBad'));
            e.target.value = '';
          }}
        />
        <button
          onClick={() => {
            if (window.confirm(t('prog.resetConfirm'))) resetProgress();
          }}
        >
          {t('prog.reset')}
        </button>
      </div>
      {msg && (
        <p className="note" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
export function SettingsPage({ setLang }: { setLang: (l: Lang) => void }) {
  const { t, lang } = useT();
  const s = useProgress().settings;
  return (
    <section className="card settings">
      <h1>{t('set.title')}</h1>
      <h2 className="sec">{t('set.lang')}</h2>
      <div className="choice" role="radiogroup" aria-label={t('set.lang')}>
        {(['eu', 'es'] as const).map((l) => (
          <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? 'sel' : ''} onClick={() => setLang(l)}>
            {l === 'eu' ? 'Euskara' : 'Español'}
          </button>
        ))}
      </div>
      <h2 className="sec">{t('set.theme')}</h2>
      <div className="choice" role="radiogroup" aria-label={t('set.theme')}>
        {(['auto', 'light', 'dark'] as const).map((v) => (
          <button key={v} role="radio" aria-checked={s.theme === v} className={s.theme === v ? 'sel' : ''} onClick={() => setSettings({ theme: v })}>
            {t(`set.theme.${v}`)}
          </button>
        ))}
      </div>
      <h2 className="sec">{t('sol.ratio')}</h2>
      <label className="check">
        <input type="checkbox" checked={s.showInverseRatio} onChange={(e) => setSettings({ showInverseRatio: e.target.checked })} />
        {t('set.ratio')}
      </label>
      <h2 className="sec">{t('set.units')}</h2>
      <div className="row">
        <label className="fld">
          <span>{t('set.speedUnit')}</span>
          <select value={s.speedUnit} onChange={(e) => setSettings({ speedUnit: e.target.value as 'rpm' | 'rad/s' })}>
            <option value="rpm">rpm</option>
            <option value="rad/s">rad/s</option>
          </select>
        </label>
        <label className="fld">
          <span>{t('set.linearUnit')}</span>
          <select value={s.linearUnit} onChange={(e) => setSettings({ linearUnit: e.target.value as 'mm/min' | 'm/s' })}>
            <option value="mm/min">mm/min</option>
            <option value="m/s">m/s</option>
          </select>
        </label>
      </div>
      <p className="note">{t('set.tolerance')}</p>
      <p>
        <a href={hrefOf({ name: 'about' })}>{t('nav.about')} →</a>
      </p>
      {import.meta.env.DEV && (
        <p>
          <a href={hrefOf({ name: 'review' })}>{t('rev.title')} →</a>
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
export function AboutPage() {
  const { t } = useT();
  return (
    <section className="card">
      <h1>{t('about.title')}</h1>
      <p className="lead">{t('about.lead')}</p>
      <table className="stats">
        <tbody>
          <tr>
            <td>{t('about.version')}</td>
            <td>{__APP_VERSION__}</td>
          </tr>
          <tr>
            <td>{t('about.commit')}</td>
            <td>
              <code>{__COMMIT__}</code>
            </td>
          </tr>
          <tr>
            <td>{t('about.built')}</td>
            <td>{__BUILD_DATE__}</td>
          </tr>
          <tr>
            <td>{t('about.url')}</td>
            <td>
              <a href="https://letitbe010.github.io/KateLab/">https://letitbe010.github.io/KateLab/</a>
            </td>
          </tr>
        </tbody>
      </table>
      <p>{t('about.license')}</p>
      <p className="note">{t('about.sources')}</p>
      <p>
        <a href="https://github.com/Letitbe010/KateLab">github.com/Letitbe010/KateLab</a>
      </p>
    </section>
  );
}
