/**
 * fast-check generators of random kinematic chains (tree from the input shaft,
 * optional sliding clusters with constant tooth sum, optional extra loop edge).
 */
import fc from 'fast-check';
import type { ChainJSON, ElementJSON } from '../src/core/model';

const MODULES = ['1', '2', '5/2', '3'];

interface Opts {
  maxShafts?: number;
  loops?: boolean; // add a random extra edge (often inconsistent)
  consistentLoops?: boolean; // add a duplicate edge with scaled teeth (always consistent)
  efficiencies?: boolean;
  power?: boolean;
  clusters?: boolean;
}

const edgeKinds = ['gear', 'gearInt', 'belt', 'beltX', 'chain', 'worm', 'bevel', 'clutch'] as const;

const rotaryEdge = (id: string, parent: string, child: string) =>
  fc
    .record({
      kind: fc.constantFrom(...edgeKinds),
      z1: fc.integer({ min: 12, max: 90 }),
      z2: fc.integer({ min: 12, max: 90 }),
      d1: fc.integer({ min: 20, max: 400 }),
      d2: fc.integer({ min: 20, max: 400 }),
      starts: fc.integer({ min: 1, max: 4 }),
      slip: fc.constantFrom(undefined, undefined, undefined, '1/50'),
      reverse: fc.boolean(),
      m: fc.constantFrom(...MODULES),
    })
    .map((r): ElementJSON => {
      // orientation of from/to is random except for worms (always driven from the worm)
      const [from, to] = r.reverse && r.kind !== 'worm' ? [child, parent] : [parent, child];
      const [z1, z2] = r.z1 === r.z2 && r.kind === 'gearInt' ? [r.z1, r.z2 + 7] : [r.z1, r.z2];
      switch (r.kind) {
        case 'gear':
          return { kind: 'gear', id, from, to, z1, z2, module: r.m };
        case 'gearInt':
          return { kind: 'gear', id, from, to, z1, z2, internal: true };
        case 'belt':
          return { kind: 'belt', id, from, to, d1: r.d1, d2: r.d2, ...(r.slip ? { slip: r.slip } : {}) };
        case 'beltX':
          return { kind: 'belt', id, from, to, d1: r.d1, d2: r.d2, crossed: true };
        case 'chain':
          return { kind: 'chain', id, from, to, z1, z2 };
        case 'worm':
          return { kind: 'worm', id, from, to, starts: r.starts, z: Math.max(z2, 20) };
        case 'bevel':
          return { kind: 'bevel', id, from, to, z1, z2 };
        case 'clutch':
          return { kind: 'clutch', id, from, to };
      }
    });

export function chainArb(o: Opts = {}): fc.Arbitrary<ChainJSON> {
  const maxS = o.maxShafts ?? 6;
  return fc
    .record({
      nShafts: fc.integer({ min: 2, max: maxS }),
      parents: fc.array(fc.nat(), { minLength: maxS, maxLength: maxS }),
      nIn: fc.integer({ min: 1, max: 3000 }),
      nInDen: fc.constantFrom(1, 1, 1, 3, 7),
      seedEdges: fc.array(fc.nat(), { minLength: maxS, maxLength: maxS }),
    })
    .chain((base) => {
      const shafts = Array.from({ length: base.nShafts }, (_, i) => ({ id: `S${i}`, label: `S${i}` }));
      const edgeArbs = shafts.slice(1).map((s, k) => {
        const i = k + 1;
        const parent = `S${(base.parents[i] as number) % i}`;
        return rotaryEdge(`e${i}`, parent, s.id);
      });
      return fc.record({
        edges: fc.tuple(...edgeArbs),
        clusterAt: o.clusters ? fc.option(fc.integer({ min: 1, max: base.nShafts - 1 })) : fc.constant(null),
        clusterSum: fc.constantFrom(60, 64, 70, 72, 80, 84, 90, 96),
        clusterTeeth: fc.uniqueArray(fc.integer({ min: 17, max: 43 }), { minLength: 2, maxLength: 3 }),
        cluster2At: o.clusters ? fc.option(fc.integer({ min: 1, max: base.nShafts - 1 })) : fc.constant(null),
        linear: fc.array(
          fc.record({ at: fc.nat(), rack: fc.boolean(), z: fc.integer({ min: 12, max: 60 }), m: fc.constantFrom(...MODULES), p: fc.constantFrom('1', '5/2', '4', '5', '6'), k: fc.integer({ min: 1, max: 3 }) }),
          { maxLength: 2 },
        ),
        extra: o.loops ? fc.option(rotaryEdge('x1', 'S0', `S${base.nShafts - 1}`)) : fc.constant(null),
        dupScale: o.consistentLoops ? fc.option(fc.record({ at: fc.nat(), k: fc.integer({ min: 2, max: 3 }) })) : fc.constant(null),
        etas: o.efficiencies ? fc.array(fc.constantFrom('1', '19/20', '9/10', '49/50', '1/2'), { minLength: maxS, maxLength: maxS }) : fc.constant([] as string[]),
        power: o.power ? fc.integer({ min: 100, max: 20000 }) : fc.constant(null),
        dirIn: fc.constantFrom(undefined, 'cw', 'ccw'),
      }).map((r): ChainJSON => {
        const elements: ElementJSON[] = [...r.edges];
        const clusters: ChainJSON['clusters'] = [];
        const addCluster = (at: number, cid: string) => {
          const idx = elements.findIndex((x) => x.id === `e${at}`);
          const e = elements[idx];
          if (!e || !('to' in e) || e.kind === 'worm') return;
          // replace edge by a cluster of spur gears with constant tooth sum
          const S = r.clusterSum;
          const opts: ElementJSON[] = r.clusterTeeth.map((z1, j) => ({ kind: 'gear', id: `${e.id}_o${j}`, from: e.from, to: e.to, z1, z2: S - z1, module: '2' }));
          elements.splice(idx, 1, ...opts);
          clusters.push({ id: cid, label: cid, options: opts.map((x) => x.id) });
        };
        if (r.clusterAt) addCluster(r.clusterAt, 'K1');
        if (r.cluster2At && r.cluster2At !== r.clusterAt) addCluster(r.cluster2At, 'K2');
        const linear = r.linear.map((_l, j) => ({ id: `L${j}`, label: `L${j}` }));
        r.linear.forEach((l, j) => {
          const from = `S${l.at % base.nShafts}`;
          elements.push(
            l.rack
              ? { kind: 'rack', id: `r${j}`, from, output: `L${j}`, z: l.z, module: l.m }
              : { kind: 'screw', id: `r${j}`, from, output: `L${j}`, pitch: l.p, starts: l.k },
          );
        });
        if (r.extra && r.extra.kind !== 'worm') elements.push(r.extra);
        if (r.dupScale) {
          const plain = elements.filter((e) => (e.kind === 'gear' || e.kind === 'chain') && !clusters.some((c) => c.options.includes(e.id)));
          const e = plain[r.dupScale.at % Math.max(plain.length, 1)];
          if (e && (e.kind === 'gear' || e.kind === 'chain'))
            elements.push({ ...e, id: `${e.id}_dup`, z1: e.z1 * r.dupScale.k, z2: e.z2 * r.dupScale.k } as ElementJSON);
        }
        const efficiency: Record<string, string> = {};
        elements.forEach((e, j) => {
          const eta = r.etas[j % Math.max(r.etas.length, 1)];
          if (eta && eta !== '1') efficiency[e.id] = eta;
        });
        return {
          shafts,
          linear,
          elements,
          clusters,
          input: {
            shaft: 'S0',
            n: `${base.nIn}/${base.nInDen}`,
            ...(r.dirIn ? { direction: r.dirIn as 'cw' | 'ccw' } : {}),
            ...(r.power ? { power: String(r.power) } : {}),
          },
          ...(Object.keys(efficiency).length ? { efficiency } : {}),
        };
      });
    });
}
