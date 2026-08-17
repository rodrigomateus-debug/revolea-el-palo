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

console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — rebote, combo, puntaje y variedad');
process.exit(fail.length ? 1 : 0);
