import eu from '../src/i18n/eu.json';
import es from '../src/i18n/es.json';
import { FIELDS } from '../src/core/grader';
import { translate } from '../src/i18n';

const DIAG = [
  'inverse-stage', 'inverse-all', 'idler-in-ratio', 'idler-direction', 'wrong-position', 'screw-starts', 'feed-units',
  'rack-radius', 'rack-no-60', 'mm-m', 'centre-no-half', 'centre-difference', 'rpm-rads', 'indexing-inverted',
  'indexing-not-reduced', 'circle-not-on-plates', 'local-max', 'kw-w', 'efficiency-ignored', 'counted-duplicates',
  'ratio-mismatch', 'gear-not-in-set', 'gear-reused', 'mounting-condition', 'cluster-sum', 'pitch-as-module', 'fixed-ratio-ignored', 'unknown',
];

describe('i18n', () => {
  it('Basque and Spanish have exactly the same keys and the same placeholders', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(eu).sort());
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(eu)) expect(ph((es as Record<string, string>)[k] ?? ''), k).toBe(ph((eu as Record<string, string>)[k] ?? ''));
  });
  it('every diagnosis code, ask type and form field has a text', () => {
    for (const c of DIAG) expect(eu).toHaveProperty(`diag.${c}`);
    for (const [type, fields] of Object.entries(FIELDS)) {
      expect(Object.keys(eu).some((k) => k === `ask.${type}` || k.startsWith(`ask.${type}`))).toBe(true);
      for (const f of fields) expect(eu).toHaveProperty(`field.${f}`);
    }
  });
  it('fills placeholders and falls back to the key', () => {
    expect(translate('eu', 'ex.score', { ok: 2, n: 3 })).toBe('2 / 3 zuzen');
    expect(translate('es', 'ex.score', { ok: 2, n: 3 })).toBe('2 / 3 correctas');
    expect(translate('eu', 'no.such.key')).toBe('no.such.key');
  });
});
