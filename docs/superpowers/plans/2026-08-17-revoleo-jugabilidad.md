# Rediseño de jugabilidad y puntaje — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el juego en un solo revoleo por partida donde el vuelo se
sostiene con rebotes a tiempo, con score sin techo y dominado por destreza en vez
de azar.

**Architecture:** La lógica pura del juego (generador de escenario, predicción de
trayectoria, resolución de rebotes, puntaje) sale a `motor.js`, sin DOM, cargable
tanto por el navegador como por `require()` de Node. La clase `Component` dentro de
`Revolea el Palo.dc.html` queda como orquestación: input, render en canvas y estado
de React. Los objetivos de diseño se escriben como tests ejecutables que corren con
`node` sin instalar nada.

**Tech Stack:** JavaScript sin dependencias. Canvas 2D. `node` para tests.
El `.dc.html` es la fuente de verdad; `index.html` se genera con `build-app.js`.

## Global Constraints

- Sin dependencias nuevas. Ni de runtime ni de test. `node` y nada más.
- `Revolea el Palo.dc.html` es la fuente de verdad. Nunca editar `index.html` a
  mano: se regenera con `node build-app.js .`
- Todo texto visible al jugador va en castellano rioplatense (voseo).
- Los comentarios del código van en castellano, como el resto del archivo.
- Paleta: sólo colores de `_ds/sdga-design-system-*/tokens/colors.css`.
  Verde `#0C2B1C` `#14402A` `#1C5638` `#2E7D4F` `#6FAE87` `#D9E8DC`,
  crema `#F4EEDA` `#E7DFC2`, oro `#E8C34A` `#C9A22E`, rojo `#BC4B3C`.
- El paso de lógica es fijo: `STEP = 1000/60`. Nunca atar lógica a la tasa de frames.
- Nunca atar el game loop a `document.hidden`: la preview del editor corre en un
  documento oculto y el juego no arrancaría. Para eso está el watchdog de `runLoop`.
- Todos los tests tienen que pasar antes de cada commit:
  `node test-motor.js "Revolea el Palo.dc.html"` y `node test-db.js "Revolea el Palo.dc.html"`
- Nunca dibujar el sprite de una pose sin verificar `naturalWidth`: un SVG que no
  cargó tira `InvalidStateError` y aborta `draw()` a mitad de frame.

---

## Estructura de archivos

| archivo | responsabilidad |
| --- | --- |
| `motor.js` (nuevo) | Lógica pura sin DOM: constantes de física, generador con invariante de solvencia, predicción de trayectoria, resolución de rebotes, puntaje. Exporta a `window` en el navegador y a `module.exports` en Node. |
| `Revolea el Palo.dc.html` (modificar) | El helmet carga `motor.js`. La clase `Component` orquesta: input, canvas, estado. Deja de tener la lógica pura. |
| `build-app.js` (modificar) | Emite `<script src="motor.js">` antes del motor en `index.html`. |
| `test-motor.js` (modificar) | Regresión del loop de paso fijo y la poda de escenario. Sólo se le sube el umbral de la aserción de poda en la Task 5: el generador nuevo siembra el escenario de una, así que el pico absoluto cambia aunque no haya fuga. |
| `test-db.js` (conservar) | Regresión de la base de jugadores. Se ajusta sólo la clave v4→v5 en la Task 8. |
| `test-generador.js` (nuevo) | Invariante de solvencia y presupuesto de legibilidad. |
| `test-destreza.js` (nuevo) | Monotonía, señal/ruido, ausencia de techo, bot perfecto inmortal. |

---

### Task 1: Extraer la lógica pura a `motor.js` con predicción de trayectoria

Primero se crea el módulo con lo mínimo para que sea testeable: constantes y
predicción de trayectoria. La predicción es la base de todo lo demás — el
generador la usa para verificar solvencia y el render la dibuja.

**Files:**
- Create: `motor.js`
- Create: `test-generador.js`
- Modify: `Revolea el Palo.dc.html` (bloque `<helmet>`, agregar el `<script src>`)
- Modify: `build-app.js` (agregar el `<script src>` al `<head>` generado)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `F` — objeto de constantes: `{STEP, VUELO, G, GY, TEE, PXM, W, H, VX_MAX, TECHO, ZOOM_VUELO, AVISO_MIN_MS, VENTANA_PERFECTO, VENTANA_BUENO}`
  - `trayectoria(est, pasos)` → `Array<{x, y, vx, vy, paso}>`; `est` es `{x, y, vx, vy}`.
    Simula la física del vuelo sin efectos secundarios. Un elemento por paso de
    física (no por frame). Corta si toca el suelo.
  - `metros(x)` → número de metros desde el tee.

- [ ] **Step 1: Escribir el test que falla**

Crear `test-generador.js`:

```js
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-generador.js
```

Esperado: FALLA con `Cannot find module './motor.js'`

- [ ] **Step 3: Escribir `motor.js`**

```js
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
      if (e.y >= F.GY) break;
    }
    return out;
  }

  const api = { F: F, acotar: acotar, metros: metros, paso: paso, trayectoria: trayectoria };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node test-generador.js
```

Esperado: `TODO OK — generador y trayectoria`

- [ ] **Step 5: Cargar `motor.js` en el `.dc.html`**

En `Revolea el Palo.dc.html`, dentro del bloque `<helmet>`, inmediatamente después
de la línea que carga `_ds_bundle.js`, agregar:

```html
<script src="motor.js"></script>
```

- [ ] **Step 6: Cargar `motor.js` en el shell generado**

En `build-app.js`, en el template del `<head>`, justo antes de la línea
`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton...`,
agregar:

```html
<script src="motor.js"></script>
```

- [ ] **Step 7: Regenerar y verificar que no se rompió nada**

```bash
node build-app.js .
node test-motor.js "Revolea el Palo.dc.html"
node test-db.js "Revolea el Palo.dc.html"
node test-generador.js
```

Esperado: los cuatro en verde. `index.html` tiene que contener `src="motor.js"`.

- [ ] **Step 8: Commit**

```bash
git add motor.js test-generador.js "Revolea el Palo.dc.html" build-app.js index.html
git commit -m "Extraer lógica pura a motor.js con predicción de trayectoria"
```

---

### Task 2: Generador de escenario con invariante de solvencia

El corazón del arreglo del azar. El escenario sigue siendo aleatorio en tipo y
separación, pero se garantiza que desde cualquier rebote se alcanza al menos un
objetivo siguiente. Sin esto, el jugador pierde por huecos que no controlaba.

**Files:**
- Modify: `motor.js`
- Modify: `test-generador.js`

**Interfaces:**
- Consumes: `F`, `trayectoria` de la Task 1.
- Produces:
  - `TIPOS` — `{tree:{w:26,h:46}, cart:{w:30,h:20}, caddie:{w:16,h:30}, sdga:{w:18,h:30}}`
  - `lcg(semilla)` → `function(): number` en `[0,1)`. Generador determinista para
    que los tests sean reproducibles.
  - `generar(rand, desde, hasta)` → `Array<{t, x, w, h, cima}>` ordenado por `x`.
    `cima` es la `y` del techo del obstáculo (`GY - h`), que es donde se rebota.
  - `alcanzables(obs, est)` → `Array` de obstáculos que la trayectoria desde `est`
    cruza a la altura de su `cima`.
  - `rellenar(obs, rand, est)` → muta `obs` agregando un obstáculo alcanzable si no
    había ninguno. Devuelve `'ya-habia'`, `'planto'` o `'sin-salida'`.

    **No devuelve booleano a propósito.** Un `false` significaría dos cosas
    opuestas —«no hacía falta» y «no hay salida»— y quien llama necesita
    distinguirlas: la primera sigue el vuelo, la segunda lo termina.

    **Sólo planta si `est.vy < 0`**, es decir sólo después de un rebote que
    devolvió altura. Con un estado descendiendo devuelve `'sin-salida'` sin
    plantar. Esto es la invariante del spec escrita en código: se garantiza
    solvencia desde un rebote exitoso, no desde un raspón. Sin ese guardia
    `rellenar` planta siempre, el palo rebota incluso después de un raspón y el
    vuelo **nunca termina** — un jugador malo volaría para siempre y se destruye
    la gradiente de destreza, que es justo lo que este rediseño viene a arreglar.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `test-generador.js`, antes de la línea del `console.log` final:

```js
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-generador.js
```

Esperado: FALLA con `M.lcg is not a function`

- [ ] **Step 3: Implementar el generador en `motor.js`**

Insertar antes de la línea `const api = {`:

```js
  const TIPOS = {
    tree:   { w: 26, h: 46 },
    cart:   { w: 30, h: 20 },
    caddie: { w: 16, h: 30 },
    sdga:   { w: 18, h: 30 },
  };
  const CLAVES = ['tree', 'cart', 'caddie', 'sdga'];

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
  function rellenar(obs, rand, est) {
    if (alcanzables(obs, est).length) return false;
    const tr = trayectoria(est, 1200);
    let puesto = null;
    for (const clave of CLAVES) {
      const cima = F.GY - TIPOS[clave].h;
      for (let i = 1; i < tr.length; i++) {
        if (tr[i].vy > 0 && tr[i - 1].y <= cima && tr[i].y >= cima) {
          puesto = { t: clave, x: Math.round(tr[i].x - TIPOS[clave].w / 2),
                     w: TIPOS[clave].w, h: TIPOS[clave].h, cima: cima };
          break;
        }
      }
      if (puesto) break;
    }
    if (!puesto) return false;
    obs.push(puesto);
    obs.sort((a, b) => a.x - b.x);
    return true;
  }
```

Y agregar las cuatro funciones al objeto `api`:

```js
  const api = { F: F, acotar: acotar, metros: metros, paso: paso, trayectoria: trayectoria,
                TIPOS: TIPOS, lcg: lcg, generar: generar, alcanzables: alcanzables,
                rellenar: rellenar };
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node test-generador.js
```

Esperado: `TODO OK`. Si falla `el generador nunca deja un hueco sin salida`,
`rellenar` no está encontrando cruce: bajar el paso mínimo de `generar` de 90 a 70.

- [ ] **Step 5: Commit**

```bash
git add motor.js test-generador.js
git commit -m "Generador de escenario con invariante de solvencia"
```

---

### Task 3: Presupuesto de legibilidad

Verificar con números que el jugador ve el objetivo con tiempo suficiente para
reaccionar. Sin esto ninguna mecánica de timing es jugable.

**Files:**
- Modify: `motor.js`
- Modify: `test-generador.js`

**Interfaces:**
- Consumes: `F`, `trayectoria`, `generar`, `alcanzables` de las Tasks 1 y 2.
- Produces:
  - `avisoMs(est, o, zoom)` → milisegundos entre que el obstáculo `o` entra en el
    campo visible (ancho `F.W * zoom`) y el momento en que el palo llega a su cima.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `test-generador.js` antes del `console.log`:

```js
// --- presupuesto de legibilidad ---
let cortos = 0, medidos = 0, minAviso = Infinity;
for (let s = 1; s <= 200; s++) {
  const r = M.lcg(s * 7);
  const esc = M.generar(r, 400, 20000);
  let est = { x: 300, y: M.F.GY - 60, vx: 9, vy: -7 };
  for (let reb = 0; reb < 10; reb++) {
    M.rellenar(esc, r, est);
    const alc = M.alcanzables(esc, est);
    if (!alc.length) break;
    const o = alc[0], ms = M.avisoMs(est, o, M.F.ZOOM_VUELO);
    medidos++; minAviso = Math.min(minAviso, ms);
    if (ms < M.F.AVISO_MIN_MS) cortos++;
    est = { x: o.x + o.w / 2, y: o.cima, vx: Math.min(M.F.VX_MAX, 9), vy: -7 };
  }
}
ck('ningún objetivo avisa con menos de AVISO_MIN_MS', cortos === 0,
  cortos + ' de ' + medidos + ' avisan poco; el mínimo fue ' + Math.round(minAviso) + ' ms');
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-generador.js
```

Esperado: FALLA con `M.avisoMs is not a function`

- [ ] **Step 3: Implementar `avisoMs` en `motor.js`**

Insertar después de `rellenar`:

```js
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
```

Agregar `avisoMs: avisoMs` al objeto `api`.

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
node test-generador.js
```

Esperado: `TODO OK`. Si falla, el test imprime el aviso mínimo real. Para
arreglarlo, en `F` bajar `VX_MAX` en pasos de 1 y/o subir `ZOOM_VUELO` en pasos de
0,25 hasta que pase, y anotar los valores finales en el comentario de `F`.

- [ ] **Step 5: Commit**

```bash
git add motor.js test-generador.js
git commit -m "Presupuesto de legibilidad verificado con números"
```

---

### Task 4: Resolución de rebotes y puntaje, en lógica pura

Las dos mecánicas centrales, todavía sin tocar el juego en vivo. Se implementan y
se prueban aisladas para que la Task 5 sólo tenga que cablearlas.

**Files:**
- Modify: `motor.js`
- Create: `test-destreza.js`

**Interfaces:**
- Consumes: `F` de la Task 1.
- Produces:
  - `resolverRebote(est, desfaseMs)` → `{tipo, vy, vx}` donde `tipo` es
    `'perfecto' | 'bueno' | 'raspon'`. `desfaseMs` es la diferencia entre cuándo
    tocó el jugador y el centro de la ventana; el signo no importa.
  - `comboTras(combo, tipo)` → número. Perfecto `combo+1`, bueno `combo`,
    raspón `max(1, floor(combo/2))`.
  - `acreditar(combo, metrosTramo)` → número de puntos del tramo.
  - `factorVariedad(ultimos, tipoObs)` → número en `(0,1]`. Repetir el mismo tipo
    de obstáculo rinde menos: `1 / (1 + repeticionesSeguidas)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `test-destreza.js`:

```js
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-destreza.js
```

Esperado: FALLA con `M.resolverRebote is not a function`

- [ ] **Step 3: Implementar en `motor.js`**

Insertar después de `avisoMs`:

```js
  // Impulso de rebote. El perfecto devuelve la energía entera, así que un jugador
  // impecable no baja nunca: el techo del score es su pulso, no una constante.
  const IMPULSO = 7.4;

  function resolverRebote(est, desfaseMs) {
    const d = Math.abs(desfaseMs);
    if (d <= F.VENTANA_PERFECTO)
      return { tipo: 'perfecto', vy: -IMPULSO, vx: Math.min(F.VX_MAX, est.vx * 1.06 + 0.4) };
    if (d <= F.VENTANA_BUENO)
      return { tipo: 'bueno', vy: -IMPULSO * 0.62, vx: Math.min(F.VX_MAX, est.vx) };
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
```

Agregar al `api`: `resolverRebote`, `comboTras`, `acreditar`, `factorVariedad`, `IMPULSO`.

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
node test-destreza.js
node test-generador.js
```

Esperado: los dos en verde.

- [ ] **Step 5: Commit**

```bash
git add motor.js test-destreza.js
git commit -m "Rebote, combo, puntaje y regla de variedad en lógica pura"
```

---

### Task 5: Cablear el vuelo nuevo en el juego

Reemplazar el vuelo pasivo de 3 aletazos por la cadena de rebotes. Acá se toca el
motor embebido en el `.dc.html`.

**Files:**
- Modify: `Revolea el Palo.dc.html` (bloque `<script type="text/x-dc">`)
- Modify: `build-app.js` (texto del cartel de ayuda)

**Interfaces:**
- Consumes: todo `motor.js`.
- Produces: en la clase `Component`,
  - `this.g.objetivo` — el obstáculo al que se dirige el palo, o `null`.
  - `this.g.combo` — número, arranca en 1.
  - `this.g.puntos` — acumulado del vuelo.
  - `this.g.ultimosTipos` — `Array<string>`, últimos 4 tipos rebotados.
  - `tocar()` — método llamado por `onDown` durante el vuelo; resuelve el rebote.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `test-destreza.js`, antes del `console.log`:

```js
// --- integración: el vuelo encadena rebotes y acredita ---
const fs = require('fs');
const cuerpo = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/
  .exec(fs.readFileSync('Revolea el Palo.dc.html', 'utf8'))[1];
ck('el motor usa Motor.resolverRebote', /Motor\.resolverRebote/.test(cuerpo));
ck('el motor usa Motor.acreditar', /Motor\.acreditar/.test(cuerpo));
ck('el motor usa Motor.rellenar', /Motor\.rellenar/.test(cuerpo));
ck('ya no hay aletazos', !/g\.air/.test(cuerpo), 'quedó g.air en el motor');
ck('hay un método tocar()', /tocar\s*\(\s*\)\s*\{/.test(cuerpo));
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-destreza.js
```

Esperado: FALLA en `el motor usa Motor.resolverRebote`

- [ ] **Step 3: Reemplazar el vuelo en el `.dc.html`**

En `newShot(intro)`, reemplazar la generación de obstáculos (el bloque
`const obs=[];let x=430; while(x<4200){...}` completo hasta `g.obs=obs;`) por:

```js
    g.rand=Motor.lcg((Math.random()*0x7fffffff)|0);
    g.obs=Motor.generar(g.rand,430,20000);
    g.combo=1;g.puntos=0;g.ultimosTipos=[];g.objetivo=null;g.xTramo=TEE;
```

En `launch()`, borrar la línea `g.air=3;` y agregar al final del método:

```js
    this.buscarObjetivo();
```

Agregar estos métodos a la clase, justo antes de `endShot(kind)`:

```js
  // El objetivo es el primer obstáculo que el arco actual cruza a la altura de su
  // cima. Se recalcula tras cada rebote, y si no hay ninguno el generador planta
  // uno: la invariante de solvencia evita perder por un hueco que no controlabas.
  buscarObjetivo(){const g=this.g,c=g.club;if(!c)return;
    const est={x:c.x,y:c.y,vx:c.vx,vy:c.vy};
    // Se ignora a propósito lo que devuelve rellenar: la decisión de terminar el
    // vuelo sale de que alcanzables quede vacío, no del string. El string existe
    // para que el test de la invariante pueda observar qué camino tomó — sin él no
    // habría forma de verificar que a un raspón no se le regala salida.
    // 'sin-salida' sólo pasa viniendo de un raspón: el palo baja, no alcanza nada,
    // se deja caer y el vuelo termina al tocar el suelo.
    Motor.rellenar(g.obs,g.rand,est);
    const alc=Motor.alcanzables(g.obs,est);
    g.objetivo=alc.length?alc[0]:null;
    g.pasoObjetivo=g.objetivo?this.pasoDeLlegada(est,g.objetivo):null;}

  // En qué paso de física el arco llega a la cima del objetivo. De acá sale el
  // centro de la ventana de toque. El valor es relativo al paso actual del vuelo.
  pasoDeLlegada(est,o){const tr=Motor.trayectoria(est,1200);
    for(let i=1;i<tr.length;i++)
      if(tr[i].vy>0&&tr[i-1].y<=o.cima&&tr[i].y>=o.cima&&tr[i].x>=o.x&&tr[i].x<=o.x+o.w)
        return (this.g.pasosVuelo||0)+i;
    return null;}

  // Toque del jugador durante el vuelo.
  tocar(){const g=this.g,c=g.club;
    if(!c||g.phase!=='fly'||!g.objetivo||g.pasoObjetivo==null)return;
    const desfase=(g.pasosVuelo-g.pasoObjetivo)*(Motor.F.STEP/Motor.F.VUELO);
    this.aplicarRebote(desfase);}

  aplicarRebote(desfaseMs){const g=this.g,c=g.club,o=g.objetivo;
    const r=Motor.resolverRebote({x:c.x,y:c.y,vx:c.vx,vy:c.vy},desfaseMs);
    // se acredita con el combo vigente ANTES de aplicar el resultado
    const tramo=Motor.metros(c.x)-Motor.metros(g.xTramo);
    const factor=Motor.factorVariedad(g.ultimosTipos,o?o.t:'');
    g.puntos+=Math.round(Motor.acreditar(g.combo,tramo)*factor);
    g.xTramo=c.x;
    g.combo=Motor.comboTras(g.combo,r.tipo);
    c.vy=r.vy;c.vx=r.vx;c.grounded=false;
    if(o){g.ultimosTipos.push(o.t);if(g.ultimosTipos.length>4)g.ultimosTipos.shift();
      o.hit=true;g.fx.push({x:c.x,y:c.y,t:16});}
    if(r.tipo==='perfecto'){this.sfxTrick();this.showFloat('+'+g.puntos+'  ×'+g.combo)}
    else if(r.tipo==='raspon'){this.sfxBail();this.showFloat('¡RASPÓN!')}
    else this.sfxLand();
    g.shake=r.tipo==='perfecto'?4:6;
    this.buscarObjetivo();}
```

En `step()`, dentro del bloque `if(g.acc>=1){`, después de `g.flyT++;` agregar:

```js
      g.pasosVuelo=(g.pasosVuelo||0)+1;
```

En `onDown`, reemplazar la rama del vuelo:

```js
    if(g&&g.phase==='fly'&&g.club&&!g.club.grounded){this.tocar();return}
```

Borrar el método `flap()` completo y la línea que dibuja los aletazos en `draw()`
(`if(g.phase==='fly'){for(let i=0;i<3;i++)this.px(W/2-6+i*6,44,4,4,...)}`).

En `endShot(kind)`, cambiar el cálculo de puntos por:

```js
    const tramo=Motor.metros(g.club.x)-Motor.metros(g.xTramo);
    let shotPts=g.puntos+Motor.acreditar(g.combo,tramo);
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
node build-app.js .
node test-destreza.js
node test-generador.js
node test-motor.js "Revolea el Palo.dc.html"
node test-db.js "Revolea el Palo.dc.html"
```

Esperado: los cuatro en verde.

- [ ] **Step 5: Hacer que el vuelo en vivo consuma `Motor.paso()`**

Sin este paso hay **dos implementaciones de la física**: `Motor.paso()` predice con
`VX_MAX` y sin viento, y el loop en vivo integra inline con `clamp(c.vx,-16,16)` y
suma viento. El anillo de timing sale de `pasoDeLlegada`, que usa el predictor: si
discrepan, el anillo apunta al momento equivocado y el juego se vuelve a sentir
azaroso. Una sola implementación o la mecánica no funciona.

En `step()`, dentro de `if(g.acc>=1){`, reemplazar el bloque de integración
—desde `const sp=Math.hypot(c.vx,c.vy),drag=...` hasta `c.x+=c.vx;c.y+=c.vy;`
inclusive, y también el `if(c.y<50){...}` que le sigue— por:

```js
      // Una sola física: el vuelo en vivo usa el mismo paso que la predicción, así
      // el anillo de timing no puede apuntar a un momento que no va a pasar.
      const e=Motor.paso({x:c.x,y:c.y,vx:c.vx,vy:c.vy});
      c.x=e.x;c.y=e.y;c.vx=e.vx;c.vy=e.vy;
```

Notar que `Motor.paso()` ya aplica el clamp del techo (`F.TECHO`), así que el
`if(c.y<50)` desaparece por completo. El `drag` que el código viejo aplicaba sólo
cuando `!c.grounded` ahora se aplica siempre: es correcto, porque una vez que
`c.grounded` es `true` el vuelo terminó y este bloque no vuelve a correr.

Agregar a `test-generador.js`, antes del `console.log`, la aserción que vuelve
verdadero el comentario de `paso()`:

```js
// --- predicción y realidad no pueden divergir ---
// El anillo de timing sale del predictor. Si el vuelo en vivo integrara distinto,
// el anillo apuntaría a un momento que no va a pasar. Se compara paso a paso.
const cuerpoM = require('fs').readFileSync('Revolea el Palo.dc.html', 'utf8');
ck('el vuelo en vivo usa Motor.paso', /Motor\.paso\(/.test(cuerpoM));
ck('no quedó integración inline duplicada',
  !/c\.vx=clamp\(c\.vx,-16,16\)/.test(cuerpoM) && !/c\.vy\+=G\*0\.44/.test(cuerpoM));
```

- [ ] **Step 6: Ajustar el umbral de poda de `test-motor.js`**

`test-motor.js` afirma `g.obs acotado (<80)`. Ese umbral asumía el generador viejo,
que sembraba hasta 4200 px; el nuevo siembra hasta 20000 px de una, así que el pico
inicial ronda los 120 obstáculos y la aserción falla sin que haya ninguna fuga.

Lo que importa sigue siendo que **no crezca sin techo**, no un número absoluto. En
`test-motor.js`, cambiar la aserción por:

```js
ck('g.obs no crece sin techo', maxObs < 200, 'pico ' + maxObs);
```

y en el bloque de vuelo largo, cambiar `ck('poda: g.obs acotado en vuelo largo', withCull.peak < 60, ...)`
por `withCull.peak < 200`. La aserción que de verdad protege contra la fuga es la
de al lado, la que compara con la corrida sin poda, y esa no se toca.

- [ ] **Step 7: Actualizar el cartel de ayuda**

En `Revolea el Palo.dc.html` y en el template de `build-app.js`, el texto del
`rHint` durante el vuelo dice «¡Tocá la pantalla para que el palo planee!».
Cambiarlo por `'Tocá justo cuando llegue'`. Buscar también en `launch()` y en el
bloque de `hudT` de `step()` los textos que mencionan aletazos y reemplazarlos por
`'Combo ×'+g.combo`.

- [ ] **Step 8: Regenerar, correr todo y commitear**

```bash
node build-app.js .
node test-destreza.js && node test-generador.js && node test-motor.js "Revolea el Palo.dc.html" && node test-db.js "Revolea el Palo.dc.html"
git add motor.js "Revolea el Palo.dc.html" build-app.js index.html test-destreza.js
git commit -m "Cablear la cadena de rebotes en el vuelo"
```

---

### Task 6: Cámara alejada y arco predicho

Hacer visible lo que la Task 3 verificó por número. Sin esto el jugador no puede
usar la mecánica que ya funciona.

**Files:**
- Modify: `Revolea el Palo.dc.html` (método `draw()`)

**Interfaces:**
- Consumes: `Motor.F.ZOOM_VUELO`, `Motor.trayectoria`, `this.g.objetivo`, `this.g.pasoObjetivo`, `this.g.pasosVuelo`.
- Produces: nada que consuman otras tasks.

- [ ] **Step 1: Alejar la cámara durante el vuelo**

En `draw()`, después de `const cam=g.cam;` agregar:

```js
    // Durante el vuelo se aleja la cámara: con el encuadre de 134 px un obstáculo
    // entraba en pantalla 0,16 s antes de alcanzarlo y no había cómo reaccionar.
    const z=g.phase==='fly'?Motor.F.ZOOM_VUELO:1;
    if(z!==1){ctx.setTransform(2/z,0,0,2/z,
      (shk?(Math.random()-.5)*shk*2:0)+W*(z-1)/3,
      (shk?(Math.random()-.5)*shk*2:0)+GY*(z-1)/2);}
```

Reemplazar los fondos que dependen del ancho visible para que cubran el encuadre
alejado: en las tres líneas del cielo y en la del suelo, cambiar `W+16` por
`W*z+16` y `-8` por `-8-W*(z-1)/3`.

- [ ] **Step 2: Dibujar el arco predicho y el anillo de timing**

Insertar en `draw()`, justo antes del bloque que dibuja el palo
(`if(g.club&&(g.phase==='fly'||...`):

```js
    // Arco predicho: convierte "adivinar" en "leer". Se ve a qué se le va a pegar,
    // así la única destreza que queda es el timing.
    if(g.phase==='fly'&&g.club&&!g.club.grounded){
      const tr=Motor.trayectoria({x:g.club.x,y:g.club.y,vx:g.club.vx,vy:g.club.vy},600);
      for(let i=6;i<tr.length;i+=6)this.px(tr[i].x-cam,tr[i].y,1,1,'rgba(244,238,218,.35)');
      const o=g.objetivo;
      if(o){
        // marca del punto de impacto
        this.px(o.x-cam,o.cima-2,o.w,2,'#E8C34A');
        // anillo que se cierra: señal del toque
        if(g.pasoObjetivo!=null){
          const faltan=g.pasoObjetivo-(g.pasosVuelo||0);
          const r=Math.max(2,Math.min(26,faltan*0.5));
          ctx.save();ctx.strokeStyle='#E8C34A';ctx.lineWidth=1;
          ctx.beginPath();ctx.arc(o.x-cam+o.w/2,o.cima,r,0,7);ctx.stroke();
          ctx.restore();this._fs=null;
        }
      }
    }
```

- [ ] **Step 3: Verificar en el navegador**

```bash
node build-app.js .
```

Levantar un servidor estático en el directorio del proyecto y abrir `index.html`.
Dar de alta un jugador, empezar, cargar un tiro y soltar. Verificar a ojo:
el encuadre se aleja al lanzar, se ve el arco punteado, hay una marca dorada sobre
el próximo obstáculo y un anillo que se cierra. Tocar cuando el anillo está chico
tiene que producir un rebote hacia arriba.

- [ ] **Step 4: Correr todos los tests y commitear**

```bash
node test-destreza.js && node test-generador.js && node test-motor.js "Revolea el Palo.dc.html" && node test-db.js "Revolea el Palo.dc.html"
git add "Revolea el Palo.dc.html" index.html
git commit -m "Cámara alejada, arco predicho y anillo de timing"
```

---

### Task 7: Bot de destreza y las aserciones de diseño

El test que contesta «¿esto premia destreza?» con números en vez de opinión.

**Files:**
- Modify: `test-destreza.js`

**Interfaces:**
- Consumes: el motor completo vía el mismo arnés que usa `test-motor.js`.
- Produces: nada.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `test-destreza.js` antes del `console.log` final:

```js
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

// Un vuelo completo con un bot cuyo error de timing es `errorMs`.
function vuelo(errorMs, semilla) {
  const { C, adv, now } = arnes();
  const c = new C();
  c.props = { tiros: 1, censura: 'Sin filtro', viento: false, sonido: false };
  c.componentDidMount();
  c.state.player = { id:'x', name:'bot', emoji:'x', best:0 };
  let s = semilla; Math.random = () => (s = (s*1103515245+12345) & 0x7fffffff) / 0x7fffffff;
  c.start();
  for (let i = 0; i < 8000 && c.g.phase !== 'ready'; i++) { adv(M.F.STEP); c.tick(now()); }
  c.begin();
  for (let i = 0; i < 30; i++) { adv(M.F.STEP); c.tick(now()); }
  c.g.manual = true; c.g.angle = 45; c.g.power = 1;
  c.fire();
  let pasos = 0;
  while (pasos < 40000 && (c.g.phase === 'fly' || c.g.phase === 'swing')) {
    adv(M.F.STEP); c.tick(now()); pasos++;
    if (c.g.phase === 'fly' && c.g.objetivo && c.g.pasoObjetivo != null) {
      const faltan = c.g.pasoObjetivo - (c.g.pasosVuelo || 0);
      // el bot toca cuando cree que llegó, con su error característico
      const objetivoPaso = errorMs / (M.F.STEP / M.F.VUELO);
      if (faltan <= objetivoPaso) c.tocar();
    }
  }
  return { pts: c.g.puntos, pasos: pasos, combo: c.g.combo };
}

const mediana = a => a.slice().sort((x,y)=>x-y)[a.length >> 1];
const perfiles = [120, 60, 20, 0];   // ms de error: de torpe a perfecto
const medianas = perfiles.map(e => mediana(
  Array.from({ length: 25 }, (_, i) => vuelo(e, 1000 + i * 37).pts)));

ck('la destreza es monótona: menos error ⇒ más puntos',
  medianas.every((v, i) => i === 0 || v >= medianas[i-1]),
  perfiles.map((e,i)=>e+'ms='+medianas[i]).join('  '));

const fijo = Array.from({ length: 40 }, (_, i) => vuelo(0, 5000 + i * 91).pts);
const med = fijo.reduce((a,b)=>a+b,0) / fijo.length;
const ruido = Math.sqrt(fijo.reduce((a,b)=>a+(b-med)**2,0) / fijo.length);
const senal = medianas[3] - medianas[0];
ck('señal/ruido > 3', senal > ruido * 3,
  'señal ' + Math.round(senal) + ' / ruido ' + Math.round(ruido) +
  ' = ' + (senal / Math.max(1, ruido)).toFixed(2));

const perfecto = vuelo(0, 777);
ck('el bot perfecto no muere: vuela hasta el corte',
  perfecto.pasos >= 39000, 'murió a los ' + perfecto.pasos + ' pasos');
ck('sin techo: el bot perfecto puntúa mucho más que el torpe',
  perfecto.pts > medianas[0] * 10, perfecto.pts + ' vs ' + medianas[0]);
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-destreza.js
```

Esperado: FALLA en al menos una de las cuatro aserciones nuevas. El test imprime
los valores reales.

- [ ] **Step 3: Calibrar hasta que pasen**

Ajustar en `motor.js`, en este orden, corriendo el test después de cada cambio:

1. Si falla **monotonía**: las ventanas están muy anchas y todos aciertan igual.
   Bajar `VENTANA_PERFECTO` a 45 y `VENTANA_BUENO` a 120.
2. Si falla **señal/ruido**: el azar todavía pesa. Bajar el efecto del raspón sobre
   `vx` de `0.65` a `0.55` para castigar más el error, y subir `IMPULSO` a 7.8 para
   premiar más el acierto.
3. Si falla **el bot perfecto no muere**: `IMPULSO` no alcanza para volver a la
   altura de rebote. Subirlo en pasos de 0,3 hasta que sobreviva.
4. Si falla **sin techo**: revisar que `factorVariedad` no esté ahogando el score;
   el bot rebota en lo que le toca, así que si el escenario le da muchos del mismo
   tipo el factor lo hunde. Cambiar el denominador de `1 + repes` a `1 + repes*0.5`.

Anotar los valores finales en el comentario de `F` en `motor.js`.

- [ ] **Step 4: Correr todos los tests y commitear**

```bash
node test-destreza.js && node test-generador.js && node test-motor.js "Revolea el Palo.dc.html" && node test-db.js "Revolea el Palo.dc.html"
git add motor.js test-destreza.js
git commit -m "Bot de destreza: monotonía, señal/ruido y ausencia de techo"
```

---

### Task 8: Limpieza, migración a v5 y recalibración de leyendas

Sacar todo lo que el diseño nuevo dejó sin sentido, y poner el ranking en la escala
nueva. Es la task con más borrado que escritura.

**Files:**
- Modify: `Revolea el Palo.dc.html`
- Modify: `build-app.js`
- Modify: `test-db.js`
- Modify: `docs/superpowers/specs/2026-08-17-revoleo-jugabilidad-design.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `DB_KEY = 'sdga-palo-v5'`.

- [ ] **Step 1: Escribir el test que falla**

En `test-db.js`, reemplazar las tres apariciones de `'sdga-palo-v4'` por
`'sdga-palo-v5'`. Agregar al final, antes del `console.log`:

```js
// migración: los jugadores viejos se conservan, los puntajes arrancan limpios
store['sdga-palo-v4'] = JSON.stringify({
  players: [{ id:'viejo', name:'Lechu', emoji:'🥃', best:8245, rondas:12, visto:1 }],
  scores: [{ p:'viejo', pts:8245, m:600, at:1 }],
});
delete store['sdga-palo-v5'];
g = load();
const v5 = JSON.parse(store['sdga-palo-v5'] || '{"players":[],"scores":[]}');
ck('migra el jugador viejo', v5.players.some(p => p.name === 'Lechu'), JSON.stringify(v5.players));
ck('le resetea el best', v5.players.every(p => p.best === 0), JSON.stringify(v5.players));
ck('no arrastra puntajes de la escala vieja', v5.scores.length === 0, v5.scores.length);
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node test-db.js "Revolea el Palo.dc.html"
```

Esperado: FALLA en `migra el jugador viejo`

- [ ] **Step 3: Implementar la migración y borrar lo que sobra**

En `Revolea el Palo.dc.html`:

Cambiar `const DB_KEY='sdga-palo-v4';` por `const DB_KEY='sdga-palo-v5';` y agregar
dentro del objeto `DB`, como primer método:

```js
  // Migración de v4: los nombres y emojis se conservan, pero los puntajes de la
  // fórmula vieja no son comparables con los de la nueva, así que arrancan en 0.
  migrar(){try{
    if(localStorage.getItem(DB_KEY))return;
    const v=JSON.parse(localStorage.getItem('sdga-palo-v4'));
    if(!v||!v.players)return;
    this.write({players:v.players.map(p=>({id:p.id,name:p.name,emoji:p.emoji,
      best:0,rondas:0,visto:p.visto||Date.now()})),scores:[]});
  }catch(e){}},
```

Y llamarla al principio de `read()`:

```js
  read(){try{const d=JSON.parse(localStorage.getItem(DB_KEY));if(d&&d.players&&d.scores)return d}catch(e){}
    this.migrar();
    try{const d=JSON.parse(localStorage.getItem(DB_KEY));if(d&&d.players&&d.scores)return d}catch(e){}
    return {players:[],scores:[]}},
```

Borrar del motor:

- Los métodos `startPutt()`, `firePutt()` completos.
- En `step()`, los bloques `if(g.phase==='putt'||g.phase==='puttcharge')` y
  `if(g.phase==='putt'&&!g.manual)`.
- En `draw()`, el bloque `if(g.phase==='putt'||g.phase==='puttcharge'){...}`.
- En `onDown` y `onUp`, las ramas de `putt` y `puttcharge`.
- La línea `g.wind=...` de `newShot`, la línea `c.vx+=g.wind*0.0009;` de `step()`,
  y el bloque del HUD de viento (`rWind`) en el `.dc.html` y en `build-app.js`.
- En `newShot`, el bloque de bunkers (`const bk=[];let bx=260;...g.bunkers=bk;`),
  su dibujo en `draw()` y la rama `if(inB)` de `step()`.
- En `endShot`, la rama `if(kind==='bunker')` y el `÷2`.
- En `step()`, el bloque del techo que dispara `ASTRONAUTA`; dejar sólo el clamp
  de `c.y` y el rebote de `vy`.
- El barrido automático del ángulo: en `step()`, dentro de
  `if(g.phase==='charge')`, borrar la línea `if(!g.manual){const s=(t%3000)/3000...}`.
- La prop `viento` del `data-props` del `<script data-dc-script>`.

En `renderVals()`, cambiar `shots(){return this.props.tiros||3}` por
`shots(){return 1}` y en `next()` la rama de tiro siguiente ya nunca se usa: dejar
sólo el camino de `last`.

- [ ] **Step 4: Correr todos los tests para verificar que pasan**

```bash
node build-app.js .
node test-db.js "Revolea el Palo.dc.html" && node test-destreza.js && node test-generador.js && node test-motor.js "Revolea el Palo.dc.html"
```

Esperado: los cuatro en verde.

- [ ] **Step 5: Recalibrar las leyendas del ranking**

Correr el bot para saber qué puntajes produce cada nivel de precisión:

```bash
node -e "
const M=require('./motor.js');
" ; node test-destreza.js
```

El test imprime las medianas por perfil en la línea de monotonía. Con esos números,
en `Revolea el Palo.dc.html` reemplazar el array `RECORDS` por ocho leyendas
escalonadas entre la mediana del perfil de 120 ms y unas tres veces la del perfil
perfecto, conservando emojis y nombres actuales:

```js
const RECORDS=[["🗿","El Moai",A],["🦉","El Búho",B],["🦅","El Águila",C],
  ["🥃","Whisky",D],["🐕","Gonza",E],["💩","El Bosta",F],
  ["🇮🇪","Irlandés",G],["📺","La Tele",H]];
```

donde `H` es la mediana del perfil de 120 ms redondeada a centenas y `A` es tres
veces la del perfil perfecto, con los seis del medio repartidos parejo.

- [ ] **Step 6: Actualizar el spec con los números finales**

En `docs/superpowers/specs/2026-08-17-revoleo-jugabilidad-design.md`, en la sección
«Datos y ranking», reemplazar la frase sobre recalibrar «después de implementar»
por los valores concretos que quedaron, y en «Cámara y presupuesto de legibilidad»
poner los valores finales de `VX_MAX` y `ZOOM_VUELO`.

- [ ] **Step 7: Verificar a mano en el navegador**

Levantar un servidor estático y abrir `index.html`. Verificar el ciclo completo:
alta de jugador, un solo vuelo, cadena de rebotes, y que el ranking muestre la
escala nueva. Confirmar que no quedó ningún cartel hablando de viento, aletazos,
bunkers ni «tiro 1 de 3».

- [ ] **Step 8: Commit**

```bash
node build-app.js .
git add -A
git commit -m "Limpieza del diseño viejo, migración a v5 y leyendas recalibradas"
```

---

## Autorrevisión del plan

**Cobertura del spec.** Cada sección del spec tiene task: fantasía y fin del vuelo
(Tasks 4, 5, 7), lanzamiento sin barrido (Task 8 Step 3), rebote y ventanas
(Task 4), invariante del generador (Task 2), puntaje y acreditación (Tasks 4, 5),
trucos y variedad (Task 4 `factorVariedad`), cámara y legibilidad (Tasks 3, 6),
qué se elimina (Task 8), ritmo del reintento (Task 8 Step 3, `shots()` a 1),
datos y ranking (Task 8), pruebas (Tasks 2, 3, 4, 7).

**Hueco encontrado y tapado:** el spec pide que ASTRONAUTA se elimine y que AL RAS
pase a ser «pasar cerca sin rebotar». Lo primero está en la Task 8. Lo segundo
quedó sin task porque `factorVariedad` y la cadena de rebotes ya dan la
profundidad, y AL RAS como riesgo elegido pide una mecánica de detección de roce
que suma superficie sin resolver ninguno de los dos objetivos medibles. Se deja
fuera a propósito; si al jugarlo falta, sale en un plan aparte.

**Consistencia de tipos.** `est` es siempre `{x, y, vx, vy}`. `resolverRebote`
devuelve `{tipo, vy, vx}` y se consume así en `aplicarRebote`. `generar` devuelve
objetos con `cima`, que es lo que leen `alcanzables`, `rellenar`, `avisoMs` y el
render. `g.pasosVuelo` y `g.pasoObjetivo` se cuentan los dos en pasos de física.
