// Banco de pruebas headless para el script de juego de "Revolea el Palo.dc.html".
// Stubea React/canvas/audio/DOM y corre el loop con reloj virtual para verificar
// que no explota, que los arrays quedan acotados y que el paso fijo es estable.
const fs = require('fs');
const path = process.argv[2];
const src = fs.readFileSync(path, 'utf8');
const m = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(src);
if (!m) throw new Error('no dc script');

// ---- reloj virtual -------------------------------------------------------
let VT = 1000;
const stats = { fillRect: 0, drawImage: 0, textWrites: 0, styleWrites: 0, fillStyleSets: 0 };

function el() {
  const style = new Proxy({}, {
    set(t, k, v) { stats.styleWrites++; t[k] = v; return true; },
  });
  // los refs también hacen de canvas (this.cv apunta a uno)
  const o = { style, offsetWidth: 1, width: 0, height: 0, getContext: () => ctx2d() };
  return new Proxy(o, {
    set(t, k, v) { if (k === 'textContent') stats.textWrites++; t[k] = v; return true; },
    get(t, k) { return t[k]; },
  });
}

const CTX_METHODS = ['fillRect','drawImage','save','restore','translate','rotate','beginPath',
  'arc','ellipse','moveTo','lineTo','fill','stroke','setLineDash','setTransform','fillText','clearRect'];
function ctx2d() {
  const o = {};
  for (const k of CTX_METHODS) o[k] = () => { if (stats[k] !== undefined) stats[k]++; };
  return new Proxy(o, {
    set(t, k, v) { if (k === 'fillStyle') stats.fillStyleSets++; t[k] = v; return true; },
  });
}
function canvas() { return { width: 0, height: 0, getContext: () => ctx2d() }; }

// ---- globals -------------------------------------------------------------
const listeners = {};
global.performance = { now: () => VT };
global.document = {
  hidden: false,
  createElement: (t) => (t === 'canvas' ? canvas() : el()),
  addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); },
  removeEventListener: () => {},
};
global.requestAnimationFrame = () => 1;   // el loop se maneja a mano
global.cancelAnimationFrame = () => {};
global.setInterval = () => 2;
global.clearInterval = () => {};
global.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; } };

class FakeImage {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) { this._src = v; this.complete = true; this.naturalWidth = 26; this.naturalHeight = 13;
    if (this.onload) this.onload(); }
  get src() { return this._src; }
}
global.Image = FakeImage;
global.Audio = class { constructor() { this.volume = 1; } play() { return Promise.resolve(); }
  pause() {} addEventListener() {} };

const node = () => ({ connect() {}, start() {}, stop() {}, frequency: { value: 0,
  setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
  type: '', buffer: null });
global.AudioContext = class {
  constructor() { this.sampleRate = 48000; this.state = 'running'; this.destination = node(); }
  get currentTime() { return VT / 1000; }
  createOscillator() { return node(); } createGain() { return node(); }
  createBufferSource() { return node(); }
  createBuffer(ch, n) { stats.buffersMade = (stats.buffersMade || 0) + 1;
    return { getChannelData: () => new Float32Array(n) }; }
  resume() {} suspend() {}
};
global.window = { addEventListener: () => {}, removeEventListener: () => {}, AudioContext: global.AudioContext };

global.React = { createRef: () => ({ current: el() }) };
// En el navegador motor.js declara window.Motor y el motor embebido lo lee como
// global suelto. Acá se inyecta el módulo REAL (no un stub) para que el vuelo del
// test corra la misma física y el mismo generador que el juego.
global.Motor = require('./motor.js');

class DCLogic {
  constructor() { this.props = {}; this.state = {}; }
  setState(u, cb) { Object.assign(this.state, typeof u === 'function' ? u(this.state) : u);
    if (cb) cb(); if (this.componentDidUpdate) this.componentDidUpdate({}); }
  componentDidMount() {} componentDidUpdate() {} componentWillUnmount() {}
}
global.DCLogic = DCLogic;

// ---- instanciar ----------------------------------------------------------
const Component = new Function('DCLogic', 'React', 'window', 'document', 'performance',
  m[1] + '\nreturn Component;')(DCLogic, React, window, document, performance);

const c = new Component();
c.props = { tiros: 3, censura: 'Sin filtro', viento: true, sonido: true };
c.componentDidMount();

function ticks(n, msPerTick = 1000 / 60) {
  for (let i = 0; i < n; i++) { VT += msPerTick; c.tick(VT); }
}
// La intro es un putt de largo aleatorio, así que hay que esperar por estado y no
// por una cantidad fija de frames.
function until(d, pred, max = 4000) {
  for (let i = 0; i < max; i++) { if (pred()) return true; VT += 1000 / 60; d.tick(VT); }
  return pred();
}

const fail = [];
const ck = (name, ok, extra) => { if (!ok) fail.push(name + (extra ? ' :: ' + extra : '')); };

ck('loop arrancado en title? no', !c.raf);
c.start();                      // -> screen play, newShot(true)
ck('loop corriendo en play', !!c.raf);

// intro (el putt fallado) + espera a que pase a ready
ck('fase ready tras la intro', until(c, () => c.g.phase === 'ready'), c.g.phase);

// Escenario DETERMINISTA. newShot siembra con Math.random(), así que sin fijar la
// semilla el vuelo de prueba es distinto en cada corrida: medido 2 de 20 veces el palo
// se estrellaba contra un obstáculo que NO era el objetivo, buscarObjetivo devolvía
// null y el vuelo terminaba en 1 rebote. Eso es el comportamiento correcto (un choque
// contra una pared corta la cadena), pero hace irreproducibles las aserciones de la
// cadena. Con la semilla fija el arco entero es determinista y se pueden exigir
// números exactos. Se pisa después de la intro y antes de revolear.
c.g.rand = Motor.lcg(20260817);
c.g.obs = Motor.generar(c.g.rand, 430, 20000);

// cargar y revolear
c.begin();
ck('fase charge', c.g.phase === 'charge', c.g.phase);
ticks(90);
c.fire();
ticks(20);
ck('fase fly', c.g.phase === 'fly', c.g.phase);

// vuelo largo: la cadena de rebotes + medición del crecimiento de los arrays.
// tocar() reemplazó a flap(). El toque NO puede ir cada N frames como iba el
// aletazo: el primero caía con un desfase enorme, salía raspón, el palo se venía
// abajo y el vuelo moría en el primer eslabón (medido: 1 rebote, 135 m). Se toca
// cuando el arco llega al objetivo, que es lo que hace un jugador. Y se deja de
// tocar a los 12 rebotes A PROPÓSITO: un jugador impecable no baja nunca (el
// impulso perfecto devuelve la energía entera), así que sin corte el vuelo no
// termina y la aserción de "el tiro terminó" de abajo no podría cumplirse.
const REBOTES_A_JUGAR = 12;
// Un paso de física equivale a STEP/VUELO ≈ 30,3 ms de reloj, así que el desfase sale
// de la ventana misma: ceil(160/30,3)+1 = 7 pasos ≈ 212 ms, apenas pasada la
// VENTANA_BUENO de 160, o sea raspón garantizado y justo en el borde. Se deriva de las
// constantes y no se hardcodea para que la calibración de la Task 7 no lo deje del
// lado de adentro de la ventana en silencio.
const PASOS_TARDE = Math.ceil(Motor.F.VENTANA_BUENO / (Motor.F.STEP / Motor.F.VUELO)) + 1;
let maxObs = 0, maxPel = 0, objSinPaso = 0, rebotes = 0, maxCombo = 1;
let comboCadena = 0, comboAntesTarde = 0, comboTrasTarde = -1, comboRoto = 0;
// se cuentan los rebotes que de verdad se resolvieron, no los toques: tocar() se
// va por el early return si no hay objetivo y eso no es un rebote.
const origReb = c.aplicarRebote.bind(c);
c.aplicarRebote = d => { rebotes++; origReb(d);
  // Invariante POR REBOTE, no por total: en la fase de cadena el toque va exacto en la
  // llegada, o sea desfase 0, o sea perfecto, o sea combo === rebotes+1 después de cada
  // uno. Un solo rebote que no sea perfecto la rompe. A diferencia de las cifras
  // exactas de abajo, esta no se cuelga de la semilla.
  if (rebotes <= REBOTES_A_JUGAR && c.g.combo !== rebotes + 1) comboRoto++; };
for (let i = 0; i < 60000 && c.g.phase === 'fly'; i++) {
  VT += 1000 / 60; c.tick(VT);
  const listo = c.g.objetivo && c.g.pasoObjetivo != null;
  if (rebotes < REBOTES_A_JUGAR && listo && c.g.pasosVuelo >= c.g.pasoObjetivo) {
    c.tocar();
    // el combo justo al cerrar la cadena, antes de que el toque tarde lo parta
    if (rebotes === REBOTES_A_JUGAR) comboCadena = c.g.combo;
  }
  // UN toque deliberadamente fuera de ventana, ya cerrada la cadena. Sin esto ningún
  // test del motor en vivo ejercitaba 'bueno' ni 'raspon': tocando siempre en la
  // llegada el desfase es 0 y sólo salen perfectos, así que el cableado de comboTras
  // (partir el combo al medio) estaba cubierto sólo a nivel unitario en motor.js.
  // Va ADELANTADO, no atrasado: resolverRebote usa Math.abs(desfase) (test-destreza
  // fija que el signo no importa) y atrasarse es indeterminista — 7 pasos después de
  // la llegada el palo puede haber tocado el suelo si la cima del objetivo era baja,
  // y ahí el vuelo se termina sin que el toque llegue a ocurrir (medido: fallaba
  // 2 de cada 10 corridas). Adelantado el palo está garantizadamente en el aire.
  // El gate de rebotes va explícito: con sólo el `else if` esto se disparaba en el
  // PRIMER arco (ahí pasoObjetivo-pasosVuelo también pasa por 7), metía un raspón en
  // el eslabón 1 y dejaba la cadena en combo 12.
  else if (rebotes >= REBOTES_A_JUGAR && comboTrasTarde < 0 && listo &&
           c.g.pasoObjetivo - c.g.pasosVuelo === PASOS_TARDE) {
    comboAntesTarde = c.g.combo; c.tocar(); comboTrasTarde = c.g.combo;
  }
  // Un objetivo elegido SIEMPRE tiene que tener paso de llegada: si no, tocar() se
  // va por el early return y ese obstáculo es intocable.
  // HONESTIDAD: verificado a mano que esta aserción NO discrimina sobre este vuelo
  // — con pasoDeLlegada escribiendo el cruce a mano (más estricto que el de
  // alcanzables) también da 0, porque la divergencia sólo aparece en cruces rápidos
  // sobre obstáculos angostos (~4,5% de los objetivos según la Task 3) y 12 rebotes
  // no alcanzan a pegarle. Queda como guarda de regresión barata; lo que de verdad
  // ataca ese bug son las dos aserciones de cruzaCima en test-destreza.js.
  if (c.g.objetivo && c.g.pasoObjetivo == null) objSinPaso++;
  maxCombo = Math.max(maxCombo, c.g.combo);
  maxObs = Math.max(maxObs, c.g.obs.length);
  maxPel = Math.max(maxPel, (c.g.pel || []).length);
}
const dist = Math.round((c.g.club.x - 26) / 3);

ck('sin error en el loop', !global.window.__loopErr, global.window.__loopErr);
ck('el tiro terminó', c.g.phase !== 'fly', 'quedó en ' + c.g.phase);
ck('todo objetivo elegido tiene paso de llegada', objSinPaso === 0,
  objSinPaso + ' objetivos sin pasoObjetivo');
// Encadena de verdad: no alcanza con que un rebote se resuelva. Se exige que el
// vuelo llegue a los 12 rebotes pedidos, o sea que cada rebote deje un objetivo
// nuevo alcanzable. Con timing al azar esto daba rebotes=1: la aserción muerde.
ck('la cadena encadena', rebotes >= REBOTES_A_JUGAR, 'sólo ' + rebotes + ' rebotes');
// Tocando en la llegada el desfase es 0, así que los 12 tienen que salir perfectos y
// el combo tiene que valer exactamente 12+1. `combo > 1` pasaba con UN solo perfecto
// y 11 raspones; esto no: fija la cuenta entera. Es además la prueba de que
// pasoDeLlegada apunta al momento real del arco y no a uno cualquiera.
ck('los 12 rebotes de la cadena son perfectos', comboCadena === REBOTES_A_JUGAR + 1,
  'combo al cerrar la cadena ' + comboCadena + ' (esperado ' + (REBOTES_A_JUGAR + 1) + ')');
ck('cada rebote de la cadena deja el combo en rebotes+1', comboRoto === 0,
  comboRoto + ' rebotes de la cadena no fueron perfectos');
ck('la cadena acredita puntos', c.g.puntos > 0, 'puntos ' + c.g.puntos);
// El toque tarde tiene que partir el combo al medio, redondeando para abajo y con
// piso en 1: es comboTras(combo,'raspon') cableado de punta a punta. Se compara
// contra el valor exacto, no contra "bajó": una implementación que lo mandara a 1
// de una, o que le restara 1, pasaría un `<` y falla acá.
ck('hubo un toque fuera de ventana de verdad', comboTrasTarde >= 0,
  'nunca se disparó el toque tarde');
ck('el toque fuera de ventana parte el combo al medio',
  comboTrasTarde === Math.max(1, Math.floor(comboAntesTarde / 2)),
  'de ' + comboAntesTarde + ' pasó a ' + comboTrasTarde +
  ' (esperado ' + Math.max(1, Math.floor(comboAntesTarde / 2)) + ')');
ck('g.obs no crece sin techo', maxObs < 200, 'pico ' + maxObs);
ck('g.pel acotado (<40)', maxPel < 40, 'pico ' + maxPel);
ck('fx/dust compactados', c.g.fx.length < 200 && c.g.dust.length < 200);
ck('buffers de ruido cacheados (<12)', (stats.buffersMade || 0) < 12, 'creados ' + stats.buffersMade);

// Vuelo largo forzado: es el caso que hacía crecer g.obs sin techo. Se compara
// con la misma corrida y cull() anulado para confirmar que la poda hace algo.
function longFlight(withCull) {
  const d = new Component();
  d.props = { tiros: 3, censura: 'Sin filtro', viento: false, sonido: false };
  VT += 1e5; d.componentDidMount(); d.start();
  if (!withCull) d.cull = () => {};
  if (!until(d, () => d.g.phase === 'ready')) throw new Error('la intro no terminó');
  d.begin(); for (let i = 0; i < 90; i++) { VT += 1000 / 60; d.tick(VT); }
  d.fire();
  let peak = 0, scans = 0;
  for (let i = 0; i < 40000; i++) {
    VT += 1000 / 60; d.tick(VT);
    const c = d.g.club;
    if (c && i % 120 === 0) { c.vy = -7; c.vx = 15; c.grounded = false; c.crashed = false; }
    peak = Math.max(peak, d.g.obs.length);
    scans += d.g.obs.length;
  }
  return { peak, scans, m: Math.round((d.g.club.x - 26) / 3), err: global.window.__loopErr };
}
global.window.__loopErr = null;
const withCull = longFlight(true);
global.window.__loopErr = null;
const noCull = longFlight(false);
console.log('vuelo largo (' + withCull.m + ' m): pico g.obs con poda=' + withCull.peak +
  ', sin poda=' + noCull.peak);
ck('poda: g.obs acotado en vuelo largo', withCull.peak < 200, 'pico ' + withCull.peak);
ck('poda: recorre bastante menos que sin poda',
  withCull.scans * 3 < noCull.scans, withCull.scans + ' vs ' + noCull.scans);
ck('vuelo largo sin errores', !withCull.err, withCull.err);

// paso fijo: la misma cantidad de tiempo real debe dar la misma cantidad de pasos
// sin importar el ritmo de frames (60 Hz vs 120 Hz vs frames irregulares).
function stepsOver(msPerTick, totalMs) {
  const d = new Component();
  d.props = { tiros: 3, censura: 'Sin filtro', viento: false, sonido: false };
  VT = 1e6; d.componentDidMount(); d.start();
  let n = 0; const orig = d.step.bind(d);
  d.step = () => { n++; orig(); };
  const frames = Math.round(totalMs / msPerTick);
  for (let i = 0; i < frames; i++) { VT += msPerTick; d.tick(VT); }
  return n;
}
const s60 = stepsOver(1000 / 60, 6000);
const s120 = stepsOver(1000 / 120, 6000);
const s30 = stepsOver(1000 / 30, 6000);
ck('60 Hz ≈ 360 pasos en 6 s', Math.abs(s60 - 360) <= 3, s60);
ck('120 Hz da los mismos pasos que 60 Hz', Math.abs(s120 - s60) <= 3, s120 + ' vs ' + s60);
ck('30 Hz da los mismos pasos que 60 Hz', Math.abs(s30 - s60) <= 6, s30 + ' vs ' + s60);

// hipo grande: no debe intentar recuperar la deuda de golpe
const d = new Component();
d.props = { tiros: 3, censura: 'Sin filtro', viento: false, sonido: false };
VT = 2e6; d.componentDidMount(); d.start();
let burst = 0; const o2 = d.step.bind(d); d.step = () => { burst++; o2(); };
VT += 5000; d.tick(VT);
ck('hueco de 5 s no dispara catch-up', burst <= 4, burst + ' pasos');

console.log('distancia del vuelo de prueba: ' + dist + ' m');
console.log('picos: obs=' + maxObs + ' pel=' + maxPel);
console.log('cadena de rebotes: ' + rebotes + ' rebotes, ' + c.g.puntos + ' puntos, combo max ' +
  maxCombo + ', combo al cerrar la cadena ' + comboCadena +
  ', objetivos sin paso de llegada: ' + objSinPaso);
console.log('toque fuera de ventana (' + PASOS_TARDE + ' pasos adelantado = ' +
  Math.round(PASOS_TARDE * (Motor.F.STEP / Motor.F.VUELO)) + ' ms de desfase): combo ' +
  comboAntesTarde + ' -> ' + comboTrasTarde);
console.log('escrituras de texto en el DOM: ' + stats.textWrites + ', de style: ' + stats.styleWrites);
console.log('fillStyle asignados: ' + stats.fillStyleSets + ' / fillRect: ' + stats.fillRect);
console.log(fail.length ? '\nFALLAS:\n- ' + fail.join('\n- ') : '\nTODO OK');
process.exit(fail.length ? 1 : 0);
