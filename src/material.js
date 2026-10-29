/* Material de las caras de una carta 3D (la textura más el holográfico de shaders.js). Lo usan el sobre y el visor del editor.
   u: uniforms compartidos {uTilt, uArt, uArtOn, uBorde}; las caras que no llevan holo pasan uArtOn y uBorde a 0.
   Con foto (paralaje), además uFoto (textura de drawFoto), uFotoOn, uLimite (lo que devuelve drawFoto) y uParal, que se
   ajusta cada fotograma con paralaje() */
import { CARD_HEAD, CARD_BODY } from "./shaders.js";
import { FOTO_UV, PARALAJE } from "./carta.js";

export function materialCarta(THREE, map, u, clave){
  const m = new THREE.MeshBasicMaterial({map, transparent: true, toneMapped: false}); // transparent: esquinas redondeadas
  const base = {uDestello: {value: 0}, uFoto: {value: null}, uFotoOn: {value: 0}, uFotoRect: {value: new THREE.Vector4(...FOTO_UV)},
    uParal: {value: new THREE.Vector2()}, uMargen: {value: PARALAJE}, uLimite: {value: new THREE.Vector4()}};
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, base, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + CARD_HEAD)
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + CARD_BODY);
  };
  m.customProgramCacheKey = () => "carta-" + clave;
  return m;
}

// desplazamiento de la foto según desde dónde mira la cámara a la cara (mesh): como si estuviera hundida tras el marco.
// u: el uniform uParal de esa cara. Devuelve la función que lo ajusta (llamarla antes de dibujar)
export function paralaje(THREE, fuerza = .2){
  const v = new THREE.Vector3(), tope = PARALAJE / (1 + 2 * PARALAJE) * .95;
  return (mesh, camera, u) => {
    mesh.updateWorldMatrix(true, false);
    mesh.worldToLocal(v.copy(camera.position)).normalize();
    if (v.z < .05) return u.value.set(0, 0); // de espaldas
    const k = fuerza / (1 + 2 * PARALAJE), c = x => Math.max(-tope, Math.min(tope, x));
    u.value.set(c(-v.x / v.z * k), c(-v.y / v.z * k));
  };
}
