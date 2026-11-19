import type { Ask } from '../core/model';

/** Asks whose result depends on the cluster position. */
export const STATE_ASKS = new Set<Ask['type']>(['speed', 'ratio', 'direction', 'linearSpeed', 'feedPerMin', 'feedPerRev', 'torquePower', 'missingTeeth']);
