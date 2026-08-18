// Genera app.html: la app real (pantalla completa, sin React ni Babel) a partir
// del motor que vive en "Revolea el Palo.dc.html". El motor NO se copia a mano —
// se extrae acá, así el .dc.html sigue siendo la única fuente de verdad.
// Uso: node build-app.js <proyecto>
const fs = require('fs'), p = require('path');
const ROOT = process.argv[2];
const DC = p.join(ROOT, 'Revolea el Palo.dc.html');
const src = fs.readFileSync(DC, 'utf8');

const engine = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(src);
if (!engine) throw new Error('no encontré el script del motor en ' + DC);
const ENGINE = engine[1].trim();

// las @keyframes del helmet se reusan tal cual
const kf = /<style>([\s\S]*?)<\/style>/.exec(src);
if (!kf) throw new Error('no encontré el <style> del helmet');
const KEYFRAMES = kf[1].split('\n').filter(l => l.trim().startsWith('@keyframes')).join('\n');
if (KEYFRAMES.split('\n').length < 15) throw new Error('salieron pocas @keyframes: ' + KEYFRAMES.split('\n').length);

const HTML = `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">
<title>Revoleá el palo</title>
<meta name="description" content="Miguelón perdió el hoyo. Ahora vuela el palo.">
<meta name="theme-color" content="#0C2B1C">
<meta name="color-scheme" content="dark">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Revoleá el palo">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="apple-touch-icon" sizes="180x180" href="./icono-180.png">
<link rel="preload" as="image" href="./miguelon/palo.svg">
<link rel="preload" as="image" href="./miguelon/p_01_reposo.svg">
<link rel="preload" as="image" href="./miguelon/p_09_carga.svg">
<script src="motor.js"></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&display=swap">
<style>
:root{--font-display:Anton,Impact,sans-serif;--font-body:Archivo,system-ui,sans-serif;--s:1}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0C2B1C;overscroll-behavior:none;
  -webkit-text-size-adjust:100%;text-size-adjust:100%}
body{font-family:var(--font-body);color:#F4EEDA;overflow:hidden;
  touch-action:none;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;
  user-select:none;-webkit-user-select:none}
/* El escenario mantiene el diseño original de 372x808 y se escala a la pantalla:
   así todas las coordenadas absolutas del HUD siguen valiendo, sin distorsión. */
#wrap{position:fixed;inset:0;display:grid;place-items:center}
#stage{position:relative;width:372px;height:808px;overflow:hidden;background:#1C5638;
  transform:scale(var(--s));transform-origin:center;contain:layout paint}
.screen{position:absolute;inset:0}
.hide{display:none!important}
.btn{-webkit-appearance:none;appearance:none;border:0;cursor:pointer;background:#E8C34A;
  color:#14402A;font-family:var(--font-display);text-transform:uppercase;letter-spacing:.06em;
  border-radius:12px;box-shadow:0 4px 0 rgba(12,43,28,.45);font-size:19px;padding:13px 30px}
.btn:active{transform:translateY(2px);box-shadow:0 2px 0 rgba(12,43,28,.45)}
.btn.ghost{background:transparent;color:#F4EEDA;border:2px solid rgba(244,238,218,.4);
  box-shadow:none;font-size:15px;padding:9px 20px}
.btn.ghost:active{transform:translateY(1px)}
.btn:focus-visible{outline:3px solid #F4EEDA;outline-offset:2px}
/* Colas de cómic. En el .dc.html las dibuja el runtime vía style-after; el shell
   las repone como ::after de verdad. Triángulo asimétrico = look de historieta. */
#bubble::after{content:'';position:absolute;right:22px;bottom:-11px;width:0;height:0;
  border-left:6px solid transparent;border-right:16px solid transparent;border-top:13px solid #F4EEDA}
#rGrito::after{content:'';position:absolute;left:14px;bottom:-13px;width:0;height:0;
  border-right:16px solid transparent;border-top:15px solid #F4EEDA}
${KEYFRAMES}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{
  animation-duration:.01ms!important;animation-iteration-count:1!important}}
</style>
</head>
<body>
<div id="wrap"><div id="stage">

  <!-- ── quién sos ──────────────────────────────────────────── -->
  <div class="screen hide" id="scr-quien" style="display:flex;flex-direction:column;align-items:center;padding:calc(70px + env(safe-area-inset-top)) 26px calc(24px + env(safe-area-inset-bottom));gap:14px;background:linear-gradient(180deg,#14402A 0%,#1C5638 60%,#0C2B1C 100%);overflow:auto">
    <div style="font:600 10px/1 var(--font-body);letter-spacing:.24em;color:#6FAE87;text-transform:uppercase">Elegí tu jugador</div>
    <h1 style="margin:0;font-family:var(--font-display);font-size:40px;font-weight:400;line-height:.9;color:#F4EEDA;text-transform:uppercase;text-align:center;padding:6px 0">¿Quién sos?</h1>
    <div id="playerList" style="display:flex;flex-direction:column;gap:7px;width:100%"></div>
    <button class="btn ghost" id="btnNuevo" style="margin-top:auto">Nuevo jugador</button>
  </div>

  <!-- ── jugador nuevo ──────────────────────────────────────── -->
  <div class="screen hide" id="scr-nuevo" style="display:flex;flex-direction:column;align-items:center;padding:calc(70px + env(safe-area-inset-top)) 26px calc(24px + env(safe-area-inset-bottom));gap:12px;background:linear-gradient(180deg,#14402A 0%,#1C5638 60%,#0C2B1C 100%);overflow:auto">
    <div style="font:600 10px/1 var(--font-body);letter-spacing:.24em;color:#6FAE87;text-transform:uppercase">Jugador nuevo</div>
    <h1 style="margin:0;font-family:var(--font-display);font-size:40px;font-weight:400;line-height:.9;color:#F4EEDA;text-transform:uppercase;text-align:center;padding:6px 0">¿Cómo te<br>llamás?</h1>
    <input id="inpNombre" maxlength="14" placeholder="Tu nombre" autocomplete="off" autocapitalize="words" aria-label="Tu nombre"
      style="width:100%;background:#F4EEDA;color:#14402A;border:0;border-radius:12px;padding:13px 14px;font-family:var(--font-display);font-size:22px;text-transform:uppercase;text-align:center;outline:none;touch-action:auto;user-select:text;-webkit-user-select:text">
    <div style="font:600 9px/1 var(--font-body);letter-spacing:.2em;color:#6FAE87;text-transform:uppercase;margin-top:4px">Elegí tu cara</div>
    <div id="emojiGrid" style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px"></div>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:9px;align-items:center">
      <button class="btn" id="btnCrear">Entrar</button>
      <button class="btn ghost hide" id="btnVolver">Volver</button>
    </div>
  </div>

  <!-- ── título ─────────────────────────────────────────────── -->
  <div class="screen" id="scr-title" style="display:flex;flex-direction:column;align-items:center;padding:calc(70px + env(safe-area-inset-top)) 26px 30px;background:linear-gradient(180deg,#14402A 0%,#1C5638 58%,#0C2B1C 100%)">
    <div style="display:flex;align-items:flex-end;gap:7px;height:52px">
      <img src="miguelon/letter-s.svg" style="height:52px;width:auto;transform-origin:50% 100%;animation:letterPop .5s cubic-bezier(.2,.9,.3,1.4) .05s both,letterAlive 3.2s ease-in-out .9s infinite" alt="S">
      <img src="miguelon/letter-d.svg" style="height:50px;width:auto;transform-origin:50% 100%;animation:letterPop .5s cubic-bezier(.2,.9,.3,1.4) .17s both,letterAlive 3.6s ease-in-out 1.25s infinite" alt="D">
      <img src="miguelon/letter-g.svg" style="height:51px;width:auto;transform-origin:50% 100%;animation:letterPop .5s cubic-bezier(.2,.9,.3,1.4) .29s both,letterAlive 3.9s ease-in-out .7s infinite" alt="G">
      <img src="miguelon/letter-a.svg" style="height:50px;width:auto;transform-origin:50% 100%;animation:letterPop .5s cubic-bezier(.2,.9,.3,1.4) .41s both,letterAlive 3.4s ease-in-out 1.5s infinite" alt="A">
    </div>
    <!-- Sin overflow:hidden y con padding vertical: line-height .86 deja cajas más
         chicas que la tinta de Anton, y tanto el overflow como el clip-path del
         barrido (que recorta al border-box exacto) se comían el acento de la Ú. -->
    <div style="margin-top:0">
      <h1 style="margin:0;font-family:var(--font-display);font-size:60px;font-weight:400;line-height:.86;color:#F4EEDA;text-transform:uppercase;text-align:center;padding:24px 12px;animation:loadWipe .9s steps(16) .3s both">El último<br>revoleo</h1>
    </div>
    <div style="position:relative;height:7px;width:152px;margin-top:8px;background:rgba(244,238,218,.18);border-radius:3px;overflow:hidden">
      <div style="position:absolute;inset:0;background:#E8C34A;transform-origin:left;animation:loadBar 1.1s ease-out .3s both"></div>
    </div>
    <div style="font:600 8px/1 var(--font-body);letter-spacing:.3em;color:#6FAE87;text-transform:uppercase;margin-top:7px;animation:loadBlink 1s ease-in-out infinite">Cargando bronca…</div>
    <!-- La burbuja se ancla al MISMO origen que Miguelón (left:50% del escenario),
         no al borde derecho: él está corrido +44px del centro, así que anclarla a
         la derecha dejaba la cola ~90px lejos de su cabeza. margin-left -68px pone
         la punta del triángulo sobre la cabeza; top -34px la deja justo encima. -->
    <div style="position:relative;margin-top:auto">
      <div id="bubble" style="position:absolute;left:50%;margin-left:-68px;top:-34px;width:148px;background:#F4EEDA;color:#0C2B1C;font-family:var(--font-display);font-size:14px;line-height:1.12;letter-spacing:.01em;padding:8px 11px 9px;border-radius:14px;box-shadow:0 3px 0 rgba(12,43,28,.35);text-align:center;z-index:1;animation:bubbleIn .5s cubic-bezier(.2,.9,.3,1.4) 1.4s both,bubbleBob 3.4s ease-in-out 1.9s infinite">Qué lindo día para jugar al golf…</div>
    <div style="position:relative;width:311px;height:171px;overflow:hidden">
      <div style="position:absolute;bottom:0;left:0;width:100%;height:3px;background:repeating-linear-gradient(90deg,rgba(244,238,218,.22) 0 7px,transparent 7px 16px);animation:pasto 1.1s linear infinite"></div>
      <div style="position:absolute;bottom:3px;left:50%;margin-left:-104px;width:196px;height:144px;animation:paseo 2.2s ease-in-out infinite alternate">
        <img src="miguelon/carro.svg" style="position:absolute;left:22px;bottom:0;width:102px;height:90px;image-rendering:pixelated;animation:carroBache .56s steps(2) infinite" alt="">
        <div style="position:absolute;right:0;bottom:0;width:96px;height:144px;background:url(miguelon/caminata.svg) 0 0/384px 144px no-repeat;image-rendering:pixelated;animation:camina .56s steps(4) infinite"></div>
      </div>
    </div>
    </div>
    <div style="font-family:var(--font-display);font-size:46px;line-height:.9;color:#E8C34A;text-transform:uppercase;text-align:center;margin-top:6px">Miguelón</div>
    <div style="font:400 12px/1.5 var(--font-body);color:rgba(244,238,218,.78);text-align:center;max-width:264px;margin-top:6px">Camisa hawaiana, paciencia cero. Un solo revoleo: tocá a tiempo en cada rebote y el palo no baja más.</div>
    <div id="recordLine" class="hide" style="background:#E8C34A;color:#14402A;font-family:var(--font-display);font-size:13px;letter-spacing:.08em;padding:3px 11px;text-transform:uppercase;margin-top:10px"></div>
    <button id="btnQuien" style="display:flex;align-items:center;gap:8px;background:rgba(12,43,28,.5);border:1px solid rgba(244,238,218,.25);border-radius:999px;padding:7px 14px;margin-top:8px;cursor:pointer;color:#F4EEDA;font-family:var(--font-display);font-size:13px;line-height:1;text-transform:uppercase">
      <span id="quienSoy"></span>
      <span style="font:600 9px/1 var(--font-body);letter-spacing:.14em;color:#6FAE87">Cambiar</span>
    </button>
    <div style="margin-top:auto;padding-bottom:env(safe-area-inset-bottom)"><button class="btn" id="btnStart">Comenzar</button></div>
  </div>

  <!-- ── juego ──────────────────────────────────────────────── -->
  <div class="screen hide" id="scr-play" style="touch-action:none">
    <canvas id="cv" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;touch-action:none"></canvas>
    <div style="position:absolute;top:170px;right:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none">
      <div id="rMetros" style="font-family:var(--font-display);font-size:44px;line-height:1.05;color:#F4EEDA;background:rgba(12,43,28,.82);border-radius:14px;padding:6px 14px 8px;opacity:0">0 M</div>
      <div id="rBest" style="font:600 9px/1 var(--font-body);letter-spacing:.16em;color:rgba(244,238,218,.85);text-transform:uppercase;background:rgba(12,43,28,.82);border-radius:9px;padding:5px 9px">Total 0 pts</div>
      <div id="rTricks" style="font:600 8px/1.4 var(--font-body);letter-spacing:.12em;color:#F4EEDA;text-transform:uppercase;background:rgba(12,43,28,.86);border-radius:9px;padding:5px 9px;max-width:150px;text-align:right;opacity:0"></div>
    </div>
    <div id="rGrito" style="position:absolute;left:22px;top:404px;max-width:196px;background:#F4EEDA;color:#0C2B1C;font-family:var(--font-display);font-size:19px;line-height:1.08;padding:10px 14px 11px;border-radius:16px 16px 16px 4px;box-shadow:0 4px 0 rgba(12,43,28,.35);opacity:0;pointer-events:none;transform-origin:8% 100%"></div>
    <div id="rFloat" style="position:absolute;top:300px;left:50%;transform:translateX(-50%);color:#E8C34A;font-family:var(--font-display);font-size:22px;opacity:0;pointer-events:none;text-shadow:0 2px 0 #0C2B1C"></div>
    <div id="hintBox" style="position:absolute;left:22px;right:22px;bottom:calc(30px + env(safe-area-inset-bottom));pointer-events:none;display:flex;justify-content:center">
      <div id="rHint" style="font-family:var(--font-display);font-size:22px;line-height:1.1;letter-spacing:.04em;color:#F4EEDA;text-transform:uppercase;text-align:center;text-shadow:0 2px 0 rgba(12,43,28,.85)">Mantené apretado · soltá para revolear</div>
    </div>
    <div id="resSheet" class="hide">
      <div style="position:absolute;top:112px;left:0;right:0;display:flex;justify-content:center;pointer-events:none;animation:sheetDown .26s cubic-bezier(.2,.9,.3,1.2) both">
        <div style="display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(12,43,28,.88);border-radius:18px;padding:14px 22px 16px;box-shadow:0 10px 26px rgba(6,26,17,.35)">
          <div id="resKicker" style="font:600 9px/1 var(--font-body);letter-spacing:.2em;color:rgba(244,238,218,.75);text-transform:uppercase"></div>
          <div id="resMeters" style="font-family:var(--font-display);font-size:64px;line-height:1.1;color:#F4EEDA;text-shadow:0 3px 0 #0C2B1C;margin:6px 0 4px"></div>
          <div id="resTag" style="font-family:var(--font-display);font-size:17px;line-height:1;color:#E8C34A;text-align:center;text-shadow:0 2px 0 rgba(12,43,28,.8)"></div>
          <div id="resNote" style="font:400 10px/1.35 var(--font-body);color:rgba(244,238,218,.72);text-align:center;max-width:230px;margin-top:4px"></div>
          <div id="resPts" style="margin-top:8px;background:#E8C34A;color:#14402A;font-family:var(--font-display);font-size:13px;letter-spacing:.05em;padding:4px 12px;text-transform:uppercase"></div>
        </div>
      </div>
      <div style="position:absolute;left:0;right:0;bottom:calc(24px + env(safe-area-inset-bottom));display:flex;justify-content:center;animation:sheetUp .28s cubic-bezier(.2,.9,.3,1.2) both">
        <button class="btn" id="btnNext">Ver ranking</button>
      </div>
    </div>
  </div>

  <!-- ── ranking ────────────────────────────────────────────── -->
  <div class="screen hide" id="scr-rank" style="display:flex;flex-direction:column;padding:calc(40px + env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom));gap:12px;background:linear-gradient(180deg,#14402A 0%,#1C5638 60%,#0C2B1C 100%);overflow:auto">
    <div style="text-align:center">
      <div style="font:600 10px/1 var(--font-body);letter-spacing:.24em;color:#6FAE87;text-transform:uppercase">Ranking histórico</div>
      <div style="font-family:var(--font-display);font-size:28px;line-height:1;color:#F4EEDA;text-transform:uppercase;margin-top:6px">El último revoleo</div>
      <div id="rankVerdict" style="display:inline-block;background:#E8C34A;color:#14402A;font-family:var(--font-display);font-size:13px;letter-spacing:.08em;padding:3px 10px;margin-top:8px;text-transform:uppercase"></div>
      <div id="totalPts" style="font:600 11px/1.4 var(--font-body);letter-spacing:.14em;color:#F4EEDA;text-transform:uppercase;margin-top:8px"></div>
    </div>
    <div id="rankList" style="display:flex;flex-direction:column;gap:5px"></div>
    <div style="margin-top:auto;display:flex;flex-direction:column;gap:9px;align-items:center;padding-top:14px">
      <button class="btn" id="btnAgain">Otra ronda</button>
      <button class="btn ghost" id="btnTitle">Volver al inicio</button>
    </div>
  </div>

</div></div>

<script>
// ── shim: reemplaza al runtime de Claude Design (React + DCLogic) por DOM plano.
// El motor de abajo queda tal cual está en el .dc.html.
const $ = id => document.getElementById(id);
const React = { createRef: () => ({ current: null }) };
let HOST = null;
class DCLogic {
  constructor(){ this.props = {}; this.state = {}; }
  setState(u, cb){
    Object.assign(this.state, typeof u === 'function' ? u(this.state) : u);
    if (HOST) HOST.paint();                         // refs vivos antes de didUpdate/cb
    if (this.componentDidUpdate) this.componentDidUpdate({});
    if (cb) cb();
  }
  forceUpdate(){ if (HOST) HOST.paint(); }
  componentDidMount(){} componentDidUpdate(){} componentWillUnmount(){}
  renderVals(){ return {}; }
}

/* === MOTOR EXTRAÍDO DE "Revolea el Palo.dc.html" — NO EDITAR ACÁ === */
${ENGINE}
/* === FIN DEL MOTOR ================================================ */

const game = new Component();
game.props = { censura: 'Sin filtro', sonido: true };

// los refs del motor apuntan directo a los nodos del shell
const REFS = { cv:'cv', rMetros:'rMetros', rBest:'rBest',
  rGrito:'rGrito', rFloat:'rFloat', rHint:'rHint', rTricks:'rTricks' };
for (const k in REFS) game[k].current = $(REFS[k]);

const scr = { title: $('scr-title'), play: $('scr-play'), rank: $('scr-rank'),
              quien: $('scr-quien'), nuevo: $('scr-nuevo') };
let lastRankKey = '', lastListKey = '', lastEmojiKey = '';

// fila táctil reutilizable (jugadores y ranking comparten el mismo look)
const cell = (css, txt) => { const d = document.createElement('div'); d.style.cssText = css;
  d.textContent = txt; return d; };

HOST = {
  paint(){
    const v = game.renderVals();
    scr.title.classList.toggle('hide', !v.isTitle);
    scr.play.classList.toggle('hide', !v.isPlay);
    scr.rank.classList.toggle('hide', !v.isRank);
    scr.quien.classList.toggle('hide', !v.isQuien);
    scr.nuevo.classList.toggle('hide', !v.isNuevo);

    $('recordLine').classList.toggle('hide', !v.hasRecord);
    if (v.hasRecord) $('recordLine').textContent = v.recordLine;
    $('quienSoy').textContent = v.quienSoy;

    if (v.isQuien){
      const key = v.jugadores.map(j => j.id + j.best).join('|');
      if (key !== lastListKey){
        lastListKey = key;
        $('playerList').replaceChildren(...v.jugadores.map(j => {
          const row = document.createElement('button');
          row.style.cssText = 'display:flex;align-items:center;gap:12px;background:#F4EEDA;' +
            'border:0;border-radius:14px;padding:11px 14px;cursor:pointer;text-align:left;width:100%;font:inherit';
          const txt = document.createElement('div');
          txt.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:2px';
          txt.append(
            cell('font-family:var(--font-display);font-size:18px;line-height:1;color:#14402A;text-transform:uppercase', j.name),
            cell('font:400 10px/1 var(--font-body);color:#5E6E5F', j.detalle));
          row.append(cell('font-size:26px;line-height:1', j.emoji), txt);
          row.addEventListener('click', j.pick);
          return row;
        }));
      }
    }
    if (v.isNuevo){
      const inp = $('inpNombre');
      if (inp.value !== v.nombre) inp.value = v.nombre;   // no pisar el cursor al tipear
      $('btnCrear').disabled = !v.puedeCrear;
      $('btnCrear').style.opacity = v.puedeCrear ? '1' : '.45';
      $('btnVolver').classList.toggle('hide', !v.jugadoresHay);
      const key = v.emojis.map(x => x.e + (x.sel ? '*' : '')).join('');
      if (key !== lastEmojiKey){
        lastEmojiKey = key;
        $('emojiGrid').replaceChildren(...v.emojis.map(x => {
          const b = document.createElement('button');
          b.textContent = x.e;
          b.setAttribute('aria-label', 'Elegir ' + x.e);
          b.setAttribute('aria-pressed', String(x.sel));
          b.style.cssText = 'width:46px;height:46px;display:flex;align-items:center;justify-content:center;' +
            'font-size:24px;border-radius:12px;cursor:pointer;' +
            (x.sel ? 'background:#E8C34A;border:2px solid #F4EEDA' : 'background:rgba(244,238,218,.1);border:2px solid transparent');
          b.addEventListener('click', x.pick);
          return b;
        }));
      }
    }

    $('resSheet').classList.toggle('hide', !v.showRes);
    $('hintBox').classList.toggle('hide', !v.notRes);
    if (v.showRes){
      $('resKicker').textContent = v.resKicker || '';
      $('resMeters').textContent = v.resMeters || '';
      $('resTag').textContent = v.resTag || '';
      $('resNote').textContent = v.resNote || '';
      $('resPts').textContent = v.resPts || '';
      $('btnNext').textContent = v.nextLabel || 'Ver ranking';
    }
    if (v.isRank){
      $('rankVerdict').textContent = v.rankVerdict;
      $('totalPts').textContent = v.totalPts;
      const key = JSON.stringify(v.ranking);
      if (key !== lastRankKey){                     // sólo si cambió de verdad
        lastRankKey = key;
        $('rankList').replaceChildren(...v.ranking.map(r => {
          const row = document.createElement('div');
          row.style.cssText = 'position:relative;display:flex;align-items:center;gap:10px;background:#F4EEDA;border-radius:13px;padding:9px 12px';
          const cell = (css, txt) => { const d = document.createElement('div');
            d.style.cssText = css; d.textContent = txt; return d; };
          row.append(
            cell('font-family:var(--font-display);font-size:17px;color:#5E6E5F;width:22px', r.pos),
            cell('font-size:19px;line-height:1', r.emoji),
            cell('font-family:var(--font-display);font-size:16px;color:#14402A;text-transform:uppercase;flex:1', r.name),
            cell('font-family:var(--font-display);font-size:19px;color:#1C5638', r.m));
          if (r.you){ const ring = document.createElement('div');
            ring.style.cssText = 'position:absolute;inset:-2px;border:3px solid #E8C34A;border-radius:15px;pointer-events:none';
            row.append(ring); }
          return row;
        }));
      }
    }
  }
};

$('btnNuevo').addEventListener('click', () => game.nuevoJugador());
$('btnVolver').addEventListener('click', () => game.cambiarJugador());
$('btnQuien').addEventListener('click', () => game.cambiarJugador());
$('btnCrear').addEventListener('click', () => game.crear());
$('inpNombre').addEventListener('input', e => game.setNombre(e));
$('inpNombre').addEventListener('keydown', e => {
  if (e.key === 'Enter' && game.renderVals().puedeCrear) { e.preventDefault(); game.crear(); }
});
$('btnStart').addEventListener('click', () => game.start());
$('btnNext').addEventListener('click', () => game.next());
$('btnAgain').addEventListener('click', () => game.again());
$('btnTitle').addEventListener('click', () => game.toTitle());
const zone = scr.play;
zone.addEventListener('pointerdown', e => { zone.setPointerCapture(e.pointerId); game.onDown(e); });
zone.addEventListener('pointerup',   e => game.onUp(e));
zone.addEventListener('pointercancel', e => game.onUp(e));

// el escenario de 372x808 se escala para llenar la pantalla sin deformarse
const stage = $('stage');
const fit = () => {
  const r = document.getElementById('wrap').getBoundingClientRect();
  const w = r.width || innerWidth, h = r.height || innerHeight;
  document.documentElement.style.setProperty('--s', Math.min(w / 372, h / 808));
};
// ResizeObserver y no sólo el evento resize: el evento no dispara en todos los
// contextos (documentos embebidos/ocultos) y el escenario quedaba mal escalado.
if (window.ResizeObserver) new ResizeObserver(fit).observe(document.getElementById('wrap'));
addEventListener('resize', fit, { passive: true });
addEventListener('orientationchange', () => setTimeout(fit, 50));
if (window.visualViewport) visualViewport.addEventListener('resize', fit, { passive: true });
fit();

HOST.paint();
game.componentDidMount();
HOST.paint();
</script>
</body>
</html>
`;

const out = p.join(ROOT, 'index.html');
fs.writeFileSync(out, HTML, 'utf8');
console.log('index.html escrito: ' + (HTML.length / 1024).toFixed(1) + ' KB');
console.log('motor extraído: ' + (ENGINE.length / 1024).toFixed(1) + ' KB, keyframes: ' + KEYFRAMES.split('\n').length);
