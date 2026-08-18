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
c.props = { censura: 'Sin filtro', sonido: true };
c.componentDidMount();

function ticks(n, msPerTick = 1000 / 60) {
  for (let i = 0; i < n; i++) { VT += msPerTick; c.tick(VT); }
}
// La intro guionada (el putt que se pasa de largo) dura un rato aleatorio, así que hay
// que esperar por estado y no por una cantidad fija de frames. Corre UNA vez por sesión:
// desde el segundo newShot el juego arranca directo en 'ready'.
function until(d, pred, max = 4000) {
  for (let i = 0; i < max; i++) { if (pred()) return true; VT += 1000 / 60; d.tick(VT); }
  return pred();
}

const fail = [];
const ck = (name, ok, extra) => { if (!ok) fail.push(name + (extra ? ' :: ' + extra : '')); };

ck('loop arrancado en title? no', !c.raf);
c.start();                      // -> screen play, newShot()
ck('loop corriendo en play', !!c.raf);

// intro guionada (el putt que se pasa de largo) + espera a que pase a ready
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
  d.props = { censura: 'Sin filtro', sonido: false };
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
  d.props = { censura: 'Sin filtro', sonido: false };
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
d.props = { censura: 'Sin filtro', sonido: false };
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
const PROPS = { censura: 'Sin filtro', sonido: false };
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
// El shake NO se anula en las mediciones: el jugador lo ve, así que entra igual que en
// Motor.adelante. Lo que sí se anota es cuánto valía cuando corrió draw(), porque el
// corrimiento en sí es un sorteo (no se puede reconstruir) pero está acotado por ±shk px
// de dispositivo — y esa cota es la que le sirve a la aserción de los bordes.
let SHK = 0;
function espiarShake(d) {
  if (d._espiado) return;
  const od = d.draw.bind(d);
  d.draw = () => { SHK = d.g.shake > 0 ? d.g.shake : 0; od(); };
  d._espiado = true;
}
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
let maxR = 0, minR = 99, arbVis = 0, arbFalt = 0, dBorde = 0, comparados = 0, exactos = 0;
const adel = [];
const TRONCO = '#3D2A18'; // el tronco del árbol: un color que no usa nada más
const ENC = Motor.encuadre(Motor.F.ZOOM_VUELO);
// Lo que el presupuesto de legibilidad de test-generador.js da por sentado: en el peor
// caso (a VX_LANZ, la velocidad del lanzamiento, que es la única que pasa el clamp) se
// ven ADEL_PEOR px de arco por delante del palo.
const ADEL_PEOR = Motor.adelante(Motor.F.ZOOM_VUELO, Motor.F.VX_LANZ);
espiarShake(dr);
for (let i = 0; i < 60000 && dr.g.phase === 'fly'; i++) {
  // El shake queda PUESTO: es parte de lo que el jugador ve y Motor.adelante lo descuenta.
  REC = []; SHK = 0; VT += 1000 / 60; dr.tick(VT); const f = REC; REC = null;
  const t = trDe(f);
  if (t) { frames++; coordsRotas += coordsMalas(f);
    // Todo obstáculo dentro del encuadre tiene que estar dibujado. El encuadre se
    // despeja del transform grabado (X en el borde del canvas), no de la fórmula del
    // motor, así que un recorrido que corte en W deja árboles sin dibujar en la
    // mitad derecha de la pantalla alejada y esto lo ve.
    const vLf = -t[4] / t[0], vRf = (134 * 2 - t[4]) / t[0];
    // El encuadre que Motor.encuadre le promete a avisoMs tiene que ser el que draw()
    // instaló de verdad. Se compara contra el transform grabado, no contra la fórmula.
    // Sólo en los frames con el zoom puesto: el último frame del vuelo ya es z=1.
    if (t[0] === 2 / Motor.F.ZOOM_VUELO) { comparados++;
      // El shake corre el transform un valor sorteado dentro de ±SHK px de dispositivo,
      // que en lógicos es ±SHK*z/2, y no se puede reconstruir. Así que se descuenta esa
      // cota: en los frames sin shake (la enorme mayoría) la comparación sigue siendo
      // exacta, y en los sacudidos se exige que la diferencia no pase de lo que el shake
      // explica. `exactos` cuenta los primeros para que esto no se apoye en la cota.
      const cota = SHK * Motor.F.ZOOM_VUELO / 2;
      if (!SHK) exactos++;
      dBorde = Math.max(dBorde,
        Math.abs(vRf - ENC.der) - cota, Math.abs(vLf - ENC.izq) - cota);
      // px de arco por delante del palo REALES, shake incluido: la cámara persigue con un
      // lerp de F.SEG y va atrasada, y arriba de eso el shake se come borde.
      if (dr.g.club) adel.push(vRf - (dr.g.club.x - dr.g.cam)); }
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
// El presupuesto de legibilidad (test-generador.js) mide con Motor.encuadre. Si draw()
// dibuja otro encuadre, ese presupuesto mide un campo visual que el jugador no tiene:
// era el bug de los 91 ms optimistas. Con shake en 0 el transform es exacto, así que
// se exige coincidencia al píxel.
ck('avisoMs mide el mismo campo visible que dibuja draw', dBorde < 1e-9,
  'los bordes difieren hasta ' + dBorde.toFixed(2) + ' px lógicos');
// sin esto, un draw() que no ponga nunca el zoom dejaría la de arriba en 0 === 0
ck('hubo frames con el zoom puesto para comparar', comparados > 1000, comparados + ' frames');
// y que la mayoría se haya comparado SIN la cota del shake, o sea exacto
ck('la mayoría de los frames se comparó sin cota de shake', exactos > comparados * .7,
  exactos + ' exactos de ' + comparados);
ck('no falta ningún obstáculo del encuadre alejado', arbFalt === 0,
  arbFalt + ' árboles visibles sin dibujar');
// sin esto lo de arriba pasaría con 0 árboles en pantalla en todo el vuelo
ck('hubo árboles en pantalla para verificar', arbVis > 100, arbVis + ' árbol-frames');
console.log('render: ' + pv.length + ' puntos de arco en pantalla, anillo cerrado entero en ' +
  cerrados + ' objetivos, ' + arbVis + ' árbol-frames, ' + frames + ' frames grabados');
// El presupuesto de legibilidad se calcula suponiendo ADEL_PEOR px de arco por delante
// del palo. Si el vuelo real deja menos en algún frame, el presupuesto miente en ese
// frame: es exactamente el agujero de medir en el caso típico. Se compara contra el
// PEOR frame del vuelo, no contra la mediana.
adel.sort((a, b) => a - b);
// Si `adel` quedara vacío (fixture roto) esto tiene que fallar como aserción y no
// reventar con un TypeError en el mensaje: se exige que haya muestras.
ck('ni el peor frame del vuelo ve menos arco por delante que el peor caso del modelo',
  adel.length > 0 && adel[0] >= ADEL_PEOR,
  adel.length ? ('el peor frame vio ' + adel[0].toFixed(1) + ' px y el modelo promete ' +
    ADEL_PEOR.toFixed(1)) : 'no se midió ni un frame con el zoom puesto');
console.log('encuadre: el modelo promete ' + ADEL_PEOR.toFixed(1) +
  ' px de arco por delante del palo en el peor caso; medidos en el vuelo: peor frame ' +
  (adel.length ? adel[0].toFixed(1) + ', mediana ' + adel[adel.length >> 1].toFixed(1)
   : 'sin muestras'));

// ---- frenadas bruscas: el punto ciego del modelo de cámara -----------------
// atrasoCam supone régimen. Acelerando, el perseguidor llega al atraso de régimen desde
// abajo (atraso real < modelo, o sea se ve MÁS arco: seguro). Frenando de golpe la
// cuenta se da vuelta: camObjetivo se evalúa con la vx nueva mientras el error de g.cam
// todavía es el de la vx vieja. Los dos caminos que frenan de golpe son el pique fuerte
// (c.vx*=.62) y el choque (c.vx*=.22), y los dos llaman a buscarObjetivo() ahí mismo, o
// sea que pueden plantar un objetivo dentro de esa ventana. El vuelo normal no los pisa,
// así que se fuerzan.
function tickAdel(d) {
  espiarShake(d);
  REC = []; SHK = 0; VT += 1000 / 60; d.tick(VT); const f = REC; REC = null;
  const t = trDe(f);
  if (!t || t[0] !== 2 / Motor.F.ZOOM_VUELO || !d.g.club) return null;
  return (134 * 2 - t[4]) / t[0] - (d.g.club.x - d.g.cam);
}
// vuelo a máxima velocidad con la cadena andando, listo para que le frenen el palo
function volando(frames) {
  const d = revolear(reposo());
  for (let i = 0; i < frames; i++) { VT += 1000 / 60; d.tick(VT);
    if (d.g.objetivo && d.g.pasoObjetivo != null && d.g.pasosVuelo >= d.g.pasoObjetivo) d.tocar(); }
  return d;
}
function trasFrenada(preparar) {
  const d = volando(40), c = d.g.club;
  // Estado explícito antes de medir. El vuelo que viene de arriba depende de
  // Math.random() (el largo de la intro), y sin fijarlo el fixture era flaky.
  c.y = 100; c.vy = -1; c.grounded = false; c.crashed = false;
  // El punto ciego es frenar DESDE la velocidad máxima, no desde una cualquiera: se lo
  // lleva a VX_MAX y se deja que la cámara llegue al régimen de esa velocidad (ahí el
  // corrimiento en pantalla vale atrasoCam(VX_MAX), el máximo posible). Se lo mantiene
  // en el aire porque lo único que importa acá es la x.
  for (let i = 0; i < 60; i++) { c.vx = Motor.F.VX_MAX;
    if (c.y > 140) { c.y = 100; c.vy = -1; } tickAdel(d); }
  const antes = tickAdel(d), vxAntes = c.vx;
  preparar(d, c);
  let peor = Infinity, vistos = 0, vxJusto = null;
  for (let i = 0; i < 120 && d.g.phase === 'fly'; i++) {
    const a = tickAdel(d);
    // La vx apenas frenado: es la que dice qué rama del motor corrió (*.62 el pique
    // fuerte, *.22 el choque). Se agarra el PRIMER recorte de verdad y no un frame fijo:
    // un frame puede no ejecutar ningún paso de física (los reparte g.acc a VUELO por
    // frame), y unos frames más tarde el palo raspando el suelo se choca un árbol y ese
    // *.22 tapaba el *.62 que se quería observar. El arrastre nunca llega al 10%.
    if (vxJusto === null && d.g.club && d.g.club.vx < vxAntes * .9) vxJusto = d.g.club.vx;
    if (a !== null) { peor = Math.min(peor, a); vistos++; }
  }
  return { peor: peor, vistos: vistos, antes: antes, vxAntes: vxAntes,
           vxJusto: vxJusto === null ? vxAntes : vxJusto,
           choco: !!(d.g.club && d.g.club.crashed) };
}
// pique fuerte: se lo deja llegar al suelo con |vy| > 3, que es el umbral de `hard`
const pique = trasFrenada((d, c) => { c.y = Motor.F.GY - 1; c.vy = 5; c.grounded = false; });
// choque: se planta un obstáculo pegado atrás del palo (no es el objetivo, así que no
// tiene el pase de "plataforma de rebote") y se pone al palo a su altura
const choque = trasFrenada((d, c) => {
  const t = Motor.TIPOS.tree, o = { t: 'tree', x: Math.round(c.x) - 1, w: t.w, h: t.h,
    cima: Motor.F.GY - t.h };
  const i = d.g.obs.findIndex(q => q.x >= o.x);
  d.g.obs.splice(i < 0 ? d.g.obs.length : i, 0, o);
  c.y = Motor.F.GY - t.h + 3;
});
// Que las frenadas hayan CORRIDO de verdad va primero: sin frames medidos `peor` queda
// en Infinity y las dos aserciones de abajo pasarían sin haber mirado nada.
ck('la frenada por pique fuerte corrió la rama del motor (c.vx*=.62)',
  pique.vistos > 10 && pique.vxJusto < pique.vxAntes * .75 && pique.vxJusto > pique.vxAntes * .4,
  'vx ' + pique.vxAntes.toFixed(2) + ' -> ' + pique.vxJusto.toFixed(2) +
  ' en ' + pique.vistos + ' frames');
ck('la frenada por choque corrió la rama del motor (c.vx*=.22)',
  choque.vistos > 10 && choque.choco && choque.vxJusto < choque.vxAntes * .3,
  'vx ' + choque.vxAntes.toFixed(2) + ' -> ' + choque.vxJusto.toFixed(2) +
  ', crashed=' + choque.choco + ', ' + choque.vistos + ' frames');
// Y el punto: frenar de golpe no puede dejar ver menos arco del que el presupuesto
// supone. Es el mismo piso que la aserción del vuelo normal, sobre el camino que el
// vuelo normal no pisa.
ck('el pique fuerte no deja ver menos arco que el peor caso del modelo',
  pique.peor >= ADEL_PEOR, 'el peor frame vio ' + pique.peor.toFixed(1) +
  ' px y el modelo promete ' + ADEL_PEOR.toFixed(1));
ck('el choque no deja ver menos arco que el peor caso del modelo',
  choque.peor >= ADEL_PEOR, 'el peor frame vio ' + choque.peor.toFixed(1) +
  ' px y el modelo promete ' + ADEL_PEOR.toFixed(1));
console.log('frenada por pique fuerte: vx ' + pique.vxAntes.toFixed(2) + ' -> ' +
  pique.vxJusto.toFixed(2) + ' (arco antes ' + pique.antes.toFixed(1) +
  '), peor arco por delante ' + pique.peor.toFixed(1) + ' px en ' + pique.vistos + ' frames');
console.log('frenada por choque:       vx ' + choque.vxAntes.toFixed(2) + ' -> ' +
  choque.vxJusto.toFixed(2) + ' (arco antes ' + choque.antes.toFixed(1) +
  '), peor arco por delante ' + choque.peor.toFixed(1) + ' px en ' + choque.vistos + ' frames');

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
