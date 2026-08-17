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
    CAM: 48,              // x de pantalla donde la cámara deja el palo
    SEG: 0.09,            // cuánto del camino al objetivo recorre la cámara por frame
    SHAKE_MAX: 7,         // el shake más grande que prende el motor (el del lanzamiento)
    VX_MAX: 10,           // techo de velocidad horizontal
    TECHO: 50,            // y mínimo
    ZOOM_VUELO: 2.5,      // cuánto se aleja la cámara durante el vuelo
    AVISO_MIN_MS: 800,    // aviso mínimo entre ver un objetivo y su ventana
    VENTANA_PERFECTO: 60, // ms de tolerancia para el rebote perfecto
    VENTANA_BUENO: 160,   // ms de tolerancia para el rebote bueno
  };

  const acotar = (v, a, b) => (v < a ? a : v > b ? b : v);
  const metros = x => Math.round(Math.max(0, (x - F.TEE) / F.PXM));

  // El campo visible, en unidades lógicas, para un zoom dado. UNA sola derivación,
  // que usan tanto el que dibuja como el que mide: draw() pinta con
  // setTransform(2/z,0,0,2/z, W*(z-1)/3, GY*(z-1)/2), así que el punto lógico que cae
  // en cada borde del canvas sale de despejar eso (X = (px - corrimiento)*z/2).
  // avisoMs tenía su propio modelo escrito a mano ("el palo va a un tercio del borde
  // izquierdo" = 223 px por delante) mientras el encuadre real daba 203, y el
  // presupuesto de legibilidad salía 91 ms optimista: medía un campo visual que el
  // jugador no tiene.
  function encuadre(zoom) {
    const z = zoom || 1;
    const izq = -F.W * (z - 1) * z / 6, arriba = -F.GY * (z - 1) * z / 4;
    return { izq: izq, der: izq + F.W * z, arriba: arriba, abajo: arriba + F.H * z };
  }

  // Cuánto se atrasa la cámara respecto del palo, en px lógicos. Son dos términos y los
  // dos son proporcionales a la velocidad:
  // - el lerp: persigue el objetivo con F.SEG por frame de lógica, así que si el objetivo
  //   avanza d px por frame se queda estacionado d*(1-SEG)/SEG px atrás, con
  //   d = |vx|*VUELO (hay VUELO pasos de física por frame de lógica);
  // - la discretización: el palo NO avanza d px por frame, avanza |vx| de golpe cada
  //   1/VUELO frames (lo reparte g.acc) mientras el lerp corre TODOS los frames. Justo
  //   después de un salto el atraso pica |vx|*(1-VUELO) px por encima del promedio.
  //   Medido: sin este término el modelo prometía 195,6 px de arco por delante y el peor
  //   frame real daba 191,6 — el presupuesto de legibilidad quedaba optimista de nuevo,
  //   por 4 px esta vez.
  // Se toma la mayor entre la vx de este frame y la del anterior: frenando de golpe
  // (el pique fuerte hace c.vx*=.62 y el choque c.vx*=.22) la corrección se calcularía
  // con la vx nueva mientras el error de g.cam todavía es el de la vieja, y la cámara no
  // puede recuperar en un frame lo que la corrección le suelta de golpe.
  // SEGURO, NO ESTRUCTURA: hoy este max() no lo necesita ningún test. Medido: sacándolo,
  // el peor camino (el choque) queda 0,46 px arriba del piso en vez de 3,6 px, y no falla
  // nada. Se deja porque la dinámica de este perseguidor ya se modeló mal dos veces en
  // esta task, porque vive adentro de la única derivación (no puede desincronizarse del
  // que dibuja) y porque lo que cuida es que la garantía de legibilidad se viole en
  // silencio. Si mañana molesta, se borra a propósito y no por sorpresa: lo único que se
  // pierde son esos 3,1 px de colchón en las frenadas bruscas.
  const atrasoCam = (vx, vxAnt) => Math.max(Math.abs(vx), Math.abs(vxAnt || 0)) *
    (F.VUELO * (1 - F.SEG) / F.SEG + (1 - F.VUELO));
  // Objetivo del lerp: el corrimiento se achica con la velocidad para compensar el
  // atraso. El problema es proporcional a la velocidad (la cámara se atrasa justo cuando
  // el palo acelera, y ahí se come el arco visible por delante), así que la corrección
  // también: a poca velocidad el encuadre queda igual que siempre. Piso en 0 para que la
  // cámara nunca se adelante al palo.
  const camObjetivo = (vx, vxAnt) => Math.max(0, F.CAM - atrasoCam(vx, vxAnt));
  // Dónde queda el palo en pantalla de verdad: el objetivo más lo que la cámara se
  // atrasa, o sea max(F.CAM, atrasoCam(vx)). OJO con la dirección: lo que se corre hacia
  // la izquierda es el OBJETIVO del lerp (la cámara se adelanta), no el palo. El palo se
  // queda en F.CAM hasta que el atraso lo supera y de ahí se va para la DERECHA, unos
  // 7,6 px a VX_MAX. Contra la cámara vieja, que lo empujaba hasta 36 px a la derecha,
  // el encuadre se mueve poco y en el otro sentido.
  const camPantalla = vx => camObjetivo(vx) + atrasoCam(vx);
  // Px de arco visibles por delante del palo: ESTE es el presupuesto de legibilidad.
  // Depende de la velocidad, así que el que mide tiene que decir a qué velocidad mide;
  // el peor caso es F.VX_MAX.
  // El shake entra acá porque el jugador lo ve: draw() corre el transform hasta shake px
  // de dispositivo al azar, o sea shake*zoom/2 px lógicos, y en el peor sorteo eso se come
  // borde derecho. Estuvo afuera del modelo un rato con la excusa de que es simétrico y
  // transitorio; es la misma clase de omisión que ya nos mintió tres veces en esta task
  // (la cámara escrita a mano, el régimen contra el transitorio, el promedio contra el
  // pico discretizado). El presupuesto mide lo que se ve, no lo que se ve en promedio.
  const adelante = (zoom, vx) =>
    encuadre(zoom).der - camPantalla(vx) - F.SHAKE_MAX * (zoom || 1) / 2;

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
  // Distancia mínima adelante de est.x para que un plantado cuente como objetivo real.
  // NO se puede subir para dejar el plantado fuera del campo visible (194,5 px): la x
  // del plantado la manda la física —es donde el arco cruza la cima— así que exigirle
  // distancia no lo corre, lo descarta, y el vuelo se queda sin salida. Medido con
  // 230: el perfil de 60 ms pasa de 0 sin-salida y 40.000 pasos a 41 sin-salida y
  // 2.823 pasos, y el de 120 ms de 11.685 pasos a 1.753. El bot impecable no se
  // entera (sus arcos son largos) y el test sintético de solvencia tampoco, porque su
  // cadena arranca siempre con el rebote entero desde y=GY-60: los estados donde esto
  // duele son los del rebote bueno, más bajos y más lentos.
  const AVANCE_MIN = 40;

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

  // Un solo test de cruce para todos. alcanzables y avisoMs lo tenían escrito por
  // separado y se desincronizaron: avisoMs exigía que el paso actual cayera dentro
  // del obstáculo, así que un salto que lo pasaba de largo contaba como alcanzable
  // pero sin paso de llegada, y el objetivo quedaba fuera del presupuesto de aviso.
  function cruzaCima(a, b, o) {
    return b.vy > 0 && a.y <= o.cima && b.y >= o.cima && b.x >= o.x && a.x <= o.x + o.w;
  }

  // Obstáculos que la trayectoria desde `est` cruza a la altura de su cima.
  // Se pide que el palo esté bajando (vy > 0) para no contar los que pasa por
  // debajo mientras sube.
  function alcanzables(obs, est) {
    const tr = trayectoria(est, 1200), out = [];
    for (const o of obs) {
      if (o.x + o.w < est.x) continue;
      for (let i = 1; i < tr.length; i++) {
        if (cruzaCima(tr[i - 1], tr[i], o)) { out.push(o); break; }
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
    // Lo que el plantado solapa se va de la cancha. Si quedaran los dos, en el mismo
    // x uno es plataforma y el otro es pared: el palo rebota y se estrella en el
    // mismo paso de física, y el jugador no tiene forma de evitarlo. Medido, era la
    // ÚNICA muerte de un bot impecable, y como el momento depende del escenario el
    // largo del vuelo salía aleatorio y el score con entrada idéntica variaba 1807×.
    // Se limpia acá en vez de buscar otro lugar para plantar porque el lugar de
    // aterrizaje está ocupado seguido: rechazar las posiciones ocupadas deja 260 de
    // 3388 estados sin salida y rompe la invariante de solvencia de arriba. Plantar
    // siempre y limpiar el vecino no la toca.
    // Se marca INERTE y no se saca del array. Sacarlo se probó y se ve: el plantado
    // cae a 40..190 px del palo, o sea adentro del campo visible (194,5 px), así que
    // el jugador veía desaparecer un obstáculo mientras volaba hacia él — medido, 24
    // de 58 sacados pasaban en pantalla, el más cercano a 20 px. Inerte se queda
    // dibujado y sólo deja de ser pared.
    // La marca es permanente y se decide acá, cuando se planta, así que no depende de
    // cuál sea el objetivo VIGENTE: un vecino más alto que el objetivo viejo no vuelve
    // a ser pared cuando buscarObjetivo() avanza y el palo todavía está saliendo de su
    // caja. Una exención atada a g.objetivo sí dejaba ese agujero.
    // Puede tocarle al obstáculo del que el palo acaba de rebotar: con un toque
    // adelantado est.x queda atrás del objetivo, así que el viejo puede quedar a más de
    // AVANCE_MIN y entrar en el solape. Es inocuo — ya rebotó, y ya tenía hit = true.
    // El 4 es el mismo aire que el test de choque del vuelo le da a los bordes.
    for (const o of obs)
      if (puesto.x < o.x + o.w + 4 && o.x - 4 < puesto.x + puesto.w) o.inerte = true;
    obs.push(puesto);
    obs.sort((a, b) => a.x - b.x);
    return 'planto';
  }

  // Milisegundos entre que el obstáculo entra en el campo visible y el momento en
  // que el palo llega a su cima. Con la cámara vieja (sin zoom) y VX_MAX 16 esto
  // daba 160 ms, por debajo del tiempo de reacción humano (~250 ms).
  // `verAdelante` son los px de arco visibles por delante del palo, que salen de
  // Motor.adelante(zoom, vx). Se recibe el número y no el zoom para que el llamador
  // diga explícitamente A QUÉ VELOCIDAD mide: medir el presupuesto en el caso típico
  // y no en el peor es la misma clase de agujero que dejar 4,5% de objetivos afuera.
  function avisoMs(est, o, verAdelante) {
    const tr = trayectoria(est, 1200);
    let pasoVisible = null, pasoLlegada = null;
    for (let i = 0; i < tr.length; i++) {
      // el borde derecho del encuadre que dibuja draw(), no un modelo aparte
      const bordeDerecho = tr[i].x + verAdelante;
      if (pasoVisible === null && o.x <= bordeDerecho) pasoVisible = i;
      if (i > 0 && cruzaCima(tr[i - 1], tr[i], o)) { pasoLlegada = i; break; }
    }
    if (pasoVisible === null || pasoLlegada === null) return Infinity;
    // cada paso de física equivale a STEP/VUELO ms de reloj
    return Math.max(0, (pasoLlegada - pasoVisible) * (F.STEP / F.VUELO));
  }

  // Impulso de rebote. El perfecto devuelve la energía entera, así que un jugador
  // impecable no baja nunca: el techo del score es su pulso, no una constante.
  // Calibrado con el bot de test-destreza.js. Estaba en 7.4, que se pasa tanto del
  // techo que TODO arco de la cadena lo clava y descarta el excedente: medido, 165
  // de 165 arcos de un vuelo impecable con el apex exactamente en F.TECHO, o sea la
  // altura era una constante y no una consecuencia del acierto. Con 3.6 no lo clava
  // ninguno (apex 73..103) y el arco vuelve a contar cómo salió el toque.
  // No se puede bajar mucho más ni dejar el bueno donde estaba: el rebote bueno
  // acorta el arco y con eso el aviso del próximo objetivo. Con IMPULSO 3.6 y el
  // factor viejo de 0.62 el bueno dejaba 94 objetivos de 2000 por debajo de
  // F.AVISO_MIN_MS; con 0.78 el peor aviso es 848 ms (el piso es 800) y da MÁS aire
  // que los 818 ms de antes. El barrido completo está en el informe de la Task 7:
  // arriba de 4.0 el arco clava el techo a la velocidad de régimen (vx≈2,2) y abajo
  // de 3.9 con 0.62 se cae el presupuesto de legibilidad.
  const IMPULSO = 3.6;

  function resolverRebote(est, desfaseMs) {
    const d = Math.abs(desfaseMs);
    if (d <= F.VENTANA_PERFECTO)
      return { tipo: 'perfecto', vy: -IMPULSO, vx: Math.min(F.VX_MAX, est.vx * 1.06 + 0.4) };
    if (d <= F.VENTANA_BUENO)
      return { tipo: 'bueno', vy: -IMPULSO * 0.78, vx: Math.min(F.VX_MAX, est.vx) };
    // Raspón: pierde 35% de velocidad y no gana altura. No termina el vuelo por sí
    // solo; el palo baja y el jugador todavía puede recuperarse antes del suelo.
    return { tipo: 'raspon', vy: Math.max(0.5, est.vy * 0.5), vx: est.vx * 0.65 };
  }

  function comboTras(combo, tipo) {
    if (tipo === 'perfecto') return combo + 1;
    if (tipo === 'bueno') return combo;
    return Math.max(1, Math.floor(combo / 2));
  }

  // Se acredita al llegar al obstáculo con el combo vigente ANTES de aplicar el
  // resultado: el tramo que acabás de volar se paga a la tasa que te habías ganado.
  function acreditar(combo, metrosTramo) {
    return Math.max(0, Math.round(metrosTramo * combo));
  }

  // Repetir el mismo tipo de rebote rinde cada vez menos. Es la profundidad más
  // allá del timing: obliga a variar objetivos en vez de repetir un único óptimo.
  function factorVariedad(ultimos, tipoObs) {
    let repes = 0;
    for (let i = ultimos.length - 1; i >= 0 && ultimos[i] === tipoObs; i--) repes++;
    return 1 / (1 + repes);
  }

  const api = { F: F, acotar: acotar, metros: metros, encuadre: encuadre,
                camObjetivo: camObjetivo, adelante: adelante,
                paso: paso, trayectoria: trayectoria,
                TIPOS: TIPOS, lcg: lcg, generar: generar, alcanzables: alcanzables,
                cruzaCima: cruzaCima, rellenar: rellenar, avisoMs: avisoMs,
                resolverRebote: resolverRebote, comboTras: comboTras, acreditar: acreditar,
                factorVariedad: factorVariedad, IMPULSO: IMPULSO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
