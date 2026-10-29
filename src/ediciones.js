/* Pack editions (public/ediciones.json): each with its pack, its card back, the texts of the final screen
   and its cards. normalizar() shapes it the way texturas.js draws it and main.js uses it. */

// Press Start 2P has no accented letters: pixel-font texts go in uppercase without accents
export const pixel = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export const FOIL = ["#ffde3b", "#ff9f1c", "#e3350d", "#7b1fa2", "#2a2a8f"];
export const REVERSO = ["#12141f", "#3d5bd9", "#141c66"];

export function normalizar(e){
  const s = e.sobre || {}, r = e.reverso || {}, f = e.fiesta || {}, m = [].concat(s.mensaje || []);
  const foil = s.colores?.length > 1 ? s.colores : FOIL;
  return {
    id: e.id, nombre: e.nombre || e.id, icon: e.icono || "🎴",
    titulo: s.titulo || "", corto: pixel(s.corto), etiqueta: s.etiqueta ? `* ${pixel(s.etiqueta)} *` : "",
    l1: m[0] || "", l2: m[1] || "", dorso: pixel(s.dorso),
    foil: foil.map((c, i) => [c, i / (foil.length - 1)]),
    reverso: r.colores?.length === 3 ? r.colores : REVERSO, numero: r.texto ? `* ${pixel(r.texto)} *` : "",
    nota: f.nota || "", boton: f.boton || "↺ Open another pack",
    // cards per pack (at most as many as there are)
    porSobre: Math.max(1, Math.min(e.cartasPorSobre || 1, (e.cartas || []).length || 1)),
    // every card needs a stable id: it's what the seen-cards history remembers
    cartas: (e.cartas || []).map((c, i) => c.id ? c : {...c, id: "c" + (i + 1)}),
  };
}
