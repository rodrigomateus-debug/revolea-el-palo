# Revoleá el palo — rediseño de jugabilidad y puntaje

Fecha: 2026-08-17
Estado: diseño validado, pendiente de plan de implementación

## Problema

Dos quejas del usuario: el score no parece siempre mejorable, y el resultado
depende más del azar que de la destreza. Las dos se midieron y son ciertas.

### Medición del estado actual

200 tiros con **input idéntico** (45°, potencia 1.00, 3 aletazos), sólo variando
el azar del escenario y el viento:

```
min 510 · p25 1364 · mediana 1965 · p75 2088 · max 4962
desvío 613 pts (33% de la media)
el mejor tiro rindió 9.7x el peor con el mismo input
el escenario corta el combo en 13% de los tiros
```

Mediana según cómo juega el jugador (80 tiros por perfil):

| perfil                              | mediana |
| ----------------------------------- | ------- |
| pésimo   (30°, pot .45, 0 aletazos) | 1039    |
| mediocre (38°, pot .70, 1 aletazo)  | 985     |
| bueno    (45°, pot .90, 2 aletazos) | 1578    |
| perfecto (45°, pot 1.00, 3 aletazos)| 1948    |

- **señal/ruido = 1.48** (señal 909 pts contra desvío 613). El azar pesa tanto
  como la destreza.
- **La curva de destreza no es monótona**: "mediocre" puntúa por debajo de
  "pésimo". Jugar mejor puede dar menos puntos.
- **Techo**: con input perfecto, 300 intentos toparon en 4996 pts y dejaron de
  romper récord en el intento 205. Hoy "mejorar" es esperar una tirada con suerte.

### Causa

La fórmula es `(metros + trucos) × combo × green × perfecto`.

- `green` llega a **×5** y es la palanca más grande, pero embocar exige caer
  dentro de 10 px de un green a 200 m con viento aleatorio de ±14 que se informa
  y no se puede compensar. Es una moneda.
- `combo` depende de qué obstáculos random tocaron en el camino; árboles y
  caddies lo parten al medio.
- `metros` sí es destreza pero topea en ~350 m: la velocidad máxima es fija y
  sólo hay 3 aletazos.
- `perfecto`, la única palanca 100% de destreza, vale **×1.1**.

La destreza controla un ×1.1. La suerte controla un ×5 y el combo.

### Causa estructural adicional

La cancha visible es 134 px lógicos y la cámara deja 86 px por delante del palo.
A velocidad máxima el palo hace ~528 px/s: **0,16 s** entre que un obstáculo
entra en pantalla y se lo alcanza. El tiempo de reacción humano es ~0,25 s.
Hoy es imposible reaccionar, y eso explica la sensación de azar mejor que
cualquier `Math.random()`.

## Objetivos

1. El score no tiene techo: siempre se puede superar jugando mejor.
2. La destreza domina al azar (señal/ruido > 3).
3. Un vuelo termina sólo por error del jugador.
4. Un dedo, un gesto. Se juega con el pulgar.

## Diseño

### Fantasía

Un solo revoleo por partida. Se lanza el palo y la habilidad del jugador en el
aire lo mantiene volando, rebotando en los obstáculos. El score es la distancia
de ese vuelo. Referencia: Burrito Bison / Learn to Fly.

### Lanzamiento

Se elimina el barrido automático del ángulo. Hoy hay que cazar dos osciladores
independientes (potencia ciclando + ángulo barriendo) con una sola suelta, que
es una lotería de timing. El ángulo se fija arrastrando y la línea de tiro queda
quieta donde se la puso. Queda un único elemento de timing: la potencia.

Soltar determina el arco inicial por completo. Sin viento aleatorio.

### Vuelo y rebote

El palo describe un arco largo y baja. Al bajar hacia un obstáculo aparece un
anillo que se cierra como señal de toque:

| resultado         | ventana        | efecto                                                        |
| ----------------- | -------------- | ------------------------------------------------------------- |
| Rebote perfecto   | centro angosto | devuelve la altura completa, combo +1, empujón extra de `vx`   |
| Rebote bueno      | ventana ancha  | devuelve altura parcial; sigue volando más bajo                |
| Raspón            | tarde/temprano | pierde ~35% de velocidad, no gana altura, combo se parte al medio |
| Toca el suelo     | —              | termina el vuelo                                              |

Como un rebote perfecto devuelve la energía entera, un jugador impecable no baja
nunca. El techo es el pulso del jugador.

Todos los obstáculos existentes pasan de castigo a trampolín: árboles, caddies,
carritos, SDGAs y pelícanos. Se reusa el arte y el generador tal como están.

### Invariante del generador (crítica)

El generador **debe garantizar que siempre haya algo rebotable donde el arco va
a caer**. Si el arco deposita al palo en un hueco vacío, el jugador pierde por
algo que no controlaba y volvemos al problema original. El tipo y la separación
siguen siendo aleatorios; lo que se garantiza es que desde cualquier rebote se
alcanza al menos un objetivo siguiente. Random pero siempre superable.

Es una condición verificable, no una impresión: ver la sección de pruebas.

### Puntaje

El combo arranca en 1. Al llegar a cada obstáculo se acredita
`(metros desde el obstáculo anterior) × combo`, usando el combo **vigente antes**
de aplicar el resultado del toque; recién después se modifica el combo. Así el
tramo que acabás de volar se paga a la tasa que te habías ganado, y el premio o
castigo afecta al tramo siguiente.

Se acredita en los tres resultados, no sólo en el perfecto: un raspón también
paga los metros recorridos. Cuando el palo toca el suelo se acredita el último
tramo antes de cerrar el vuelo.

Efecto de cada resultado sobre el combo:

| resultado       | combo         |
| --------------- | ------------- |
| Rebote perfecto | +1            |
| Rebote bueno    | se mantiene   |
| Raspón          | se parte al medio (mínimo 1) |

**Lo acreditado nunca se pierde.** Cada vuelo es monótonamente productivo; no
existe el "se me arruinó todo".

Consecuencias buscadas:

- Feedback constante: cada rebote escupe un número (`+340 ×7`).
- Crecimiento cuadrático con la duración del vuelo: mejorar el pulso un 20% sube
  el score mucho más que 20%. Progresar se siente.

Sobre por qué el raspón parte al medio en vez de resetear a 1: ya se
pierde altura y velocidad, que es castigo real; resetear encima haría que un
resbalón borre minutos de juego. Es el número más discutible del diseño: si se
quiere más tensión, se cambia a reset a 1. Decisión tomada: partir al medio.

### Trucos

| truco       | hoy                        | nuevo                                        |
| ----------- | -------------------------- | -------------------------------------------- |
| HELICÓPTERO | giros en el aire           | igual, ya es destreza                        |
| AL RAS      | roce casual                | pasar cerca **sin** rebotar: riesgo elegido  |
| SDGA        | obstáculo random           | visible con anticipación, se elige golpearlo |
| ASTRONAUTA  | salta en **todos** los tiros | se elimina, no significa nada              |

Regla de variedad (de Tony Hawk): repetir el mismo tipo de rebote rinde cada vez
menos. Ahí está la profundidad más allá del timing — obliga a variar objetivos en
vez de encontrar un único truco óptimo y repetirlo.

### Cámara y presupuesto de legibilidad

Tres cambios, los tres necesarios:

1. Alejar la cámara durante el vuelo ~2,5× (de ~45 m visibles a ~110 m).
2. Bajar el techo de velocidad horizontal de 16 a ~10 px por paso.
3. Dibujar el arco predicho con el punto de impacto marcado, más el anillo de
   timing sobre el objetivo.

Con (1) y (2) el aviso pasa de 0,16 s a ~1 s. El (3) convierte "adivinar" en
"leer": se ve a qué se le va a pegar, y la única destreza que queda es el timing.

**Requisito medible:** entre que un objetivo se hace visible y se abre su ventana
de toque debe haber ≥ 0,8 s.

**Valores finales, medidos:** `ZOOM_VUELO = 2,5` y `VX_MAX = 10` quedaron donde
arrancaron — el requisito se cumple sin moverlos. La cadena de rebotes avisa como
mínimo **818 ms** (piso 800), con 0 de 4.000 objetivos por debajo, midiendo en el
peor encuadre: `F.VX_LANZ = 10,63`, la velocidad del lanzamiento, que es la única
del juego que supera `VX_MAX` y deja **178,6 px** de arco por delante del palo
(194,5 px con el palo lento). Antes se medía en el clamp y prometía 182,4 px.

**Hueco conocido, no cerrado:** en vuelos reales el peor aviso es **788 ms** en 76
de 9.379 objetivos plantados (0,8%), todos en el primer objetivo después del
lanzamiento. Medir en la velocidad real del lanzamiento en vez del clamp NO lo
mueve: el aviso está cuantizado en pasos de física de 30,3 ms y el palo cubre
~10 px por paso, así que 3,8 px de encuadre no alcanzan para correr un paso. La
causa es geométrica (el objetivo se planta a partir de `AVANCE_MIN = 40` px y ahí
el palo va a máxima velocidad), no la cámara.

### Qué se elimina

Diseño y código menos:

- Viento aleatorio.
- El ×5 del green como lotería. Los greens quedaron **cosméticos**: dan un cartel
  y una fanfarria al aterrizar y nada más. No se hicieron trampolines premium
  (habría sido otra mecánica sin objetivo medible que resolver).
- El ÷2 del bunker.
- La fase de putt completa (`startPutt`, `firePutt`, fases `putt`/`puttcharge`).
- La estructura de 3 tiros: un vuelo por partida.
- **El ángulo de lanzamiento como decisión.** Queda fijo en 45° (`F.ANG_LANZ`), de
  donde sale `F.VX_LANZ = 10,63`, la única velocidad de salida que el juego produce.
  Se fue el barrido automático y también el arrastre: a 15° la `vx` de salida daba
  14,52 y el presupuesto de legibilidad se caía a **727 ms con 1.852 de 4.000
  objetivos por debajo del piso** — un camino jugable en el que el juego era
  ilegible casi la mitad del tiempo. Con él se fueron `g.angle`, `g.manual`,
  `onMove`, las flechas ↑↓, y el arco punteado con marcas de grados que invitaba a
  apuntar (queda el medidor de potencia, que es lo único que el jugador elige).
- El truco ASTRONAUTA y el techo de `y<50` como evento puntuado.

### Ritmo del reintento

Hoy hay ~5 s de intro guionada (el putt fallado) antes de **cada** tiro. En un
juego de "una más y listo" el reintento tiene que ser instantáneo. La intro queda
una vez por sesión; los reintentos van directo a cargar el tiro.

### Datos y ranking

Los récords actuales (Moai 13480, etc.) y los `best` guardados quedan en una
escala incomparable con la fórmula nueva.

- La clave de `localStorage` pasa de `sdga-palo-v4` a `sdga-palo-v5`, para que no
  se mezclen puntajes de escalas distintas. Los jugadores (nombre, emoji) se
  migran; los `best` y el log de `scores` arrancan limpios.
- Las leyendas hardcodeadas (`RECORDS`) quedaron recalibradas contra la curva de
  destreza medida por el bot (medianas de puntos por error de timing: **200 ms =
  843, 120 ms = 22.851, 60 ms = 337.175, 0 ms = 507.012**, señal/ruido 8,89).
  Ocho escalones parejos entre la mediana del perfil de 120 ms redondeada a
  centenas (La Tele, 22.900) y tres veces la del perfil impecable (El Moai,
  1.521.000): 22.900 · 236.900 · 450.900 · 664.900 · 879.000 · 1.093.000 ·
  1.307.000 · 1.521.000.
- Las leyendas del resultado de `endShot` salen de la MISMA curva, así que cada
  una nombra la banda de precisión en la que cayó el vuelo: `QUÉ VERGÜENZA` por
  debajo de 800 (mediana del perfil de 200 ms), `ZAFA` hasta 22.900 (120 ms),
  `BUEN REVOLEO` hasta 337.000 (60 ms), `TREMENDO` hasta 507.000 (impecable) e
  `HISTÓRICO` por encima. Los umbrales viejos (1000/2500/5000/9000) eran de la
  escala de tres tiros con multiplicadores.

## Pruebas

Los objetivos de diseño se vuelven aserciones ejecutables. Nuevo
`test-destreza.js`, con un bot al que se le fija la precisión de timing:

1. **Monotonía**: más precisión ⇒ más score, sin excepciones. Habría cacheado que
   hoy "mediocre" puntúe menos que "pésimo".
2. **Señal/ruido > 3** con input fijo (hoy 1,48).
3. **Un bot perfecto no muere nunca** (valida "termina sólo si errás").
4. **Sin techo**: el score de un bot perfecto crece con el tiempo de vuelo sin
   converger (hoy converge en el intento 205 de 300).
5. **Solvencia del generador**: miles de arcos simulados, falla si alguna vez
   queda un hueco sin nada rebotable.
6. **Presupuesto de legibilidad**: ningún objetivo aparece con menos de 0,8 s de
   aviso.

Corren con `node`, sin dependencias, igual que `test-motor.js` y `test-db.js`,
que se mantienen.

## Fases sugeridas para el plan

1. Cámara, arco predicho y presupuesto de legibilidad. Es la base: sin esto
   ninguna mecánica de timing es jugable. Se puede validar sola.
2. Mecánica de rebote + invariante del generador + bot de pruebas.
3. Puntaje nuevo, trucos y regla de variedad.
4. Limpieza: putt, viento, bunker, 3 tiros, ASTRONAUTA; migración a v5;
   recalibración de leyendas.

## Riesgos

- **Calibrar la ventana de timing.** Exigente sin ser injusta. Mitigación: el
  bot de pruebas mide la relación entre precisión y score, así que la dificultad
  se ajusta con datos y no a ojo.
- **El zoom-out afea el pixel art.** El escenario está pensado a 134 px. Habrá
  que ver si a 2,5× se lee bien o si conviene menos zoom y más lentitud.
- **Un vuelo infinito de un jugador experto** puede volverse tedioso o hacer
  crecer el score a números absurdos. Se acepta: es la consecuencia buscada de
  "sin techo". Si molesta, se agrega desgaste, que es el enfoque 2 que se
  descartó.

## Fuera de alcance

- Multijugador o ranking compartido entre dispositivos (sigue siendo por
  dispositivo, ver el comentario `ponytail:` en la base).
- Niveles, desbloqueables, monedas o progresión meta entre partidas.
- Arte nuevo: se reusa todo el existente.
