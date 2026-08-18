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
// El vuelo NO le come velocidad horizontal al palo: vx sale del arco igual que entró.
// Era el bug de diseño que motivó esta task — el drag de `paso` comía 0,4% de vx por
// paso de física (~21% por segundo) y el rebote 'bueno', que no compensa nada, era una
// muerte lenta: el jugador encadenaba toques correctos y el palo se apagaba igual.
// Ahora la velocidad es la historia de los toques y de nada más.
// MUERDE: volver a multiplicar vx por el drag en Motor.paso (aunque sea el mínimo de
// 0,0008) hace que el último paso salga con vx < 8 y esto cae.
// La vx de prueba tiene que estar ABAJO del techo, si no `acotar` la baja y esto mide el
// clamp en vez del drag: con VX_MAX en 6 un 8 salía 6 y la aserción fallaba por el motivo
// equivocado. Se deriva del techo para que no se vuelva a desincronizar.
const VX_PRUEBA = M.F.VX_MAX - 1;
const tPlano = M.trayectoria({ x: 100, y: 100, vx: VX_PRUEBA, vy: -6 }, 400);
ck('el vuelo no le come velocidad horizontal al palo',
  tPlano.every(p => p.vx === VX_PRUEBA), 'vx al final del arco: ' + tPlano[tPlano.length - 1].vx);
// Y que el techo siga siendo techo: sin el drag, `acotar` es lo ÚNICO que frena la vx
// de salida del lanzamiento (VX_LANZ = 10,63 pasa por arriba de VX_MAX).
// MUERDE: sacar el acotar de Motor.paso deja el primer paso a VX_LANZ.
ck('el techo de vx sigue rigiendo en el vuelo',
  M.paso({ x: 0, y: 100, vx: M.F.VX_LANZ, vy: -6 }).vx === M.F.VX_MAX,
  M.paso({ x: 0, y: 100, vx: M.F.VX_LANZ, vy: -6 }).vx);

// El piso de vx tiene que dejar un arco USABLE, y no sólo ser un número mayor que cero:
// desde un rebote bueno, el tramo que baja del arco tiene que cruzar la cima de algún
// obstáculo a AVANCE_MIN o más, que es la única clase de lugar donde `rellenar` puede
// plantar. Los 4 huecos clavados de test-destreza.js eran exactamente esta clase de palo
// (vx 0,36..0,39): su arco entero avanzaba 41 px pero los cruces de cima quedaban cortos.
// Se barre TODA la altura a la que puede quedar un rebote —desde bien arriba hasta la cima
// más baja más un paso de llegada, que es lo que el paso de física puede caer por debajo—
// y se guarda la peor, porque el margen no es monótono en la altura: medido, el caso más
// ajustado está abajo (y≈215) y no en el medio, y una sola altura elegida a ojo lo
// esquivaba (con y=210 fijo esta aserción pasaba hasta con el piso en 0,4).
// MUERDE: con F.PISO_VX en 0.38 el cruce más lejano cae a 39,5 px y no llega. El límite
// exacto está en 0,39 (40,6 px), o sea que esta aserción fija una cota INFERIOR y sólo
// prohíbe la clase de los 4 huecos viejos; que el piso sea 1,2 y no 0,4 es margen (124,8
// px, 3× la barra) y no algo que esta aserción pueda defender. La cota SUPERIOR del piso
// la pone la aserción del castigo del raspón, en test-destreza.js.
const cimas = Object.keys(M.TIPOS).map(k => M.F.GY - M.TIPOS[k].h);
const lejanoDesde = y => {
  const vy = M.resolverRebote({ x: 0, y: y, vx: M.F.PISO_VX, vy: 2 },
    (M.F.VENTANA_PERFECTO + M.F.VENTANA_BUENO) / 2).vy;
  const tr = M.trayectoria({ x: 0, y: y, vx: M.F.PISO_VX, vy: vy }, 1200);
  let lejos = 0;
  for (let i = 1; i < tr.length; i++)
    for (const c of cimas)
      if (M.cruzaCima(tr[i - 1], tr[i], { x: -1e9, w: 2e9, cima: c })) lejos = Math.max(lejos, tr[i].x);
  return lejos;
};
let cruceMasLejano = Infinity, yMasIngrata = 0;
for (let y = M.F.GY - 60; y <= Math.max(...cimas) + 3.5; y += 0.5)
  if (lejanoDesde(y) < cruceMasLejano) { cruceMasLejano = lejanoDesde(y); yMasIngrata = y; }
ck('en el piso de vx el palo todavía alcanza una plataforma',
  cruceMasLejano >= M.AVANCE_MIN,
  'desde y=' + yMasIngrata + ' el cruce de cima más lejano cae a ' + cruceMasLejano.toFixed(1) +
  ' px y AVANCE_MIN es ' + M.AVANCE_MIN);

// --- generador ---
const rand = M.lcg(12345);
const obs = M.generar(rand, 400, 6000);
ck('genera obstáculos', obs.length > 8, obs.length);
ck('vienen ordenados por x', obs.every((o, i) => i === 0 || obs[i-1].x <= o.x));
ck('todos tienen tipo conocido', obs.every(o => M.TIPOS[o.t]));
ck('la cima es el techo del obstáculo', obs.every(o => o.cima === M.F.GY - o.h));
ck('el lcg es determinista',
  JSON.stringify(M.generar(M.lcg(12345), 400, 6000)) === JSON.stringify(obs));

// Velocidad a la que se corren las cadenas sintéticas de este archivo: EL TECHO, exacto.
//
// Antes era `VX_MAX - 1`, y ese "un paso por debajo" se apoyaba en el drag: el drag de
// `Motor.paso` frenaba la cadena real en 7,8 contra un techo de 10, así que medir a 9 era
// medir por encima de la realidad. Ahora el drag no toca vx —la velocidad es la historia
// de los toques— y una cadena de perfectos se clava EN el techo, así que el único valor
// honesto es el techo: medir un paso por debajo dejaría el presupuesto medido 152 ms
// optimista (970 ms a 5,5 contra 818 a 6,5), que es exactamente la clase de agujero que el
// comentario viejo venía a cerrar.
// Lo que sostiene que la cadena real no PASE de acá es doble: `acotar` en Motor.paso y el
// mismo acotar en la salida de resolverRebote, y la aserción 'la cadena nunca llega a la
// velocidad que supone el presupuesto' de test-destreza.js lo mide con el bot.
// Verificado que sigue mordiendo: con VX_MAX en 6,75 el aviso mínimo cae a 788 ms y esto
// se pone rojo; con 16 la cadena corre a 16 y cae mucho más fuerte.
const VX_CADENA = M.F.VX_MAX;

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
// La vy del raspón se le PREGUNTA al resolutor, igual que las dos fuerzas de rebote de
// arriba, y se le pide el raspón más suave que sabe dar (el que cae en el piso de
// Math.max, o sea el palo que venía apenas bajando). Estaba escrita a mano en 2, y cuando
// el techo bajó a 6 el arco de ese estado dejó de llegar al primer obstáculo de la cancha
// (que arranca 100 px adelante): daba 300 de 300 'sin-salida', o sea que la rama
// 'ya-habia' no se ejercitaba más y la aserción de abajo quedaba a medias midiendo un
// solo camino. Con el raspón del resolutor sale 150 y 150.
const VY_RASPON = M.resolverRebote({ x: 0, y: M.F.GY - 46, vx: VX_CADENA, vy: 0 },
  M.F.VENTANA_BUENO + 50).vy;
let planto = 0, sinSalidaRaspon = 0, yaAlcanzable = 0;
for (let s = 1; s <= 300; s++) {
  const r = M.lcg(s);
  const esc = M.generar(r, 400, 20000);
  const est = { x: 300, y: M.F.GY - 46, vx: VX_CADENA, vy: VY_RASPON };
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

// --- el rebote tiene que poder DESPEGAR del par más apretado de la cancha ---
// El par más apretado que `generar` puede armar es el peor: un cart (cima 212) y, a
// SEP_MIN de distancia, un árbol (cima 186, el más alto). El palo rebota en el cart
// porque es su único objetivo alcanzable y después tiene que subir 26 px antes de llegar
// a la pared del árbol, que empieza 4 px antes de su borde (el margen de hit() en el
// vuelo). Si no llega, se estrella contra algo que no tenía forma de evitar: el vuelo se
// termina por el escenario y no por el jugador, que es lo único que el diseño no permite.
// Se mide sobre el SOBRE de discretización, no sobre el caso ideal, porque el rebote real
// no cae en la cima exacta: el paso que cruza la cima aterriza un mismo phi de sub-paso
// tarde en las dos coordenadas —en x sobre la caja del cart y en y por debajo de su
// cima— y ese phi es el que se come el margen. Con el ideal (phi = 0) esto pasa hasta a
// 6,75 y no habría cazado nada: medido con el bot, a 6,5 se mueren 3 de 320 vuelos
// impecables exactamente así (cart INERTE, árbol a 90 px, el palo 1,3 px abajo de la
// cima del árbol, siempre con vy -3,09).
// MUERDE: con F.VX_MAX en 6.25 el peor caso del sobre se pasa 2,83 px y esto cae. El
// salto entre escalones es de ~3 px porque lo manda un paso de física entero, así que el
// margen con el que pasa es fino (0,21 px) y a propósito: la alternativa era bajar el
// techo a 5,5 y hacer el juego más lento que el viejo en promedio.
const cimaCart = M.F.GY - M.TIPOS.cart.h, cimaTree = M.F.GY - M.TIPOS.tree.h;
const vyDespegue = M.resolverRebote({ x: 0, y: cimaCart, vx: M.F.VX_MAX, vy: 1 }, 0).vy;
let peorDespegue = -Infinity;
for (let xe = 0; xe <= M.TIPOS.cart.w; xe += 0.25)
  for (let phi = 0; phi < 1; phi += 0.02)
    // |vy| de llegada al cruce: 3,4 es el techo medido de la cadena (los rebotes reales
    // llegan con 3,0..3,36), y es lo que fija cuánto abajo de la cima puede caer el paso.
    for (const vyLlegada of [3.0, 3.4]) {
      const p = M.trayectoria({ x: xe + M.F.VX_MAX * phi, y: cimaCart + vyLlegada * phi,
        vx: M.F.VX_MAX, vy: vyDespegue }, 200).find(q => q.x >= M.F.SEP_MIN - 4);
      peorDespegue = Math.max(peorDespegue, p.y - cimaTree);
    }
ck('el rebote despega del par más apretado que puede armar el generador',
  peorDespegue <= 0, 'en la pared del árbol el palo queda ' + peorDespegue.toFixed(2) +
  ' px por debajo de su cima (cart a ' + M.F.SEP_MIN + ' px, techo ' + M.F.VX_MAX + ')');

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
// deja afuera justo el caso ajustado. Medido con el techo en 6: los dos arcos dan el mismo
// mínimo, 879 ms. Que hayan EMPATADO es consecuencia de sacar el drag de vx —el aviso
// pasó a estar dominado por los px visibles por delante divididos por una vx que ya no
// cambia dentro del arco, y eso es igual para los dos rebotes— y no motivo para dejar de
// medir los dos: el que empaten hoy no los ata para mañana.
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
