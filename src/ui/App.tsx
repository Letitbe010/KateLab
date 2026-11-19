import { useEffect, useState } from 'react';
import { type Lang, LangContext, translate } from '../i18n';
import { PracticeExercise } from './PracticeExercise';
import { PracticeHome } from './PracticeHome';
import { type Route, hrefOf, useRoute } from './router';
import { SchemaGallery } from './SchemaGallery';

const LANG_KEY = 'katelab.lang';

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === 'es' ? 'es' : 'eu';
  } catch {
    return 'eu';
  }
}

const NAV: { key: string; route: Route; icon: string }[] = [
  { key: 'nav.theory', route: { name: 'soon', section: 'teoria' }, icon: 'T' },
  { key: 'nav.worked', route: { name: 'soon', section: 'ebatziak' }, icon: 'E' },
  { key: 'nav.practice', route: { name: 'home' }, icon: 'P' },
  { key: 'nav.progress', route: { name: 'soon', section: 'aurrerapena' }, icon: 'A' },
];

const sectionOf = (r: Route): string => (r.name === 'soon' ? r.section : r.name === 'schemas' ? 'eskemak' : 'praktika');

export function App() {
  const [lang, setLang] = useState<Lang>(loadLang);
  const route = useRoute();
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* storage unavailable: language only for this visit */
    }
  }, [lang]);
  const current = sectionOf(route);

  return (
    <LangContext.Provider value={lang}>
      <div className="app">
        <nav className="side" aria-label="Nabigazioa">
          <a className="brand" href="#/praktika">
            <small>{t('app.kicker')}</small>
            <b>KateLab</b>
          </a>
          <ul>
            {NAV.map((n) => {
              const on = sectionOf(n.route) === current;
              return (
                <li key={n.key}>
                  <a href={hrefOf(n.route)} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                    <span className="ico" aria-hidden="true">
                      {n.icon}
                    </span>
                    <span>{t(n.key)}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="main">
          <header className="top">
            <a className="brand mobile-only" href="#/praktika">
              <b>KateLab</b>
            </a>
            <div className="lang" role="group" aria-label="Hizkuntza / Idioma">
              {(['eu', 'es'] as const).map((l) => (
                <button key={l} className={l === lang ? 'sel' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </header>
          <main>
            {route.name === 'home' && <PracticeHome />}
            {route.name === 'generated' && <PracticeExercise key={`${route.archetype}-${route.seed}`} source={{ kind: 'generated', archetype: route.archetype, seed: route.seed }} />}
            {route.name === 'pool' && <PracticeExercise key={route.id} source={{ kind: 'pool', id: route.id }} />}
            {route.name === 'schemas' && <SchemaGallery lang={lang} />}
            {route.name === 'soon' && (
              <section className="card">
                <h1>{t(NAV.find((n) => sectionOf(n.route) === route.section)?.key ?? 'nav.practice')}</h1>
                <p className="note">{t('nav.soon')}</p>
              </section>
            )}
          </main>
        </div>
        <nav className="bottom" aria-label="Nabigazioa">
          {NAV.map((n) => {
            const on = sectionOf(n.route) === current;
            return (
              <a key={n.key} href={hrefOf(n.route)} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
                <span className="ico" aria-hidden="true">
                  {n.icon}
                </span>
                <span>{t(n.key)}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </LangContext.Provider>
  );
}
