/* Sobre 3D (three.js, cargado bajo demanda mientras se ve la portada).
   Mallas deformables: la tira se curva vértice a vértice al cortarla y el cuerpo se abre en boca.
   `app` da el estado del flujo principal que se lee en cada fotograma: P (giro del sobre), pack (el sobre HTML invisible,
   que marca el sitio y recibe los toques), cur (inclinación de la carta), flipped, zoomed, edicion, sobre (las cartas del
   sobre, que salen en un montón y se revelan una a una) y arrastre (lo que el dedo desplaza la carta para pasar a la siguiente).
   Si WebGL o la librería no cargan, devuelve null y se queda el sobre CSS. */
import { DPR3, texScale, drawPackFace, drawCardBack, fuentesListas, fuentesCargadas } from "./texturas.js";
import { glowFrag, SHADOW_FRAG, HOLO_HEAD, HOLO_BODY, BEAM_VERT, BEAM_FRAG, AURA_FRAG, CONF_VERT, CONF_FRAG, CANTO_VERT, CANTO_FRAG } from "./shaders.js";
import { materialCarta, paralaje } from "./material.js";
import { drawCarta, drawFoto, cargarFoto, ART_UV, RAREZAS, rareza } from "./carta.js";

export async function initPack3D(app){
  try {
    if (!document.createElement("canvas").getContext("webgl2") && !document.createElement("canvas").getContext("webgl")) return null;
    const THREE = await import("three");
    const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
    const listas = await fuentesListas();
    return createPack3D(THREE, RoomEnvironment, app, listas);
  } catch (e) { console.warn("Sobre 3D no disponible, se usa el CSS:", e); return null; }
}

function createPack3D(THREE, RoomEnvironment, app, fuentesOk){
  const canvas = document.querySelector("#pack3d");
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: "high-performance"});
  // 2x en el sobre (más pesado); en felicidades solo se dibuja la carta y va a la densidad real (3x en iPhone)
  // densidad fija (la real, hasta 3x): cambiarla entre el sobre y la carta reasigna el lienzo a pantalla completa
  // y en el iPhone eso era un tirón justo al salir la carta y al volver al sobre
  renderer.setPixelRatio(DPR3);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // tonos de cine: los brillos se comprimen en vez de quemarse a blanco
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 60);
  camera.position.z = 6;
  scene.add(new THREE.AmbientLight(0xffffff, .55));
  const key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(2, 3, 4); scene.add(key);
  const rimL = new THREE.PointLight(0x9ab8ff, 10, 12, 1.5); rimL.position.set(-2.5, 1.2, 2); scene.add(rimL);

  const W = 1, H = 1.62, SH = H * .15, CUT = H / 2 - SH, BH = H - SH, BCY = -H / 2 + BH / 2, T = .065;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const tex = draw => { const c = document.createElement("canvas"); draw(c); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.redraw = () => { draw(c); t.needsUpdate = true; }; return t; };
  const frontTex = tex(c => drawPackFace(c, true, app.edicion)), backTex = tex(c => drawPackFace(c, false, app.edicion)), cardTex = tex(c => drawCardBack(c, app.edicion));

  const U = {uTime: {value: 0}, uTilt: {value: 0}, uHolo: {value: 1}};
  const foil = map => {
    const m = new THREE.MeshPhysicalMaterial({map, metalness: .45, roughness: .36, clearcoat: .7, clearcoatRoughness: .3, envMapIntensity: .85, specularIntensity: .55,
      iridescence: .5, iridescenceIOR: 1.4, iridescenceThicknessRange: [200, 650], alphaTest: .5});
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\n" + HOLO_HEAD)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n" + HOLO_BODY);
    };
    return m;
  };
  const inner = map => new THREE.MeshStandardMaterial({map, color: 0x2a3378, roughness: .85, alphaTest: .5, side: THREE.BackSide});
  // planos subdivididos; vMin..vMax es el trozo de textura que les toca; los de atrás se giran 180°
  const plane = (h, sx, sy, cy, vMin, vMax, back) => {
    const g = new THREE.PlaneGeometry(W, h, sx, sy);
    g.translate(0, cy, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, vMin + uv.getY(i) * (vMax - vMin));
    if (back) g.rotateY(Math.PI);
    g.userData.base = Float32Array.from(g.attributes.position.array);
    return g;
  };
  const bodyF = plane(BH, 22, 34, BCY, 0, .85, false), bodyB = plane(BH, 22, 34, BCY, 0, .85, true);
  const stripF = plane(SH, 44, 6, CUT + SH / 2, .85, 1, false), stripB = plane(SH, 44, 6, CUT + SH / 2, .85, 1, true);
  const matF = foil(frontTex), matB = foil(backTex);

  const root = new THREE.Group(), pk = new THREE.Group(), sg = new THREE.Group();
  scene.add(root); root.add(pk); pk.add(sg);
  pk.add(new THREE.Mesh(bodyF, matF), new THREE.Mesh(bodyF, inner(frontTex)), new THREE.Mesh(bodyB, matB), new THREE.Mesh(bodyB, inner(backTex)));
  sg.add(new THREE.Mesh(stripF, matF), new THREE.Mesh(stripB, matB));

  const add = (mat, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); pk.add(m); return m; };
  // luz que se suma; el alfa también se suma para que el lienzo transparente quede premultiplicado válido
  // (color sin alfa: Chrome lo compone, pero Safari de iPhone lo pinta como puntos negros)
  const GLOW = {transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor};
  // .opacity sigue funcionando como en los materiales normales: escribe en el uniform
  const withOpacity = (m, u) => Object.defineProperty(m, "opacity", {get: () => u.value, set: v => { u.value = v; }, configurable: true});
  const glow = (shape, hex = 0xffffff) => {
    const u = {value: 0};
    return withOpacity(new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: glowFrag(shape),
      uniforms: {uColor: {value: new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace)}, uOpacity: u}, ...GLOW}), u);
  };
  const rip = add(glow("line", 0xffe0f6), 1, .05);    rip.position.set(0, CUT, .02);
  const flare = add(glow("line"), 1, .07);            flare.position.set(0, CUT, .1);
  const guide = add(glow("ring", 0xfff3c0), .13, .13); guide.position.set(0, CUT, .04);
  const shadowU = {value: .55};
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(.95, .16), withOpacity(new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: SHADOW_FRAG,
    uniforms: {uOpacity: shadowU}, transparent: true, depthWrite: false}), shadowU));
  root.add(shadow); shadow.position.set(0, -H / 2 - .16, -.2);
  // boca: anillo brillante que se ensancha al abrirse
  const ringPts = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * .485, 0, Math.sin(a))); }
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts, true), 96, .007, 6, true),
    new THREE.MeshBasicMaterial({color: 0xaee9ff, opacity: 0, ...GLOW, premultipliedAlpha: true})); // color × opacidad
  rim.position.y = CUT; pk.add(rim);
  const beamMat = new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: {uTime: U.uTime, uOpacity: {value: 0}},
    ...GLOW, blendSrc: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor});
  const beam = add(beamMat, 2.2, 1.6); beam.position.set(0, CUT + .8, -.03); // detrás de la carta: la carta lo tapa
  const CW = .76, CH = CW * 88 / 63, CY0 = CUT - CH / 2 - .04;
  // la carta: reverso y cara, espalda con espalda (transparent: las esquinas redondeadas son transparentes)
  // con su tamaño final desde el principio: si el lienzo cambia de tamaño después de subir la textura, la GPU no la actualiza.
  // Dos caras que se turnan: la que se ve y la de la siguiente carta del sobre, ya dibujada y subida antes de pasar a ella
  const FACE_SCALE = texScale(340, 680);
  // cada una con su foto aparte (con margen, para el paralaje), también de tamaño fijo
  const lienzo = () => { const c = document.createElement("canvas"), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return [c, t]; };
  const caras = [0, 1].map(() => {
    const [c, t] = lienzo(), [fc, ft] = lienzo();
    c.width = Math.round(680 * FACE_SCALE); c.height = Math.round(950 * FACE_SCALE);
    drawFoto(fc, {}, null, FACE_SCALE);
    return {c, t, fc, ft, k: null, conFoto: false, limite: [0, 0, 0, 0]};
  });
  const fotoU = {value: caras[0].ft}, fotoOnU = {value: 0}, paralU = {value: new THREE.Vector2()}, limiteU = {value: new THREE.Vector4()};
  const ajustarParalaje = paralaje(THREE);
  const UC = {uTilt: {value: 0}, uArt: {value: new THREE.Vector4(...ART_UV)}};
  const artOnU = {value: 1}; // holográfico sobre la ilustración: más suave encima de una foto
  // rareza de la carta que se ve: marco (plateado u holográfico), tono del aura y brillo del reverso antes de voltearla
  const bordeU = {value: 0}, irisU = {value: .55}, baseU = {value: new THREE.Vector3(1, .78, .3)};
  let brillo = 0;
  // cartas del sobre (las dibuja la cara libre, cuando el navegador está libre); si cambia la edición, también sobre y reverso
  let edicionDe = app.edicion, cara = 0, mostrada = 0; // mostrada: qué carta del sobre se ve
  function pintarEn(i, k){
    const s = caras[i]; s.k = k;
    const pinta = img => {
      if (s.k !== k) return;
      drawCarta(s.c, k.d, img, {num: k.num, total: k.total, scale: FACE_SCALE});
      s.t.needsUpdate = true; renderer.initTexture(s.t); // se sube ya, no en mitad de una animación
      s.conFoto = !!img && rareza(k.d) === "especial"; // el paralaje, solo en las especiales
      if (s.conFoto) { s.limite = drawFoto(s.fc, k.d, img, FACE_SCALE); s.ft.needsUpdate = true; renderer.initTexture(s.ft); }
      if (caras[cara] === s) { fotoOnU.value = s.conFoto ? 1 : 0; limiteU.value.set(...s.limite); }
    };
    if (!k.d.foto) return pinta(null);
    cargarFoto(k.d.foto).then(pinta, () => pinta(null));
  }
  function ver(k){ // la carta k pasa a la cara de la carta (con los colores de su rareza)
    let i = caras.findIndex(s => s.k === k);
    if (i < 0) pintarEn(i = cara, k);
    cara = i; cardFront.material.map = caras[i].t; fotoU.value = caras[i].ft; fotoOnU.value = caras[i].conFoto ? 1 : 0; limiteU.value.set(...caras[i].limite);
    const r = RAREZAS[rareza(k.d)];
    artOnU.value = /\.svg$/i.test(k.d.foto || "") ? 1 : .35;
    bordeU.value = r.borde; irisU.value = r.iris; baseU.value.set(...r.aura); brillo = r.brillo;
  }
  const preparar = k => { if (k && !caras.some(s => s.k === k)) pintarEn(1 - cara, k); };
  function pintarAhora(){
    if (edicionDe !== app.edicion) { edicionDe = app.edicion; [frontTex, backTex, cardTex].forEach(t => { t.redraw(); renderer.initTexture(t); }); }
    const S = app.sobre;
    if (!S.length) return;
    if (!partyMode && !openAt) { mostrada = 0; ver(S[0]); } // sobre sin abrir: la primera
    preparar(S[mostrada + 1]);
  }
  // la carta del próximo sobre se dibuja y se sube a la GPU cuando el navegador está libre, no mientras entra el sobre
  // (era un fotograma largo justo al volver al sobre); si se abre antes, se hace en ese momento
  let pendiente = null;
  const enReposo = fn => window.requestIdleCallback ? requestIdleCallback(fn, {timeout: 900}) : setTimeout(fn, 700);
  const cancelar = id => window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id);
  function pintarCara(){
    if (pendiente) cancelar(pendiente);
    if (edicionDe !== app.edicion) return pintarAhora(); // cambio de sobre con el botón: se ve al momento
    pendiente = enReposo(() => { pendiente = null; pintarAhora(); });
  }
  function pintarYa(){ if (pendiente) { cancelar(pendiente); pendiente = null; pintarAhora(); } }
  document.addEventListener("carta", pintarCara);
  // mano: la carta y, debajo, el montón con las que quedan del sobre, alineadas y con grosor (inclinándolo se ven los
  // cantos y cuántas quedan). La mano se mueve (sale del sobre, vuela, se inclina); dentro, la carta de arriba se voltea
  // y se aparta deslizando, y debajo ya está la siguiente
  const mano = new THREE.Group(), card = new THREE.Group(), taco = new THREE.Group();
  const destelloU = {value: 0}; // revelación de una especial: luz blanca que cruza la cara
  const cardBack = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), materialCarta(THREE, cardTex, {...UC, uArtOn: {value: 0}, uBorde: {value: 0}}, "reverso"));
  const cardFront = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), materialCarta(THREE, caras[0].t, {...UC, uArtOn: artOnU, uBorde: bordeU, uDestello: destelloU,
    uFoto: fotoU, uFotoOn: fotoOnU, uParal: paralU, uLimite: limiteU}, "cara"));
  cardFront.rotation.y = Math.PI;
  card.rotation.order = "ZYX"; // el ladeo (z) va por fuera del volteo (y): se ve igual boca arriba que boca abajo
  // canto: el contorno redondeado de la carta extruido (sin tapas). Una carta mide GROSOR (exagerado para que se vea) y en
  // el montón van separadas por HUECO: cada una a PASO de la siguiente, para que al inclinarlo se distingan una a una
  const GROSOR = .022, HUECO = .026, PASO = GROSOR + HUECO, RC = CW * .054, forma = new THREE.Shape();
  forma.moveTo(-CW / 2 + RC, -CH / 2);
  [[CW / 2 - RC, -CH / 2 + RC, -Math.PI / 2], [CW / 2 - RC, CH / 2 - RC, 0], [-CW / 2 + RC, CH / 2 - RC, Math.PI / 2], [-CW / 2 + RC, -CH / 2 + RC, Math.PI]]
    .forEach(([x, y, a0]) => forma.absarc(x, y, RC, a0, a0 + Math.PI / 2, false));
  const cantoGeo = new THREE.ExtrudeGeometry(forma, {depth: 1, bevelEnabled: false, curveSegments: 5});
  const sinTapas = new THREE.MeshBasicMaterial({visible: false});
  const canto = (n, hueco = 0) => new THREE.Mesh(cantoGeo, [sinTapas, new THREE.ShaderMaterial({vertexShader: CANTO_VERT, fragmentShader: CANTO_FRAG,
    uniforms: {uN: {value: n}, uHueco: {value: hueco}}})]);
  const cantoCarta = canto(1); cantoCarta.scale.z = GROSOR; cantoCarta.position.z = -GROSOR / 2;
  // montón: un solo canto con n capas (con su hueco encima de cada una) y el reverso de cada carta encima de ella (se ven por
  // los huecos y el de la siguiente al levantar la de arriba)
  const pila = canto(1, HUECO / PASO), tapas = [0, 1, 2, 3].map(j => {
    const m = new THREE.Mesh(cardBack.geometry, cardBack.material);
    m.position.z = -GROSOR / 2 - HUECO - j * PASO - .0005; return m;
  });
  taco.add(pila, ...tapas);
  let tacoN = 0;
  function verTaco(n){
    halo.position.z = -GROSOR / 2 - PASO * n - .02; // el aura, detrás de todo el montón
    tacoN = n; taco.visible = n > 0; if (!n) return;
    pila.scale.z = PASO * n; pila.position.z = -GROSOR / 2 - PASO * n; pila.material[1].uniforms.uN.value = n;
    tapas.forEach((m, j) => { m.visible = j < n; });
  }
  // destellos de estrella sobre la cara (por eso giradas como ella): uno grande en la esquina al revelar una especial
  // y chispas que titilan alrededor de las raras y especiales
  const estrella = (x, y, w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), glow("estrella", 0xfff8e8)); m.position.set(x, y, -.03); m.rotation.y = Math.PI; card.add(m); return m; };
  const fogonazo = estrella(-CW / 2 + .06, CH / 2 - .06, CW * 1.3); // arriba a la derecha de la cara (x invertida al girarla)
  const chispas = [[CW / 2 + .02, CH * .18], [-CW / 2 - .03, -CH * .22], [CW * .2, -CH / 2 - .03], [-CW * .25, CH / 2 + .02], [CW / 2 - .02, -CH / 2 + .05]]
    .map(([x, y], i) => estrella(x, y, CW * (i % 2 ? .32 : .42)));
  // aura que acompaña a la carta (se maneja con halo.material.opacity) y onda expansiva al quedar fuera del sobre
  // (un plano grande de cara a la cámara detrás del montón; la forma la dibuja el shader alrededor de la silueta que se ve)
  const AW = CW * 2.7, AH = CH * 2.1, auraU = {value: 0};
  const auraS = {uPoly: {value: Array.from({length: 24}, () => new THREE.Vector2())}, uN: {value: 0}, uRad: {value: 0}, uEsc: {value: 1}, uCentro: {value: new THREE.Vector2()}};
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH), withOpacity(new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: AURA_FRAG,
    uniforms: {uTime: U.uTime, uOpacity: auraU, uIris: irisU, uBase: baseU, ...auraS}, ...GLOW}), auraU));
  const burst = new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.7, CW * 1.7), glow("ring", 0xfff0c8));
  // el aura va en la mano (detrás del montón, de cara a la cámara); la onda, con la carta
  burst.position.z = -.02; card.add(burst, cardBack, cardFront, cantoCarta);
  mano.add(halo, taco, card);

  /* --- confeti en la GPU: un búfer circular de piezas; cada una vuela sola en el vertex shader (shaders.js) --- */
  const CONF_N = 900, T0 = performance.now();
  const reloj = () => (performance.now() - T0) / 1000;
  const confGeo = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  confGeo.index = quad.index; confGeo.setAttribute("position", quad.getAttribute("position")); confGeo.setAttribute("uv", quad.getAttribute("uv"));
  const cattr = (name, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CONF_N * n), n); a.setUsage(THREE.DynamicDrawUsage); confGeo.setAttribute(name, a); return a; };
  const aStart = cattr("aStart", 3), aVel = cattr("aVel", 2), aSize = cattr("aSize", 2), aSpin = cattr("aSpin", 2), aColor = cattr("aColor", 3), aShapeLife = cattr("aShapeLife", 2);
  for (let i = 0; i < CONF_N; i++) aStart.setZ(i, -1e4); // libres
  confGeo.instanceCount = CONF_N;
  const confU = {uNow: {value: 0}};
  const confMesh = new THREE.Mesh(confGeo, new THREE.ShaderMaterial({vertexShader: CONF_VERT, fragmentShader: CONF_FRAG, uniforms: confU,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor}));
  confMesh.frustumCulled = false;
  const confScene = new THREE.Scene(); confScene.add(confMesh);
  const confCam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10); // píxeles CSS, y hacia abajo (el shader la invierte)
  // valores sRGB tal cual (sin pasar a lineal): el shader los escribe directamente, como el confeti 2D
  const CONF_COL = ["#ffcb05", "#e3350d", "#2a75bb", "#ffffff", "#2ecc71", "#ff6ec7", "#7ff3ff"]
    .map(h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace));
  let confI = 0, confHasta = 0;
  // mismos parámetros que el confeti 2D (confeti.js): velocidades en píxeles por fotograma a 60 fps
  function confeti(x, y, n, spread, dir = -Math.PI / 2, v0 = 7, vr = 11){
    const now = reloj(), cr = canvas.getBoundingClientRect();
    for (let k = 0; k < n; k++) {
      const i = confI++ % CONF_N, a = dir + (Math.random() - .5) * spread, v = (v0 + Math.random() * vr) * 60;
      const w = 6 + Math.random() * 7, h = 8 + Math.random() * 10;
      const shape = Math.random() < .1 ? 2 : Math.random() < .3 ? 1 : 0, life = (160 + Math.random() * 80) / 60, col = CONF_COL[Math.random() * CONF_COL.length | 0];
      aStart.setXYZ(i, x - cr.left, y - cr.top, now); aVel.setXY(i, Math.cos(a) * v, Math.sin(a) * v);
      aSize.setXY(i, shape === 2 ? w * 2 : w, shape === 0 ? h : shape === 2 ? w * 2 : w);
      aSpin.setXY(i, Math.random() * 6, (Math.random() - .5) * 21); aColor.setXYZ(i, col.r, col.g, col.b); aShapeLife.setXY(i, shape, life);
      confHasta = Math.max(confHasta, now + life);
    }
    [aStart, aVel, aSize, aSpin, aColor, aShapeLife].forEach(a => { a.needsUpdate = true; });
  }
  // el aura y la onda siguen a la carta pero siempre de cara a la cámara: si se inclinaran con ella (montón inclinado,
  // volteo) se verían como una pegatina plana
  const qCara = new THREE.Quaternion();
  const encarar = m => { m.parent.getWorldQuaternion(qCara).invert(); m.quaternion.copy(qCara); };
  // la escena y, encima, el confeti (solo mientras quede alguno en el aire)
  // silueta del aura: las esquinas de la carta (por delante y por detrás) y las del fondo del montón, proyectadas a
  // píxeles del lienzo, y su envolvente convexa
  const vS = new THREE.Vector3(), buf = new THREE.Vector2(), ESQ = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  function silueta(){
    scene.updateMatrixWorld();
    renderer.getDrawingBufferSize(buf);
    const px = (obj, x, y, z) => { vS.set(x, y, z).applyMatrix4(obj.matrixWorld).project(camera); return [(vS.x * .5 + .5) * buf.x, (vS.y * .5 + .5) * buf.y]; };
    // las esquinas redondeadas de verdad (tres puntos por esquina), sin redondear el grosor: de canto, la silueta es
    // tan fina como la carta (si no, el hueco del aura se veía como una franja negra al girarla)
    const ix = CW / 2 - RC, iy = CH / 2 - RC, pts = [];
    for (const [sx, sy] of ESQ) for (const a of [0, Math.PI / 4, Math.PI / 2]) {
      const x = sx * (ix + RC * Math.cos(a)), y = sy * (iy + RC * Math.sin(a));
      pts.push(px(card, x, y, GROSOR / 2), px(card, x, y, -GROSOR / 2));
      if (taco.visible && a !== Math.PI / 4) pts.push(px(taco, x, y, pila.position.z));
    }
    // envolvente convexa (cadena monótona)
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const cadena = L => { const h = []; for (const p of L) { while (h.length > 1 && cruz(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
    const hull = [...cadena(pts), ...cadena(pts.slice().reverse())].slice(0, 24);
    hull.forEach((p, i) => auraS.uPoly.value[i].set(p[0], p[1]));
    auraS.uN.value = hull.length;
    // escala por el alto de la carta (al voltearla, de canto, el ancho se queda en nada)
    const a = px(card, 0, CH / 2, 0), b = px(card, 0, -CH / 2, 0), alto = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
    auraS.uEsc.value = alto * CW / CH;
    auraS.uRad.value = 0; // las esquinas ya van en la silueta
    auraS.uCentro.value.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  function render(sc = scene){
    if (sc === scene) { encarar(halo); encarar(burst); if (halo.material.opacity > 0) silueta(); ajustarParalaje(cardFront, camera, paralU); }
    renderer.render(sc, camera);
    confU.uNow.value = reloj();
    if (confU.uNow.value < confHasta) { renderer.autoClear = false; renderer.render(confScene, confCam); renderer.autoClear = true; }
  }

  /* --- deformaciones --- */
  const smooth = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  function shapeBody(open){ // almohada + boca abierta
    for (const [g, s] of [[bodyF, 1], [bodyB, -1]]) {
      const b = g.userData.base, pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const nx = b[i * 3] / (W / 2), ny = (b[i * 3 + 1] - BCY) / (BH / 2);
        // el abombado acaba antes de las tiras selladas: arriba en la costura del corte, abajo en la tira inferior
        const pillow = T * (1 - nx ** 4) * (1 - Math.max(smooth(.86, 1, ny), smooth(.72, .8, -ny)));
        const mouth = open * (1 - nx * nx) * smooth(.45, 1, ny);
        pos.setZ(i, s * (pillow + mouth + .004)); // +.004: las dos caras nunca coinciden (si no, parpadean entre sí)
      }
      pos.needsUpdate = true; g.computeVertexNormals();
    }
  }
  /* --- selector de sobres: un sobre 3D por edición (mismo foil holográfico), encajado en los huecos HTML del selector --- */
  const selScene = new THREE.Scene();
  selScene.environment = scene.environment;
  selScene.add(new THREE.AmbientLight(0xffffff, .55), key.clone(), rimL.clone());
  // una sola pieza por cara con el abombado de almohada (más suave en las tiras selladas de arriba y abajo)
  const selGeo = back => {
    const g = new THREE.PlaneGeometry(W, H, 16, 26), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const nx = pos.getX(i) / (W / 2), ny = pos.getY(i) / (H / 2);
      pos.setZ(i, T * (1 - nx ** 4) * (1 - smooth(.66, .84, Math.abs(ny))) + .004);
    }
    g.computeVertexNormals();
    if (back) g.rotateY(Math.PI);
    return g;
  };
  const selGeoF = selGeo(false), selGeoB = selGeo(true), selSobres = new Map(); // edición → grupo (se crea una vez)
  const sobreSel = ed => {
    if (!selSobres.has(ed)) {
      const g = new THREE.Group();
      const esc = texScale(200, 512); // los sobres del selector miden como mucho ~200 px
      g.add(new THREE.Mesh(selGeoF, foil(tex(c => drawPackFace(c, true, ed, esc)))), new THREE.Mesh(selGeoB, foil(tex(c => drawPackFace(c, false, ed, esc)))));
      selSobres.set(ed, g);
    }
    return selSobres.get(ed);
  };
  let sel = null; // {items: [{g, rx, ry}], huecos(), elegido, at}
  const SEL_MS = 420;
  function selFrame(t){
    const s = t / 1000, cr = canvas.getBoundingClientRect(), huecos = sel.huecos();
    const ke = sel.elegido >= 0 ? ease(clamp((t - sel.at) / SEL_MS)) : 0;
    sel.items.forEach((it, i) => {
      const r = huecos[i]?.getBoundingClientRect();
      if (!r?.width) { it.g.visible = false; return; }
      const esc = r.height * upp / H, el = i === sel.elegido;
      const k = sel.elegido < 0 ? 1 : el ? 1 + .16 * ke : 1 - ke; // el elegido crece y se acerca; los demás se encogen
      it.g.visible = k > .02;
      // el elegido además va al centro de la pantalla (si no, el de un lado se sale por el borde al crecer)
      const x = (r.left + r.width / 2 - cr.left - vw / 2) * upp, y = -(r.top + r.height / 2 - cr.top - vh / 2) * upp;
      const hacia = el ? ke : 0;
      it.g.position.set(x * (1 - hacia), y * (1 - hacia) + Math.sin(s * 1.9 + i * 1.7) * .05 * esc * (1 - ke), (el ? .6 : 0) * ke);
      it.g.scale.setScalar(esc * k);
      if (el) sel.pose = {p: it.g.position.clone(), s: esc * k}; // de aquí arranca el sobre de rasgar (entrada continua)
      // vaivén suave desfasado y la inclinación del dedo; el elegido se pone de frente
      const ry = Math.sin(s * .8 + i * 2.1) * .2 + it.ry, rx = Math.cos(s * .6 + i) * .07 + it.rx;
      it.g.rotation.y += ((el ? 0 : ry) - it.g.rotation.y) * .12;
      it.g.rotation.x += ((el ? 0 : rx) - it.g.rotation.x) * .12;
    });
    U.uTilt.value = Math.sin(s * .7) * .5; // el arcoíris y el brillo del foil se mueven solos
  }
  let cut = {lo: 0, hi: 0, tear: 0}, cutDirty = true;
  // qué extremo de la tira va suelto: el que el corte deja más cerca de su borde. Se mantiene al completar el corte
  // (rasgando de derecha a izquierda la tira queda sujeta por la izquierda y sale volando hacia la izquierda)
  let sueltoDer = false;
  function shapeStrip(wave, t){ // lo cortado se curva hacia la cámara desde el extremo suelto
    const {lo, hi, tear} = cut, k = Math.min(1, tear * 2 + .3);
    for (const [g, flip] of [[stripF, false], [stripB, true]]) {
      const b = g.userData.base, pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3], u = (flip ? -x : x) / W + .5, h = (b[i * 3 + 1] - CUT) / SH;
        // Lo cortado [lo, hi] sigue sujeto por los extremos del corte que no tocan el borde; al acercarse el corte a
        // un borde esa sujeción se suelta poco a poco (sL/sR). La forma es una mezcla de tres, todas suaves (sin aristas):
        //  - ranura (sujeta por los dos lados): arco de seno hacia fuera
        //  - suelta por la izquierda o por la derecha: se enrolla como una pegatina desde la sujeción que queda
        // Mezclarlas con pesos continuos evita pliegues y saltos de un lado a otro.
        let px = u, z = 0, y = b[i * 3 + 1];
        if (hi - lo > .005) {
          const sL = smooth(0, .12, lo), sR = smooth(0, .12, 1 - hi);
          const entero = (1 - sL) * (1 - sR); // cortado de lado a lado: sigue sujeta por el lado contrario al suelto
          const wB = sL * sR, wL = sL * (1 - sR) + (sueltoDer ? entero : 0), wR = (1 - sL) * sR + (sueltoDer ? 0 : entero);
          const kap = 1.25 * k + .01;
          const roll = (w, d, tip, dir) => { // enrollado alrededor de tip; d = distancia a tip por la tira
            const phi = d * kap, lift = (1 - Math.cos(phi)) / kap;
            px += w * (tip + dir * Math.sin(phi) / kap - u);
            z += w * (lift * .9 + h * d * .16 * k);   // el borde de arriba se dobla un poco más
            y += w * lift * .35;                      // y lo despegado sube: se lee como pegatina levantándose
          };
          if (wR > 0 && u <= hi) roll(wR, hi - u, hi, -1); // suelto por la izquierda: sujeto en hi
          if (wL > 0 && u >= lo) roll(wL, u - lo, lo, 1);  // suelto por la derecha: sujeto en lo
          if (wB > 0 && u > lo && u < hi) {
            const arch = Math.sin(Math.PI * (u - lo) / (hi - lo)) ** 2 * (hi - lo) * .5; // seno²: sale de la tira sin esquina
            z += wB * arch * (.35 + h * .25) * k;
            y += wB * arch * .08 * k;
          }
        }
        if (wave) z += Math.sin(u * 7 + t * 9) * .07 * wave + Math.sin(h * 3 + t * 6) * .02 * wave;
        pos.setXYZ(i, (flip ? -1 : 1) * (px - .5) * W, y, z);
      }
      pos.needsUpdate = true; g.computeVertexNormals();
    }
  }

  /* --- colocación: el sobre 3D va justo donde está el sobre CSS (invisible) --- */
  let vw = 0, vh = 0, upp = 1, placed = false;
  const unitsTall = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  function place(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (w !== vw || h !== vh) { vw = w; vh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    upp = unitsTall / h;
    const r = app.pack.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    if (!r.width) return;
    root.userData.x = (r.left + r.width / 2 - cr.left - w / 2) * upp;
    root.userData.y = -(r.top + r.height / 2 - cr.top - h / 2) * upp;
    root.scale.setScalar(r.width * upp);
    placed = true;
  }
  addEventListener("resize", () => placed = false);

  let openAt = 0, nudgeAt = -1e9, cardFree = null, target = null;
  const IDQ = new THREE.Quaternion();
  // posición/tamaño en el mundo 3D de la carta de la pantalla de felicidades, para aterrizar justo encima
  function worldTarget(s0){
    if (!target) return {p: new THREE.Vector3(0, 0, 0), s: s0 * 1.2};
    const cr = canvas.getBoundingClientRect();
    const cx = target.x + target.w / 2 - cr.left, cy = target.y + target.h / 2 - cr.top;
    return {p: new THREE.Vector3((cx - vw / 2) * upp, -(cy - vh / 2) * upp, 0), s: target.h * upp / CH};
  }
  const ease = v => 1 - (1 - v) ** 3, clamp = v => Math.min(1, Math.max(0, v));
  const easeBack = v => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2; // llega pasándose un poco y vuelve
  const cardRise = k => ease(clamp((k - .88) / .75)) * (CH + .12); // sube hasta salir entera por la boca
  const bez = (f, a, b, c, d) => { const m = 1 - f; return m * m * m * a + 3 * m * m * f * b + 3 * m * f * f * c + f * f * f * d; };
  function reset(){
    openAt = 0; cardFree = null; target = null; placed = false; partyMode = false; flipAt = 0; exitAt = 0; traspaso = null; root.visible = true;
    swipe = null; dragX = dragY = 0; mostrada = 0; destelloU.value = 0; taco.scale.setScalar(1);
    [fogonazo, ...chispas].forEach(m => { m.material.opacity = 0; });
    cut = {lo: 0, hi: 0, tear: 0}; cutDirty = true; sueltoDer = false;
    sg.position.set(0, 0, 0); sg.rotation.set(0, 0, 0); sg.visible = true;
    pk.add(mano); mano.position.set(0, CY0, 0); mano.rotation.set(0, 0, 0); mano.scale.setScalar(1); mano.visible = false;
    card.position.set(0, 0, 0); card.rotation.set(0, 0, 0); card.scale.setScalar(1);
    verTaco(app.sobre.length - 1);
    pintarCara(); // las cartas de este sobre (si ya están dibujadas, solo se ponen)
    shapeBody(0);
    [rip, flare, guide, halo, burst].forEach(m => m.material.opacity = 0);
    rim.material.opacity = 0; beamMat.uniforms.uOpacity.value = 0; shadow.material.opacity = .55;
  }

  let partyMode = false, flipAt = 0, exitAt = 0, shown = false, entrada = null, traspaso = null;
  let swipe = null, dragX = 0, dragY = 0, presagioAt = 0; // swipe: la carta se aparta y llega la siguiente del taco
  const EXIT_MS = 760, SWIPE_MS = 260, GIRO_MS = 1800, GIRO_CANTO = 1150;
  let giro = false, inclina = 1, sentidoX = 1; // la carta que se está volteando es especial: vuelta y media con destello
  // en felicidades, la mano se coloca sobre la carta HTML invisible y se inclina con el dedo; la carta se gira dentro
  function partyFrame(t){
    const r = document.querySelector("#cardStage").getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    if (!r.width) return;
    const tx = (r.left + r.width / 2 - cr.left - vw / 2) * upp, ty = -(r.top + r.height / 2 - cr.top - vh / 2) * upp, ts = r.height * upp / CH;
    let ang = app.flipped ? Math.PI : 0, lift = 0;
    let giroY = 0;
    destelloU.value = 0;
    if (flipAt && giro) { // especial: se levanta, da vuelta y media mientras la cruza un destello blanco, y asienta
      const fk = clamp((t - flipAt) / GIRO_MS), g = clamp((fk - .05) / .62);
      ang = Math.PI * 3 * (g < .5 ? 4 * g * g * g : 1 - (-2 * g + 2) ** 3 / 2);
      lift = fk < .12 ? ease(fk / .12) : fk < .7 ? 1 : 1 - ease((fk - .7) / .3);
      giroY = Math.sin(fk * Math.PI) * .22; // la mano se ladea mientras gira, como en el juego
      destelloU.value = clamp(1 - Math.abs(fk - .6) / .2) ** 1.5;
    } else if (flipAt) { // como la animación CSS: se levanta, gira pasándose un poco y asienta
      const fk = clamp((t - flipAt) / 1100), D = Math.PI / 180;
      if (fk < .35) { const e = ease(fk / .35); ang = 70 * D * e; lift = e; }
      else if (fk < .7) { const e = (fk - .35) / .35, sm = e * e * (3 - 2 * e); ang = (70 + 122 * sm) * D; lift = 1 - .7 * sm; }
      else { const e = ease((fk - .7) / .3); ang = (192 - 12 * e) * D; lift = .3 * (1 - e); }
    }
    // inclinación con el dedo (o el vaivén en reposo): con el montón boca abajo se inclina más, para que se vea su canto
    // y cuántas quedan (la perspectiva esconde el fondo del montón tras la carta si se inclina poco)
    inclina += ((app.flipped || flipAt ? 1 : 3) - inclina) * .08;
    // boca abajo, el lado hacia el que va el dedo se acerca y enseña sus cantos (en horizontal igual que en vertical);
    // boca arriba, como siempre (el lado que se toca se aleja), para el holográfico
    sentidoX += ((app.flipped || flipAt ? 1 : -1) - sentidoX) * .08;
    const tiltX = (.5 - app.cur.py) * .42, tiltY = (app.cur.px - .5) * .42;
    // al llegar, si hay más cartas debajo, el montón se balancea solo a un lado y al otro para enseñarse
    const ik = clamp((t - presagioAt - 250) / 1900);
    const ensena = !app.flipped && !flipAt && mostrada < app.sobre.length - 1 ? Math.sin(ik * Math.PI * 2) * Math.sin(ik * Math.PI) * .7 : 0;
    mano.position.set(tx, ty, 0);
    mano.rotation.set(tiltX * .7 * inclina + Math.abs(ensena) * .25, tiltY * .9 * inclina * sentidoX + giroY + ensena, 0);
    mano.scale.setScalar(ts);
    // la carta dentro de la mano (en sus unidades: lo del mundo se divide por ts): giro, levantada y el arrastre del dedo
    dragX += ((app.arrastre?.x || 0) * upp / ts - dragX) * .5;
    dragY += (-(app.arrastre?.y || 0) * upp / ts - dragY) * .5;
    // la especial gira sin acercarse tanto (si no, al ladearse se sale de la pantalla)
    card.position.set(dragX, dragY + lift * (giro ? 18 : 40) * upp / ts, lift * (giro ? .12 : .6) / ts);
    card.rotation.set(0, ang, -dragX * .3);
    card.scale.setScalar(1 + lift * (giro ? -.1 : .1));
    // brillo de la rareza mientras está boca abajo (late; la especial además tiembla) y se apaga al voltearla
    const late = .62 + .38 * Math.sin(t / 1000 * 5.5);
    let aura = 0;
    if (!app.flipped && !flipAt) aura = brillo * late * clamp((t - presagioAt) / 700);
    else if (flipAt) aura = brillo * Math.max(0, 1 - (t - flipAt) / 450);
    if (!app.flipped && !flipAt && brillo >= 1) card.rotation.z += Math.sin(t / 1000 * 38) * .012 * clamp((t - presagioAt - 400) / 600);
    if (swipe) { // la carta se desliza plana hacia el lado del dedo; debajo, en el montón, ya está la siguiente
      const f = (t - swipe.at) / SWIPE_MS;
      if (f < 1) {
        const e = f * .35 + f * f * .65, lejos = Math.max(vw, vh) * 1.15 * upp / ts; // sale ya con velocidad
        card.position.set(swipe.x0 + swipe.dx * e * lejos, swipe.y0 + swipe.dy * e * lejos, .004);
        card.rotation.set(0, Math.PI, -swipe.x0 * .3 - swipe.dx * .25 * e);
        aura = 0;
      } else { // ya fuera de la pantalla: la de arriba pasa a ser la siguiente (está justo debajo: no se nota el cambio)
        swipe = null; mostrada++; flipAt = 0; presagioAt = t;
        ver(app.sobre[mostrada]); verTaco(app.sobre.length - 1 - mostrada);
        enReposo(() => preparar(app.sobre[mostrada + 1]));
        card.position.set(0, 0, 0); card.rotation.set(0, 0, 0); card.scale.setScalar(1);
      }
    }
    halo.material.opacity = aura; burst.material.opacity = 0;
    // mientras gira una especial, el montón de detrás se encoge tras la carta y vuelve al acabar
    const gk = flipAt && giro ? t - flipAt : 1e9;
    const esconde = gk < 250 ? ease(gk / 250) : gk < GIRO_MS + 200 ? 1 : 1 - ease(clamp((gk - GIRO_MS - 200) / 450));
    taco.scale.setScalar(Math.max(.001, 1 - esconde)); taco.visible = tacoN > 0 && esconde < .999;
    // al revelarse: estallido de estrella en la esquina (especial) y chispas que titilan alrededor (rara y especial)
    const rv = flipAt && !swipe ? t - flipAt - (giro ? GIRO_CANTO : 380) : -1;
    const fg = giro && rv > -60 ? clamp((rv + 60) / 900) : 0;
    fogonazo.material.opacity = fg > 0 && fg < 1 ? Math.sin(fg * Math.PI) ** .6 * 1.5 : 0;
    fogonazo.scale.setScalar(.4 + .9 * ease(fg)); fogonazo.rotation.z = fg * .6;
    chispas.forEach((m, i) => {
      const k = rv > 0 && brillo > 0 ? rv / 1000 : -1;
      const tw = Math.max(0, Math.sin(k * 5.5 - i * 1.9)) ** 3;
      m.material.opacity = k > 0 && k < 3.2 ? tw * (1 - clamp((k - 2.4) / .8)) * (giro ? 1.2 : .9) : 0;
      m.scale.setScalar(.6 + .5 * tw); m.rotation.z = k * .8 + i;
    });
    if (traspaso) { // del vuelo desde el sobre a su sitio en felicidades: se desliza desde su última pose, sin salto
      if (!traspaso.at) traspaso.at = t;
      const f = ease(clamp((t - traspaso.at) / 380)), q = mano.quaternion.clone();
      mano.position.lerpVectors(traspaso.p, mano.position, f);
      mano.quaternion.slerpQuaternions(traspaso.q, q, f);
      mano.scale.setScalar(traspaso.s + (mano.scale.x - traspaso.s) * f);
      halo.material.opacity = Math.max(aura, traspaso.halo * (1 - f)); // el aura se apaga en vez de cortarse
      if (f >= 1) traspaso = null;
    }
    if (exitAt) { // salida: amago hacia abajo y sale disparada hacia arriba dando una vuelta, encogiendo, con brillo
      const ek = clamp((t - exitAt) / EXIT_MS);
      if (ek < .2) { const a = Math.sin(ek / .2 * Math.PI / 2); mano.position.y -= a * 16 * upp; mano.scale.multiplyScalar(1 - .05 * a); }
      else {
        const f = (ek - .2) / .8, e = f * f * f;
        mano.position.y += -16 * upp * (1 - f) + e * vh * 1.05 * upp;
        mano.position.z += Math.sin(f * Math.PI) * .5;
        mano.rotation.y += ease(f) * Math.PI * 2;
        mano.rotation.z = -.4 * e;
        mano.scale.multiplyScalar(.95 - .35 * e);
        halo.material.opacity = Math.sin(Math.min(1, f * 1.6) * Math.PI) * .9;
      }
    }
    UC.uTilt.value = (app.cur.px - .5) * 2 + (app.cur.py - .5);
  }
  function size(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (w !== vw || h !== vh)) {
      vw = w; vh = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      confCam.right = w; confCam.bottom = -h; confCam.updateProjectionMatrix();
    }
    if (h) upp = unitsTall / h;
  }

  function frame(t){
    requestAnimationFrame(frame);
    const packOn = document.querySelector("#s-pack").classList.contains("active") && document.querySelector("#s-pack").classList.contains("gl");
    const partyOn = partyMode && document.querySelector("#s-party").classList.contains("active");
    const selOn = sel && document.querySelector("#s-elegir").classList.contains("active");
    if (packOn || partyOn || selOn) { if (!shown) { canvas.style.display = "block"; shown = true; } }
    else { if (shown) { canvas.style.display = "none"; shown = false; } return; }
    size();
    if (selOn) { U.uTime.value = t / 1000; selFrame(t); render(selScene); return; }
    if (partyOn) { U.uTime.value = t / 1000; partyFrame(t); render(); return; }
    place(); // cada fotograma: sigue al zoom del sobre CSS
    const s = t / 1000;
    U.uTime.value = s;
    U.uTilt.value = app.P.ry / 60 + app.P.rx / 40;
    // pose: la física (giro, balanceo, caída) la sigue llevando el JS del sobre en P
    // al final de la apertura el sobre se retira: baja, se inclina hacia atrás y encoge
    // mientras la carta sale, el sobre ya va bajando (así la carta no se sale de la pantalla por arriba)
    const ok = openAt ? (t - openAt) / 1000 : 0, rk = openAt ? clamp((ok - 1.6) / .8) : 0;
    const pre = openAt ? .55 * cardRise(ok) * root.scale.x : 0;
    root.position.set(root.userData.x || 0, (root.userData.y || 0) - app.P.dy * upp + (openAt ? 0 : Math.sin(s * 1.96) * .025) - pre - rk * rk * vh * upp * .95, 0);
    root.scale.multiplyScalar(1 - .12 * rk);
    const nk = (t - nudgeAt) / 1000;
    pk.rotation.set(THREE.MathUtils.degToRad(-app.P.rx) - .5 * rk, THREE.MathUtils.degToRad(app.P.ry), nk < 1 ? Math.sin(nk * 26) * .07 * Math.exp(-nk * 5) : 0);
    if (entrada) { // entrada del sobre: de la pose de partida a la suya, sin saltos entre pantallas
      if (!entrada.at) entrada.at = t; // el primer fotograma en que se ve
      const f = clamp((t - entrada.at) / entrada.ms), e = entrada.rebote ? easeBack(f) : ease(f);
      if (!entrada.de) { // caída: parte de encima de la pantalla con su mismo tamaño
        entrada.de = {p: root.position.clone().add(new THREE.Vector3(0, vh * upp * .75, 0)), s: root.scale.x * .9, rz: .28};
      }
      root.position.lerpVectors(entrada.de.p, root.position, e);
      if (entrada.tilt != null) U.uTilt.value = entrada.tilt + (U.uTilt.value - entrada.tilt) * e; // el brillo del foil sigue donde estaba
      root.scale.setScalar(entrada.de.s + (root.scale.x - entrada.de.s) * e);
      pk.rotation.z += (entrada.de.rz || 0) * (1 - e);
      if (f >= 1) entrada = null;
    }
    key.position.x = 2 + Math.sin(s * .7) * .6;

    if (!openAt) {
      if (cutDirty) { shapeStrip(0, s); cutDirty = false; }
      rip.material.opacity = cut.hi - cut.lo > .01 ? 1 : 0;
      rip.scale.x = Math.max(.001, cut.hi - cut.lo); rip.position.x = (cut.lo + cut.hi) / 2 - .5;
      const touched = app.pack.classList.contains("touched"), gk = (s % 2) / 2;
      guide.material.opacity = touched || !app.zoomed ? 0 : Math.sin(gk * Math.PI) * .9;
      guide.position.x = -.46 + gk * .92;
    } else {
      const k = (t - openAt) / 1000;
      guide.material.opacity = 0; rip.material.opacity = Math.max(0, 1 - k * 4);
      // destello horizontal en la línea de corte
      const fk = clamp(k / .6);
      flare.scale.x = .3 + 2.6 * Math.min(1, fk * 4);
      flare.material.opacity = fk < .25 ? fk * 4 : Math.max(0, 1 - (fk - .25) / .75);
      // el trozo cortado sale volando hacia arriba, hacia el lado de su extremo suelto, ondulando y girando de canto
      if (k < .25) { cut = {lo: 0, hi: 1, tear: 1}; shapeStrip(0, s); }
      else if (sg.visible) {
        const f = clamp((k - .25) / 1.4);
        const lado = sueltoDer ? -1 : 1; // sujeta por la derecha (suelta por la izquierda): hacia la derecha
        sg.position.set(lado * bez(f, 0, .1, .65, 1.9), bez(f, 0, .3, .7, .45), bez(f, 0, .3, .2, 0));
        sg.rotation.set(1.9 * f, 0, -.45 * f * lado);
        shapeStrip(1 - f * .3, s);
        if (f >= 1) sg.visible = false;
      }
      // la boca se abre, brilla el borde y salen los rayos
      const open = ease(clamp((k - .3) / .5)) * .13;
      if (k < 1.1) shapeBody(open);
      rim.scale.set(1, 1, Math.max(.001, open));
      const fade = 1 - clamp((k - 1.5) / .45);
      rim.material.opacity = open / .13 * fade;
      beamMat.uniforms.uOpacity.value = clamp((k - .45) / .4) * fade;
      shadow.material.opacity = .55 * (1 - clamp(rk * 3));
      // la carta: amago hacia dentro, sube balanceándose; mientras el sobre se retira, vuela en arco hasta su sitio
      if (k > .7) mano.visible = true;
      halo.material.opacity = clamp((k - .75) / .4) * (1 - clamp((k - 2.3) / .3));
      const bk = (k - 1.05) / .6; // onda expansiva cuando la carta acaba de salir
      burst.material.opacity = bk > 0 && bk < 1 ? (1 - bk) ** 1.5 * 1.3 : 0;
      burst.scale.setScalar(.6 + 2.4 * ease(clamp(bk)));
      if (!cardFree) {
        const dip = k < .88 ? Math.sin(clamp((k - .72) / .16) * Math.PI) * .04 : 0;
        const e = clamp((k - .88) / .75);
        mano.position.y = CY0 - dip + cardRise(k);
        mano.rotation.z = Math.sin(k * 7) * .05 * (1 - ease(e));
        if (k >= 1.63) { // ya está fuera del todo: se suelta del sobre
          scene.attach(mano);
          cardFree = {p: mano.position.clone(), q: mano.quaternion.clone(), s: mano.scale.x};
          cardFree.t = worldTarget(cardFree.s);
          cardFree.c = new THREE.Vector3(cardFree.p.x, Math.max(cardFree.p.y + .3, cardFree.t.p.y + .25), .6);
        }
      } else {
        const f = clamp((k - 1.63) / .95), e = f < .5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
        const {p, c, t: T} = cardFree, a = (1 - e) * (1 - e), b2 = 2 * (1 - e) * e, c2 = e * e;
        mano.position.set(a * p.x + b2 * c.x + c2 * T.p.x, a * p.y + b2 * c.y + c2 * T.p.y, a * p.z + b2 * c.z + c2 * T.p.z);
        mano.quaternion.slerpQuaternions(cardFree.q, IDQ, e);
        mano.rotateY(Math.sin(e * Math.PI) * .45); // pequeño giro en el vuelo
        mano.scale.setScalar(cardFree.s + (T.s - cardFree.s) * e);
        UC.uTilt.value = Math.sin(e * Math.PI) * .6;
        if (f >= 1) root.visible = false; // el sobre ya se fue
      }
    }
    render();
  }
  // si las fuentes llegan tarde (sin conexión al arrancar), todo lo dibujado se redibuja con ellas en cuanto están
  if (!fuentesOk) {
    const alLlegar = () => {
      if (!fuentesCargadas()) return;
      document.fonts.removeEventListener("loadingdone", alLlegar);
      [frontTex, backTex, cardTex].forEach(t => { t.redraw(); renderer.initTexture(t); });
      caras.forEach((s, i) => { if (s.k) pintarEn(i, s.k); });
      selSobres.forEach(g => g.children.forEach(m => m.material.map.redraw()));
    };
    document.fonts.addEventListener("loadingdone", alLlegar);
  }
  // compilar shaders y subir texturas ahora (portada) y no en el primer fotograma del sobre
  pk.add(mano); mano.visible = true; verTaco(3); [rim, beam, flare, rip, guide, halo, burst].forEach(m => { m.visible = true; m.material.opacity = 1; });
  renderer.compile(scene, camera); renderer.compile(confScene, confCam);
  [frontTex, backTex, cardTex, ...caras.flatMap(c => [c.t, c.ft])].forEach(t => renderer.initTexture(t));
  pintarAhora();
  requestAnimationFrame(frame);
  reset();
  return {
    setCut(lo, hi, tear){
      if (hi - lo > .005 && !(lo < .005 && hi > .995)) sueltoDer = 1 - hi < lo;
      cut = {lo, hi, tear}; cutDirty = true;
    },
    reset, nudge(){ nudgeAt = performance.now(); },
    open(rect){ pintarYa(); openAt = performance.now(); target = rect || null; },
    party(){
      partyMode = true; scene.attach(mano); presagioAt = performance.now(); // misma pose; partyFrame la lleva a su sitio poco a poco
      traspaso = {p: mano.position.clone(), q: mano.quaternion.clone(), s: mano.scale.x, halo: halo.material.opacity};
    },
    // voltear la carta; especial: con giro y destello. Devuelve cuándo queda a la vista y cuándo acaba
    flip(especial){ flipAt = performance.now(); giro = !!especial; return giro ? {canto: GIRO_CANTO, fin: GIRO_MS} : {canto: 380, fin: 1150}; },
    exit(){ exitAt = performance.now(); return EXIT_MS; },
    // siguiente carta del sobre: la de ahora sale hacia (dx, dy) en pantalla (y hacia abajo); devuelve cuándo ya se ha ido
    siguiente(dx, dy){ swipe = {at: performance.now(), dx, dy: -dy, x0: dragX, y0: dragY}; dragX = dragY = 0; return SWIPE_MS; },
    // selector: eds en el orden de los huecos HTML (huecos() los devuelve); elegir(i) anima y devuelve su duración
    selector(eds, huecos){
      selScene.remove(...selSobres.values());
      sel = {items: eds.map(ed => ({g: sobreSel(ed), rx: 0, ry: 0})), huecos, elegido: -1, at: 0};
      sel.items.forEach(it => { it.g.rotation.set(0, 0, 0); selScene.add(it.g); });
    },
    elegir(i){ if (sel) { sel.elegido = i; sel.at = performance.now(); } return SEL_MS; },
    // entrada del sobre de rasgar: "selector" (continúa desde el sobre elegido) o "caida" (desde arriba, con rebote)
    entrar(desde){
      const pose = desde === "selector" && sel?.pose;
      entrada = pose ? {de: {p: pose.p.clone(), s: pose.s}, ms: 520, tilt: U.uTilt.value} : {ms: 650, rebote: true};
    },
    inclinar(i, x, y){ const it = sel?.items[i]; if (it) { it.ry = x * .5; it.rx = -y * .35; } }, // x, y de -1 a 1

    confeti,
  };
}
