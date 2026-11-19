/**
 * Writes src/data/pool/generated.json: one generated exercise per archetype
 * (seed 1), pinned for review (spec §9.1, origin "generated").
 * Run: npx vite-node tools/pin-generated.ts   (or through the test GEN_POOL=1)
 */
import { writeFileSync } from 'node:fs';
import { ARCHETYPES, generate } from '../src/core/generator';
import { exerciseToJSON } from '../src/core/model';

export function pinnedExercises() {
  return ARCHETYPES.map((a) => ({ ...exerciseToJSON(generate(a.id, 1)), review: 'review-needed' as const }));
}

export function writePinned(path: string) {
  const json = JSON.stringify({ _comment: 'Generated exercises pinned for review (seed 1 per archetype). Regenerate with GEN_POOL=1 npx vitest run tests/generator.test.ts if the generator changes on purpose.', exercises: pinnedExercises() }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  writeFileSync(path, json + '\n');
}
