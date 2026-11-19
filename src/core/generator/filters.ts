/**
 * Filters every generated exercise must pass (spec §10.3).
 */
import { globalChecks } from '../checks';
import { ExerciseError, diagnosticCollisions, expectedValues } from '../grader';
import { type KinExercise, askToJSON, chainToJSON, exerciseForAsk } from '../model';
import { type Rational, isInteger, mul, q } from '../rational';
import { speedTableA } from '../solverPath';
import { validateExercise } from '../validate';

const decimalsAtMost = (r: Rational, d: number): boolean => isInteger(mul(r, q(10 ** d)));

/** Empty list = the exercise is acceptable. */
export function filterProblems(ex: KinExercise): string[] {
  const out: string[] = [];
  const v = validateExercise(ex);
  if (!v.ok) return v.errors.map((e) => `invalid: ${e.code} ${e.message}`);
  const g = globalChecks(ex.chain, q(7, 3));
  if (g.length) return g.map((f) => `check: ${f.check} ${f.detail}`);

  // tooth counts inside the usual range (pinions without undercut)
  for (const e of ex.chain.elements)
    if ((e.kind === 'gear' || e.kind === 'bevel' || e.kind === 'chain') && (e.z1 < 17 || e.z2 < 17 || e.z1 > 120 || e.z2 > 120)) out.push(`teeth out of range: ${e.id}`);

  try {
    for (const a of ex.asks) {
      const exA = exerciseForAsk(ex, a);
      for (const { field, value } of expectedValues(exA, a)) {
        if (value.piPower !== 0) continue; // π results are never "round"
        const c = value.coef;
        switch (a.type) {
          case 'speed':
          case 'speedMaxMin':
            if (!decimalsAtMost(c, 1)) out.push(`speed not nice (${a.type}.${field})`);
            break;
          case 'feedPerMin':
          case 'feedPerRev':
          case 'linearSpeed':
            if (!decimalsAtMost(c, 2)) out.push(`feed not nice (${a.type}.${field})`);
            break;
          case 'centerDistance':
            if (!isInteger(c)) out.push('centre distance not a whole mm');
            break;
        }
      }
      // gearboxes: every speed different (duplicates mean a badly designed box)
      if (a.type === 'speedMaxMin' || a.type === 'speedCount') {
        const t = speedTableA(ex.chain, a.shaft);
        if (t.distinct.length !== t.total) out.push('duplicate speeds in the gearbox');
      }
    }
    const col = diagnosticCollisions(ex);
    if (col.length) out.push(...col.map((c) => `diagnosis collision: ask ${c.ask} ${c.field} ${c.code}`));
  } catch (e) {
    if (e instanceof ExerciseError) out.push(`exercise error: ${e.message}`);
    else throw e;
  }
  return out;
}

/** Signature used to avoid repeating the same exercise (archetype + chain data + asks + extra data). */
export function signature(ex: KinExercise): string {
  const j = chainToJSON(ex.chain);
  const els = j.elements.map((e) => {
    const { id: _id, ...rest } = e as unknown as Record<string, unknown>;
    void _id;
    return JSON.stringify(rest);
  });
  const asks = ex.asks.map((a) => JSON.stringify(askToJSON(a)));
  return `${ex.archetype ?? '?'}|${JSON.stringify(j.input)}|${els.join(';')}|${asks.join(';')}|${JSON.stringify(ex.state ?? {})}|${JSON.stringify(ex.data ?? {})}`;
}
