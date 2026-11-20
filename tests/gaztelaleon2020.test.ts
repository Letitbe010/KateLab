/**
 * Castilla y León 0590-112 model exam (2020), exercise 1, part 3: change gears with a
 * Norton box 1:2 between the quadrant and the lead screw (read as i = 1/2, user decision
 * 2026-11-20). Hand computation:
 *   P_thread = i_gears · i_Norton · P_screw  →  i_gears = 3 / (14 · 1/2) = 3/7
 *   e.g. 24/56 (simple), (48·32)/(56·64), (24·40)/(56·40) (two sets: 40 twice)
 */
import { quadrantRatio } from '../src/core/changeGears';
import { gradeAsk } from '../src/core/grader';
import * as R from '../src/core/rational';
import { validateExercise } from '../src/core/validate';
import { poolById } from '../src/data/pool';

const ex = poolById('ope-gaztela-leon-2020-3')!;
const ask = ex.asks[0]!;
const grade = (za: number, zb: number, zc?: number, zd?: number) => {
  const r = gradeAsk(ex, ask, { za: String(za), zb: String(zb), zc: zc === undefined ? '' : String(zc), zd: zd === undefined ? '' : String(zd) });
  return { status: r.status, codes: r.diagnoses.map((d) => d.code) };
};

describe('Castilla y León 2020 (model exam), change gears with a Norton box', () => {
  it('is valid and the gears must give 3/7', () => {
    expect(validateExercise(ex).errors).toEqual([]);
    if (ask.type !== 'changeGears') throw new Error();
    expect(R.toString(quadrantRatio(ask))).toBe('3/7');
  });
  it('right answers: simple and compound trains, a gear twice (several sets)', () => {
    expect(grade(24, 56).status).toBe('correct');
    expect(grade(48, 56, 32, 64).status).toBe('correct');
    expect(grade(24, 56, 40, 40).status).toBe('correct');
  });
  it('the Norton box forgotten (gears give 3/14) is diagnosed', () => {
    const g = grade(24, 64, 32, 56); // 768/3584 = 3/14
    expect(g.status).toBe('wrong');
    expect(g.codes).toContain('fixed-ratio-ignored');
  });
  it('inverted train and gears outside the set are wrong', () => {
    expect(grade(56, 48, 64, 32).codes).toContain('inverse-all');
    expect(grade(30, 70).codes).toContain('gear-not-in-set');
  });
});
