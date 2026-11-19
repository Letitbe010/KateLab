/**
 * Review screen (spec §9.3), development only: approve exercises, worked exercises
 * and theory topics, or leave a correction note. Saved by the dev-server endpoint
 * /__review (tools/review-plugin.ts) into the data files.
 */
import { useState } from 'react';
import { TOPICS } from '../content/theory/topics';
import { ARCHETYPES } from '../core/generator/archetypes';
import { POOL } from '../data/pool';
import notes from '../data/review-notes.json';
import worked from '../data/worked.json';
import { useT } from '../i18n';
import { exerciseTitle } from './describe';
import { type Route, hrefOf } from './router';

type Kind = 'pool' | 'worked' | 'theory';
interface Item {
  kind: Kind;
  id: string;
  title: string;
  reviewed: boolean;
  route: Route;
}

async function send(body: { kind: Kind; id: string; status?: string; note?: string }): Promise<string | null> {
  try {
    const r = await fetch('/__review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return null;
    return ((await r.json()) as { error?: string }).error ?? String(r.status);
  } catch (e) {
    return (e as Error).message;
  }
}

function Row({ it }: { it: Item }) {
  const { t } = useT();
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const save = async (status?: string) => {
    const err = await send({ kind: it.kind, id: it.id, ...(status ? { status } : {}), ...(note.trim() ? { note } : {}) });
    setMsg(err ? t('rev.error', { e: err }) : t('rev.saved'));
    if (!err) setNote('');
  };
  const mine = (notes.notes as { ref: string; text: string; date: string }[]).filter((n) => n.ref === `${it.kind}:${it.id}`);
  return (
    <li className="rev-row">
      <div className="rev-head">
        <span className={`chip ${it.reviewed ? 'correct' : 'missing'}`}>
          <span aria-hidden="true">{it.reviewed ? '✓' : '!'}</span> {it.reviewed ? t('rev.reviewed') : t('rev.pending')}
        </span>
        <b>{it.title}</b>
        <a href={hrefOf(it.route)} target="_blank" rel="noreferrer">
          {t('rev.open')} ↗
        </a>
      </div>
      <label className="fld rev-note">
        <span>{t('rev.note')}</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="actions">
        <button className="primary" onClick={() => save('reviewed')}>
          {t('rev.approve')}
        </button>
        <button onClick={() => save(it.kind === 'pool' ? 'review-needed' : 'draft')}>{t('rev.reopen')}</button>
        <button onClick={() => save()} disabled={!note.trim()}>
          {t('rev.saveNote')}
        </button>
        {msg && <span role="status">{msg}</span>}
      </div>
      {mine.length > 0 && (
        <ul className="rev-notes">
          {mine.map((n, i) => (
            <li key={i}>
              <small>{n.date}</small> {n.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function ReviewPage() {
  const { t, lang } = useT();
  const [tab, setTab] = useState<Kind>('pool');
  const items: Record<Kind, Item[]> = {
    pool: POOL.map((e) => ({ kind: 'pool' as const, id: e.id, title: exerciseTitle(e, lang, ARCHETYPES.find((a) => a.id === e.archetype)?.title), reviewed: e.review === 'reviewed', route: { name: 'pool' as const, id: e.id } })),
    worked: worked.worked.map((w) => ({ kind: 'worked' as const, id: w.id, title: w.title[lang], reviewed: w.review === 'reviewed', route: { name: 'workedItem' as const, id: w.id } })),
    theory: TOPICS.map((tp) => ({ kind: 'theory' as const, id: tp.id, title: tp.title[lang], reviewed: tp.status === 'reviewed', route: { name: 'theoryTopic' as const, id: tp.id } })),
  };
  return (
    <section className="card">
      <h1>{t('rev.title')}</h1>
      <p className="lead">{t('rev.lead')}</p>
      <div className="choice" role="tablist">
        {(['pool', 'worked', 'theory'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>
            {t(`rev.tab.${k}`)} ({items[k].filter((x) => x.reviewed).length}/{items[k].length})
          </button>
        ))}
      </div>
      <ul className="rev-list">
        {items[tab].map((it) => (
          <Row key={`${it.kind}:${it.id}`} it={it} />
        ))}
      </ul>
    </section>
  );
}
