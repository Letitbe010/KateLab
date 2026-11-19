import { useState } from 'react';

type Lang = 'eu' | 'es';

const T = {
  eu: {
    kicker: 'Fabrikazio mekanikoa · OPE 1508',
    title: 'Kaixo! Hau KateLab da',
    lead: 'Kate zinematikoen ariketak entrenatzeko aplikazioa: eskema zinematikoa ematen du, zuk kalkulatzen duzu, eta aplikazioak modu deterministan zuzentzen du.',
    status: 'Garapenean: 0. fasea (proiektuaren oinarria).',
    sections: ['Teoria', 'Ebatziak', 'Praktika', 'Aurrerapena'],
  },
  es: {
    kicker: 'Fabricación mecánica · OPE 1508',
    title: '¡Hola! Esto es KateLab',
    lead: 'Aplicación para entrenar ejercicios de cadenas cinemáticas: muestra el esquema cinemático, tú calculas y la aplicación corrige de forma determinista.',
    status: 'En desarrollo: fase 0 (base del proyecto).',
    sections: ['Teoría', 'Resueltos', 'Práctica', 'Progreso'],
  },
} as const;

export function App() {
  const [lang, setLang] = useState<Lang>('eu');
  const t = T[lang];
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <small>{t.kicker}</small>
          <b>KateLab</b>
        </div>
        <div className="lang" role="group" aria-label="Hizkuntza / Idioma">
          {(['eu', 'es'] as const).map((l) => (
            <button key={l} className={l === lang ? 'sel' : ''} aria-pressed={l === lang} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      <main className="card">
        <h1>{t.title}</h1>
        <p className="lead">{t.lead}</p>
        <div className="grid">
          {t.sections.map((s) => (
            <div key={s} className="tile">
              {s}
            </div>
          ))}
        </div>
        <p className="note">{t.status}</p>
      </main>
    </div>
  );
}
