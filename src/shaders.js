/* Shaders GLSL del sobre 3D: brillos procedurales, holográfico del sobre y de la carta, rayos de la boca */

// brillos generados en el shader, sin texturas: Safari guarda los canvas premultiplicados y en las zonas casi
// transparentes de un degradado el color se pierde (salían puntitos de colores alrededor de la carta)
export const GLOW_SHAPES = {
  radial: "float d = length(vUv - 0.5) * 2.0; float g = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);",
  line: "float g = exp(-pow((vUv.y - 0.5) * 5.0, 2.0)) * smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));",
  ring: "float d = length(vUv - 0.5) * 2.0; float g = exp(-pow((d - 0.62) * 9.0, 2.0)) + 0.35 * exp(-pow((d - 0.62) * 3.0, 2.0));",
  // destello de estrella: cuatro rayos finos en cruz, otros cuatro más cortos en diagonal y un núcleo
  estrella: `vec2 p = (vUv - 0.5) * 2.0, q = vec2(p.x + p.y, p.x - p.y) * 0.7071;
    float r = length(p), fin = 1.0 - smoothstep(0.55, 1.0, r);
    float g = (exp(-abs(p.x) * 26.0 - abs(p.y) * 2.2) + exp(-abs(p.y) * 26.0 - abs(p.x) * 2.2)) * fin
            + (exp(-abs(q.x) * 30.0 - abs(q.y) * 5.0) + exp(-abs(q.y) * 30.0 - abs(q.x) * 5.0)) * 0.45 * fin
            + pow(max(0.0, 1.0 - r * 2.2), 3.0) * 1.4;`,
};
export const glowFrag = shape => `varying vec2 vUv; uniform vec3 uColor; uniform float uOpacity;
void main(){
  ${GLOW_SHAPES[shape]}
  vec3 c = uColor * clamp(g, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); // alfa = brillo: premultiplicado válido en cualquier navegador
}`;
export const SHADOW_FRAG = `varying vec2 vUv; uniform float uOpacity;
void main(){ float d = length((vUv - 0.5) * 2.0); gl_FragColor = vec4(0.0, 0.0, 0.0, pow(clamp(1.0 - d, 0.0, 1.0), 1.6) * uOpacity); }`;

// holográfico: arcoíris que cambia con el ángulo de visión, sobre una veta de lámina, y un barrido de brillo
export const HOLO_HEAD = `
uniform float uTime; uniform float uTilt; uniform float uHolo;`;
export const HOLO_BODY = `
{
  vec3 V = normalize(vViewPosition);
  float ndv = clamp(dot(normalize(normal), V), 0.0, 1.0);
  float band = vMapUv.x * 1.2 + vMapUv.y * 2.3 + (1.0 - ndv) * 3.5 + uTilt * 1.5;
  vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (band + vec3(0.0, 0.33, 0.67)));
  // veta fina de lámina holográfica (ondas, no puntos) que desplaza el arcoíris
  float grain = sin(vMapUv.x * 46.0 + vMapUv.y * 21.0) * sin(vMapUv.y * 58.0 - vMapUv.x * 17.0);
  rainbow = 0.5 + 0.5 * cos(6.2832 * (band + grain * 0.12 + vec3(0.0, 0.33, 0.67)));
  float holo = uHolo * (0.2 + 0.8 * (1.0 - ndv)) * (0.8 + 0.2 * grain);
  // barrido de brillo diagonal que sigue la inclinación del sobre
  float sweep = exp(-pow((vMapUv.x * 0.8 + vMapUv.y * 0.6 - 0.7 - uTilt * 0.35) * 5.0, 2.0));
  totalEmissiveRadiance += diffuseColor.rgb * rainbow * holo * 0.5 + vec3(1.0, 0.95, 0.85) * sweep * 0.18 * uHolo;
}`;
// carta: barrido de brillo que sigue la inclinación y arcoíris holográfico solo sobre la ilustración (como las cartas holo)
// uBorde: marco de la rareza, plateado (0.5, rara) u holográfico (1, especial: arcoíris que se mueve con la inclinación)
// uDestello: luz blanca que inunda la cara y una franja que la cruza (revelación de una carta especial)
// uFoto: la foto con margen (paralaje), en el hueco uFotoRect, desplazada uParal; uFotoOn: si la carta tiene foto
export const CARD_HEAD = `uniform float uTilt; uniform vec4 uArt; uniform float uArtOn; uniform float uBorde; uniform float uDestello;
uniform sampler2D uFoto; uniform float uFotoOn; uniform vec4 uFotoRect; uniform vec2 uParal; uniform float uMargen; uniform vec4 uLimite;`;
export const CARD_BODY = `
{
  vec2 q = vMapUv;
  // paralaje: dentro del hueco, la foto sale de su propia textura (más grande que el hueco) y se desplaza con el ángulo
  vec2 wf = (q - uFotoRect.xy) / (uFotoRect.zw - uFotoRect.xy);
  if (uFotoOn > 0.5 && wf.x >= 0.0 && wf.x <= 1.0 && wf.y >= 0.0 && wf.y <= 1.0)
    // (sin pasarse de la foto que hay de verdad por cada lado: uLimite = izquierda, derecha, abajo, arriba)
    diffuseColor.rgb = texture2D(uFoto, (wf - 0.5) / (1.0 + 2.0 * uMargen) + 0.5
      + clamp(uParal, vec2(-uLimite.x, -uLimite.z), vec2(uLimite.y, uLimite.w))).rgb;
  float inArt = uArtOn * step(uArt.x, q.x) * step(q.x, uArt.z) * step(uArt.y, q.y) * step(q.y, uArt.w);
  float grain = sin(q.x * 26.0 + q.y * 12.0) * sin(q.y * 31.0 - q.x * 9.0);
  vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (q.x * 1.6 + q.y * 1.1 + uTilt * 1.8 + grain * 0.06 + vec3(0.0, 0.33, 0.67)));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.7 + rainbow * 0.5, inArt * (0.32 + 0.06 * grain));
  float sweep = exp(-pow((q.x * 0.8 - q.y * 0.6 + 0.3 - uTilt * 0.6) * 4.0, 2.0));
  diffuseColor.rgb += vec3(1.0, 0.97, 0.9) * sweep * 0.2;
  // marco de la carta especial: fuera del panel interior, que es un rectángulo con las esquinas redondeadas
  // (20 unidades de margen y radio 20, sobre 680 × 950); borde suavizado para que no salga en escalón
  vec2 pd = abs(q * vec2(680.0, 950.0) - vec2(340.0, 475.0)) - vec2(300.0, 435.0);
  float dIn = length(max(pd, 0.0)) + min(max(pd.x, pd.y), 0.0) - 20.0;
  float aa = max(fwidth(dIn), 0.001);
  float frame = step(0.01, uBorde) * smoothstep(-aa, aa, dIn);
  vec3 iris = 0.55 + 0.45 * cos(6.2832 * (q.x * 2.2 - q.y * 1.4 + uTilt * 2.6 + grain * 0.15 + vec3(0.0, 0.33, 0.67)));
  float glint = pow(max(0.0, sin(q.x * 70.0 + q.y * 45.0 + uTilt * 9.0)), 24.0);
  // plateado: metal cepillado con reflejos que corren con la inclinación, un poco azulado
  float metal = 0.5 + 0.5 * sin(q.x * 4.0 - q.y * 3.0 + uTilt * 3.2) * sin(q.x * 1.3 + q.y * 2.1 - uTilt * 1.7);
  vec3 plata = vec3(0.68, 0.72, 0.8) + vec3(0.3, 0.29, 0.25) * metal + grain * 0.03;
  vec3 marco = mix(plata + glint * 0.6, iris + glint, step(0.75, uBorde));
  diffuseColor.rgb = mix(diffuseColor.rgb, marco + sweep * 0.5, frame * 0.85);
  float franja = exp(-pow((q.x * 0.7 + q.y * 0.7 - 2.4 + uDestello * 2.6) * 5.0, 2.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(uDestello * (0.55 + 0.6 * franja), 0.0, 0.92));
}`;
// canto de las cartas del montón (y de la de arriba): por cada carta, un hilo amarillo, alma blanca y un toque azulado,
// con una ranura suave entre carta y carta; vZ va de 0 (abajo) a 1 (arriba) y uN es cuántas cartas hay
export const CANTO_VERT = `varying vec3 vN; varying float vZ;
void main(){ vZ = position.z; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// uHueco: parte de cada capa que queda vacía encima de la carta (separación entre cartas del montón)
export const CANTO_FRAG = `uniform float uN; uniform float uHueco; varying vec3 vN; varying float vZ;
void main(){
  float f = fract(vZ * uN - 0.001);
  if (f > 1.0 - uHueco) discard;
  f /= 1.0 - uHueco;
  // canto claro (blanco plateado, como el de las cartas de verdad): un hilo amarillo del marco y ranuras suaves
  vec3 c = f < 0.16 ? vec3(1.0, 0.84, 0.3) : f > 0.9 ? vec3(0.78, 0.82, 0.92) : vec3(0.97, 0.97, 1.0);
  c *= 0.82 + 0.18 * smoothstep(0.0, 0.06, min(f, 1.0 - f));
  float l = 0.86 + 0.28 * max(dot(normalize(vN), normalize(vec3(0.45, 0.6, 0.65))), 0.0);
  gl_FragColor = vec4(c * l, 1.0);
}`;
// rayos de luz que salen de la boca del sobre
export const BEAM_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const BEAM_FRAG = `
varying vec2 vUv; uniform float uTime; uniform float uOpacity;
void main(){
  vec2 p = vUv - vec2(0.5, 0.0);
  float ang = atan(p.x, p.y);
  float r = length(p * vec2(1.0, 0.75));
  float rays = 0.55 + 0.45 * sin(ang * 17.0 + uTime * 1.3) * sin(ang * 6.0 - uTime * 0.9);
  // ojo: smoothstep con los límites al revés es indefinido en GLSL (cada GPU hace una cosa): se invierte con 1.0 - ...
  float fall = (1.0 - smoothstep(0.0, 0.85, r)) * smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.2, 0.62, abs(ang)));
  // núcleo de luz: solo dentro del ancho de la boca (si se sale por los lados deja un borde recto en la línea)
  float core = exp(-pow(p.x * 7.0, 2.0)) * exp(-vUv.y * 3.5) * smoothstep(0.0, 0.04, vUv.y);
  vec3 col = mix(vec3(1.0, 0.82, 0.38), vec3(1.0), core);
  vec3 c = col * (rays * fall * 0.9 + core * 0.8) * uOpacity;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b))); // alfa = brillo: el lienzo transparente se compone bien
}`;

// aura de la carta al salir del sobre: lenguas de energía que ondulan y suben, tono holográfico que gira alrededor del
// contorno sobre base dorada, filo blanco pegado al borde, rayos que giran detrás y chispas que suben titilando.
// Se calcula en la pantalla, alrededor de la silueta que se ve (la carta y el montón, inclinados o no): uPoly es esa
// silueta (envolvente convexa, en píxeles del lienzo, con las esquinas metidas uRad), uEsc el ancho de la carta en píxeles
// y uCentro su centro. Fuera de la silueta solamente (d > 0)
export const AURA_FRAG = `
varying vec2 vUv; uniform float uTime; uniform float uOpacity; uniform float uIris; uniform vec3 uBase;
uniform vec2 uPoly[24]; uniform int uN; uniform float uRad; uniform float uEsc; uniform vec2 uCentro;
float sdPoly(vec2 p){ // distancia con signo a un polígono (negativa dentro)
  float d = dot(p - uPoly[0], p - uPoly[0]), s = 1.0;
  for (int i = 0; i < 24; i++) {
    if (i >= uN) break;
    int j = i == 0 ? uN - 1 : i - 1;
    vec2 e = uPoly[j] - uPoly[i], w = p - uPoly[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= uPoly[i].y, p.y < uPoly[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) s = -s;
  }
  return s * sqrt(d);
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(){
  vec2 p = gl_FragCoord.xy - uCentro;
  float d = (sdPoly(gl_FragCoord.xy) - uRad) / uEsc; // distancia al borde de lo que se ve, en anchos de carta
  float dd = max(d, 0.0);
  float ang = atan(p.y, p.x);
  // lenguas de energía: el alcance del aura ondula con ruido que se desplaza hacia fuera
  // (con la dirección, no con el ángulo: el ángulo salta de +π a -π en el lado izquierdo y el ruido se cortaba ahí)
  vec2 dir = p / max(length(p), 1e-4);
  float flame = noise(dir * 3.0 + vec2(uTime * 0.3, uTime * 1.6 - dd * 4.0)) * 0.65
              + noise(dir * 7.0 - vec2(uTime * 0.5, dd * 7.0 - uTime * 2.3)) * 0.35;
  float body = exp(-dd / (0.07 + 0.17 * flame));
  float edge = exp(-dd * 40.0);
  vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (ang / 6.2832 + uTime * 0.12 + vec3(0.0, 0.33, 0.67)));
  vec3 tint = mix(uBase, rainbow, uIris); // base dorada (plateada en las raras) y más arcoíris en las especiales
  vec3 col = tint * body * (0.45 + 0.75 * flame) + vec3(1.0, 0.97, 0.9) * edge;
  // rayos que giran por detrás
  float rays = pow(max(0.0, sin(ang * 9.0 + uTime * 0.8)), 6.0) + 0.7 * pow(max(0.0, sin(ang * 5.0 - uTime * 0.5)), 10.0);
  col += mix(uBase * vec3(1.0, 1.1, 1.67), rainbow, 0.4) * rays * exp(-dd * 3.4) * 0.5;
  // chispas que suben y titilan
  vec2 g = p / uEsc * 16.0 - vec2(0.0, uTime * 2.2);
  float h = hash(floor(g));
  float tw = 0.5 + 0.5 * sin(uTime * (3.0 + h * 6.0) + h * 40.0);
  float spark = step(0.92, h) * (1.0 - smoothstep(0.0, 0.32, length(fract(g) - 0.5))) * tw * exp(-dd * 3.5);
  col += vec3(1.0, 0.98, 0.92) * spark;
  vec2 e = min(vUv, 1.0 - vUv);
  col *= smoothstep(-0.004, 0.004, d) * smoothstep(0.0, 0.1, min(e.x, e.y)) * uOpacity;
  gl_FragColor = vec4(col, max(col.r, max(col.g, col.b))); // alfa = brillo, como los demás brillos
}`;
// confeti en la GPU (lienzo 3D, cámara ortográfica en píxeles CSS con y hacia abajo): cada pieza calcula su vuelo
// a partir de cuándo y cómo salió (rozamiento lineal K y gravedad G, los del confeti 2D a 60 fps), sin trabajo en la CPU
export const CONF_VERT = `
uniform float uNow;
attribute vec3 aStart; attribute vec2 aVel; attribute vec2 aSize; attribute vec2 aSpin; attribute vec3 aColor; attribute vec2 aShapeLife;
varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vShade;
const float K = 0.907; const float G = 1008.0;
void main(){
  float t = uNow - aStart.z, life = aShapeLife.y;
  vUv = uv; vColor = aColor; vShape = aShapeLife.x; vAlpha = 0.0; vShade = 1.0;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // fuera del recorte: no se dibuja
  float e = 1.0 - exp(-K * t);
  vec2 p = aStart.xy + aVel * e / K + vec2(0.0, G * (t / K - e / (K * K)));
  // los papelitos rectangulares aletean, cada uno a su ritmo; de canto nunca bajan de un grosor mínimo (un quad más fino
  // que un píxel no pinta nada y la pieza parpadeaba) y se oscurecen, que es lo que hace que se lea como un volteo
  float flip = cos(t * 9.0 + aSpin.x * 3.0);
  float fl = vShape < 0.5 ? sign(flip) * max(abs(flip), 0.22) : 1.0;
  if (vShape < 0.5) vShade = 0.55 + 0.45 * abs(flip);
  vec2 v = position.xy * aSize * vec2(1.0, fl);
  float a = aSpin.x + aSpin.y * t, c = cos(a), s = sin(a);
  v = vec2(c * v.x - s * v.y, s * v.x + c * v.y);
  gl_Position = projectionMatrix * vec4(p.x + v.x, -(p.y + v.y), 0.0, 1.0);
  vAlpha = min(1.0, (life - t) / 0.5);
}`;
export const CONF_FRAG = `
varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vShade;
void main(){
  vec2 q = vUv - 0.5;
  float a = vAlpha, r = length(q);
  if (vShape > 1.5) a *= step(r, 0.5 * (0.42 + 0.58 * pow(0.5 + 0.5 * cos(5.0 * atan(q.y, q.x) - 1.5708), 3.0))); // estrella
  else if (vShape > 0.5) a *= step(r, 0.5); // círculo
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * vShade * a, a); // premultiplicado
}`;
