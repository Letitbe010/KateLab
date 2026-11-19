import { unitsFor } from '../core/grader';
import type { Ask } from '../core/model';
import type { Settings } from './progress';

/** Default unit of an ask: the user's preferred unit when the ask offers it. */
export function defaultUnit(ask: Ask, s: Settings): string {
  const units = unitsFor(ask);
  if ((ask.type === 'speed' || ask.type === 'speedMaxMin') && units.includes(s.speedUnit)) return s.speedUnit;
  if ((ask.type === 'linearSpeed' || ask.type === 'feedPerMin') && units.includes(s.linearUnit) && !(ask.type === 'linearSpeed' && ask.unit)) return s.linearUnit;
  return units[0] ?? '';
}
