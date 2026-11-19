/**
 * Exercise generator (spec §10): archetype + seed → exercise, deterministically.
 * Candidates are drawn with mulberry32(mix(seed, attempt)) until one passes the
 * §10.3 filters; the same (archetype, seed) always gives the same exercise, so an
 * exercise can live in a URL (#/praktika/<archetype>/seed/<seed>).
 */
import type { KinExercise } from '../model';
import { ARCHETYPES, type Archetype, archetypeById } from './archetypes';
import { filterProblems, signature } from './filters';
import { mix, mulberry32 } from './rng';

export const MAX_ATTEMPTS = 400;
export const HISTORY_SIZE = 50;

export class GeneratorError extends Error {}

export interface GenerateOptions {
  /** Signatures of recent exercises (spec §10.3: do not repeat the last 50). */
  history?: string[];
}

export function generate(archetypeId: string, seed: number, opt: GenerateOptions = {}): KinExercise {
  const arch = archetypeById(archetypeId);
  if (!arch) throw new GeneratorError(`unknown archetype ${archetypeId}`);
  const recent = new Set((opt.history ?? []).slice(-HISTORY_SIZE));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = mulberry32(mix(seed, attempt));
    const cand = arch.build(rng);
    if (!cand) continue;
    const ex: KinExercise = { ...cand, id: `${arch.id}-${seed}`, origin: 'generated', seed, archetype: arch.id };
    if (filterProblems(ex).length) continue;
    if (recent.has(signature(ex))) continue;
    return ex;
  }
  throw new GeneratorError(`no valid ${archetypeId} exercise for seed ${seed} after ${MAX_ATTEMPTS} attempts`);
}

/** Pick an archetype by level (1–3) and generate. */
export function generateForLevel(level: 1 | 2 | 3, seed: number, opt: GenerateOptions = {}): KinExercise {
  const archs = ARCHETYPES.filter((a) => a.level === level);
  const a = archs[seed % archs.length] as Archetype;
  return generate(a.id, seed, opt);
}

export { ARCHETYPES, archetypeById, filterProblems, signature };
