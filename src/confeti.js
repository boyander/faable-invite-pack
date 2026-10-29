const $ = s => document.querySelector(s);

/* ===== CONFETI ===== */
const cv = $("#confetti"), ctx = cv.getContext("2d");
let parts = [], running = false, dpr = 1;
function size(){ dpr = Math.min(1.5, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
addEventListener("resize", size); size();
cv.hidden = true;
const COLORS = ["#ffcb05","#e3350d","#2a75bb","#ffffff","#2ecc71","#ff6ec7","#7ff3ff"];
// con el sobre o la carta 3D a la vista, el confeti lo dibuja la GPU en el mismo lienzo (main.js pone el motor);
// si no (pantallas del quiz, sin WebGL), este canvas 2D
let motor3D = null;
export function usarConfeti3D(fn){ motor3D = fn; }
export function spawn(x, y, n, spread, dir = -Math.PI / 2, v0 = 7, vr = 11){
  if (motor3D && motor3D(x, y, n, spread, dir, v0, vr)) return;
  for (let i = 0; i < n; i++) {
    const a = dir + (Math.random() - .5) * spread;
    const v = v0 + Math.random() * vr;
    parts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      w: 6 + Math.random() * 7, h: 8 + Math.random() * 10,
      r: Math.random() * 6, vr: (Math.random() - .5) * .35,
      c: COLORS[Math.random() * COLORS.length | 0],
      shape: Math.random() < .1 ? "star" : Math.random() < .3 ? "circle" : "rect",
      life: 0, max: 160 + Math.random() * 80,
    });
  }
  if (!running) { running = true; cv.hidden = false; lastTick = performance.now(); requestAnimationFrame(tick); }
}
export function confettiBurst(x, y, n){
  if (x !== undefined) { spawn(x, y, n, Math.PI * 1.2); return; }
  const W = innerWidth, H = innerHeight;
  spawn(W * .5, H * .45, 70, Math.PI * 1.6);
  setTimeout(() => { spawn(0, H * .85, 45, .6, -Math.PI / 3); spawn(W, H * .85, 45, .6, -Math.PI * 2 / 3); }, 250);
  let rain = 0;
  // lluvia lenta desde arriba
  const iv = setInterval(() => { spawn(Math.random() * W, -20, 5, .6, Math.PI / 2, 2, 3); if (++rain > 19) clearInterval(iv); }, 110);
}
function star(r){
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * .45 : r, a = i * Math.PI / 5 - Math.PI / 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}
// barato a propósito: sin save/restore (una transformación directa por pieza), sin listas nuevas por fotograma
// y física por tiempo real (en pantallas de 120 Hz iba al doble de velocidad)
let lastTick = 0;
function tick(now){
  const dt = Math.min(3, (now - lastTick) / 16.67); lastTick = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  let n = 0;
  for (const p of parts) {
    p.life += dt;
    if (p.life >= p.max || p.y > innerHeight + 40) continue;
    parts[n++] = p;
    const drag = .985 ** dt;
    p.vx *= drag; p.vy = p.vy * drag + .28 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
    const c = Math.cos(p.r) * dpr, s = Math.sin(p.r) * dpr;
    ctx.setTransform(c, s, -s, c, p.x * dpr, p.y * dpr);
    ctx.globalAlpha = Math.min(1, (p.max - p.life) / 30);
    ctx.fillStyle = p.c;
    if (p.shape === "star") star(p.w);
    else if (p.shape === "circle") { ctx.beginPath(); ctx.arc(0, 0, p.w * .5, 0, 7); ctx.fill(); }
    else { const fl = Math.cos(p.life * .15); ctx.fillRect(-p.w / 2, -p.h / 2 * fl, p.w, p.h * fl); }
  }
  parts.length = n;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  // vacío, fuera de la composición: un lienzo transparente a pantalla completa también cuesta en el móvil
  if (n) requestAnimationFrame(tick); else { running = false; ctx.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
}

