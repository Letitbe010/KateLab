/**
 * Hash router (GitHub Pages has no SPA routing, spec §13.1).
 *   #/                                   → learning path (start)
 *   #/aurrerapena, #/ezarpenak, #/honi-buruz → progress, settings, about
 *   #/praktika                           → practice home
 *   #/praktika/<archetype>/seed/<n>      → generated exercise
 *   #/praktika/pool/<id>                 → pool exercise
 *   #/teoria, #/teoria/<id>              → theory
 *   #/ebatziak, #/ebatziak/<id>          → worked exercises
 *   #/eskemak                            → schema gallery (development)
 */
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'start' }
  | { name: 'progress' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'review' }
  | { name: 'home' }
  | { name: 'generated'; archetype: string; seed: number }
  | { name: 'pool'; id: string }
  | { name: 'schemas' }
  | { name: 'worked' }
  | { name: 'theory' }
  | { name: 'theoryTopic'; id: string }
  | { name: 'workedItem'; id: string }
  | { name: 'soon'; section: string };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'praktika' && parts[2] === 'seed' && parts[1] && parts[3] && /^\d+$/.test(parts[3]))
    return { name: 'generated', archetype: parts[1], seed: Number(parts[3]) };
  if (parts[0] === 'praktika' && parts[1] === 'pool' && parts[2]) return { name: 'pool', id: parts[2] };
  if (parts[0] === 'eskemak') return { name: 'schemas' };
  if (parts[0] === 'ebatziak') return parts[1] ? { name: 'workedItem', id: parts[1] } : { name: 'worked' };
  if (parts[0] === 'teoria') return parts[1] ? { name: 'theoryTopic', id: parts[1] } : { name: 'theory' };
  if (parts[0] === 'aurrerapena') return { name: 'progress' };
  if (parts[0] === 'ezarpenak') return { name: 'settings' };
  if (parts[0] === 'honi-buruz') return { name: 'about' };
  if (parts[0] === 'berrikusi') return { name: 'review' };
  if (parts[0] === 'praktika') return { name: 'home' };
  return { name: 'start' };
}

export const hrefOf = (r: Route): string => {
  switch (r.name) {
    case 'generated':
      return `#/praktika/${encodeURIComponent(r.archetype)}/seed/${r.seed}`;
    case 'pool':
      return `#/praktika/pool/${encodeURIComponent(r.id)}`;
    case 'schemas':
      return '#/eskemak';
    case 'worked':
      return '#/ebatziak';
    case 'theory':
      return '#/teoria';
    case 'theoryTopic':
      return `#/teoria/${encodeURIComponent(r.id)}`;
    case 'workedItem':
      return `#/ebatziak/${encodeURIComponent(r.id)}`;
    case 'soon':
      return `#/${r.section}`;
    case 'start':
      return '#/';
    case 'progress':
      return '#/aurrerapena';
    case 'settings':
      return '#/ezarpenak';
    case 'about':
      return '#/honi-buruz';
    case 'review':
      return '#/berrikusi';
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
