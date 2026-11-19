/**
 * Development-only review endpoint (spec §9.3): POST /__review saves the user's
 * review decisions into the data files, so texts can be approved from the app.
 *   { kind: 'pool' | 'worked' | 'theory', id, status?, note? }
 * Only fixed files are written; ids and statuses are validated. Not part of the build.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export type ReviewKind = 'pool' | 'worked' | 'theory';
export interface ReviewRequest {
  kind: ReviewKind;
  id: string;
  status?: 'reviewed' | 'review-needed' | 'draft';
  note?: string;
}

const readJSON = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const writeJSON = (p: string, d: unknown) => writeFileSync(p, JSON.stringify(d, null, 2) + '\n');

/** Applies one review request under `root` (the project folder). Returns an error message or null. */
export function applyReview(root: string, r: ReviewRequest): string | null {
  if (!r || typeof r.id !== 'string' || !/^[\w.-]{1,80}$/.test(r.id)) return 'bad id';
  if (r.status && !['reviewed', 'review-needed', 'draft'].includes(r.status)) return 'bad status';
  if (r.note !== undefined && (typeof r.note !== 'string' || r.note.length > 5000)) return 'bad note';
  if (r.status) {
    if (r.kind === 'pool') {
      const dir = join(root, 'src/data/pool');
      let found = false;
      for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const p = join(dir, f);
        const d = readJSON(p);
        if (Array.isArray(d.exercises)) {
          const e = d.exercises.find((x: { id: string }) => x.id === r.id);
          if (e) {
            e.review = r.status;
            writeJSON(p, d);
            found = true;
          }
        } else if (d.id === r.id) {
          d.review = r.status;
          writeJSON(p, d);
          found = true;
        }
      }
      if (!found) return 'unknown exercise';
    } else if (r.kind === 'worked') {
      const p = join(root, 'src/data/worked.json');
      const d = readJSON(p);
      const w = d.worked.find((x: { id: string }) => x.id === r.id);
      if (!w) return 'unknown worked exercise';
      w.review = r.status === 'reviewed' ? 'reviewed' : 'draft';
      writeJSON(p, d);
    } else if (r.kind === 'theory') {
      const p = join(root, 'src/content/theory/status.json');
      const d = readJSON(p);
      if (!(r.id in d.status)) return 'unknown topic';
      d.status[r.id] = r.status === 'reviewed' ? 'reviewed' : 'draft';
      writeJSON(p, d);
    } else return 'bad kind';
  }
  if (r.note !== undefined && r.note.trim()) {
    const p = join(root, 'src/data/review-notes.json');
    const d = readJSON(p);
    d.notes.push({ ref: `${r.kind}:${r.id}`, text: r.note.trim(), date: new Date().toISOString().slice(0, 16) });
    writeJSON(p, d);
  }
  return null;
}

export function reviewPlugin(root: string): Plugin {
  return {
    name: 'katelab-review',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__review', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let err: string | null;
          try {
            err = applyReview(root, JSON.parse(body) as ReviewRequest);
          } catch (e) {
            err = (e as Error).message;
          }
          res.statusCode = err ? 400 : 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(err ? { error: err } : { ok: true }));
        });
      });
    },
  };
}
