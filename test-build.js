// Chequea el ARTEFACTO QUE SE SIRVE, index.html, y no la fuente.
//
// Por qué existe: se shippeó a producción un index.html truncado —cortado en medio de
// un comentario, sin </script> ni </html>— con las cuatro suites en verde. El juego
// quedó mostrando la pantalla de título estática y no arrancaba, porque el motor nunca
// se ejecutaba. Las otras suites cargan el engine desde "Revolea el Palo.dc.html", así
// que ninguna miraba el generado. La revisión final de la rama había anticipado
// exactamente este hueco ("una regresión de build-app.js no está testeada") y se dejó
// abierto.
//
// build-app.js ahora se niega a escribir una salida incompleta, lo que tapa el caso al
// generar. Esto cubre el otro: que en el repo quede commiteado un index.html truncado o
// viejo de un build anterior, que el build de hoy ya no produciría.
const fs = require('fs');
let fallas = 0;
const ck = (nombre, ok, detalle) => {
  console.log((ok ? '  OK  ' : '  FALLA  ') + nombre + (detalle !== undefined ? ' :: ' + detalle : ''));
  if (!ok) fallas++;
};

const HTML = fs.readFileSync('index.html', 'utf8');
const FUENTE = fs.readFileSync('Revolea el Palo.dc.html', 'utf8');

// MUERDE: con el index.html truncado que se shippeó, esto daba
// "termina en ...escala no positiva. El" en vez de </html>.
ck('index.html cierra el documento', HTML.trimEnd().endsWith('</html>'),
  'termina en ' + JSON.stringify(HTML.trimEnd().slice(-40)));

for (const cierre of ['</script>', '</body>', '</html>'])
  ck('index.html tiene ' + cierre, HTML.includes(cierre));

// El motor entero tiene que haber llegado, no sólo el principio. Se compara la COLA
// porque una truncadura corta por el final y el principio siempre está: chequear que
// empiece bien pasaría con el archivo roto.
const m = FUENTE.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
ck('el .dc.html tiene el bloque del motor', !!m);
if (m) {
  const motor = m[1].trim();
  ck('la cola del motor llegó al generado', HTML.includes(motor.slice(-120)),
    'buscando ' + JSON.stringify(motor.slice(-50)));
  // Sin esto un index.html de un build viejo pasaría mientras el final coincidiera.
  ck('el generado trae el motor completo, no un pedazo',
    HTML.includes(motor.slice(0, 120)) && HTML.length > motor.length,
    'motor ' + motor.length + ' chars, html ' + HTML.length);
}

// La app no arranca sin esta última línea: es la que pinta el primer frame.
ck('el arranque de la app está presente', HTML.includes('HOST.paint();'));

// motor.js va como <script src> compartido y no inlineado: si el tag no está, el
// generado no tiene física y falla recién en tiempo de ejecución.
ck('index.html carga motor.js', /<script src="motor\.js"><\/script>/.test(HTML));

console.log(fallas ? '\nFALLAS: ' + fallas : '\nTODO OK — el artefacto servido está completo');
process.exit(fallas ? 1 : 0);
