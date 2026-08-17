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
// Cuando REC es un array, cada llamada al contexto queda anotada con los colores
// vigentes. Es lo que reemplaza al "verificar a ojo en el navegador": el entorno de
// desarrollo no compone frames, así que en vez de mirar el dibujo se lo graba.
let REC = null;
// save/restore apilan el estado de verdad: sin eso strokeStyle se quedaba pegado en
// el último color asignado y cualquier arc posterior parecía dibujado con él.
const ESTADO = ['fillStyle','strokeStyle','lineWidth','globalAlpha','font','textAlign'];
function ctx2d() {
  const o = {}, pila = [];
  for (const k of CTX_METHODS) o[k] = (...a) => { if (stats[k] !== undefined) stats[k]++;
    if (k === 'save') pila.push(ESTADO.map(x => o[x]));
    else if (k === 'restore') { const s = pila.pop(); if (s) ESTADO.forEach((x, i) => { o[x] = s[i]; }); }
    if (REC) REC.push({ op: k, a: a, fill: o.fillStyle, stroke: o.strokeStyle }); };
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

// ---- lo que el jugador tiene que VER (Task 6) -----------------------------
// El paso 3 del brief pedía verificar a ojo en el navegador. El entorno no compone
// frames (la captura se cuelga), así que se verifica sobre las llamadas al contexto:
// se graba cada draw() y se afirma lo que un humano miraría. Lo que NO cubre esto:
// si el pixel art se lee bien al zoom de 2,5x. Eso es juicio humano y queda abierto.
const ARCO = 'rgba(244,238,218,.35)', ORO = '#E8C34A';
const PROPS = { tiros: 3, censura: 'Sin filtro', viento: false, sonido: false };
function reposo() {
  const d = new Component();
  d.props = PROPS;
  VT += 1e5; d.componentDidMount(); d.start();
  if (!until(d, () => d.g.phase === 'ready')) throw new Error('la intro no terminó');
  // misma semilla que el vuelo de arriba: escenario reproducible
  d.g.rand = Motor.lcg(20260817); d.g.obs = Motor.generar(d.g.rand, 430, 20000);
  d.g.shake = 0; return d;
}
// El shake se pone en 0 antes de cada frame para que el transform no lleve el
// corrimiento aleatorio y las cuentas de cobertura sean exactas.
function revolear(d) {
  d.begin(); for (let i = 0; i < 90; i++) { VT += 1000 / 60; d.tick(VT); }
  d.fire(); for (let i = 0; i < 20; i++) { VT += 1000 / 60; d.tick(VT); }
  d.g.shake = 0; return d;
}
function grabar(d) { d.g.shake = 0; REC = []; d.draw(); const r = REC; REC = null; return r; }
// el transform que quedó vigente: el zoom lo pisa después del base
const trDe = f => (f.filter(x => x.op === 'setTransform').pop() || {}).a;
const dev = (t, x, y) => [t[0] * x + t[4], t[3] * y + t[5]];
const puntos = f => f.filter(x => x.op === 'fillRect' && x.fill === ARCO);
// La marca se identifica por su geometría exacta (ancho del objetivo, 2 px de alto,
// justo arriba de su cima): el pico del pelícano también es un rect dorado de 2 px
// de alto y con un filtro sólo por color contaba como marca.
const marca = (f, o) => f.filter(x => x.op === 'fillRect' && x.fill === ORO &&
  x.a[3] === 2 && x.a[2] === o.w && x.a[1] === Math.round(o.cima - 2));
const anillo = f => f.filter(x => x.op === 'arc' && x.stroke === ORO);
// ¿algún fillRect tapa este punto del canvas (en px de dispositivo)?
const tapado = (f, t, x, y) => f.some(p => p.op === 'fillRect' &&
  x >= t[0] * p.a[0] + t[4] && x <= t[0] * (p.a[0] + p.a[2]) + t[4] &&
  y >= t[3] * p.a[1] + t[5] && y <= t[3] * (p.a[1] + p.a[3]) + t[5]);
const esquinasSinPintar = (f) => { const t = trDe(f); let n = 0;
  for (const x of [0, 134 * 2]) for (const y of [0, 291 * 2]) if (!tapado(f, t, x, y)) n++;
  return n; };
// NaN/undefined en cualquier coordenada. Con {alpha:false} y sin clearRect un NaN no
// tira excepción: pinta cualquier cosa y el frame sale roto en silencio.
const CON_COORDS = new Set(['fillRect','arc','ellipse','moveTo','lineTo','translate',
  'rotate','setTransform','clearRect','drawImage','fillText']);
function coordsMalas(f) { let n = 0;
  for (const p of f) { if (!CON_COORDS.has(p.op)) continue;
    for (const v of p.a) { if (typeof v === 'number') { if (!Number.isFinite(v)) n++; }
      else if (v === undefined) n++; } }
  return n; }

const dv = reposo();
const fRep = grabar(dv);
ck('fuera del vuelo la escala es 2', trDe(fRep)[0] === 2 && trDe(fRep)[3] === 2, trDe(fRep));
ck('fuera del vuelo el fondo tapa las 4 esquinas', esquinasSinPintar(fRep) === 0,
  esquinasSinPintar(fRep) + ' esquinas sin pintar');
ck('fuera del vuelo no hay arco predicho', puntos(fRep).length === 0, puntos(fRep).length);
revolear(dv);
const fVue = grabar(dv), tVue = trDe(fVue);
const ESC = 2 / Motor.F.ZOOM_VUELO;
ck('en vuelo la escala es 2/ZOOM_VUELO', tVue[0] === ESC && tVue[3] === ESC, tVue);
// El zoom ensancha el encuadre a W*z: si los fondos siguen midiendo W+16 quedan
// franjas sin pintar, y sin clearRect ahí queda basura del frame anterior.
ck('en vuelo el fondo tapa las 4 esquinas', esquinasSinPintar(fVue) === 0,
  esquinasSinPintar(fVue) + ' esquinas sin pintar');
const pv = puntos(fVue);
ck('el arco predicho se dibuja', pv.length > 5, pv.length + ' puntos');
// Sin recorte el arco son ~100 puntos de hasta 6.000 px: casi todos afuera del
// canvas. Se tolera 1 px por el Math.round de px() en el borde exacto del encuadre.
let afuera = 0;
for (const p of pv) { const [x, y] = dev(tVue, p.a[0], p.a[1]);
  if (x < -1 || y < -1 || x > 134 * 2 + 1 || y > 291 * 2 + 1) afuera++; }
ck('todos los puntos del arco caen dentro del canvas', afuera === 0,
  afuera + ' de ' + pv.length + ' afuera');
const obj = dv.g.objetivo;
ck('con objetivo hay marca dorada sobre su cima', marca(fVue, obj).length === 1,
  marca(fVue, obj).length + ' marcas');
ck('con objetivo hay anillo de timing', anillo(fVue).length === 1, anillo(fVue).length + ' anillos');
dv.g.objetivo = null;
const fSin = grabar(dv);
ck('sin objetivo no hay marca ni anillo',
  marca(fSin, obj).length === 0 && anillo(fSin).length === 0,
  marca(fSin, obj).length + ' marcas, ' + anillo(fSin).length + ' anillos');
// que el frame sin objetivo siga dibujando el arco es lo que hace específica a la
// aserción de arriba: no pasa por "en ese frame no se dibujó nada".
ck('sin objetivo el arco predicho sigue estando', puntos(fSin).length > 5, puntos(fSin).length);

// El anillo se cierra: dentro de un mismo objetivo el radio nunca crece, y al menos
// uno tiene que ir de ancho (>=20) a apretado (<=3). Un radio constante pasaría el
// "nunca crece" pero falla el cierre.
const dr = revolear(reposo());
let anilloCrecio = 0, cerrados = 0, frames = 0, coordsRotas = 0, rebR = 0, prevR = null, prevPO = null;
let maxR = 0, minR = 99, arbVis = 0, arbFalt = 0;
const TRONCO = '#3D2A18'; // el tronco del árbol: un color que no usa nada más
for (let i = 0; i < 60000 && dr.g.phase === 'fly'; i++) {
  dr.g.shake = 0;
  REC = []; VT += 1000 / 60; dr.tick(VT); const f = REC; REC = null;
  const t = trDe(f);
  if (t) { frames++; coordsRotas += coordsMalas(f);
    // Todo obstáculo dentro del encuadre tiene que estar dibujado. El encuadre se
    // despeja del transform grabado (X en el borde del canvas), no de la fórmula del
    // motor, así que un recorrido que corte en W deja árboles sin dibujar en la
    // mitad derecha de la pantalla alejada y esto lo ve.
    const vLf = -t[4] / t[0], vRf = (134 * 2 - t[4]) / t[0];
    const vis = dr.g.obs.filter(o => o.t === 'tree' &&
      o.x - dr.g.cam + o.w >= vLf && o.x - dr.g.cam <= vRf).length;
    const troncos = f.filter(x => x.op === 'fillRect' && x.fill === TRONCO).length;
    arbVis += vis; if (troncos < vis) arbFalt += vis - troncos; }
  const ar = anillo(f), po = dr.g.pasoObjetivo;
  if (ar.length === 1) {
    const r = ar[0].a[2];
    if (po !== prevPO) { if (maxR >= 20 && minR <= 3) cerrados++; maxR = 0; minR = 99; }
    else if (prevR !== null && r > prevR) anilloCrecio++;
    maxR = Math.max(maxR, r); minR = Math.min(minR, r); prevR = r; prevPO = po;
  }
  if (rebR < 12 && dr.g.objetivo && dr.g.pasoObjetivo != null &&
      dr.g.pasosVuelo >= dr.g.pasoObjetivo) { rebR++; dr.tocar(); }
}
ck('el anillo nunca se agranda mientras apunta al mismo objetivo', anilloCrecio === 0,
  anilloCrecio + ' frames en que creció');
ck('el anillo se cierra de ancho a apretado en varios objetivos', cerrados >= 3,
  'sólo ' + cerrados + ' objetivos con el anillo cerrándose entero');
ck('ninguna coordenada NaN/undefined en todo el vuelo', coordsRotas === 0,
  coordsRotas + ' coordenadas rotas en ' + frames + ' frames');
ck('no falta ningún obstáculo del encuadre alejado', arbFalt === 0,
  arbFalt + ' árboles visibles sin dibujar');
// sin esto lo de arriba pasaría con 0 árboles en pantalla en todo el vuelo
ck('hubo árboles en pantalla para verificar', arbVis > 100, arbVis + ' árbol-frames');
console.log('render: ' + pv.length + ' puntos de arco en pantalla, anillo cerrado entero en ' +
  cerrados + ' objetivos, ' + arbVis + ' árbol-frames, ' + frames + ' frames grabados');

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
