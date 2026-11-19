import { useState } from 'react';
import { SchemaGallery } from './SchemaGallery';

type Lang = 'eu' | 'es';

const T = {
  eu: { kicker: 'Fabrikazio mekanikoa · OPE 1508', status: 'Garapenean: 3. fasea (eskema zinematikoa).' },
  es: { kicker: 'Fabricación mecánica · OPE 1508', status: 'En desarrollo: fase 3 (esquema cinemático).' },
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
      <SchemaGallery lang={lang} />
      <p className="note">{t.status}</p>
    </div>
  );
}
