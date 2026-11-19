/**
 * Generator and pool (spec §10, §9, phase 5 acceptance: 10 000 exercises verified;
 * pool verified with the oracle).
 *
 * `npm test` checks GEN_COUNT exercises per archetype (default 100 → 1 000 in all);
 * `npm run test:generator` sets GEN_COUNT=1000 → 10 000 exercises.
 */
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import fixture from './fixtures/euskadi2020.json';
import { compareSolutions, globalChecks } from '../src/core/checks';
import { ARCHETYPES, filterProblems, generate, signature } from '../src/core/generator';
import { type AskAnswer, convert, expectedValues, fmt, gradeAsk, unitsFor } from '../src/core/grader';
import { type Ask, type KinExercise, type KinExerciseJSON, allStates, exerciseForAsk, exerciseFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { validateExercise } from '../src/core/validate';
import { pinnedExercises, writePinned } from '../tools/pin-generated';
import poolOpe from '../src/data/pool/ope-euskadi-2020.json';

const COUNT = Number(process.env.GEN_COUNT ?? 100);

/** The answer a perfect student would type for an ask (6 decimals, decimal comma). */
function perfectAnswer(ex: KinExercise, ask: Ask): AskAnswer {
  const exA = exerciseForAsk(ex, ask);
  switch (ask.type) {
    case 'direction': {
      const st = exA.state ?? {};
      const s = solveStateA(exA.chain, st);
      if (!s.ok) throw new Error(s.error);
      const d = s.shafts[ask.shaft]!.dir;
      const inDir = exA.chain.input.direction;
      return { value: inDir ? (d === 1 ? inDir : inDir === 'cw' ? 'ccw' : 'cw') : d === 1 ? 'same' : 'opposite' };
    }
    case 'indexing':
    case 'changeGears':
    case 'missingTeeth': {
      const sols = gradeAsk(ex, ask, {}).solutions ?? [];
      if (!sols.length) throw new Error(`no solution for ${ask.type}`);
      return sols[0] as AskAnswer;
    }
    default: {
      const unit = unitsFor(ask)[0] ?? '';
      const out: AskAnswer = unit ? { unit } : {};
      for (const { field, value, unit: base } of expectedValues(ex, ask)) {
        const shown = base === 'N·m' || base === 'kW' || base === 'mm/rev' || base === '' ? base : unit;
        out[field] = fmt(convert(value, base, shown), 8);
      }
      return out;
    }
  }
}

/** Independent re-check of one generated exercise. */
function verify(ex: KinExercise) {
  expect(validateExercise(ex).errors).toEqual([]);
  expect(globalChecks(ex.chain, R.q(7, 3))).toEqual([]);
  for (const st of allStates(ex.chain)) expect(compareSolutions(solveStateA(ex.chain, st), solveStateB(ex.chain, st))).toBeNull();
  expect(filterProblems(ex)).toEqual([]);
  for (const a of ex.asks) {
    const r = gradeAsk(ex, a, perfectAnswer(ex, a));
    expect(r.status, `${ex.id} ${a.type}`).toBe('correct');
    expect(r.diagnoses).toEqual([]);
  }
}

describe('generator', () => {
  it('is deterministic: same archetype and seed → same exercise', () => {
    for (const a of ARCHETYPES) expect(JSON.stringify(generate(a.id, 7), (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(JSON.stringify(generate(a.id, 7), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  });

  it.each(ARCHETYPES.map((a) => [a.id]))(`%s: ${COUNT} generated exercises pass every check and grade their own answers as correct`, (id) => {
    const seen = new Set<string>();
    for (let seed = 0; seed < COUNT; seed++) {
      const ex = generate(id, seed);
      expect(ex.archetype).toBe(id);
      verify(ex);
      seen.add(signature(ex));
    }
    // variety: most seeds give different exercises. Two archetypes have a small space by nature:
    // change gears (13 metric pitches × 4 lead screws, minus those without a mountable train) and
    // indexing (2 plate sets × the N in [3, 160] that have a solution, about 200 in all).
    const floor = id === 'aldaketa-gurpilak' ? Math.min(30, COUNT * 0.3) : id === 'plater-zatitzailea' ? Math.min(150, COUNT * 0.5) : COUNT * 0.5;
    expect(seen.size).toBeGreaterThan(floor);
  }, Math.max(60_000, COUNT * 250));

  it('does not repeat an exercise from the recent history', () => {
    for (const a of ARCHETYPES) {
      const first = generate(a.id, 3);
      const next = generate(a.id, 3, { history: [signature(first)] });
      expect(signature(next)).not.toBe(signature(first));
    }
  });
});

describe('pool', () => {
  const ope = exerciseFromJSON(poolOpe as unknown as KinExerciseJSON);

  it('Euskadi 2020: same chain as the regression fixture, valid, and the expected answers of the animation', () => {
    expect(JSON.stringify(poolOpe.chain)).toBe(JSON.stringify(fixture.chain));
    expect(validateExercise(ope).errors).toEqual([]);
    const want = ['795,45', '0,93', '166,67', '64'];
    ope.asks.forEach((a, i) => {
      const v = expectedValues(ope, a)[0]!.value;
      expect(fmt(v, 2)).toBe(want[i]);
      expect(gradeAsk(ope, a, perfectAnswer(ope, a)).status).toBe('correct');
    });
    expect(R.prToString(expectedValues(ope, ope.asks[1]!)[0]!.value)).toBe('25/27');
  });

  it('pinned generated exercises are exactly what the generator gives today', () => {
    if (process.env.GEN_POOL) writePinned(resolve(__dirname, '../src/data/pool/generated.json'));
    const stored = JSON.parse(readFileSync(resolve(__dirname, '../src/data/pool/generated.json'), 'utf8')) as { exercises: KinExerciseJSON[] };
    const now = JSON.parse(JSON.stringify(pinnedExercises(), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    expect(stored.exercises).toEqual(now);
    for (const j of stored.exercises) verify(exerciseFromJSON(j));
  });
});
