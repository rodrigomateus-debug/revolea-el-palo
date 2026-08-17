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

// --- combo ---
ck('perfecto sube el combo', M.comboTras(7, 'perfecto') === 8);
ck('bueno lo mantiene', M.comboTras(7, 'bueno') === 7);
ck('raspón lo parte al medio', M.comboTras(8, 'raspon') === 4);
ck('el combo nunca baja de 1', M.comboTras(1, 'raspon') === 1);

// --- puntaje ---
ck('acredita metros por combo', M.acreditar(5, 40) === 200, M.acreditar(5, 40));
ck('sin metros no acredita', M.acreditar(9, 0) === 0);
ck('crece con el combo', M.acreditar(10, 40) > M.acreditar(5, 40));

// --- variedad ---
ck('el primero rinde pleno', M.factorVariedad([], 'tree') === 1);
ck('repetir rinde menos',
  M.factorVariedad(['tree', 'tree'], 'tree') < M.factorVariedad(['cart'], 'tree'));
ck('variar rinde pleno', M.factorVariedad(['tree', 'tree'], 'cart') === 1);

console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — rebote, combo, puntaje y variedad');
process.exit(fail.length ? 1 : 0);
