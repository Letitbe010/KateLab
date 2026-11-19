import { type ChainJSON, allStates, chainFromJSON, chainToJSON } from '../src/core/model';
import { topology, validateChain, validateExercise } from '../src/core/validate';

const box: ChainJSON = {
  shafts: [
    { id: 'I', label: 'I' },
    { id: 'II', label: 'II' },
  ],
  elements: [
    { kind: 'gear', id: 'a', from: 'I', to: 'II', z1: 20, z2: 60, module: 2 },
    { kind: 'gear', id: 'b', from: 'I', to: 'II', z1: 30, z2: 50, module: 2 },
    { kind: 'gear', id: 'c', from: 'I', to: 'II', z1: 40, z2: 40, module: 2 },
  ],
  clusters: [{ id: 'K', label: 'K', options: ['a', 'b', 'c'] }],
  input: { shaft: 'I', n: 1200 },
};

const codes = (j: ChainJSON) => validateChain(chainFromJSON(j)).errors.map((e) => e.code);

describe('model', () => {
  it('JSON round trip keeps rationals exact', () => {
    const j: ChainJSON = { ...box, elements: [...box.elements, { kind: 'belt', id: 'u', from: 'I', to: 'II', d1: '2,5', d2: 10 }] };
    const back = chainToJSON(chainFromJSON(j));
    expect(back.elements[3]).toMatchObject({ d1: '5/2', d2: '10' });
  });
  it('enumerates cluster states', () => {
    expect(allStates(chainFromJSON(box))).toHaveLength(3);
  });
});

describe('validateChain', () => {
  it('accepts a correct 3-speed box', () => {
    const r = validateChain(chainFromJSON(box));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('rejects a cluster whose tooth sums differ', () => {
    const j = structuredClone(box);
    (j.elements[1] as { z2: number }).z2 = 51;
    expect(codes(j)).toContain('cluster.centre');
  });
  it('rejects a cluster without module whose tooth sums differ', () => {
    const j = structuredClone(box);
    for (const e of j.elements) delete (e as { module?: unknown }).module;
    (j.elements[0] as { z1: number }).z1 = 21;
    expect(codes(j)).toContain('cluster.centre');
  });
  it('accepts different modules with equal centre distance', () => {
    const j = structuredClone(box);
    j.elements = [
      { kind: 'gear', id: 'a', from: 'I', to: 'II', z1: 20, z2: 60, module: 2 },
      { kind: 'gear', id: 'b', from: 'I', to: 'II', z1: 16, z2: 24, module: 4 },
    ];
    j.clusters = [{ id: 'K', label: 'K', options: ['a', 'b'] }];
    expect(codes(j)).toEqual([]);
  });
  it('rejects options on different shaft pairs, partial modules, unknown refs', () => {
    const j1 = structuredClone(box);
    j1.shafts.push({ id: 'III', label: 'III' });
    (j1.elements[2] as { to: string }).to = 'III';
    expect(codes(j1)).toContain('cluster.shafts');
    const j2 = structuredClone(box);
    delete (j2.elements[0] as { module?: unknown }).module;
    expect(codes(j2)).toContain('cluster.module');
    const j3 = structuredClone(box);
    (j3.elements[0] as { to: string }).to = 'X';
    expect(codes(j3)).toContain('ref.shaft');
  });
  it('rejects bad numbers', () => {
    const j = structuredClone(box);
    j.clusters = [];
    j.elements = [{ kind: 'gear', id: 'a', from: 'I', to: 'II', z1: 0, z2: 20.5 }];
    expect(codes(j)).toContain('element.teeth');
    j.elements = [{ kind: 'belt', id: 'a', from: 'I', to: 'II', d1: 100, d2: 200, slip: 1 }];
    expect(codes(j)).toContain('element.slip');
    j.elements = [{ kind: 'gear', id: 'a', from: 'I', to: 'II', z1: 20, z2: 40 }];
    j.input = { shaft: 'I', n: 0 };
    expect(codes(j)).toContain('input.n');
  });
  it('rejects duplicate ids', () => {
    const j = structuredClone(box);
    (j.elements[1] as { id: string }).id = 'a';
    expect(codes(j)).toContain('id.duplicate');
  });
  it('rejects a worm driven from the wheel', () => {
    const j: ChainJSON = {
      shafts: [
        { id: 'W', label: 'W' },
        { id: 'G', label: 'G' },
      ],
      elements: [{ kind: 'worm', id: 'w', from: 'W', to: 'G', starts: 1, z: 40 }],
      input: { shaft: 'G', n: 10 },
    };
    expect(codes(j)).toContain('worm.backdriven');
  });
  it('warns about loops and disconnected shafts', () => {
    const j: ChainJSON = {
      shafts: [
        { id: 'A', label: 'A' },
        { id: 'B', label: 'B' },
        { id: 'C', label: 'C' },
      ],
      elements: [
        { kind: 'gear', id: 'g1', from: 'A', to: 'B', z1: 20, z2: 40 },
        { kind: 'chain', id: 'g2', from: 'A', to: 'B', z1: 10, z2: 20 },
      ],
      input: { shaft: 'A', n: 100 },
    };
    const r = validateChain(chainFromJSON(j));
    expect(r.ok).toBe(true);
    expect(r.warnings.map((w) => w.code).sort()).toEqual(['state.disconnected', 'state.loop']);
  });
});

describe('direction definedness', () => {
  it('stops at worms and bevels, continues through parallel elements', () => {
    const j: ChainJSON = {
      shafts: ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, label: id })),
      elements: [
        { kind: 'gear', id: 'g', from: 'A', to: 'B', z1: 20, z2: 40 },
        { kind: 'belt', id: 'u', from: 'B', to: 'C', d1: 100, d2: 200, crossed: true },
        { kind: 'worm', id: 'w', from: 'C', to: 'D', starts: 2, z: 40 },
        { kind: 'gear', id: 'h', from: 'D', to: 'E', z1: 20, z2: 20 },
      ],
      input: { shaft: 'A', n: 100 },
    };
    const t = topology(chainFromJSON(j), {});
    expect([...t.directionDefined].sort()).toEqual(['A', 'B', 'C']);
    const ex = {
      id: 'x',
      origin: 'generated' as const,
      difficulty: 1 as const,
      chain: chainFromJSON(j),
      asks: [{ type: 'direction' as const, shaft: 'E' }],
      text: { eu: '', es: '' },
    };
    expect(validateExercise(ex).errors.map((e) => e.code)).toContain('ask.direction');
    ex.asks = [{ type: 'direction', shaft: 'C' }];
    expect(validateExercise(ex).ok).toBe(true);
  });
  it('requires a state for state-dependent asks when clusters exist', () => {
    const ex = {
      id: 'x',
      origin: 'generated' as const,
      difficulty: 1 as const,
      chain: chainFromJSON(box),
      asks: [{ type: 'speed' as const, shaft: 'II' }],
      text: { eu: '', es: '' },
    };
    expect(validateExercise(ex).errors.map((e) => e.code)).toContain('ask.state');
    expect(validateExercise({ ...ex, state: { K: 'b' } }).ok).toBe(true);
    expect(validateExercise({ ...ex, asks: [{ type: 'speedMaxMin', shaft: 'II' }] }).ok).toBe(true);
  });
});
