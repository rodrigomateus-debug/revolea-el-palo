// Genera los PNG del ícono de app. Sin dependencias: rasteriza a mano y arma el
// PNG con zlib. Determinista y re-corrible, en vez de exportar desde un navegador
// y copiar base64 a mano.
//   node render-icono.js
//
// Por qué el ícono es así, que salió de medir y no de diseñar a ojo:
//   - Fondo DORADO, no verde. El sprite del palo es oscuro y fino (24x11 px):
//     sobre el verde de marca ocupaba 4% del ícono y quedaba un cuadrado negro
//     vacío en la pantalla de inicio. Invirtiendo la masa sube a ~13%.
//   - Sin degradados: metían cientos de colores y llevaban el PNG de 4 a 190 KB,
//     y a 60px no se distinguen.
//   - Nada importante fuera del 80% central: Android recorta los íconos maskable
//     a círculo o squircle.
const fs = require('fs'), zlib = require('zlib');

const ORO = [0xE8, 0xC3, 0x4A], VERDE = [0x14, 0x40, 0x2A];

// El palo, tal como está en miguelon/palo.svg, con la paleta invertida para que
// se lea sobre el dorado: cuerpo claro, contorno verde oscuro.
const RECTS = [
  [0,4,21,1,'o'],[0,5,1,1,'o'],[1,5,1,1,'s'],[2,5,1,1,'m'],[3,5,3,1,'s'],
  [6,5,11,1,'c'],[17,5,1,1,'r'],[18,5,2,1,'c'],[20,5,4,1,'o'],[0,6,1,1,'o'],
  [1,6,5,1,'s'],[6,6,11,1,'g'],[17,6,1,1,'r'],[18,6,5,1,'c'],[23,6,1,1,'o'],
  [0,7,18,1,'o'],[18,7,5,1,'g'],[23,7,1,1,'o'],[17,8,2,1,'o'],[19,8,3,1,'n'],
  [22,8,2,1,'o'],[18,9,5,1,'o'],
];
const PAL = {
  o: [0x0C,0x2B,0x1C], s: [0x14,0x40,0x2A], m: [0x1C,0x56,0x38],
  c: [0xF4,0xEE,0xDA], g: [0xD9,0xE8,0xDC], n: [0x5E,0x6E,0x5F],
  r: [0xBC,0x4B,0x3C],
};
const CW = 24, CH = 11;
const club = new Array(CW * CH).fill(null);
for (const [x, y, w, h, k] of RECTS)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) club[(y + j) * CW + x + i] = PAL[k];

function render(N) {
  const px = Buffer.alloc(N * N * 3);
  const set = (x, y, c) => { if (x < 0 || y < 0 || x >= N || y >= N) return;
    const o = (y * N + x) * 3; px[o] = c[0]; px[o+1] = c[1]; px[o+2] = c[2]; };
  for (let i = 0; i < N * N; i++) { px[i*3] = ORO[0]; px[i*3+1] = ORO[1]; px[i*3+2] = ORO[2]; }

  const u = N / 512;                                   // todo se diseñó a 512
  // Estela del revoleo: guiones sobre una diagonal. Le dan masa y dirección.
  // Son rectángulos rotados, la misma primitiva que el palo.
  const ang = -34 * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const largo = 30 * u, hueco = 26 * u, grosor = 30 * u;
  for (let t = -210 * u; t < 210 * u; t += largo + hueco) {
    for (let a = 0; a < largo; a++) for (let b = -grosor/2; b < grosor/2; b++) {
      const d = t + a;
      set(Math.round(256*u + d*ca - b*sa), Math.round(300*u + d*sa + b*ca), VERDE);
    }
  }
  // El palo: por cada pixel de salida, transformación inversa al espacio del
  // sprite (24x11). Así el rotado sale nítido sin librería de gráficos.
  const S = 15.5 * u, ra = -36 * Math.PI / 180;
  const cx = 258 * u, cy = 268 * u, cr = Math.cos(-ra), sr = Math.sin(-ra);
  const R = Math.ceil(CW * S);
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const lx = (x * cr - y * sr) / S + CW / 2, ly = (x * sr + y * cr) / S + CH / 2;
    if (lx < 0 || ly < 0 || lx >= CW || ly >= CH) continue;
    const c = club[(ly | 0) * CW + (lx | 0)];
    if (c) set(Math.round(cx + x), Math.round(cy + y), c);
  }
  return px;
}

// ---- PNG mínimo (colortype 2 = RGB sin alpha) --------------------------------
const TABLA = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; } return t; })();
const crc = b => { let c = -1;
  for (const v of b) c = TABLA[(c ^ v) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (tipo, data) => {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(data.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(cuerpo));
  return Buffer.concat([largo, cuerpo, c]);
};
function png(N, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const filas = Buffer.alloc(N * (N * 3 + 1));
  for (let y = 0; y < N; y++) {
    filas[y * (N * 3 + 1)] = 0;                        // filtro 0 = sin filtrar
    px.copy(filas, y * (N * 3 + 1) + 1, y * N * 3, (y + 1) * N * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const N of [180, 512]) {
  const px = render(N);
  const archivo = `icono-${N}.png`;
  fs.writeFileSync(archivo, png(N, px));
  // control: cuánto del ícono NO es fondo. Si baja de 8% no se ve en el celular.
  let sujeto = 0;
  for (let i = 0; i < N * N; i++) {
    const r = px[i*3], g = px[i*3+1], b = px[i*3+2];
    if (Math.abs(r-ORO[0]) > 20 || Math.abs(g-ORO[1]) > 20 || Math.abs(b-ORO[2]) > 20) sujeto++;
  }
  const pct = Math.round(sujeto / (N * N) * 100);
  console.log(`${archivo}  ${(fs.statSync(archivo).size/1024).toFixed(1)} KB  ` +
    `sujeto ${pct}%  ${pct >= 8 ? 'OK' : 'MUY VACÍO'}`);
}
