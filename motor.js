// Lógica pura del juego: sin DOM, sin canvas, sin estado global.
// Se carga en el navegador (asigna a window) y con require() desde Node, así los
// tests prueban el generador y el puntaje sin bootear el componente entero.
(function (raiz) {
  'use strict';

  // Constantes de física y de legibilidad. VX_MAX y ZOOM_VUELO son el presupuesto
  // de legibilidad: con el techo viejo de 16 px/paso y sin zoom, un obstáculo
  // entraba en pantalla 0,16 s antes de alcanzarlo y era imposible reaccionar.
  const F = {
    STEP: 1000 / 60,      // paso de lógica fijo
    VUELO: 0.55,          // pasos de física por paso de lógica
    G: 0.117 * 0.44,      // gravedad efectiva por paso de física
    GY: 232,              // altura del suelo
    TEE: 26,              // x del tee
    PXM: 3,               // pixeles por metro
    W: 134, H: 291,       // canvas lógico
    VX_MAX: 10,           // techo de velocidad horizontal
    TECHO: 50,            // y mínimo
    ZOOM_VUELO: 2.5,      // cuánto se aleja la cámara durante el vuelo
    AVISO_MIN_MS: 800,    // aviso mínimo entre ver un objetivo y su ventana
    VENTANA_PERFECTO: 60, // ms de tolerancia para el rebote perfecto
    VENTANA_BUENO: 160,   // ms de tolerancia para el rebote bueno
  };

  const acotar = (v, a, b) => (v < a ? a : v > b ? b : v);
  const metros = x => Math.round(Math.max(0, (x - F.TEE) / F.PXM));

  // Un paso de física. Es la misma integración que usa el vuelo en vivo, para que
  // la predicción y la realidad no se separen nunca.
  function paso(est) {
    const sp = Math.hypot(est.vx, est.vy);
    const drag = 1 - Math.min(0.007, 0.0008 + sp * 0.0004);
    let vy = est.vy + F.G, vx = acotar(est.vx * drag, -F.VX_MAX, F.VX_MAX);
    vy *= drag;
    let x = est.x + vx, y = est.y + vy;
    if (y < F.TECHO) { y = F.TECHO; if (vy < 0) vy = 0.5; }
    return { x: x, y: y, vx: vx, vy: vy };
  }

  // Simula el vuelo hacia adelante sin efectos secundarios. Devuelve un elemento
  // por paso de física; corta al tocar el suelo.
  function trayectoria(est, pasos) {
    const out = [];
    let e = { x: est.x, y: est.y, vx: est.vx, vy: est.vy };
    out.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, paso: 0 });
    for (let i = 1; i <= pasos; i++) {
      e = paso(e);
      out.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, paso: i });
      if (e.y >= F.GY) { out[out.length - 1].y = F.GY; break; }
    }
    return out;
  }

  const TIPOS = {
    tree:   { w: 26, h: 46 },
    cart:   { w: 30, h: 20 },
    caddie: { w: 16, h: 30 },
    sdga:   { w: 18, h: 30 },
  };
  const CLAVES = ['tree', 'cart', 'caddie', 'sdga'];
  const AVANCE_MIN = 40; // distancia mínima adelante de est.x para que un plantado cuente como objetivo real

  // Congruencial lineal: aleatorio determinista, para que los tests reproduzcan
  // exactamente el mismo escenario a partir de una semilla.
  function lcg(semilla) {
    let s = semilla >>> 0 || 1;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  function crear(rand, x) {
    const t = CLAVES[(rand() * CLAVES.length) | 0], d = TIPOS[t];
    return { t: t, x: Math.round(x), w: d.w, h: d.h, cima: F.GY - d.h };
  }

  function generar(rand, desde, hasta) {
    const out = [];
    for (let x = desde; x < hasta; x += 90 + rand() * 150) out.push(crear(rand, x));
    return out;
  }

  // Obstáculos que la trayectoria desde `est` cruza a la altura de su cima.
  // Se pide que el palo esté bajando (vy > 0) para no contar los que pasa por
  // debajo mientras sube.
  function alcanzables(obs, est) {
    const tr = trayectoria(est, 1200), out = [];
    for (const o of obs) {
      if (o.x + o.w < est.x) continue;
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i];
        if (b.vy <= 0) continue;
        const cruzaX = b.x >= o.x && a.x <= o.x + o.w;
        const cruzaY = a.y <= o.cima && b.y >= o.cima;
        if (cruzaX && cruzaY) { out.push(o); break; }
      }
    }
    return out;
  }

  // Invariante de solvencia: si desde `est` no hay nada alcanzable, se planta un
  // obstáculo donde el arco cruza la altura de rebote. Random pero siempre
  // superable — sin esto el jugador pierde por un hueco que no controlaba.
  // Solo cuenta un cruce que quede adelante de `est.x` por al menos AVANCE_MIN.
  // La invariante rige solo "desde un rebote que recuperó altura" (vy < 0): un
  // raspón (vy >= 0, ya bajando) no recibe regalo — ahí no se planta nada, y que
  // no haya salida es el error del jugador, no un defecto del generador.
  // Devuelve un string, no un boolean, porque hay tres desenlaces distintos que
  // el llamador necesita distinguir: 'ya-habia' (no hacía falta tocar nada, el
  // vuelo sigue), 'planto' (se agregó un objetivo, el vuelo sigue) y
  // 'sin-salida' (no hay ni había nada alcanzable, el vuelo termina acá). Un
  // boolean no puede expresar "nada que hacer" y "sin salida" como cosas
  // distintas, y esa distinción es justamente la que separa seguir volando de
  // terminar el vuelo.
  function rellenar(obs, rand, est) {
    if (alcanzables(obs, est).length) return 'ya-habia';
    if (est.vy >= 0) return 'sin-salida';
    const tr = trayectoria(est, 1200);
    let puesto = null;
    for (const clave of CLAVES) {
      const cima = F.GY - TIPOS[clave].h;
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].vy > 0 && tr[i - 1].y <= cima && tr[i].y >= cima) {
          const x = Math.round(tr[i].x - TIPOS[clave].w / 2);
          if (x < est.x + AVANCE_MIN) continue;
          puesto = { t: clave, x: x, w: TIPOS[clave].w, h: TIPOS[clave].h, cima: cima };
          break;
        }
      }
      if (puesto) break;
    }
    if (!puesto) return 'sin-salida';
    obs.push(puesto);
    obs.sort((a, b) => a.x - b.x);
    return 'planto';
  }

  // Milisegundos entre que el obstáculo entra en el campo visible y el momento en
  // que el palo llega a su cima. Con la cámara vieja (sin zoom) y VX_MAX 16 esto
  // daba 160 ms, por debajo del tiempo de reacción humano (~250 ms).
  function avisoMs(est, o, zoom) {
    const anchoVisible = F.W * (zoom || 1);
    const tr = trayectoria(est, 1200);
    let pasoVisible = null, pasoLlegada = null;
    for (let i = 0; i < tr.length; i++) {
      // la cámara deja al palo a un tercio del borde izquierdo
      const bordeDerecho = tr[i].x - anchoVisible / 3 + anchoVisible;
      if (pasoVisible === null && o.x <= bordeDerecho) pasoVisible = i;
      if (i > 0 && tr[i].vy > 0 && tr[i-1].y <= o.cima && tr[i].y >= o.cima
          && tr[i].x >= o.x && tr[i].x <= o.x + o.w) { pasoLlegada = i; break; }
    }
    if (pasoVisible === null || pasoLlegada === null) return Infinity;
    // cada paso de física equivale a STEP/VUELO ms de reloj
    return Math.max(0, (pasoLlegada - pasoVisible) * (F.STEP / F.VUELO));
  }

  const api = { F: F, acotar: acotar, metros: metros, paso: paso, trayectoria: trayectoria,
                TIPOS: TIPOS, lcg: lcg, generar: generar, alcanzables: alcanzables,
                rellenar: rellenar, avisoMs: avisoMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
