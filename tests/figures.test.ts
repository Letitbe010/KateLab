/**
 * Theory figures: every figure block of every topic renders in both languages, and
 * the numbers it prints come from the solver (same template variables as the texts).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TOPICS } from '../src/content/theory/topics';
import type { Block } from '../src/content/theory/types';
import { LangContext } from '../src/i18n';
import { TheoryFigure } from '../src/ui/theory/TheoryView';

const figures = TOPICS.flatMap((tp) => tp.blocks.filter((b): b is Extract<Block, { t: 'figure' }> => b.t === 'figure').map((b, i) => [`${tp.id}#${i} (${b.f})`, b] as const));
const render = (b: Extract<Block, { t: 'figure' }>, lang: 'eu' | 'es') => renderToStaticMarkup(createElement(LangContext.Provider, { value: lang }, createElement(TheoryFigure, { b })));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('theory figures', () => {
  it('every topic except the error list has at least one figure, schema or widget', () => {
    for (const tp of TOPICS) {
      if (tp.id === 'akatsak') continue;
      expect(
        tp.blocks.some((b) => b.t === 'figure' || b.t === 'schema' || b.t === 'widget'),
        tp.id,
      ).toBe(true);
    }
  });
  it.each(figures)('%s renders in eu and es without missing texts', (_, b) => {
    for (const lang of ['eu', 'es'] as const) {
      const html = render(b, lang);
      expect(html).toContain('<svg');
      expect(text(html)).not.toMatch(/fig\.[a-z]+\.[a-z]+/i); // no untranslated key
      expect(html).not.toContain('{{');
    }
  });
  it('the numbers in the figures are the solver values', () => {
    const find = (topic: string, f: string) => figures.find(([k]) => k.startsWith(`${topic}#`) && k.endsWith(`(${f})`))![1];
    // idler train 20 → 35 → 40 at 1000 rpm: idler 571,43 rpm, output 500 rpm
    const trains = figures.filter(([k]) => k.startsWith('trenak#') && k.endsWith('(train)')).map(([, b]) => text(render(b, 'eu')));
    expect(trains[0]).toMatch(/1440 rpm.*720 rpm.*360 rpm/); // KG1: 1440 · 20/40 · 25/50
    expect(trains[1]).toMatch(/1000 rpm.*571,43 rpm.*500 rpm/);
    expect(trains[1]).toContain('gurpil zoroa');
    // belt Ø100/Ø250 at 1500 rpm with 2 % slip: 588 rpm
    expect(text(render(find('poleak', 'belt'), 'eu'))).toMatch(/588 rpm/);
    // worm k = 1, Z = 40 at 1400 rpm: 35 rpm
    expect(text(render(find('torlojua', 'worm'), 'eu'))).toMatch(/35 rpm/);
    // tooth geometry m = 2, Z = 20: d = 40, da = 44, df = 35, h = 4,5
    const tooth = text(render(find('geometria', 'tooth'), 'eu'));
    for (const s of ['d = 40 mm', 'dₐ = 44 mm', 'd_f = 35 mm', 'h = 4,5 mm']) expect(tooth).toContain(s);
    // screw P = 5, k = 2 driven at 300 · 20/100 = 60 rpm: v = 600 mm/min
    expect(text(render(find('translazioa', 'screw'), 'eu'))).toContain('600 mm/min');
    // feed: 300 rpm spindle, table 300 mm/min (k = 1) → f = 1 mm/rev
    const feed = text(render(find('aitzinapena', 'feed'), 'eu'));
    expect(feed).toContain('300 mm/min');
    expect(feed).toMatch(/f = 1 mm/);
    // change gears for 1,5 / 6 = 1/4: the train printed has that ratio
    const lira = text(render(find('aldaketa', 'lira'), 'eu'));
    const m = lira.match(/\((\d+)·(\d+)\)\/\((\d+)·(\d+)\)/)!;
    expect((Number(m[1]) * Number(m[2])) / (Number(m[3]) * Number(m[4]))).toBe(1 / 4);
    // power 2200 W with η = 0,96: output 2112 W, losses 88 W
    const pw = text(render(find('potentzia', 'power'), 'eu'));
    expect(pw).toContain('2112 W');
    expect(pw).toContain('88 W');
  });
});
