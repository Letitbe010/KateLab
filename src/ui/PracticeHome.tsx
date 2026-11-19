import { ARCHETYPES } from '../core/generator/archetypes';
import { POOL } from '../data/pool';
import { useT } from '../i18n';
import { exerciseTitle } from './describe';
import { hrefOf } from './router';

const randomSeed = () => Math.floor(Math.random() * 1_000_000);

export function PracticeHome() {
  const { t, lang } = useT();
  const levels = [1, 2, 3] as const;
  return (
    <section className="card">
      <h1>{t('home.title')}</h1>
      <p className="lead">{t('home.lead')}</p>

      <h2 className="sec">{t('home.pool')}</h2>
      <div className="tiles">
        {POOL.map((ex) => {
          const arch = ARCHETYPES.find((a) => a.id === ex.archetype);
          return (
            <a key={ex.id} className="tile" href={hrefOf({ name: 'pool', id: ex.id })}>
              <span className="tags">
                <span className={`tag origin-${ex.origin}`}>{t(`origin.${ex.origin}`)}</span>
                <span className="tag">{t('home.level', { n: ex.difficulty })}</span>
                {ex.review && ex.review !== 'reviewed' && <span className="tag warn">{t('home.review')}</span>}
              </span>
              <b>{exerciseTitle(ex, lang, arch?.title)}</b>
            </a>
          );
        })}
      </div>

      <h2 className="sec">{t('home.generated')}</h2>
      {levels.map((lv) => (
        <div key={lv} className="level">
          <h3>{t('home.level', { n: lv })}</h3>
          <div className="tiles">
            {ARCHETYPES.filter((a) => a.level === lv).map((a) => (
              <a
                key={a.id}
                className="tile"
                href={hrefOf({ name: 'generated', archetype: a.id, seed: 1 })}
                onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = hrefOf({ name: 'generated', archetype: a.id, seed: randomSeed() });
                }}
              >
                <b>{a.title[lang]}</b>
                <span className="go">{t('home.new')} →</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
