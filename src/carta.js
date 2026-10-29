/* Diseño de las cartas (680×950 unidades de diseño): foto o ilustración, textos y colores de cada carta de ediciones.json.
   La usan el sobre 3D (textura), la carta HTML de reserva y el editor. */

export const W = 680, H = 950;
export const ART = [52, 140, 576, 344]; // hueco de la foto (x, y, ancho, alto)
// la misma zona con marco, en coordenadas de textura (u0, v0, u1, v1): ahí va el holográfico de la carta 3D
export const ART_UV = [44 / W, 1 - 492 / H, 636 / W, 1 - 132 / H];
// paralaje (solo en las cartas especiales): en 3D la foto va en su propia textura, con PARALAJE de margen por cada lado, y el shader la desplaza según
// desde dónde se mira la carta (parece hundida tras el marco). FOTO_UV: el hueco de la foto en coordenadas de textura
export const PARALAJE = .12;
export const FOTO_UV = [52 / W, 1 - 484 / H, 628 / W, 1 - 140 / H];

const P = d => new Path2D(d);
// icono de cada producto, dibujado en una caja de 24×24
export const TIPOS = {
  deploy: {nombre: "Deploy", c: ["#7ad3ff", "#1e6fd8"], bg: ["#eef7ff", "#c9e4ff"], icon: P("M12 2l7 8h-4v6H9v-6H5z M5 18h14v3H5z")},
  auth:   {nombre: "Auth",   c: ["#d9a6ff", "#7a2bd8"], bg: ["#f7efff", "#e2ccff"], icon: P("M7 7a5 5 0 1 0 4.6 7H15v3h3v-3h4v-4H11.6A5 5 0 0 0 7 7zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z")},
  cli:    {nombre: "CLI",    c: ["#8ff0b4", "#16935a"], bg: ["#eefcf3", "#c4f0d6"], icon: P("M2 4h20v16H2z M5 8l4 4-4 4 1.4 1.4L11.8 12 6.4 6.6z M12 16h7v2h-7z")},
  shield: {nombre: "Edge",   c: ["#ffc98a", "#e0661a"], bg: ["#fff5ea", "#ffdcb8"], icon: P("M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z")},
  normal: {nombre: "Faable", c: ["#e6e6e6", "#8a8fa8"], bg: ["#f4f5fb", "#dde0ee"], icon: P("M12 2l3 7 7 .6-5.3 4.6 1.6 7.1L12 17.6 5.7 21.3l1.6-7.1L2 9.6 9 9z")},
};

// rareza de cada carta: peso en el sorteo (mazo.js), estrellas del número y, en 3D, marco (uBorde: plateado o
// holográfico), tono del aura (base dorada o plateada y cuánto arcoíris) y brillo del reverso antes de voltearla.
// En ediciones.json va en "rareza" ("rara" o "especial"; sin el campo, común); "especial": true es el formato antiguo
export const RAREZAS = {
  comun:    {nombre: "Común",    peso: 1,   estrellas: "★",   borde: 0,  aura: [1, .78, .3],  iris: .55, brillo: 0},
  rara:     {nombre: "Rara",     peso: .5,  estrellas: "★★",  borde: .5, aura: [.6, .82, 1],  iris: .3,  brillo: .8},
  especial: {nombre: "Especial", peso: .25, estrellas: "★★★", borde: 1,  aura: [1, .78, .3],  iris: .92, brillo: 1},
};
export const rareza = d => RAREZAS[d?.rareza] ? d.rareza : d?.especial ? "especial" : "comun";

export function rrect(x, a, b, w, h, r){ x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); }

export function energia(x, cx, cy, r, tipo){
  const t = TIPOS[tipo] || TIPOS.normal;
  const g = x.createRadialGradient(cx - r * .3, cy - r * .4, r * .1, cx, cy, r);
  g.addColorStop(0, t.c[0]); g.addColorStop(1, t.c[1]);
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  x.lineWidth = 3; x.strokeStyle = "#fff"; x.stroke();
  x.save(); x.translate(cx - r * .62, cy - r * .62); x.scale(r / 19, r / 19); x.fillStyle = "#fff"; x.fill(t.icon, "evenodd"); x.restore();
}

// parte el texto en líneas que caben en `max` (respetando los saltos de línea); si no cabe en `n`, la última acaba en "…"
function lineas(x, txt, max, n){
  const out = [];
  for (const parrafo of String(txt || "").split("\n")) {
    let cur = "";
    for (const w of parrafo.split(/\s+/).filter(Boolean)) {
      const t = cur ? cur + " " + w : w;
      if (x.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
  }
  if (out.length > n) {
    out.length = n; let l = out[n - 1];
    while (l && x.measureText(l + "…").width > max) l = l.slice(0, -1);
    out[n - 1] = l.trimEnd() + "…";
  }
  return out;
}

// recorte "cover" de la foto centrado en `foco` (0..1) con `zoom` ≥ 1
export function encuadre(img, foco = [.5, .4], zoom = 1){
  const [, , aw, ah] = ART, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.max(aw / iw, ah / ih) * Math.max(1, zoom || 1), sw = aw / sc, sh = ah / sc;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  return [cl(foco[0] * iw - sw / 2, 0, iw - sw), cl(foco[1] * ih - sh / 2, 0, ih - sh), sw, sh];
}
// el foco que de verdad se ve: si la foto no tiene margen en un eje, el foco de ese eje no puede moverse
export function focoVisible(img, foco, zoom){
  const [sx, sy, sw, sh] = encuadre(img, foco, zoom), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const r = v => Math.round(v * 1000) / 1000;
  return [r((sx + sw / 2) / iw), r((sy + sh / 2) / ih)];
}

/* dibuja la carta `d` en el canvas `c`. o: {num, total, scale} */
export function drawCarta(c, d, img, o = {}){
  const s = o.scale || 1;
  c.width = Math.round(W * s); c.height = Math.round(H * s);
  const x = c.getContext("2d"); x.setTransform(s, 0, 0, s, 0, 0);
  const t = TIPOS[d.tipo] || TIPOS.normal, col = d.colores || {};
  const fondo = col.fondo || t.bg, arte = col.arte || t.c; // colores propios de la carta, si los tiene
  // marco amarillo, plateado si es rara o lámina arcoíris si es especial (en 3D además se mueven con la inclinación)
  // y fondo del color del tipo
  const rz = rareza(d);
  let g = x.createLinearGradient(0, 0, W, H);
  if (rz === "especial") ["#ff9ad5", "#ffe17a", "#8affc1", "#7ac8ff", "#c49bff", "#ff9ad5", "#ffe17a"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  else if (rz === "rara") ["#9aa3b5", "#eef2fa", "#b8c0d0", "#ffffff", "#8e97aa"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
  else { g.addColorStop(0, "#3a4a9a"); g.addColorStop(.45, "#1d2766"); g.addColorStop(1, "#11173f"); }
  rrect(x, 0, 0, W, H, 36); x.fillStyle = g; x.fill();
  if (rz !== "comun") {
    g = x.createLinearGradient(0, 0, W, H * .7);
    [[0, 0], [.42, 0], [.5, .75], [.58, 0], [1, 0]].forEach(([o, a]) => g.addColorStop(o, `rgba(255,255,255,${a})`));
    x.fillStyle = g; x.fill();
  }
  g = x.createLinearGradient(0, 20, 0, H - 20); g.addColorStop(0, fondo[0]); g.addColorStop(1, fondo[1]);
  rrect(x, 20, 20, W - 40, H - 40, 20); x.fillStyle = g; x.fill();
  x.textBaseline = "alphabetic"; x.fillStyle = "#1a1a2e";
  // cabecera: producto, nombre e icono del producto
  x.textAlign = "left"; x.font = '900 18px Nunito';
  const fase = String(d.fase || "Faable").toUpperCase(), pill = x.measureText(fase).width + 20;
  g = x.createLinearGradient(0, 44, 0, 72); g.addColorStop(0, arte[0]); g.addColorStop(1, arte[1]);
  rrect(x, 44, 44, pill, 28, 8); x.fillStyle = g; x.fill();
  x.fillStyle = "#fff"; x.fillText(fase, 54, 65);
  energia(x, 612, 100, 22, d.tipo);
  x.fillStyle = "#1a1a2e"; x.font = '900 42px Nunito';
  x.fillText(d.nombre || "", 44, 116, 540);
  // foto con marco plateado
  const [ax, ay, aw, ah] = ART;
  g = x.createLinearGradient(44, 132, 636, 492); g.addColorStop(0, "#c9c9c9"); g.addColorStop(.5, "#fff"); g.addColorStop(1, "#9a9a9a");
  x.fillStyle = g; x.fillRect(ax - 8, ay - 8, aw + 16, ah + 16);
  g = x.createRadialGradient(340, 312, 10, 340, 312, 330); g.addColorStop(0, arte[0]); g.addColorStop(1, arte[1]);
  x.fillStyle = g; x.fillRect(ax, ay, aw, ah);
  if (img) x.drawImage(img, ...encuadre(img, d.foco, d.zoom), ax, ay, aw, ah);
  // franja del color del producto
  g = x.createLinearGradient(44, 0, 636, 0); g.addColorStop(0, arte[1]); g.addColorStop(.5, arte[0]); g.addColorStop(1, arte[1]);
  rrect(x, 44, 500, 592, 30, 6); x.fillStyle = g; x.fill();
  x.textAlign = "center"; x.fillStyle = "#fff"; x.font = '800 18px Nunito';
  x.fillText(d.franja || "", 340, 521, 576);
  // features (una o dos)
  const ataques = (d.ataques || []).filter(a => a && (a.nombre || a.texto)).slice(0, 2);
  const ataque = (y, a, n) => {
    const coste = Math.min(3, Math.max(0, a.coste ?? 1));
    for (let i = 0; i < coste; i++) energia(x, 64 + i * 38, y - 10, 17, d.tipo);
    const tx = 64 + Math.max(coste, .4) * 38 - (coste ? 0 : 14);
    x.textAlign = "left"; x.font = '900 32px Nunito'; x.fillStyle = "#1a1a2e";
    const dano = String(a.dano ?? "");
    x.textAlign = "right"; x.fillText(dano, 636, y);
    const dW = dano ? x.measureText(dano).width + 14 : 0;
    x.textAlign = "left"; x.fillText(a.nombre || "", tx, y, 636 - tx - dW);
    x.font = '600 23px Nunito';
    lineas(x, a.texto, 636 - tx, n).forEach((l, i) => x.fillText(l, tx, y + 36 + i * 28));
  };
  if (ataques.length === 1) ataque(600, ataques[0], 4);
  else if (ataques.length === 2) {
    ataque(578, ataques[0], 2);
    x.fillStyle = "rgba(0,0,0,.2)"; x.fillRect(44, 668, 592, 3);
    ataque(714, ataques[1], 2);
  }
  // pie: cómo probarlo y número de colección
  x.textAlign = "left"; x.font = 'italic 700 20px Nunito'; x.fillStyle = "rgba(26,26,46,.85)";
  const pie = lineas(x, d.pie, 440, 2);
  pie.forEach((l, i) => x.fillText(l, 44, 902 - (pie.length - 1 - i) * 24));
  if (o.num) {
    x.textAlign = "right"; x.font = '800 20px Nunito'; x.fillStyle = "#1a1a2e";
    x.fillText(`${String(o.num).padStart(3, "0")}/${String(o.total || o.num).padStart(3, "0")} ${RAREZAS[rz].estrellas}`, 636, 902);
  }
}

// la foto del hueco con su margen de paralaje (el mismo encuadre que en la carta, agrandado por cada lado; donde la foto
// no llega queda el fondo de la ilustración). escala: píxeles por unidad de diseño.
// Devuelve cuánto se puede desplazar hacia cada lado sin salirse de la foto [izq, der, abajo, arriba] (en la textura)
export function drawFoto(c, d, img, escala){
  const [, , aw, ah] = ART, k = 1 + 2 * PARALAJE, cw = Math.round(aw * k * escala), ch = Math.round(ah * k * escala);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const x = c.getContext("2d"), t = TIPOS[d.tipo] || TIPOS.normal, arte = d.colores?.arte || t.c;
  const g = x.createRadialGradient(cw / 2, ch / 2, 10, cw / 2, ch / 2, cw * .6); g.addColorStop(0, arte[0]); g.addColorStop(1, arte[1]);
  x.fillStyle = g; x.fillRect(0, 0, cw, ch);
  if (!img) return [0, 0, 0, 0];
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const [sx, sy, sw, sh] = encuadre(img, d.foco, d.zoom), ex = sw * PARALAJE, ey = sh * PARALAJE;
  const X0 = sx - ex, Y0 = sy - ey, WW = sw + 2 * ex, HH = sh + 2 * ey; // lo que se quiere (puede salirse de la foto)
  const a = Math.max(0, X0), b = Math.max(0, Y0), a2 = Math.min(iw, X0 + WW), b2 = Math.min(ih, Y0 + HH);
  if (a2 > a && b2 > b) x.drawImage(img, a, b, a2 - a, b2 - b, (a - X0) / WW * cw, (b - Y0) / HH * ch, (a2 - a) / WW * cw, (b2 - b) / HH * ch);
  const m = (v, t) => Math.max(0, v - 1) / t; // un píxel de holgura
  return [m(sx - a, WW), m(a2 - sx - sw, WW), m(b2 - sy - sh, HH), m(sy - b, HH)];
}

// la foto se decodifica antes de dibujarla (si no, la decodificación cae dentro del dibujo y es un fotograma largo)
export const cargarFoto = src => new Promise((ok, ko) => {
  const i = new Image(); i.src = src;
  (i.decode ? i.decode() : new Promise((a, b) => { i.onload = a; i.onerror = b; })).then(() => ok(i), ko);
});
