// Base de jugadores + puntajes históricos: alta, persistencia entre "sesiones",
// selección de jugador existente, y que el ranking salga de la base.
const fs = require('fs');
const file = process.argv[2];
const body = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(fs.readFileSync(file, 'utf8'))[1];

const store = {};                                  // localStorage compartido = "el dispositivo"
let VT = 1000;

function load() {                                  // simula abrir la app de cero
  const el = () => ({ style: {}, offsetWidth: 1, width: 0, height: 0, getContext: () => ctx(), textContent: '' });
  const M = ['fillRect','drawImage','save','restore','translate','rotate','beginPath','arc','ellipse',
    'moveTo','lineTo','fill','stroke','setLineDash','setTransform','fillText','clearRect'];
  const ctx = () => { const o = {}; for (const k of M) o[k] = () => {}; return o; };
  global.performance = { now: () => VT };
  global.document = { hidden: false, createElement: () => el(), addEventListener(){}, removeEventListener(){} };
  global.requestAnimationFrame = () => 1; global.cancelAnimationFrame = () => {};
  global.setInterval = () => 2; global.clearInterval = () => {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  global.Image = class { set src(v){ this.complete = true; this.naturalWidth = 26; this.naturalHeight = 13;
    if (this.onload) this.onload(); } };
  global.Audio = class { constructor(){ this.volume = 1; } play(){ return Promise.resolve(); } pause(){} addEventListener(){} };
  global.AudioContext = undefined;
  global.window = { addEventListener(){}, removeEventListener(){} };
  global.React = { createRef: () => ({ current: el() }) };
  // en el navegador lo declara motor.js como window.Motor; el motor embebido lo lee
  // como global suelto, así que acá se inyecta el módulo real.
  global.Motor = require('./motor.js');
  class DCLogic { constructor(){ this.props = {}; this.state = {}; }
    setState(u, cb){ Object.assign(this.state, typeof u === 'function' ? u(this.state) : u);
      if (cb) cb(); if (this.componentDidUpdate) this.componentDidUpdate({}); }
    componentDidMount(){} componentDidUpdate(){} componentWillUnmount(){} renderVals(){ return {}; } }
  global.DCLogic = DCLogic;
  const C = new Function('DCLogic','React','window','document','performance',
    body + '\nreturn Component;')(DCLogic, React, window, document, performance);
  const c = new C();
  c.props = { tiros: 3, censura: 'Sin filtro', viento: false, sonido: false };
  c.componentDidMount();
  return c;
}

const fail = [];
const ck = (n, ok, x) => { if (!ok) fail.push(n + (x !== undefined ? ' :: ' + x : '')); };

// ── primera vez: no hay nadie, arranca en alta ────────────────────────────
let g = load();
ck('primera vez arranca en alta', g.state.screen === 'nuevo', g.state.screen);
ck('sin jugadores todavía', g.renderVals().jugadoresHay === false);

// tipear nombre + elegir emoji, tal como lo hace la UI
g.setNombre({ target: { value: 'Rodrigo' } });
ck('el botón entrar se habilita al escribir', g.renderVals().puedeCrear === true);
const emos = g.renderVals().emojis;
ck('hay grilla de emojis', emos.length >= 8, emos.length);
emos[4].pick();
const elegido = g.renderVals().emojis.find(e => e.sel).e;
ck('el emoji queda seleccionado', elegido === emos[4].e);
g.crear();
ck('tras crear va al título', g.state.screen === 'title', g.state.screen);
ck('quedó el jugador activo', g.state.player && g.state.player.name === 'Rodrigo', JSON.stringify(g.state.player));

// ── jugar una ronda entera y cerrarla ─────────────────────────────────────
function ronda(c, ptsPorTiro) {
  c.start();
  for (let s = 1; s <= 3; s++) {
    c.g.club = { x: 26 + 3 * ptsPorTiro, y: 232, vx: 0, vy: 0, rot: 0, spin: 0, grounded: true, trail: [] };
    c.g.perfect = false; c.endShot('ok');
    VT += 1000; c.next();
  }
  return c.state.points;
}
const total1 = ronda(g, 400);
ck('la ronda termina en el ranking', g.state.screen === 'rank', g.state.screen);
const r1 = g.renderVals();
ck('el ranking sale de la base', r1.ranking.length >= 9, r1.ranking.length);
const yo = r1.ranking.find(x => x.you);
ck('estoy en el ranking con mi emoji', !!yo && yo.name === 'Rodrigo' && yo.emoji === elegido, JSON.stringify(yo));
ck('mi puntaje es el de la ronda', yo && yo.m === total1, yo && yo.m + ' vs ' + total1);

// ── segunda "sesión": cerrar y volver a abrir la app ──────────────────────
VT += 60000;
g = load();
ck('al volver arranca en el selector', g.state.screen === 'quien', g.state.screen);
let js = g.renderVals().jugadores;
ck('me ofrece elegirme sin cargar de nuevo', js.length === 1 && js[0].name === 'Rodrigo', JSON.stringify(js));
ck('muestra mis puntos y rondas', /\d+ pts · 1 ronda$/.test(js[0].detalle), js[0].detalle);
js[0].pick();
ck('al elegirme voy al título', g.state.screen === 'title', g.state.screen);
ck('recupera mi récord', g.state.record === total1, g.state.record + ' vs ' + total1);
ck('la línea de récord lleva mi nombre', /Récord de Rodrigo/.test(g.renderVals().recordLine), g.renderVals().recordLine);

// ── segundo jugador, mismo dispositivo ────────────────────────────────────
g.cambiarJugador(); ck('vuelvo al selector', g.state.screen === 'quien', g.state.screen);
g.nuevoJugador();   ck('puedo dar de alta otro', g.state.screen === 'nuevo', g.state.screen);
g.setNombre({ target: { value: 'Gonza' } });
g.renderVals().emojis[7].pick();
g.crear();
const total2 = ronda(g, 1000);
const r2 = g.renderVals().ranking;
const iG = r2.findIndex(x => x.name === 'Gonza'), iR = r2.findIndex(x => x.name === 'Rodrigo');
// el invariante es el orden por puntaje, no quién tiró más lejos: los greens
// están cada 200 m y clavarla multiplica ×5, así que 400 m puede ganarle a 900
ck('el ranking ordena por puntaje', (total2 > total1) === (iG < iR),
  'gonza=' + total2 + '@' + iG + ' rodrigo=' + total1 + '@' + iR);
ck('el ranking está ordenado de mayor a menor',
  r2.every((x, i) => i === 0 || r2[i - 1].m >= x.m));
ck('los dos jugadores están en el ranking',
  r2.some(x => x.name === 'Rodrigo') && r2.some(x => x.name === 'Gonza'));

// ── histórico ─────────────────────────────────────────────────────────────
g = load();
const raw = JSON.parse(store['sdga-palo-v4']);
ck('la base guarda 2 jugadores', raw.players.length === 2, raw.players.length);
ck('la base guarda 2 rondas', raw.scores.length === 2, raw.scores.length);
ck('cada ronda tiene jugador, puntos, metros y fecha',
  raw.scores.every(s => s.p && typeof s.pts === 'number' && typeof s.m === 'number' && s.at > 0),
  JSON.stringify(raw.scores[0]));
const hist = g.renderVals ? null : null;
const C2 = raw.players.find(p => p.name === 'Rodrigo');
ck('el mejor puntaje quedó en el jugador', C2.best === total1, C2.best + ' vs ' + total1);

// ── casos borde ───────────────────────────────────────────────────────────
g.setNombre({ target: { value: '   ' } });
ck('nombre en blanco no habilita entrar', g.renderVals().puedeCrear === false);
g.setNombre({ target: { value: 'Un nombre larguísimo que no entra' } });
g.crear();
ck('el nombre se recorta a 14', g.state.player.name.length <= 14, g.state.player.name);
// la base rota a 500 filas
const d = JSON.parse(store['sdga-palo-v4']);
d.scores = Array.from({ length: 600 }, (_, i) => ({ p: 'x', pts: i, m: i, at: i }));
store['sdga-palo-v4'] = JSON.stringify(d);
g = load(); g.state.player = JSON.parse(store['sdga-palo-v4']).players[0];
g.state.points = 123; g.state.best = 45; g.state.res = { last: true }; g.next();
ck('el log se poda a 500', JSON.parse(store['sdga-palo-v4']).scores.length === 500,
  JSON.parse(store['sdga-palo-v4']).scores.length);
// base corrupta no rompe el arranque
store['sdga-palo-v4'] = '{no es json';
g = load();
ck('base corrupta arranca en alta', g.state.screen === 'nuevo', g.state.screen);

console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — ' +
  'alta, persistencia entre sesiones, selección, ranking desde la base, histórico y bordes');
process.exit(fail.length ? 1 : 0);
