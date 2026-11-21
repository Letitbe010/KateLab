/**
 * Further OPE exercises from the user's exam folder, with hand-computed results.
 *  - Castilla y León 2018, ex. 1.5 a): K/N = 40/28 = 1 + 3/7 → 1 turn + 9 holes on 21 (plate 2)
 *  - Valencia 2025, B.2: n_B = 1200 · 50/25 = 2400 rpm; T_A = P/ω = 100000 / (1200·2π/60) = 2500/π ≈ 795,77 N·m
 *  - Murcia 2023, ex. 2: rack pitch 50/2 = 25 mm; v = n · Z · p = 24 · 10 · 25 = 6000 mm/min (6 m/min)
 */
import { compareSolutions } from '../src/core/checks';
import { expectedValues, gradeAsk } from '../src/core/grader';
import * as R from '../src/core/rational';
import { solveStateB } from '../src/core/solverLinear';
import { solveStateA } from '../src/core/solverPath';
import { validateExercise } from '../src/core/validate';
import { poolById } from '../src/data/pool';

const IDS = ['ope-gaztela-leon-2018-5', 'ope-valentzia-2025-b2', 'ope-murtzia-2023-2'];

describe('more OPE exercises', () => {
  it.each(IDS)('%s is valid and both solvers agree', (id) => {
    const ex = poolById(id)!;
    expect(ex).toBeDefined();
    expect(validateExercise(ex).errors).toEqual([]);
    expect(compareSolutions(solveStateA(ex.chain, {}), solveStateB(ex.chain, {}))).toBeNull();
  });

  it('Castilla y León 2018: 1 turn + 9 holes on the 21 circle; nothing else on these plates', () => {
    const ex = poolById('ope-gaztela-leon-2018-5')!;
    const r = gradeAsk(ex, ex.asks[0]!, { turns: '1', holes: '9', circle: '21' });
    expect(r.status).toBe('correct');
    expect(r.solutions).toEqual([{ turns: '1', holes: '9', circle: '21' }]);
    expect(gradeAsk(ex, ex.asks[0]!, { turns: '1', holes: '12', circle: '28' }).status).toBe('wrong'); // 28 not on the plates
  });

  it('Valencia 2025: 2400 rpm and 2500/π N·m', () => {
    const ex = poolById('ope-valentzia-2025-b2')!;
    expect(R.prToString(expectedValues(ex, ex.asks[0]!)[0]!.value)).toBe('2400');
    const tp = expectedValues(ex, ex.asks[1]!);
    expect(R.prToString(tp.find((f) => f.field === 'T')!.value)).toBe('2500·π^-1');
    const P = tp.find((f) => f.field === 'P')!;
    expect([R.prToString(P.value), P.unit]).toEqual(['100', 'kW']);
    expect(gradeAsk(ex, ex.asks[1]!, { T: '795,77', P: '100' }).status).toBe('correct');
  });

  it('Murcia 2023: 6000 mm/min', () => {
    const ex = poolById('ope-murtzia-2023-2')!;
    expect(R.prToString(expectedValues(ex, ex.asks[0]!)[0]!.value)).toBe('6000');
    expect(gradeAsk(ex, ex.asks[0]!, { value: '6000', unit: 'mm/min' }).status).toBe('correct');
  });
});
