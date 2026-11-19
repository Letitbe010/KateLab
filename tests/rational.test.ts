import fc from 'fast-check';
import * as R from '../src/core/rational';

const S = R.toString;

describe('rational: construction and parsing', () => {
  it('normalises sign and gcd', () => {
    expect(S(R.q(6, 8))).toBe('3/4');
    expect(S(R.q(6, -8))).toBe('-3/4');
    expect(S(R.q(-6, -8))).toBe('3/4');
    expect(S(R.q(0, 5))).toBe('0');
    expect(S(R.q(10, 5))).toBe('2');
  });
  it('rejects zero denominators and non-integers', () => {
    expect(() => R.q(1, 0)).toThrow();
    expect(() => R.q(1.5)).toThrow();
  });
  it('parses decimal comma and point exactly', () => {
    expect(S(R.parse('1,1'))).toBe('11/10');
    expect(S(R.parse('1.1'))).toBe('11/10');
    expect(S(R.parse('-2,5'))).toBe('-5/2');
    expect(S(R.parse('0,12'))).toBe('3/25');
    expect(S(R.parse(',5'))).toBe('1/2');
    expect(S(R.parse('1440'))).toBe('1440');
    expect(S(R.parse(' 3/4 '))).toBe('3/4');
    expect(S(R.parse('2,5/3'))).toBe('5/6');
    expect(S(R.parse('1e3'))).toBe('1000');
    expect(S(R.parse('2,5e-1'))).toBe('1/4');
    expect(S(R.parse('0.1'))).not.toBe(S(R.parse('0.1000000000000000055511151231257827')));
  });
  it('rejects garbage', () => {
    for (const s of ['', 'abc', '1,2,3', '.', '1/', '/2', '--1', '1/2/3', '1/0']) expect(() => R.parse(s)).toThrow();
  });
});

describe('rational: arithmetic', () => {
  it('basic operations', () => {
    const a = R.q(1, 3);
    const b = R.q(1, 6);
    expect(S(R.add(a, b))).toBe('1/2');
    expect(S(R.sub(a, b))).toBe('1/6');
    expect(S(R.mul(a, b))).toBe('1/18');
    expect(S(R.div(a, b))).toBe('2');
    expect(S(R.pow(R.q(2, 3), -2))).toBe('9/4');
    expect(() => R.div(a, R.ZERO)).toThrow();
  });
  it('floor', () => {
    expect(R.floor(R.q(5, 3))).toBe(1n);
    expect(R.floor(R.q(-5, 3))).toBe(-2n);
    expect(R.floor(R.q(6, 3))).toBe(2n);
  });
  it('toFixed rounds half away from zero, exactly', () => {
    expect(R.toFixed(R.q(8750, 11), 2)).toBe('795.45');
    expect(R.toFixed(R.q(1, 8), 2)).toBe('0.13');
    expect(R.toFixed(R.q(-1, 8), 2)).toBe('-0.13');
    expect(R.toFixed(R.q(500, 3), 2)).toBe('166.67');
    expect(R.toFixed(R.q(25, 27), 3)).toBe('0.926');
    expect(R.toFixed(R.q(7, 2), 0)).toBe('4');
    expect(R.toFixed(R.q(-1, 1000), 2)).toBe('0.00');
  });
  const arb = fc
    .tuple(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), fc.bigInt({ min: 1n, max: 10n ** 12n }))
    .map(([n, d]) => R.q(n, d));
  it('field laws (property)', () => {
    fc.assert(
      fc.property(arb, arb, arb, (a, b, c) => {
        expect(R.eq(R.add(a, b), R.add(b, a))).toBe(true);
        expect(R.eq(R.mul(R.add(a, b), c), R.add(R.mul(a, c), R.mul(b, c)))).toBe(true);
        expect(R.eq(R.sub(R.add(a, b), b), a)).toBe(true);
        if (!R.isZero(b)) expect(R.eq(R.mul(R.div(a, b), b), a)).toBe(true);
        expect(R.eq(R.parse(S(a)), a)).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('rational: symbolic π', () => {
  it('multiplies and divides powers', () => {
    const v = R.pr(R.q(3, 25), 1);
    expect(R.prToString(v)).toBe('3/25·π');
    expect(R.prToString(R.prDiv(R.pr(R.q(1)), v))).toBe('25/3·π^-1');
    expect(R.prToNumber(v)).toBeCloseTo(0.3769911, 6);
  });
  it('parses its own format', () => {
    for (const s of ['3/25·π', '7200·π', '825/8·π^-1', '5', '1/2·π^2']) expect(R.prToString(R.prParse(s))).toBe(s);
    expect(R.prToString(R.prParse('pi'))).toBe('1·π');
    expect(R.prToString(R.prParse('0,12*pi'))).toBe('3/25·π');
  });
  it('refuses to add different powers', () => {
    expect(() => R.prAdd(R.pr(R.ONE, 1), R.pr(R.ONE, 0))).toThrow();
  });
});
