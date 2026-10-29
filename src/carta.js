/* Card layout (680×950 design units): photo or illustration, texts and colors of each card in ediciones.json.
   Used by the 3D pack (texture) and the fallback HTML card. */

export const W = 680, H = 950;
export const ART = [52, 140, 576, 344]; // photo slot (x, y, width, height)
// the same area including its frame, in texture coordinates (u0, v0, u1, v1): where the 3D card's holo goes
export const ART_UV = [44 / W, 1 - 492 / H, 636 / W, 1 - 132 / H];
// parallax (special cards only): in 3D the photo gets its own texture, with PARALAJE of margin on each side, and the shader shifts it
// depending on where the card is viewed from (it looks sunk behind the frame). FOTO_UV: the photo slot in texture coordinates
export const PARALAJE = .12;
export const FOTO_UV = [52 / W, 1 - 484 / H, 628 / W, 1 - 140 / H];

const P = d => new Path2D(d);
// icon of each product, drawn in a 24×24 box
export const TIPOS = {
  deploy: {nombre: "Deploy", c: ["#7ad3ff", "#1e6fd8"], bg: ["#eef7ff", "#c9e4ff"], icon: P("M12 2l7 8h-4v6H9v-6H5z M5 18h14v3H5z")},
  auth:   {nombre: "Auth",   c: ["#d9a6ff", "#7a2bd8"], bg: ["#f7efff", "#e2ccff"], icon: P("M7 7a5 5 0 1 0 4.6 7H15v3h3v-3h4v-4H11.6A5 5 0 0 0 7 7zm0 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z")},
  cli:    {nombre: "CLI",    c: ["#8ff0b4", "#16935a"], bg: ["#eefcf3", "#c4f0d6"], icon: P("M2 4h20v16H2z M5 8l4 4-4 4 1.4 1.4L11.8 12 6.4 6.6z M12 16h7v2h-7z")},
  shield: {nombre: "Edge",   c: ["#ffc98a", "#e0661a"], bg: ["#fff5ea", "#ffdcb8"], icon: P("M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z")},
  normal: {nombre: "Faable", c: ["#e6e6e6", "#8a8fa8"], bg: ["#f4f5fb", "#dde0ee"], icon: P("M12 2l3 7 7 .6-5.3 4.6 1.6 7.1L12 17.6 5.7 21.3l1.6-7.1L2 9.6 9 9z")},
};

// rarity of each card: weight in the draw (mazo.js), stars next to the number and, in 3D, frame (uBorde: silver or
// holo), aura tint (gold or silver base and how much rainbow) and card-back glow before flipping it.
// In ediciones.json it goes in "rareza" ("rara" or "especial"; no field means common); "especial": true is the old format
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

// splits the text into lines that fit in `max` (keeping line breaks); if it doesn't fit in `n`, the last one ends in "…"
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

// "cover" crop of the photo centered on `foco` (0..1) with `zoom` ≥ 1
export function encuadre(img, foco = [.5, .4], zoom = 1){
  const [, , aw, ah] = ART, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const sc = Math.max(aw / iw, ah / ih) * Math.max(1, zoom || 1), sw = aw / sc, sh = ah / sc;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  return [cl(foco[0] * iw - sw / 2, 0, iw - sw), cl(foco[1] * ih - sh / 2, 0, ih - sh), sw, sh];
}
// the focus actually visible: if the photo has no slack on an axis, the focus can't move on that axis
export function focoVisible(img, foco, zoom){
  const [sx, sy, sw, sh] = encuadre(img, foco, zoom), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const r = v => Math.round(v * 1000) / 1000;
  return [r((sx + sw / 2) / iw), r((sy + sh / 2) / ih)];
}

/* draws card `d` on canvas `c`. o: {num, total, scale} */
export function drawCarta(c, d, img, o = {}){
  const s = o.scale || 1;
  c.width = Math.round(W * s); c.height = Math.round(H * s);
  const x = c.getContext("2d"); x.setTransform(s, 0, 0, s, 0, 0);
  const t = TIPOS[d.tipo] || TIPOS.normal, col = d.colores || {};
  const fondo = col.fondo || t.bg, arte = col.arte || t.c; // the card's own colors, if it has any
  // yellow frame, silver if rare or rainbow foil if special (in 3D they also shift with the tilt)
  // and a background in the type's color
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
  // header: product, name and product icon
  x.textAlign = "left"; x.font = '900 18px Nunito';
  const fase = String(d.fase || "Faable").toUpperCase(), pill = x.measureText(fase).width + 20;
  g = x.createLinearGradient(0, 44, 0, 72); g.addColorStop(0, arte[0]); g.addColorStop(1, arte[1]);
  rrect(x, 44, 44, pill, 28, 8); x.fillStyle = g; x.fill();
  x.fillStyle = "#fff"; x.fillText(fase, 54, 65);
  energia(x, 612, 100, 22, d.tipo);
  x.fillStyle = "#1a1a2e"; x.font = '900 42px Nunito';
  x.fillText(d.nombre || "", 44, 116, 540);
  // photo with a silver frame
  const [ax, ay, aw, ah] = ART;
  g = x.createLinearGradient(44, 132, 636, 492); g.addColorStop(0, "#c9c9c9"); g.addColorStop(.5, "#fff"); g.addColorStop(1, "#9a9a9a");
  x.fillStyle = g; x.fillRect(ax - 8, ay - 8, aw + 16, ah + 16);
  g = x.createRadialGradient(340, 312, 10, 340, 312, 330); g.addColorStop(0, arte[0]); g.addColorStop(1, arte[1]);
  x.fillStyle = g; x.fillRect(ax, ay, aw, ah);
  if (img) x.drawImage(img, ...encuadre(img, d.foco, d.zoom), ax, ay, aw, ah);
  // band in the product's color
  g = x.createLinearGradient(44, 0, 636, 0); g.addColorStop(0, arte[1]); g.addColorStop(.5, arte[0]); g.addColorStop(1, arte[1]);
  rrect(x, 44, 500, 592, 30, 6); x.fillStyle = g; x.fill();
  x.textAlign = "center"; x.fillStyle = "#fff"; x.font = '800 18px Nunito';
  x.fillText(d.franja || "", 340, 521, 576);
  // features (one or two)
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
  // footer: how to try it and the card number
  x.textAlign = "left"; x.font = 'italic 700 20px Nunito'; x.fillStyle = "rgba(26,26,46,.85)";
  const pie = lineas(x, d.pie, 440, 2);
  pie.forEach((l, i) => x.fillText(l, 44, 902 - (pie.length - 1 - i) * 24));
  if (o.num) {
    x.textAlign = "right"; x.font = '800 20px Nunito'; x.fillStyle = "#1a1a2e";
    x.fillText(`${String(o.num).padStart(3, "0")}/${String(o.total || o.num).padStart(3, "0")} ${RAREZAS[rz].estrellas}`, 636, 902);
  }
}

// the slot's photo with its parallax margin (same framing as on the card, enlarged on each side; where the photo
// doesn't reach, the illustration background shows). escala: pixels per design unit.
// Returns how far it can shift to each side without leaving the photo [left, right, bottom, top] (in the texture)
export function drawFoto(c, d, img, escala){
  const [, , aw, ah] = ART, k = 1 + 2 * PARALAJE, cw = Math.round(aw * k * escala), ch = Math.round(ah * k * escala);
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const x = c.getContext("2d"), t = TIPOS[d.tipo] || TIPOS.normal, arte = d.colores?.arte || t.c;
  const g = x.createRadialGradient(cw / 2, ch / 2, 10, cw / 2, ch / 2, cw * .6); g.addColorStop(0, arte[0]); g.addColorStop(1, arte[1]);
  x.fillStyle = g; x.fillRect(0, 0, cw, ch);
  if (!img) return [0, 0, 0, 0];
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const [sx, sy, sw, sh] = encuadre(img, d.foco, d.zoom), ex = sw * PARALAJE, ey = sh * PARALAJE;
  const X0 = sx - ex, Y0 = sy - ey, WW = sw + 2 * ex, HH = sh + 2 * ey; // what we want (may go past the photo)
  const a = Math.max(0, X0), b = Math.max(0, Y0), a2 = Math.min(iw, X0 + WW), b2 = Math.min(ih, Y0 + HH);
  if (a2 > a && b2 > b) x.drawImage(img, a, b, a2 - a, b2 - b, (a - X0) / WW * cw, (b - Y0) / HH * ch, (a2 - a) / WW * cw, (b2 - b) / HH * ch);
  const m = (v, t) => Math.max(0, v - 1) / t; // one pixel of slack
  return [m(sx - a, WW), m(a2 - sx - sw, WW), m(b2 - sy - sh, HH), m(sy - b, HH)];
}

// the photo is decoded before drawing it (otherwise decoding happens during the draw and makes a long frame)
export const cargarFoto = src => new Promise((ok, ko) => {
  const i = new Image(); i.src = src;
  (i.decode ? i.decode() : new Promise((a, b) => { i.onload = a; i.onerror = b; })).then(() => ok(i), ko);
});
