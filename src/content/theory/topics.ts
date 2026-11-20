/**
 * Theory (spec §14.1): 13 topics, Basque and Spanish. Status "draft" until the
 * user reviews the texts. No number is written by hand in the prose: examples use
 * {{…}} variables computed by the solver (src/core/template.ts).
 */
import type { ChainJSON } from '../../core/model';
import plates from '../../data/plates.json';
import status from './status.json';
import type { Topic } from './types';

/** Brown & Sharpe hole circles (src/data/plates.json, approved by the user). */
const BS_PLATES = (plates.sets.find((s) => s.id === 'brown-sharpe') ?? plates.sets[0]!).plates;

const S = (...ids: string[]) => ids.map((id) => ({ id, label: id }));
const VP = { eu: 'motorraren aldetik begiratuta', es: 'mirando desde el motor' };

// ---- example chains (the solver computes every number shown) ----
const KG1: ChainJSON = {
  shafts: S('I', 'II', 'III'),
  elements: [
    { kind: 'gear', id: 'g1', from: 'I', to: 'II', z1: 20, z2: 40, module: '2' },
    { kind: 'gear', id: 'g2', from: 'II', to: 'III', z1: 25, z2: 50, module: '2' },
  ],
  input: { shaft: 'I', n: '1440', direction: 'cw' },
  viewpoint: VP,
};
const IDLER: ChainJSON = {
  shafts: [{ id: 'I', label: 'I' }, { id: 'T', label: 'T' }, { id: 'II', label: 'II' }],
  elements: [
    { kind: 'gear', id: 'g1', from: 'I', to: 'T', z1: 20, z2: 35 },
    { kind: 'gear', id: 'g2', from: 'T', to: 'II', z1: 35, z2: 40 },
  ],
  input: { shaft: 'I', n: '1000', direction: 'cw' },
  viewpoint: VP,
};
const BELT: ChainJSON = {
  shafts: S('I', 'II'),
  elements: [{ kind: 'belt', id: 'u', from: 'I', to: 'II', d1: '100', d2: '250' }],
  input: { shaft: 'I', n: '1500' },
};
const BELT_SLIP: ChainJSON = {
  shafts: S('I', 'II'),
  elements: [{ kind: 'belt', id: 'u', from: 'I', to: 'II', d1: '100', d2: '250', slip: '0,02' }],
  input: { shaft: 'I', n: '1500' },
};
/** Same drive with a crossed belt (figure only). */
const BELT_X: ChainJSON = { ...BELT, elements: [{ kind: 'belt', id: 'u', from: 'I', to: 'II', d1: '100', d2: '250', crossed: true }] };
const WORM: ChainJSON = {
  shafts: S('I', 'II'),
  elements: [{ kind: 'worm', id: 'w', from: 'I', to: 'II', starts: 1, z: 40 }],
  input: { shaft: 'I', n: '1400' },
};
const BOX3: ChainJSON = {
  shafts: S('I', 'II'),
  elements: [
    { kind: 'gear', id: 'a', from: 'I', to: 'II', z1: 20, z2: 60, module: '2' },
    { kind: 'gear', id: 'b', from: 'I', to: 'II', z1: 30, z2: 50, module: '2' },
    { kind: 'gear', id: 'c', from: 'I', to: 'II', z1: 40, z2: 40, module: '2' },
  ],
  clusters: [{ id: 'K', label: 'K', options: ['a', 'b', 'c'] }],
  input: { shaft: 'I', n: '1200' },
};
export const HEAD: ChainJSON = {
  shafts: [{ id: 'M', label: 'M' }, { id: 'I', label: 'I' }, { id: 'II', label: 'II' }, { id: 'III', label: 'III' }],
  elements: [
    { kind: 'belt', id: 'u', from: 'M', to: 'I', d1: '120', d2: '240' },
    { kind: 'gear', id: 'a1', from: 'I', to: 'II', z1: 30, z2: 50, module: '2' },
    { kind: 'gear', id: 'a2', from: 'I', to: 'II', z1: 40, z2: 40, module: '2' },
    { kind: 'gear', id: 'a3', from: 'I', to: 'II', z1: 20, z2: 60, module: '2' },
    { kind: 'gear', id: 'b1', from: 'II', to: 'III', z1: 25, z2: 50 },
    { kind: 'gear', id: 'b2', from: 'II', to: 'III', z1: 50, z2: 25 },
  ],
  clusters: [
    { id: 'A', label: 'A', options: ['a1', 'a2', 'a3'] },
    { id: 'B', label: 'B', options: ['b1', 'b2'] },
  ],
  input: { shaft: 'M', n: '1440' },
};
const RACK: ChainJSON = {
  shafts: S('P'),
  linear: [{ id: 'R', label: 'kremailera' }],
  elements: [{ kind: 'rack', id: 'r', from: 'P', output: 'R', z: 20, module: '3' }],
  input: { shaft: 'P', n: '120' },
};
const SCREW: ChainJSON = {
  shafts: [{ id: 'AN', label: 'AN' }, { id: 'S', label: 'S' }],
  linear: [{ id: 'T', label: 'mahaia' }],
  elements: [
    { kind: 'gear', id: 'g', from: 'AN', to: 'S', z1: 20, z2: 100 },
    { kind: 'screw', id: 's', from: 'S', output: 'T', pitch: '5', starts: 1 },
  ],
  input: { shaft: 'AN', n: '300' },
};
const SCREW2: ChainJSON = { ...SCREW, elements: [SCREW.elements[0]!, { kind: 'screw', id: 's', from: 'S', output: 'T', pitch: '5', starts: 2 }] };
const POWER: ChainJSON = {
  shafts: S('I', 'II'),
  elements: [{ kind: 'gear', id: 'g', from: 'I', to: 'II', z1: 20, z2: 60 }],
  input: { shaft: 'I', n: '1440', power: '2200' },
  efficiency: { g: '0,96' },
};
const KG10: ChainJSON = { shafts: S('A'), elements: [], input: { shaft: 'A', n: '320', power: '1100' } };

const RAW_TOPICS: Topic[] = [
  {
    id: 'eskemak',
    title: { eu: 'Transmisio-elementuak eta eskema zinematikoa', es: 'Elementos de transmisión y esquema cinemático' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Kate zinematikoa motorretik irteeretaraino (ardatz nagusia, mahaia, gurdia…) higidura eramaten duten elementuen segida da. Eskema zinematikoak elementu horiek sinbolo sinpleekin irudikatzen ditu: ardatzak lerro lodiak dira, eta engranajeak ertzetik ikusitako laukizuzen estuak.',
        es: 'La cadena cinemática es la sucesión de elementos que llevan el movimiento desde el motor hasta las salidas (eje principal, mesa, carro…). El esquema cinemático los representa con símbolos sencillos: los ejes son líneas gruesas y los engranajes, rectángulos estrechos vistos de canto.',
      },
      {
        t: 'list',
        eu: [
          'Ardatzak: lerro lodiak; errodamenduak muturretan.',
          'Engranajea: laukizuzen estua, altuera diametroaren proportzionala; gurpil finkoa ×, labainkorra / ikurrarekin.',
          'Gurpil-multzo labainkorra: ardatzean irristatzen den nabea; posizio bakoitzean pare bakarra engranatzen da.',
          'Uhala eta poleak: bi polea zabal eta haien arteko banda; uhal gurutzatua X gisa.',
          'Torloju amaigabea: hari-lerro inklinatuak dituen laukizuzena, gurpil helikoidalaren gainean.',
          'Kremailera eta aitzinapen-torlojua: biraketa translazio bihurtzen dute (urdinez).',
        ],
        es: [
          'Ejes: líneas gruesas; rodamientos en los extremos.',
          'Engranaje: rectángulo estrecho, altura proporcional al diámetro; rueda fija con ×, desplazable con /.',
          'Tren desplazable: cubo que se desliza sobre el eje; en cada posición engrana un solo par.',
          'Correa y poleas: dos poleas anchas y la banda entre ellas; correa cruzada como X.',
          'Tornillo sinfín: rectángulo con hilos inclinados sobre la corona.',
          'Cremallera y husillo de avance: convierten el giro en traslación (en azul).',
        ],
      },
      { t: 'figure', f: 'symbols' },
      { t: 'schema', chain: KG1 },
      {
        t: 'p',
        eu: 'Eskema bat irakurtzeko: aurkitu motorra eta sarrerako ardatza, eta jarraitu potentzia-bidea ardatzez ardatz eskatutako irteeraraino. Multzo labainkorretan, posizio aktiboko gurpilak bakarrik transmititzen du.',
        es: 'Para leer un esquema: localiza el motor y el eje de entrada, y sigue la cadena de potencia eje a eje hasta la salida pedida. En los trenes desplazables solo transmite la rueda de la posición activa.',
      },
      {
        t: 'note',
        kind: 'careful',
        eu: 'Aplikazioko sinboloak testuliburuetako ohiko irudikapenean oinarrituta daude; ISO 3952 arauarekin alderatzeko daude.',
        es: 'Los símbolos de la aplicación siguen la representación habitual de los libros de texto; están pendientes de comparar con la norma ISO 3952.',
      },
    ],
  },
  {
    id: 'erlazioa',
    title: { eu: 'Transmisio-erlazioa', es: 'Relación de transmisión' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Bi gurpil engranatzean ez dago irristatzerik: engranatze-puntuan bi gurpilen abiadura periferikoa berdina da. Abiadura periferikoa v = π·d·n da, eta diametro primitiboa d = m·Z.',
        es: 'Al engranar dos ruedas no hay deslizamiento: en el punto de engrane la velocidad periférica de ambas es la misma. La velocidad periférica es v = π·d·n, y el diámetro primitivo d = m·Z.',
      },
      { t: 'f', tex: 'v = \\pi\\, d_1\\, n_1 = \\pi\\, d_2\\, n_2 \\;\\Rightarrow\\; \\pi\\, m Z_1 n_1 = \\pi\\, m Z_2 n_2 \\;\\Rightarrow\\; n_2 = n_1\\,\\frac{Z_1}{Z_2}', check: 'gear-ratio' },
      { t: 'f', tex: 'i = \\frac{n_{\\text{irteera}}}{n_{\\text{sarrera}}} = \\frac{Z_1}{Z_2}' },
      {
        t: 'p',
        eu: 'Aplikazioan i = n irteera / n sarrera konbentzioa erabiltzen da: i < 1 bada, erreduktorea da (abiadura jaisten du eta momentua handitzen). Liburu batzuek alderantzizkoa erabiltzen dute; enuntziatuak zein den esan behar du.',
        es: 'La aplicación usa la convención i = n salida / n entrada: si i < 1, es un reductor (baja la velocidad y aumenta el par). Algunos libros usan la inversa; el enunciado debe indicar cuál.',
      },
      {
        t: 'example',
        chain: KG1,
        eu: 'Adibidea: I ardatza {{n0}} rpm-tan, Z₁ = {{z:g1:1}} eta Z₂ = {{z:g1:2}}. Orduan n(II) = {{n0}} · {{z:g1:1}}/{{z:g1:2}} = {{n:II}} rpm, eta etapa horren erlazioa i = {{i:I:II}}.',
        es: 'Ejemplo: eje I a {{n0}} rpm, Z₁ = {{z:g1:1}} y Z₂ = {{z:g1:2}}. Entonces n(II) = {{n0}} · {{z:g1:1}}/{{z:g1:2}} = {{n:II}} rpm, y la relación de esa etapa es i = {{i:I:II}}.',
      },
      { t: 'widget', w: 'gears' },
    ],
  },
  {
    id: 'trenak',
    title: { eu: 'Engranaje-trenak, gurpil tartekaria eta noranzkoa', es: 'Trenes de engranajes, rueda intermedia y sentido de giro' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Tren batean abiadura etapaz etapa biderkatzen da; beraz, erlazio osoa etapa guztien erlazioen biderkadura da.',
        es: 'En un tren la velocidad se multiplica etapa a etapa; por tanto, la relación total es el producto de las relaciones de todas las etapas.',
      },
      { t: 'f', tex: 'i_{\\text{osoa}} = \\prod_k \\frac{Z_{\\text{eragilea},k}}{Z_{\\text{eragina},k}}', check: 'train-product' },
      { t: 'figure', f: 'train', chain: KG1 },
      {
        t: 'example',
        chain: KG1,
        eu: 'Adibidea: {{n0}} rpm · {{z:g1:1}}/{{z:g1:2}} · {{z:g2:1}}/{{z:g2:2}} = {{n:III}} rpm; i = {{i:I:III}}.',
        es: 'Ejemplo: {{n0}} rpm · {{z:g1:1}}/{{z:g1:2}} · {{z:g2:1}}/{{z:g2:2}} = {{n:III}} rpm; i = {{i:I:III}}.',
      },
      {
        t: 'p',
        eu: 'Gurpil tartekariak bi engranatzetan parte hartzen du: haren hortz kopurua zatikiaren goian eta behean agertzen da, eta ezabatu egiten da. Ez du erlazioa aldatzen, baina bai noranzkoa.',
        es: 'La rueda intermedia participa en dos engranes: su número de dientes aparece arriba y abajo de la fracción y se simplifica. No cambia la relación, pero sí el sentido.',
      },
      {
        t: 'list',
        eu: ['Kanpo-engranatzea: noranzkoa alderantzikatzen du.', 'Barne-engranajea: noranzkoa mantentzen du.', 'Uhal irekia eta katea: mantentzen dute.', 'Uhal gurutzatua: alderantzikatzen du.', 'Noranzkoa ikuspuntu finko batetik adierazten da beti (adib. motorraren aldetik).'],
        es: ['Engrane exterior: invierte el sentido.', 'Engranaje interior: lo mantiene.', 'Correa abierta y cadena: lo mantienen.', 'Correa cruzada: lo invierte.', 'El sentido se indica siempre desde un punto de vista fijo (p. ej. desde el motor).'],
      },
      { t: 'figure', f: 'train', chain: IDLER },
      {
        t: 'example',
        chain: IDLER,
        eu: 'Adibidea (T tartekaria): n(II) = {{n0}} · {{z:g1:1}}/{{z:g1:2}} · {{z:g2:1}}/{{z:g2:2}} = {{n:II}} rpm, tartekaririk gabe bezala. Bi kanpo-engranatze daude; beraz, II ardatzak {{dir:II}} du.',
        es: 'Ejemplo (rueda intermedia T): n(II) = {{n0}} · {{z:g1:1}}/{{z:g1:2}} · {{z:g2:1}}/{{z:g2:2}} = {{n:II}} rpm, igual que sin ella. Hay dos engranes exteriores; por tanto el eje II gira con {{dir:II}}.',
      },
    ],
  },
  {
    id: 'poleak',
    title: { eu: 'Poleak eta katea; irristatzea', es: 'Poleas y cadena; deslizamiento' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Uhalak bi poleak lotzen ditu: irristatzerik gabe, uhalaren abiadura lineala bera da bi poleetan, eta abiadurak diametroen alderantziz proportzionalak dira. Katean, hortz kopuruak erabiltzen dira, engranajeetan bezala.',
        es: 'La correa une dos poleas: sin deslizamiento, la velocidad lineal de la correa es la misma en ambas y las velocidades son inversamente proporcionales a los diámetros. En la cadena se usan números de dientes, como en los engranajes.',
      },
      { t: 'f', tex: '\\pi D_1 n_1 = \\pi D_2 n_2 \\;\\Rightarrow\\; n_2 = n_1\\,\\frac{D_1}{D_2}\\,(1 - s)', check: 'belt-ratio' },
      { t: 'figure', f: 'belt', chain: BELT_SLIP },
      { t: 'figure', f: 'belt', chain: BELT_X },
      {
        t: 'example',
        chain: BELT,
        eu: 'Adibidea: D₁ = {{d1:u}} mm, D₂ = {{d2:u}} mm eta n₁ = {{n0}} rpm → n₂ = {{n:II}} rpm.',
        es: 'Ejemplo: D₁ = {{d1:u}} mm, D₂ = {{d2:u}} mm y n₁ = {{n0}} rpm → n₂ = {{n:II}} rpm.',
      },
      {
        t: 'example',
        chain: BELT_SLIP,
        eu: 'Irristatzearekin (s faktorea, enuntziatuak ematen du), abiadura pixka bat txikiagoa da: n₂ = {{n:II}} rpm.',
        es: 'Con deslizamiento (factor s, lo da el enunciado), la velocidad es algo menor: n₂ = {{n:II}} rpm.',
      },
      { t: 'note', kind: 'careful', eu: 'Enuntziatuak besterik esan ezean, ez dago irristatzerik.', es: 'Salvo que el enunciado diga otra cosa, no hay deslizamiento.' },
    ],
  },
  {
    id: 'torlojua',
    title: { eu: 'Torloju amaigabea', es: 'Tornillo sinfín' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Torloju amaigabearen bira bakoitzean gurpil helikoidalak k hortz aurreratzen ditu, k torlojuaren sarrera kopurua izanik. Horregatik lortzen dira erlazio oso handiak etapa bakarrean.',
        es: 'En cada vuelta del tornillo sinfín la corona avanza k dientes, siendo k el número de entradas del tornillo. Por eso se consiguen relaciones muy grandes en una sola etapa.',
      },
      { t: 'f', tex: 'n_{\\text{gurpila}} = n_{\\text{torlojua}}\\,\\frac{k}{Z}', check: 'worm-ratio' },
      { t: 'figure', f: 'worm', chain: WORM },
      {
        t: 'example',
        chain: WORM,
        eu: 'Adibidea: k = {{z:w:1}}, Z = {{z:w:2}}, n = {{n0}} rpm → n(II) = {{n:II}} rpm (i = {{i:I:II}}).',
        es: 'Ejemplo: k = {{z:w:1}}, Z = {{z:w:2}}, n = {{n0}} rpm → n(II) = {{n:II}} rpm (i = {{i:I:II}}).',
      },
      {
        t: 'p',
        eu: 'Itzulgaiztasuna: helize-angelua txikia denean, gurpilak ezin du torlojua eragin (marruskadurak blokeatzen du). Horregatik, aplikazioan torlojua beti da eragilea.',
        es: 'Irreversibilidad: cuando el ángulo de hélice es pequeño, la corona no puede mover el tornillo (el rozamiento lo bloquea). Por eso, en la aplicación el tornillo es siempre el conductor.',
      },
      { t: 'note', kind: 'careful', eu: 'k/Z da, ez Z/k. Noranzkoa ez da galdetzen (ardatzak ez dira paraleloak).', es: 'Es k/Z, no Z/k. No se pregunta el sentido (los ejes no son paralelos).' },
    ],
  },
  {
    id: 'geometria',
    title: { eu: 'Engranaje zuzenen geometria', es: 'Geometría de los engranajes rectos' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Modulua (m, mm-tan) da engranaje baten tamainaren neurria: engranatzen diren bi gurpilek modulu bera izan behar dute. ISO profil normalarekin:',
        es: 'El módulo (m, en mm) es la medida del tamaño de un engranaje: dos ruedas que engranan deben tener el mismo módulo. Con el perfil normal ISO:',
      },
      { t: 'f', tex: 'd = m Z \\qquad d_a = m (Z + 2) \\qquad d_f = m (Z - 2{,}5) \\qquad h = 2{,}25\\, m \\qquad p = \\pi m', check: 'tooth-geometry' },
      { t: 'f', tex: 'a = \\frac{d_1 + d_2}{2} = \\frac{m (Z_1 + Z_2)}{2}\\quad(\\text{kanpokoa})\\qquad a = \\frac{m (Z_2 - Z_1)}{2}\\quad(\\text{barnekoa})', check: 'centre-distance' },
      { t: 'figure', f: 'tooth', chain: KG1, element: 'g1' },
      {
        t: 'example',
        chain: KG1,
        eu: 'Adibidea (m = {{m:g1}} mm): Z = {{z:g1:1}} gurpilak d = {{d:g1:1}} mm, dₐ = {{da:g1:1}} mm eta d_f = {{df:g1:1}} mm ditu; I–II ardatzen arteko distantzia a = {{a:g1}} mm da.',
        es: 'Ejemplo (m = {{m:g1}} mm): la rueda de Z = {{z:g1:1}} tiene d = {{d:g1:1}} mm, dₐ = {{da:g1:1}} mm y d_f = {{df:g1:1}} mm; la distancia entre los ejes I–II es a = {{a:g1}} mm.',
      },
      {
        t: 'p',
        eu: 'Multzo labainkor bateko pare guztiek ardatz-pare bera lotzen dute, eta ardatzen arteko distantzia finkoa da. Modulu berarekin, pare guztiek Z₁ + Z₂ batura bera izan behar dute.',
        es: 'Todos los pares de un tren desplazable unen el mismo par de ejes, y la distancia entre ejes es fija. Con el mismo módulo, todos los pares deben tener la misma suma Z₁ + Z₂.',
      },
      {
        t: 'example',
        chain: BOX3,
        eu: 'Adibidea: {{z:a:1}}/{{z:a:2}}, {{z:b:1}}/{{z:b:2}} eta {{z:c:1}}/{{z:c:2}} pareek batura bera dute, eta a = {{a:a}} mm.',
        es: 'Ejemplo: los pares {{z:a:1}}/{{z:a:2}}, {{z:b:1}}/{{z:b:2}} y {{z:c:1}}/{{z:c:2}} tienen la misma suma, y a = {{a:a}} mm.',
      },
    ],
  },
  {
    id: 'kaxak',
    title: { eu: 'Abiadura-kaxak', es: 'Cajas de velocidades' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Abiadura-kaxak multzo labainkorrak konbinatzen ditu. Multzo bakoitzaren posizio kopuruak biderkatuta lortzen da abiadura kopurua, baldin eta abiadura guztiak desberdinak badira.',
        es: 'La caja de velocidades combina trenes desplazables. El número de velocidades es el producto del número de posiciones de cada tren, siempre que todas las velocidades sean distintas.',
      },
      { t: 'f', tex: 'z = \\prod_j p_j', check: 'speed-count' },
      {
        t: 'p',
        eu: 'Makina-erremintetan abiadurak serie geometrikoan antolatzen dira (arrazoi konstantea φ): horrela, tarte erlatiboa bera da gama osoan, eta ebaketa-abiadura optimotik gertu lan egin daiteke edozein diametrorekin.',
        es: 'En las máquinas herramienta las velocidades se ordenan en serie geométrica (razón constante φ): así el salto relativo es el mismo en toda la gama y se puede trabajar cerca de la velocidad de corte óptima con cualquier diámetro.',
      },
      { t: 'f', tex: 'n_k = n_{\\min}\\,\\varphi^{\\,k-1},\\qquad \\varphi = \\left(\\frac{n_{\\max}}{n_{\\min}}\\right)^{1/(z-1)},\\qquad \\varphi \\in \\{1{,}12;\\ 1{,}26;\\ 1{,}41;\\ 1{,}58;\\ 2\\}' },
      { t: 'widget', w: 'gearbox' },
      {
        t: 'example',
        chain: HEAD,
        eu: 'Adibidea (simulagailuko kaxa): {{count:III}} abiadura; maximoa {{max:III}} rpm eta minimoa {{min:III}} rpm.',
        es: 'Ejemplo (la caja del simulador): {{count:III}} velocidades; máxima {{max:III}} rpm y mínima {{min:III}} rpm.',
      },
      { t: 'note', kind: 'careful', eu: 'Maximoa eta minimoa bilatzeko, konbinazio guztiak aztertu behar dira.', es: 'Para hallar la máxima y la mínima hay que examinar todas las combinaciones.' },
    ],
  },
  {
    id: 'translazioa',
    title: { eu: 'Biraketa → translazioa: kremailera eta aitzinapen-torlojua', es: 'Giro → traslación: cremallera y husillo de avance' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Pinoiaren bira bakoitzean kremailera bere zirkunferentzia primitiboa aurreratzen da (π·d). Abiadura lineala, beraz:',
        es: 'En cada vuelta del piñón la cremallera avanza su circunferencia primitiva (π·d). La velocidad lineal es, por tanto:',
      },
      { t: 'f', tex: 'v = \\pi\\, d\\, n = \\pi\\, m Z\\, n \\quad[\\text{mm/min}] \\qquad v\\,[\\text{m/s}] = \\frac{\\pi\\, m Z\\, n}{60\\,000}', check: 'rack-speed' },
      {
        t: 'example',
        chain: RACK,
        eu: 'Adibidea: m = {{m:r}} mm, Z = {{z:r}}, n = {{n0}} rpm → d = {{d:r}} mm eta v = {{v:R}} mm/min = {{vs:R}} m/s.',
        es: 'Ejemplo: m = {{m:r}} mm, Z = {{z:r}}, n = {{n0}} rpm → d = {{d:r}} mm y v = {{v:R}} mm/min = {{vs:R}} m/s.',
      },
      { t: 'widget', w: 'rack' },
      {
        t: 'p',
        eu: 'Aitzinapen-torlojuaren bira bakoitzean azkoina beruna aurreratzen da: beruna = sarrera kopurua × pausoa.',
        es: 'En cada vuelta del husillo de avance la tuerca avanza el avance por vuelta: avance por vuelta = número de entradas × paso.',
      },
      { t: 'f', tex: 'P_h = k\\,P \\qquad v = n\\,P_h = n\\,k\\,P', check: 'screw-speed' },
      { t: 'figure', f: 'screw', chain: SCREW2 },
      {
        t: 'example',
        chain: SCREW2,
        eu: 'Adibidea: P = {{p:s}} mm eta k = {{k:s}} sarrera, torlojua {{n:S}} rpm-tan → v = {{v:T}} mm/min.',
        es: 'Ejemplo: P = {{p:s}} mm y k = {{k:s}} entradas, husillo a {{n:S}} rpm → v = {{v:T}} mm/min.',
      },
    ],
  },
  {
    id: 'aitzinapena',
    title: { eu: 'Makina-erreminten aitzinapen-kateak', es: 'Cadenas de avance de las máquinas herramienta' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Aitzinapena ardatz nagusiarekin lotzen da: piezaren (edo fresaren) bira bakoitzean erremintak zenbat milimetro aurreratzen duen. Horregatik, aitzinapen-katea ardatz nagusiaren katetik abiatzen da askotan.',
        es: 'El avance se liga al eje principal: cuántos milímetros avanza la herramienta en cada vuelta de la pieza (o de la fresa). Por eso la cadena de avances suele partir de la cadena del eje principal.',
      },
      { t: 'f', tex: 'f = \\frac{v}{n_{\\text{ardatza}}}\\;[\\text{mm/bira}] \\qquad v = f\\cdot n_{\\text{ardatza}}\\;[\\text{mm/min}]', check: 'feed-per-rev' },
      { t: 'figure', f: 'feed', chain: SCREW, output: 'T', spindle: 'AN' },
      {
        t: 'example',
        chain: SCREW,
        eu: 'Adibidea: ardatz nagusia {{n:AN}} rpm-tan eta mahaia {{v:T}} mm/min-tan → f = {{f:T:AN}} mm/bira.',
        es: 'Ejemplo: eje principal a {{n:AN}} rpm y mesa a {{v:T}} mm/min → f = {{f:T:AN}} mm/rev.',
      },
      { t: 'note', kind: 'careful', eu: 'mm/bira eta mm/min ez nahastu: aldatu ardatz nagusiaren abiaduraz biderkatuz edo zatituz.', es: 'No confundas mm/rev y mm/min: se pasa de uno a otro multiplicando o dividiendo por la velocidad del eje principal.' },
    ],
  },
  {
    id: 'zatiketa',
    title: { eu: 'Plater zatitzailea', es: 'Plato divisor' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Buru zatitzaileak torloju amaigabe eta gurpil bat ditu, K erlazioarekin (normalean K = 40): biraderaren K birak buruaren bira oso bat dira. Pieza N zati berdinetan banatzeko, zati bakoitzeko K/N bira eman behar dira.',
        es: 'El cabezal divisor tiene un tornillo sinfín y una corona de relación K (normalmente K = 40): K vueltas de la manivela son una vuelta del cabezal. Para dividir la pieza en N partes iguales hay que dar K/N vueltas por parte.',
      },
      { t: 'figure', f: 'dividing-head', K: 40, N: 24, plates: BS_PLATES },
      { t: 'f', tex: '\\text{birak} = \\frac{K}{N} = \\text{bira osoak} + \\frac{\\text{zuloak}}{\\text{zirkulua}}', check: 'indexing' },
      {
        t: 'example',
        chain: WORM,
        eu: 'Adibidea (K/N): {{indexN:40:24}} bira zati bakoitzeko. Zatikia lortzeko, zirkuluak izendatzailearen multiploa izan behar du, eta platerean egon.',
        es: 'Ejemplo (K/N): {{indexN:40:24}} vueltas por parte. Para la fracción, el círculo debe ser múltiplo del denominador y estar en el plato.',
      },
      { t: 'note', kind: 'careful', eu: 'K/N da, ez N/K; eta bira osoak atera behar dira (zuloak < zirkulua). Zatiketa diferentziala ez dago v1-ean.', es: 'Es K/N, no N/K; y hay que sacar las vueltas enteras (agujeros < círculo). La división diferencial no está en la v1.' },
    ],
  },
  {
    id: 'aldaketa',
    title: { eu: 'Hariztatzeko aldaketa-gurpilak', es: 'Ruedas de recambio para roscar' },
    status: 'draft',
    blocks: [
      {
        t: 'p',
        eu: 'Tornuan haria ebakitzeko, ardatz nagusiaren bira bakoitzean gurdiak hariaren pausoa aurreratu behar du. Torloju patroiak bere pausoa aurreratzen du bira bakoitzeko; beraz, aldaketa-gurpilen trenak erlazio hau eman behar du:',
        es: 'Para roscar en el torno, en cada vuelta del eje principal el carro debe avanzar el paso de la rosca. El husillo patrón avanza su paso por vuelta; por tanto, el tren de ruedas de recambio debe dar esta relación:',
      },
      { t: 'f', tex: 'i = \\frac{P_{\\text{haria}}}{P_{\\text{torlojua}}} = \\frac{Z_a \\cdot Z_c}{Z_b \\cdot Z_d}', check: 'change-gears' },
      { t: 'figure', f: 'lira', threadPitch: '1,5', leadScrewPitch: '6' },
      {
        t: 'example',
        chain: KG1,
        eu: 'Adibidea (P_haria / P_torlojua): i = {{gearsN:1,5:6}}; multzo arruntarekin, adibidez {{train:1,5:6}}.',
        es: 'Ejemplo (P_rosca / P_husillo): i = {{gearsN:1,5:6}}; con el juego habitual, por ejemplo {{train:1,5:6}}.',
      },
      {
        t: 'p',
        eu: 'Muntaketa-baldintzak gurpilek elkar ez ukitzea bermatzen du (Za + Zb > Zc + 15 eta Zc + Zd > Zb + 15). Soluzio bat baino gehiago egon ohi da.',
        es: 'La condición de montaje garantiza que las ruedas no se toquen (Za + Zb > Zc + 15 y Zc + Zd > Zb + 15). Suele haber más de una solución.',
      },
    ],
  },
  {
    id: 'potentzia',
    title: { eu: 'Potentzia, momentua eta errendimendua', es: 'Potencia, par y rendimiento' },
    status: 'draft',
    blocks: [
      { t: 'f', tex: 'P = T\\,\\omega,\\qquad \\omega = \\frac{2\\pi n}{60}', check: 'omega' },
      { t: 'f', tex: 'T = \\frac{P}{\\omega} = \\frac{60\\,P}{2\\pi n}', check: 'torque' },
      {
        t: 'example',
        chain: KG10,
        eu: 'Adibidea (Madril 2025, f atala): P = {{P:A}} W eta n = {{n:A}} rpm → ω = {{w:A}} rad/s eta T = {{T:A}} N·m.',
        es: 'Ejemplo (Madrid 2025, apartado f): P = {{P:A}} W y n = {{n:A}} rpm → ω = {{w:A}} rad/s y T = {{T:A}} N·m.',
      },
      {
        t: 'p',
        eu: 'Etapa bakoitzak errendimendu bat du (η ≤ 1): potentzia ez da inoiz handitzen. Abiadura jaistean, momentua handitzen da.',
        es: 'Cada etapa tiene un rendimiento (η ≤ 1): la potencia nunca aumenta. Al reducir la velocidad, el par aumenta.',
      },
      { t: 'f', tex: 'P_{\\text{irteera}} = P\\prod \\eta,\\qquad T_{\\text{irteera}} = T_{\\text{sarrera}}\\,\\frac{1}{i}\\prod \\eta', check: 'power-efficiency' },
      { t: 'figure', f: 'power', chain: POWER },
      {
        t: 'example',
        chain: POWER,
        eu: 'Adibidea: {{P:I}} W eta {{n0}} rpm, etapa bat ({{z:g:1}}/{{z:g:2}}) errendimenduarekin → irteeran P = {{P:II}} W, n = {{n:II}} rpm eta T = {{T:II}} N·m.',
        es: 'Ejemplo: {{P:I}} W y {{n0}} rpm, una etapa ({{z:g:1}}/{{z:g:2}}) con rendimiento → a la salida P = {{P:II}} W, n = {{n:II}} rpm y T = {{T:II}} N·m.',
      },
      { t: 'note', kind: 'careful', eu: 'ω rad/s-tan, ez rpm-tan; P W-tan.', es: 'ω en rad/s, no en rpm; P en W.' },
    ],
  },
  {
    id: 'akatsak',
    title: { eu: 'Akats ohikoak eta OPEan nola aurkeztu', es: 'Errores típicos y cómo presentarlo en la OPE' },
    status: 'draft',
    blocks: [
      {
        t: 'list',
        eu: [
          'Erlazioa alderantziz hartzea: abiadurarako, eragilea zati eragina.',
          'Gurpil tartekaria erlazioan sartzea edo noranzkoan ahaztea.',
          'Multzo labainkorren beste posizio bat erabiltzea.',
          'Torlojuaren sarrera kopurua ahaztea (pausoa beruna balitz bezala).',
          'mm/bira eta mm/min nahastea.',
          'Kremaileran erradioa diametroaren ordez, /60 ahaztea edo mm eta m nahastea.',
          'Ardatzen arteko distantzian /2 ahaztea.',
          'rpm eta rad/s nahastea.',
          'Plater zatitzailean N/K kalkulatzea.',
          'Aitzinapen maximoa konbinazio guztiak aztertu gabe ematea.',
        ],
        es: [
          'Invertir la relación: para la velocidad, conductora entre conducida.',
          'Meter la rueda intermedia en la relación u olvidarla en el sentido.',
          'Usar otra posición de los trenes desplazables.',
          'Olvidar las entradas del husillo (tomar el paso como avance por vuelta).',
          'Confundir mm/rev y mm/min.',
          'En la cremallera, radio en vez de diámetro, olvidar /60 o confundir mm y m.',
          'Olvidar /2 en la distancia entre ejes.',
          'Confundir rpm y rad/s.',
          'Calcular N/K en el plato divisor.',
          'Dar el avance máximo sin examinar todas las combinaciones.',
        ],
      },
      {
        t: 'note',
        kind: 'ope',
        eu: 'OPEan: idatzi formula zenbakiak sartu aurretik, adierazi potentzia-bidea eta multzoen posizioa, eraman unitateak kalkulu osoan, eta nabarmendu emaitza bere unitatearekin. Puntuazioaren zati handi bat justifikazioari dagokio.',
        es: 'En la OPE: escribe la fórmula antes de sustituir números, indica la cadena de potencia y la posición de los trenes, arrastra las unidades en todo el cálculo y destaca el resultado con su unidad. Gran parte de la puntuación corresponde a la justificación.',
      },
    ],
  },
];

/** Topics with their review status from status.json. */
export const TOPICS: Topic[] = RAW_TOPICS.map((t) => ({ ...t, status: (status.status as Record<string, string>)[t.id] === 'reviewed' ? 'reviewed' : 'draft' }));
