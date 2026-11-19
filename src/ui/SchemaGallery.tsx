/**
 * Phase 3 review screen: every demo chain drawn with the automatic layout,
 * clusters switchable, speeds from solver A. Used to approve the schema style.
 */
import { useMemo, useState } from 'react';
import golden from '../../tests/golden/golden.json';
import fresa from '../../tests/fixtures/euskadi2020.json';
import { type ChainJSON, type State, chainFromJSON } from '../core/model';
import { toFixed } from '../core/rational';
import { solveStateA } from '../core/solverPath';
import { KinematicSchema, type Lang } from './KinematicSchema';

interface Demo {
  id: string;
  title: { eu: string; es: string };
  chain: ChainJSON;
}

const TITLES: Record<string, { eu: string; es: string }> = {
  KG1: { eu: 'Bi etapako trena', es: 'Tren de dos etapas' },
  KG2: { eu: 'Gurpil tartekaria', es: 'Rueda intermedia' },
  KG3: { eu: '3 abiadurako kaxa', es: 'Caja de 3 velocidades' },
  KG4: { eu: 'Pinoi-kremailera', es: 'Piñón-cremallera' },
  KG5: { eu: 'Aitzinapen-torlojua', es: 'Husillo de avance' },
  KG6: { eu: 'Torloju amaigabea', es: 'Tornillo sinfín' },
  KG8: { eu: 'Poleak', es: 'Poleas' },
};

const DEMOS: Demo[] = [
  ...golden.cases
    .filter((c) => 'chain' in c && c.chain && (c.chain as ChainJSON).elements.length > 0)
    .map((c) => ({ id: c.id, title: TITLES[c.id] ?? { eu: c.title, es: c.title }, chain: c.chain as unknown as ChainJSON })),
  { id: 'fresa', title: { eu: 'Fresagailua (Euskadi 2020)', es: 'Fresadora (Euskadi 2020)' }, chain: fresa.chain as unknown as ChainJSON },
];

/** Exact speed, shown with at most 2 decimals and a decimal comma. */
const fmt = (s: string) => s.replace(/\.?0+$/, '').replace('.', ',');

export function SchemaGallery({ lang }: { lang: Lang }) {
  const [demoId, setDemoId] = useState(DEMOS[0]?.id ?? '');
  const demo = DEMOS.find((d) => d.id === demoId) ?? (DEMOS[0] as Demo);
  const chain = useMemo(() => chainFromJSON(demo.chain), [demo]);
  const initial = useMemo(() => Object.fromEntries(chain.clusters.map((c) => [c.id, c.options[0] as string])), [chain]);
  const [state, setState] = useState<State>(initial);
  const [showN, setShowN] = useState(true);
  const st = Object.keys(state).every((k) => chain.clusters.some((c) => c.id === k)) && chain.clusters.every((c) => state[c.id]) ? state : initial;
  const sol = solveStateA(chain, st);
  const speeds =
    showN && sol.ok ? Object.fromEntries(Object.entries(sol.shafts).map(([s, v]) => [s, `${fmt(toFixed(v.n, 2))} rpm`])) : undefined;

  return (
    <section className="card">
      <h1>{lang === 'eu' ? 'Eskema zinematikoak (berrikusteko)' : 'Esquemas cinemáticos (para revisar)'}</h1>
      <div className="demo-pick" role="tablist">
        {DEMOS.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === demo.id}
            className={d.id === demo.id ? 'small sel' : 'small'}
            onClick={() => {
              setDemoId(d.id);
              setState({});
            }}
          >
            {d.title[lang]}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={showN} onChange={(e) => setShowN(e.target.checked)} />
        {lang === 'eu' ? 'Erakutsi abiadurak (A ebazlea)' : 'Mostrar velocidades (solver A)'}
      </label>
      <KinematicSchema chain={chain} state={st} lang={lang} onStateChange={setState} {...(speeds ? { speeds } : {})} />
    </section>
  );
}
