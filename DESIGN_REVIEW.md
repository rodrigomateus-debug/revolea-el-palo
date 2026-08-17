# Design Review: Revoleá el palo — pantalla de título (app.html)

Reviewed against: sin DESIGN_BRIEF.md — el norte es el poster SDGA del proyecto
(pixel art, Anton + Archivo, paleta verde/crema/dorado del design system `_ds`).
Philosophy: arcade retro con humor — poster de feria + Game Boy.
Date: 2026-08-07

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| captura del usuario `IMG_1485.png` | iPhone real | título recortado (Ú sin acento, O cortada) — estado anterior |
| captura del usuario `IMG_1486.png` | iPhone real | "CARGANDO BRONCA…" tapado por la burbuja; burbuja sin cola |

> Limitación de esta sesión: la Browser pane no compone frames (documento oculto),
> así que no pude capturar screenshots propios. El análisis visual usa las capturas
> del usuario y mediciones de DOM en vivo a 375×812 (getBoundingClientRect,
> getComputedStyle de pseudo-elementos, detección de intersecciones).

## Summary

La dirección estética está fuerte y es reconocible al instante. Los tres hallazgos
graves eran de implementación, no de diseño: tinta de Anton recortada por cajas de
línea chicas, una burbuja clavada a un píxel absoluto que quedó desfasada del flujo,
y la pérdida de las colas de cómic al portar el shell (el `style-after` es una
extensión del runtime de Claude Design que el HTML plano no tiene).

## Must Fix — aplicado en esta pasada

1. **Burbuja tapaba "CARGANDO BRONCA…"** (`app.html`, pantalla de título): estaba en
   `top:301px` absoluto; al crecer el título, el flujo bajó y quedó abajo de la
   burbuja. Ver `IMG_1486.png`. _Fix aplicado: la burbuja ahora está anclada al
   contenedor de Miguelón (a quien le habla) con un wrapper `position:relative` —
   se mueve con él, no puede volver a desfasarse. Verificado: 0 intersecciones
   entre título/barra/cargando/burbuja/Miguelón/botón._
2. **Burbuja sin cola de cómic** (`app.html`): el original usa `style-after`
   (pseudo-elemento vía runtime), que el shell no reproducía. _Fix aplicado:
   `::after` real en CSS — triángulo asimétrico (6/16/13px) apuntando a Miguelón.
   También repuesta la cola del globo de grito del juego (`#rGrito::after`),
   que tenía la misma pérdida. Verificado por computed style de ambos._
3. **Tinta del título recortada** (`IMG_1485.png`): `line-height:.86` deja cajas
   más chicas que la tinta de Anton; `overflow:hidden` + `clip-path` recortaban
   acento y filos. _Fix aplicado (pasada anterior): padding 24px vertical, sin
   overflow. Verificado: scrollHeight == clientHeight con el barrido forzado
   a su estado final._

## Should Fix — aplicado en esta pasada

1. **Contraste del subtítulo** ("Camisa hawaiana…"): crema al 62% sobre verde 700
   daba 3,92:1 (< AA 4,5). _Fix: alpha a .78 (≈5,6:1). También en el poster._
2. **Sin `h1`**: el título del juego era un `div`. _Fix: ahora es `h1`._
3. **Sin foco visible**: los botones no tenían indicador de teclado.
   _Fix: `.btn:focus-visible` con outline crema de 3px._
4. **Canvas expuesto a lectores de pantalla**: _Fix: `aria-hidden="true"`._

## Could Improve — no aplicado, decisión de diseño pendiente

1. **"CARGANDO BRONCA…" parpadea para siempre**: la barra termina en 1,4 s pero el
   texto sigue titilando; como gag funciona, como affordance confunde (parece que
   algo carga). _Sugerencia: tras la barra, cambiarlo a "LISTO PARA LA BRONCA"._
2. **Kicker verde claro sobre verde 900** = 4,5:1 exacto en 10px espaciado; está
   al límite. _Sugerencia: si alguna vez se ve lavado en pantallas baratas, subir
   a `--green-100`._
3. **La burbuja tapa parcialmente el título en pantallas muy cortas** (stage
   escalado < 0,75): no se solapa en 375×812 ni 372×808, pero el margen entre
   "cargando" y la burbuja es de ~7px. _Sugerencia: si se agrega soporte apaisado,
   revisar._

## What Works Well

- La paleta del design system se respeta en todos los elementos nuevos (ningún
  hex fuera de `_ds/tokens/colors.css`); el botón dorado con sombra dura 0 4px 0
  es exactamente el lenguaje del poster.
- Jerarquía clara y de una sola lectura: SDGA → título → Miguelón → CTA.
  El CTA es el único elemento dorado grande de la pantalla.
- Contrastes del HUD del juego excelentes (11,9:1 y 8,2:1 sobre paneles oscuros).
- `prefers-reduced-motion` cubre todas las animaciones; targets táctiles 146×54.
- El pixel art se mantiene nítido a cualquier escala gracias al escenario fijo
  372×808 con `transform:scale` + `image-rendering:pixelated`.
