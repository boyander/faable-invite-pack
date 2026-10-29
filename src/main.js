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
import { crearGaleria } from "./galeria.js";

const $ = s => document.querySelector(s);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const vibrate = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

function setMutedUI(m){
  setMuted(m);
  $("#mute").textContent = m ? "🔇" : "🔊";
  $("#mute").setAttribute("aria-label", m ? "Unmute" : "Mute");
}

// iOS ignores user-scalable=no and overflow:hidden: bounce, pinch and double-tap are blocked here.
// If the page still ends up zoomed in (a zoom that slipped through), pinching and panning are allowed to undo it
const ampliada = () => (window.visualViewport?.scale || 1) > 1.01;
document.addEventListener("touchmove", e => { if (!ampliada() && !e.target.closest(".scroll")) e.preventDefault(); }, {passive: false}); // except scrollable lists
document.addEventListener("gesturestart", e => { if (!ampliada()) e.preventDefault(); });
// double-tap: a quick second tap is always cancelled (even if it moved a little, as when spinning a card);
// only a swipe through a list gets through, since it isn't a double-tap (it used to open cards mid-scroll)
let lastTouchEnd = 0, touchStart = null;
document.addEventListener("touchstart", e => { const t = e.touches[0]; touchStart = t && {x: t.clientX, y: t.clientY}; }, {passive: true});
document.addEventListener("touchend", e => {
  const t = e.changedTouches[0], movido = !!(touchStart && t && Math.hypot(t.clientX - touchStart.x, t.clientY - touchStart.y) > 10);
  if (movido && e.target.closest(".scroll")) { lastTouchEnd = 0; return; }
  const now = Date.now();
  if (now - lastTouchEnd < 350) { e.preventDefault(); if (!movido && e.target.click) e.target.click(); }
  lastTouchEnd = now;
}, {passive: false});
// and if it did zoom in, it snaps back to scale 1 by itself: reassigning the viewport makes iOS reset it.
// Also on load, in case the page was reloaded with an earlier zoom (iOS keeps it across reloads)
{
  const vp = document.querySelector('meta[name="viewport"]'), base = vp.content;
  const resetZoom = () => { vp.content = base + ", minimum-scale=1"; requestAnimationFrame(() => { vp.content = base; }); window.scrollTo(0, 0); };
  let t;
  window.visualViewport?.addEventListener("resize", () => {
    clearTimeout(t);
    if (ampliada()) t = setTimeout(resetZoom, 500);
  });
  resetZoom();
  addEventListener("pageshow", e => { if (e.persisted || ampliada()) resetZoom(); }); // coming back from the browser's back/forward cache
}

function show(id){
    document.querySelectorAll(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  window.scrollTo({top:0});
}

/* stars */
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
/* ===== PACK ===== */
const packScene = $("#packScene"), packFloat = $("#packFloat"), emerge = $("#emerge");
const pack = $("#pack"), packTop = $("#packTop"), rip = $("#rip"), tip = $("#tip"), hintText = $("#hintText");
const HINT = hintText.textContent, HINT_CUT = "Swipe along the line to tear it open";
let zoomed = false;
function zoomIn(){
  if (zoomed || opened) return;
  zoomed = true;
  P.lock = Math.round(P.ry / 360) * 360; // facing front
  const r = packScene.getBoundingClientRect();
  const z = Math.min(1.5, innerWidth * .9 / pack.offsetWidth);
  packScene.style.transform = `translateY(${innerHeight * .19 - r.top}px) scale(${z.toFixed(3)})`;
  $("#s-pack").classList.add("zoomed");
  hintText.textContent = HINT_CUT;
  SFX.whoosh(); tone(523, .1, .12, "triangle", .05); tone(784, .2, .16, "triangle", .05);
  vibrate(20);
}
// lo..hi: the stretch of the line already torn (fraction of the width); the tear follows the finger in either direction
let lo = 0, hi = 0, tear = 0, drag = null, opened = false, sparkAt = 0;
const OPEN_AT = .8; // covering 80% of the width is enough
const SLICES = Array.from({length: 24}, () => {
  const d = document.createElement("div");
  d.className = "pack-top foil zig-top";
  d.innerHTML = "<span>EDICION LIMITADA</span><i class=\"shade\"></i>";
  return $("#strip").appendChild(d);
});
// progress is computed right away; drawing is batched into one frame (on iOS a finger fires up to 120 events/s)
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
  // each band shows its share of the torn part and curls more the closer it is to the loose end
  const n = SLICES.length;
  SLICES.forEach((el, i) => {
    const A = Math.max(i / n, lo), B = Math.min((i + 1) / n, hi);
    if (B <= A) { el.style.clipPath = "inset(0 100% 0 0)"; el.style.transform = ""; el.lastChild.style.opacity = 0; return; }
    el.style.clipPath = `inset(0 ${Math.max(0, 99.7 - B * 100).toFixed(2)}% 0 ${Math.max(0, A * 100 - .3).toFixed(2)}%)`;
    const c = (A + B) / 2;
    const free = lo < .04 ? (hi - c) / Math.max(hi, .01)          // started on the left: loose on the left
               : hi > .96 ? (c - lo) / Math.max(1 - lo, .01)       // started on the right
               : .5 * (1 - Math.abs(c - (lo + hi) / 2) / ((hi - lo) / 2)); // started in the middle: it bulges
    const ang = Math.max(0, free) ** 1.4 * 58 * Math.min(1, tear * 2 + .3);
    el.style.transform = `translateY(${(-free * 6).toFixed(1)}px) translateZ(${(free * 10).toFixed(1)}px) rotateX(${(-ang).toFixed(1)}deg)`;
    // the bending part catches light: that's what makes it read as a curve and not a step
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
  if (pack3dReady && !pack3d) { pack3d = pack3dReady; $("#s-pack").classList.add("gl"); document.body.classList.add("gl3d"); } // switches on when entering, never halfway
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
  // before zooming: dragging rotates it and a tap opens it; once zoomed, swiping anywhere tears the strip
  if (!zoomed) {
    P.lock = null;
    drag = {spin: true, x: e.clientX, y: e.clientY, moved: 0, ry0: P.ry, lastX: e.clientX};
    pack.classList.add("dragging");
    return;
  }
  drag = {x: e.clientX, y: e.clientY, moved: 0};
  if (hi - lo < .02) lo = hi = f; // the first touch sets where the tear starts
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
  if (tear > before && now - sparkAt > 60) { // sparks and paper sound coming from the tip
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
  if (drag.moved < 10) { const span = hi - lo; lo = 0; hi = Math.min(1, span + .3); } // it also opens with taps
  pack.classList.add("touched");
  drag = null;
  pack.classList.remove("dragging");
  renderTear();
  if (tear >= .6) return openPack();
  if (tear > 0) { // halfway: a wiggle and a nudge on the text
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

/* 3D pack: idle sway, rotation with inertia that returns to the front, drop when it opens */
const P = {rx: 0, ry: 0, vr: 0, dy: 0, lock: null};
let pack3d = null, pack3dReady = null;
const SPECS = document.querySelectorAll(".face .spec i");
let dropAt = 0, flyAt = 0, openTimers = [];
(function packLoop(t){
  if ($("#s-pack").classList.contains("active")) {
    const s = t / 1000;
    if (!(drag && drag.spin)) {
      const rest = opened || drag || zoomed ? 0 : Math.sin(s * .8) * 16;
      // two stable positions, front or back; opening it asks for the front (P.lock)
      if (opened && P.lock == null) P.lock = Math.round(P.ry / 360) * 360;
      const target = (P.lock ?? Math.round(P.ry / 180) * 180) + rest;
      P.vr = (P.vr + (target - P.ry) * .018) * .92;
      P.ry += P.vr;
    }
    const rxTarget = opened ? 7 : drag && !drag.spin ? -8 : Math.sin(s * .6) * 5;
    P.rx += (rxTarget - P.rx) * .08;
    if (dropAt) { const k = Math.min(1, (t - dropAt) / 650); P.dy = k * k * innerHeight * 1.1; }
    if (pack3d) { requestAnimationFrame(packLoop); return; } // in 3D, three.js reads P and does the drawing
    if (flyAt && t > flyAt) { // the flying piece ripples like plastic
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
    at(780, () => tone(330, 0, .1, "sine", .08));            // the card's feint
    at(880, () => { SFX.whoosh(); tone(392, 0, .5, "triangle", .05, 784); }); // rises
    at(1600, () => tone(196, 0, .45, "sine", .14, 70));      // the pack withdraws
    at(1950, () => SFX.sparkle());
    at(2620, () => celebrate("3d"));
    return;
  }
  at(300, () => SFX.whoosh());
  at(450, () => { packScene.classList.add("opening", "glow"); SFX.shimmer(); });
  at(800, () => { // the card peeks out of the opening
    const h = pack.offsetHeight;
    emerge.style.transition = "transform .9s cubic-bezier(.2,.85,.25,1)";
    emerge.style.transform = `translateY(${-h * .5}px)`;
    SFX.whoosh();
  });
  at(1750, () => { // the pack drops and the card stays alone, in the center
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

/* ===== CELEBRATION ===== */
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
  // coming from the 3D pack the card is already in place; from the CSS one, it slides up
  const cardAt = fromPack === "3d" ? 0 : fromPack ? 250 : 1700;
  if (fromPack === "3d") { $("#cardStage").classList.add("in", "instant"); pack3d.party(); } // the same 3D card stays here
  else partyTimers.push(setTimeout(() => { $("#cardStage").classList.add("in"); SFX.whoosh(); }, cardAt));
  anticipar(cardAt + 450);
  partyTimers.push(setTimeout(() => $("#tapHint").classList.add("on"), cardAt + (sobre.length > 1 ? 2400 : 1000))); // after showing the stack
  partyTimers.push(setTimeout(flipCard, 8000)); // if it isn't tapped, it flips by itself
}
// face down, the card already glows with its rarity (in 3D the aura; without 3D, the card back's glow) and a cue plays
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
  $("#mano").hidden = sobre.length < 2; // the row of the pack's cards takes up room too
  party.classList.add("measure");
  fitCard(true);
  const r = $("#cardStage").getBoundingClientRect();
  party.classList.remove("measure");
  return {x: r.left, y: r.top - 40, w: r.width, h: r.height}; // -40: the card starts 40px lower (translateY)
}
// measures everything else on screen and gives the card the remaining height;
// if the card ends up small with the button below it, the button floats over it instead
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
  // with the button floating, the card ends right above it so its bottom edge shows
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
  // in 3D the special one does a turn and a half over the iridescent background (like in the game); the rest, the usual flip
  const T = pack3d ? pack3d.flip(especial) : {canto: 380, fin: 1150};
  // you can't move to the next one until the reveal ends and it has been on screen a moment (longer if rare or special)
  pasarDesde = performance.now() + T.fin + (rz === "comun" ? 300 : 900);
  SFX.whoosh(); vibrate([20, 30, 60]);
  if (especial && pack3d) {
    document.body.classList.add("revelacion");
    partyTimers.push(setTimeout(() => document.body.classList.remove("revelacion"), T.fin + 1600));
    [380, 720].forEach(ms => setTimeout(() => SFX.whoosh(), ms));
    tone(hz(60), 0, 1.1, "sine", .08, hz(84)); // tension builds while it spins
  }
  setTimeout(() => { // card edge-on: flash and burst right at the turn
    const f = $("#flash"); f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
    const r = $("#flipper").getBoundingClientRect();
    spawn(r.left + r.width / 2, r.top + r.height / 2, especial ? 130 : rz === "rara" ? 95 : 70, Math.PI * 2, -Math.PI / 2, especial ? 9 : 7);
    if (especial) { SFX.legendario(); vibrate([60, 40, 60, 40, 200]); cartel("especial"); }
    else if (rz === "rara") { SFX.rara(); vibrate([40, 40, 90]); cartel("rara"); }
    else { SFX.sparkle(); [72, 76, 79, 84].forEach((m, i) => tone(hz(m), i * .07, .5, "triangle", .07)); }
  }, T.canto);
  setTimeout(() => { $("#flipper").classList.add("done"); pintarMano(); }, T.fin);
  setTimeout(() => { $("#after").classList.add("in"); flechas(true); }, quedan() ? pasarDesde - performance.now() + 20 : T.fin); // the button, once it's usable
}
// rare or special card: silver or rainbow banner over the card (and its fanfare, in flipCard)
const CARTELES = {rara: ["✦ RARE CARD ✦", "A silver one!"], especial: ["✦ SPECIAL CARD ✦", "The holo one. Lucky you."]};
function cartel(rz){
  const el = $("#legend");
  [el.firstElementChild.textContent, el.lastElementChild.textContent] = CARTELES[rz];
  el.classList.toggle("rara", rz === "rara");
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  const r = $("#flipper").getBoundingClientRect();
  partyTimers.push(setTimeout(() => { spawn(r.left + r.width * .2, r.top + r.height * .3, 30, 1.2, -Math.PI * .7, 8); spawn(r.right - r.width * .2, r.top + r.height * .3, 30, 1.2, -Math.PI * .3, 8); }, 650));
}
// flip: only on a tap; dragging tilts the stack to look at it and releasing doesn't flip it
let arrastrado = false;
$("#flipper").addEventListener("click", () => { if (!arrastrado) flipCard(); });
// open another pack: the card shoots upward spinning and then the new pack arrives
let leaving = false;
$("#replay").onclick = () => {
  // only while visible: hidden, it still responded, and a second tap on "Next card" opened another pack without revealing the last one
  if (!$("#after").classList.contains("in")) return;
  if (quedan()) return siguiente(-1, 0);
  abrirOtro();
};
// the last card flies off and the new pack arrives (via the button or by swiping the card)
function abrirOtro(){
  if (leaving) return;
  leaving = true; arrastre = {x: 0, y: 0}; flechas(false);
  partyTimers.forEach(clearTimeout);
  SFX.tap(); vibrate(15);
  $("#legend").classList.remove("on");
  document.body.classList.remove("revelacion");
  const party = $("#s-party"), ms = pack3d ? pack3d.exit() : 760;
  party.classList.add("leaving");
  setTimeout(() => { // liftoff: whoosh, rising arpeggio and sparks from the card
    SFX.whoosh(); [72, 76, 79, 84, 88].forEach((m, i) => tone(hz(m), i * .05, .14, "triangle", .05));
    const r = $("#cardStage").getBoundingClientRect();
    spawn(r.left + r.width / 2, r.top + r.height * .6, 26, Math.PI * .9);
  }, ms * .2);
  setTimeout(() => { resetPack(); pack3d?.entrar("caida"); show("s-pack"); party.classList.remove("leaving"); leaving = false; }, ms + 60);
}
/* ===== MULTI-CARD PACKS: the revealed card is swiped away and the next one in the stack comes up ===== */
const quedan = () => Math.max(0, sobre.length - 1 - iCarta);
let pasarDesde = 0; // when you can move to the next one (set by flipCard)
const puedePasar = () => flipped && quedan() > 0 && !leaving && performance.now() >= pasarDesde;
// on the last one, swiping it opens another pack (once the open-another button shows)
const puedeSalir = () => flipped && !quedan() && !leaving && $("#after").classList.contains("in");
let arrastre = {x: 0, y: 0}; // px the finger has moved the card (the 3D module follows it)
// move to the next: the current one leaves toward (dx, dy) (-1 to 1; up and down too)
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
// dragging the revealed card in any direction (or a quick flick) moves to the next one; a short tap, confetti
{
  let ini = null, prev = null; // prev: position a moment ago, for the gesture's speed
  stageEl().addEventListener("pointerdown", e => { ini = prev = {x: e.clientX, y: e.clientY, t: e.timeStamp}; arrastrado = false; });
  stageEl().addEventListener("pointermove", e => {
    if (!ini) return;
    if (e.timeStamp - prev.t > 60) prev = {...prev, x2: prev.x, y2: prev.y, t2: prev.t, x: e.clientX, y: e.clientY, t: e.timeStamp};
    if (!puedePasar() && !puedeSalir()) return;
    // in a straight line: up, or sideways (on the last card only up)
    const dx = e.clientX - ini.x, dy = e.clientY - ini.y, dir = direccion(dx, dy);
    arrastre = !dir ? {x: 0, y: 0} : dir[0] ? {x: dx, y: 0} : {x: 0, y: Math.min(0, dy)};
    if (Math.hypot(dx, dy) > 10) flechas(false);
    // as soon as the gesture is clear, the card goes (it doesn't stick to the finger until release)
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
// where the gesture is heading: [-1|1, 0] sideways or [0, -1] up; null if not valid (down, or sideways on the last one)
function direccion(dx, dy){
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? [0, -1] : null;
  return quedan() && dx ? [Math.sign(dx), 0] : null;
}
// arrows inviting a swipe (on the last one, only the up arrow: it opens another pack)
function flechas(on){
  const f = $("#flechas");
  f.classList.toggle("solo-arriba", !quedan());
  f.classList.toggle("on", on && (puedePasar() || puedeSalir()));
}
// row with the pack's cards: card back for the remaining ones, thumbnails for the seen ones, and the current one highlighted
const minis = new Map(); // card → thumbnail
const reversos = new Map(); // edition → its card back (for thumbnails still face down)
function miniReverso(){
  let src = reversos.get(edicion);
  if (!src) { src = document.createElement("canvas"); drawCardBack(src, edicion); if (fuentesCargadas()) reversos.set(edicion, src); } // not cached without the fonts
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
      if (k.nueva) el.insertAdjacentHTML("beforeend", "<b>NEW</b>");
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
  galeria.contar();
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
  document.querySelector(".back-body b").innerHTML = ed.dorso + "<br>" + (ed.porSobre > 1 ? ed.porSobre + " CARDS" : "1 CARD");
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
  if (sobre.length && !cuenta.estado.reclamada && sobreAbierto(edicion, sobre)) galeria.nueva();
  setTimeout(() => precargar([edicion]), 6000); // the next pack's art, while this one is revealed
}
function textosFiesta(){
  $(".note").textContent = "";
  $("#replay").textContent = quedan() ? `Next card (${iCarta + 2}/${sobre.length}) ›` : edicion.boton;
  $("#replay").classList.toggle("siguiente", quedan() > 0);
  $("#replay").hidden = !!cuenta.estado.reclamada; // one card per account: a claimed card is yours
  pintarCuenta();
}
const galeria = crearGaleria({edicion: () => edicion, sonido: SFX,
  alReiniciar(){ SFX.whoosh(); toast("Gallery cleared: collect them all again"); if (!opened) elegirCarta(); }});
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
    box.innerHTML = `<a class="btn" id="reclamar" href="${cuenta.REGISTRO}" target="_blank" rel="noopener">🔑 Claim this card</a>
      <p class="cuenta-txt">Create your Faable account in a new tab. Opening packs doesn't need an account.</p>`;
    $("#reclamar").onclick = () => SFX.tap();
    return;
  }
  box.innerHTML = `<a class="btn" href="${cuenta.DASHBOARD}">Continue to your dashboard →</a>
    <p class="cuenta-ok">${mia ? "✓ Saved to your Faable Auth profile" : "Signed in"} as <b>${esc(e.user.email || e.user.name || e.user.sub)}</b></p>
    <details class="claims"><summary>What this app knows about you</summary><pre id="claims">…</pre></details>
    <button class="btn ghost" id="salir">Sign out</button>`;
  $("#salir").onclick = () => { SFX.tap(); cuenta.salir(); };
  $(".claims").addEventListener("toggle", async ev => { if (ev.target.open) $("#claims").textContent = JSON.stringify(await cuenta.claims(), null, 2); }, {once: true});
}

/* tilt of the holographic card */
// the pointer sets a target (or a gentle sway when idle) and the card eases toward it
const card = $("#vcard"), stage = $("#cardStage");
let aim = null, cur = {px: .5, py: .5};
function aimAt(e){
  const r = stage.getBoundingClientRect();
  aim = {px: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), py: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))};
}
stage.addEventListener("pointermove", aimAt); // face down too: tilting the stack shows how many are left
stage.addEventListener("pointerleave", () => aim = null);
stage.addEventListener("pointerup", e => { if (e.pointerType !== "mouse") aim = null; });
stage.addEventListener("pointerdown", e => { if (flipped) aimAt(e); });
(function tiltLoop(t){
  if ($("#s-party").classList.contains("active")) {
    const s = t / 1000, to = aim || {px: .5 + Math.sin(s * .9) * .22, py: .5 + Math.cos(s * .7) * .18};
    cur.px += (to.px - cur.px) * .1; cur.py += (to.py - cur.py) * .1;
    if (!pack3d) { // with 3D the HTML card is invisible: don't recompute its style every frame
    card.style.setProperty("--ry", ((cur.px - .5) * 24).toFixed(2) + "deg");
    card.style.setProperty("--rx", ((.5 - cur.py) * 24).toFixed(2) + "deg");
    card.style.setProperty("--mx", (cur.px * 100).toFixed(1) + "%");
    card.style.setProperty("--my", (cur.py * 100).toFixed(1) + "%");
    }
  }
  requestAnimationFrame(tiltLoop);
})(0);

function startReady(){
  const b = $("#start");
  if (!b.disabled) return;
  b.disabled = false; b.classList.remove("loading");
  etiquetaInicio();
}
const etiquetaInicio = () => { $("#startLabel").textContent = cuenta.estado.reclamada ? "▶ Open your card again" : "▶ Open the pack"; };
setTimeout(startReady, 9000);
// what the 3D pack reads from the flow every frame
const app3d = {P, pack, cur, get flipped(){ return flipped; }, get zoomed(){ return zoomed; },
  get edicion(){ return edicion; }, get carta(){ return carta; }, get sobre(){ return sobre; }, get arrastre(){ return arrastre; }};
edicionesListas.then(() => initPack3D(app3d)).then(api => {
  pack3dReady = api;
  if (api) usarConfeti3D((...a) => {
    if (!pack3d || !document.querySelector("#s-pack.active, #s-party.active")) return false;
    pack3d.confeti(...a); return true;
  });
  if (api && !$("#s-pack").classList.contains("active")) resetPack(); // if already on the pack screen, wait for next time
  // before packs can be opened, the photos of the upcoming packs are already downloaded;
  // with a cap, so it doesn't block on a slow network or no connection
  return Promise.race([precargar(EDICIONES), new Promise(r => setTimeout(r, 6000))]);
}).then(startReady); // on a slow network, start anyway with the CSS pack
// downloads and decodes the photos of each edition's next pack (they stay in the browser cache)
function precargar(eds){
  return Promise.all(eds.flatMap(ed => sobrePendiente(ed).map(k => k.d.foto && cargarFoto(k.d.foto).catch(() => {}))));
}
$("#start").onclick = () => { startMusic(); SFX.powerUp(); resetPack(); pack3d?.entrar("caida"); show("s-pack"); };

// the session comes back from the login (or from storage): the cover says who you are and what you claimed
cuenta.listo.then(() => {
  const e = cuenta.estado;
  if (e.user) {
    $("#lead").textContent = e.reclamada
      ? `Welcome back, ${e.user.name || e.user.email}. Your card is saved in your Faable Auth profile, on every device you sign in on.`
      : `Signed in as ${e.user.email || e.user.name}.`;
    if (e.recienReclamada) toast("✓ Card saved to your profile");
    $("#irDashboard").hidden = false;
  }
  if (!$("#start").disabled) etiquetaInicio();
  if (!opened) elegirCarta();
});
