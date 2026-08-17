// Los objetivos de diseño como aserciones. Si alguno falla, el juego volvió a
// premiar suerte en vez de destreza.
const M = require('./motor.js');
const fail = [];
const ck = (n, ok, x) => { if (!ok) fail.push(n + (x !== undefined ? ' :: ' + x : '')); };

// --- rebote ---
const est = { x: 500, y: M.F.GY - 46, vx: 9, vy: 6 };
const perf = M.resolverRebote(est, 0);
const bueno = M.resolverRebote(est, (M.F.VENTANA_PERFECTO + M.F.VENTANA_BUENO) / 2);
const rasp = M.resolverRebote(est, M.F.VENTANA_BUENO + 50);
ck('centro de la ventana = perfecto', perf.tipo === 'perfecto', perf.tipo);
ck('ventana media = bueno', bueno.tipo === 'bueno', bueno.tipo);
ck('fuera de ventana = raspón', rasp.tipo === 'raspon', rasp.tipo);
ck('el signo del desfase no importa',
  M.resolverRebote(est, -M.F.VENTANA_BUENO - 50).tipo === 'raspon');
ck('el perfecto devuelve más altura que el bueno', perf.vy < bueno.vy, perf.vy + ' ' + bueno.vy);
ck('el perfecto sube', perf.vy < 0, perf.vy);
ck('el raspón no sube y pierde velocidad',
  rasp.vy >= 0 && rasp.vx < est.vx, rasp.vy + ' ' + rasp.vx);
ck('el perfecto empuja horizontalmente', perf.vx > est.vx, perf.vx);
// El rebote perfecto tiene que devolver la MISMA altura sin importar con qué
// velocidad venía. Si decayera con la entrante, una cadena de rebotes perfectos
// igual se hundiría y el score volvería a tener techo — que es justo lo que este
// rediseño viene a sacar. No fija IMPULSO: fija que no dependa del estado.
const lento  = M.resolverRebote({ x: 500, y: 186, vx: 3,  vy: 2 }, 0);
const rapido = M.resolverRebote({ x: 500, y: 186, vx: 10, vy: 9 }, 0);
ck('el impulso perfecto no decae con la velocidad entrante',
  lento.vy === rapido.vy, lento.vy + ' vs ' + rapido.vy);
// Al revés que el perfecto, el raspón SÍ tiene que depender de la entrante
// (pierde una fracción de lo que traía, no cae a un piso fijo). Dos entrantes
// distintas tienen que dar salidas distintas.
const raspLento  = M.resolverRebote({ x: 500, y: 186, vx: 3,  vy: 2 }, M.F.VENTANA_BUENO + 50);
const raspRapido = M.resolverRebote({ x: 500, y: 186, vx: 10, vy: 9 }, M.F.VENTANA_BUENO + 50);
ck('el raspón es proporcional a la velocidad entrante, no un piso fijo',
  raspLento.vy !== raspRapido.vy && raspLento.vx !== raspRapido.vx,
  raspLento.vy + '/' + raspLento.vx + ' vs ' + raspRapido.vy + '/' + raspRapido.vx);

// El arco del rebote perfecto tiene que quedar ABAJO del techo. Si lo clava, el
// excedente se descarta, todos los arcos de la cadena salen idénticos y la altura
// deja de ser consecuencia del acierto (con IMPULSO en 7.4 clavaban 165 de 165).
// El apex depende de vx por el drag: un palo LENTO frena menos y sube más, así que
// el peor caso no es VX_MAX sino la velocidad de régimen de la cadena, vx≈2,2. Se
// mide desde la cima más alta (el árbol, h=46), que es la que deja menos aire.
const apexPerfecto = Math.min(...[1, 2.2, 5, M.F.VX_MAX].map(vx => Math.min(...M.trayectoria(
  { x: 300, y: M.F.GY - 46, vx: vx, vy: M.resolverRebote({ vx: vx, vy: 1 }, 0).vy }, 600
).map(p => p.y))));
ck('el arco perfecto no clava el techo', apexPerfecto > M.F.TECHO + 5,
  'apex ' + apexPerfecto.toFixed(1) + ' con el techo en ' + M.F.TECHO);

// --- combo ---
ck('perfecto sube el combo', M.comboTras(7, 'perfecto') === 8);
ck('bueno lo mantiene', M.comboTras(7, 'bueno') === 7);
ck('raspón lo parte al medio', M.comboTras(8, 'raspon') === 4);
ck('el combo nunca baja de 1', M.comboTras(1, 'raspon') === 1);
// 8/2 y 1/2-clampeado dan lo mismo con floor, ceil o round: no alcanzan para
// distinguirlos. Un combo impar mayor a 1 sí: floor(5/2)=2, ceil/round dan 3.
ck('raspón redondea la mitad para abajo', M.comboTras(5, 'raspon') === 2, M.comboTras(5, 'raspon'));

// --- puntaje ---
ck('acredita metros por combo', M.acreditar(5, 40) === 200, M.acreditar(5, 40));
ck('sin metros no acredita', M.acreditar(9, 0) === 0);
ck('crece con el combo', M.acreditar(10, 40) > M.acreditar(5, 40));

// --- variedad ---
ck('el primero rinde pleno', M.factorVariedad([], 'tree') === 1);
ck('repetir rinde menos',
  M.factorVariedad(['tree', 'tree'], 'tree') < M.factorVariedad(['cart'], 'tree'));
ck('variar rinde pleno', M.factorVariedad(['tree', 'tree'], 'cart') === 1);
// Discrimina la racha final de un conteo total: si contara todas las apariciones
// daría 0.5, pero la racha final es 'cart', así que 'tree' arranca de nuevo.
ck('sólo cuenta la racha final, no el historial',
  M.factorVariedad(['tree', 'cart'], 'tree') === 1,
  M.factorVariedad(['tree', 'cart'], 'tree'));

// --- integración: el vuelo encadena rebotes y acredita ---
// OJO: estas cinco son aserciones DE CABLEADO (regex sobre el fuente), no de
// comportamiento. Prueban que el motor embebido llama al motor puro, no que la
// cadena de rebotes funcione. La cobertura de comportamiento vive en test-motor.js
// (que bootea el componente y corre el vuelo) y llega completa en la Task 7.
const fs = require('fs');
const cuerpo = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/
  .exec(fs.readFileSync('Revolea el Palo.dc.html', 'utf8'))[1];
ck('el motor usa Motor.resolverRebote', /Motor\.resolverRebote/.test(cuerpo));
ck('el motor usa Motor.acreditar', /Motor\.acreditar/.test(cuerpo));
ck('el motor usa Motor.rellenar', /Motor\.rellenar/.test(cuerpo));
ck('ya no hay aletazos', !/g\.air/.test(cuerpo), 'quedó g.air en el motor');
ck('hay un método tocar()', /tocar\s*\(\s*\)\s*\{/.test(cuerpo));

// Un solo test de cruce de cima en todo el proyecto. pasoDeLlegada (de donde sale
// el centro de la ventana de toque) tenía el cruce escrito a mano y MÁS ESTRICTO
// que el de alcanzables: exigía que el paso cayera dentro del obstáculo en vez de
// que el segmento lo solapara. Resultado: un cruce rápido sobre un obstáculo
// angosto salía elegido como objetivo pero sin paso de llegada, y tocar() se iba
// por el early return — ese obstáculo era intocable. Es la misma divergencia que la
// Task 3 mató extrayendo cruzaCima, reintroducida un archivo más allá.
// Se prohíbe COMPARAR contra .cima, no leer el campo: la Task 6 necesita
// g.objetivo.cima para poner el anillo de timing en pantalla, y un `!/\.cima/` a
// secas la bloquearía. El peligro es re-escribir el TEST DE CRUCE, y todo test de
// cruce necesita un operador de comparación pegado al campo, en cualquiera de los
// dos órdenes. Se chequea sobre el código sin comentarios: `cima` va en la prosa.
const codigo = cuerpo.replace(/\/\/[^\n]*/g, '');
ck('el paso de llegada usa Motor.cruzaCima', /Motor\.cruzaCima\(/.test(codigo));
ck('no quedó ningún cruce de cima escrito a mano',
  !/[<>]=?\s*[\w.[\]]*\.cima|\.cima\s*[<>]/.test(codigo),
  'hay una comparación contra .cima fuera de Motor.cruzaCima');

// --- bot: la destreza tiene que dominar al azar ---
// Se copia el arnés de test-motor.js: stubea DOM, canvas y audio para poder
// instanciar el Component sin navegador.
function arnes() {
  let VT = 1000;
  const el = () => ({ style:{}, offsetWidth:1, width:0, height:0, getContext:()=>ctx(), textContent:'' });
  const MET = ['fillRect','drawImage','save','restore','translate','rotate','beginPath','arc',
    'ellipse','moveTo','lineTo','fill','stroke','setLineDash','setTransform','fillText','clearRect'];
  const ctx = () => { const o = {}; for (const k of MET) o[k] = () => {}; return o; };
  global.performance = { now: () => VT };
  global.document = { hidden:false, createElement:()=>el(), addEventListener(){}, removeEventListener(){} };
  global.requestAnimationFrame = ()=>1; global.cancelAnimationFrame = ()=>{};
  global.setInterval = ()=>2; global.clearInterval = ()=>{};
  global.localStorage = { getItem:()=>null, setItem(){} };
  global.Image = class { set src(v){ this.complete=true; this.naturalWidth=26; this.naturalHeight=13;
    if (this.onload) this.onload(); } };
  global.Audio = class { constructor(){this.volume=1;} play(){return Promise.resolve();}
    pause(){} addEventListener(){} };
  global.AudioContext = undefined;
  global.window = { addEventListener(){}, removeEventListener(){} };
  global.React = { createRef: () => ({ current: el() }) };
  global.Motor = M;
  class DCLogic { constructor(){ this.props={}; this.state={}; }
    setState(u,cb){ Object.assign(this.state, typeof u==='function'?u(this.state):u);
      if (cb) cb(); if (this.componentDidUpdate) this.componentDidUpdate({}); }
    componentDidMount(){} componentDidUpdate(){} componentWillUnmount(){} renderVals(){return{};} }
  global.DCLogic = DCLogic;
  const C = new Function('DCLogic','React','window','document','performance','Motor',
    cuerpo + '\nreturn Component;')(DCLogic, React, window, document, performance, M);
  return { C, adv: ms => { VT += ms; }, now: () => VT };
}

const TOPE = 40000;   // pasos de lógica: dónde se corta el vuelo del bot

// Un vuelo completo con un bot cuyo error de timing es `errorMs`.
//
// El error es JITTER y no un adelanto sistemático, y eso importa: el desfase que
// mide tocar() está cuantizado a pasos de física, que son STEP/VUELO = 30,3 ms de
// reloj. Un bot que toca "en cuanto cree que llegó" tiene desfase 0 tanto con 20 ms
// de error como con 0, o sea que los dos perfiles de arriba de la curva son EL
// MISMO bot: la aserción de monotonía compararía un bot contra sí mismo y no
// podría fallar. Sorteando el desfase en [-errorMs, +errorMs] los cuatro perfiles
// son distintos de verdad, y además se ejercita la mitad TARDÍA de la ventana, que
// un bot que sólo se adelanta no toca nunca.
//
// El sorteo usa su propio LCG y no Math.random: la medición de ruido necesita que
// el azar del bot y el del escenario sean independientes, y Math.random acá es el
// del escenario.
function vuelo(errorMs, semilla, tope) {
  const { C, adv, now } = arnes();
  const c = new C();
  c.props = { tiros: 1, censura: 'Sin filtro', viento: false, sonido: false };
  c.componentDidMount();
  c.state.player = { id:'x', name:'bot', emoji:'x', best:0 };
  let s = semilla; Math.random = () => (s = (s*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  c.start();
  for (let i = 0; i < 8000 && c.g.phase !== 'ready'; i++) { adv(M.F.STEP); c.tick(now()); }
  c.begin();
  for (let i = 0; i < 30; i++) { adv(M.F.STEP); c.tick(now()); }
  c.g.manual = true; c.g.angle = 45; c.g.power = 1;
  c.fire();
  // vx en el momento de cada rebote: es el estado que modela la cadena del
  // presupuesto de legibilidad en test-generador.js.
  let vxRebote = 0;
  const origRebote = c.aplicarRebote.bind(c);
  c.aplicarRebote = d => {
    vxRebote = Math.max(vxRebote, Math.abs(c.g.club.vx)); return origRebote(d); };
  const msPaso = M.F.STEP / M.F.VUELO;          // ms de reloj por paso de física
  const pulso = M.lcg(semilla ^ 0x5bf03635);    // el pulso del bot, aparte del escenario
  let pasos = 0, objAnt = null, pasoAnt = null, kToque = 0;
  while (pasos < (tope || TOPE) && (c.g.phase === 'fly' || c.g.phase === 'swing')) {
    adv(M.F.STEP); c.tick(now()); pasos++;
    const g = c.g;
    if (g.phase === 'fly' && g.objetivo && g.pasoObjetivo != null) {
      // objetivo nuevo ⇒ nuevo sorteo. kToque son los pasos que le faltan al palo
      // cuando el bot decide tocar: >0 se adelanta, <0 se atrasa.
      if (g.objetivo !== objAnt || g.pasoObjetivo !== pasoAnt) {
        objAnt = g.objetivo; pasoAnt = g.pasoObjetivo;
        kToque = Math.round(-(pulso() * 2 - 1) * errorMs / msPaso);
      }
      if (g.pasoObjetivo - (g.pasosVuelo || 0) <= kToque) c.tocar();
    }
  }
  // tick() se come las excepciones del loop en window.__loopErr. Sin esto un vuelo
  // que explotó a la mitad se mide como un vuelo corto y las cuatro aserciones
  // pasarían midiendo un juego roto.
  if (global.window.__loopErr) throw new Error('el loop explotó: ' + global.window.__loopErr);
  return { pts: c.g.puntos, pasos: pasos, combo: c.g.combo, vxRebote: vxRebote };
}

const mediana = a => a.slice().sort((x,y)=>x-y)[a.length >> 1];
// ms de error: de torpe a perfecto. Los perfiles tienen que caer en bandas de rebote
// DISTINTAS, si no la curva no mide destreza. Con [120, 60, 20, 0] los de 20 y 0
// daban los dos 100% de rebotes perfectos —±20 ms redondea a ±1 paso de física, o
// sea ±30,3 ms, que entra en VENTANA_PERFECTO (60)— así que ese par comparaba ruido
// de geometría y ninguno de los cuatro llegaba nunca a la banda de raspón, que
// arranca en ~166 ms. Con 200 ms se cruza VENTANA_BUENO y cada par adyacente difiere
// en su mezcla de tipos de rebote.
const perfiles = [200, 120, 60, 0];
const medianas = perfiles.map(e => mediana(
  Array.from({ length: 25 }, (_, i) => vuelo(e, 1000 + i * 37).pts)));

ck('la destreza es monótona: menos error ⇒ más puntos',
  medianas.every((v, i) => i === 0 || v >= medianas[i-1]),
  perfiles.map((e,i)=>e+'ms='+medianas[i]).join('  '));

// El ruido es la varianza del score con la MISMA entrada (error 0, sin jitter) y
// distinto escenario: es lo que el jugador no controla. La señal es lo que separa
// al impecable del torpe. El juego viejo medía 1,48 acá.
const fijo = Array.from({ length: 40 }, (_, i) => vuelo(0, 5000 + i * 91));
const pts = fijo.map(r => r.pts);
const med = pts.reduce((a,b)=>a+b,0) / pts.length;
const ruido = Math.sqrt(pts.reduce((a,b)=>a+(b-med)**2,0) / pts.length);
const senal = medianas[3] - medianas[0];
ck('señal/ruido > 3', senal > ruido * 3,
  'señal ' + Math.round(senal) + ' / ruido ' + Math.round(ruido) +
  ' = ' + (senal / Math.max(1, ruido)).toFixed(2));

const perfecto = vuelo(0, 777);
// Los dos pisos se miden en el PEOR de los 41 vuelos impecables y no en uno solo:
// "no muere nunca" verificado en una semilla es la clase de garantía flojita que ya
// costó tres rondas de arreglos. Los 40 vuelos del ruido son con error 0, así que
// ya están medidos y sirven de barrido gratis.
const impecables = fijo.concat([perfecto]);
const peorPasos = Math.min(...impecables.map(r => r.pasos));
const peorPts = Math.min(...impecables.map(r => r.pts));
ck('el bot perfecto no muere: vuela hasta el corte', peorPasos >= 39000,
  'el peor de ' + impecables.length + ' vuelos impecables murió a los ' + peorPasos + ' pasos');
ck('sin techo: el bot perfecto puntúa mucho más que el torpe',
  peorPts > medianas[0] * 10,
  'el peor impecable hizo ' + peorPts + ' contra ' + medianas[0] + ' del torpe');

// El juego viejo se clavaba en ~5000 puntos y al intento 205 dejaba de mejorar. Que
// el impecable puntúe mucho no descarta eso: hace falta ver que el score no se
// SATURE con el largo del vuelo. Como el bot con error 0 no sortea nada, medio vuelo
// con la misma semilla es exactamente el prefijo del vuelo entero, así que la
// segunda mitad es la resta. Tiene que pagar más que la primera, porque el combo
// sigue creciendo: un tope de score o de combo pasa las cuatro aserciones de arriba
// y se cae acá.
// El presupuesto de legibilidad de test-generador.js corre su cadena de rebotes a
// vx=9 y no a VX_MAX. Eso vale sólo mientras la cadena de verdad no llegue a 9: si
// llegara, el presupuesto estaría medido por debajo del peor caso y diría 848 ms
// donde el jugador ve 758. Acá se mide con el bot, que es el único que corre cadenas
// largas de verdad. Medido: el peor rebote de los 41 vuelos va a 6,95.
const peorVxRebote = Math.max(...impecables.map(r => r.vxRebote));
ck('la cadena nunca llega a la velocidad que supone el presupuesto de legibilidad',
  peorVxRebote < 9, 'el rebote más rápido fue a vx ' + peorVxRebote.toFixed(2) + ' y el ' +
  'presupuesto mide la cadena a 9');

const mitad = vuelo(0, 777, TOPE / 2).pts;
ck('sin plateau: la segunda mitad del vuelo paga más que la primera',
  perfecto.pts - mitad > mitad,
  'primera mitad ' + mitad + ', segunda ' + (perfecto.pts - mitad));

console.log('destreza: ' + perfiles.map((e,i)=>e+'ms=' + medianas[i]).join('  ') +
  '  |  señal/ruido ' + (senal / Math.max(1, ruido)).toFixed(2) +
  ' (σ ' + Math.round(ruido) + ', ' + Math.min(...pts) + '..' + Math.max(...pts) + ' con entrada idéntica)' +
  '\n          peor de ' + impecables.length + ' impecables: ' + peorPasos + ' pasos y ' + peorPts +
  ' pts; combo ×' + perfecto.combo + '; segunda mitad del vuelo ' +
  ((perfecto.pts - mitad) / Math.max(1, mitad)).toFixed(1) + '× la primera');
console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — rebote, combo, puntaje, variedad y destreza');
process.exit(fail.length ? 1 : 0);
