/**
 * Worked exercises (spec §15.3, phase 7 acceptance: 11 exercises, number tests green).
 *  - every worked exercise is built on a pool exercise that passes every check;
 *  - the text templates contain no hard-coded numbers (all numbers come from the solver);
 *  - the steps show the solver's numbers, and the summary equals the grader's expected answers.
 */
import eu from '../src/i18n/eu.json';
import es from '../src/i18n/es.json';
import worked from '../src/data/worked.json';
import { compareSolutions, globalChecks } from '../src/core/checks';
import { gradeAsk } from '../src/core/grader';
import { allStates } from '../src/core/model';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { validateExercise } from '../src/core/validate';
import { POOL, poolById } from '../src/data/pool';
import { buildWorked } from '../src/ui/worked';

const W = worked.worked;

/** Constants allowed inside formulas: /2, /60, 2π, 1:1, + 15 (mounting rule), 1 − s, /1000, × 1000, i < 1. */
const ALLOWED = [/\/\s?2(?!\d)/g, /\/\s?60(?!\d)/g, /2π/g, /1:1/g, /\+ 15/g, /1 − s/g, /\/1000/g, /× 1000/g, /m\/s/g, /i < 1/g];
function hardNumbers(s: string): string[] {
  let x = s.replace(/\{\w+\}/g, ''); // placeholder names such as {z1} are not numbers
  for (const re of ALLOWED) x = x.replace(re, '');
  return x.match(/\d+/g) ?? [];
}

describe('worked exercises', () => {
  it('there are 11 (spec §15.1), each with a distinct pool exercise', () => {
    expect(W).toHaveLength(11);
    expect(new Set(W.map((w) => w.pool)).size).toBe(11);
    for (const w of W) expect(poolById(w.pool), w.pool).toBeDefined();
  });

  it('every pool exercise (and so every worked one) passes validation, A = B, global checks, and grades its own answers', () => {
    for (const ex of POOL) {
      expect(validateExercise(ex).errors, ex.id).toEqual([]);
      expect(globalChecks(ex.chain, R.q(7, 3)), ex.id).toEqual([]);
      for (const st of allStates(ex.chain)) expect(compareSolutions(solveStateA(ex.chain, st), solveStateB(ex.chain, st)), ex.id).toBeNull();
    }
  });

  it('text templates of worked exercises and solutions contain no hard-coded numbers', () => {
    for (const dict of [eu, es] as Record<string, string>[])
      for (const [k, v] of Object.entries(dict)) if (k.startsWith('wk.') || k.startsWith('sol.')) expect(hardNumbers(v), `${k}: ${v}`).toEqual([]);
  });

  it.each(W.map((w) => [w.id, w.pool]))('%s: steps in both languages, solver numbers in the steps, summary = grader', (_id, pool) => {
    const ex = poolById(pool)!;
    const se = buildWorked(ex, 'eu');
    const ss = buildWorked(ex, 'es');
    expect(se.length).toBeGreaterThanOrEqual(3);
    expect(ss.map((s) => s.key)).toEqual(se.map((s) => s.key));
    // the same numbers appear in both languages (they come from the solver, not from the texts)
    const nums = (steps: typeof se) => steps.flatMap((s) => [...s.what, ...(s.table?.rows.map((r) => r.value) ?? [])].flatMap((w) => w.match(/\d+(,\d+)?/g) ?? []));
    expect(nums(ss)).toEqual(nums(se));
    // summary lines carry exactly the grader's expected values
    const summary = se[se.length - 1]!;
    ex.asks.forEach((a, i) => {
      const r = gradeAsk(ex, a, {});
      const line = summary.what[i]!;
      if (a.type === 'indexing' || a.type === 'changeGears') expect(r.solutions!.length).toBeGreaterThan(0);
      else if (a.type !== 'direction') for (const f of r.fields) expect(line).toContain(f.expected!);
    });
    // every stage step shows the speed the solver gives for its target shaft
    for (const s of se.filter((x) => x.key.startsWith('stage-'))) {
      const sol = solveStateA(ex.chain, s.state);
      if (!sol.ok) throw new Error(sol.error);
      const m = /= ([\d,]+) rpm$/.exec(s.what[0]!);
      expect(m, s.what[0]).not.toBeNull();
      const shown = R.parse(m![1]!);
      expect(Object.values(sol.shafts).some((v) => Math.abs(R.toNumber(v.n) - R.toNumber(shown)) < 0.006), s.what[0]).toBe(true);
    }
  });

  it('KG1 worked exercise: the two stages with the right numbers', () => {
    const steps = buildWorked(poolById('oinarria-kg1')!, 'eu');
    const what = steps.flatMap((s) => s.what).join('\n');
    expect(what).toContain('1440 · 20/40 = 720 rpm');
    expect(what).toContain('720 · 25/50 = 360 rpm');
    expect(what).toContain('= 1/4 ≈ 0,25');
  });
});
