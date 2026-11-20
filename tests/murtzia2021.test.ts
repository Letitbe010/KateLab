/**
 * Murcia OPE 2021, 0590-112, part A, exercise 4 (belt + two-speed sliding gearbox).
 * Expected values computed by hand from the data table on page 11:
 *   n1 = 1250 · 50/200            = 312,5 rpm
 *   n2 = 312,5 · 57/117 = 59375/390 = 11875/78 ≈ 152,24 rpm   (Z1–Z2)
 *   n2 = 312,5 · 131/43            = 81875/86  ≈ 952,03 rpm   (Z3–Z4)
 */
import { compareSolutions } from '../src/core/checks';
import { expectedValues, gradeAsk } from '../src/core/grader';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { validateExercise } from '../src/core/validate';
import { poolById } from '../src/data/pool';

const ex = poolById('ope-murtzia-2021-4')!;

describe('Murcia 2021, exercise 4', () => {
  it('is valid; both solvers agree in both positions; the pairs have the same tooth sum', () => {
    expect(validateExercise(ex).errors).toEqual([]);
    for (const K of ['g12', 'g34']) expect(compareSolutions(solveStateA(ex.chain, { K }), solveStateB(ex.chain, { K }))).toBeNull();
    const [a, b] = ['g12', 'g34'].map((id) => ex.chain.elements.find((e) => e.id === id)!);
    if (a!.kind !== 'gear' || b!.kind !== 'gear') throw new Error();
    expect(a!.z1 + a!.z2).toBe(b!.z1 + b!.z2);
  });
  it('hand-computed results', () => {
    const v = ex.asks.map((q) => R.prToString(expectedValues(ex, q)[0]!.value));
    expect(v).toEqual(['625/2', '11875/78', '81875/86']);
  });
  it('grading: rounded answers are right, the inverted ratio is wrong', () => {
    const g = (i: number, value: string) => gradeAsk(ex, ex.asks[i]!, { value, unit: 'rpm' }).status;
    expect(g(0, '312,5')).toBe('correct');
    expect(g(1, '152,24')).toBe('correct');
    expect(g(2, '952,03')).toBe('correct');
    expect(g(1, '641,45')).not.toBe('correct'); // 312,5 · 117/57
  });
});
