/** Human-readable names for asks, states and elements (no numbers computed here). */
import { type Lang, outputLabel, translate } from '../i18n';
import type { Ask, KinExercise, State } from '../core/model';

export function shaftName(ex: KinExercise, id: string): string {
  const s = ex.chain.shafts.find((x) => x.id === id);
  return s && s.label.length <= 4 ? s.label : id;
}

export function outputName(ex: KinExercise, lang: Lang, id: string): string {
  const l = ex.chain.linear?.find((x) => x.id === id);
  const name = outputLabel(lang, l?.label ?? id);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Gear pair name: layout names ("Z4–Z1") or tooth counts ("20/60"). */
export function elementName(ex: KinExercise, id: string): string {
  const p = ex.chain.layout?.elements[id];
  if (p?.n1 && p?.n2) return `${p.n1}–${p.n2}`;
  const e = ex.chain.elements.find((x) => x.id === id);
  if (!e) return id;
  switch (e.kind) {
    case 'gear':
    case 'bevel':
    case 'chain':
      return `${e.z1}/${e.z2}`;
    case 'belt':
      return `Ø${e.d1.n}/Ø${e.d2.n}`;
    case 'worm':
      return `${e.starts}/${e.z}`;
    case 'rack':
      return `Z = ${e.z}`;
    default:
      return id;
  }
}

export function stateText(ex: KinExercise, st: State | undefined): string {
  if (!st || !ex.chain.clusters.length) return '';
  return ex.chain.clusters.map((c) => `${c.label}: ${elementName(ex, st[c.id] ?? '')}`).join(' · ');
}

export function askLabel(ex: KinExercise, ask: Ask, lang: Lang): string {
  if (ask.label) return ask.label[lang];
  const t = (k: string, v: Record<string, string | number> = {}) => translate(lang, k, v);
  switch (ask.type) {
    case 'speed':
    case 'speedMaxMin':
    case 'speedCount':
    case 'direction':
    case 'torquePower':
      return t(`ask.${ask.type}`, { shaft: shaftName(ex, ask.shaft) });
    case 'ratio':
      return t('ask.ratio', { from: shaftName(ex, ask.from), to: shaftName(ex, ask.to) });
    case 'linearSpeed':
    case 'feedPerMin':
      return t(`ask.${ask.type}`, { output: outputName(ex, lang, ask.output) });
    case 'feedPerRev':
      return t(ask.max ? 'ask.feedPerRevMax' : 'ask.feedPerRev', { output: outputName(ex, lang, ask.output), spindle: shaftName(ex, ask.spindle) });
    case 'centerDistance': {
      const c = ask.cluster ? ex.chain.clusters.find((k) => k.id === ask.cluster) : undefined;
      const what = c ? c.label : elementName(ex, ask.element ?? '');
      return t('ask.centerDistance', { what });
    }
    case 'gearGeometry':
      return t('ask.gearGeometry', { what: elementName(ex, ask.element) });
    case 'pitchDiameter':
      return t('ask.pitchDiameter', { what: elementName(ex, ask.element) });
    case 'missingTeeth':
      return t('ask.missingTeeth');
    case 'indexing':
      return t('ask.indexing', { N: ask.N });
    case 'changeGears':
      return t('ask.changeGears');
  }
}

/** Title of an exercise for lists. */
export function exerciseTitle(ex: KinExercise & { title?: { eu: string; es: string } }, lang: Lang, archetypeTitle?: { eu: string; es: string }): string {
  if (ex.title) return ex.title[lang];
  if (archetypeTitle) return archetypeTitle[lang];
  return ex.id;
}
