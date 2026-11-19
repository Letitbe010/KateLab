/**
 * Progress, history and settings, stored in localStorage (spec §1: always inside
 * try/catch; export and import as JSON). The app works without storage.
 */
import { useSyncExternalStore } from 'react';

export interface Attempt {
  ts: number;
  exercise: string; // exercise id
  archetype?: string;
  origin: string;
  level: number;
  ask: string; // ask type
  status: 'correct' | 'wrong' | 'missing' | 'invalid';
  diagnoses: string[];
}

export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  /** Show the inverse ratio too (some books use n_in / n_out). */
  showInverseRatio: boolean;
  speedUnit: 'rpm' | 'rad/s';
  linearUnit: 'mm/min' | 'm/s';
}

export interface ProgressData {
  version: 1;
  attempts: Attempt[];
  theorySeen: string[];
  workedDone: string[];
  lastRoute?: string;
  introSeen: boolean;
  settings: Settings;
}

export const KEY = 'katelab.progress.v1';
export const MAX_ATTEMPTS = 2000;
export const DEFAULT_SETTINGS: Settings = { theme: 'auto', showInverseRatio: false, speedUnit: 'rpm', linearUnit: 'mm/min' };
const empty = (): ProgressData => ({ version: 1, attempts: [], theorySeen: [], workedDone: [], introSeen: false, settings: { ...DEFAULT_SETTINGS } });

/** Accepts unknown JSON and returns valid progress data (invalid parts dropped). */
export function sanitize(x: unknown): ProgressData {
  const d = empty();
  if (!x || typeof x !== 'object') return d;
  const o = x as Record<string, unknown>;
  if (Array.isArray(o.attempts))
    d.attempts = o.attempts
      .filter((a): a is Attempt => !!a && typeof a === 'object' && typeof (a as Attempt).exercise === 'string' && typeof (a as Attempt).ask === 'string' && typeof (a as Attempt).status === 'string')
      .map((a) => ({ ...a, diagnoses: Array.isArray(a.diagnoses) ? a.diagnoses.filter((s) => typeof s === 'string') : [] }))
      .slice(-MAX_ATTEMPTS);
  if (Array.isArray(o.theorySeen)) d.theorySeen = o.theorySeen.filter((s): s is string => typeof s === 'string');
  if (Array.isArray(o.workedDone)) d.workedDone = o.workedDone.filter((s): s is string => typeof s === 'string');
  if (typeof o.lastRoute === 'string' && o.lastRoute.startsWith('#/')) d.lastRoute = o.lastRoute;
  d.introSeen = o.introSeen === true;
  const s = (o.settings ?? {}) as Partial<Settings>;
  d.settings = {
    theme: s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto',
    showInverseRatio: s.showInverseRatio === true,
    speedUnit: s.speedUnit === 'rad/s' ? 'rad/s' : 'rpm',
    linearUnit: s.linearUnit === 'm/s' ? 'm/s' : 'mm/min',
  };
  return d;
}

// ---------------- store ----------------
let data: ProgressData = load();
const listeners = new Set<() => void>();

function load(): ProgressData {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : empty();
  } catch {
    return empty();
  }
}
function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: progress kept for this visit only */
  }
  listeners.forEach((l) => l());
}

export const getProgress = (): ProgressData => data;
export function update(f: (d: ProgressData) => ProgressData) {
  data = f(data);
  save();
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const useProgress = (): ProgressData => useSyncExternalStore(subscribe, getProgress, getProgress);

export const recordAttempts = (as: Attempt[]) => update((d) => ({ ...d, attempts: [...d.attempts, ...as].slice(-MAX_ATTEMPTS) }));
export const markTheory = (id: string) => {
  if (!data.theorySeen.includes(id)) update((d) => ({ ...d, theorySeen: [...d.theorySeen, id] }));
};
export const markWorked = (id: string) => {
  if (!data.workedDone.includes(id)) update((d) => ({ ...d, workedDone: [...d.workedDone, id] }));
};
export const setLastRoute = (r: string) => {
  if (data.lastRoute !== r) update((d) => ({ ...d, lastRoute: r }));
};
export const setIntroSeen = () => update((d) => ({ ...d, introSeen: true }));
export const setSettings = (s: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...s } }));
export const resetProgress = () => update((d) => ({ ...empty(), settings: d.settings, introSeen: true }));

export const exportJSON = (): string => JSON.stringify(data, null, 2);
export function importJSON(text: string): boolean {
  try {
    data = sanitize(JSON.parse(text));
    save();
    return true;
  } catch {
    return false;
  }
}

// ---------------- statistics ----------------
export interface Rate {
  key: string;
  correct: number;
  total: number;
}
export function ratesBy(attempts: Attempt[], key: (a: Attempt) => string | undefined): Rate[] {
  const m = new Map<string, Rate>();
  for (const a of attempts) {
    if (a.status === 'missing') continue;
    const k = key(a);
    if (!k) continue;
    const r = m.get(k) ?? { key: k, correct: 0, total: 0 };
    r.total += 1;
    if (a.status === 'correct') r.correct += 1;
    m.set(k, r);
  }
  return [...m.values()].sort((x, y) => y.total - x.total);
}
export function topMistakes(attempts: Attempt[], n = 5): { code: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of attempts) for (const c of a.diagnoses) if (c !== 'unknown') m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((x, y) => y.count - x.count)
    .slice(0, n);
}

/** For tests: replace the in-memory data (and storage). */
export function _reset(d?: ProgressData) {
  data = d ?? load();
  listeners.forEach((l) => l());
}
