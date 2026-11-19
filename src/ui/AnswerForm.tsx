/**
 * Answer form (spec §13.1): one card per ask, numeric keyboard, unit selector,
 * and, after grading, the result of each field with icon + colour (never colour alone).
 */
import { type AskAnswer, type AskResult, type Diagnosis, FIELDS, type Unit, unitsFor } from '../core/grader';
import type { Ask, KinExercise, State } from '../core/model';
import { useT } from '../i18n';
import { askLabel, elementName, stateText } from './describe';
import { STATE_ASKS } from './solutionAsks';

const UNIT_LABEL: Partial<Record<Ask['type'], string>> = {
  feedPerRev: 'mm/rev',
  speedCount: '',
  ratio: '',
  missingTeeth: 'Z',
};

export const letter = (i: number) => `${String.fromCharCode(97 + i)})`;

function StatusChip({ status }: { status: AskResult['status'] }) {
  const { t } = useT();
  const icon = status === 'correct' ? '✓' : status === 'wrong' ? '✗' : '!';
  return (
    <span className={`chip ${status}`}>
      <span aria-hidden="true">{icon}</span> {t(`res.${status}`)}
    </span>
  );
}

export function diagnosisText(ex: KinExercise, d: Diagnosis, t: (k: string, v?: Record<string, string | number>) => string): string {
  let what = '';
  if (d.detail?.element) what = elementName(ex, d.detail.element);
  else if (d.detail?.state) {
    try {
      what = stateText(ex, JSON.parse(d.detail.state) as State);
    } catch {
      what = d.detail.state;
    }
  } else if (d.code === 'indexing-not-reduced' && d.detail) what = `${d.detail.turns} + ${d.detail.holes}/${d.detail.circle}`;
  else if (d.detail?.shaft) what = d.detail.shaft;
  return t(`diag.${d.code}`, { what });
}

interface Props {
  ex: KinExercise;
  answers: AskAnswer[];
  onChange: (i: number, field: string, value: string) => void;
  results?: AskResult[];
  active: number;
  onFocusAsk: (i: number) => void;
  disabled?: boolean;
}

export function AnswerForm({ ex, answers, onChange, results, active, onFocusAsk, disabled }: Props) {
  const { t, lang } = useT();
  return (
    <div className="asks">
      {ex.asks.map((ask, i) => {
        const ans = answers[i] ?? {};
        const res = results?.[i];
        const units = unitsFor(ask);
        const unit = (ans.unit as Unit | undefined) ?? units[0] ?? '';
        const fieldStatus = (f: string) => res?.fields.find((x) => x.field === f)?.status;
        const input = (f: string, label?: string, width = 'w8') => (
          <label className={`fld ${width} ${fieldStatus(f) ?? ''}`}>
            {label !== undefined && <span>{label}</span>}
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={ans[f] ?? ''}
              disabled={disabled}
              aria-label={`${letter(i)} ${label ?? t(`field.${f}`)}`}
              onFocus={() => onFocusAsk(i)}
              onChange={(e) => onChange(i, f, e.target.value)}
            />
          </label>
        );
        const unitSel =
          units.length > 1 ? (
            <select value={unit} disabled={disabled} aria-label="unit" onChange={(e) => onChange(i, 'unit', e.target.value)} onFocus={() => onFocusAsk(i)}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          ) : (
            <span className="unit">{UNIT_LABEL[ask.type] ?? units[0]}</span>
          );
        const st = ask.state ?? ex.state;
        return (
          <article key={i} className={`ask ${i === active ? 'active' : ''} ${res?.status ?? ''}`} onClick={() => onFocusAsk(i)}>
            <header>
              <b>{letter(i)}</b> <span>{askLabel(ex, ask, lang)}</span>
              {res && <StatusChip status={res.status} />}
            </header>
            {st && ex.chain.clusters.length > 0 && STATE_ASKS.has(ask.type) && !(ask.type === 'feedPerRev' && ask.max) && (
              <p className="pos">
                {t('ex.position')}: {stateText(ex, st)}
              </p>
            )}
            <div className="row">
              {ask.type === 'direction' ? (
                <div className="choice" role="radiogroup" aria-label={askLabel(ex, ask, lang)}>
                  {(ex.chain.input.direction ? ['cw', 'ccw'] : ['same', 'opposite']).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={ans.value === v}
                      className={ans.value === v ? 'small sel' : 'small'}
                      disabled={disabled}
                      onClick={() => {
                        onFocusAsk(i);
                        onChange(i, 'value', v);
                      }}
                    >
                      {t(`dir.${v}`)}
                    </button>
                  ))}
                </div>
              ) : ask.type === 'indexing' ? (
                <>
                  {input('turns', t('field.turns'), 'w5')}
                  <span className="op">+</span>
                  {input('holes', t('field.holes'), 'w5')}
                  <span className="op">/</span>
                  {input('circle', t('field.circle'), 'w5')}
                </>
              ) : ask.type === 'changeGears' ? (
                <>
                  {['za', 'zb', 'zc', 'zd'].map((f) => (
                    <span key={f}>{input(f, t(`field.${f}`), 'w5')}</span>
                  ))}
                  <small className="hint">{t('gears.hint')}</small>
                </>
              ) : (
                <>
                  {FIELDS[ask.type].map((f) => (
                    <span key={f}>{input(f, FIELDS[ask.type].length > 1 ? t(`field.${f}`) : undefined)}</span>
                  ))}
                  {ask.type !== 'torquePower' && unitSel}
                </>
              )}
            </div>
            {res && res.status !== 'correct' && (
              <div className="feedback">
                {ask.type === 'indexing' || ask.type === 'changeGears' || ask.type === 'missingTeeth' ? (
                  res.fields[0]?.expected && <p>{t('res.expected', { v: res.fields[0].expected })}</p>
                ) : (
                  res.fields
                    .filter((f) => f.status !== 'correct' && f.expected)
                    .map((f) => (
                      <p key={f.field}>
                        {FIELDS[ask.type].length > 1 ? `${t(`field.${f.field}`)}: ` : ''}
                        {t('res.expected', {
                          v: ask.type === 'direction' ? t(`dir.${f.expected}`) : `${f.expected}${FIELDS[ask.type].length === 1 && unit ? ` ${unit}` : ''}`,
                        })}
                      </p>
                    ))
                )}
                {res.diagnoses.length > 0 && (
                  <div className="diag">
                    <b>{t('diag.title')}</b>
                    <ul>
                      {res.diagnoses.map((d, k) => (
                        <li key={k}>{diagnosisText(ex, d, t)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {res && res.status === 'correct' && res.solutions && res.solutions.length > 1 && (
              <p className="feedback ok">{t('res.otherSolutions', { list: res.solutions.slice(0, 6).map((s) => Object.values(s).join('/')).join(' · ') })}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
