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

// Velocidad a la que se corren las cadenas sintéticas de este archivo. NO es un 9 escrito
// a mano: es un paso por debajo del techo, y el techo es lo que la hace legítima.
//
// Por qué un paso por debajo y no el techo mismo: medido, el presupuesto se cumple a 9
// (818 ms, 0 de 4.000 cortos) y NO se cumple a 10 (758 ms, 263 cortos). Lo que salva la
// diferencia no está en esta cuenta: es el drag de `Motor.paso`, que frena la cadena real
// en 7,8 (medido sobre 300 rebotes de vuelos impecables; la aserción 'la cadena nunca
// llega a la velocidad que supone el presupuesto' de test-destreza.js lo vigila con el
// bot). O sea que este presupuesto se apoya en DOS constantes que no aparecen acá: el
// techo y el drag.
//
// Derivarlo del techo ata la primera. Antes decía `9` y `Math.min(F.VX_MAX, 9)`, que con
// VX_MAX en 16 sigue dando 9: subir el techo —la Task 3 lo bajó de 16 a 10 justamente por
// legibilidad— dejaba este archivo imprimiendo TODO OK y el regreso lo cazaba de refilón
// el vector dorado de test-destreza.js, que no nombra la legibilidad. Verificado: con
// VX_MAX en 16 la cadena corre a 15, el aviso mínimo cae a 727 ms y esto se pone rojo.
const VX_CADENA = M.F.VX_MAX - 1;

// Las dos fuerzas de rebote se le PREGUNTAN al resolutor en vez de escribirlas a
// mano. Estaban clavadas en -7.4 y -4.6 y la calibración de la Task 7 movió el
// impulso a 3.6 y el factor del bueno a 0.78: los tests de solvencia y de
// legibilidad hubieran seguido midiendo dos arcos que el juego ya no produce, y el
// presupuesto de legibilidad —que es justo lo que la baja de impulso pone en
// riesgo— se hubiera medido con el arco viejo, largo, que siempre pasa.
const EST0 = { x: 300, y: M.F.GY - 60, vx: VX_CADENA, vy: 3 };
const VY_PERFECTO = M.resolverRebote(EST0, 0).vy;
const VY_BUENO = M.resolverRebote(EST0, (M.F.VENTANA_PERFECTO + M.F.VENTANA_BUENO) / 2).vy;

// --- invariante de solvencia: desde un rebote que recuperó altura siempre hay
// un próximo objetivo alcanzable. Se prueba con las dos fuerzas de rebote que
// produce el resolutor: el perfecto y el bueno. Un rebote débil sigue siendo un
// rebote exitoso, no un error del jugador.
for (const vyRebote of [VY_PERFECTO, VY_BUENO]) {
  let sinSalida = 0, probados = 0;
  for (let s = 1; s <= 300; s++) {
    const r = M.lcg(s);
    const esc = M.generar(r, 400, 20000);
    // se simula una cadena de rebotes con la misma fuerza desde varios puntos
    let est = { x: 300, y: M.F.GY - 60, vx: VX_CADENA, vy: vyRebote };
    for (let reb = 0; reb < 25; reb++) {
      M.rellenar(esc, r, est);
      const alc = M.alcanzables(esc, est);
      probados++;
      if (!alc.length) { sinSalida++; break; }
      const o = alc[0];
      est = { x: o.x + o.w / 2, y: o.cima, vx: VX_CADENA, vy: vyRebote };
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
  const est = { x: 300, y: M.F.GY - 46, vx: VX_CADENA, vy: 2 };
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
// velocidad, así que a más velocidad es donde menos arco se ve por delante del palo.
// Medido a velocidad media el presupuesto pasaba mientras el peor frame quedaba abajo del
// piso, que es la misma forma de agujero que dejaba 4,5% de objetivos afuera en la Task 3.
// El peor caso es F.VX_LANZ (10,63) y no F.VX_MAX (10): el lanzamiento es la única
// velocidad del juego que pasa el clamp, y TODOS los avisos sub-piso medidos en vuelos
// reales salen de ese instante. Medir en el clamp promete 182,4 px donde hay 178,6.
const ADEL_PEOR = M.adelante(M.F.ZOOM_VUELO, M.F.VX_LANZ);
const ADEL_QUIETO = M.adelante(M.F.ZOOM_VUELO, 0);
// Se mide con las DOS fuerzas de rebote y se guarda la peor: el rebote bueno hace
// arcos más cortos que el perfecto, así que avisa menos, y medir sólo el perfecto
// deja afuera justo el caso ajustado. Medido: con el impulso en 3.6, el perfecto
// avisa 939 ms y el bueno 848 ms.
let cortos = 0, medidos = 0, minAviso = Infinity;
for (const vyRebote of [VY_PERFECTO, VY_BUENO]) {
  for (let s = 1; s <= 200; s++) {
    const r = M.lcg(s * 7);
    const esc = M.generar(r, 400, 20000);
    // VX_CADENA y ADEL_PEOR son dos cantidades distintas y las dos están arriba con su
    // justificación: la velocidad de la cadena sale del techo (ver VX_CADENA) y el arco
    // visible por delante se mide en el lanzamiento (ver ADEL_PEOR). Lo que sostiene que
    // la cadena real no pase de VX_CADENA es la aserción 'la cadena nunca llega a la
    // velocidad que supone el presupuesto de legibilidad' de test-destreza.js, que corre
    // el bot y falla si algún rebote lo supera.
    let est = { x: 300, y: M.F.GY - 60, vx: VX_CADENA, vy: vyRebote };
    for (let reb = 0; reb < 10; reb++) {
      M.rellenar(esc, r, est);
      const alc = M.alcanzables(esc, est);
      if (!alc.length) break;
      const o = alc[0], ms = M.avisoMs(est, o, ADEL_PEOR);
      medidos++; minAviso = Math.min(minAviso, ms);
      if (ms < M.F.AVISO_MIN_MS) cortos++;
      est = { x: o.x + o.w / 2, y: o.cima, vx: VX_CADENA, vy: vyRebote };
    }
  }
}
ck('ningún objetivo avisa con menos de AVISO_MIN_MS', cortos === 0,
  cortos + ' de ' + medidos + ' avisan poco; el mínimo fue ' + Math.round(minAviso) + ' ms');

// --- alcanzables y avisoMs deben coincidir en qué es "alcanzable": todo lo que
// alcanzables devuelve tiene que dar un avisoMs finito. Se corre sobre el mismo
// barrido de 300 semillas que la invariante de solvencia para que aparezcan de
// verdad los saltos de un solo paso que atraviesan un obstáculo angosto.
let infinitosEnAlcanzable = 0, chequeadosAlcanzable = 0;
for (const vyRebote of [VY_PERFECTO, VY_BUENO]) {
  for (let s = 1; s <= 300; s++) {
    const r = M.lcg(s);
    const esc = M.generar(r, 400, 20000);
    let est = { x: 300, y: M.F.GY - 60, vx: VX_CADENA, vy: vyRebote };
    for (let reb = 0; reb < 25; reb++) {
      M.rellenar(esc, r, est);
      const alc = M.alcanzables(esc, est);
      if (!alc.length) break;
      for (const o of alc) {
        chequeadosAlcanzable++;
        if (M.avisoMs(est, o, ADEL_PEOR) === Infinity) infinitosEnAlcanzable++;
      }
      const o = alc[0];
      est = { x: o.x + o.w / 2, y: o.cima, vx: VX_CADENA, vy: vyRebote };
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
  ADEL_PEOR.toFixed(1) + ' px de arco por delante del palo en el PEOR caso (a VX_LANZ; ' +
  ADEL_QUIETO.toFixed(1) + ' px con el palo lento)');
console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — generador y trayectoria');
process.exit(fail.length ? 1 : 0);
