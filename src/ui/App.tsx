import { Suspense, lazy, useEffect, useState } from 'react';

// theory (KaTeX + texts) is loaded only when opened
const TheoryList = lazy(() => import('./theory/TheoryView').then((m) => ({ default: m.TheoryList })));
const TheoryTopic = lazy(() => import('./theory/TheoryView').then((m) => ({ default: m.TheoryTopic })));
import { type Lang, LangContext, translate } from '../i18n';
import { PracticeExercise } from './PracticeExercise';
import { PracticeHome } from './PracticeHome';
import { type Route, hrefOf, useRoute } from './router';
import { SchemaGallery } from './SchemaGallery';
import { WorkedItem, WorkedList } from './WorkedView';
import { AboutPage, Intro, ProgressPage, SettingsPage, StartPage } from './pages';
import { ReviewPage } from './ReviewPage';
import { setLastRoute, useProgress } from './progress';

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
  { key: 'nav.theory', route: { name: 'theory' }, icon: 'T' },
  { key: 'nav.worked', route: { name: 'worked' }, icon: 'E' },
  { key: 'nav.practice', route: { name: 'home' }, icon: 'P' },
  { key: 'nav.progress', route: { name: 'progress' }, icon: 'A' },
];

const sectionOf = (r: Route): string =>
  r.name === 'soon'
    ? r.section
    : r.name === 'schemas'
      ? 'eskemak'
      : r.name === 'worked' || r.name === 'workedItem'
        ? 'ebatziak'
        : r.name === 'theory' || r.name === 'theoryTopic'
          ? 'teoria'
          : r.name === 'progress'
            ? 'aurrerapena'
            : r.name === 'start' || r.name === 'settings' || r.name === 'about' || r.name === 'review'
              ? r.name
              : 'praktika';

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
  const progress = useProgress();
  const theme = progress.settings.theme;
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  useEffect(() => {
    if (['generated', 'pool', 'workedItem', 'theoryTopic'].includes(route.name)) setLastRoute(hrefOf(route));
  }, [route]);

  return (
    <LangContext.Provider value={lang}>
      <div className="app">
        <nav className="side" aria-label="Nabigazioa">
          <a className="brand" href="#/">
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
            <a className="brand mobile-only" href="#/" aria-label={t('nav.home')}>
              <b>KateLab</b>
            </a>
            <a className="home-link" href="#/" aria-current={current === 'start' ? 'page' : undefined}>
              {t('nav.home')}
            </a>
            <a className="settings-link" href={hrefOf({ name: 'settings' })} aria-current={current === 'settings' ? 'page' : undefined}>
              {t('nav.settings')}
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
            {route.name === 'start' && <StartPage />}
            {route.name === 'progress' && <ProgressPage />}
            {route.name === 'settings' && <SettingsPage setLang={setLang} />}
            {route.name === 'about' && <AboutPage />}
            {route.name === 'review' && (import.meta.env.DEV ? <ReviewPage /> : <p className="note">{t('rev.devOnly')}</p>)}
            {route.name === 'home' && <PracticeHome />}
            {route.name === 'generated' && <PracticeExercise key={`${route.archetype}-${route.seed}`} source={{ kind: 'generated', archetype: route.archetype, seed: route.seed }} />}
            {route.name === 'pool' && <PracticeExercise key={route.id} source={{ kind: 'pool', id: route.id }} />}
            {route.name === 'schemas' && <SchemaGallery lang={lang} />}
            <Suspense fallback={<p className="note">…</p>}>
              {route.name === 'theory' && <TheoryList />}
              {route.name === 'theoryTopic' && <TheoryTopic key={route.id} id={route.id} />}
            </Suspense>
            {route.name === 'worked' && <WorkedList />}
            {route.name === 'workedItem' && <WorkedItem key={route.id} id={route.id} />}
            {route.name === 'soon' && (
              <section className="card">
                <h1>{t(NAV.find((n) => sectionOf(n.route) === route.section)?.key ?? 'nav.practice')}</h1>
                <p className="note">{t('nav.soon')}</p>
              </section>
            )}
          </main>
        </div>
        {!progress.introSeen && <Intro />}
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
