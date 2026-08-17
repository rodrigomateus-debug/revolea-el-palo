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

// cargar y revolear
c.begin();
ck('fase charge', c.g.phase === 'charge', c.g.phase);
ticks(90);
c.fire();
ticks(20);
ck('fase fly', c.g.phase === 'fly', c.g.phase);

// vuelo largo: aletazos periódicos + medición del crecimiento de los arrays
let maxObs = 0, maxPel = 0;
for (let i = 0; i < 60000 && c.g.phase === 'fly'; i++) {
  VT += 1000 / 60; c.tick(VT);
  if (i % 40 === 0) c.flap();
  maxObs = Math.max(maxObs, c.g.obs.length);
  maxPel = Math.max(maxPel, (c.g.pel || []).length);
}
const dist = Math.round((c.g.club.x - 26) / 3);

ck('sin error en el loop', !global.window.__loopErr, global.window.__loopErr);
ck('el tiro terminó', c.g.phase !== 'fly', 'quedó en ' + c.g.phase);
ck('g.obs acotado (<80)', maxObs < 80, 'pico ' + maxObs);
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
ck('poda: g.obs acotado en vuelo largo', withCull.peak < 60, 'pico ' + withCull.peak);
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
console.log('escrituras de texto en el DOM: ' + stats.textWrites + ', de style: ' + stats.styleWrites);
console.log('fillStyle asignados: ' + stats.fillStyleSets + ' / fillRect: ' + stats.fillRect);
console.log(fail.length ? '\nFALLAS:\n- ' + fail.join('\n- ') : '\nTODO OK');
process.exit(fail.length ? 1 : 0);
