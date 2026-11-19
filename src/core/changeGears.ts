/**
 * Change gears for thread cutting on a lathe (spec §3, §8.2, §10.4).
 *   i = P_thread / P_leadscrew   (spindle : lead screw = 1:1 assumed)
 *   simple train   : Za/Zb = i              (an idler may sit between them)
 *   compound train : (Za·Zc)/(Zb·Zd) = i    (Za, Zc drivers; Zb, Zd driven)
 * A gear may be used only as many times as it appears in the set.
 *
 * Mounting condition (optional, level 3): Za + Zb > Zc + C and Zc + Zd > Zb + C,
 * with C = 15 (confirmed by the user on 2026-11-19).
 */
import { type Rational, div, eq, mul, q } from './rational';

/** Default change-gear set (each gear once), confirmed by the user on 2026-11-19. */
export const DEFAULT_GEARSET = [20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 127];

export interface Train2 {
  za: number;
  zb: number;
}
export interface Train4 {
  za: number;
  zb: number;
  zc: number;
  zd: number;
}

export interface ChangeGearOptions {
  mountingCondition?: boolean;
  clearance?: number; // C in the mounting condition (default 15)
}

export const requiredRatio = (threadPitch: Rational, leadScrewPitch: Rational): Rational => div(threadPitch, leadScrewPitch);

function counts(set: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const z of set) m.set(z, (m.get(z) ?? 0) + 1);
  return m;
}

function fitsSet(gears: number[], set: number[]): boolean {
  const avail = counts(set);
  for (const z of gears) {
    const c = avail.get(z) ?? 0;
    if (c === 0) return false;
    avail.set(z, c - 1);
  }
  return true;
}

export function mountingOk(t: Train4, clearance = 15): boolean {
  return t.za + t.zb > t.zc + clearance && t.zc + t.zd > t.zb + clearance;
}

export function simpleTrains(i: Rational, set: number[]): Train2[] {
  const u = [...new Set(set)].sort((a, b) => a - b);
  const out: Train2[] = [];
  for (const za of u) for (const zb of u) if (eq(q(za, zb), i) && fitsSet([za, zb], set)) out.push({ za, zb });
  return out;
}

const memo = new Map<string, Train4[]>();

export function compoundTrains(i: Rational, set: number[], opt: ChangeGearOptions = {}): Train4[] {
  const key = `${i.n}/${i.d}|${[...set].sort((a, b) => a - b).join(',')}|${opt.mountingCondition ? 1 : 0}|${opt.clearance ?? 15}`;
  const hit = memo.get(key);
  if (hit) return hit.map((t) => ({ ...t }));
  const u = [...new Set(set)].sort((a, b) => a - b);
  const out: Train4[] = [];
  // exact integer test za·zc·den = zb·zd·num (all products far below 2^53)
  const num = Number(i.n);
  const den = Number(i.d);
  const exact = Number.isSafeInteger(num) && Number.isSafeInteger(den) && u.every((z) => Number.isSafeInteger(z) && z < 10_000);
  for (const za of u)
    for (const zb of u)
      for (const zc of u)
        for (const zd of u) {
          if (exact ? za * zc * den !== zb * zd * num : !eq(mul(q(za, zb), q(zc, zd)), i)) continue;
          if (!fitsSet([za, zb, zc, zd], set)) continue;
          const t = { za, zb, zc, zd };
          if (opt.mountingCondition && !mountingOk(t, opt.clearance)) continue;
          out.push(t);
        }
  memo.set(key, out);
  return out.map((t) => ({ ...t }));
}

export type ChangeGearReason = 'ratio-mismatch' | 'gear-not-in-set' | 'gear-reused' | 'mounting-condition' | 'bad-input';

export function checkCompound(i: Rational, set: number[], t: Train4, opt: ChangeGearOptions = {}): { valid: boolean; reasons: ChangeGearReason[] } {
  const g = [t.za, t.zb, t.zc, t.zd];
  if (!g.every((z) => Number.isSafeInteger(z) && z > 0)) return { valid: false, reasons: ['bad-input'] };
  const reasons: ChangeGearReason[] = [];
  if (!eq(mul(q(t.za, t.zb), q(t.zc, t.zd)), i)) reasons.push('ratio-mismatch');
  if (g.some((z) => !set.includes(z))) reasons.push('gear-not-in-set');
  else if (!fitsSet(g, set)) reasons.push('gear-reused');
  if (opt.mountingCondition && !mountingOk(t, opt.clearance)) reasons.push('mounting-condition');
  return { valid: reasons.length === 0, reasons };
}

export function checkSimple(i: Rational, set: number[], t: Train2): { valid: boolean; reasons: ChangeGearReason[] } {
  const g = [t.za, t.zb];
  if (!g.every((z) => Number.isSafeInteger(z) && z > 0)) return { valid: false, reasons: ['bad-input'] };
  const reasons: ChangeGearReason[] = [];
  if (!eq(q(t.za, t.zb), i)) reasons.push('ratio-mismatch');
  if (g.some((z) => !set.includes(z))) reasons.push('gear-not-in-set');
  else if (!fitsSet(g, set)) reasons.push('gear-reused');
  return { valid: reasons.length === 0, reasons };
}
