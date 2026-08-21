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
    // Techo de velocidad horizontal. Bajó de 10 a 6 y el número no es de gusto: sin el
    // drag la cadena se clava EN el techo (antes se equilibraba en 7,76 y adentro de cada
    // arco caía hasta ~4,3, y ese frenado era lo único que sostenía el aviso), así que el
    // techo pasó a ser LA velocidad a la que el jugador ve venir los obstáculos. Lo fijan
    // dos cotas medidas, y 6 es el escalón de 0,25 más alto que respeta las dos:
    //  1) el presupuesto de legibilidad de test-generador.js: a 6,5 da 818 ms y 0 de
    //     4.000 cortos (el mismo aviso que el juego viejo), a 6,75 cae a 788 ms con 85
    //     cortos. Cota: 6,5.
    //  2) la salida del rebote sobre el par más apretado que el generador puede armar
    //     —un cart (cima 212) y un árbol (cima 186) a SEP_MIN— tiene que despegar sin
    //     chocar la pared del árbol. Medido con el bot: a 6,5 se mueren 3 de 320 vuelos
    //     IMPECABLES contra una pared que el jugador no puede evitar (a 6,25, 0 de 320,
    //     pero el sobre de discretización todavía falla por 2,8 px, o sea que es cuestión
    //     de tiempo). Cota: 6. La aserción 'el rebote despega del par más apretado' de
    //     test-generador.js la vigila.
    // El promedio SUBE aunque el pico baje: 6 constante contra 7,76 que se derretía a 4,3
    // dentro del arco (media ~5,9). Más distancia por segundo, y siempre la misma.
    // OJO, margen fino: la cota 2 se cumple por 0,21 px, y el salto al escalón siguiente
    // es de 3 px porque lo manda un paso de física entero. Cualquier cambio de IMPULSO,
    // de las alturas de TIPOS o de SEP_MIN lo puede dar vuelta; para eso está la aserción.
    VX_MAX: 6,
    // Piso de velocidad horizontal que deja cada rebote. Ver resolverRebote: sin drag el
    // único freno es el raspón y 0,65 repetido llegaba al arco inservible. 1,2 sale de
    // dos cotas medidas: por abajo, el arco del rebote bueno más ingrato (palo bajo,
    // y=210) tiene que cruzar la cima de algún obstáculo más allá de AVANCE_MIN (40 px) y
    // a 1,2 llega a 122 px, 3× la barra —con 0,4, el régimen de los 4 huecos viejos,
    // llega a 40,8 px y no alcanza—; por arriba, el raspón tiene que seguir siendo
    // proporcional en las velocidades que el juego visita, y desde vx 3 deja 1,95, así
    // que el piso tiene que quedar abajo de eso. Medido en los 143 vuelos del bot, subirlo
    // a 1,6 no mueve el artefacto de los plantados (10,0% contra 10,1%) y sí le come
    // castigo al raspón, así que se queda en el valor más bajo que cumple las dos cotas.
    PISO_VX: 1.2,
    TECHO: 50,            // y mínimo
    ZOOM_VUELO: 2.5,      // cuánto se aleja la cámara durante el vuelo
    SEP_MIN: 90,          // separación mínima entre obstáculos generados
    AVISO_MIN_MS: 800,    // aviso mínimo entre ver un objetivo y su ventana
    VENTANA_PERFECTO: 60, // ms de tolerancia para el rebote perfecto
    VENTANA_BUENO: 160,   // ms de tolerancia para el rebote bueno
    // Presupuesto de toques. Es el reemplazo del castigo VIEJO por errar, que era
    // físico e invisible: el raspón te comía 35% de vx, el arco se acortaba, en algún
    // momento no había nada al alcance y el vuelo se moría sin que el jugador supiera
    // por qué. Ahora errar cuesta un número que está en pantalla y nada más.
    // 3 y 3 no son de gusto: el toque cuesta 1 y la pegada devuelve 3, así que el
    // presupuesto sube sólo si NO gastás más de 3 intentos por objetivo. O sea que la
    // barra es "acertar uno de cada tres", que es exactamente el margen que hace falta
    // para que la ventana de 160 ms se pueda buscar a tientas sin morirse.
    TOQUES_INICIAL: 3,
    TOQUES_PEGADA: 3,
    // El tope existe para que el presupuesto no se vuelva irrelevante: sin él, un
    // jugador que encadena 20 pegadas junta 60 toques y a partir de ahí puede tocar al
    // azar todo el vuelo. 9 son tres objetivos de colchón.
    TOQUES_MAX: 9,
    // Decaimiento de vx por paso de física, y NO es el drag que se sacó en e9d8357.
    // Ese era un impuesto del que no se podía escapar: frenaba ~21% por segundo pasara
    // lo que pasara, la cadena de perfectos se equilibraba abajo del techo y los arcos
    // se acortaban solos. Éste se RESETEA en cada pegada, así que la velocidad pasa a
    // ser un recurso que se recarga pegándole a algo — que es justo lo que el jugador
    // hace cuando juega bien.
    // El valor sale de un objetivo de diseño medible: un arco entero sin pegarle a nada
    // tiene que costar ~25% de la velocidad, así que ~4 arcos fallados llevan del techo
    // al piso. Un arco dura ~140 pasos de física, y 1-0.75^(1/140) = 0,00205.
    // OJO con subirlo: lo único que frena abajo es PISO_VX, y abajo de 1,2 el arco
    // entero avanza tan poco que ninguna cima queda al alcance (ver PISO_VX).
    DECAY_VX: 0.00205,
  };

  const acotar = (v, a, b) => (v < a ? a : v > b ? b : v);
  const metros = x => Math.round(Math.max(0, (x - F.TEE) / F.PXM));

  // Velocidad de salida del lanzamiento. Vive acá y no en el componente porque el
  // presupuesto de legibilidad se mide con ella y escrita en dos lados se desincroniza.
  const vLanzamiento = (potencia, perfecto) => 5.4 + potencia * (perfecto ? 1.12 : 1) * 8.6;
  // El ángulo de lanzamiento: 45°, FIJO. Antes se podía arrastrar entre 15° y 70°, y a
  // 15° la vx de salida daba 14,52: medido, el presupuesto de legibilidad se caía a
  // 727 ms con 1.852 de 4.000 objetivos por debajo del piso. O sea que había un camino
  // jugable en el que el juego era ilegible casi la mitad del tiempo, y encima apuntar
  // dejó de ser una decisión cuando la destreza se mudó a los toques. Se fue el control.
  F.ANG_LANZ = Math.PI / 4;
  // vx del lanzamiento a potencia plena. Con el ángulo fijo, ésta es la ÚNICA velocidad
  // de salida que el juego produce, y la única del juego entera que supera VX_MAX.
  // Es también el peor encuadre: `adelante` evaluado en el clamp promete 182,4 px de arco
  // por delante y en ese instante hay 178,6. Los 3,8 px de diferencia son la razón por la
  // que el peor aviso medido en vuelos reales (788 ms) cae abajo del piso de 800 y la
  // cadena sintética, que arranca de un rebote y nunca pasa de 6,95, no lo veía.
  F.VX_LANZ = Math.cos(F.ANG_LANZ) * vLanzamiento(1, true);

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
  // queda en F.CAM hasta que el atraso lo supera y de ahí se va para la DERECHA. Con
  // VX_MAX en 6 eso ya no le pasa NUNCA a la cadena: el atraso a velocidad de techo es
  // 36,07 px contra un F.CAM de 48, así que el palo se queda clavado en 48 todo el vuelo y
  // el único momento en que se corre a la derecha es el lanzamiento (atraso 63,89 a
  // VX_LANZ, o sea 15,9 px). Antes, con el techo en 10, la cadena lo movía 7,6 px.
  const camPantalla = vx => camObjetivo(vx) + atrasoCam(vx);
  // Px de arco visibles por delante del palo: ESTE es el presupuesto de legibilidad.
  // Depende de la velocidad, así que el que mide tiene que decir a qué velocidad mide;
  // el peor caso es F.VX_LANZ (el lanzamiento), no F.VX_MAX: es la única velocidad del
  // juego que pasa el clamp, y medir en el clamp dejaba el instante del lanzamiento
  // —justo donde el aviso mínimo real cae abajo del piso— fuera del modelo.
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
  // El drag ya NO toca vx: la velocidad horizontal es la historia de los toques del
  // jugador y de nada más. Antes se comía min(0.007, 0.0008 + sp*0.0004) por paso de
  // física —a velocidad de cadena ~0,4% por paso, o sea ~21% por segundo— y el rebote
  // 'bueno' devuelve vx sin cambio, así que ENCADENAR TOQUES CORRECTOS era una muerte
  // lenta: la cadena se equilibraba en 7,8 contra un techo de 10, los arcos se
  // acortaban y los obstáculos aparecían de la nada en pantalla. Ahora vx entra y sale
  // igual de cada arco, y sólo la mueve `resolverRebote`.
  // El acotar se queda y ahora es lo ÚNICO que frena: VX_LANZ (10,63) es la única
  // velocidad del juego que pasa el techo, y sin drag la cadena de perfectos se clava
  // EN el techo en vez de equilibrarse abajo. Por eso VX_MAX bajó de 10 a 9: es el
  // presupuesto de legibilidad el que fija ese número, no el gusto (ver F.VX_MAX).
  // El drag sobre vy SE QUEDA, y no por inercia: medido, sacarlo alarga el arco del
  // rebote bueno de 130 a 133 pasos de física y sube el apex, y con eso el aviso mínimo
  // del presupuesto de legibilidad pasa de 828 a 815 ms — o sea que es lo que da forma
  // al arco y encima aporta 13 ms de colchón sobre el piso de 800. Cumple una función
  // real y medida, así que se deja.
  function paso(est) {
    const sp = Math.hypot(est.vx, est.vy);
    const drag = 1 - Math.min(0.007, 0.0008 + sp * 0.0004);
    // El decaimiento va ACÁ y no en el bucle del vuelo, y no es un detalle de estilo:
    // trayectoria() consume este mismo paso, así que si el vuelo en vivo frenara y la
    // predicción no, el arco fantasma y el paso de llegada del anillo apuntarían a un
    // futuro que no va a pasar. Es la misma regla que ya obligó a extraer cruzaCima y a
    // recalcular el objetivo después de un choque: una sola física en todo el proyecto.
    // vx nunca es negativo (el lanzamiento es +, la pegada conserva el signo y el choque
    // multiplica por .22), así que alcanza con decaer la magnitud.
    let vy = (est.vy + F.G) * drag, vx = decaer(acotar(est.vx, -F.VX_MAX, F.VX_MAX));
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

  // `h` es el alto de la CAJA. `aire`, si está, es el rango (min, max) de px entre el
  // suelo y la BASE del bicho: los tipos con aire flotan, los que no están apoyados.
  // Los de arriba existen porque con sólo bichos parados en el pasto las cimas vivían
  // entre y=186 (copa del árbol) y y=212 (techo del carrito): una banda de 26 px,
  // mientras el arco del palo llega hasta y=50. Nueve décimos de la pantalla no
  // decidían nada. Con los de aire la banda de cimas pasa a 130..212, o sea 3,2x.
  // Los rangos salen de dos cotas MEDIDAS:
  //  - por arriba: un revoleo sube 110,1 px, así que desde el suelo (y=232) el apex
  //    llega a 121,9 y desde la copa del árbol (y=186) a 75,9. Una cima en 130 queda al
  //    alcance del primer arco del vuelo; más arriba habría que llegar escalando y hay
  //    escenarios donde no se puede.
  //  - por abajo: tienen que quedar arriba de la copa del árbol (186) para agregar
  //    banda de verdad y no repetir la altura que ya existe apoyada en el pasto.
  // Son cima y no altura de vuelo porque cima es lo único que mira la física.
  const TIPOS = {
    tree:   { w: 26, h: 46 },
    cart:   { w: 30, h: 20 },
    caddie: { w: 16, h: 30 },
    sdga:   { w: 18, h: 30 },
    dron:   { w: 20, h: 12, aire: [40, 84] },
    cable:  { w: 34, h: 6,  aire: [56, 96] },
    // El PASTO: un manchón de fairway con la cima en el suelo. No se genera nunca (no
    // está en CLAVES); existe sólo como la plataforma de último recurso que `rellenar`
    // planta cuando no hay nada más, y es la pieza que hace verdadero "errar no te mata".
    // Sin él, medido: el palo erra un toque a y=176, cae, y a y=201 ya está abajo de la
    // cima más baja de la cancha (212) — no hay DÓNDE plantar nada. El pique del suelo
    // tampoco lo salva: devuelve vy = -|vy|*0,4, o sea que desde vy 3,25 sube 16 px y el
    // apex queda en 216, todavía abajo de 212. O sea que un solo toque errado terminaba
    // el vuelo con 8 toques sin gastar en el bolsillo, y el presupuesto entero era
    // decoración. Con el pasto, errar te manda al suelo y el suelo te devuelve arriba si
    // le pegás bien: el castigo pasa a ser el toque, que es lo que se pidió.
    pasto:  { w: 16, h: 0 },
  };
  const CLAVES = ['tree', 'cart', 'caddie', 'sdga', 'dron', 'cable'];
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

  // Todo obstáculo sale de acá con la MISMA forma: {t, x, w, alto, cima}. `cima` es lo
  // único que mira la física del rebote (cruzaCima) y `alto` lo único que define la
  // pared (choca). Con esos dos campos, un dron a 60 px del pasto y un árbol apoyado en
  // él son el mismo objeto para el motor: no hay un caso 'está en el aire' en ninguna
  // parte. El campo `h` se fue a propósito — sobrevivía sólo porque el componente
  // calculaba la caja como (GY - o.h, GY), que es exactamente la cuenta que da por
  // sentado que todo está apoyado en el suelo.
  function crear(rand, x) {
    const t = CLAVES[(rand() * CLAVES.length) | 0];
    return enX(t, x, rand);
  }

  // Un obstáculo de tipo `t` en x. Si el tipo flota, la altura se sortea en su rango;
  // `cimaFija` la impone (lo usa el que planta, que necesita la cima donde pasa el arco).
  function enX(t, x, rand, cimaFija) {
    const d = TIPOS[t];
    const base = d.aire
      ? F.GY - (d.aire[0] + (rand ? rand() : 0.5) * (d.aire[1] - d.aire[0]))
      : F.GY;
    const cima = cimaFija != null ? cimaFija : Math.round(base) - d.h;
    return { t: t, x: Math.round(x), w: d.w, alto: d.h, cima: cima };
  }

  // Las cimas a las que un tipo puede ir. Los apoyados tienen una sola; los que flotan,
  // todo su rango — y de ahí sale el muestreo que usa el que planta.
  function cimasDe(t) {
    const d = TIPOS[t];
    if (!d.aire) return [F.GY - d.h];
    const alta = F.GY - d.aire[1] - d.h, baja = F.GY - d.aire[0] - d.h;
    return [baja, Math.round((baja + alta) / 2), alta];
  }

  // La caja del obstáculo, con 4 px de aire a los costados y 3 abajo: es el mismo margen
  // que el test de choque del vuelo ya le daba, extraído para que exista UNA sola vez.
  // Escrito en el componente como (GY - o.h, GY + 3) daba por sentado que todo estaba
  // apoyado en el pasto.
  //
  // LOS QUE FLOTAN NO SON PARED: son plataforma de un solo lado. Se les puede pegar
  // arriba (cruzaCima no cambia) y se les pasa por abajo y por al lado sin chocar.
  // No es una comodidad, es lo único que hace que existan: medido con el bot, con los de
  // aire sólidos los 5 de 5 vuelos IMPECABLES morían chocando un dron, y en uno de ellos
  // el dron era el ÚNICO choque de todo el vuelo. La razón es geométrica y no se arregla
  // separando más los obstáculos: el palo sale del rebote subiendo 110 px y las cimas de
  // aire viven entre 130 y 180, o sea justo en el techo del arco de salida. Un bicho
  // sólido ahí es una pared que aparece encima del jugador en el mismo instante en que
  // rebota bien, y no tiene forma de evitarla — el vuelo se termina por el escenario y no
  // por el jugador, que es lo único que el diseño no permite.
  // Los apoyados en el pasto SIGUEN siendo sólidos: su pared se ve venir de costado, que
  // es una pared que se puede leer y esquivar eligiendo a qué le pegás.
  function choca(o, c) {
    if (TIPOS[o.t] && (TIPOS[o.t].aire || !TIPOS[o.t].h)) return false;
    return c.x > o.x - 4 && c.x < o.x + o.w + 4 &&
           c.y > o.cima && c.y < o.cima + o.alto + 3;
  }

  // Pasar raspando por ARRIBA de la cima, sin tocarla: es el truco 'AL RAS'. Vive acá y
  // no en el componente por la misma regla que cruzaCima y choca — toda comparación
  // contra una cima en un solo lugar. Escrita en el vuelo usaba GY - o.h, o sea que un
  // bicho en el aire nunca la disparaba.
  function alRas(o, c) {
    return !choca(o, c) && c.x > o.x - 8 && c.x < o.x + o.w + 8 &&
           c.y < o.cima && c.y > o.cima - 20;
  }

  // La separación mínima entre obstáculos sale de acá y no de un literal metido en el
  // for: es la distancia con la que se mide si el palo puede despegar de un obstáculo
  // bajo y pasar por encima del alto que viene atrás (ver F.VX_MAX y la aserción 'el
  // rebote despega del par más apretado'). Escrita en dos lados, la aserción medía una
  // cancha que el generador ya no produce.
  function generar(rand, desde, hasta) {
    const out = [];
    for (let x = desde; x < hasta; x += F.SEP_MIN + rand() * 150) out.push(crear(rand, x));
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
  // La invariante rige desde un rebote que recuperó altura (vy < 0) Y cuyo tramo
  // descendente alcanza a cubrir AVANCE_MIN. Son DOS condiciones, no una:
  // - un raspón (vy >= 0, ya bajando) no recibe regalo: ahí no se planta nada, y que
  //   no haya salida es el error del jugador, no un defecto del generador;
  // - si el tramo que baja del arco no llega a AVANCE_MIN, no hay DÓNDE plantar por
  //   construcción — todo candidato tiene que estar a AVANCE_MIN o más para ser
  //   alcanzable y legible — así que la invariante no puede cumplirse y no aplica.
  // La segunda precondición faltaba y la promesa quedaba más grande que lo que el
  // generador puede dar. No es un umbral de vx puesto a ojo: el caso se describe por
  // geometría ("el tramo descendente no cubre AVANCE_MIN") y AVANCE_MIN se justificó
  // solo, mucho antes de que apareciera este análisis.
  //
  // OJO — QUEDA UN HUECO CHICO Y DOCUMENTADO. Medido con el bot sobre 100 vuelos con
  // error de timing (la aserción 'el generador nunca deja sin salida a un palo que
  // recuperó altura' de test-destreza.js, que los tiene clavados como expectativa):
  // 119 casos de 'sin-salida' con vy < 0, repartidos así:
  //   95  del pique en el suelo — fuera del contrato, no es un rebote contra un
  //       obstáculo (ver el comentario del pique en el vuelo);
  //   20  los explica la precondición de arriba: el arco no cubre AVANCE_MIN;
  //    4  quedan abiertos, y son el borde de la misma precondición.
  // Los 4 son todos el mismo caso: rebote bueno (vy = -2,81) con vx entre 0,36 y 0,39,
  // o sea 3,7% de VX_MAX — un palo al que sus propios raspones (cada uno le come 35%
  // de vx) le dejaron nada para avanzar. Su tramo descendente llega a 41 px, apenas
  // 1 px más que AVANCE_MIN, pero ese punto más lejano es el IMPACTO CONTRA EL SUELO
  // (y=232) y ahí no se puede plantar: los cruces de cima, que son las alturas donde un
  // plantado puede ir, quedan cortos por 1 a 4 px. O sea que el arco no alcanza a
  // ninguna plataforma posible y el vuelo se termina — el error del jugador
  // acumulándose, que es lo que el diseño dice que termina un vuelo, y no un lugar
  // donde el generador podría haber puesto algo y no lo hizo.
  // Se podría dejar en 0 midiendo la precondición sólo a la altura de la cima más baja,
  // que es más correcto en unidades, pero medido eso también la deja en 0 con
  // AVANCE_MIN en 230, donde sí mueren vuelos de jugadores sanos: al subir la barra sube
  // en paralelo la precondición y la aserción se vuelve ciega al caso que la motivó.
  // Se prefirió que reporte 4 de más antes que quedar verde y ciega.
  // Devuelve un string, no un boolean, porque hay tres desenlaces distintos que
  // el llamador necesita distinguir: 'ya-habia' (no hacía falta tocar nada, el
  // vuelo sigue), 'planto' (se agregó un objetivo, el vuelo sigue) y
  // 'sin-salida' (no hay ni había nada alcanzable, el vuelo termina acá). Un
  // boolean no puede expresar "nada que hacer" y "sin salida" como cosas
  // distintas, y esa distinción es justamente la que separa seguir volando de
  // terminar el vuelo.
  function rellenar(obs, rand, est) {
    if (alcanzables(obs, est).length) return 'ya-habia';
    // ACÁ había un `if (est.vy >= 0) return 'sin-salida'`: a un palo que ya venía bajando
    // no se le regalaba salida, porque en el diseño viejo eso era el raspón y el raspón
    // ERA el castigo por errar. Se fue con el raspón. Ahora el castigo por errar es el
    // toque gastado, y el palo que viene bajando después de un toque errado es el estado
    // NORMAL del jugador que se equivocó: negarle un objetivo ahí es matarlo por el error
    // que el presupuesto de toques existe para perdonar.
    // Lo único que puede terminar un vuelo por falta de escenario sigue siendo la
    // geometría: si el arco no llega a ninguna cima a AVANCE_MIN o más, no hay DÓNDE
    // plantar por construcción y ahí sí se devuelve 'sin-salida'. Eso no es un hueco del
    // generador, es un palo demasiado bajo o demasiado lento, y es un final legítimo.
    const tr = trayectoria(est, 1200);
    let puesto = null;
    // Candidatos: cada tipo con cada cima a la que puede ir. Los que flotan aportan tres
    // alturas en vez de una, así que el arco tiene más de dónde agarrarse y la invariante
    // se cumple en más estados que cuando todos los candidatos estaban apoyados en el
    // pasto y sus cimas cabían en 26 px.
    for (const clave of CLAVES) {
     for (const cima of cimasDe(clave)) {
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].vy > 0 && tr[i - 1].y <= cima && tr[i].y >= cima) {
          const x = Math.round(tr[i].x - TIPOS[clave].w / 2);
          // La distancia que se mide es est.x -> CRUCE, no est.x -> borde izquierdo del
          // sprite. AVANCE_MIN existe para que el próximo contacto esté lo bastante
          // adelante como para verlo y reaccionar, y el contacto pasa donde el arco
          // cruza la cima: el borde izquierdo es una extensión de dibujo y no tiene
          // nada que ver con el tiempo de reacción. Comparando el borde se le pedía
          // media anchura de más (w/2 va de 5 a 13 px), o sea que la barra efectiva era
          // 45..53 en vez de 40, y candidatos perfectamente buenos quedaban afuera por
          // 0,2 a 7,9 px.
          if (tr[i].x < est.x + AVANCE_MIN) continue;
          puesto = enX(clave, x, null, cima);
          break;
        }
      }
      if (puesto) break;
     }
     if (puesto) break;
    }
    // ÚLTIMO RECURSO: el pasto, y va EXENTO de AVANCE_MIN. La exención no es una
    // excepción cómoda, es que AVANCE_MIN mide otra cosa: existe para que un objetivo
    // ENTRE en pantalla con tiempo de reacción, y el suelo no entra en pantalla — está
    // dibujado abajo todo el vuelo, el jugador lo ve venir desde el apex. Pedirle 40 px
    // de anticipación a la única cosa que nunca hay que descubrir es lo que dejaba morir
    // al palo bajo: medido, desde y=201 bajando a vy 3,25 el suelo queda 35 px adelante y
    // la barra pide 40, o sea que se lo negaba por 5 px.
    if (!puesto) {
      const tr2 = trayectoria(est, 1200), fin = tr2[tr2.length - 1];
      if (fin.y >= F.GY - 1 && fin.x > est.x)
        puesto = enX('pasto', Math.round(fin.x - TIPOS.pasto.w / 2), null, F.GY);
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
  // F.AVISO_MIN_MS; con 0.78 el peor aviso es 879 ms (el piso es 800). El barrido
  // completo está en el informe de la Task 7: arriba de 4.0 el arco clava el techo y
  // abajo de 3.9 con 0.62 se cae el presupuesto de legibilidad.
  // Dos de esas mediciones se rehicieron cuando el drag dejó de tocar vx: el peor aviso
  // pasó de 848 a 879 ms, y el apex más ajustado ya no está en la velocidad de régimen
  // (que ahora ES el techo) sino en el palo más lento posible, F.PISO_VX. Ojo si se mueve
  // IMPULSO: también es una de las tres constantes que deciden si el palo puede despegar
  // de un cart y pasar por encima de un árbol a SEP_MIN, y ahí el margen es de 0,21 px.
  const IMPULSO = 3.6;

  // Ahora que el drag no frena, el único freno de vx es el raspón, y multiplicar 0,65
  // repetido llega al arco inservible: los 4 huecos clavados de test-destreza.js eran
  // palos con vx entre 0,36 y 0,39 cuyo arco entero avanzaba 41 px, tan poco que ninguna
  // altura de cima le quedaba al alcance y el vuelo se moría sin que el generador
  // pudiera hacer nada. El piso corta esa clase entera.
  // El piso se aplica a los TRES desenlaces y no sólo al raspón: el choque del vuelo
  // hace c.vx *= .22 por fuera del resolutor, y un 'bueno' después devuelve vx tal cual,
  // así que con el piso sólo en el raspón la misma clase de palo muerto volvía por el
  // camino del choque. Un solo acotar en la salida cubre los dos caminos.
  // Va en el rebote y NO en paso(): el palo rodando en el suelo termina el vuelo cuando
  // |vx| < 0,12, así que un piso en la integración le saca ese final y lo deja rodando
  // hasta el timeout de 3,6 s.
  function resolverRebote(est, desfaseMs) {
    const d = Math.abs(desfaseMs);
    if (d > F.VENTANA_BUENO)
      // FALLADO, y no pasa NADA físico: ni altura, ni velocidad, ni giro. El palo sigue
      // el mismo arco y el objetivo sigue adelante si todavía no lo pasó, así que se
      // puede volver a tocar. Lo único que cuesta es un toque del presupuesto.
      // Esto era el 'raspón', que te comía 35% de vx y no ganaba altura. Medido en su
      // momento: cada raspón encadenado llevaba la vx a 0,36 y de ahí el arco entero
      // avanzaba 41 px, tan poco que ninguna cima quedaba al alcance y el vuelo se moría
      // tres rebotes después de un error que el jugador nunca vio. Ése era el castigo
      // invisible; el castigo ahora es un número que está en pantalla.
      return { tipo: 'fallado', vy: est.vy, vx: est.vx };
    // PEGADA. La velocidad se RESETEA hacia el techo en vez de multiplicarse, y es la
    // contracara exacta del decaimiento: baja sola, la devuelve pegarle a algo. El techo
    // es VX_MAX y no un número nuevo porque VX_MAX es el valor con el que está verificado
    // el presupuesto de legibilidad (0 de 4.000 objetivos abajo de los 800 ms).
    // El perfecto resetea entero y el bueno la mitad de lo que falta: así la diferencia
    // entre los dos se ve en el largo del arco siguiente y no sólo en el HUD.
    const r = d <= F.VENTANA_PERFECTO
      ? { tipo: 'perfecto', vy: -IMPULSO, vx: F.VX_MAX }
      : { tipo: 'bueno', vy: -IMPULSO * 0.78, vx: est.vx + (F.VX_MAX - est.vx) * 0.5 };
    r.vx = acotar(r.vx, F.PISO_VX, F.VX_MAX);
    return r;
  }

  // El decaimiento de vx, por paso de física. Ver F.DECAY_VX: es lo que convierte la
  // velocidad en un recurso que se recarga pegándole a algo, y no en el impuesto
  // inevitable que se sacó en e9d8357. Nunca baja de PISO_VX, que es la velocidad más
  // baja a la que el arco todavía alcanza alguna cima.
  // Sólo BAJA, nunca sube: si el palo ya viene abajo del piso, se lo deja donde está.
  // El Math.max solo lo LEVANTABA, y eso rompía el final del vuelo: el palo rodando en el
  // pasto termina cuando |vx| < 0,12, y con el piso aplicado en la integración volvía a
  // 1,2 en el paso siguiente, así que ese final era inalcanzable y TODOS los vuelos
  // llegaban al timeout de 3.600 pasos rodando. Es exactamente lo que el comentario viejo
  // de PISO_VX advertía cuando explicaba por qué el piso vivía en el rebote y no acá.
  // El piso sigue rigiendo donde importa: la salida de resolverRebote lo acota, así que
  // toda PEGADA deja al palo con arco suficiente para alcanzar alguna cima. Un palo que
  // quedó abajo del piso por un choque (c.vx *= .22) se queda abajo, y eso es el diseño:
  // el choque es un final legítimo del vuelo.
  const decaer = vx => vx <= F.PISO_VX ? vx : Math.max(F.PISO_VX, vx * (1 - F.DECAY_VX));

  // El presupuesto de toques después de resolver un toque. El toque se cobra SIEMPRE,
  // acierte o no, y se cobra antes de resolverlo: si sólo costara al errar, tocar sería
  // gratis cuando sale bien y no habría ningún techo para el tanteo a ciegas.
  const toquesTras = (toques, tipo) => tipo === 'fallado'
    ? toques
    : Math.min(F.TOQUES_MAX, toques + F.TOQUES_PEGADA);

  // El perfecto sube el combo, el bueno lo mantiene y el fallado lo parte al medio. El
  // fallado no toca la física, así que ÉSTE es todo su castigo además del toque gastado:
  // errar sale caro en puntaje y gratis en supervivencia, que es lo que se pidió.
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
                camObjetivo: camObjetivo, adelante: adelante, vLanzamiento: vLanzamiento,
                paso: paso, trayectoria: trayectoria,
                TIPOS: TIPOS, CLAVES: CLAVES, AVANCE_MIN: AVANCE_MIN,
                lcg: lcg, generar: generar, alcanzables: alcanzables, crear: crear,
                enX: enX, cimasDe: cimasDe, choca: choca, alRas: alRas, decaer: decaer,
                toquesTras: toquesTras,
                cruzaCima: cruzaCima, rellenar: rellenar, avisoMs: avisoMs,
                resolverRebote: resolverRebote, comboTras: comboTras, acreditar: acreditar,
                factorVariedad: factorVariedad, IMPULSO: IMPULSO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
