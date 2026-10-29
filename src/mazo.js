/* Qué cartas trae cada sobre. Por edición se guarda en localStorage cuántas veces ha salido cada carta:
   las ya vistas pesan mucho menos que las nuevas (y las del sobre anterior no repiten seguidas), así que jugando se
   acaban viendo todas. La rareza también pesa: una rara sale la mitad que una común y una especial, la cuarta parte.
   Cuando ya han salido todas, las probabilidades vuelven a empezar. Las cartas sorteadas quedan pendientes hasta que se
   abre el sobre: recargar la página no las cambia. */
import { RAREZAS, rareza } from "./carta.js";

const PESO_VISTA = .05; // una carta vista sale 20 veces menos que una nueva (y menos aún cuantas más veces haya salido)

const clave = ed => "mazo:" + ed.id;
const lista = v => v == null ? [] : [].concat(v); // antes se guardaba una sola carta (texto); ahora, la lista del sobre
function historial(ed){
  let h = null;
  try { h = JSON.parse(localStorage.getItem(clave(ed))); } catch (e) {}
  h = {vistas: {}, coleccion: [], ultima: null, pendiente: null, ...h};
  h.ultima = lista(h.ultima); h.pendiente = lista(h.pendiente);
  return h;
}
function guardar(ed, h){ try { localStorage.setItem(clave(ed), JSON.stringify(h)); } catch (e) {} }

// [{d, num, total}] con las cartas del próximo sobre de la edición (ed.porSobre, distintas), o [] si no tiene cartas
export function sobrePendiente(ed){
  const ids = ed.cartas.map(c => c.id), n = Math.min(ed.porSobre || 1, ids.length);
  if (!n) return [];
  const h = historial(ed);
  let sobre = h.pendiente.filter(i => ids.includes(i));
  if (sobre.length !== n || new Set(sobre).size !== n) {
    if (ids.every(i => h.vistas[i])) h.vistas = {}; // ya han salido todas: vuelta a empezar
    // las del sobre anterior no repiten, si quedan bastantes otras para llenar este
    const evitar = new Set(ids.length - h.ultima.length >= n ? h.ultima : []);
    const rz = id => RAREZAS[rareza(ed.cartas[ids.indexOf(id)])].peso;
    const peso = i => sobre.includes(i) || evitar.has(i) ? 0 : (h.vistas[i] ? PESO_VISTA / h.vistas[i] : 1) * rz(i);
    sobre = [];
    while (sobre.length < n) {
      let r = Math.random() * ids.reduce((s, i) => s + peso(i), 0);
      const id = ids.find(i => peso(i) > 0 && (r -= peso(i)) < 0) || ids.find(i => peso(i) > 0) || ids.find(i => !sobre.includes(i));
      sobre.push(id);
    }
    // la más rara al final: el sobre se guarda lo mejor para la última carta
    const orden = Object.keys(RAREZAS);
    sobre.sort((a, b) => orden.indexOf(rareza(ed.cartas[ids.indexOf(a)])) - orden.indexOf(rareza(ed.cartas[ids.indexOf(b)])));
    h.pendiente = sobre;
    guardar(ed, h);
  }
  return sobre.map(id => { const k = ids.indexOf(id); return {d: ed.cartas[k], num: k + 1, total: ids.length}; });
}

// se ha abierto el sobre: sus cartas pasan a la colección. Marca en cada carta si es nueva (k.nueva)
export function sobreAbierto(ed, cartas){
  const h = historial(ed);
  for (const k of cartas) {
    const id = k.d.id;
    k.nueva = !h.coleccion.includes(id);
    h.vistas[id] = (h.vistas[id] || 0) + 1;
    if (k.nueva) h.coleccion.push(id);
  }
  h.ultima = cartas.map(k => k.d.id); h.pendiente = [];
  guardar(ed, h);
  return cartas.some(k => k.nueva);
}

// empezar de cero: borra el historial de todas las ediciones (colección, veces vistas y cartas pendientes)
export function borrarHistoriales(){
  try { Object.keys(localStorage).filter(k => k.startsWith("mazo:")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
}

// ids de las cartas de la edición que se han visto alguna vez (no se reinicia: es la colección)
export function desbloqueadas(ed){
  const ids = new Set(ed.cartas.map(c => c.id));
  return new Set(historial(ed).coleccion.filter(i => ids.has(i)));
}
export const coleccion = ed => desbloqueadas(ed).size;
