# Revoleá el palo — SDGA

Miguelón perdió el hoyo. Ahora vuela el palo. Juego arcade de un solo revoleo: el
palo se mantiene en el aire rebotando, se toca una vez por rebote y el timing
decide todo. Combo de rebotes y ranking histórico por jugador.

Jugar: https://rodrigomateus-debug.github.io/revolea-el-palo/

## Cómo está armado

- `Revolea el Palo.dc.html` — **fuente de verdad**. Documento de Claude Design:
  el poster + el motor del juego dentro de `<script type="text/x-dc">`.
- `index.html` — la app (pantalla completa, sin React ni Babel). **Generada**,
  no se edita a mano.
- `build-app.js` — extrae el motor del `.dc.html` y lo envuelve en el shell nativo.
- `miguelon/` — sprites y música.

Después de tocar el juego:

```bash
node build-app.js .
node test-motor.js "Revolea el Palo.dc.html"
node test-db.js "Revolea el Palo.dc.html"
node test-generador.js
node test-destreza.js
node test-encuadre.js            # encuadre en un navegador real; se saltea sin playwright
```

## Ramas

`dev` para trabajar, `main` es lo que publica GitHub Pages.
