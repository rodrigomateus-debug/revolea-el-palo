// Mide el ENCUADRE del escenario en un navegador de verdad: que la escala llene la
// pantalla, que quede centrado y que ninguna pantalla desborde, con los insets del
// sistema puestos a mano. Existe porque el tamaño en la webapp de iOS se arregló dos
// veces a ojo desde una captura de pantalla y las dos veces volvió: estimar píxeles de
// un JPEG no es medir. Los insets se simulan pisando --sa-* (por eso el CSS los lee de
// una variable en vez de repetir env() en cada regla).
//
// Necesita Playwright y un Chromium. Si no están, se saltea sin fallar: es el único
// test del repo que depende de un navegador, y no puede romper el resto de la suite.
//   node test-encuadre.js [index.html]
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  try { chromium = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright').chromium; }
  catch (e2) { console.log('test-encuadre: salteado (falta playwright)'); process.exit(0); }
}
const path = require('path');
const fs = require('fs');
const url = 'file://' + path.resolve(process.argv[2] || 'index.html');

// alto/ancho de CSS px reales de teléfonos, con los insets que iOS reporta en vertical
const CASOS = [
  { n: 'iPhone SE (sin isla)',   w: 375, h: 667, t: 20, b: 0 },
  { n: 'iPhone 13 mini',         w: 375, h: 812, t: 50, b: 34 },
  { n: 'iPhone 14',              w: 390, h: 844, t: 59, b: 34 },
  { n: 'iPhone 15 Pro Max',      w: 430, h: 932, t: 59, b: 34 },
  { n: 'navegador de escritorio',w: 1280, h: 800, t: 0,  b: 0 },
];
const PANTALLAS = ['scr-title', 'scr-quien', 'scr-nuevo', 'scr-rank', 'scr-play'];

(async () => {
  // PLAYWRIGHT_BROWSERS_PATH puede traer un Chromium con nombre de versión: se busca,
  // y si no aparece se deja que Playwright resuelva el suyo.
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let exe = null;
  try {
    for (const d of fs.readdirSync(raiz).filter(x => x.startsWith('chromium-'))) {
      const p = path.join(raiz, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) { exe = p; break; }
    }
  } catch (e) { /* sin carpeta de navegadores: que resuelva Playwright */ }
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const fail = [];
  const ck = (n, ok, x) => { if (!ok) fail.push(n + (x !== undefined ? ' :: ' + x : '')); };

  for (const c of CASOS) {
    const pg = await b.newPage({ viewport: { width: c.w, height: c.h }, deviceScaleFactor: 3 });
    await pg.goto(url);
    await pg.addStyleTag({ content: `:root{--sa-top:${c.t}px;--sa-bottom:${c.b}px;--sa-left:0px;--sa-right:0px}` });
    await pg.evaluate(() => { dispatchEvent(new Event('resize')); });
    await pg.waitForTimeout(120);

    const m = await pg.evaluate((pantallas) => {
      const st = document.getElementById('stage').getBoundingClientRect();
      const s = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s'));
      const out = { s, stage: { w: st.width, h: st.height, top: st.top, left: st.left }, pant: {} };
      // ¿se desborda el contenido de cada pantalla de menú?
      for (const id of pantallas) {
        const el = document.getElementById(id);
        const prev = el.className;
        el.className = el.className.replace('hide', '');
        // el alto del contenido contra el alto de la caja: el flex con margin-top:auto
        // absorbe el sobrante, así que un scrollHeight mayor es contenido que se sale
        const r = { over: el.scrollHeight - el.clientHeight, box: el.clientHeight };
        // el borde de abajo del último hijo visible, contra el borde de la pantalla
        const hijos = [...el.children].filter(k => getComputedStyle(k).display !== 'none');
        const ult = hijos[hijos.length - 1];
        if (ult) {
          const b = ult.getBoundingClientRect(), p = el.getBoundingClientRect();
          r.ultimoAbajo = Math.round(p.bottom - b.bottom);
        }
        out.pant[id] = r;
        el.className = prev;
      }
      // ¿queda contenido tapado por la barra de estado o por la barra de inicio?
      // se mide en px de PANTALLA, que es donde están las franjas del sistema.
      const q = el => { const r = document.querySelector(el); return r ? r.getBoundingClientRect() : null; };
      out.hint = q('#hintBox');
      return out;
    }, PANTALLAS);

    const escalaLlenar = Math.min(c.w / 372, c.h / 808);
    const nombre = c.n;
    // 1) llena la pantalla: la escala es la máxima que cabe, sin restarle los insets
    ck(`${nombre}: la escala llena la pantalla`,
      Math.abs(m.s - escalaLlenar) < 0.0005, `--s=${m.s.toFixed(4)} esperado ${escalaLlenar.toFixed(4)}`);
    // 2) un eje toca los dos bordes (el que manda), y nada se sale del viewport
    const sobraX = c.w - m.stage.w, sobraY = c.h - m.stage.h;
    ck(`${nombre}: un eje queda sin banda`, Math.min(sobraX, sobraY) < 1.5,
      `sobra x=${sobraX.toFixed(1)} y=${sobraY.toFixed(1)}`);
    ck(`${nombre}: el escenario no se sale`, m.stage.top > -1 && m.stage.left > -1 &&
      m.stage.top + m.stage.h < c.h + 1 && m.stage.left + m.stage.w < c.w + 1,
      `top=${m.stage.top.toFixed(1)} left=${m.stage.left.toFixed(1)}`);
    // centrado de verdad: la banda de arriba y la de abajo miden lo mismo. Sin esto un
    // escenario corrido hacia abajo pasa como bueno mientras el alto entre en pantalla.
    ck(`${nombre}: el escenario queda centrado`,
      Math.abs(m.stage.top - (c.h - m.stage.h) / 2) < 1 &&
      Math.abs(m.stage.left - (c.w - m.stage.w) / 2) < 1,
      `arriba=${m.stage.top.toFixed(1)} abajo=${(c.h - m.stage.top - m.stage.h).toFixed(1)}`);
    // 3) ninguna pantalla de menú desborda su caja
    for (const id of PANTALLAS) {
      const r = m.pant[id];
      ck(`${nombre}: ${id} no desborda`, r.over <= 0, `sobrante ${r.over}px`);
    }
    // 4) el cartel de ayuda del juego queda arriba de la barra de inicio
    if (m.hint) {
      const libre = c.h - m.hint.bottom;
      ck(`${nombre}: el cartel de ayuda esquiva la barra de inicio`, libre >= c.b - 0.6,
        `${libre.toFixed(1)}px libres, inset ${c.b}px`);
    }
    console.log(`${nombre.padEnd(24)} s=${m.s.toFixed(4)} escenario ${m.stage.w.toFixed(0)}x${m.stage.h.toFixed(0)} ` +
      `en ${c.w}x${c.h}  bandas x=${(sobraX / 2).toFixed(0)} y=${(sobraY / 2).toFixed(0)}`);
    await pg.close();
  }
  await b.close();
  if (fail.length) { console.log('\nFALLAS:\n- ' + fail.join('\n- ')); process.exit(1); }
  console.log('\nencuadre OK');
})();
