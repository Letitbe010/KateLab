/** Theory section (spec §14): list of topics and one topic with its blocks. */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';
import { TOPICS } from '../../content/theory/topics';
import type { Block } from '../../content/theory/types';
import { chainFromJSON } from '../../core/model';
import { fillTemplate } from '../../core/template';
import { useT } from '../../i18n';
import { KinematicSchema } from '../KinematicSchema';
import { hrefOf } from '../router';
import { TheoryWidget } from './widgets';

function Tex({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: false, output: 'htmlAndMathml' }), [tex]);
  return <div className="tex" dangerouslySetInnerHTML={{ __html: html }} />;
}

function BlockView({ b }: { b: Block }) {
  const { t, lang } = useT();
  switch (b.t) {
    case 'p':
      return <p>{b[lang]}</p>;
    case 'f':
      return <Tex tex={b.tex} />;
    case 'list':
      return (
        <ul>
          {b[lang].map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <div className={`layer ${b.kind === 'careful' ? 'careful' : 'ope'}`}>
          <span className="lab">{b.kind === 'careful' ? `! ${t('wk.careful')}` : t('th.ope')}</span>
          <p>{b[lang]}</p>
        </div>
      );
    case 'example': {
      const chain = chainFromJSON(b.chain);
      return (
        <div className="example">
          <span className="lab">{t('th.example')}</span>
          <p>{fillTemplate(b[lang], chain, b.state ?? {}, lang)}</p>
        </div>
      );
    }
    case 'schema':
      return <KinematicSchema chain={chainFromJSON(b.chain)} state={b.state ?? {}} lang={lang} locked highlight={false} />;
    case 'widget':
      return <TheoryWidget w={b.w} />;
  }
}

export function TheoryList() {
  const { t, lang } = useT();
  return (
    <section className="card">
      <h1>{t('nav.theory')}</h1>
      <p className="lead">{t('th.lead')}</p>
      <ol className="topic-list">
        {TOPICS.map((tp) => (
          <li key={tp.id}>
            <a href={hrefOf({ name: 'theoryTopic', id: tp.id })}>{tp.title[lang]}</a>
            {tp.status !== 'reviewed' && <span className="tag warn">{t('home.draft')}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TheoryTopic({ id }: { id: string }) {
  const { t, lang } = useT();
  const i = TOPICS.findIndex((x) => x.id === id);
  const tp = TOPICS[i];
  if (!tp)
    return (
      <section className="card">
        <a href={hrefOf({ name: 'theory' })}>← {t('nav.theory')}</a>
        <p className="note warn">{t('ex.notFound')}</p>
      </section>
    );
  const prev = TOPICS[i - 1];
  const next = TOPICS[i + 1];
  return (
    <section className="card theory">
      <div className="ex-top">
        <a href={hrefOf({ name: 'theory' })}>← {t('nav.theory')}</a>
        <span className="tags">
          <span className="tag">
            {i + 1} / {TOPICS.length}
          </span>
          {tp.status !== 'reviewed' && <span className="tag warn">{t('home.draft')}</span>}
        </span>
      </div>
      <h1>{tp.title[lang]}</h1>
      {tp.blocks.map((b, k) => (
        <BlockView key={k} b={b} />
      ))}
      <nav className="actions topic-nav">
        {prev && <a className="button" href={hrefOf({ name: 'theoryTopic', id: prev.id })}>← {prev.title[lang]}</a>}
        {next && <a className="button primary" href={hrefOf({ name: 'theoryTopic', id: next.id })}>{next.title[lang]} →</a>}
      </nav>
    </section>
  );
}
