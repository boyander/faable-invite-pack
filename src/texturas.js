/* Texturas del sobre y del reverso de la carta, dibujadas en canvas 2D con las mismas fuentes que la página */
import { rrect } from "./carta.js";

// sello de la invitación: disco con degradado, anillo y la F de Faable
function emblem2d(x, cx, cy, r){
  x.save();
  const g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, "#7ad3ff"); g.addColorStop(.5, "#5b5bf0"); g.addColorStop(1, "#b24bf3");
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  const sh = x.createRadialGradient(cx - r * .4, cy - r * .4, r * .1, cx, cy, r);
  sh.addColorStop(0, "rgba(255,255,255,.35)"); sh.addColorStop(1, "rgba(0,0,0,.18)");
  x.fillStyle = sh; x.fill();
  x.lineWidth = r * .09; x.strokeStyle = "#fff"; x.stroke();
  x.beginPath(); x.arc(cx, cy, r * .8, 0, Math.PI * 2); x.lineWidth = r * .03; x.strokeStyle = "rgba(255,255,255,.6)"; x.stroke();
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `${Math.round(r * 1.15)}px "Luckiest Guy"`; x.fillText("F", cx + r * .03, cy + r * .1);
  x.restore();
}
function rays2d(x, cx, cy, r, color, n, on){
  x.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n;
    x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, r, a, a + on); x.closePath(); x.fill();
  }
}
// fuentes de las texturas (canvas): [familia, peso, estilo]. Hay que esperar a que llegue la hoja de Google Fonts: sin ella
// document.fonts.load no sabe qué cargar y responde al momento, y lo dibujado se quedaba con la fuente de reserva
// (pasaba al abrir la app justo tras una actualización, con la caché de fuentes vacía)
const FUENTES = [["Luckiest Guy", "400"], ["Press Start 2P", "400"], ["Nunito", "900"], ["Nunito", "800"], ["Nunito", "600"], ["Nunito", "700", "italic"]];
const cargada = ([f, w, s = "normal"]) => [...document.fonts].some(x => x.family.replace(/["']/g, "") === f && x.weight === w && x.style === s && x.status === "loaded");
export const fuentesCargadas = () => FUENTES.every(cargada);
// espera a que estén todas (como mucho ms); devuelve si lo están
export async function fuentesListas(ms = 8000){
  const fin = performance.now() + ms;
  for (;;) {
    await Promise.all(FUENTES.map(([f, w, s = "normal"]) => document.fonts.load(`${s} ${w} 20px "${f}"`).catch(() => {})));
    if (fuentesCargadas()) return true;
    if (performance.now() > fin) return false;
    await new Promise(r => setTimeout(r, 200));
  }
}
// las texturas se dibujan a la densidad real de la pantalla (hasta 3x en iPhone) para que el texto salga nítido;
// se dibuja en coordenadas de diseño y el lienzo escala
export const DPR3 = Math.min(3, devicePixelRatio || 1);
// escala de una textura para que salga nítida: sobremuestreada respecto a su tamaño en pantalla, porque con mipmaps
// (y la carta o el sobre inclinados) la GPU mezcla con el nivel de la mitad; en 3x se sobremuestrea menos por memoria
export const texScale = (cssWidth, designWidth, max = 3.2) =>
  Math.min(max, Math.max(1, DPR3 * cssWidth / designWidth * (DPR3 >= 3 ? 1.4 : 2)));
// ancho del sobre con zoom (el de .pack-wrap en styles.css, por el zoom de zoomIn en main.js)
export function packZoomWidth(){
  const w = Math.min(innerWidth * .72, 280, Math.max(120, (innerHeight - 300) * .617));
  return w * Math.min(1.5, innerWidth * .9 / w);
}
export function hiCanvas(c, w, h, scale){
  c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const x = c.getContext("2d"); x.setTransform(scale, 0, 0, scale, 0, 0); return x;
}
// escala: por defecto la del sobre con zoom (para rasgar); el selector los pide más pequeños
export function drawPackFace(c, front, ed, escala = texScale(packZoomWidth(), 512)){
  const W = 512, H = 830, x = hiCanvas(c, W, H, escala), SH = H * .15;
  const g = x.createLinearGradient(0, 0, W * .55, H);
  ed.foil.forEach(([col, o]) => g.addColorStop(front ? o : 1 - o, col));
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
  // tira de arriba y la costura del corte
  // tiras selladas de arriba y abajo: costura y rayas del termosellado, como un sobre de verdad
  const BT = H * .915;
  const sealed = (y0, y1) => { x.fillStyle = "rgba(255,255,255,.12)"; for (let y = y0 + 9; y < y1 - 7; y += 6) x.fillRect(0, y, W, 1.5); };
  sealed(0, SH);
  x.fillStyle = "rgba(0,0,0,.14)"; x.fillRect(0, BT, W, H - BT);
  sealed(BT, H);
  x.fillStyle = "rgba(0,0,0,.25)"; x.fillRect(0, BT - 1, W, 3);
  x.fillStyle = "rgba(255,255,255,.25)"; x.fillRect(0, BT + 2, W, 1.5);
  x.fillStyle = "rgba(255,255,255,.8)"; x.font = '11px "Press Start 2P"';
  const cartas = (ed.porSobre || 1) > 1 ? ed.porSobre + " CARDS" : "1 CARD";
  x.fillText(front ? cartas : "FAABLE " + ed.corto, W / 2, BT + (H - BT) / 2 - 2);
  x.fillStyle = "rgba(255,255,255,.92)"; x.font = '15px "Press Start 2P"';
  x.fillText(front ? "LIMITED EDITION" : ed.dorso, W / 2, SH / 2 + 5);
  x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(0, SH - 1, W, 3);
  if (front) { x.setLineDash([10, 7]); x.strokeStyle = "rgba(255,255,255,.8)"; x.lineWidth = 3; x.beginPath(); x.moveTo(0, SH); x.lineTo(W, SH); x.stroke(); x.setLineDash([]); }
  x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 3; rrect(x, 18, SH + 18, W - 36, BT - 14 - (SH + 18), 16); x.stroke();
  if (front) {
    rays2d(x, W / 2, H * .47, 210, "rgba(255,255,255,.2)", 16, .14);
    emblem2d(x, W / 2, H * .47, 92);
    x.font = '44px "Luckiest Guy"';
    x.fillStyle = "#1f3f8f"; x.fillText(ed.titulo, W / 2, SH + 66, 456);
    x.lineWidth = 7; x.strokeStyle = "#1f3f8f"; x.strokeText(ed.titulo, W / 2, SH + 61, 456);
    x.fillStyle = "#ffcb05"; x.fillText(ed.titulo, W / 2, SH + 61, 456);
    const y0 = H * .695;
    rrect(x, 30, y0, W - 60, H * .165, 18); x.fillStyle = "rgba(10,14,50,.86)"; x.fill();
    x.lineWidth = 4; x.strokeStyle = "#ffcb05"; x.stroke();
    x.fillStyle = "#ffcb05"; x.font = '12px "Press Start 2P"'; x.fillText(ed.etiqueta, W / 2, y0 + 26);
    x.fillStyle = "#fff"; x.font = '40px "Luckiest Guy"';
    x.fillText(ed.l1, W / 2, y0 + 68, 430); x.fillText(ed.l2, W / 2, y0 + 108, 430);
  } else {
    x.fillStyle = "#fff"; x.font = '17px "Press Start 2P"';
    x.fillText(ed.dorso, W / 2, H * .36); x.fillText(cartas, W / 2, H * .36 + 34);
    emblem2d(x, W / 2, H * .53, 58);
    x.fillStyle = "#fff"; x.fillRect(W / 2 - 110, H * .7, 220, 70);
    x.fillStyle = "#111";
    for (let i = 0, px = W / 2 - 100; px < W / 2 + 100; i++) { const w = [2, 4, 1, 3][i % 4]; x.fillRect(px, H * .7 + 8, w, 54); px += w + [3, 2, 4, 2][i % 4]; }
  }
  // dentado de los extremos: huecos transparentes (alphaTest los recorta en la malla)
  x.globalCompositeOperation = "destination-out";
  // un número entero de dientes en el ancho: la cara de atrás va girada y sus dientes tienen que caer justo detrás de los
  // de delante (si no, asoman por los huecos y el borde parece doble)
  const tw = W / 20, td = 13;
  x.beginPath();
  for (let a = 0; a < W; a += tw) {
    x.moveTo(a, 0); x.lineTo(a + tw / 2, td); x.lineTo(a + tw, 0);
    x.moveTo(a, H); x.lineTo(a + tw / 2, H - td); x.lineTo(a + tw, H);
  }
  x.fill();
  x.globalCompositeOperation = "source-over";
}
export function drawCardBack(c, ed){
  const W = 512, H = 715, x = hiCanvas(c, W, H, texScale(340, W)); // la carta ocupa como mucho 340px
  const [borde, centro, fuera] = ed.reverso;
  rrect(x, 0, 0, W, H, 28); x.fillStyle = borde; x.fill();
  // panel interior con su degradado; los rayos se recortan a él para que el borde quede liso
  const g = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * .6);
  g.addColorStop(0, centro); g.addColorStop(1, fuera);
  rrect(x, 18, 18, W - 36, H - 36, 14); x.fillStyle = g; x.fill(); x.save(); x.clip();
  rays2d(x, W / 2, H / 2, H, "rgba(255,203,5,.16)", 18, .12);
  x.restore();
  emblem2d(x, W / 2, H / 2, 100);
  x.textAlign = "center"; x.fillStyle = "#ffcb05"; x.font = '17px "Press Start 2P"';
  x.fillText("FAABLE", W / 2, H * .25); x.fillText(ed.corto, W / 2, H * .25 + 32);
  x.fillText(ed.numero, W / 2, H * .78);
}
