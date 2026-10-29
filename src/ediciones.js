/* Ediciones de sobre (public/ediciones.json): cada una con su sobre, el reverso de sus cartas, los textos de la pantalla
   final y sus cartas. normalizar() la deja como la dibujan texturas.js y la usa main.js. */

// Press Start 2P no tiene tildes ni eñes: los textos pixelados van en mayúsculas sin acentos
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
    nota: f.nota || "", boton: f.boton || "↺ Abrir otro sobre",
    // cartas que trae cada sobre (las que haya, como mucho)
    porSobre: Math.max(1, Math.min(e.cartasPorSobre || 1, (e.cartas || []).length || 1)),
    // cada carta necesita un id estable: es lo que recuerda el historial de cartas vistas
    cartas: (e.cartas || []).map((c, i) => c.id ? c : {...c, id: "c" + (i + 1)}),
  };
}
