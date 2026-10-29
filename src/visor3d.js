/* 3D viewer of one card, with the same material as the app (material.js), front and back.
   - Spin: a horizontal drag turns it with the finger and, on release, it latches face up or face down;
     a quick flick flips it. The vertical tilt is small and comes back by itself.
   - Zoom: pinch, mouse wheel or double tap (2x / normal). Zoomed in, dragging pans the card.
   There is a single viewer (one WebGL context) that moves to the card being viewed, in the feature gallery.
   The canvas emits "zoom" (detail.zoom) when entering or leaving zoom, to show or hide the zoom-out button. */
import { materialCarta, paralaje } from "./material.js";
import { ART_UV, RAREZAS, rareza, drawFoto } from "./carta.js";

// pr: drawing density (the screen's)
// distancia: of the camera, with the card centred in the canvas (when there is no encaje)
// encaje(): screen rectangle the card should fill at rest; the canvas can be much larger (in the gallery it
//   fills the whole viewer, so spinning or zooming never crops the card)
// rueda: zoom with the mouse wheel / two fingers on the trackpad
export async function crearVisor({pr = Math.min(2, devicePixelRatio), distancia = 3.05, encaje = null, zoomMax = 3, rueda = true} = {}){
  const THREE = await import("three");
  const canvas = document.createElement("canvas");
  canvas.className = "visor3d";
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(pr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const FOV = 28, TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(FOV, 680 / 950, .1, 40);
  camera.position.z = distancia;

  const CW = 1, CH = 950 / 680;
  const U = {uTilt: {value: 0}, uArt: {value: new THREE.Vector4(...ART_UV)}}, artOn = {value: 1}, borde = {value: 0};
  const tex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
  // the photo on its own, for the parallax (as in the pack)
  const fotoC = document.createElement("canvas"), fotoU = {value: null}, fotoOn = {value: 0}, paralU = {value: new THREE.Vector2()}, limiteU = {value: new THREE.Vector4()};
  const ajustarParalaje = paralaje(THREE);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), materialCarta(THREE, null, {...U, uArtOn: artOn, uBorde: borde,
    uFoto: fotoU, uFotoOn: fotoOn, uParal: paralU, uLimite: limiteU}, "cara"));
  const back = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), materialCarta(THREE, null, {...U, uArtOn: {value: 0}, uBorde: {value: 0}}, "reverso"));
  back.rotation.y = Math.PI;
  const card = new THREE.Group(); card.add(front, back); scene.add(card);

  /* --- state: side (latch), target spin and tilt, zoom and pan --- */
  let lado = 0, rotY = 0, tiltX = 0;           // lado: multiples of half a turn (even = face up)
  let zoom = 1, zoomT = 1, panX = 0, panY = 0; // pan in world units
  let upp = .01, baseX = 0, baseY = 0;         // units per pixel and centre of the card at rest
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const limitarPan = () => {
    const mx = CW * (zoomT - 1) / 2 + .05 * (zoomT - 1), my = CH * (zoomT - 1) / 2 + .05 * (zoomT - 1);
    panX = clamp(panX, -mx, mx); panY = clamp(panY, -my, my);
  };
  let ampliado = false;
  const avisarZoom = () => {
    const z = zoomT > 1.04;
    if (z !== ampliado) { ampliado = z; canvas.dispatchEvent(new CustomEvent("zoom", {detail: {zoom: zoomT}})); }
  };
  const ponerZoom = z => { zoomT = clamp(z, 1, zoomMax); if (zoomT === 1) panX = panY = 0; limitarPan(); avisarZoom(); };

  /* --- pointer gestures: one finger spins (or pans when zoomed), two fingers pinch --- */
  const ptrs = new Map();
  let gesto = null, ultimoToque = 0;
  const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const medio = () => { const [a, b] = [...ptrs.values()]; return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; };
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptrs.size === 2) { const m = medio(); gesto = {tipo: "pinza", d0: dist(), z0: zoomT, m0: m, px: panX, py: panY}; }
    else if (ptrs.size === 1) gesto = {tipo: zoomT > 1.04 ? "mover" : "girar", x: e.clientX, y: e.clientY, t: performance.now(), px: panX, py: panY, hist: []};
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (!gesto) return;
    if (gesto.tipo === "pinza" && ptrs.size === 2) {
      const m = medio();
      ponerZoom(gesto.z0 * dist() / gesto.d0);
      panX = gesto.px + (m.x - gesto.m0.x) * upp; panY = gesto.py - (m.y - gesto.m0.y) * upp; limitarPan();
    } else if (gesto.tipo === "mover") {
      panX = gesto.px + (e.clientX - gesto.x) * upp; panY = gesto.py - (e.clientY - gesto.y) * upp; limitarPan();
    } else if (gesto.tipo === "girar") {
      const dx = e.clientX - gesto.x, dy = e.clientY - gesto.y;
      rotY = lado * Math.PI + clamp(dx * .011, -Math.PI * 1.1, Math.PI * 1.1);
      tiltX = clamp(dy * .003, -.3, .3);
      gesto.hist.push({x: e.clientX, t: performance.now()});
      if (gesto.hist.length > 6) gesto.hist.shift();
    }
  });
  const soltar = e => {
    if (!ptrs.delete(e.pointerId)) return;
    const g = gesto;
    if (ptrs.size === 0) canvas.style.cursor = "";
    if (!g) return;
    if (g.tipo === "pinza") { gesto = null; return; } // lifting one finger of a pinch doesn't start another gesture
    gesto = null;
    const movido = Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8, ahora = performance.now();
    if (!movido && ahora - g.t < 260) { // tap: a double tap toggles zoom
      if (ahora - ultimoToque < 320) { ponerZoom(zoomT > 1.04 ? 1 : 2.2); ultimoToque = 0; } else ultimoToque = ahora;
      return;
    }
    if (g.tipo !== "girar") return;
    // latch: snaps to the nearest side; a quick flick flips it even if it barely moved
    const h = g.hist, v = h.length > 1 ? (h[h.length - 1].x - h[0].x) / Math.max(1, h[h.length - 1].t - h[0].t) : 0;
    const giro = rotY - lado * Math.PI;
    if (Math.abs(v) > .45) lado += Math.sign(v);
    else lado += Math.round(giro / Math.PI);
    rotY = lado * Math.PI; tiltX = 0;
  };
  canvas.addEventListener("pointerup", soltar); canvas.addEventListener("pointercancel", soltar);
  if (rueda) canvas.addEventListener("wheel", e => { e.preventDefault(); ponerZoom(zoomT * Math.exp(-e.deltaY * .0015)); }, {passive: false});

  let vw = 0, vh = 0, listo = false; // nothing is drawn without a texture yet (the holographic shader needs the map)
  (function loop(t){
    requestAnimationFrame(loop);
    if (!canvas.isConnected || !listo) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (w !== vw || h !== vh)) { vw = w; vh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (!vh) return;
    // camera: at rest the card fills exactly the encaje rectangle (or the canvas, without one)
    const r = encaje?.();
    if (r?.height) {
      const cr = canvas.getBoundingClientRect(), visH = CH * cr.height / (r.height * .94);
      camera.position.z = visH / (2 * TAN); upp = visH / cr.height;
      baseX = (r.left + r.width / 2 - cr.left - cr.width / 2) * upp; baseY = -(r.top + r.height / 2 - cr.top - cr.height / 2) * upp;
    } else upp = 2 * distancia * TAN / vh;
    const s = t / 1000, quieta = !gesto && zoomT < 1.04 ? 1 : 0; // gentle sway only at rest and not zoomed
    zoom += (zoomT - zoom) * .18;
    card.scale.setScalar(zoom);
    card.position.x += (baseX + panX - card.position.x) * .25;
    card.position.y += (baseY + panY - card.position.y) * .25;
    const ty = rotY + Math.sin(s * .9) * .14 * quieta, tx = tiltX + Math.cos(s * .7) * .07 * quieta;
    card.rotation.y += (ty - card.rotation.y) * (gesto ? .3 : .12);
    card.rotation.x += (tx - card.rotation.x) * .15;
    U.uTilt.value = card.rotation.y * .8 + card.rotation.x * .5;
    ajustarParalaje(front, camera, paralU);
    renderer.render(scene, camera);
  })(0);

  return {
    canvas,
    // cara and reverso are canvases already drawn (drawCarta and drawCardBack); d: the card's data; img: its art (parallax)
    mostrar(cara, reverso, d, img){
      const conFoto = !!img && rareza(d) === "especial"; // parallax only on special cards
      fotoOn.value = conFoto ? 1 : 0;
      if (conFoto) { limiteU.value.set(...drawFoto(fotoC, d, img, 1.5)); fotoU.value?.dispose(); fotoU.value = tex(fotoC); }
      for (const [mesh, c] of [[front, cara], [back, reverso]]) {
        const old = mesh.material.map;
        mesh.material.map = tex(c); mesh.material.needsUpdate = !old;
        old?.dispose();
      }
      artOn.value = /\.svg$/i.test(d.foto || "") ? 1 : .35;
      listo = true;
      borde.value = RAREZAS[rareza(d)].borde;
    },
    voltear(){ if (!gesto) { lado += 1; rotY = lado * Math.PI; tiltX = 0; } },
    quitarZoom(){ ponerZoom(1); },
    // new card: face up and not zoomed (the short way round)
    reiniciar(){ lado = Math.round(lado / 2) * 2; rotY = lado * Math.PI; tiltX = 0; ponerZoom(1); },
  };
}
