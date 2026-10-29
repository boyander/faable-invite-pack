/* ===== SONIDO: todo sintetizado; arranca con el primer toque (política de autoplay) ===== */
const MUSIC_VOL = .32;
export let muted = false;
try { muted = localStorage.getItem("muted") === "1"; } catch (e) {}
let actx, master, sfxBus, musicBus, noiseBuf;
export function audio(){
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
      sfxBus = actx.createGain(); sfxBus.connect(master);
      musicBus = actx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
      noiseBuf = actx.createBuffer(1, actx.sampleRate * .5 | 0, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (actx.state === "suspended" && !inBackground) actx.resume(); // nunca reanudar con la app en segundo plano
  } catch (e) { actx = null; }
  return actx;
}
export const hz = m => 440 * 2 ** ((m - 69) / 12);
function note(freq, t, dur, type, vol, bus, slideTo){
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + .02);
}
export function noise(t, dur, vol, type, freq, bus, q = .7){
  const src = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  src.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  src.connect(f).connect(g).connect(bus); src.start(t, Math.random() * .4, dur + .02);
}
export function tone(freq, at = 0, dur = .12, type = "square", vol = .06, slideTo){
  const a = audio(); if (!a) return;
  note(freq, a.currentTime + at, dur, type, vol, sfxBus, slideTo);
}
export function ripSound(vol, len = .07){ // ruido filtrado = papel rasgándose
  const a = audio(); if (!a) return;
  noise(a.currentTime, len, .35 * vol, "bandpass", 1500 + Math.random() * 2000, sfxBus);
}
export function duck(level, ms){ // baja la música mientras suena una fanfarria
  if (!actx) return;
  musicBus.gain.setTargetAtTime(MUSIC_VOL * level, actx.currentTime, .08);
  setTimeout(() => musicBus.gain.setTargetAtTime(MUSIC_VOL, actx.currentTime, .4), ms);
}
export const SFX = {
  tap(){ tone(1046, 0, .05, "square", .035); },
  whoosh(){ const a = audio(); if (!a) return; noise(a.currentTime, .35, .12, "bandpass", 900, sfxBus, 1.5); },
  sparkle(){ for (let i = 0; i < 4; i++) tone(1568 * 2 ** (Math.random() * .8), i * .05, .12, "sine", .05); },
  thud(){ tone(160, 0, .18, "sine", .25, 60); },
  powerUp(){ [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone(hz(m), i * .045, .1, "square", .04)); },
  fail(){ duck(.15, 2200); [67, 63, 60, 55].forEach((m, i) => tone(hz(m), i * .28, .32, "triangle", .12)); tone(hz(43), 1.12, .7, "sawtooth", .05, hz(36)); },
  // la carta boca abajo brilla con su rareza: un murmullo de campanillas que sube (más largo y alto si es especial)
  presagio(especial){ const n = especial ? 12 : 7; for (let i = 0; i < n; i++) tone(hz(76 + i * (especial ? 2 : 1.5)), i * .06, .3, "sine", .035); },
  rara(){ // carta rara: dos acordes plateados y campanillas
    [[76, 0], [79, 0], [83, 0], [78, .16], [81, .16], [86, .16]].forEach(([m, at]) => tone(hz(m), at, .55, "triangle", .05));
    for (let i = 0; i < 6; i++) tone(hz(96 + (i % 3) * 3), .3 + i * .06, .2, "sine", .03);
  },
  shimmer(){ for (let i = 0; i < 14; i++) tone(hz(72 + i * 2), i * .035, .18, "triangle", .05); this.whoosh(); },
  fanfare(){ // fanfarria propia: arpegio ascendente y acorde final
    duck(.2, 3200);
    [[67,0,.1],[72,.1,.1],[76,.2,.1],[79,.3,.3],[77,.62,.1],[79,.72,.1],[81,.82,.3],[79,1.14,.1],[84,1.24,1]]
      .forEach(([m, at, d]) => { tone(hz(m), at, d, "square", .07); tone(hz(m - 12), at, d, "triangle", .1); });
  },
  legendario(){ // carta especial: golpe grave, barrido que sube, acorde épico que crece, metales y campanillas
    const a = audio(); if (!a) return;
    duck(.1, 3800);
    const t = a.currentTime;
    note(110, t, .9, "sine", .5, sfxBus, 38);
    noise(t, .5, .25, "lowpass", 300, sfxBus);
    for (let i = 0; i < 8; i++) noise(t + .05 + i * .055, .12, .05, "bandpass", 600 * 1.35 ** i, sfxBus, 2);
    // acorde de Re mayor con sierras desafinadas que se abren (filtro) y crecen despacio
    const pad = (m, at, dur, vol) => {
      for (const det of [-8, 8]) {
        const o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), s0 = t + at;
        o.type = "sawtooth"; o.frequency.value = hz(m); o.detune.value = det;
        f.type = "lowpass"; f.frequency.setValueAtTime(700, s0); f.frequency.linearRampToValueAtTime(3400, s0 + dur * .6);
        g.gain.setValueAtTime(.0001, s0); g.gain.exponentialRampToValueAtTime(vol, s0 + .35);
        g.gain.setValueAtTime(vol, s0 + dur - .7); g.gain.exponentialRampToValueAtTime(.0001, s0 + dur);
        o.connect(f).connect(g).connect(sfxBus); o.start(s0); o.stop(s0 + dur + .05);
      }
    };
    [50, 62, 66, 69, 74].forEach(m => pad(m, .4, 2.6, .03));
    [[74, .42, .16], [78, .6, .16], [81, .78, .16], [86, .96, 1.1]].forEach(([m, at, d]) => {
      note(hz(m), t + at, d, "square", .06, sfxBus); note(hz(m - 12), t + at, d, "triangle", .09, sfxBus);
    });
    for (let i = 0; i < 12; i++) note(hz(86 + [0, 4, 7, 12][i % 4]), t + 1.15 + i * .07, .7, "sine", .045, sfxBus);
  },
};

/* música de fondo: bucle chiptune original en Do mayor (I–V–vi–IV y puente) */
const MELODY = [
  72,76,79,76, 77,76,74,72,  74,0,71,74, 79,0,77,76,  76,72,69,72, 76,79,81,79,  77,76,74,72, 74,0,72,0,
  77,77,81,77, 76,76,79,76,  74,74,77,74, 72,74,76,79,  79,76,72,76, 79,84,79,76,  74,71,67,71, 74,0,0,0,
];
const BASS = [48, 43, 45, 41, 41, 43, 48, 43];
const STEP = 60 / 138 / 2; // corcheas a 138 bpm
let musicOn = false, musicT = 0, musicStep = 0;
export function startMusic(){
  const a = audio(); if (!a || musicOn) return;
  musicOn = true; musicT = a.currentTime + .1; musicStep = 0;
  setInterval(() => {
    while (musicT < actx.currentTime + .2) {
      const s = musicStep, t = musicT, m = MELODY[s], root = BASS[s >> 3];
      if (m) { note(hz(m), t, STEP * .85, "square", .09, musicBus); note(hz(m + 12), t, STEP * .5, "triangle", .03, musicBus); }
      note(hz(s % 2 ? root + 12 : root), t, STEP * .8, "triangle", .22, musicBus);
      if (s % 4 === 0) note(150, t, .12, "sine", .35, musicBus, 40);           // bombo
      if (s % 8 === 4) noise(t, .1, .12, "bandpass", 2000, musicBus);         // caja
      if (s % 2 === 1) noise(t, .03, .05, "highpass", 7000, musicBus);        // charles
      musicStep = (s + 1) % MELODY.length; musicT += STEP;
    }
  }, 25);
}
// iOS: que el sonido salga aunque el interruptor de silencio esté activado
try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
document.addEventListener("click", startMusic, {once: true});
// en móvil, al salir de la app no siempre llega visibilitychange (navegadores dentro de WhatsApp, etc.): se escuchan todos
let inBackground = false;
function setBackground(bg){
  inBackground = bg;
  if (!actx) return;
  if (bg) { master.gain.setValueAtTime(0, actx.currentTime); actx.suspend(); }
  else { actx.resume(); master.gain.setTargetAtTime(muted ? 0 : 1, actx.currentTime, .1); }
}
document.addEventListener("visibilitychange", () => setBackground(document.hidden));
addEventListener("pagehide", () => setBackground(true));
addEventListener("pageshow", () => setBackground(document.hidden));
addEventListener("blur", () => setBackground(true));
addEventListener("focus", () => setBackground(false));
document.addEventListener("freeze", () => setBackground(true));
export function setMuted(m){
  muted = m;
  try { localStorage.setItem("muted", m ? "1" : "0"); } catch (e) {}
  if (actx) master.gain.setTargetAtTime(m ? 0 : 1, actx.currentTime, .05);
}
