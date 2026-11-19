/** Dev-only review endpoint (spec §9.3): writes only the expected fields of the expected files. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyReview } from '../tools/review-plugin';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'katelab-review-'));
  mkdirSync(join(root, 'src/data/pool'), { recursive: true });
  mkdirSync(join(root, 'src/content/theory'), { recursive: true });
  const w = (p: string, d: unknown) => writeFileSync(join(root, p), JSON.stringify(d));
  w('src/data/pool/one.json', { id: 'ope-x', review: 'review-needed' });
  w('src/data/pool/many.json', { exercises: [{ id: 'a', review: 'review-needed' }, { id: 'b' }] });
  w('src/data/worked.json', { worked: [{ id: 'w1', review: 'draft' }] });
  w('src/content/theory/status.json', { status: { erlazioa: 'draft' } });
  w('src/data/review-notes.json', { notes: [] });
  const r = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  return { root, r };
}

describe('review endpoint', () => {
  it('approves pool exercises (single file and list), worked exercises and theory topics', () => {
    const { root, r } = setup();
    expect(applyReview(root, { kind: 'pool', id: 'ope-x', status: 'reviewed' })).toBeNull();
    expect(applyReview(root, { kind: 'pool', id: 'b', status: 'reviewed' })).toBeNull();
    expect(applyReview(root, { kind: 'worked', id: 'w1', status: 'reviewed' })).toBeNull();
    expect(applyReview(root, { kind: 'theory', id: 'erlazioa', status: 'reviewed' })).toBeNull();
    expect(r('src/data/pool/one.json').review).toBe('reviewed');
    expect(r('src/data/pool/many.json').exercises.map((e: { review?: string }) => e.review)).toEqual(['review-needed', 'reviewed']);
    expect(r('src/data/worked.json').worked[0].review).toBe('reviewed');
    expect(r('src/content/theory/status.json').status.erlazioa).toBe('reviewed');
  });
  it('stores notes with a reference', () => {
    const { root, r } = setup();
    expect(applyReview(root, { kind: 'theory', id: 'erlazioa', note: '  "abiadura periferikoa" → "abiadura tangentziala"  ' })).toBeNull();
    const n = r('src/data/review-notes.json').notes;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ ref: 'theory:erlazioa', text: '"abiadura periferikoa" → "abiadura tangentziala"' });
  });
  it('rejects unknown ids, bad statuses and path tricks without writing anything', () => {
    const { root, r } = setup();
    expect(applyReview(root, { kind: 'pool', id: 'nope', status: 'reviewed' })).toBe('unknown exercise');
    expect(applyReview(root, { kind: 'pool', id: '../../etc', status: 'reviewed' })).toBe('bad id');
    expect(applyReview(root, { kind: 'worked', id: 'w1', status: 'hacked' as never })).toBe('bad status');
    expect(applyReview(root, { kind: 'theory', id: 'unknown', status: 'reviewed' })).toBe('unknown topic');
    expect(r('src/data/worked.json').worked[0].review).toBe('draft');
  });
});
