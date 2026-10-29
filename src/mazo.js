/* Which cards each pack holds. For each edition, localStorage keeps how many times each card has come out:
   cards already seen weigh much less than new ones (and the previous pack's cards don't repeat back to back), so by
   playing you end up seeing them all. Rarity weighs too: a rare comes out half as often as a common, a special a quarter.
   Once every card has come out, the odds start over. Drawn cards stay pending until the pack is opened:
   reloading the page doesn't change them. */
import { RAREZAS, rareza } from "./carta.js";

const PESO_VISTA = .05; // a seen card comes out 20 times less often than a new one (and less the more times it has come out)

const clave = ed => "mazo:" + ed.id;
const lista = v => v == null ? [] : [].concat(v); // a single card (string) used to be stored; now, the pack's list
function historial(ed){
  let h = null;
  try { h = JSON.parse(localStorage.getItem(clave(ed))); } catch (e) {}
  h = {vistas: {}, coleccion: [], ultima: null, pendiente: null, ...h};
  h.ultima = lista(h.ultima); h.pendiente = lista(h.pendiente);
  return h;
}
function guardar(ed, h){ try { localStorage.setItem(clave(ed), JSON.stringify(h)); } catch (e) {} }

// [{d, num, total}] with the cards of the edition's next pack (ed.porSobre, all different), or [] if it has no cards
export function sobrePendiente(ed){
  const ids = ed.cartas.map(c => c.id), n = Math.min(ed.porSobre || 1, ids.length);
  if (!n) return [];
  const h = historial(ed);
  let sobre = h.pendiente.filter(i => ids.includes(i));
  if (sobre.length !== n || new Set(sobre).size !== n) {
    if (ids.every(i => h.vistas[i])) h.vistas = {}; // all of them have come out: start over
    // the previous pack's cards don't repeat, if there are enough others left to fill this one
    const evitar = new Set(ids.length - h.ultima.length >= n ? h.ultima : []);
    const rz = id => RAREZAS[rareza(ed.cartas[ids.indexOf(id)])].peso;
    const peso = i => sobre.includes(i) || evitar.has(i) ? 0 : (h.vistas[i] ? PESO_VISTA / h.vistas[i] : 1) * rz(i);
    sobre = [];
    while (sobre.length < n) {
      let r = Math.random() * ids.reduce((s, i) => s + peso(i), 0);
      const id = ids.find(i => peso(i) > 0 && (r -= peso(i)) < 0) || ids.find(i => peso(i) > 0) || ids.find(i => !sobre.includes(i));
      sobre.push(id);
    }
    // rarest last: the pack saves the best for the last card
    const orden = Object.keys(RAREZAS);
    sobre.sort((a, b) => orden.indexOf(rareza(ed.cartas[ids.indexOf(a)])) - orden.indexOf(rareza(ed.cartas[ids.indexOf(b)])));
    h.pendiente = sobre;
    guardar(ed, h);
  }
  return sobre.map(id => { const k = ids.indexOf(id); return {d: ed.cartas[k], num: k + 1, total: ids.length}; });
}

// the pack has been opened: its cards go into the seen list. Marks on each card whether it's new (k.nueva)
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
