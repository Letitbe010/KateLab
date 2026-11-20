/**
 * Theory content model (spec §14). Texts are templates: numbers in examples come
 * from the solver through {{…}} variables (src/core/template.ts). Formulas are
 * LaTeX (KaTeX); a formula with `check` is tested against the solver on 1000 cases.
 *
 * Deviation from the spec: content is structured TypeScript data instead of MDX,
 * so that template variables and formula checks can be tested without an MDX build.
 */
import type { ChainJSON, State } from '../../core/model';

export type FormulaId =
  | 'gear-ratio'
  | 'belt-ratio'
  | 'worm-ratio'
  | 'train-product'
  | 'pitch-diameter'
  | 'tooth-geometry'
  | 'centre-distance'
  | 'rack-speed'
  | 'screw-speed'
  | 'feed-per-rev'
  | 'omega'
  | 'torque'
  | 'power-efficiency'
  | 'indexing'
  | 'change-gears'
  | 'speed-count';

export type Bi = { eu: string; es: string };

export type Block =
  | ({ t: 'p' } & Bi)
  | { t: 'f'; tex: string; check?: FormulaId }
  | { t: 'list'; eu: string[]; es: string[] }
  | ({ t: 'example'; chain: ChainJSON; state?: State } & Bi)
  | ({ t: 'note'; kind: 'careful' | 'ope' } & Bi)
  | { t: 'widget'; w: 'gearbox' | 'gears' | 'rack' }
  | { t: 'schema'; chain: ChainJSON; state?: State }
  /** Dedicated figure (dividing head): numbers from the data, answer from the solver. */
  | { t: 'figure'; f: 'dividing-head'; K: number; N: number; plates: number[][] };

export interface Topic {
  id: string;
  title: Bi;
  status: 'draft' | 'reviewed';
  blocks: Block[];
}
