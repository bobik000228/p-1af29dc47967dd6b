// Model source: prefer the CadQuery GLB export (assets/glb/, listed in
// assets/manifest.json by build.sh); fall back to the procedural models.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeModule, MM } from './parts.js';

let manifestP = null;
export function manifest() {
  if (!manifestP) {
    manifestP = fetch('assets/manifest.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((m) => ({ glb: m.glb || [], png: m.png || [] }));
  }
  return manifestP;
}

function findFile(list, keys) {
  for (const k of keys) {
    const re = new RegExp('(^|[/_])' + k + '\\.glb$', 'i');
    const hit = list.find((f) => re.test(f));
    if (hit) return hit;
  }
  return null;
}

const loader = new GLTFLoader();
const cache = new Map();
function loadGLB(file) {
  if (!cache.has(file)) cache.set(file, loader.loadAsync('assets/glb/' + file));
  return cache.get(file).then((g) => g.scene.clone(true));
}

// Wrap a glTF scene (Y-up) into the Z-up world used by the procedural models.
function wrapGLB(scene) {
  // no environment map in the viewers: tone metalness down so the
  // anodised parts read as dark grey instead of black
  scene.traverse((n) => {
    if (n.isMesh && n.material && 'metalness' in n.material) {
      n.material = n.material.clone();
      n.material.metalness = Math.min(n.material.metalness, 0.15);
      n.material.roughness = Math.max(n.material.roughness, 0.5);
    }
  });
  const g = new THREE.Group();
  scene.rotation.x = Math.PI / 2;
  g.add(scene);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const size = b.getSize(new THREE.Vector3()).length();
  if (size > 20) g.scale.setScalar(MM);  // exported in mm
  g.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(g);
  g.position.z -= b2.min.z;               // stand on the grid
  return g;
}

// CAD GLB by file name, Z-up, standing on z = 0
export async function glbObject(file) {
  return wrapGLB(await loadGLB(file));
}

const MODULE_GLB = {
  joint: ['module_joint'], link: ['module_link_300'], hub: ['module_hub'],
  eye: ['module_eye'], battery: ['module_battery'], wheel: ['module_wheel'], hand: ['module_hand'], suction: ['module_suction'],
};

// returns { object, tick, source: 'glb'|'procedural' }
export async function moduleModel(type, opt) {
  const m = await manifest();
  const f = findFile(m.glb, MODULE_GLB[type] || [type]);
  if (f) {
    try {
      const obj = wrapGLB(await loadGLB(f));
      return { object: obj, tick: null, source: 'glb', file: f };
    } catch (e) { console.warn('GLB load failed, using procedural model', f, e); }
  }
  const mod = makeModule(type, opt);
  return { object: mod.group, module: mod, tick: null, source: 'procedural' };
}
