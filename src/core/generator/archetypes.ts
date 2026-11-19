/**
 * Machine archetypes (spec §10.2). Each builder draws "nice" data from the rng
 * and returns a candidate exercise; the filters (§10.3) decide whether it is kept.
 * Statements give data, never results; results always come from the solvers.
 */
import plates from '../../data/plates.json';
import fresaPool from '../../data/pool/ope-euskadi-2020.json';
import { DEFAULT_GEARSET, compoundTrains, requiredRatio } from '../changeGears';
import { indexingSolutions } from '../indexing';
import type { SchemaLayout } from '../layout';
import { type Ask, type ChainJSON, type KinExercise, type State, chainFromJSON } from '../model';
import { parse } from '../rational';
import { ChainBuilder, MODULES, MOTOR_RPM, NICE, REDUCING, SUMS, pulleysFor, teethFor, teethWithSum } from './build';
import type { Rng } from './rng';

export type Candidate = Omit<KinExercise, 'id' | 'origin'>;
export interface Archetype {
  id: string;
  level: 1 | 2 | 3;
  title: { eu: string; es: string };
  build(rng: Rng): Candidate | null;
}

const dec = (s: string | number) => String(s).replace('.', ',');
const exOf = (chain: ChainJSON, asks: Ask[], difficulty: 1 | 2 | 3, text: { eu: string; es: string }, extra: Partial<Candidate> = {}): Candidate => ({
  chain: chainFromJSON(chain),
  asks,
  difficulty,
  text,
  ...extra,
});

/** Random state of every cluster. */
const randomState = (rng: Rng, chain: ChainJSON): State => Object.fromEntries((chain.clusters ?? []).map((c) => [c.id, rng.pick(c.options)]));

/** Options of a sliding cluster with sum S: k distinct nice ratios. */
function clusterTeeth(rng: Rng, S: number, k: number, pool: readonly [number, number][] = NICE): [number, number][] | null {
  const pairs = rng
    .shuffle(pool)
    .map(([p, q_]) => teethWithSum(p, q_, S))
    .filter((x): x is [number, number] => !!x);
  const uniq = pairs.filter((p, i) => pairs.findIndex((x) => x[0] === p[0]) === i);
  return uniq.length >= k ? uniq.slice(0, k) : null;
}

// ---------------------------------------------------------------------------
// 1. Simple train (level 1)
// ---------------------------------------------------------------------------
const simpleTrain: Archetype = {
  id: 'tren-sinplea',
  level: 1,
  title: { eu: 'Tren sinplea', es: 'Tren simple' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick(MOTOR_RPM);
    const stages = rng.int(2, 3);
    let cur = b.shaft();
    const first = cur;
    let usedBelt = false;
    let idler = false;
    for (let i = 0; i < stages; i++) {
      const [p, q_] = rng.pick(REDUCING);
      const next = b.shaft();
      if (i === 0 && rng.chance(0.3)) {
        const d = pulleysFor(rng, p, q_);
        if (!d) return null;
        b.belt(cur, next, d[0], d[1]);
        usedBelt = true;
      } else if (!idler && rng.chance(0.3)) {
        // idler between cur and next: cur → T → next
        const z = teethFor(rng, p, q_);
        if (!z) return null;
        const zi = rng.int(18, 50);
        const t = next;
        const after = b.shaft();
        b.gear(cur, t, z[0], zi);
        b.gear(t, after, zi, z[1]);
        idler = true;
        cur = after;
        continue;
      } else {
        const z = teethFor(rng, p, q_);
        if (!z) return null;
        b.gear(cur, next, z[0], z[1]);
      }
      cur = next;
    }
    const chain = b.build({ shaft: first, n, direction: 'cw' });
    const parts = { eu: usedBelt ? 'uhal baten eta engranajeen' : 'engranajeen', es: usedBelt ? 'una correa y engranajes' : 'engranajes' };
    return exOf(
      chain,
      [
        { type: 'speed', shaft: cur },
        { type: 'ratio', from: first, to: cur },
        { type: 'direction', shaft: cur },
      ],
      1,
      {
        eu: `Motor batek ${first} ardatza ${n} rpm-tan biratzen du, erlojuaren orratzen noranzkoan (motorraren aldetik begiratuta). Higidura ${parts.eu} bidez transmititzen da ${cur} ardatzeraino${idler ? '; tartean gurpil tartekari bat dago' : ''}. ${usedBelt ? 'Hortz kopuruak eta poleen diametroak (mm) eskeman daude.' : 'Hortz kopuruak eskeman daude.'}`,
        es: `Un motor hace girar el eje ${first} a ${n} rpm en sentido horario (mirando desde el motor). El movimiento se transmite hasta el eje ${cur} mediante ${parts.es}${idler ? '; entre ellos hay una rueda intermedia' : ''}. ${usedBelt ? 'Los números de dientes y los diámetros de las poleas (mm) figuran en el esquema.' : 'Los números de dientes figuran en el esquema.'}`,
      },
    );
  },
};

// ---------------------------------------------------------------------------
// 2. Worm + train (level 1)
// ---------------------------------------------------------------------------
const wormTrain: Archetype = {
  id: 'torloju-amaigabea',
  level: 1,
  title: { eu: 'Torloju amaigabea + trena', es: 'Tornillo sinfín + tren' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick(MOTOR_RPM);
    const I = b.shaft();
    const II = b.shaft();
    const III = b.shaft();
    const k = rng.pick([1, 1, 2, 3]);
    const Z = rng.pick([20, 24, 25, 30, 32, 36, 40, 45, 48, 50, 60]);
    b.worm(I, II, k, Z);
    const [p, q_] = rng.pick(NICE);
    if (rng.chance(0.5)) {
      const d = pulleysFor(rng, p, q_);
      if (!d) return null;
      b.belt(II, III, d[0], d[1]);
    } else {
      const z = teethFor(rng, p, q_);
      if (!z) return null;
      b.gear(II, III, z[0], z[1]);
    }
    const chain = b.build({ shaft: I, n });
    return exOf(
      chain,
      [
        { type: 'speed', shaft: III },
        { type: 'ratio', from: I, to: III },
      ],
      1,
      {
        eu: `Motorrak ${n} rpm-tan biratzen du I ardatza, eta ardatz horretan ${k} sarrerako torloju amaigabe bat dago. Torlojuak ${Z} hortzeko gurpil helikoidala eragiten du (II ardatza), eta handik III ardatzera transmititzen da higidura.`,
        es: `El motor hace girar el eje I a ${n} rpm; en él hay un tornillo sinfín de ${k} ${k === 1 ? 'entrada' : 'entradas'}. El tornillo arrastra una corona de ${Z} dientes (eje II), y desde ahí el movimiento pasa al eje III.`,
      },
    );
  },
};

// ---------------------------------------------------------------------------
// 3. Feed system with pinion and rack (Madrid 2025 style, level 1–2)
// ---------------------------------------------------------------------------
const rackFeed: Archetype = {
  id: 'elikadura-kremailera',
  level: 2,
  title: { eu: 'Elikadura-sistema (pinoi-kremailera)', es: 'Sistema de alimentación (piñón-cremallera)' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick([...MOTOR_RPM, 720, 480, 360]);
    const I = b.shaft();
    const II = b.shaft();
    const III = b.shaft();
    for (const [f, t] of [
      [I, II],
      [II, III],
    ] as const) {
      const [p, q_] = rng.pick(REDUCING);
      const z = teethFor(rng, p, q_);
      if (!z) return null;
      b.gear(f, t, z[0], z[1]);
    }
    const out = b.out('R', 'kremailera');
    const zp = rng.pick([17, 18, 20, 24, 25, 30, 36, 40]);
    const m = rng.pick(['1', '1,5', '2', '2,5', '3']);
    b.rack(III, out, zp, m);
    const chain = b.build({ shaft: I, n });
    return exOf(
      chain,
      [
        { type: 'speed', shaft: III },
        { type: 'linearSpeed', output: out, unit: 'm/s' },
      ],
      2,
      {
        eu: `Prentsa baten elikadura-sisteman, I ardatza ${n} rpm-tan biratzen da. Lau gurpileko tren baten bidez III ardatzera transmititzen da higidura; ardatz horretan ${zp} hortzeko eta m = ${m} mm moduluko pinoi bat dago, kremailera bat mugitzen duena.`,
        es: `En el sistema de alimentación de una prensa, el eje I gira a ${n} rpm. Mediante un tren de cuatro ruedas el movimiento llega al eje III, donde un piñón de ${zp} dientes y módulo m = ${m} mm mueve una cremallera.`,
      },
    );
  },
};

// ---------------------------------------------------------------------------
// 4. Table + lead screw (level 2)
// ---------------------------------------------------------------------------
const tableScrew: Archetype = {
  id: 'mahaia-torlojua',
  level: 2,
  title: { eu: 'Mahaia + aitzinapen-torlojua', es: 'Mesa + husillo de avance' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick([100, 120, 150, 200, 240, 250, 300, 400, 500, 600, 750, 800, 1000]);
    const I = b.shaft();
    const II = b.shaft();
    const III = b.shaft();
    for (const [f, t] of [
      [I, II],
      [II, III],
    ] as const) {
      const [p, q_] = rng.pick(REDUCING);
      const z = teethFor(rng, p, q_);
      if (!z) return null;
      b.gear(f, t, z[0], z[1]);
    }
    const out = b.out('T', 'mahaia');
    const P = rng.pick(['4', '5', '6', '8', '10']);
    const k = rng.pick([1, 1, 2]);
    b.screw(III, out, P, k);
    const chain = b.build({ shaft: I, n });
    return exOf(
      chain,
      [
        { type: 'speed', shaft: III },
        { type: 'feedPerMin', output: out },
        { type: 'feedPerRev', output: out, spindle: I },
      ],
      2,
      {
        eu: `I ardatza (ardatz nagusia) ${n} rpm-tan biratzen da. Bi engranaje-pareren bidez, III ardatzeko aitzinapen-torlojua eragiten du; torlojuaren pausoa P = ${dec(P)} mm da, eta ${k} sarrera ditu. Torlojuak mahaia mugitzen du.`,
        es: `El eje I (eje principal) gira a ${n} rpm. A través de dos pares de engranajes acciona el husillo de avance del eje III, de paso P = ${dec(P)} mm y ${k} ${k === 1 ? 'entrada' : 'entradas'}. El husillo desplaza la mesa.`,
      },
    );
  },
};

// ---------------------------------------------------------------------------
// 5. Gearbox with one sliding cluster (level 2)
// ---------------------------------------------------------------------------
const gearbox1: Archetype = {
  id: 'abiadura-kaxa',
  level: 2,
  title: { eu: 'Abiadura-kaxa (multzo bat)', es: 'Caja de velocidades (un tren)' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick(MOTOR_RPM);
    const withBelt = rng.chance(0.5);
    const M = withBelt ? b.shaft('M') : null;
    const I = b.shaft();
    const II = b.shaft();
    if (M) {
      const d = pulleysFor(rng, ...rng.pick(REDUCING));
      if (!d) return null;
      b.belt(M, I, d[0], d[1]);
    }
    const S = rng.pick(SUMS);
    const m = rng.pick(MODULES);
    const k = rng.int(2, 3);
    const pairs = clusterTeeth(rng, S, k);
    if (!pairs) return null;
    const opts = pairs.map(([z1, z2]) => b.gear(I, II, z1, z2, m));
    const cid = b.cluster('A', opts);
    const chain = b.build({ shaft: M ?? I, n });
    const st = randomState(rng, chain);
    return exOf(
      chain,
      [
        { type: 'speedMaxMin', shaft: II },
        { type: 'speedCount', shaft: II },
        { type: 'centerDistance', cluster: cid },
        { type: 'speed', shaft: II, state: st },
      ],
      2,
      {
        eu: `Abiadura-kaxa honetan, ${M ? `motorrak (${n} rpm) uhal baten bidez I ardatza eragiten du` : `I ardatza ${n} rpm-tan biratzen da`}. I eta II ardatzen artean ${k} posizioko gurpil-multzo labainkor bat dago; gurpil guztien modulua m = ${dec(m)} mm da.`,
        es: `En esta caja de velocidades, ${M ? `el motor (${n} rpm) acciona el eje I mediante una correa` : `el eje I gira a ${n} rpm`}. Entre los ejes I y II hay un tren desplazable de ${k} posiciones; todas las ruedas tienen módulo m = ${dec(m)} mm.`,
      },
      { state: st },
    );
  },
};

// ---------------------------------------------------------------------------
// 6. Lathe headstock: pulley + 2 clusters (3 × 2 = 6 speeds, level 3)
// ---------------------------------------------------------------------------
const headstock: Archetype = {
  id: 'tornu-buru-kaxa',
  level: 3,
  title: { eu: 'Tornuaren buru-kaxa', es: 'Cabezal del torno' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick(MOTOR_RPM);
    const M = b.shaft('M');
    const I = b.shaft();
    const II = b.shaft();
    const III = b.shaft();
    const d = pulleysFor(rng, ...rng.pick(REDUCING));
    if (!d) return null;
    b.belt(M, I, d[0], d[1]);
    const SA = rng.pick(SUMS);
    const SB = rng.pick(SUMS);
    const m = rng.pick(MODULES);
    const pa = clusterTeeth(rng, SA, 3);
    const pb = clusterTeeth(rng, SB, 2);
    if (!pa || !pb) return null;
    const a = b.cluster('A', pa.map(([z1, z2]) => b.gear(I, II, z1, z2, m)));
    b.cluster('B', pb.map(([z1, z2]) => b.gear(II, III, z1, z2)));
    const chain = b.build({ shaft: M, n });
    const st = randomState(rng, chain);
    return exOf(
      chain,
      [
        { type: 'speedCount', shaft: III },
        { type: 'speedMaxMin', shaft: III },
        { type: 'speed', shaft: III, state: st },
        { type: 'centerDistance', cluster: a },
      ],
      3,
      {
        eu: `Tornu baten buru-kaxan, motorrak (${n} rpm) uhal baten bidez I ardatza eragiten du. A multzoak (I–II, hiru posizio) eta B multzoak (II–III, bi posizio) ardatz nagusiaren (III) abiadurak ematen dituzte. A multzoko gurpilen modulua m = ${dec(m)} mm da.`,
        es: `En el cabezal de un torno, el motor (${n} rpm) acciona el eje I mediante una correa. El tren A (I–II, tres posiciones) y el tren B (II–III, dos posiciones) dan las velocidades del eje principal (III). Las ruedas del tren A tienen módulo m = ${dec(m)} mm.`,
      },
      { state: st },
    );
  },
};

// ---------------------------------------------------------------------------
// 7. Milling machine (Euskadi 2020 style, level 3): same topology and layout
// ---------------------------------------------------------------------------
const FRESA = fresaPool.chain as unknown as ChainJSON & { layout: SchemaLayout };
const milling: Archetype = {
  id: 'fresagailua',
  level: 3,
  title: { eu: 'Fresagailua (Euskadi 2020 estiloa)', es: 'Fresadora (estilo Euskadi 2020)' },
  build(rng) {
    const j = structuredClone(FRESA) as ChainJSON & { layout: SchemaLayout };
    const n = rng.pick(MOTOR_RPM);
    j.input.n = String(n);
    const set = (id: string, patch: Record<string, unknown>) => {
      const e = j.elements.find((x) => x.id === id);
      if (!e) throw new Error(id);
      Object.assign(e, patch);
    };
    const d = pulleysFor(rng, ...rng.pick(REDUCING));
    if (!d) return null;
    set('bM', { d1: String(d[0]), d2: String(d[1]) });
    const SA = rng.pick([60, 64, 70, 72, 80]);
    const SB = rng.pick([60, 64, 70, 72]);
    const SC = rng.pick([60, 64, 70, 72]);
    const mB = rng.pick(['2', '2,5', '3']);
    const pa = clusterTeeth(rng, SA, 3);
    const pb = clusterTeeth(rng, SB, 2);
    const pc = clusterTeeth(rng, SC, 3);
    if (!pa || !pb || !pc) return null;
    pa.forEach(([z1, z2], i) => set(`A${i}`, { z1, z2 }));
    pb.forEach(([z1, z2], i) => set(`B${i}`, { z1, z2, module: mB }));
    pc.forEach(([z1, z2], i) => set(`C${i}`, { z1, z2 }));
    const k19 = rng.pick([1, 1, 2]);
    const z19 = rng.pick([20, 25, 30, 40, 50]);
    set('w19', { starts: k19, z: z19 });
    const g20 = teethFor(rng, ...rng.pick(NICE), 20, 40);
    if (!g20) return null;
    set('g2021', { z1: g20[0], z2: g20[1] });
    const g24 = teethFor(rng, ...rng.pick([[1, 1], [2, 3], [3, 4], [4, 5], [1, 2]] as [number, number][]), 18, 40);
    if (!g24) return null;
    set('b2425', { z1: g24[0], z2: g24[1] });
    const P1 = rng.pick(['4', '5', '6']);
    const P2 = rng.pick(['4', '5', '6']);
    set('sc1', { pitch: P1 });
    set('sc2', { pitch: P2 });
    // layout: radii follow the new tooth counts, gaps between shafts stay
    const L = j.layout;
    const gap = (a: string, b2: string) => Math.abs((L.shafts[a]?.c ?? 0) - (L.shafts[b2]?.c ?? 0));
    for (const e of j.elements) {
      const p = L.elements[e.id];
      if (!p || e.kind !== 'gear') continue;
      const g = gap(e.from, e.to);
      p.r1 = (g * e.z1) / (e.z1 + e.z2);
      p.r2 = (g * e.z2) / (e.z1 + e.z2);
    }
    const stA = randomState(rng, j);
    const stC = randomState(rng, j);
    return exOf(
      j,
      [
        { type: 'speed', shaft: 'III', state: stA },
        { type: 'feedPerRev', output: 'TABLE', spindle: 'III', max: true },
        { type: 'feedPerMin', output: 'CROSS', state: stC },
        { type: 'centerDistance', cluster: 'B' },
      ],
      3,
      {
        eu: `Fresagailu baten motorrak ${n} rpm-tan biratzen du, eta Ø${d[0]}/Ø${d[1]} uhalaren bidez I ardatza eragiten du. Abiadura-kaxak hiru gurpil-multzo labainkor ditu (Z1/Z2/Z3, Z15/Z16 eta Z7/Z8/Z9). Aitzinapen-katea IV ardatzetik abiatzen da: ${k19} sarrerako torloju amaigabea eta ${z19} hortzeko gurpila (Z19). Zeharkako gurdiaren torlojuaren pausoa ${dec(P1)} mm da, eta mahaiarena ${dec(P2)} mm (sarrera bakarrekoak). Z13–Z16 gurpilen modulua m = ${dec(mB)} mm da. Hortz kopuruak elementuen taulan daude.`,
        es: `El motor de una fresadora gira a ${n} rpm y acciona el eje I mediante la correa Ø${d[0]}/Ø${d[1]}. La caja de velocidades tiene tres trenes desplazables (Z1/Z2/Z3, Z15/Z16 y Z7/Z8/Z9). La cadena de avances parte del eje IV: tornillo sinfín de ${k19} ${k19 === 1 ? 'entrada' : 'entradas'} y corona de ${z19} dientes (Z19). El husillo del carro transversal tiene paso ${dec(P1)} mm y el de la mesa ${dec(P2)} mm (de una entrada). Las ruedas Z13–Z16 tienen módulo m = ${dec(mB)} mm. Los números de dientes figuran en la tabla de elementos.`,
      },
    );
  },
};

// ---------------------------------------------------------------------------
// 8. Simple indexing (level 2)
// ---------------------------------------------------------------------------
const indexing: Archetype = {
  id: 'plater-zatitzailea',
  level: 2,
  title: { eu: 'Plater zatitzailea', es: 'Plato divisor' },
  build(rng) {
    const set = rng.pick(plates.sets);
    const K = set.K;
    const N = rng.int(3, 160);
    const sols = indexingSolutions(K, N, set.plates);
    if (!sols.length || K % N === 0) return null; // whole turns only: trivial
    const b = new ChainBuilder();
    const C = b.shaft('B'); // crank
    const H = b.shaft('H'); // spindle of the dividing head
    b.worm(C, H, 1, K);
    const chain = b.build({ shaft: C, n: 40 });
    const list = set.plates.map((p, i) => `${i + 1}) ${p.join(', ')}`).join('; ');
    return exOf(chain, [{ type: 'indexing', N }], 2, {
      eu: `Plater zatitzaile batekin (K = ${K}) pieza bat ${N} zati berdinetan banatu behar da, zatiketa sinplez. Eskuragarri dauden zulo-zirkuluak (${set.name.eu}): ${list}.`,
      es: `Con un plato divisor (K = ${K}) hay que dividir una pieza en ${N} partes iguales, por división simple. Círculos de agujeros disponibles (${set.name.es}): ${list}.`,
    }, { data: { K, platesHoles: set.plates } });
  },
};

// ---------------------------------------------------------------------------
// 9. Change gears for thread cutting (level 3)
// ---------------------------------------------------------------------------
const THREADS = ['0,5', '0,7', '0,75', '0,8', '1', '1,25', '1,5', '1,75', '2', '2,5', '3', '3,5', '4'];
const changeGears: Archetype = {
  id: 'aldaketa-gurpilak',
  level: 3,
  title: { eu: 'Aldaketa-gurpilak', es: 'Ruedas de recambio' },
  build(rng) {
    const thread = rng.pick(THREADS);
    const lead = rng.pick(['4', '5', '6', '8']);
    const i = requiredRatio(parse(thread), parse(lead));
    if (!compoundTrains(i, DEFAULT_GEARSET, { mountingCondition: true }).length) return null;
    const b = new ChainBuilder();
    const SP = b.shaft('AN');
    const LS = b.shaft('TP');
    b.clutch(SP, LS);
    const out = b.out('C', 'gurdia');
    b.screw(LS, out, lead, 1);
    const chain = b.build({ shaft: SP, n: 100 });
    return exOf(
      chain,
      [{ type: 'changeGears', threadPitch: parse(thread), leadScrewPitch: parse(lead), mountingCondition: true }],
      3,
      {
        eu: `Tornu batean P = ${thread} mm-ko hari metrikoa ebaki behar da. Torloju patroiaren pausoa ${lead} mm da, eta ardatz nagusiaren eta torloju patroiaren arteko erlazioa 1:1 da aldaketa-gurpilik gabe. Aukeratu lau gurpileko tren bat multzo honetatik: ${DEFAULT_GEARSET.join(', ')} (bakoitza behin). Muntaketa-baldintza: Za + Zb > Zc + 15 eta Zc + Zd > Zb + 15.`,
        es: `En un torno hay que roscar una rosca métrica de paso P = ${thread} mm. El husillo patrón tiene paso ${lead} mm y la relación entre el eje principal y el husillo patrón es 1:1 sin ruedas de recambio. Elige un tren de cuatro ruedas de este juego: ${DEFAULT_GEARSET.join(', ')} (una de cada). Condición de montaje: Za + Zb > Zc + 15 y Zc + Zd > Zb + 15.`,
      },
      { data: { changeGears: DEFAULT_GEARSET } },
    );
  },
};

// ---------------------------------------------------------------------------
// 10. Power and torque along the chain (level 3)
// ---------------------------------------------------------------------------
const power: Archetype = {
  id: 'potentzia',
  level: 3,
  title: { eu: 'Potentzia eta momentua', es: 'Potencia y par' },
  build(rng) {
    const b = new ChainBuilder();
    const n = rng.pick(MOTOR_RPM);
    const PkW = rng.pick(['0,75', '1,1', '1,5', '2,2', '3', '4', '5,5', '7,5']);
    const I = b.shaft();
    const II = b.shaft();
    const III = b.shaft();
    const eff: Record<string, string> = {};
    const etas: string[] = [];
    for (const [f, t] of [
      [I, II],
      [II, III],
    ] as const) {
      const z = teethFor(rng, ...rng.pick(REDUCING));
      if (!z) return null;
      const id = b.gear(f, t, z[0], z[1]);
      const eta = rng.pick(['0,95', '0,96', '0,97', '0,98']);
      eff[id] = eta;
      etas.push(eta);
    }
    const P = String(Number(parse(PkW).n * 1000n) / Number(parse(PkW).d));
    const chain = b.build({ shaft: I, n, power: P }, eff);
    return exOf(
      chain,
      [
        { type: 'speed', shaft: III },
        { type: 'torquePower', shaft: III },
      ],
      3,
      {
        eu: `${PkW} kW-eko motor batek I ardatza ${n} rpm-tan biratzen du. Bi engranaje-pareren errendimenduak η = ${etas.join(' eta η = ')} dira (lehen etapa eta bigarrena). Kalkulatu irteerako ardatzaren (III) abiadura, potentzia eta momentua.`,
        es: `Un motor de ${PkW} kW hace girar el eje I a ${n} rpm. Los rendimientos de los dos pares de engranajes son η = ${etas.join(' y η = ')} (primera y segunda etapa). Calcula la velocidad, la potencia y el par en el eje de salida (III).`,
      },
    );
  },
};

export const ARCHETYPES: Archetype[] = [simpleTrain, wormTrain, rackFeed, tableScrew, gearbox1, headstock, milling, indexing, changeGears, power];
export const archetypeById = (id: string) => ARCHETYPES.find((a) => a.id === id);
