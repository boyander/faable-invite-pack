/* Flow of the invite: cover → pack → the card → claim it with Faable Auth.
   The 3D pack and card live in pack3d.js; without WebGL the CSS pack in the page is used. */
import { audio, tone, ripSound, hz, duck, SFX, startMusic, muted, setMuted } from "./audio.js";
import { spawn, confettiBurst, usarConfeti3D } from "./confeti.js";
import { normalizar } from "./ediciones.js";
import { sobrePendiente, sobreAbierto } from "./mazo.js";
import { drawCarta, cargarFoto, rareza } from "./carta.js";
import { DPR3, drawCardBack, fuentesCargadas } from "./texturas.js";
import { initPack3D } from "./pack3d.js";
import * as cuenta from "./auth.js";

const $ = s => document.querySelector(s);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

function setMutedUI(m){
  setMuted(m);
  $("#mute").textContent = m ? "🔇" : "🔊";
  $("#mute").setAttribute("aria-label", m ? "Unmute" : "Mute");
}

// iOS ignora user-scalable=no y overflow:hidden: el rebote, el pellizco y el doble toque se cortan aquí.
// Si aun así la página queda ampliada (un zoom que se coló), se deja pellizcar y mover para deshacerlo
const ampliada = () => (window.visualViewport?.scale || 1) > 1.01;
document.addEventListener("touchmove", e => { if (!ampliada() && !e.target.closest(".scroll")) e.preventDefault(); }, {passive: false}); // salvo listas con scroll (catálogo)
document.addEventListener("gesturestart", e => { if (!ampliada()) e.preventDefault(); });
// doble toque: el segundo toque rápido se anula siempre (también si se movió un poco, como al girar la carta del visor);
// solo se deja pasar un deslizamiento por una lista, que no es un doble toque (abría cartas en mitad del scroll)
let lastTouchEnd = 0, touchStart = null;
document.addEventListener("touchstart", e => { const t = e.touches[0]; touchStart = t && {x: t.clientX, y: t.clientY}; }, {passive: true});
document.addEventListener("touchend", e => {
  const t = e.changedTouches[0], movido = !!(touchStart && t && Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 10);
  if (movido && e.target.closest(".scroll")) { lastTouchEnd = 0; return; }
  const now = Date.now();
  if (now - lastTouchEnd < 350) { e.preventDefault(); if (!movido && e.target.click) e.target.click(); }
  lastTouchEnd = now;
}, {passive: false});
// y si se ha ampliado, vuelve sola a escala 1: reasignar el viewport hace que iOS la recoloque.
// También al cargar, por si la página se recargó con un zoom de antes (iOS lo conserva al recargar)
{
  const vp = document.querySelector('meta[name="viewport"]'), base = vp.content;
  const resetZoom = () => { vp.content = base + ", minimum-scale=1"; requestAnimationFrame(() => { vp.content = base; }); window.scrollTo(0, 0); };
  let t;
  window.visualViewport?.addEventListener("resize", () => {
    clearTimeout(t);
    if (ampliada()) t = setTimeout(resetZoom, 500);
  });
  resetZoom();
  addEventListener("pageshow", e => { if (e.persisted || ampliada()) resetZoom(); }); // volver desde la caché del navegador
}

// hay una versión nueva de la app esperando (service worker): se recarga al pasar por la portada o el selector
let recargaPendiente = false;
function show(id){
  if (recargaPendiente && (id === "s-start" || id === "s-elegir")) return location.reload();
  document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  window.scrollTo({top:0});
}

/* estrellas */
(() => {
  const box = $("#stars");
  for (let i = 0; i < 50; i++) {
    const s = document.createElement("i");
    s.style.left = Math.random() * 100 + "%";
    s.style.top = Math.random() * 100 + "%";
    s.style.animationDelay = (Math.random() * 3) + "s";
    if (Math.random() < .2) { s.style.width = s.style.height = "3px"; }
    box.appendChild(s);
  }
})();
/* ===== SOBRE ===== */
const packScene = $("#packScene"), packFloat = $("#packFloat"), emerge = $("#emerge");
const pack = $("#pack"), packTop = $("#packTop"), rip = $("#rip"), tip = $("#tip"), hintText = $("#hintText");
const HINT = hintText.textContent, HINT_CUT = "Swipe along the line to tear it open";
let zoomed = false;
function zoomIn(){
  if (zoomed || opened) return;
  zoomed = true;
  P.lock = Math.round(P.ry / 360) * 360; // de frente
  const r = packScene.getBoundingClientRect();
  const z = Math.min(1.5, innerWidth * .9 / pack.offsetWidth);
  packScene.style.transform = `translateY(${innerHeight * .19 - r.top}px) scale(${z.toFixed(3)})`;
  $("#s-pack").classList.add("zoomed");
  hintText.textContent = HINT_CUT;
  SFX.whoosh(); tone(523, .1, .12, "triangle", .05); tone(784, .2, .16, "triangle", .05);
  vibrate(20);
}
// lo..hi: el tramo de la línea ya rasgado (fracción del ancho); el rasgado sigue al dedo en cualquier sentido
let lo = 0, hi = 0, tear = 0, drag = null, opened = false, sparkAt = 0;
const OPEN_AT = .8; // basta con recorrer el 80 % del ancho
const SLICES = Array.from({length: 24}, () => {
  const d = document.createElement("div");
  d.className = "pack-top foil zig-top";
  d.innerHTML = "<span>EDICION LIMITADA</span><i class=\"shade\"></i>";
  return $("#strip").appendChild(d);
});
// el progreso se calcula al momento; el dibujo se agrupa en un fotograma (en iOS el dedo da hasta 120 eventos/s)
let tearQueued = false;
function renderTear(){
  tear = Math.min(1, (hi - lo) / OPEN_AT);
  if (!tearQueued) { tearQueued = true; requestAnimationFrame(paintTear); }
}
function paintTear(){
  tearQueued = false;
  if (pack3d) return pack3d.setCut(lo, hi, tear);
  rip.style.left = (lo * 100) + "%";
  rip.style.width = ((hi - lo) * 100) + "%";
  const L = lo * 100, H = hi * 100;
  packTop.style.clipPath = `polygon(0 0,${L}% 0,${L}% 100%,${H}% 100%,${H}% 0,100% 0,100% 100%,0 100%)`;
  // cada franja enseña su trozo de lo ya cortado y se curva más cuanto más cerca está del extremo suelto
  const n = SLICES.length;
  SLICES.forEach((el, i) => {
    const A = Math.max(i / n, lo), B = Math.min((i + 1) / n, hi);
    if (B <= A) { el.style.clipPath = "inset(0 100% 0 0)"; el.style.transform = ""; el.lastChild.style.opacity = 0; return; }
    el.style.clipPath = `inset(0 ${Math.max(0, 99.7 - B * 100).toFixed(2)}% 0 ${Math.max(0, A * 100 - .3).toFixed(2)}%)`;
    const c = (A + B) / 2;
    const free = lo < .04 ? (hi - c) / Math.max(hi, .01)          // empezó por la izquierda: suelto a la izquierda
               : hi > .96 ? (c - lo) / Math.max(1 - lo, .01)       // empezó por la derecha
               : .5 * (1 - Math.abs(c - (lo + hi) / 2) / ((hi - lo) / 2)); // empezó en medio: se abomba
    const ang = Math.max(0, free) ** 1.4 * 58 * Math.min(1, tear * 2 + .3);
    el.style.transform = `translateY(${(-free * 6).toFixed(1)}px) translateZ(${(free * 10).toFixed(1)}px) rotateX(${(-ang).toFixed(1)}deg)`;
    // la parte que se dobla coge luz: es lo que hace que se lea como curva y no como escalón
    el.lastChild.style.opacity = (ang / 58 * .45).toFixed(2);
  });
}
function resetPack(){
  lo = hi = 0; opened = false; drag = null;
  openTimers.forEach(clearTimeout); openTimers = [];
  pack.classList.remove("opened", "dragging", "touched");
  packFloat.classList.remove("still", "nudge");
  packScene.classList.remove("opening", "glow", "dropping");
  emerge.style.transition = "none"; emerge.style.transform = "";
  P.ry = P.rx = P.vr = P.dy = 0; P.lock = null; dropAt = 0; flyAt = 0;
  hintText.textContent = HINT;
  zoomed = false;
  $("#s-pack").classList.remove("zoomed");
  packScene.style.transition = "none"; packScene.style.transform = ""; void packScene.offsetWidth; packScene.style.transition = "";
  if (pack3dReady && !pack3d) { pack3d = pack3dReady; $("#s-pack").classList.add("gl"); document.body.classList.add("gl3d"); } // se activa al entrar, nunca a medias
  elegirCarta();
  if (pack3d) pack3d.reset();
  renderTear();
}
const fracAt = e => { const r = pack.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
packScene.addEventListener("pointerdown", e => {
  if (opened) return;
  const f = fracAt(e), r = pack.getBoundingClientRect();
  packFloat.classList.add("still");
  packFloat.classList.remove("nudge");
  packScene.setPointerCapture(e.pointerId);
  // antes del zoom: arrastrar lo gira y un toque lo abre; con zoom, deslizar en cualquier punto corta la tira
  if (!zoomed) {
    P.lock = null;
    drag = {spin: true, x: e.clientX, y: e.clientY, moved: 0, ry0: P.ry, lastX: e.clientX};
    pack.classList.add("dragging");
    return;
  }
  drag = {x: e.clientX, y: e.clientY, moved: 0};
  if (hi - lo < .02) lo = hi = f; // el primer toque marca dónde empieza el rasgado
  pack.classList.add("dragging", "touched");
  tip.style.left = (f * 100) + "%";
});
packScene.addEventListener("pointermove", e => {
  if (!drag || opened) return;
  drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y));
  if (drag.spin) {
    P.ry = drag.ry0 + (e.clientX - drag.x) * .7;
    P.vr = (e.clientX - drag.lastX) * .7; drag.lastX = e.clientX;
    return;
  }
  const f = fracAt(e), before = tear;
  lo = Math.min(lo, f); hi = Math.max(hi, f);
  renderTear();
  tip.style.left = (f * 100) + "%";
  if (Math.floor(tear * 8) > Math.floor(before * 8)) vibrate(10);
  const now = performance.now();
  if (tear > before && now - sparkAt > 60) { // chispas y sonido de papel que salen de la punta
    sparkAt = now;
    ripSound(Math.min(1, (tear - before) * 12 + .3));
    const r = tip.getBoundingClientRect();
    spawn(r.left + r.width / 2, r.top + r.height / 2, 3, Math.PI * .8);
  }
  if (tear >= 1) openPack();
});
const endDrag = () => {
  if (!drag || opened) return;
  const spin = drag.spin;
  if (spin) {
    const tap = drag.moved < 10;
    drag = null; pack.classList.remove("dragging"); packFloat.classList.remove("still");
    if (tap) zoomIn();
    return;
  }
  if (drag.moved < 10) { const span = hi - lo; lo = 0; hi = Math.min(1, span + .3); } // también se abre a toques
  pack.classList.add("touched");
  drag = null;
  pack.classList.remove("dragging");
  renderTear();
  if (tear >= .6) return openPack();
  if (tear > 0) { // a medias: un meneo y un empujón en el texto
    packFloat.classList.remove("nudge"); void packFloat.offsetWidth; packFloat.classList.add("nudge");
    if (pack3d) pack3d.nudge();
    SFX.thud();
    hintText.textContent = "Almost! Keep tearing to the end";
  }
};
packFloat.addEventListener("animationend", e => { if (e.animationName === "nudge") packFloat.classList.remove("nudge"); });
packScene.addEventListener("pointerup", endDrag);
packScene.addEventListener("pointercancel", endDrag);
pack.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPack(); } });

/* sobre en 3D: balanceo en reposo, giro con inercia que vuelve de frente, caída al abrirse */
const P = {rx: 0, ry: 0, vr: 0, dy: 0, lock: null};
let pack3d = null, pack3dReady = null;
const SPECS = document.querySelectorAll(".face .spec i");
let dropAt = 0, flyAt = 0, openTimers = [];
(function packLoop(t){
  if ($("#s-pack").classList.contains("active")) {
    const s = t / 1000;
    if (!(drag && drag.spin)) {
      const rest = opened || drag || zoomed ? 0 : Math.sin(s * .8) * 16;
      // dos posiciones estables, de frente o de espaldas; para abrirlo se pide el frente (P.lock)
      if (opened && P.lock == null) P.lock = Math.round(P.ry / 360) * 360;
      const target = (P.lock ?? Math.round(P.ry / 180) * 180) + rest;
      P.vr = (P.vr + (target - P.ry) * .018) * .92;
      P.ry += P.vr;
    }
    const rxTarget = opened ? 7 : drag && !drag.spin ? -8 : Math.sin(s * .6) * 5;
    P.rx += (rxTarget - P.rx) * .08;
    if (dropAt) { const k = Math.min(1, (t - dropAt) / 650); P.dy = k * k * innerHeight * 1.1; }
    if (pack3d) { requestAnimationFrame(packLoop); return; } // en 3D, three.js usa P y dibuja él
    if (flyAt && t > flyAt) { // el trozo que vuela ondula como plástico
      const k = (t - flyAt) / 90;
      SLICES.forEach((el, i) => {
        const a = Math.sin(k + i * .38) * 26;
        el.style.transform = `rotateX(${a.toFixed(1)}deg)`;
        el.lastChild.style.opacity = Math.max(0, a / 26 * .4).toFixed(2);
      });
      if (t - flyAt > 1500) flyAt = 0;
    }
    pack.style.transform = `translateY(${P.dy.toFixed(1)}px) rotateX(${P.rx.toFixed(2)}deg) rotateY(${P.ry.toFixed(2)}deg)`;
    const sx = (120 - Math.sin(P.ry * Math.PI / 180) * 140 + P.rx * 3).toFixed(1);
    SPECS.forEach(el => el.style.transform = `translateX(${sx}%)`);
  }
  requestAnimationFrame(packLoop);
})(0);

function openPack(){
  if (opened) return;
  opened = true; drag = null;
  cartaAbierta();
  lo = 0; hi = 1; renderTear();
  pack.classList.remove("dragging");
  pack.classList.add("opened");
  packFloat.classList.add("still");
  vibrate([40, 60, 120]);
  ripSound(1, .25);
  tone(1568, 0, .25, "sine", .06, 3136);
  flyAt = performance.now() + 250;
  const at = (ms, fn) => openTimers.push(setTimeout(fn, ms));
  if (pack3d) {
    pack3d.open(partyCardRect());
    at(300, () => SFX.whoosh());
    at(450, () => SFX.shimmer());
    at(780, () => tone(330, 0, .1, "sine", .08));            // amago de la carta
    at(880, () => { SFX.whoosh(); tone(392, 0, .5, "triangle", .05, 784); }); // sube
    at(1600, () => tone(196, 0, .45, "sine", .14, 70));      // el sobre se retira
    at(1950, () => SFX.sparkle());
    at(2620, () => celebrate("3d"));
    return;
  }
  at(300, () => SFX.whoosh());
  at(450, () => { packScene.classList.add("opening", "glow"); SFX.shimmer(); });
  at(800, () => { // la carta asoma por la abertura
    const h = pack.offsetHeight;
    emerge.style.transition = "transform .9s cubic-bezier(.2,.85,.25,1)";
    emerge.style.transform = `translateY(${-h * .5}px)`;
    SFX.whoosh();
  });
  at(1750, () => { // el sobre cae y la carta se queda sola, en el centro
    dropAt = performance.now();
    packScene.classList.add("dropping");
    packScene.classList.remove("glow");
    const r = emerge.getBoundingClientRect(), h = pack.offsetHeight;
    const dy = innerHeight * .5 - (r.top + r.height / 2);
    emerge.style.transition = "transform .8s cubic-bezier(.3,.9,.3,1)";
    emerge.style.transform = `translateY(${-h * .5 + dy}px) scale(1.15)`;
    tone(196, 0, .3, "sine", .15, 80);
  });
  at(2450, () => { SFX.sparkle(); const f = $("#flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); });
  at(2650, () => celebrate(true));
}

/* ===== CELEBRACIÓN ===== */
function celebrate(fromPack){
  const word = cuenta.estado.reclamada ? "Your card!" : "Your invite!";
  $("#felicidades").innerHTML = [...word].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("");
  partyTimers.forEach(clearTimeout); partyTimers = [];
  flipped = false;
  $("#flipper").classList.remove("flipped", "done");
  $("#cardStage").classList.remove("in", "instant");
  $("#tapHint").classList.remove("on");
  $("#after").classList.remove("in"); flechas(false);
  iCarta = 0; carta = sobre[0] || carta;
  textosFiesta(); pintarMano();
  show("s-party");
  fitCard();
  confettiBurst();
  SFX.fanfare();
  // desde el sobre 3D la carta ya está en su sitio; desde el CSS, entra subiendo
  const cardAt = fromPack === "3d" ? 0 : fromPack ? 250 : 1700;
  if (fromPack === "3d") { $("#cardStage").classList.add("in", "instant"); pack3d.party(); } // la misma carta 3D sigue aquí
  else partyTimers.push(setTimeout(() => { $("#cardStage").classList.add("in"); SFX.whoosh(); }, cardAt));
  anticipar(cardAt + 450);
  partyTimers.push(setTimeout(() => $("#tapHint").classList.add("on"), cardAt + (sobre.length > 1 ? 2400 : 1000))); // tras enseñar el montón
  partyTimers.push(setTimeout(flipCard, 8000)); // si no la toca, se gira sola
}
// boca abajo, la carta ya brilla con su rareza (en 3D el aura; sin 3D, el resplandor del reverso) y suena un aviso
function anticipar(ms){
  const rz = rareza(carta?.d);
  $("#flipper").dataset.rareza = rz;
  if (rz !== "comun") partyTimers.push(setTimeout(() => { SFX.presagio(rz === "especial"); vibrate(rz === "especial" ? [30, 50, 30, 50, 30] : [30, 60, 30]); }, ms));
}
let flipped = false, partyTimers = [];
function partyCardRect(){
  const party = $("#s-party"), fel = $("#felicidades");
  if (!fel.textContent) fel.textContent = "Your invite!";
  $("#cardStage").classList.remove("in", "instant");
  $("#mano").hidden = sobre.length < 2; // la fila de cartas del sobre también ocupa sitio
  party.classList.add("measure");
  fitCard(true);
  const r = $("#cardStage").getBoundingClientRect();
  party.classList.remove("measure");
  return {x: r.left, y: r.top - 40, w: r.width, h: r.height}; // -40: la carta parte desplazada 40px (translateY)
}
// mide lo que ocupa todo lo demás en la pantalla y da a la carta el alto que sobra;
// si con el botón debajo la carta queda pequeña, el botón pasa a flotar sobre ella
function fitCard(force){
  const party = $("#s-party");
  if (!force && !party.classList.contains("active")) return;
  party.classList.remove("tight");
  if (cardScale() < .9) { party.classList.add("tight"); cardScale(); }
}
function cardScale(){
  const party = $("#s-party"), stage = $("#cardStage");
  const cs = getComputedStyle(party), gap = parseFloat(cs.rowGap) || 0;
  let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom), n = 0;
  for (const el of party.children) {
    if (el === stage || getComputedStyle(el).position === "absolute" || el.offsetParent === null) continue;
    const m = getComputedStyle(el);
    used += el.offsetHeight + parseFloat(m.marginTop) + parseFloat(m.marginBottom); n++;
  }
  used += gap * n + parseFloat(getComputedStyle(stage).marginTop) + 12;
  // con el botón flotando, la carta acaba justo encima de él para que se vea su borde inferior
  if (party.classList.contains("tight")) used += $("#replay").offsetHeight + 12 - parseFloat(cs.paddingBottom) + 6;
  const k = Math.min(1, (Math.min(innerWidth, 520) - 40) / 340, (innerHeight - used) / 475);
  stage.style.setProperty("--k", Math.max(.45, k).toFixed(3));
  return k;
}
addEventListener("resize", fitCard);
function flipCard(){
  if (flipped || !$("#cardStage").classList.contains("in")) return;
  flipped = true;
  partyTimers.forEach(clearTimeout);
  $("#tapHint").classList.remove("on");
  $("#flipper").classList.add("flipped");
  const rz = rareza(carta?.d), especial = rz === "especial";
  // la especial, en 3D, da vuelta y media con el fondo iridiscente (como en el juego); las demás, el volteo de siempre
  const T = pack3d ? pack3d.flip(especial) : {canto: 380, fin: 1150};
  // no se puede pasar a la siguiente hasta que la revelación acabe y se haya visto un momento (más si es rara o especial)
  pasarDesde = performance.now() + T.fin + (rz === "comun" ? 300 : 900);
  SFX.whoosh(); vibrate([20, 30, 60]);
  if (especial && pack3d) {
    document.body.classList.add("revelacion");
    partyTimers.push(setTimeout(() => document.body.classList.remove("revelacion"), T.fin + 1600));
    [380, 720].forEach(ms => setTimeout(() => SFX.whoosh(), ms));
    tone(hz(60), 0, 1.1, "sine", .08, hz(84)); // la tensión sube mientras gira
  }
  setTimeout(() => { // canto de la carta: destello y estallido justo al girar
    const f = $("#flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
    const r = $("#flipper").getBoundingClientRect();
    spawn(r.left + r.width / 2, r.top + r.height / 2, especial ? 130 : rz === "rara" ? 95 : 70, Math.PI * 2, -Math.PI / 2, especial ? 9 : 7);
    if (especial) { SFX.legendario(); vibrate([60, 40, 60, 40, 200]); cartel("especial"); }
    else if (rz === "rara") { SFX.rara(); vibrate([40, 40, 90]); cartel("rara"); }
    else { SFX.sparkle(); [72, 76, 79, 84].forEach((m, i) => tone(hz(m), i * .07, .5, "triangle", .07)); }
  }, T.canto);
  setTimeout(() => { $("#flipper").classList.add("done"); pintarMano(); }, T.fin);
  setTimeout(() => { $("#after").classList.add("in"); flechas(true); }, quedan() ? pasarDesde - performance.now() + 20 : T.fin); // el botón, cuando ya vale
}
// carta rara o especial: cartel plateado o arcoíris encima de la carta (y su fanfarria, en flipCard)
const CARTELES = {rara: ["✦ RARE CARD ✦", "A silver one!"], especial: ["✦ SPECIAL CARD ✦", "The holo one. Lucky you."]};
function cartel(rz){
  const el = $("#legend");
  [el.firstElementChild.textContent, el.lastElementChild.textContent] = CARTELES[rz];
  el.classList.toggle("rara", rz === "rara");
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  const r = $("#flipper").getBoundingClientRect();
  partyTimers.push(setTimeout(() => { spawn(r.left + r.width * .2, r.top + r.height * .3, 30, 1.2, -Math.PI * .7, 8); spawn(r.right - r.width * .2, r.top + r.height * .3, 30, 1.2, -Math.PI * .3, 8); }, 650));
}
// voltear: solo con un toque; arrastrar inclina el montón para verlo y al soltar no la voltea
let arrastrado = false;
$("#flipper").addEventListener("click", () => { if (!arrastrado) flipCard(); });
// abrir otro sobre: la carta sale disparada hacia arriba girando y después llega el sobre nuevo
let leaving = false;
$("#replay").onclick = () => {
  // solo cuando se ve: oculto seguía respondiendo, y un segundo toque en «Siguiente carta» abría otro sobre sin revelar la última
  if (!$("#after").classList.contains("in")) return;
  if (quedan()) return siguiente(-1, 0);
  abrirOtro();
};
// la última carta sale volando y llega el sobre nuevo (con el botón o deslizando la carta)
function abrirOtro(){
  if (leaving) return;
  leaving = true; arrastre = {x: 0, y: 0}; flechas(false);
  partyTimers.forEach(clearTimeout);
  SFX.tap(); vibrate(15);
  $("#legend").classList.remove("on");
  document.body.classList.remove("revelacion");
  const party = $("#s-party"), ms = pack3d ? pack3d.exit() : 760;
  party.classList.add("leaving");
  setTimeout(() => { // despegue: soplido, arpegio que sube y chispas desde la carta
    SFX.whoosh(); [72, 76, 79, 84, 88].forEach((m, i) => tone(hz(m), i * .05, .14, "triangle", .05));
    const r = $("#cardStage").getBoundingClientRect();
    spawn(r.left + r.width / 2, r.top + r.height * .6, 26, Math.PI * .9);
  }, ms * .2);
  setTimeout(() => { resetPack(); pack3d?.entrar("caida"); show("s-pack"); party.classList.remove("leaving"); leaving = false; }, ms + 60);
}
/* ===== SOBRES DE VARIAS CARTAS: la carta revelada se aparta deslizando y llega la siguiente del taco ===== */
const quedan = () => Math.max(0, sobre.length - 1 - iCarta);
let pasarDesde = 0; // cuándo se puede pasar a la siguiente (lo fija flipCard)
const puedePasar = () => flipped && quedan() > 0 && !leaving && performance.now() >= pasarDesde;
// en la última, deslizarla abre otro sobre (cuando ya se ve el botón de abrir otro)
const puedeSalir = () => flipped && !quedan() && !leaving && $("#after").classList.contains("in");
let arrastre = {x: 0, y: 0}; // px que el dedo desplaza la carta (el módulo 3D la sigue)
// pasar a la siguiente: la de ahora sale hacia (dx, dy) (de -1 a 1; también arriba y abajo)
function siguiente(dx, dy = 0){
  if (!puedePasar()) return;
  leaving = true; arrastre = {x: 0, y: 0}; flechas(false);
  partyTimers.forEach(clearTimeout); partyTimers = [];
  document.body.classList.remove("revelacion");
  SFX.whoosh(); vibrate(15);
  $("#legend").classList.remove("on");
  $("#after").classList.remove("in");
  const fit = $("#cardStage .card-fit"), ms = pack3d ? pack3d.siguiente(dx, dy) : 300;
  if (!pack3d) { fit.style.setProperty("--dir", dx); fit.style.setProperty("--dy", dy); fit.classList.add("sale"); }
  setTimeout(() => {
    iCarta++; carta = sobre[iCarta];
    flipped = false;
    $("#flipper").classList.remove("flipped", "done");
    fit.classList.remove("sale");
    pintarCartaHTML(); textosFiesta(); pintarMano();
    anticipar(pack3d ? 250 : 0);
    tone(hz(79), 0, .1, "triangle", .05);
    leaving = false;
    partyTimers.push(setTimeout(() => $("#tapHint").classList.add("on"), quedan() ? 2000 : 700));
    partyTimers.push(setTimeout(flipCard, 8000));
  }, ms);
}
// arrastrar la carta revelada en cualquier dirección (o un golpe rápido de dedo) pasa a la siguiente; un toque corto, confeti
{
  let ini = null, prev = null; // prev: posición de hace un momento, para la velocidad del gesto
  stageEl().addEventListener("pointerdown", e => { ini = prev = {x: e.clientX, y: e.clientY, t: e.timeStamp}; arrastrado = false; });
  stageEl().addEventListener("pointermove", e => {
    if (!ini) return;
    if (e.timeStamp - prev.t > 60) prev = {...prev, x2: prev.x, y2: prev.y, t2: prev.t, x: e.clientX, y: e.clientY, t: e.timeStamp};
    if (!puedePasar() && !puedeSalir()) return;
    // en línea recta: hacia arriba, o a los lados (en la última carta solo hacia arriba)
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y, dir = direccion(dx, dy);
    arrastre = !dir ? {x: 0, y: 0} : dir[0] ? {x: dx, y: 0} : {x: 0, y: Math.min(0, dy)};
    if (Math.hypot(dx, dy) > 10) flechas(false);
    // en cuanto el gesto es claro, la carta sale ya (no se queda pegada al dedo hasta soltarlo)
    if (dir && (dir[0] ? Math.abs(dx) : -dy) > 30) {
      ini = null; arrastrado = true;
      if (puedePasar()) siguiente(dir[0], dir[1]); else abrirOtro();
    }
  });
  const fin = e => {
    if (!ini) return;
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y, movido = Math.hypot(dx, dy) > 10;
    const p = prev.t2 != null ? {x: prev.x2, y: prev.y2, t: prev.t2} : ini, rapidez = Math.hypot(e.clientX - p.x, e.clientY - p.y) / Math.max(16, e.timeStamp - p.t);
    ini = null; arrastrado = movido;
    const dir = direccion(dx, dy), d = dir ? (dir[0] ? Math.abs(dx) : -dy) : 0;
    if (dir && (d > 36 || (d > 14 && rapidez > .45))) {
      if (puedePasar()) return siguiente(dir[0], dir[1]);
      if (puedeSalir()) return abrirOtro();
    }
    arrastre = {x: 0, y: 0};
    if (movido) flechas(true);
    if (!movido && flipped && e.type === "pointerup") { confettiBurst(e.clientX, e.clientY, 40); SFX.sparkle(); }
  };
  stageEl().addEventListener("pointerup", fin);
  stageEl().addEventListener("pointercancel", fin);
}
function stageEl(){ return $("#cardStage"); }
// hacia dónde va el gesto: [-1|1, 0] a un lado o [0, -1] arriba; null si no vale (abajo, o a un lado en la última)
function direccion(dx, dy){
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? [0, -1] : null;
  return quedan() && dx ? [Math.sign(dx), 0] : null;
}
// flechas que invitan a deslizar (en la última, solo la de arriba: abre otro sobre)
function flechas(on){
  const f = $("#flechas");
  f.classList.toggle("solo-arriba", !quedan());
  f.classList.toggle("on", on && (puedePasar() || puedeSalir()));
}
// fila con las cartas del sobre: reverso las que faltan, miniatura las ya vistas y la actual marcada
const minis = new Map(); // carta → miniatura
const reversos = new Map(); // edición → reverso de sus cartas (para las miniaturas aún boca abajo)
function miniReverso(){
  let src = reversos.get(edicion);
  if (!src) { src = document.createElement("canvas"); drawCardBack(src, edicion); if (fuentesCargadas()) reversos.set(edicion, src); } // sin fuentes, no se guarda
  const c = document.createElement("canvas");
  c.width = Math.round(30 * DPR3); c.height = Math.round(30 * DPR3 * src.height / src.width);
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function pintarMano(){
  const box = $("#mano");
  box.hidden = sobre.length < 2;
  if (box.hidden) return;
  box.textContent = "";
  sobre.forEach((k, j) => {
    const vista = j < iCarta || (j === iCarta && flipped), el = document.createElement("i");
    el.className = (j === iCarta ? "actual " : "") + (vista ? "vista " + rareza(k.d) : "");
    if (vista) {
      if (!minis.has(k)) {
        const c = document.createElement("canvas"), pinta = img => drawCarta(c, k.d, img, {num: k.num, total: k.total, scale: 30 / 680 * DPR3});
        pinta(null); if (k.d.foto) cargarFoto(k.d.foto).then(pinta, () => {});
        minis.set(k, c);
      }
      el.append(minis.get(k));
      if (k.nueva) el.insertAdjacentHTML("beforeend", "<b>NUEVA</b>");
    } else el.append(miniReverso());
    box.append(el);
  });
}
$("#mute").onclick = () => { setMutedUI(!muted); if (!muted) SFX.tap(); };
setMutedUI(muted);
/* ===== THE CARDS (public/ediciones.json): one edition, one card per pack ===== */
let EDICIONES = [normalizar({id: "invite"})], edicion = EDICIONES[0];
let sobre = [], iCarta = 0, carta = null; // the cards of the pack ({d, num, total, nueva}) and the one on screen
const edicionesListas = fetch("ediciones.json", {cache: "no-store"}).then(r => r.json()).then(j => {
  const eds = (j.ediciones || []).map(normalizar).filter(e => e.cartas.length);
  if (eds.length) EDICIONES = eds;
  edicion = EDICIONES[0];
  if (!opened) elegirCarta();
}).catch(e => console.warn("No ediciones.json:", e));
// a card claimed with Faable Auth always comes out of the pack; otherwise mazo.js draws one (rare ones less often)
function cartaReclamada(){
  const id = cuenta.estado.reclamada, k = edicion.cartas.findIndex(c => c.id === id);
  return k < 0 ? null : [{d: edicion.cartas[k], num: k + 1, total: edicion.cartas.length}];
}
function elegirCarta(){
  const ed = edicion, s = cartaReclamada() || sobrePendiente(ed);
  // the same cards are kept (the 3D module already drew them)
  if (s.length !== sobre.length || s.some((k, j) => k.d !== sobre[j].d)) sobre = s;
  iCarta = 0; carta = sobre[0] || null;
  document.body.style.setProperty("--foil", `linear-gradient(160deg,${ed.foil.map(([c, o]) => `${c} ${o * 100}%`).join(",")})`);
  document.querySelector(".pack-logo").textContent = ed.titulo;
  document.querySelector(".pack-label small").textContent = ed.etiqueta.replace(/\*/g, "★");
  document.querySelector(".pack-label b").textContent = ed.l1 + " " + ed.l2;
  document.querySelector(".back-body b").innerHTML = ed.dorso + "<br>1 CARD";
  document.querySelectorAll(".card-back").forEach(b => { b.firstElementChild.innerHTML = "FAABLE<br>" + ed.corto; b.lastElementChild.textContent = ed.numero.replace(/\*/g, "★"); });
  document.dispatchEvent(new Event("carta")); // the 3D module redraws pack, card back and card face
}
// without WebGL, the HTML card is a canvas with the same card
const vcCanvas = $("#vcCanvas");
function pintarCartaHTML(){
  const k = carta; if (!k || document.body.classList.contains("gl3d")) return;
  const pinta = img => { if (carta === k) drawCarta(vcCanvas, k.d, img, {num: k.num, total: k.total, scale: DPR3 * 340 / 680}); };
  pinta(null); if (k.d.foto) cargarFoto(k.d.foto).then(pinta, () => {});
}
document.addEventListener("carta", pintarCartaHTML);
function cartaAbierta(){
  if (sobre.length && !cuenta.estado.reclamada) sobreAbierto(edicion, sobre);
  setTimeout(() => precargar([edicion]), 6000); // the next pack's art, while this one is revealed
}
function textosFiesta(){
  $(".note").textContent = "";
  $("#replay").textContent = edicion.boton;
  $("#replay").hidden = !!cuenta.estado.reclamada; // one card per account: a claimed card is yours
  pintarCuenta();
}
let toastT;
function toast(t){
  const el = $("#toast"); el.textContent = t; el.classList.add("on");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2600);
}

/* ===== FAABLE AUTH: claim the card (sign in) and keep it in the user's profile ===== */
const esc = t => String(t ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function pintarCuenta(){
  const box = $("#cuenta"), e = cuenta.estado, mia = e.reclamada && e.reclamada === carta?.d.id;
  if (!e.on) { box.innerHTML = `<p class="cuenta-txt">Faable Auth isn't configured in this build (<code>src/config.js</code>).</p>`; return; }
  if (!e.user) {
    box.innerHTML = `<button class="btn" id="reclamar">🔑 Claim this card</button>
      <p class="cuenta-txt">Sign in with Faable Auth to keep it. Opening packs doesn't need an account.</p>`;
    $("#reclamar").onclick = () => { SFX.tap(); cuenta.reclamar(carta.d.id); };
    return;
  }
  box.innerHTML = `<p class="cuenta-ok">${mia ? "✓ Saved to your Faable Auth profile" : "Signed in"} as <b>${esc(e.user.email || e.user.name || e.user.sub)}</b></p>
    <details class="claims"><summary>What this app knows about you</summary><pre id="claims">…</pre></details>
    <button class="btn ghost" id="salir">Sign out</button>`;
  $("#salir").onclick = () => { SFX.tap(); cuenta.salir(); };
  $(".claims").addEventListener("toggle", async ev => { if (ev.target.open) $("#claims").textContent = JSON.stringify(await cuenta.claims(), null, 2); }, {once: true});
}

/* tilt of the holographic card */
// el puntero fija un objetivo (o un vaivén suave en reposo) y la carta se acerca a él poco a poco
const card = $("#vcard"), stage = $("#cardStage");
let aim = null, cur = {px: .5, py: .5};
function aimAt(e){
  const r = stage.getBoundingClientRect();
  aim = {px: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), py: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))};
}
stage.addEventListener("pointermove", aimAt); // también boca abajo: inclinando el montón se ven las que quedan
stage.addEventListener("pointerleave", () => aim = null);
stage.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") aim = null; });
stage.addEventListener("pointerdown", e => { if (flipped) aimAt(e); });
(function tiltLoop(t){
  if ($("#s-party").classList.contains("active")) {
    const s = t / 1000, to = aim || {px: .5 + Math.sin(s * .9) * .22, py: .5 + Math.cos(s * .7) * .18};
    cur.px += (to.px - cur.px) * .1; cur.py += (to.py - cur.py) * .1;
    if (!pack3d) { // con 3D la carta HTML es invisible: no recalcular su estilo cada fotograma
    card.style.setProperty("--ry", ((cur.px - .5) * 24).toFixed(2) + "deg");
    card.style.setProperty("--rx", ((.5 - cur.py) * 24).toFixed(2) + "deg");
    card.style.setProperty("--mx", (cur.px * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (cur.py * 100).toFixed(1) + "%");
    }
  }
  requestAnimationFrame(tiltLoop);
})(0);

// modo inmersivo: solo se puede pedir dentro de un toque (Android sí; el iPhone no lo permite fuera de vídeos)
function goImmersive(){
  if (instalada()) return; // instalada ya va a pantalla completa
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    const p = req.call(el, {navigationUI: "hide"});
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("portrait").catch(() => {})).catch(() => {});
  } catch (e) {}
}
function startReady(){
  const b = $("#start");
  if (!b.disabled) return;
  b.disabled = false; b.classList.remove("loading");
  etiquetaInicio();
}
const etiquetaInicio = () => { $("#startLabel").textContent = cuenta.estado.reclamada ? "▶ Open your card again" : "▶ Open the pack"; };
setTimeout(startReady, 9000);
// lo que el sobre 3D lee del flujo en cada fotograma
const app3d = {P, pack, cur, get flipped(){ return flipped; }, get zoomed(){ return zoomed; },
  get edicion(){ return edicion; }, get carta(){ return carta; }, get sobre(){ return sobre; }, get arrastre(){ return arrastre; }};
edicionesListas.then(() => initPack3D(app3d)).then(api => {
  pack3dReady = api;
  if (api) usarConfeti3D((...a) => {
    if (!pack3d || !document.querySelector("#s-pack.active, #s-party.active")) return false;
    pack3d.confeti(...a); return true;
  });
  if (api && !$("#s-pack").classList.contains("active")) resetPack(); // si ya está en el sobre, espera a la próxima vez
  // antes de dejar abrir sobres (se puede ir directo, sin la misión), las fotos de los próximos sobres ya descargadas;
  // con tope, para no bloquear si la red va lenta o no hay conexión
  return Promise.race([precargar(EDICIONES), new Promise(r => setTimeout(r, 6000))]);
}).then(startReady); // si la red va lenta, se empieza igual con el sobre CSS
// descarga y decodifica las fotos del próximo sobre de cada edición (quedan en la caché del navegador)
function precargar(eds){
  return Promise.all(eds.flatMap(ed => sobrePendiente(ed).map(k => k.d.foto && cargarFoto(k.d.foto).catch(() => {}))));
}
const instalada = () => matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true;
$("#start").onclick = () => { goImmersive(); startMusic(); SFX.powerUp(); resetPack(); pack3d?.entrar("caida"); show("s-pack"); };

// the session comes back from the login (or from storage): the cover says who you are and what you claimed
cuenta.listo.then(() => {
  const e = cuenta.estado;
  if (e.user) {
    $("#lead").textContent = e.reclamada
      ? `Welcome back, ${e.user.name || e.user.email}. Your card is saved in your Faable Auth profile, on every device you sign in on.`
      : `Signed in as ${e.user.email || e.user.name}.`;
    if (e.recienReclamada) toast("✓ Card saved to your profile");
  }
  if (!$("#start").disabled) etiquetaInicio();
  if (!opened) elegirCarta();
});
