/**
 * Grader tests (spec §11.1): correct answers get 100 %, each §8.3 mistake gets its
 * diagnosis, and in multi-solution asks every valid answer is accepted and every
 * invalid one rejected.
 */
import fc from 'fast-check';
import { chainArb } from './arbitraries';
import fresa from './fixtures/euskadi2020.json';
import golden from './golden/golden.json';
import { DEFAULT_GEARSET, compoundTrains, mountingOk } from '../src/core/changeGears';
import { type AskAnswer, type DiagCode, diagnosticCollisions, expectedValues, fmt, gradeAsk, missingTeethSolutions, numMatch } from '../src/core/grader';
import { indexingSolutions } from '../src/core/indexing';
import { type Ask, type ChainJSON, type KinExercise, type State, allStates, chainFromJSON } from '../src/core/model';
import * as R from '../src/core/rational';
import { linearFromStep, solutionData } from '../src/core/solution';
import { solveStateA } from '../src/core/solverPath';

const G = (id: string) => (golden.cases.find((c) => c.id === id) as { chain: unknown }).chain as ChainJSON;
const PLATES = [
  [15, 16, 17, 18, 19, 20],
  [21, 23, 27, 29, 31, 33],
  [37, 39, 41, 43, 47, 49],
];
function ex(chain: ChainJSON, asks: Ask[], state?: State, data?: KinExercise['data']): KinExercise {
  return { id: 't', origin: 'generated', difficulty: 2, chain: chainFromJSON(chain), asks, text: { eu: '', es: '' }, ...(state ? { state } : {}), ...(data ? { data } : {}) };
}
const g1 = (e: KinExercise, a: AskAnswer, i = 0) => gradeAsk(e, e.asks[i] as Ask, a);
const codes = (e: KinExercise, a: AskAnswer, i = 0) => g1(e, a, i).diagnoses.map((d) => d.code);
const FRESA = fresa.chain as unknown as ChainJSON;

describe('tolerance §8.1', () => {
  const e = R.pr(R.q(8750, 11)); // 795.4545…
  it('relative error ≤ 0,5 %', () => {
    expect(numMatch(R.parse('795,45'), e, 'rpm')).toBe(true);
    expect(numMatch(R.parse('792'), e, 'rpm')).toBe(true); // 0,43 %
    expect(numMatch(R.parse('790'), e, 'rpm')).toBe(false); // 0,69 %
  });
  it('2-decimal rounding rule only for |value| ≥ 1 (user decision): small values need 0,5 %', () => {
    const small = R.pr(R.q(3, 25), 1); // 0,12π = 0,37699 m/s
    expect(numMatch(R.parse('0,377'), small)).toBe(true);
    expect(numMatch(R.parse('0,38'), small)).toBe(false); // 0,8 % off
    expect(numMatch(R.parse('0'), R.pr(R.q(1, 360)))).toBe(false); // 0,00278 → "0" no longer accepted
    expect(numMatch(R.parse('0,01'), R.pr(R.q(63, 10000)))).toBe(false);
  });
  it('rpm rounded to the unit', () => {
    expect(numMatch(R.parse('795'), e, 'rpm')).toBe(true);
    expect(numMatch(R.parse('796'), e, 'rpm')).toBe(true); // also within 0,5 %
    expect(numMatch(R.parse('1'), R.pr(R.q(3, 2)), 'rpm')).toBe(false); // 1,5 → rounds to 2
    expect(numMatch(R.parse('2'), R.pr(R.q(3, 2)), 'rpm')).toBe(true);
  });
  it('display format uses a decimal comma', () => {
    expect(fmt(e)).toBe('795,45');
    expect(fmt(R.pr(R.q(80)))).toBe('80');
  });
});

describe('correct answers get 100 %', () => {
  it('KG1: speed, rad/s, ratio (fraction or decimal), direction', () => {
    const e = ex(G('KG1'), [
      { type: 'speed', shaft: 'III' },
      { type: 'ratio', from: 'I', to: 'III' },
      { type: 'direction', shaft: 'III' },
    ]);
    for (const v of ['360', '360,0', '360.4', '359']) expect(g1(e, { value: v }).status).toBe('correct');
    expect(g1(e, { value: '37,7', unit: 'rad/s' }).status).toBe('correct');
    for (const v of ['1/4', '0,25']) expect(g1(e, { value: v }, 1).status).toBe('correct');
    expect(g1(e, { value: 'same' }, 2).status).toBe('correct');
  });
  it('KG1 with an input direction: cw/ccw answers', () => {
    const j = { ...G('KG1'), input: { ...G('KG1').input, direction: 'cw' as const } };
    const e = ex(j, [{ type: 'direction', shaft: 'II' }]);
    expect(g1(e, { value: 'ccw' }).status).toBe('correct');
    expect(g1(e, { value: 'cw' }).status).toBe('wrong');
  });
  it('KG3: max/min, number of speeds, centre distance (mm and m)', () => {
    const e = ex(G('KG3'), [
      { type: 'speedMaxMin', shaft: 'II' },
      { type: 'speedCount', shaft: 'II' },
      { type: 'centerDistance', cluster: 'K' },
    ]);
    expect(g1(e, { max: '1200', min: '400' }).status).toBe('correct');
    expect(g1(e, { value: '3' }, 1).status).toBe('correct');
    expect(g1(e, { value: '80' }, 2).status).toBe('correct');
    expect(g1(e, { value: '0,08', unit: 'm' }, 2).status).toBe('correct');
  });
  it('KG4: rack speed in m/s and mm/min', () => {
    const e = ex(G('KG4'), [{ type: 'linearSpeed', output: 'R', unit: 'm/s' }]);
    for (const v of ['0,377', '0,3770', '0,3775']) expect(g1(e, { value: v, unit: 'm/s' }).status).toBe('correct');
    expect(g1(e, { value: '0,38', unit: 'm/s' }).status).toBe('wrong');
    expect(g1(e, { value: '22619', unit: 'mm/min' }).status).toBe('correct');
  });
  it('KG5, KG6, KG8, KG10', () => {
    const e5 = ex(G('KG5'), [
      { type: 'feedPerRev', output: 'T', spindle: 'SP' },
      { type: 'feedPerMin', output: 'T' },
    ]);
    expect(g1(e5, { value: '1' }).status).toBe('correct');
    expect(g1(e5, { value: '300' }, 1).status).toBe('correct');
    expect(g1(ex(G('KG6'), [{ type: 'speed', shaft: 'G' }]), { value: '35' }).status).toBe('correct');
    expect(g1(ex(G('KG8'), [{ type: 'speed', shaft: '2' }]), { value: '600' }).status).toBe('correct');
    const e10 = ex(G('KG10'), [{ type: 'torquePower', shaft: 'A' }]);
    expect(g1(e10, { T: '32,83', P: '1,1' }).status).toBe('correct');
  });
  it('Euskadi 2020: a) b) c) d)', () => {
    const a = ex(FRESA, [{ type: 'speed', shaft: 'III' }], { A: 'A0', B: 'B1', C: 'C1' });
    expect(g1(a, { value: '795,45' }).status).toBe('correct');
    const b = ex(FRESA, [{ type: 'feedPerRev', output: 'TABLE', spindle: 'III', max: true }]);
    expect(g1(b, { value: '0,926' }).status).toBe('correct');
    const c = ex(FRESA, [{ type: 'feedPerMin', output: 'CROSS' }], { A: 'A1', B: 'B1', C: 'C1' });
    expect(g1(c, { value: '166,67' }).status).toBe('correct');
    const d = ex(FRESA, [{ type: 'centerDistance', cluster: 'B' }]);
    expect(g1(d, { value: '64' }).status).toBe('correct');
    // c) in m/s: 1/360 m/s; "0" must not pass
    expect(g1(c, { value: '0,002778', unit: 'm/s' }).status).toBe('correct');
    expect(g1(c, { value: '0', unit: 'm/s' }).status).toBe('wrong');
  });
  it('a unit the ask does not offer is an invalid answer', () => {
    const e = ex(G('KG1'), [{ type: 'speed', shaft: 'III' }]);
    expect(g1(e, { value: '360', unit: 'm/s' }).status).toBe('invalid');
  });
  it('gear geometry m = 2, Z = 20', () => {
    const j: ChainJSON = { ...G('KG1'), elements: [{ kind: 'gear', id: 'g12', from: 'I', to: 'II', z1: 20, z2: 40, module: '2' }, (G('KG1').elements[1] as never)] };
    const e = ex(j, [{ type: 'gearGeometry', element: 'g12' }]);
    expect(g1(e, { d: '40', da: '44', df: '35', h: '4,5', p: '6,28' }).status).toBe('correct');
    const r = g1(e, { d: '40', da: '44', df: '36', h: '4,5', p: '6,28' });
    expect(r.status).toBe('wrong');
    expect(r.fields.find((f) => f.field === 'df')!.status).toBe('wrong');
  });
  it('missing and invalid answers are reported as such', () => {
    const e = ex(G('KG1'), [{ type: 'speed', shaft: 'III' }]);
    expect(g1(e, {}).status).toBe('missing');
    expect(g1(e, { value: 'abc' }).status).toBe('invalid');
  });
});

describe('diagnosis of the usual mistakes §8.3', () => {
  const kg1 = ex(G('KG1'), [{ type: 'speed', shaft: 'III' }]);
  it('1. ratio inverted in one stage or in all', () => {
    expect(codes(kg1, { value: '5760' })).toContain('inverse-all'); // 1440·2·2
    expect(codes(kg1, { value: '1440' })).toContain('inverse-stage'); // 1440·2·½
  });
  it('2. idler counted in the ratio, or forgotten in the direction', () => {
    const e = ex(G('KG2'), [
      { type: 'speed', shaft: '3' },
      { type: 'direction', shaft: '3' },
    ]);
    expect(codes(e, { value: '571,43' })).toContain('idler-in-ratio');
    expect(codes(e, { value: 'opposite' }, 1)).toEqual(['idler-direction']);
  });
  it('3. other cluster position used', () => {
    const a = ex(FRESA, [{ type: 'speed', shaft: 'III' }], { A: 'A0', B: 'B1', C: 'C1' });
    expect(codes(a, { value: '250' })).toContain('wrong-position'); // A0 + B0
  });
  it('4. screw starts forgotten', () => {
    const j = { ...G('KG5'), elements: [G('KG5').elements[0]!, { kind: 'screw' as const, id: 'sc', from: 'S', output: 'T', pitch: '5', starts: 2 }] };
    const e = ex(j, [{ type: 'feedPerMin', output: 'T' }]);
    expect(g1(e, { value: '600' }).status).toBe('correct');
    expect(codes(e, { value: '300' })).toContain('screw-starts');
  });
  it('5. mm/rev and mm/min mixed up', () => {
    const e = ex(G('KG5'), [
      { type: 'feedPerRev', output: 'T', spindle: 'SP' },
      { type: 'feedPerMin', output: 'T' },
    ]);
    expect(codes(e, { value: '300' }, 0)).toContain('feed-units');
    expect(codes(e, { value: '1' }, 1)).toContain('feed-units');
  });
  it('6. rack: radius for diameter, /60 forgotten, mm and m mixed up', () => {
    const e = ex(G('KG4'), [{ type: 'linearSpeed', output: 'R', unit: 'm/s' }]);
    expect(codes(e, { value: '0,1885', unit: 'm/s' })).toContain('rack-radius');
    expect(codes(e, { value: '22,62', unit: 'm/s' })).toContain('rack-no-60');
    expect(codes(e, { value: '377', unit: 'm/s' })).toContain('mm-m');
  });
  it('7. centre distance: /2 forgotten, or teeth subtracted', () => {
    const e = ex(G('KG3'), [{ type: 'centerDistance', cluster: 'K' }]);
    expect(codes(e, { value: '160' })).toContain('centre-no-half');
    expect(codes(e, { value: '40' })).toContain('centre-difference');
  });
  it('8. rpm and rad/s mixed up', () => {
    expect(codes(kg1, { value: '37,7' })).toContain('rpm-rads');
    const e10 = ex(G('KG10'), [{ type: 'torquePower', shaft: 'A' }]);
    expect(codes(e10, { T: '3,44', P: '1,1' })).toContain('rpm-rads'); // P/n with n in rpm
    expect(codes(e10, { T: '32,83', P: '1100' })).toContain('kw-w');
  });
  it('9. indexing: N/K instead of K/N; whole turns not taken out', () => {
    const e = ex(G('KG1'), [{ type: 'indexing', N: 24 }], undefined, { K: 40, platesHoles: PLATES });
    expect(codes(e, { turns: '0', holes: '12', circle: '20' })).toContain('indexing-inverted');
    const r = g1(e, { turns: '0', holes: '30', circle: '18' });
    expect(r.status).toBe('wrong');
    expect(r.diagnoses[0]).toEqual({ code: 'indexing-not-reduced', detail: { turns: '1', holes: '12', circle: '18' } });
    expect(codes(e, { turns: '1', holes: '20', circle: '30' })).toContain('circle-not-on-plates');
  });
  it('10. maximum feed: a local maximum (not every combination examined)', () => {
    const b = ex(FRESA, [{ type: 'feedPerRev', output: 'TABLE', spindle: 'III', max: true }]);
    const c = chainFromJSON(FRESA);
    const st = { A: 'A1', B: 'B1', C: 'C1' };
    const s = solveStateA(c, st);
    if (!s.ok) throw new Error();
    const local = R.toFixed(R.div(s.linear.TABLE!.v.coef, s.shafts.III!.n), 4);
    expect(codes(b, { value: local })).toContain('local-max');
  });
  it('unknown mistakes are said to be unknown', () => {
    expect(codes(kg1, { value: '1234' })).toEqual(['unknown']);
  });
  it('a correct answer never gets a diagnosis', () => {
    expect(g1(kg1, { value: '360' }).diagnoses).toEqual([]);
  });
});

describe('multi-solution asks §8.2', () => {
  it('indexing: every valid hole circle accepted, everything else rejected', () => {
    const e = ex(G('KG1'), [{ type: 'indexing', N: 24 }], undefined, { K: 40, platesHoles: PLATES });
    const sols = indexingSolutions(40, 24, PLATES);
    expect(sols.length).toBeGreaterThan(3);
    for (const s of sols) expect(g1(e, { turns: String(s.turns), holes: String(s.holes), circle: String(s.circle) }).status).toBe('correct');
    for (const circle of PLATES.flat())
      for (let holes = 0; holes < circle; holes++) {
        const ok = sols.some((s) => s.circle === circle && s.holes === holes);
        expect(g1(e, { turns: '1', holes: String(holes), circle: String(circle) }).status).toBe(ok ? 'correct' : 'wrong');
      }
    expect(g1(e, { turns: '1', holes: '12', circle: '18' }).solutions!.length).toBe(sols.length);
  });
  it('change gears: every valid train accepted (with the +15 mounting condition), invalid ones rejected', () => {
    const ask: Ask = { type: 'changeGears', threadPitch: R.parse('1,5'), leadScrewPitch: R.q(6), mountingCondition: true };
    const e = ex(G('KG1'), [ask], undefined, { changeGears: DEFAULT_GEARSET });
    const valid = compoundTrains(R.q(1, 4), DEFAULT_GEARSET, { mountingCondition: true });
    const gearArb = fc.constantFrom(...DEFAULT_GEARSET);
    expect(valid).toContainEqual({ za: 20, zb: 40, zc: 30, zd: 60 });
    for (const t of valid) expect(g1(e, { za: String(t.za), zb: String(t.zb), zc: String(t.zc), zd: String(t.zd) }).status).toBe('correct');
    fc.assert(
      fc.property(fc.tuple(gearArb, gearArb, gearArb, gearArb), ([za, zb, zc, zd]) => {
        const ok =
          za * zc * 4 === zb * zd && new Set([za, zb, zc, zd]).size === 4 && mountingOk({ za, zb, zc, zd });
        expect(g1(e, { za: String(za), zb: String(zb), zc: String(zc), zd: String(zd) }).status).toBe(ok ? 'correct' : 'wrong');
      }),
      { numRuns: 3000 },
    );
    expect(codes(e, { za: '40', zb: '20', zc: '60', zd: '30' })).toContain('inverse-all');
    expect(codes(e, { za: '20', zb: '40', zc: '20', zd: '40' })).toContain('gear-reused');
  });
  it('change gears, two-gear train', () => {
    const ask: Ask = { type: 'changeGears', threadPitch: R.q(2), leadScrewPitch: R.q(6) };
    const e = ex(G('KG1'), [ask]);
    expect(g1(e, { za: '20', zb: '60' }).status).toBe('correct');
    expect(g1(e, { za: '25', zb: '75' }).status).toBe('correct');
    expect(g1(e, { za: '60', zb: '20' }).status).toBe('wrong');
  });
  it('missing teeth: the unique value, and the cluster tooth-sum rule', () => {
    const e = ex(G('KG1'), [{ type: 'missingTeeth', element: 'g23', side: 'z2', target: { shaft: 'III', n: R.q(360) } }]);
    expect(missingTeethSolutions(e, e.asks[0] as Extract<Ask, { type: 'missingTeeth' }>)).toEqual([50]);
    expect(g1(e, { value: '50' }).status).toBe('correct');
    expect(g1(e, { value: '49' }).status).toBe('wrong');
    const k = ex(G('KG3'), [{ type: 'missingTeeth', element: 'a', side: 'z1', target: { shaft: 'II', n: R.q(400) } }], { K: 'a' });
    expect(g1(k, { value: '20' }).status).toBe('correct');
    const k2 = ex(G('KG3'), [{ type: 'missingTeeth', element: 'a', side: 'z2', target: { shaft: 'II', n: R.q(600) } }], { K: 'a' });
    expect(codes(k2, { value: '40' })).toEqual(['cluster-sum']); // 1200·20/40 = 600 but 20 + 40 ≠ 80
  });
});

describe('properties of the grader', () => {
  it('on random chains the exact speed is always correct, 1 % off is always wrong, and a correct answer has no diagnosis', () => {
    fc.assert(
      fc.property(chainArb({ clusters: true }), fc.nat(), (j, pick) => {
        const c = chainFromJSON(j);
        const st = allStates(c)[pick % allStates(c).length] as State;
        const shaft = c.shafts[pick % c.shafts.length]!.id;
        const e = { ...ex(j, [{ type: 'speed', shaft }]), state: st };
        const value = expectedValues(e, e.asks[0] as Ask)[0]!.value;
        const r = g1(e, { value: R.toFixed(value.coef, 15) });
        expect(r.status).toBe('correct');
        expect(r.diagnoses).toEqual([]);
        const off = R.mul(value.coef, R.q(101, 100));
        expect(g1(e, { value: R.toFixed(off, 15) }).status).toBe('wrong');
      }),
      { numRuns: 2000 },
    );
  });
  it('generator filter: collisions are detected when a mistake gives the right value', () => {
    expect(diagnosticCollisions(ex(G('KG1'), [{ type: 'speed', shaft: 'III' }]))).toEqual([]);
    // stages 20/40 and 40/20: inverting both gives the same speed → cannot be diagnosed
    const j: ChainJSON = {
      shafts: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'C', label: 'C' }],
      elements: [
        { kind: 'gear', id: 'g1', from: 'A', to: 'B', z1: 20, z2: 40 },
        { kind: 'gear', id: 'g2', from: 'B', to: 'C', z1: 40, z2: 20 },
      ],
      input: { shaft: 'A', n: 1000 },
    };
    const col = diagnosticCollisions(ex(j, [{ type: 'speed', shaft: 'C' }])).map((x) => x.code as DiagCode);
    expect(col).toContain('inverse-all');
  });
});

describe('step-by-step solution data §8.4', () => {
  it('KG1: stage fractions, total ratio, shaft table', () => {
    const d = solutionData(ex(G('KG1'), [{ type: 'speed', shaft: 'III' }]));
    const p = d.paths.find((x) => x.target === 'III')!;
    expect(p.stages.map((s) => `${s.num}/${s.den}`)).toEqual(['20/40', '25/50']);
    expect(R.toString(p.total)).toBe('1/4');
    expect(d.shafts.map((s) => [s.shaft, R.toString(s.n), s.dir])).toEqual([
      ['I', '1440', 1],
      ['II', '720', -1],
      ['III', '360', 1],
    ]);
  });
  it('Euskadi 2020 c): path to the cross-slide screw and the screw formula', () => {
    const d = solutionData(ex(FRESA, [{ type: 'feedPerMin', output: 'CROSS' }], { A: 'A1', B: 'B1', C: 'C1' }));
    const p = d.paths.find((x) => x.target === 'S1')!;
    expect(p.stages.map((s) => `${s.num}/${s.den}`)).toEqual(['100/360', '40/20', '15/15', '1/1', '20/20', '1/30', '30/25']);
    const l = d.linear[0]!;
    expect(R.prToString(linearFromStep(l))).toBe('500/3');
    expect(d.active).toContain('C1');
    expect(d.active).not.toContain('C0');
  });
  it('speed table with max and min for speedMaxMin asks', () => {
    const d = solutionData(ex(G('KG3'), [{ type: 'speedMaxMin', shaft: 'II' }]));
    expect(d.speedTable!.rows.map((r) => R.toString(r.n))).toEqual(['400', '720', '1200']);
    expect(R.toString(d.speedTable!.max)).toBe('1200');
  });
});
