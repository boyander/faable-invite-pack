/* Material for the faces of a 3D card (the texture plus the holo from shaders.js). Used by the 3D pack.
   u: shared uniforms {uTilt, uArt, uArtOn, uBorde}; faces without holo set uArtOn and uBorde to 0.
   With a photo (parallax), also uFoto (texture from drawFoto), uFotoOn, uLimite (what drawFoto returns) and uParal, which is
   updated every frame with paralaje() */
import { CARD_HEAD, CARD_BODY } from "./shaders.js";
import { FOTO_UV, PARALAJE } from "./carta.js";

export function materialCarta(THREE, map, u, clave){
  const m = new THREE.MeshBasicMaterial({map, transparent: true, toneMapped: false}); // transparent: rounded corners
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

// shifts the photo depending on where the camera views the face (mesh) from: as if it were sunk behind the frame.
// u: that face's uParal uniform. Returns the function that updates it (call it before rendering)
export function paralaje(THREE, fuerza = .2){
  const v = new THREE.Vector3(), tope = PARALAJE / (1 + 2 * PARALAJE) * .95;
  return (mesh, camera, u) => {
    mesh.updateWorldMatrix(true, false);
    mesh.worldToLocal(v.copy(camera.position)).normalize();
    if (v.z < .05) return u.value.set(0, 0); // facing away
    const k = fuerza / (1 + 2 * PARALAJE), c = x => Math.max(-tope, Math.min(tope, x));
    u.value.set(c(-v.x / v.z * k), c(-v.y / v.z * k));
  };
}
