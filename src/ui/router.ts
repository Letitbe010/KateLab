/**
 * Hash router (GitHub Pages has no SPA routing, spec §13.1).
 *   #/                                   → practice home (for now)
 *   #/praktika                           → practice home
 *   #/praktika/<archetype>/seed/<n>      → generated exercise
 *   #/praktika/pool/<id>                 → pool exercise
 *   #/eskemak                            → schema gallery (development)
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'generated'; archetype: string; seed: number }
  | { name: 'pool'; id: string }
  | { name: 'schemas' }
  | { name: 'soon'; section: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'praktika' && parts[2] === 'seed' && parts[1] && parts[3] && /^\d+$/.test(parts[3]))
    return { name: 'generated', archetype: parts[1], seed: Number(parts[3]) };
  if (parts[0] === 'praktika' && parts[1] === 'pool' && parts[2]) return { name: 'pool', id: parts[2] };
  if (parts[0] === 'eskemak') return { name: 'schemas' };
  if (parts[0] && ['teoria', 'ebatziak', 'aurrerapena'].includes(parts[0])) return { name: 'soon', section: parts[0] };
  return { name: 'home' };
}

export const hrefOf = (r: Route): string => {
  switch (r.name) {
    case 'generated':
      return `#/praktika/${encodeURIComponent(r.archetype)}/seed/${r.seed}`;
    case 'pool':
      return `#/praktika/pool/${encodeURIComponent(r.id)}`;
    case 'schemas':
      return '#/eskemak';
    case 'soon':
      return `#/${r.section}`;
    default:
      return '#/praktika';
  }
};

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
