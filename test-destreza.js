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

// El arco del rebote perfecto tiene que quedar ABAJO del techo. Si lo clava, el
// excedente se descarta, todos los arcos de la cadena salen idénticos y la altura
// deja de ser consecuencia del acierto (con IMPULSO en 7.4 clavaban 165 de 165).
// El apex depende de vx por el drag: un palo LENTO frena menos y sube más, así que
// el peor caso no es VX_MAX sino la velocidad de régimen de la cadena, vx≈2,2. Se
// mide desde la cima más alta (el árbol, h=46), que es la que deja menos aire.
const apexPerfecto = Math.min(...[1, 2.2, 5, M.F.VX_MAX].map(vx => Math.min(...M.trayectoria(
  { x: 300, y: M.F.GY - 46, vx: vx, vy: M.resolverRebote({ vx: vx, vy: 1 }, 0).vy }, 600
).map(p => p.y))));
ck('el arco perfecto no clava el techo', apexPerfecto > M.F.TECHO + 5,
  'apex ' + apexPerfecto.toFixed(1) + ' con el techo en ' + M.F.TECHO);

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

// --- integración: el vuelo encadena rebotes y acredita ---
// OJO: estas cinco son aserciones DE CABLEADO (regex sobre el fuente), no de
// comportamiento. Prueban que el motor embebido llama al motor puro, no que la
// cadena de rebotes funcione. La cobertura de comportamiento vive en test-motor.js
// (que bootea el componente y corre el vuelo) y llega completa en la Task 7.
const fs = require('fs');
const cuerpo = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/
  .exec(fs.readFileSync('Revolea el Palo.dc.html', 'utf8'))[1];
ck('el motor usa Motor.resolverRebote', /Motor\.resolverRebote/.test(cuerpo));
ck('el motor usa Motor.acreditar', /Motor\.acreditar/.test(cuerpo));
ck('el motor usa Motor.rellenar', /Motor\.rellenar/.test(cuerpo));
// Faltaba, y era el hueco más grande de la suite: borrar el `*factor` de la línea del
// puntaje desconecta la regla de variedad entera y los cuatro suites quedaban verdes.
// Éste es el PISO —prueba que el string está— y la aserción de comportamiento que mide
// dos vuelos reales está más abajo, con el bot.
ck('el motor usa Motor.factorVariedad', /Motor\.factorVariedad/.test(cuerpo));
ck('ya no hay aletazos', !/g\.air/.test(cuerpo), 'quedó g.air en el motor');
ck('hay un método tocar()', /tocar\s*\(\s*\)\s*\{/.test(cuerpo));

// Un solo test de cruce de cima en todo el proyecto. pasoDeLlegada (de donde sale
// el centro de la ventana de toque) tenía el cruce escrito a mano y MÁS ESTRICTO
// que el de alcanzables: exigía que el paso cayera dentro del obstáculo en vez de
// que el segmento lo solapara. Resultado: un cruce rápido sobre un obstáculo
// angosto salía elegido como objetivo pero sin paso de llegada, y tocar() se iba
// por el early return — ese obstáculo era intocable. Es la misma divergencia que la
// Task 3 mató extrayendo cruzaCima, reintroducida un archivo más allá.
// Se prohíbe COMPARAR contra .cima, no leer el campo: la Task 6 necesita
// g.objetivo.cima para poner el anillo de timing en pantalla, y un `!/\.cima/` a
// secas la bloquearía. El peligro es re-escribir el TEST DE CRUCE, y todo test de
// cruce necesita un operador de comparación pegado al campo, en cualquiera de los
// dos órdenes. Se chequea sobre el código sin comentarios: `cima` va en la prosa.
const codigo = cuerpo.replace(/\/\/[^\n]*/g, '');
ck('el paso de llegada usa Motor.cruzaCima', /Motor\.cruzaCima\(/.test(codigo));
ck('no quedó ningún cruce de cima escrito a mano',
  !/[<>]=?\s*[\w.[\]]*\.cima|\.cima\s*[<>]/.test(codigo),
  'hay una comparación contra .cima fuera de Motor.cruzaCima');

// --- bot: la destreza tiene que dominar al azar ---
// Se copia el arnés de test-motor.js: stubea DOM, canvas y audio para poder
// instanciar el Component sin navegador.
function arnes() {
  let VT = 1000;
  const el = () => ({ style:{}, offsetWidth:1, width:0, height:0, getContext:()=>ctx(), textContent:'' });
  const MET = ['fillRect','drawImage','save','restore','translate','rotate','beginPath','arc',
    'ellipse','moveTo','lineTo','fill','stroke','setLineDash','setTransform','fillText','clearRect'];
  const ctx = () => { const o = {}; for (const k of MET) o[k] = () => {}; return o; };
  global.performance = { now: () => VT };
  global.document = { hidden:false, createElement:()=>el(), addEventListener(){}, removeEventListener(){} };
  global.requestAnimationFrame = ()=>1; global.cancelAnimationFrame = ()=>{};
  global.setInterval = ()=>2; global.clearInterval = ()=>{};
  global.localStorage = { getItem:()=>null, setItem(){} };
  global.Image = class { set src(v){ this.complete=true; this.naturalWidth=26; this.naturalHeight=13;
    if (this.onload) this.onload(); } };
  global.Audio = class { constructor(){this.volume=1;} play(){return Promise.resolve();}
    pause(){} addEventListener(){} };
  global.AudioContext = undefined;
  global.window = { addEventListener(){}, removeEventListener(){} };
  global.React = { createRef: () => ({ current: el() }) };
  global.Motor = M;
  class DCLogic { constructor(){ this.props={}; this.state={}; }
    setState(u,cb){ Object.assign(this.state, typeof u==='function'?u(this.state):u);
      if (cb) cb(); if (this.componentDidUpdate) this.componentDidUpdate({}); }
    componentDidMount(){} componentDidUpdate(){} componentWillUnmount(){} renderVals(){return{};} }
  global.DCLogic = DCLogic;
  const C = new Function('DCLogic','React','window','document','performance','Motor',
    cuerpo + '\nreturn Component;')(DCLogic, React, window, document, performance, M);
  return { C, adv: ms => { VT += ms; }, now: () => VT };
}

const TOPE = 40000;   // pasos de lógica: dónde se corta el vuelo del bot

// Un vuelo completo con un bot cuyo error de timing es `errorMs`.
//
// El error es JITTER y no un adelanto sistemático, y eso importa: el desfase que
// mide tocar() está cuantizado a pasos de física, que son STEP/VUELO = 30,3 ms de
// reloj. Un bot que toca "en cuanto cree que llegó" tiene desfase 0 tanto con 20 ms
// de error como con 0, o sea que los dos perfiles de arriba de la curva son EL
// MISMO bot: la aserción de monotonía compararía un bot contra sí mismo y no
// podría fallar. Sorteando el desfase en [-errorMs, +errorMs] los cuatro perfiles
// son distintos de verdad, y además se ejercita la mitad TARDÍA de la ventana, que
// un bot que sólo se adelanta no toca nunca.
//
// El sorteo usa su propio LCG y no Math.random: la medición de ruido necesita que
// el azar del bot y el del escenario sean independientes, y Math.random acá es el
// del escenario.
// `monotono` hace que el bot toque SIEMPRE con la racha del tipo del objetivo ya llena,
// o sea el jugador que le pega una y otra vez al mismo tipo de obstáculo. No toca la
// física —`ultimosTipos` sólo entra en el factor de variedad— así que con la misma
// semilla y el mismo error el vuelo es EL MISMO arco y la única diferencia posible en el
// score es la regla de variedad.
function vuelo(errorMs, semilla, tope, monotono) {
  const { C, adv, now } = arnes();
  const c = new C();
  c.props = { censura: 'Sin filtro', sonido: false };
  c.componentDidMount();
  c.state.player = { id:'x', name:'bot', emoji:'x', best:0 };
  let s = semilla; Math.random = () => (s = (s*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  c.start();
  for (let i = 0; i < 8000 && c.g.phase !== 'ready'; i++) { adv(M.F.STEP); c.tick(now()); }
  c.begin();
  for (let i = 0; i < 30; i++) { adv(M.F.STEP); c.tick(now()); }
  // Lo único que se le fija al lanzamiento es la potencia: el ángulo ya no se puede
  // tocar, sale fijo de M.F.ANG_LANZ (45°, el mismo que este arnés clavaba a mano).
  c.g.power = 1;
  // ANTES de fire(): fire -> launch -> buscarObjetivo -> rellenar ya corre con el palo
  // en y=188 y vy < 0, o sea dentro del contrato y dentro de la banda que se cuenta. Con
  // el corte después, un hueco del lanzamiento entraba al contador global y a los huecos
  // de ningún vuelo, y huecosTotal no lo veía.
  const huecos0 = huecos;
  c.fire();
  // vx en el momento de cada rebote: es el estado que modela la cadena del
  // presupuesto de legibilidad en test-generador.js.
  // Se mide DESPUÉS del rebote, que es la velocidad con la que el palo sale hacia el
  // próximo objetivo — la que modela la cadena. Medida antes es la entrante, y el
  // rebote perfecto hace vx*1.06+0.4, así que 9 entrando permite 9,94 saliendo y el
  // testigo quedaba flojo por casi una unidad.
  let vxRebote = 0;
  const origRebote = c.aplicarRebote.bind(c);
  c.aplicarRebote = d => {
    const r = origRebote(d); vxRebote = Math.max(vxRebote, Math.abs(c.g.club.vx)); return r; };
  const msPaso = M.F.STEP / M.F.VUELO;          // ms de reloj por paso de física
  const pulso = M.lcg(semilla ^ 0x5bf03635);    // el pulso del bot, aparte del escenario
  let pasos = 0, objAnt = null, pasoAnt = null, kToque = 0;
  while (pasos < (tope || TOPE) && (c.g.phase === 'fly' || c.g.phase === 'swing')) {
    adv(M.F.STEP); c.tick(now()); pasos++;
    const g = c.g;
    if (g.phase === 'fly' && g.objetivo && g.pasoObjetivo != null) {
      // objetivo nuevo ⇒ nuevo sorteo. kToque son los pasos que le faltan al palo
      // cuando el bot decide tocar: >0 se adelanta, <0 se atrasa.
      if (g.objetivo !== objAnt || g.pasoObjetivo !== pasoAnt) {
        objAnt = g.objetivo; pasoAnt = g.pasoObjetivo;
        kToque = Math.round(-(pulso() * 2 - 1) * errorMs / msPaso);
      }
      if (g.pasoObjetivo - (g.pasosVuelo || 0) <= kToque) {
        if (monotono) g.ultimosTipos = [g.objetivo.t, g.objetivo.t, g.objetivo.t, g.objetivo.t];
        c.tocar();
      }
    }
  }
  // tick() se come las excepciones del loop en window.__loopErr. Sin esto un vuelo
  // que explotó a la mitad se mide como un vuelo corto y las cuatro aserciones
  // pasarían midiendo un juego roto.
  if (global.window.__loopErr) throw new Error('el loop explotó: ' + global.window.__loopErr);
  return { pts: c.g.puntos, pasos: pasos, combo: c.g.combo, vxRebote: vxRebote,
           huecos: huecos - huecos0 };
}

// Huecos del generador, contados sobre los vuelos que ya se corren. Es LA garantía
// sobre la que se apoya todo el diseño: un vuelo tiene que terminar por error del
// jugador y nunca porque el generador no dejó a dónde ir.
// Se cuenta un 'sin-salida' SÓLO si el palo venía SUBIENDO (vy < 0) y de un rebote
// contra un obstáculo, o sea si recuperó altura y aun así no había nada alcanzable:
// ése es el caso que Motor.rellenar está contratado para que no pase.
// Los dos finales que NO se cuentan, porque son el diseño y no un defecto:
//  - vy >= 0: un raspón, el palo ya viene bajando. Es el error del jugador.
//  - y >= GY-1: viene del pique en el suelo, no de un rebote. El palo ya toc  el piso
//    (el vuelo ya estaba terminando) y ese rebotito no es "un rebote exitoso".
// Contar cualquiera de los dos dejaría la aserción roja para siempre midiendo algo
// correcto. Medido, la diferencia no es de detalle: sobre los mismos 100 vuelos el
// pique aporta 95 de los 119 casos con vy < 0. El reparto medido sobre los 100 vuelos
// con error de timing, que es el mismo en los tres archivos que lo citan (acá, el
// contrato de rellenar en motor.js y el comentario del pique en el vuelo):
//   119 'sin-salida' con vy < 0  =  95 del pique  +  20 con el arco corto  +  4 abiertos
// Va acá y no en test-generador.js porque su cadena sintética arranca siempre con el
// rebote entero desde y=GY-60 y nunca modela los estados de media altura que dejan un
// bueno o un raspón, que son justo donde aparecen los huecos: reportaba 0 de 7500 con
// AVANCE_MIN en 230 mientras los vuelos de verdad se morían 41 veces.
// El tercer caso excluido es GEOMÉTRICO y no un umbral de vx: si el tramo que BAJA del
// arco no llega a cubrir AVANCE_MIN, no hay dónde plantar por construcción —todo
// candidato tiene que estar a AVANCE_MIN o más— así que la precondición del contrato no
// se cumple y el caso no es un incumplimiento. Se le pregunta a Motor.trayectoria, que
// es el mismo predictor que usa rellenar, y sólo se le pide alcance horizontal: no se
// re-escribe ningún test de cruce de cima.
// El alcance se mide sobre TODO el tramo descendente, a propósito, aunque el punto más
// lejano sea el impacto contra el suelo y ahí no se pueda plantar nada. La versión
// ajustada —medir sólo mientras el arco está a la altura de la cima más baja (GY - 20)
// o más arriba, que es donde un plantado puede ir— es más correcta en unidades y deja
// los huecos en 0 con AVANCE_MIN en 40, pero MEDIDO también los deja en 0 con
// AVANCE_MIN en 230: al subir la barra sube en paralelo la precondición, y la aserción
// se vuelve ciega justo al caso que la motivó (un AVANCE_MIN más grande de lo que la
// física puede entregar, que mata vuelos de jugadores sanos). Entre una aserción verde
// y ciega y una que reporta 4 casos de más, se eligió la que reporta.
const cubreElAvance = est => M.trayectoria(est, 1200)
  .some(p => p.vy > 0 && p.x - est.x >= M.AVANCE_MIN);

let huecos = 0, huecosPique = 0, huecosCortos = 0, vxHueco = Infinity;
const rellenarReal = M.rellenar;
M.rellenar = (obs, rand, est) => {
  const r = rellenarReal(obs, rand, est);
  if (r === 'sin-salida' && est.vy < 0) {
    if (est.y >= M.F.GY - 1) huecosPique++;
    else if (!cubreElAvance(est)) huecosCortos++;
    else { huecos++; vxHueco = Math.min(vxHueco, Math.abs(est.vx)); }
  }
  return r;
};

const mediana = a => a.slice().sort((x,y)=>x-y)[a.length >> 1];
// ms de error: de torpe a perfecto. Los perfiles tienen que caer en bandas de rebote
// DISTINTAS, si no la curva no mide destreza. Con [120, 60, 20, 0] los de 20 y 0
// daban los dos 100% de rebotes perfectos —±20 ms redondea a ±1 paso de física, o
// sea ±30,3 ms, que entra en VENTANA_PERFECTO (60)— así que ese par comparaba ruido
// de geometría y ninguno de los cuatro llegaba nunca a la banda de raspón, que
// arranca en ~166 ms. Con 200 ms se cruza VENTANA_BUENO y cada par adyacente difiere
// en su mezcla de tipos de rebote.
const perfiles = [200, 120, 60, 0];
const corridas = perfiles.map(e => Array.from({ length: 25 }, (_, i) => vuelo(e, 1000 + i * 37)));
// Los excluidos se congelan acá: huecosCortos y huecosPique son contadores globales y
// más abajo siguen sumando los 40 vuelos del ruido, el impecable y el cuarto de vuelo.
// Sin este corte el desglose que se imprime mezclaba dos poblaciones: los huecos de los
// 100 vuelos de `corridas` contra los excluidos de 143 vuelos.
const cortos100 = huecosCortos, pique100 = huecosPique;
const medianas = corridas.map(rs => mediana(rs.map(r => r.pts)));

ck('la destreza es monótona: menos error ⇒ más puntos',
  medianas.every((v, i) => i === 0 || v >= medianas[i-1]),
  perfiles.map((e,i)=>e+'ms='+medianas[i]).join('  '));

// Se mide sobre los CUATRO perfiles y no sólo sobre el impecable: el hueco aparece
// después de un rebote bueno, que es un rebote exitoso y no un error, y el bot con
// error 0 no hace ninguno. La aserción de 'no muere' de más abajo corre sólo con error
// 0, así que sin esto los perfiles ruidosos alimentan medianas y señal/ruido y nadie
// mira si se murieron por culpa del generador.
// Clavado en 4 EXACTO contra la semilla fija: si da menos falla, y si da más también.
// Los 4 están medidos y caracterizados, y son finales causados por el JUGADOR y no
// huecos del generador: un palo que viene de un rebote bueno con vx entre 0,36 y 0,39
// —3,7% de VX_MAX, contra una mediana de cadena de 1,78— porque cada raspón le come
// 35% de la velocidad horizontal. Su arco entero avanza 41 px, y esos 41 px los toca
// recién en el impacto contra el suelo, donde no se puede plantar nada: las alturas de
// cima, las únicas donde un plantado puede ir, quedan cortas por 1 a 4 px. O sea que no
// hay plataforma alcanzable, y no porque el generador se la haya olvidado.
// Las cuatro firmas, todas del perfil de 120 ms:
//   vy=-2,81  vx=0,36  y=183   cortos por: tree 4, cart 1, caddie 2, sdga 2 px
//   vy=-2,81  vx=0,39  y=207   cortos por: tree 5, cart 2, caddie 3, sdga 3 px
//   vy=-2,81  vx=0,38  y=197   cortos por: tree 5, cart 1, caddie 3, sdga 3 px
//   vy=-2,81  vx=0,37  y=182   cortos por: tree 3, cart 1, caddie 1, sdga 1 px
// La igualdad exacta es deliberada: la semilla está fija y los cuatro casos están
// documentados, así que un cambio para cualquiera de los dos lados tiene que forzar a un
// humano a mirar.
// QUE MUERDE, con la prueba fuerte primero: revertir el arreglo de este mismo diff
// —comparar `x` (el borde del sprite) en vez de `tr[i].x` (el cruce) dentro de
// Motor.rellenar— da 24 huecos (200=2, 120=22, 60=0, 0=0) y la aserción cae fuerte.
// Secundario: con AVANCE_MIN en 230, que mata vuelos de jugadores sanos, da 6 y también
// cae, con el perfil de 60 ms pasando de 0 a 2.
// SU LÍMITE, para que un verde no se lea más ancho de lo que es: el predicado de
// exclusión es geométrico y no tiene constantes ajustadas, pero escala con AVANCE_MIN, y
// por eso subestima cuánto duele subirlo. Con AVANCE_MIN en 230 los vuelos reales del
// perfil de 60 ms se mueren 41 veces y este contador reporta 2: la precondición sube con
// la barra y se come casi toda la señal. Esta aserción prueba "el generador no dejó un
// hueco"; NO prueba "AVANCE_MIN es entregable por la física", que hoy no tiene test.
// Se pincha el VECTOR por perfil y no sólo el total: la señal que importa es que un
// perfil se mueva —el de 60 ms pasando de 0 a 2 es justamente eso— y con el total solo,
// un +2 acá compensado con un −2 allá queda verde.
// POR QUÉ ESTÁ EN 4 Y NO EN 0: el predicado de exclusión podría medir el alcance sólo a
// la altura de la cima más baja (GY - 20), que es más correcto en unidades y deja esto
// en 0. Medido, así también da 0 con AVANCE_MIN en 230, donde mueren vuelos de jugadores
// sanos: no distingue una cadena sana de una rota. No lo "limpies" a 0 sin volver a
// medir las dos cosas.
const HUECOS_CONOCIDOS = [0, 4, 0, 0];   // uno por perfil, en el orden de `perfiles`
const huecosPerfil = corridas.map(rs => rs.reduce((a, r) => a + r.huecos, 0));
ck('los huecos del generador siguen siendo los 4 conocidos',
  huecosPerfil.every((n, i) => n === HUECOS_CONOCIDOS[i]),
  perfiles.map((e,i)=>e+'ms='+huecosPerfil[i]).join('  ') + ' contra los esperados ' +
  perfiles.map((e,i)=>e+'ms='+HUECOS_CONOCIDOS[i]).join('  ') +
  ' (el vx más bajo fue ' + (vxHueco === Infinity ? 'n/d' : vxHueco.toFixed(2)) +
  '); de los mismos 100 vuelos no cuentan ' + cortos100 + ' cuyo arco no cubre ' +
  'AVANCE_MIN (' + M.AVANCE_MIN + ' px) ni ' + pique100 + ' tras un pique en el suelo');

// El ruido es la varianza del score con la MISMA entrada (error 0, sin jitter) y
// distinto escenario: es lo que el jugador no controla. La señal es lo que separa
// al impecable del torpe. El juego viejo medía 1,48 acá.
const fijo = Array.from({ length: 40 }, (_, i) => vuelo(0, 5000 + i * 91));
const pts = fijo.map(r => r.pts);
const med = pts.reduce((a,b)=>a+b,0) / pts.length;
const ruido = Math.sqrt(pts.reduce((a,b)=>a+(b-med)**2,0) / pts.length);
const senal = medianas[3] - medianas[0];
ck('señal/ruido > 3', senal > ruido * 3,
  'señal ' + Math.round(senal) + ' / ruido ' + Math.round(ruido) +
  ' = ' + (senal / Math.max(1, ruido)).toFixed(2));

const perfecto = vuelo(0, 777);

// --- la regla de variedad, CABLEADA (no sólo unitaria) ---
// El mismo vuelo dos veces: mismo error (0, o sea sin sorteo), misma semilla, mismo arco.
// La única diferencia es que el segundo bot le pega siempre al mismo TIPO de obstáculo.
// Si la variedad entra en el puntaje, tiene que pagarle menos. Es la aserción que faltaba:
// las unitarias de `factorVariedad` de arriba pasan igual con la regla desconectada, y
// borrar el `*factor` de la línea del puntaje del motor dejaba los cuatro suites verdes.
// MUERDE: sin el `*factor` los dos vuelos dan exactamente el mismo score y esto cae.
const monotono = vuelo(0, 777, undefined, true);
ck('la variedad entra en el puntaje: repetir el mismo tipo de obstáculo paga menos',
  monotono.pts < perfecto.pts,
  'variando ' + perfecto.pts + ' contra ' + monotono.pts + ' repitiendo, con el mismo arco');
// Y que no sea una diferencia de redondeo: sin esto, un `factor` aplicado a un solo
// eslabón pasaría el `<` de arriba. Medido: repitiendo saca el 60% de lo que saca
// variando. No es el 20% que haría pensar el factor 1/5 de una racha llena, y la razón
// vale anotarla: el vuelo "variado" TAMPOCO varía tanto, porque `Motor.rellenar` planta
// recorriendo CLAVES en orden y 'tree' sale primero, así que la cadena normal ya viene
// con rachas y ya paga parte del descuento. La vara va en 0,8 para que el margen sea el
// medido y no el teórico.
ck('y paga bastante menos, no dos puntos menos', monotono.pts < perfecto.pts * 0.8,
  'repitiendo saca ' + (monotono.pts / Math.max(1, perfecto.pts) * 100).toFixed(0) +
  '% de lo que saca variando');

// Los dos pisos se miden en el PEOR de los 41 vuelos impecables y no en uno solo:
// "no muere nunca" verificado en una semilla es la clase de garantía flojita que ya
// costó tres rondas de arreglos. Los 40 vuelos del ruido son con error 0, así que
// ya están medidos y sirven de barrido gratis.
const impecables = fijo.concat([perfecto]);
const peorPasos = Math.min(...impecables.map(r => r.pasos));
const peorPts = Math.min(...impecables.map(r => r.pts));
ck('el bot perfecto no muere: vuela hasta el corte', peorPasos >= 39000,
  'el peor de ' + impecables.length + ' vuelos impecables murió a los ' + peorPasos + ' pasos');
// El presupuesto de legibilidad de test-generador.js corre su cadena de rebotes a
// vx=9 y no a VX_MAX. Eso vale sólo mientras la cadena de verdad no llegue a 9: si
// llegara, el presupuesto estaría medido por debajo del peor caso y diría 848 ms
// donde el jugador ve 758. Acá se mide con el bot, que es el único que corre cadenas
// largas de verdad. Medido: el peor rebote de los 41 vuelos va a 6,95.
const peorVxRebote = Math.max(...impecables.map(r => r.vxRebote));
ck('la cadena nunca llega a la velocidad que supone el presupuesto de legibilidad',
  peorVxRebote < 9, 'el rebote más rápido fue a vx ' + peorVxRebote.toFixed(2) + ' y el ' +
  'presupuesto mide la cadena a 9');

// --- sin techo: el score no se satura con el largo del vuelo ---
// El juego viejo se clavaba en ~5000 y al intento 205 dejaba de mejorar. Esto se mide
// contra algo que crece con el largo del vuelo, no contra la mediana del peor perfil:
// la versión anterior comparaba con `medianas[0] * 10`, y con los perfiles nuevos esa
// vara cayó a ~8.400 contra 400.000 reales, así que saltaba cuando el TORPE puntuaba
// de más y no cuando aparecía un techo.
// Como el bot con error 0 no sortea nada, un vuelo más corto con la misma semilla es
// exactamente el PREFIJO del vuelo entero: se puede comparar el mismo vuelo consigo
// mismo a dos largos. Cuadruplicar el largo tiene que pagar más de 4×, o sea que el
// score crezca más rápido que el tiempo — que es lo que hace un combo que no para de
// subir. La vara es la relación de largos, no un número inventado.
// Medido: sano 9,15×; con tope de combo 3,27×; con tope por rebote 3,14×.
// Reemplaza a la aserción de plateau que estaba acá al lado: las dos medían esta misma
// propiedad (una a 2× el largo, ésta a 4×) y morían con los mismos mutantes, así que
// quedó la que tiene más palanca. Un tope tardío se nota MÁS acá, porque el vuelo
// largo es el numerador.
const cuarto = vuelo(0, 777, TOPE / 4).pts;
ck('sin techo: cuadruplicar el vuelo paga más de 4× (el score no se satura)',
  perfecto.pts > cuarto * 4,
  'un cuarto de vuelo ' + cuarto + ', vuelo entero ' + perfecto.pts +
  ' = ' + (perfecto.pts / Math.max(1, cuarto)).toFixed(2) + '×');

console.log('destreza: ' + perfiles.map((e,i)=>e+'ms=' + medianas[i]).join('  ') +
  '  |  señal/ruido ' + (senal / Math.max(1, ruido)).toFixed(2) +
  ' (σ ' + Math.round(ruido) + ', ' + Math.min(...pts) + '..' + Math.max(...pts) + ' con entrada idéntica)' +
  '\n          peor de ' + impecables.length + ' impecables: ' + peorPasos + ' pasos y ' + peorPts +
  ' pts; combo ×' + perfecto.combo + '; rebote más rápido a vx ' + peorVxRebote.toFixed(2) +
  '; 4× el largo paga ' + (perfecto.pts / Math.max(1, cuarto)).toFixed(2) + '×' +
  '\n          huecos del generador en los 100 vuelos con error: ' +
  huecosPerfil.reduce((a,b)=>a+b,0) + ' (fuera del contrato, mismos 100 vuelos: ' +
  cortos100 + ' con el arco más corto que AVANCE_MIN, ' + pique100 + ' tras un pique)');
console.log(fail.length ? 'FALLAS:\n- ' + fail.join('\n- ') : 'TODO OK — rebote, combo, puntaje, variedad y destreza');
process.exit(fail.length ? 1 : 0);
