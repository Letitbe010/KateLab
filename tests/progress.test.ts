/** Progress store (spec §1, §13): storage always in try/catch, JSON export/import, statistics. */
import { type Attempt, KEY, _reset, exportJSON, getProgress, importJSON, markTheory, ratesBy, recordAttempts, resetProgress, sanitize, setSettings, topMistakes } from '../src/ui/progress';

const att = (p: Partial<Attempt>): Attempt => ({ ts: 1, exercise: 'x', origin: 'generated', level: 1, ask: 'speed', status: 'correct', diagnoses: [], ...p });

function fakeStorage(fail = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (fail) throw new Error('blocked');
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (fail) throw new Error('quota');
      m.set(k, v);
    },
    removeItem: (k: string) => m.delete(k),
    map: m,
  };
}

describe('progress store', () => {
  it('works when storage throws (private mode, quota): no crash, data kept in memory', () => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage(true);
    _reset();
    expect(getProgress().attempts).toEqual([]);
    expect(() => recordAttempts([att({})])).not.toThrow();
    expect(getProgress().attempts).toHaveLength(1);
  });
  it('persists to storage and reloads', () => {
    const st = fakeStorage();
    (globalThis as { localStorage?: unknown }).localStorage = st;
    _reset();
    resetProgress();
    markTheory('erlazioa');
    setSettings({ theme: 'dark' });
    _reset(); // reload from storage
    expect(getProgress().theorySeen).toEqual(['erlazioa']);
    expect(getProgress().settings.theme).toBe('dark');
    expect(st.map.has(KEY)).toBe(true);
  });
  it('export → import round trip; garbage import is rejected without losing data', () => {
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();
    _reset();
    resetProgress();
    recordAttempts([att({ status: 'wrong', diagnoses: ['inverse-all'] })]);
    const json = exportJSON();
    resetProgress();
    expect(getProgress().attempts).toHaveLength(0);
    expect(importJSON(json)).toBe(true);
    expect(getProgress().attempts[0]!.diagnoses).toEqual(['inverse-all']);
    expect(importJSON('{not json')).toBe(false);
    expect(getProgress().attempts).toHaveLength(1);
  });
  it('sanitize drops invalid parts and keeps defaults', () => {
    const d = sanitize({ attempts: [{ foo: 1 }, att({})], theorySeen: ['a', 3], lastRoute: 'http://evil', settings: { theme: 'purple', speedUnit: 'rad/s' } });
    expect(d.attempts).toHaveLength(1);
    expect(d.theorySeen).toEqual(['a']);
    expect(d.lastRoute).toBeUndefined();
    expect(d.settings).toEqual({ theme: 'auto', showInverseRatio: false, speedUnit: 'rad/s', linearUnit: 'mm/min' });
  });
  it('statistics: rates by ask type (missing answers ignored) and most common mistakes', () => {
    const a = [att({ ask: 'speed' }), att({ ask: 'speed', status: 'wrong', diagnoses: ['inverse-all'] }), att({ ask: 'ratio', status: 'missing' }), att({ ask: 'ratio', status: 'wrong', diagnoses: ['inverse-all', 'unknown'] })];
    expect(ratesBy(a, (x) => x.ask)).toEqual([
      { key: 'speed', correct: 1, total: 2 },
      { key: 'ratio', correct: 0, total: 1 },
    ]);
    expect(topMistakes(a)).toEqual([{ code: 'inverse-all', count: 2 }]);
  });
});
