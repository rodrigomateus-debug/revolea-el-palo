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

// --- invariante de solvencia: desde cualquier rebote hay algo alcanzable ---
let sinSalida = 0, probados = 0;
for (let s = 1; s <= 300; s++) {
  const r = M.lcg(s);
  const esc = M.generar(r, 400, 20000);
  // se simula una cadena de rebotes con impulso pleno desde varios puntos
  let est = { x: 300, y: M.F.GY - 60, vx: 9, vy: -7 };
  for (let reb = 0; reb < 25; reb++) {
    M.rellenar(esc, r, est);
    const alc = M.alcanzables(esc, est);
    probados++;
    if (!alc.length) { sinSalida++; break; }
    const o = alc[0];
    est = { x: o.x + o.w / 2, y: o.cima, vx: Math.min(M.F.VX_MAX, 9), vy: -7 };
  }
}
ck('el generador nunca deja un hueco sin salida', sinSalida === 0,
  sinSalida + ' de ' + probados + ' estados sin objetivo alcanzable');

console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — generador y trayectoria');
process.exit(fail.length ? 1 : 0);
