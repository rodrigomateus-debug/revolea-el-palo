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

console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — generador y trayectoria');
process.exit(fail.length ? 1 : 0);
