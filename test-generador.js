// Invariante de solvencia del generador y presupuesto de legibilidad.
const M = require('./motor.js');
const fail = [];
const ck = (n, ok, x) => { if (!ok) fail.push(n + (x !== undefined ? ' :: ' + x : '')); };

// --- trayectoria ---
const t = M.trayectoria({ x: 100, y: 100, vx: 8, vy: -6 }, 400);
ck('la trayectoria devuelve pasos', t.length > 10, t.length);
ck('el primer paso arranca donde se le dijo', t[0].x === 100 && t[0].y === 100);
ck('sube y despues baja', (() => {
  const minY = Math.min(...t.map(p => p.y));
  const iMin = t.findIndex(p => p.y === minY);
  return iMin > 0 && iMin < t.length - 1;
})());
ck('termina en el suelo o antes', t[t.length - 1].y <= M.F.GY + 1, t[t.length - 1].y);
ck('no atraviesa el techo', t.every(p => p.y >= M.F.TECHO - 1));
ck('metros() cuenta desde el tee',
  M.metros(M.F.TEE + 3 * M.F.PXM) === 3, M.metros(M.F.TEE + 3 * M.F.PXM));

// --- generador ---
const rand = M.lcg(12345);
const obs = M.generar(rand, 400, 6000);
ck('genera obstáculos', obs.length > 8, obs.length);
ck('vienen ordenados por x', obs.every((o, i) => i === 0 || obs[i-1].x <= o.x));
ck('todos tienen tipo conocido', obs.every(o => M.TIPOS[o.t]));
ck('la cima es el techo del obstáculo', obs.every(o => o.cima === M.F.GY - o.h));
ck('el lcg es determinista',
  JSON.stringify(M.generar(M.lcg(12345), 400, 6000)) === JSON.stringify(obs));

// --- invariante de solvencia: desde un rebote que recuperó altura siempre hay
// un próximo objetivo alcanzable. Se prueba con las dos fuerzas de rebote que
// va a producir el resolutor de rebotes: -7.4 (perfecto) y -4.6 (bueno). Un
// rebote débil sigue siendo un rebote exitoso, no un error del jugador.
for (const vyRebote of [-7.4, -4.6]) {
  let sinSalida = 0, probados = 0;
  for (let s = 1; s <= 300; s++) {
    const r = M.lcg(s);
    const esc = M.generar(r, 400, 20000);
    // se simula una cadena de rebotes con la misma fuerza desde varios puntos
    let est = { x: 300, y: M.F.GY - 60, vx: 9, vy: vyRebote };
    for (let reb = 0; reb < 25; reb++) {
      M.rellenar(esc, r, est);
      const alc = M.alcanzables(esc, est);
      probados++;
      if (!alc.length) { sinSalida++; break; }
      const o = alc[0];
      est = { x: o.x + o.w / 2, y: o.cima, vx: Math.min(M.F.VX_MAX, 9), vy: vyRebote };
    }
  }
  ck('el generador nunca deja un hueco sin salida (vy=' + vyRebote + ')', sinSalida === 0,
    sinSalida + ' de ' + probados + ' estados sin objetivo alcanzable');
}

// --- caso excluido a propósito: un raspón (vy >= 0, ya bajando cerca del
// piso) no recibe regalo de rellenar. Puede legítimamente terminar el vuelo
// sin salida — eso no es un bug del generador, es el error del jugador. Se
// corre sobre 300 semillas (mismo estilo que la cadena de solvencia) para
// que las ramas ocurran de verdad, y se valida el string que devuelve
// rellenar contra lo que después ve alcanzables.
let planto = 0, sinSalidaRaspon = 0, yaAlcanzable = 0;
for (let s = 1; s <= 300; s++) {
  const r = M.lcg(s);
  const esc = M.generar(r, 400, 20000);
  const est = { x: 300, y: M.F.GY - 46, vx: 9, vy: 2 };
  const resultado = M.rellenar(esc, r, est);
  const alc = M.alcanzables(esc, est);
  // la invariante es "desde un rebote que recuperó altura" (vy < 0): un
  // raspón (vy >= 0) nunca puede terminar en 'planto'
  ck('no se le regala salida a un raspón', resultado !== 'planto', resultado);
  if (resultado === 'sin-salida') {
    ck('sin-salida ⇒ alcanzables vacío', alc.length === 0, alc.length);
    sinSalidaRaspon++;
  } else if (resultado === 'ya-habia') {
    ck('ya-habia ⇒ alcanzables no vacío', alc.length > 0, alc.length);
    yaAlcanzable++;
  } else {
    planto++;
  }
}
ck('el caso sin salida se ejercita de verdad', sinSalidaRaspon > 0 && yaAlcanzable > 0,
  'planto=' + planto + ' sin-salida=' + sinSalidaRaspon + ' ya-habia=' + yaAlcanzable);

// --- presupuesto de legibilidad ---
// Se mide en el PEOR encuadre, no en el típico: la cámara se atrasa en proporción a la
// velocidad, así que a VX_MAX es donde menos arco se ve por delante del palo. Medido a
// velocidad media el presupuesto pasaba mientras el peor frame quedaba abajo del piso,
// que es la misma forma de agujero que dejaba 4,5% de objetivos afuera en la Task 3.
const ADEL_PEOR = M.adelante(M.F.ZOOM_VUELO, M.F.VX_MAX);
const ADEL_QUIETO = M.adelante(M.F.ZOOM_VUELO, 0);
let cortos = 0, medidos = 0, minAviso = Infinity;
for (let s = 1; s <= 200; s++) {
  const r = M.lcg(s * 7);
  const esc = M.generar(r, 400, 20000);
  let est = { x: 300, y: M.F.GY - 60, vx: 9, vy: -7 };
  for (let reb = 0; reb < 10; reb++) {
    M.rellenar(esc, r, est);
    const alc = M.alcanzables(esc, est);
    if (!alc.length) break;
    const o = alc[0], ms = M.avisoMs(est, o, ADEL_PEOR);
    medidos++; minAviso = Math.min(minAviso, ms);
    if (ms < M.F.AVISO_MIN_MS) cortos++;
    est = { x: o.x + o.w / 2, y: o.cima, vx: Math.min(M.F.VX_MAX, 9), vy: -7 };
  }
}
ck('ningún objetivo avisa con menos de AVISO_MIN_MS', cortos === 0,
  cortos + ' de ' + medidos + ' avisan poco; el mínimo fue ' + Math.round(minAviso) + ' ms');

// --- alcanzables y avisoMs deben coincidir en qué es "alcanzable": todo lo que
// alcanzables devuelve tiene que dar un avisoMs finito. Se corre sobre el mismo
// barrido de 300 semillas que la invariante de solvencia para que aparezcan de
// verdad los saltos de un solo paso que atraviesan un obstáculo angosto.
let infinitosEnAlcanzable = 0, chequeadosAlcanzable = 0;
for (const vyRebote of [-7.4, -4.6]) {
  for (let s = 1; s <= 300; s++) {
    const r = M.lcg(s);
    const esc = M.generar(r, 400, 20000);
    let est = { x: 300, y: M.F.GY - 60, vx: 9, vy: vyRebote };
    for (let reb = 0; reb < 25; reb++) {
      M.rellenar(esc, r, est);
      const alc = M.alcanzables(esc, est);
      if (!alc.length) break;
      for (const o of alc) {
        chequeadosAlcanzable++;
        if (M.avisoMs(est, o, ADEL_PEOR) === Infinity) infinitosEnAlcanzable++;
      }
      const o = alc[0];
      est = { x: o.x + o.w / 2, y: o.cima, vx: Math.min(M.F.VX_MAX, 9), vy: vyRebote };
    }
  }
}
ck('todo alcanzable tiene aviso finito', infinitosEnAlcanzable === 0,
  infinitosEnAlcanzable + ' de ' + chequeadosAlcanzable + ' alcanzables dieron avisoMs Infinity');

// --- predicción y realidad no pueden divergir ---
// El anillo de timing sale del predictor. Si el vuelo en vivo integrara distinto,
// el anillo apuntaría a un momento que no va a pasar.
// Aserciones DE CABLEADO (regex sobre el fuente): garantizan que la integración
// inline se fue y que quedó una sola llamada a Motor.paso, no que las dos físicas
// coincidan numéricamente — eso es trivialmente cierto una vez que hay una sola.
const cuerpoM = require('fs').readFileSync('Revolea el Palo.dc.html', 'utf8');
ck('el vuelo en vivo usa Motor.paso', /Motor\.paso\(/.test(cuerpoM));
ck('no quedó integración inline duplicada',
  !/c\.vx=clamp\(c\.vx,-16,16\)/.test(cuerpoM) && !/c\.vy\+=G\*0\.44/.test(cuerpoM));

// El número del presupuesto se imprime siempre y no sólo cuando falla: es el que hay
// que mirar cuando se recalibra la velocidad o el zoom.
console.log('presupuesto de legibilidad: aviso mínimo ' + Math.round(minAviso) + ' ms (piso ' +
  M.F.AVISO_MIN_MS + '), ' + cortos + ' objetivos por debajo del piso, sobre ' + medidos + ' medidos, con ' +
  ADEL_PEOR.toFixed(1) + ' px de arco por delante del palo en el PEOR caso (a VX_MAX; ' +
  ADEL_QUIETO.toFixed(1) + ' px con el palo lento)');
console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — generador y trayectoria');
process.exit(fail.length ? 1 : 0);
