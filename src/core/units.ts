/**
 * Output-layer unit conversions. Internally: mm, min, rpm, mm/min, W.
 * All conversions are exact (π kept symbolic).
 */
import { type PiRational, type Rational, div, pr, prScale, q } from './rational';

/** ω [rad/s] = 2π·n/60 = (n/30)·π */
export const rpmToRadPerS = (n: Rational): PiRational => pr(div(n, q(30)), 1);

/** n [rpm] = 30·ω/π */
export const radPerSToRpm = (w: PiRational): PiRational => prScale(pr(w.coef, w.piPower - 1), q(30));

/** v [m/s] = v [mm/min] / 60000 */
export const mmPerMinToMPerS = (v: PiRational): PiRational => prScale(v, q(1, 60000));

/** v [mm/min] = v [m/s] · 60000 */
export const mPerSToMmPerMin = (v: PiRational): PiRational => prScale(v, q(60000));

export const mmToM = (x: PiRational): PiRational => prScale(x, q(1, 1000));
export const wToKw = (p: Rational): Rational => div(p, q(1000));
