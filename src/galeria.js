/* Feature gallery: the cards unlocked so far in a grid, with gaps for the ones still to find.
   Tapping a card opens it large in 3D (visor3d.js) to spin it. */
import { drawCarta, cargarFoto, rareza } from "./carta.js";
import { drawCardBack, DPR3, fuentesCargadas, fuentesListas } from "./texturas.js";
import { desbloqueadas, borrarHistoriales } from "./mazo.js";
import { crearVisor } from "./visor3d.js";

const $ = s => document.querySelector(s);
const THUMB = 112; // design width of a thumbnail (the grid scales it)

// opts: {edicion(): the normalized edition, sonido: {tap, sparkle, whoosh}, alReiniciar()}
export function crearGaleria(opts){
  const cat = $("#catalogo"), grid = $("#catGrid"), visorBox = $("#catVisor");
  let ed = null, visor = null, vista = []; // vista: unlocked cards in order, to step through with ‹ ›
  let abierta = -1;

  function abrir(){
    opts.sonido.tap();
    ed = opts.edicion();
    cat.hidden = false; cat.classList.remove("fuera"); void cat.offsetWidth; cat.classList.add("dentro");
    try { localStorage.removeItem("colNueva"); } catch (e) {}
    $("#catBtn .badge").hidden = true;
    pintar();
    // thumbnails carry text: if the fonts weren't there yet, paint again when they arrive
    if (!fuentesCargadas()) fuentesListas().then(ok => { if (ok && !cat.hidden) pintar(); });
  }
  function cerrar(){
    opts.sonido.tap();
    cat.classList.remove("dentro"); cat.classList.add("fuera");
    setTimeout(() => { if (cat.classList.contains("fuera")) cat.hidden = true; }, 260);
  }

  function pintar(){
    const tiene = desbloqueadas(ed), n = ed.cartas.length;
    $("#catProg").textContent = tiene.size === n ? `All ${n} features unlocked!` : `${tiene.size} of ${n} features unlocked`;
    $("#catBar").style.width = (n ? tiene.size / n * 100 : 0) + "%";
    vista = ed.cartas.map((d, i) => ({d, num: i + 1, total: n})).filter(k => tiene.has(k.d.id));
    grid.textContent = ""; grid.scrollTop = 0;
    ed.cartas.forEach((d, i) => {
      const hueco = document.createElement("button");
      hueco.className = "cat-hueco";
      if (!tiene.has(d.id)) {
        hueco.classList.add("bloqueada");
        if (rareza(d) !== "comun") hueco.classList.add(rareza(d)); // hint: a rare or special one is missing here
        hueco.innerHTML = `<b>?</b><small>#${String(i + 1).padStart(2, "0")}</small>`;
        hueco.setAttribute("aria-label", `Card ${i + 1}: not unlocked yet`);
        hueco.onclick = () => { hueco.classList.remove("nope"); void hueco.offsetWidth; hueco.classList.add("nope"); };
      } else {
        const c = document.createElement("canvas"), k = {d, num: i + 1, total: n};
        hueco.append(c);
        hueco.setAttribute("aria-label", `Card ${i + 1}: ${d.nombre}`);
        const dibuja = img => drawCarta(c, d, img, {num: k.num, total: n, scale: THUMB / 680 * DPR3});
        dibuja(null);
        if (d.foto) cargarFoto(d.foto).then(dibuja, () => {});
        hueco.onclick = () => verCarta(vista.findIndex(v => v.d === d));
      }
      grid.append(hueco);
    });
  }

  /* --- the card, large and in 3D --- */
  async function verCarta(i){
    abierta = i;
    visorBox.hidden = false; visorBox.classList.remove("fuera"); void visorBox.offsetWidth; visorBox.classList.add("dentro");
    if (!visor) {
      // the canvas fills the viewer; the card fits the #catLienzo box, which only marks the spot
      visor = await crearVisor({pr: DPR3, encaje: () => $("#catLienzo").getBoundingClientRect()});
      visor.canvas.addEventListener("zoom", e => { // zoomed in: only the card and its buttons
        const z = e.detail.zoom > 1.04;
        $("#visorZoom").hidden = !z; visorBox.classList.toggle("ampliado", z);
      });
    }
    if (!visor.canvas.isConnected) $("#catMarco").append(visor.canvas);
    visor.reiniciar();
    mostrar(true);
  }
  async function mostrar(conSonido){
    const k = vista[abierta];
    if (!k) return;
    $("#visorInfo").textContent = `${k.d.nombre} · ${String(k.num).padStart(2, "0")}/${k.total}`;
    $("#visorPrev").disabled = abierta <= 0; $("#visorNext").disabled = abierta >= vista.length - 1;
    const img = k.d.foto ? await cargarFoto(k.d.foto).catch(() => null) : null;
    if (vista[abierta] !== k) return;
    const cara = document.createElement("canvas"), reverso = document.createElement("canvas");
    drawCarta(cara, k.d, img, {num: k.num, total: k.total, scale: 2});
    drawCardBack(reverso, ed);
    visor.mostrar(cara, reverso, k.d, img);
    if (conSonido) opts.sonido.sparkle();
  }
  const pasar = d => { if (vista[abierta + d]) { abierta += d; opts.sonido.whoosh(); visor.reiniciar(); mostrar(false); } };
  function cerrarVisor(){
    opts.sonido.tap();
    visorBox.classList.remove("dentro"); visorBox.classList.add("fuera");
    setTimeout(() => { if (visorBox.classList.contains("fuera")) { visorBox.hidden = true; visor?.canvas.remove(); } }, 260);
  }

  $("#catBtn").onclick = abrir;
  $("#catHome").onclick = abrir; // also from the cover
  $("#catCerrar").onclick = cerrar;
  $("#visorCerrar").onclick = cerrarVisor;
  $("#visorGirar").onclick = () => { opts.sonido.whoosh(); visor?.voltear(); };
  $("#visorZoom").onclick = () => { opts.sonido.tap(); visor?.quitarZoom(); };
  $("#visorPrev").onclick = () => pasar(-1);
  $("#visorNext").onclick = () => pasar(1);
  addEventListener("keydown", e => {
    if (!dlg.hidden) { if (e.key === "Escape") dlg.hidden = true; }
    else if (!visorBox.hidden) { if (e.key === "Escape") cerrarVisor(); if (e.key === "ArrowLeft") pasar(-1); if (e.key === "ArrowRight") pasar(1); }
    else if (!cat.hidden && e.key === "Escape") cerrar();
  });
  try { $("#catBtn .badge").hidden = !localStorage.getItem("colNueva"); } catch (e) {}

  // how many you have, on the cover button
  function contar(){
    const e = opts.edicion(), tiene = desbloqueadas(e).size;
    $("#catHomeN").textContent = `${tiene}/${e.cartas.length}`;
    $("#catReset").hidden = !tiene; // start over only when there's something to clear
    return tiene;
  }

  // start over, after confirming: the gallery and the draw history are cleared
  const dlg = $("#dlgReset");
  $("#catReset").onclick = () => {
    opts.sonido.tap();
    const n = contar();
    $("#dlgTxt").textContent = `This clears the ${n === 1 ? "feature" : `${n} features`} you've unlocked in this browser, and packs draw from the full set again.`;
    dlg.hidden = false; $("#dlgNo").focus();
  };
  const cerrarDlg = () => { dlg.hidden = true; };
  $("#dlgNo").onclick = () => { opts.sonido.tap(); cerrarDlg(); };
  dlg.onclick = e => { if (e.target === dlg) cerrarDlg(); };
  $("#dlgSi").onclick = () => {
    borrarHistoriales();
    try { localStorage.removeItem("colNueva"); } catch (e) {}
    $("#catBtn .badge").hidden = true;
    cerrarDlg(); contar();
    opts.alReiniciar?.();
  };

  return {
    // a new card in the gallery: a dot on the button until the gallery is opened
    nueva(){ try { localStorage.setItem("colNueva", "1"); } catch (e) {} $("#catBtn .badge").hidden = false; contar(); },
    contar,
  };
}
