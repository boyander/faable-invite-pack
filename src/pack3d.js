/* 3D pack (three.js, loaded on demand while the cover is showing).
   Deformable meshes: the strip curls vertex by vertex as it's torn and the body opens into a mouth.
   `app` provides the main flow's state, read every frame: P (pack rotation), pack (the invisible HTML pack,
   which marks the spot and gets the taps), cur (card tilt), flipped, zoomed, edicion, sobre (the pack's cards,
   which come out in a stack and are revealed one by one) and arrastre (how far the finger has moved the card to go to the next one).
   If WebGL or the library fail to load, it returns null and the CSS pack stays. */
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
  // 2x on the pack (heavier); on the celebration screen only the card is drawn and it uses the real density (3x on iPhone)
  // fixed density (the real one, up to 3x): changing it between pack and card reallocates the full-screen canvas
  // and on iPhone that caused a stutter right as the card came out and when going back to the pack
  renderer.setPixelRatio(DPR3);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // filmic tone mapping: highlights get compressed instead of blowing out to white
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
  // subdivided planes; vMin..vMax is their slice of the texture; the back ones are rotated 180°
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
  // additive light; alpha is added too so the transparent canvas stays valid premultiplied
  // (color without alpha: Chrome composites it, but iPhone Safari paints it as black dots)
  const GLOW = {transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor};
  // .opacity still works like on regular materials: it writes to the uniform
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
  // mouth: a glowing ring that widens as it opens
  const ringPts = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * .485, 0, Math.sin(a))); }
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ringPts, true), 96, .007, 6, true),
    new THREE.MeshBasicMaterial({color: 0xaee9ff, opacity: 0, ...GLOW, premultipliedAlpha: true})); // color × opacity
  rim.position.y = CUT; pk.add(rim);
  const beamMat = new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, uniforms: {uTime: U.uTime, uOpacity: {value: 0}},
    ...GLOW, blendSrc: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor});
  const beam = add(beamMat, 2.2, 1.6); beam.position.set(0, CUT + .8, -.03); // behind the card: the card covers it
  const CW = .76, CH = CW * 88 / 63, CY0 = CUT - CH / 2 - .04;
  // the card: back and face, back to back (transparent: the rounded corners are transparent)
  // at their final size from the start: if the canvas changes size after uploading the texture, the GPU doesn't update it.
  // Two faces that take turns: the visible one and the pack's next card, already drawn and uploaded before switching to it
  const FACE_SCALE = texScale(340, 680);
  // each with its own separate photo (with margin, for parallax), also fixed-size
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
  const artOnU = {value: 1}; // holo over the illustration: softer on top of a photo
  // rarity of the visible card: frame (silver or holo), aura tint and card-back glow before flipping it
  const bordeU = {value: 0}, irisU = {value: .55}, baseU = {value: new THREE.Vector3(1, .78, .3)};
  let brillo = 0;
  // the pack's cards (drawn on the free face, when the browser is idle); if the edition changes, the pack and card back too
  let edicionDe = app.edicion, cara = 0, mostrada = 0; // mostrada: which of the pack's cards is showing
  function pintarEn(i, k){
    const s = caras[i]; s.k = k;
    const pinta = img => {
      if (s.k !== k) return;
      drawCarta(s.c, k.d, img, {num: k.num, total: k.total, scale: FACE_SCALE});
      s.t.needsUpdate = true; renderer.initTexture(s.t); // uploaded now, not in the middle of an animation
      s.conFoto = !!img && rareza(k.d) === "especial"; // parallax only on specials
      if (s.conFoto) { s.limite = drawFoto(s.fc, k.d, img, FACE_SCALE); s.ft.needsUpdate = true; renderer.initTexture(s.ft); }
      if (caras[cara] === s) { fotoOnU.value = s.conFoto ? 1 : 0; limiteU.value.set(...s.limite); }
    };
    if (!k.d.foto) return pinta(null);
    cargarFoto(k.d.foto).then(pinta, () => pinta(null));
  }
  function ver(k){ // card k goes onto the card face (with its rarity's colors)
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
    if (!partyMode && !openAt) { mostrada = 0; ver(S[0]); } // unopened pack: the first one
    preparar(S[mostrada + 1]);
  }
  // the next pack's card is drawn and uploaded to the GPU when the browser is idle, not while the pack comes in
  // (it was a long frame right when going back to the pack); if it's opened earlier, it's done at that point
  let pendiente = null;
  const enReposo = fn => window.requestIdleCallback ? requestIdleCallback(fn, {timeout: 900}) : setTimeout(fn, 700);
  const cancelar = id => window.cancelIdleCallback ? cancelIdleCallback(id) : clearTimeout(id);
  function pintarCara(){
    if (pendiente) cancelar(pendiente);
    if (edicionDe !== app.edicion) return pintarAhora(); // pack changed with the button: shown immediately
    pendiente = enReposo(() => { pendiente = null; pintarAhora(); });
  }
  function pintarYa(){ if (pendiente) { cancelar(pendiente); pendiente = null; pintarAhora(); } }
  document.addEventListener("carta", pintarCara);
  // hand: the card and, below it, the stack with the pack's remaining cards, aligned and with thickness (tilting it shows the
  // edges and how many are left). The hand moves (leaves the pack, flies, tilts); inside it, the top card flips
  // and slides away, and the next one is already underneath
  const mano = new THREE.Group(), card = new THREE.Group(), taco = new THREE.Group();
  const destelloU = {value: 0}; // reveal of a special: white light crossing the face
  const cardBack = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), materialCarta(THREE, cardTex, {...UC, uArtOn: {value: 0}, uBorde: {value: 0}}, "reverso"));
  const cardFront = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), materialCarta(THREE, caras[0].t, {...UC, uArtOn: artOnU, uBorde: bordeU, uDestello: destelloU,
    uFoto: fotoU, uFotoOn: fotoOnU, uParal: paralU, uLimite: limiteU}, "cara"));
  cardFront.rotation.y = Math.PI;
  card.rotation.order = "ZYX"; // the lean (z) is applied outside the flip (y): it looks the same face up and face down
  // edge: the card's rounded outline extruded (no caps). A card is GROSOR thick (exaggerated so it shows) and in
  // the stack they're separated by HUECO: each one PASO from the next, so they can be told apart when it's tilted
  const GROSOR = .022, HUECO = .026, PASO = GROSOR + HUECO, RC = CW * .054, forma = new THREE.Shape();
  forma.moveTo(-CW / 2 + RC, -CH / 2);
  [[CW / 2 - RC, -CH / 2 + RC, -Math.PI / 2], [CW / 2 - RC, CH / 2 - RC, 0], [-CW / 2 + RC, CH / 2 - RC, Math.PI / 2], [-CW / 2 + RC, -CH / 2 + RC, Math.PI]]
    .forEach(([x, y, a0]) => forma.absarc(x, y, RC, a0, a0 + Math.PI / 2, false));
  const cantoGeo = new THREE.ExtrudeGeometry(forma, {depth: 1, bevelEnabled: false, curveSegments: 5});
  const sinTapas = new THREE.MeshBasicMaterial({visible: false});
  const canto = (n, hueco = 0) => new THREE.Mesh(cantoGeo, [sinTapas, new THREE.ShaderMaterial({vertexShader: CANTO_VERT, fragmentShader: CANTO_FRAG,
    uniforms: {uN: {value: n}, uHueco: {value: hueco}}})]);
  const cantoCarta = canto(1); cantoCarta.scale.z = GROSOR; cantoCarta.position.z = -GROSOR / 2;
  // stack: a single edge with n layers (with its gap above each) and each card's back on top of it (visible through
  // the gaps, and the next one's when the top card lifts)
  const pila = canto(1, HUECO / PASO), tapas = [0, 1, 2, 3].map(j => {
    const m = new THREE.Mesh(cardBack.geometry, cardBack.material);
    m.position.z = -GROSOR / 2 - HUECO - j * PASO - .0005; return m;
  });
  taco.add(pila, ...tapas);
  let tacoN = 0;
  function verTaco(n){
    halo.position.z = -GROSOR / 2 - PASO * n - .02; // the aura, behind the whole stack
    tacoN = n; taco.visible = n > 0; if (!n) return;
    pila.scale.z = PASO * n; pila.position.z = -GROSOR / 2 - PASO * n; pila.material[1].uniforms.uN.value = n;
    tapas.forEach((m, j) => { m.visible = j < n; });
  }
  // star flares on the face (hence rotated like it): a big one in the corner when a special is revealed
  // and sparks twinkling around rares and specials
  const estrella = (x, y, w) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), glow("estrella", 0xfff8e8)); m.position.set(x, y, -.03); m.rotation.y = Math.PI; card.add(m); return m; };
  const fogonazo = estrella(-CW / 2 + .06, CH / 2 - .06, CW * 1.3); // top right of the face (x mirrored when flipped)
  const chispas = [[CW / 2 + .02, CH * .18], [-CW / 2 - .03, -CH * .22], [CW * .2, -CH / 2 - .03], [-CW * .25, CH / 2 + .02], [CW / 2 - .02, -CH / 2 + .05]]
    .map(([x, y], i) => estrella(x, y, CW * (i % 2 ? .32 : .42)));
  // aura that follows the card (driven by halo.material.opacity) and a shockwave once it's out of the pack
  // (a large camera-facing plane behind the stack; the shader draws the shape around the visible silhouette)
  const AW = CW * 2.7, AH = CH * 2.1, auraU = {value: 0};
  const auraS = {uPoly: {value: Array.from({length: 24}, () => new THREE.Vector2())}, uN: {value: 0}, uRad: {value: 0}, uEsc: {value: 1}, uCentro: {value: new THREE.Vector2()}};
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(AW, AH), withOpacity(new THREE.ShaderMaterial({vertexShader: BEAM_VERT, fragmentShader: AURA_FRAG,
    uniforms: {uTime: U.uTime, uOpacity: auraU, uIris: irisU, uBase: baseU, ...auraS}, ...GLOW}), auraU));
  const burst = new THREE.Mesh(new THREE.PlaneGeometry(CW * 1.7, CW * 1.7), glow("ring", 0xfff0c8));
  // the aura lives in the hand (behind the stack, facing the camera); the shockwave, with the card
  burst.position.z = -.02; card.add(burst, cardBack, cardFront, cantoCarta);
  mano.add(halo, taco, card);

  /* --- GPU confetti: a ring buffer of pieces; each flies on its own in the vertex shader (shaders.js) --- */
  const CONF_N = 900, T0 = performance.now();
  const reloj = () => (performance.now() - T0) / 1000;
  const confGeo = new THREE.InstancedBufferGeometry(), quad = new THREE.PlaneGeometry(1, 1);
  confGeo.index = quad.index; confGeo.setAttribute("position", quad.getAttribute("position")); confGeo.setAttribute("uv", quad.getAttribute("uv"));
  const cattr = (name, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CONF_N * n), n); a.setUsage(THREE.DynamicDrawUsage); confGeo.setAttribute(name, a); return a; };
  const aStart = cattr("aStart", 3), aVel = cattr("aVel", 2), aSize = cattr("aSize", 2), aSpin = cattr("aSpin", 2), aColor = cattr("aColor", 3), aShapeLife = cattr("aShapeLife", 2);
  for (let i = 0; i < CONF_N; i++) aStart.setZ(i, -1e4); // free
  confGeo.instanceCount = CONF_N;
  const confU = {uNow: {value: 0}};
  const confMesh = new THREE.Mesh(confGeo, new THREE.ShaderMaterial({vertexShader: CONF_VERT, fragmentShader: CONF_FRAG, uniforms: confU,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor}));
  confMesh.frustumCulled = false;
  const confScene = new THREE.Scene(); confScene.add(confMesh);
  const confCam = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10); // CSS pixels, y pointing down (the shader flips it)
  // sRGB values as-is (not converted to linear): the shader writes them directly, like the 2D confetti
  const CONF_COL = ["#ffcb05", "#e3350d", "#2a75bb", "#ffffff", "#2ecc71", "#ff6ec7", "#7ff3ff"]
    .map(h => new THREE.Color().setHex(parseInt(h.slice(1), 16), THREE.LinearSRGBColorSpace));
  let confI = 0, confHasta = 0;
  // same parameters as the 2D confetti (confeti.js): speeds in pixels per frame at 60 fps
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
  // the aura and shockwave follow the card but always face the camera: if they tilted with it (tilted stack,
  // flip) they'd look like a flat sticker
  const qCara = new THREE.Quaternion();
  const encarar = m => { m.parent.getWorldQuaternion(qCara).invert(); m.quaternion.copy(qCara); };
  // the scene and, on top, the confetti (only while some is still in the air)
  // aura silhouette: the card's corners (front and back) and those of the bottom of the stack, projected to
  // canvas pixels, and their convex hull
  const vS = new THREE.Vector3(), buf = new THREE.Vector2(), ESQ = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  function silueta(){
    scene.updateMatrixWorld();
    renderer.getDrawingBufferSize(buf);
    const px = (obj, x, y, z) => { vS.set(x, y, z).applyMatrix4(obj.matrixWorld).project(camera); return [(vS.x * .5 + .5) * buf.x, (vS.y * .5 + .5) * buf.y]; };
    // truly rounded corners (three points per corner), without rounding the thickness: edge-on, the silhouette is
    // as thin as the card (otherwise the aura's hole showed as a black band when flipping it)
    const ix = CW / 2 - RC, iy = CH / 2 - RC, pts = [];
    for (const [sx, sy] of ESQ) for (const a of [0, Math.PI / 4, Math.PI / 2]) {
      const x = sx * (ix + RC * Math.cos(a)), y = sy * (iy + RC * Math.sin(a));
      pts.push(px(card, x, y, GROSOR / 2), px(card, x, y, -GROSOR / 2));
      if (taco.visible && a !== Math.PI / 4) pts.push(px(taco, x, y, pila.position.z));
    }
    // convex hull (monotone chain)
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const cadena = L => { const h = []; for (const p of L) { while (h.length > 1 && cruz(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
    const hull = [...cadena(pts), ...cadena(pts.slice().reverse())].slice(0, 24);
    hull.forEach((p, i) => auraS.uPoly.value[i].set(p[0], p[1]));
    auraS.uN.value = hull.length;
    // scale by the card's height (when flipping, edge-on, the width shrinks to nothing)
    const a = px(card, 0, CH / 2, 0), b = px(card, 0, -CH / 2, 0), alto = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
    auraS.uEsc.value = alto * CW / CH;
    auraS.uRad.value = 0; // the corners are already in the silhouette
    auraS.uCentro.value.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  function render(sc = scene){
    if (sc === scene) { encarar(halo); encarar(burst); if (halo.material.opacity > 0) silueta(); ajustarParalaje(cardFront, camera, paralU); }
    renderer.render(sc, camera);
    confU.uNow.value = reloj();
    if (confU.uNow.value < confHasta) { renderer.autoClear = false; renderer.render(confScene, confCam); renderer.autoClear = true; }
  }

  /* --- deformations --- */
  const smooth = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
  function shapeBody(open){ // pillow + open mouth
    for (const [g, s] of [[bodyF, 1], [bodyB, -1]]) {
      const b = g.userData.base, pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const nx = b[i * 3] / (W / 2), ny = (b[i * 3 + 1] - BCY) / (BH / 2);
        // the puffiness ends before the sealed strips: at the tear seam at the top, at the bottom strip below
        const pillow = T * (1 - nx ** 4) * (1 - Math.max(smooth(.86, 1, ny), smooth(.72, .8, -ny)));
        const mouth = open * (1 - nx * nx) * smooth(.45, 1, ny);
        pos.setZ(i, s * (pillow + mouth + .004)); // +.004: the two faces never coincide (otherwise they z-fight)
      }
      pos.needsUpdate = true; g.computeVertexNormals();
    }
  }
  /* --- pack picker: one 3D pack per edition (same holo foil), fitted into the picker's HTML slots --- */
  const selScene = new THREE.Scene();
  selScene.environment = scene.environment;
  selScene.add(new THREE.AmbientLight(0xffffff, .55), key.clone(), rimL.clone());
  // a single piece per face with the pillow puff (softer at the sealed strips at top and bottom)
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
  const selGeoF = selGeo(false), selGeoB = selGeo(true), selSobres = new Map(); // edition → group (created once)
  const sobreSel = ed => {
    if (!selSobres.has(ed)) {
      const g = new THREE.Group();
      const esc = texScale(200, 512); // picker packs are at most ~200 px
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
      const k = sel.elegido < 0 ? 1 : el ? 1 + .16 * ke : 1 - ke; // the chosen one grows and comes closer; the others shrink
      it.g.visible = k > .02;
      // the chosen one also moves to the screen center (otherwise one on the side goes off the edge as it grows)
      const x = (r.left + r.width / 2 - cr.left - vw / 2) * upp, y = -(r.top + r.height / 2 - cr.top - vh / 2) * upp;
      const hacia = el ? ke : 0;
      it.g.position.set(x * (1 - hacia), y * (1 - hacia) + Math.sin(s * 1.9 + i * 1.7) * .05 * esc * (1 - ke), (el ? .6 : 0) * ke);
      it.g.scale.setScalar(esc * k);
      if (el) sel.pose = {p: it.g.position.clone(), s: esc * k}; // the tear pack starts from here (seamless entrance)
      // gentle out-of-phase sway plus the finger tilt; the chosen one turns to face front
      const ry = Math.sin(s * .8 + i * 2.1) * .2 + it.ry, rx = Math.cos(s * .6 + i) * .07 + it.rx;
      it.g.rotation.y += ((el ? 0 : ry) - it.g.rotation.y) * .12;
      it.g.rotation.x += ((el ? 0 : rx) - it.g.rotation.x) * .12;
    });
    U.uTilt.value = Math.sin(s * .7) * .5; // the foil's rainbow and shine move on their own
  }
  let cut = {lo: 0, hi: 0, tear: 0}, cutDirty = true;
  // which end of the strip is loose: the one the tear leaves closest to its edge. It's kept when the tear completes
  // (tearing right to left, the strip stays attached on the left and flies off to the left)
  let sueltoDer = false;
  function shapeStrip(wave, t){ // the torn part curls toward the camera from the loose end
    const {lo, hi, tear} = cut, k = Math.min(1, tear * 2 + .3);
    for (const [g, flip] of [[stripF, false], [stripB, true]]) {
      const b = g.userData.base, pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3], u = (flip ? -x : x) / W + .5, h = (b[i * 3 + 1] - CUT) / SH;
        // The torn part [lo, hi] stays attached at the ends of the tear that don't reach the edge; as the tear nears
        // an edge that attachment gradually lets go (sL/sR). The shape blends three, all smooth (no creases):
        //  - slot (attached on both sides): an outward sine arch
        //  - loose on the left or on the right: it rolls up like a sticker from the remaining attachment
        // Blending them with continuous weights avoids creases and jumps from one side to the other.
        let px = u, z = 0, y = b[i * 3 + 1];
        if (hi - lo > .005) {
          const sL = smooth(0, .12, lo), sR = smooth(0, .12, 1 - hi);
          const entero = (1 - sL) * (1 - sR); // torn edge to edge: still attached on the side opposite the loose one
          const wB = sL * sR, wL = sL * (1 - sR) + (sueltoDer ? entero : 0), wR = (1 - sL) * sR + (sueltoDer ? 0 : entero);
          const kap = 1.25 * k + .01;
          const roll = (w, d, tip, dir) => { // rolled around tip; d = distance to tip along the strip
            const phi = d * kap, lift = (1 - Math.cos(phi)) / kap;
            px += w * (tip + dir * Math.sin(phi) / kap - u);
            z += w * (lift * .9 + h * d * .16 * k);   // the top edge bends a bit more
            y += w * lift * .35;                      // and the peeled part rises: it reads as a sticker lifting
          };
          if (wR > 0 && u <= hi) roll(wR, hi - u, hi, -1); // loose on the left: attached at hi
          if (wL > 0 && u >= lo) roll(wL, u - lo, lo, 1);  // loose on the right: attached at lo
          if (wB > 0 && u > lo && u < hi) {
            const arch = Math.sin(Math.PI * (u - lo) / (hi - lo)) ** 2 * (hi - lo) * .5; // sine²: leaves the strip without a corner
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

  /* --- placement: the 3D pack sits exactly where the (invisible) CSS pack is --- */
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
  // 3D-world position/size of the celebration screen's card, to land right on top of it
  function worldTarget(s0){
    if (!target) return {p: new THREE.Vector3(0, 0, 0), s: s0 * 1.2};
    const cr = canvas.getBoundingClientRect();
    const cx = target.x + target.w / 2 - cr.left, cy = target.y + target.h / 2 - cr.top;
    return {p: new THREE.Vector3((cx - vw / 2) * upp, -(cy - vh / 2) * upp, 0), s: target.h * upp / CH};
  }
  const ease = v => 1 - (1 - v) ** 3, clamp = v => Math.min(1, Math.max(0, v));
  const easeBack = v => 1 + 2.2 * (v - 1) ** 3 + 1.2 * (v - 1) ** 2; // overshoots a little and comes back
  const cardRise = k => ease(clamp((k - .88) / .75)) * (CH + .12); // rises until it's fully out of the mouth
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
    pintarCara(); // this pack's cards (if already drawn, they're just applied)
    shapeBody(0);
    [rip, flare, guide, halo, burst].forEach(m => m.material.opacity = 0);
    rim.material.opacity = 0; beamMat.uniforms.uOpacity.value = 0; shadow.material.opacity = .55;
  }

  let partyMode = false, flipAt = 0, exitAt = 0, shown = false, entrada = null, traspaso = null;
  let swipe = null, dragX = 0, dragY = 0, presagioAt = 0; // swipe: the card moves away and the next one in the stack comes up
  const EXIT_MS = 760, SWIPE_MS = 260, GIRO_MS = 1800, GIRO_CANTO = 1150;
  let giro = false, inclina = 1, sentidoX = 1; // the card being flipped is special: a turn and a half with a flash
  // on the celebration screen, the hand sits over the invisible HTML card and tilts with the finger; the card flips inside it
  function partyFrame(t){
    const r = document.querySelector("#cardStage").getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    if (!r.width) return;
    const tx = (r.left + r.width / 2 - cr.left - vw / 2) * upp, ty = -(r.top + r.height / 2 - cr.top - vh / 2) * upp, ts = r.height * upp / CH;
    let ang = app.flipped ? Math.PI : 0, lift = 0;
    let giroY = 0;
    destelloU.value = 0;
    if (flipAt && giro) { // special: lifts, does a turn and a half while a white flash crosses it, and settles
      const fk = clamp((t - flipAt) / GIRO_MS), g = clamp((fk - .05) / .62);
      ang = Math.PI * 3 * (g < .5 ? 4 * g * g * g : 1 - (-2 * g + 2) ** 3 / 2);
      lift = fk < .12 ? ease(fk / .12) : fk < .7 ? 1 : 1 - ease((fk - .7) / .3);
      giroY = Math.sin(fk * Math.PI) * .22; // the hand leans while it spins, like in the game
      destelloU.value = clamp(1 - Math.abs(fk - .6) / .2) ** 1.5;
    } else if (flipAt) { // like the CSS animation: lifts, flips with a slight overshoot and settles
      const fk = clamp((t - flipAt) / 1100), D = Math.PI / 180;
      if (fk < .35) { const e = ease(fk / .35); ang = 70 * D * e; lift = e; }
      else if (fk < .7) { const e = (fk - .35) / .35, sm = e * e * (3 - 2 * e); ang = (70 + 122 * sm) * D; lift = 1 - .7 * sm; }
      else { const e = ease((fk - .7) / .3); ang = (192 - 12 * e) * D; lift = .3 * (1 - e); }
    }
    // tilt from the finger (or the idle sway): with the stack face down it tilts more, so its edge shows
    // and how many are left (perspective hides the bottom of the stack behind the card if it tilts only a little)
    inclina += ((app.flipped || flipAt ? 1 : 3) - inclina) * .08;
    // face down, the side the finger moves toward comes closer and shows its edges (horizontally as well as vertically);
    // face up, as usual (the touched side moves away), for the holo
    sentidoX += ((app.flipped || flipAt ? 1 : -1) - sentidoX) * .08;
    const tiltX = (.5 - app.cur.py) * .42, tiltY = (app.cur.px - .5) * .42;
    // on arrival, if there are more cards below, the stack rocks side to side on its own to show itself
    const ik = clamp((t - presagioAt - 250) / 1900);
    const ensena = !app.flipped && !flipAt && mostrada < app.sobre.length - 1 ? Math.sin(ik * Math.PI * 2) * Math.sin(ik * Math.PI) * .7 : 0;
    mano.position.set(tx, ty, 0);
    mano.rotation.set(tiltX * .7 * inclina + Math.abs(ensena) * .25, tiltY * .9 * inclina * sentidoX + giroY + ensena, 0);
    mano.scale.setScalar(ts);
    // the card inside the hand (in hand units: world values are divided by ts): flip, lift and the finger drag
    dragX += ((app.arrastre?.x || 0) * upp / ts - dragX) * .5;
    dragY += (-(app.arrastre?.y || 0) * upp / ts - dragY) * .5;
    // the special one spins without coming as close (otherwise it goes off screen when it leans)
    card.position.set(dragX, dragY + lift * (giro ? 18 : 40) * upp / ts, lift * (giro ? .12 : .6) / ts);
    card.rotation.set(0, ang, -dragX * .3);
    card.scale.setScalar(1 + lift * (giro ? -.1 : .1));
    // rarity glow while face down (it pulses; the special one also trembles) and it fades when flipped
    const late = .62 + .38 * Math.sin(t / 1000 * 5.5);
    let aura = 0;
    if (!app.flipped && !flipAt) aura = brillo * late * clamp((t - presagioAt) / 700);
    else if (flipAt) aura = brillo * Math.max(0, 1 - (t - flipAt) / 450);
    if (!app.flipped && !flipAt && brillo >= 1) card.rotation.z += Math.sin(t / 1000 * 38) * .012 * clamp((t - presagioAt - 400) / 600);
    if (swipe) { // the card slides flat toward the finger's side; underneath, in the stack, the next one is already there
      const f = (t - swipe.at) / SWIPE_MS;
      if (f < 1) {
        const e = f * .35 + f * f * .65, lejos = Math.max(vw, vh) * 1.15 * upp / ts; // leaves already at speed
        card.position.set(swipe.x0 + swipe.dx * e * lejos, swipe.y0 + swipe.dy * e * lejos, .004);
        card.rotation.set(0, Math.PI, -swipe.x0 * .3 - swipe.dx * .25 * e);
        aura = 0;
      } else { // now off screen: the top one becomes the next (it's right underneath: the swap isn't noticeable)
        swipe = null; mostrada++; flipAt = 0; presagioAt = t;
        ver(app.sobre[mostrada]); verTaco(app.sobre.length - 1 - mostrada);
        enReposo(() => preparar(app.sobre[mostrada + 1]));
        card.position.set(0, 0, 0); card.rotation.set(0, 0, 0); card.scale.setScalar(1);
      }
    }
    halo.material.opacity = aura; burst.material.opacity = 0;
    // while a special spins, the stack behind shrinks behind the card and comes back when it's done
    const gk = flipAt && giro ? t - flipAt : 1e9;
    const esconde = gk < 250 ? ease(gk / 250) : gk < GIRO_MS + 200 ? 1 : 1 - ease(clamp((gk - GIRO_MS - 200) / 450));
    taco.scale.setScalar(Math.max(.001, 1 - esconde)); taco.visible = tacoN > 0 && esconde < .999;
    // on reveal: a star burst in the corner (special) and sparks twinkling around (rare and special)
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
    if (traspaso) { // from the flight out of the pack to its spot on the celebration screen: it glides from its last pose, without a jump
      if (!traspaso.at) traspaso.at = t;
      const f = ease(clamp((t - traspaso.at) / 380)), q = mano.quaternion.clone();
      mano.position.lerpVectors(traspaso.p, mano.position, f);
      mano.quaternion.slerpQuaternions(traspaso.q, q, f);
      mano.scale.setScalar(traspaso.s + (mano.scale.x - traspaso.s) * f);
      halo.material.opacity = Math.max(aura, traspaso.halo * (1 - f)); // the aura fades out instead of cutting off
      if (f >= 1) traspaso = null;
    }
    if (exitAt) { // exit: a feint downward, then it shoots up spinning, shrinking, with a shine
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
    place(); // every frame: follows the CSS pack's zoom
    const s = t / 1000;
    U.uTime.value = s;
    U.uTilt.value = app.P.ry / 60 + app.P.rx / 40;
    // pose: the physics (rotation, sway, drop) is still driven by the pack's JS in P
    // at the end of the opening the pack withdraws: it drops, tilts back and shrinks
    // while the card comes out, the pack is already moving down (so the card doesn't go off the top of the screen)
    const ok = openAt ? (t - openAt) / 1000 : 0, rk = openAt ? clamp((ok - 1.6) / .8) : 0;
    const pre = openAt ? .55 * cardRise(ok) * root.scale.x : 0;
    root.position.set(root.userData.x || 0, (root.userData.y || 0) - app.P.dy * upp + (openAt ? 0 : Math.sin(s * 1.96) * .025) - pre - rk * rk * vh * upp * .95, 0);
    root.scale.multiplyScalar(1 - .12 * rk);
    const nk = (t - nudgeAt) / 1000;
    pk.rotation.set(THREE.MathUtils.degToRad(-app.P.rx) - .5 * rk, THREE.MathUtils.degToRad(app.P.ry), nk < 1 ? Math.sin(nk * 26) * .07 * Math.exp(-nk * 5) : 0);
    if (entrada) { // pack entrance: from the starting pose to its own, with no jumps between screens
      if (!entrada.at) entrada.at = t; // the first frame it's visible
      const f = clamp((t - entrada.at) / entrada.ms), e = entrada.rebote ? easeBack(f) : ease(f);
      if (!entrada.de) { // drop: starts above the screen at its own size
        entrada.de = {p: root.position.clone().add(new THREE.Vector3(0, vh * upp * .75, 0)), s: root.scale.x * .9, rz: .28};
      }
      root.position.lerpVectors(entrada.de.p, root.position, e);
      if (entrada.tilt != null) U.uTilt.value = entrada.tilt + (U.uTilt.value - entrada.tilt) * e; // the foil shine carries on from where it was
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
      // horizontal flash along the tear line
      const fk = clamp(k / .6);
      flare.scale.x = .3 + 2.6 * Math.min(1, fk * 4);
      flare.material.opacity = fk < .25 ? fk * 4 : Math.max(0, 1 - (fk - .25) / .75);
      // the torn piece flies up, toward its loose end's side, rippling and spinning edge-on
      if (k < .25) { cut = {lo: 0, hi: 1, tear: 1}; shapeStrip(0, s); }
      else if (sg.visible) {
        const f = clamp((k - .25) / 1.4);
        const lado = sueltoDer ? -1 : 1; // attached on the right (loose on the left): to the right
        sg.position.set(lado * bez(f, 0, .1, .65, 1.9), bez(f, 0, .3, .7, .45), bez(f, 0, .3, .2, 0));
        sg.rotation.set(1.9 * f, 0, -.45 * f * lado);
        shapeStrip(1 - f * .3, s);
        if (f >= 1) sg.visible = false;
      }
      // the mouth opens, the rim glows and the rays come out
      const open = ease(clamp((k - .3) / .5)) * .13;
      if (k < 1.1) shapeBody(open);
      rim.scale.set(1, 1, Math.max(.001, open));
      const fade = 1 - clamp((k - 1.5) / .45);
      rim.material.opacity = open / .13 * fade;
      beamMat.uniforms.uOpacity.value = clamp((k - .45) / .4) * fade;
      shadow.material.opacity = .55 * (1 - clamp(rk * 3));
      // the card: a feint inward, rises swaying; while the pack withdraws, it arcs to its spot
      if (k > .7) mano.visible = true;
      halo.material.opacity = clamp((k - .75) / .4) * (1 - clamp((k - 2.3) / .3));
      const bk = (k - 1.05) / .6; // shockwave right as the card gets out
      burst.material.opacity = bk > 0 && bk < 1 ? (1 - bk) ** 1.5 * 1.3 : 0;
      burst.scale.setScalar(.6 + 2.4 * ease(clamp(bk)));
      if (!cardFree) {
        const dip = k < .88 ? Math.sin(clamp((k - .72) / .16) * Math.PI) * .04 : 0;
        const e = clamp((k - .88) / .75);
        mano.position.y = CY0 - dip + cardRise(k);
        mano.rotation.z = Math.sin(k * 7) * .05 * (1 - ease(e));
        if (k >= 1.63) { // fully out now: it detaches from the pack
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
        mano.rotateY(Math.sin(e * Math.PI) * .45); // a small spin in flight
        mano.scale.setScalar(cardFree.s + (T.s - cardFree.s) * e);
        UC.uTilt.value = Math.sin(e * Math.PI) * .6;
        if (f >= 1) root.visible = false; // the pack is gone
      }
    }
    render();
  }
  // if the fonts arrive late (offline at startup), everything drawn is redrawn with them as soon as they're in
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
  // compile shaders and upload textures now (on the cover) rather than on the pack's first frame
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
      partyMode = true; scene.attach(mano); presagioAt = performance.now(); // same pose; partyFrame eases it into place
      traspaso = {p: mano.position.clone(), q: mano.quaternion.clone(), s: mano.scale.x, halo: halo.material.opacity};
    },
    // flip the card; special: with a spin and flash. Returns when it's visible and when it ends
    flip(especial){ flipAt = performance.now(); giro = !!especial; return giro ? {canto: GIRO_CANTO, fin: GIRO_MS} : {canto: 380, fin: 1150}; },
    exit(){ exitAt = performance.now(); return EXIT_MS; },
    // the pack's next card: the current one leaves toward (dx, dy) on screen (y down); returns when it's gone
    siguiente(dx, dy){ swipe = {at: performance.now(), dx, dy: -dy, x0: dragX, y0: dragY}; dragX = dragY = 0; return SWIPE_MS; },
    // picker: eds in the order of the HTML slots (huecos() returns them); elegir(i) animates and returns its duration
    selector(eds, huecos){
      selScene.remove(...selSobres.values());
      sel = {items: eds.map(ed => ({g: sobreSel(ed), rx: 0, ry: 0})), huecos, elegido: -1, at: 0};
      sel.items.forEach(it => { it.g.rotation.set(0, 0, 0); selScene.add(it.g); });
    },
    elegir(i){ if (sel) { sel.elegido = i; sel.at = performance.now(); } return SEL_MS; },
    // tear pack entrance: "selector" (continues from the chosen pack) or "caida" (from above, with a bounce)
    entrar(desde){
      const pose = desde === "selector" && sel?.pose;
      entrada = pose ? {de: {p: pose.p.clone(), s: pose.s}, ms: 520, tilt: U.uTilt.value} : {ms: 650, rebote: true};
    },
    inclinar(i, x, y){ const it = sel?.items[i]; if (it) { it.ry = x * .5; it.rx = -y * .35; } }, // x, y from -1 to 1

    confeti,
  };
}
