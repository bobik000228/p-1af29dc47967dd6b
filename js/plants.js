// Strawberry plants for the harvest scene (mobile manipulator). The simulation
// has each plant as one sphere on the gutter, the fruit as spheres and the ripe
// fruit's stem as a thin cylinder (sim/formwerk_sim/tasks.py::strawberry). Here
// they are drawn as plants at exactly those places: a crown on the gutter with
// trifoliate leaves on petioles, fruit on curved stems arching from the crown to the
// gutter rim, each fruit cone-shaped with a calyx. Drawing only; the physics is the
// recorded one. All leaves are one mesh, all stems one mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const LEAF = 0x8fb884, STEM = 0x6f9a5b, LINE = 0x5f8752, SOIL = 0x9a9187;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// deterministic pseudo-random numbers, so every load looks the same
function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// one leaflet in the xy plane: base at the origin, tip at +x, toothed edge
function leaflet(L, W) {
  const pts = [], n = 18;
  for (let k = 0; k <= n; k++) {           // one side base -> tip, then back on the other
    const t = k / n, tooth = k % 2 ? 0.86 : 1;
    pts.push([t, tooth * Math.sin(Math.PI * Math.pow(t, 0.8))]);
  }
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  pts.forEach(([t, w]) => sh.lineTo(t * L, w * W / 2));
  pts.slice().reverse().forEach(([t, w]) => sh.lineTo(t * L, -w * W / 2));
  const g = new THREE.ShapeGeometry(sh);
  const p = g.attributes.position;         // cupped: the edges a little up, the tip a little down
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / L, y = p.getY(i) / (W / 2);
    p.setZ(i, 0.18 * W * y * y - 0.1 * L * x * x);
  }
  g.computeVertexNormals();
  return g;
}

// fruit: cone with rounded shoulders, top (calyx) at +z; fits in a sphere of radius r
export function berryGeometry(r) {
  const prof = [[0, -1], [0.3, -0.88], [0.62, -0.55], [0.86, -0.12], [0.94, 0.25], [0.86, 0.6], [0.55, 0.82], [0, 0.86]];
  return new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a * r, b * r)), 10).rotateX(Math.PI / 2);
}
// calyx: green star of sepals on top of the fruit, with a short stalk
function calyxGeometry(r) {
  const sh = new THREE.Shape(), n = 6;
  for (let k = 0; k < 2 * n; k++) {
    const a = (k / (2 * n)) * 2 * Math.PI, R = k % 2 ? 0.22 * r : 0.72 * r;
    k ? sh.lineTo(R * Math.cos(a), R * Math.sin(a)) : sh.moveTo(R, 0);
  }
  const star = new THREE.ShapeGeometry(sh);
  const p = star.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -0.25 * Math.hypot(p.getX(i), p.getY(i)));   // sepals bent down over the shoulder
  star.translate(0, 0, 0.9 * r);
  const stalk = new THREE.CylinderGeometry(0.1 * r, 0.12 * r, 0.25 * r, 6).rotateX(Math.PI / 2).translate(0, 0, 0.98 * r);
  star.deleteAttribute('uv'); stalk.deleteAttribute('uv');
  const g = mergeGeometries([star.toNonIndexed(), stalk.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}

const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, r, 5, false);

// Replace the simulated plant geoms in `scene` (one child per rec.scene geom, in
// order) and the fruit objects `objs` (one per rec.objects) by plant drawings.
export function strawberryPlants(scene, rec, objs) {
  const geoms = rec.scene, kids = scene.children.slice(0, geoms.length);
  const plants = geoms.filter((g) => g.style === 'leaf');
  if (!plants.length) return;
  // the gutter: the box the plants stand on
  const gut = geoms.find((g) => g.shape === 'box' && Math.abs(g.pos[0] - plants[0].pos[0]) < g.size[0]
    && Math.abs(g.pos[1] - plants[0].pos[1]) < g.size[1] && g.pos[2] < plants[0].pos[2]);
  const top = gut.pos[2] + gut.size[2], yc = gut.pos[1], half = gut.size[1];
  const leaves = [], stems = [], ribs = [];
  const rand = rnd(7);

  // crown of trifoliate leaves on each plant
  plants.forEach((g, pi) => {
    const R = g.size[0], C = V(g.pos[0], g.pos[1], top + 0.004);
    const n = 8;
    for (let k = 0; k < n; k++) {
      const az = (k / n) * 2 * Math.PI + pi * 0.9 + (rand() - 0.5) * 0.5;
      const out = V(Math.cos(az), Math.sin(az), 0);
      const across = out.y * out.y;                 // 1: towards an edge of the gutter (aisle or back)
      const reach = R * (1.0 + 0.9 * across) * (0.85 + 0.3 * rand());
      const peak = R * (1.5 - 0.3 * across) * (0.85 + 0.3 * rand());
      const T = C.clone().addScaledVector(out, reach).add(V(0, 0, peak * (1 - 0.92 * across)));  // over the edge: leaf hangs down
      const M = C.clone().addScaledVector(out, 0.35 * reach).add(V(0, 0, peak));
      stems.push(tube([C, M, T], 0.0022));
      // leaf frame: forward f (outwards, pitched down by the droop), normal nrm
      const droop = (10 + 38 * across) * Math.PI / 180 + (rand() - 0.5) * 0.3;
      const f = out.clone().multiplyScalar(Math.cos(droop)).add(V(0, 0, -Math.sin(droop)));
      const nrm = V(0, 0, 1).addScaledVector(f, -f.z).normalize();
      const L = R * (0.78 + 0.18 * rand()), W = 0.7 * L;
      for (const [a, s] of [[0, 1], [0.95, 0.88], [-0.95, 0.88]]) {
        const d = f.clone().applyAxisAngle(nrm, a);
        const side = new THREE.Vector3().crossVectors(nrm, d);
        const m = new THREE.Matrix4().makeBasis(d, side, nrm).setPosition(T.clone().addScaledVector(d, 0.006));
        leaves.push(leaflet(s * L, s * W).applyMatrix4(m));
        ribs.push(T.clone().addScaledVector(d, 0.006), T.clone().addScaledVector(d, 0.006 + 0.85 * s * L));
      }
    }
    kids[geoms.indexOf(g)].visible = false;      // the simulated plant sphere: kept for the camera fit
  });

  // a fruit stem from the nearest crown, arching up and over to the fruit top b
  const nearest = (x) => plants.reduce((a, g) => (Math.abs(g.pos[0] - x) < Math.abs(a.pos[0] - x) ? g : a));
  function peduncle(b) {
    const p = nearest(b.x), sgn = Math.sign(b.y - yc);
    const c0 = V(p.pos[0] + 0.3 * (b.x - p.pos[0]), yc + sgn * 0.4 * half, top + 0.006);
    const arch = V(lerp(c0.x, b.x, 0.6), lerp(c0.y, b.y, 0.55), Math.max(b.z, top) + 0.035);
    const over = V(lerp(c0.x, b.x, 0.92), lerp(c0.y, b.y, 0.9), b.z + 0.018);
    stems.push(tube([c0, arch, over, b], 0.0016));
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  geoms.forEach((g, i) => {
    if (g.style === 'stem') {                      // drawn stem of the ripe fruit: its lower end is the fruit top
      const ax = V(0, 0, 1).applyQuaternion(new THREE.Quaternion(g.quat[1], g.quat[2], g.quat[3], g.quat[0]));
      const c = V(...g.pos), e1 = c.clone().addScaledVector(ax, g.size[1]), e2 = c.clone().addScaledVector(ax, -g.size[1]);
      peduncle(e1.z < e2.z ? e1 : e2);
      kids[i].visible = false;
    }
    if (g.style === 'unripe') {                    // unripe fruit: same shape, pale, with calyx and stem
      const m = kids[i], r = g.size[0];
      m.geometry = berryGeometry(r);
      m.add(new THREE.Mesh(calyxGeometry(r), new THREE.MeshStandardMaterial({ color: STEM, roughness: 0.9, side: THREE.DoubleSide })));
      peduncle(V(g.pos[0], g.pos[1], g.pos[2] + r));
    }
  });
  rec.objects.forEach((g, i) => {
    if (g.style !== 'fruit') return;
    const m = objs[i], r = g.size[0];
    m.geometry = berryGeometry(r);
    m.add(new THREE.Mesh(calyxGeometry(r), new THREE.MeshStandardMaterial({ color: STEM, roughness: 0.9, side: THREE.DoubleSide })));
  });

  const strip = (gs) => gs.map((x) => { x.deleteAttribute('uv'); return x.index ? x.toNonIndexed() : x; });
  const leafMesh = new THREE.Mesh(mergeGeometries(strip(leaves)),
    new THREE.MeshStandardMaterial({ color: LEAF, roughness: 0.85, side: THREE.DoubleSide }));
  leafMesh.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ribs), new THREE.LineBasicMaterial({ color: LINE })));
  const stemMesh = new THREE.Mesh(mergeGeometries(strip(stems)), new THREE.MeshStandardMaterial({ color: STEM, roughness: 0.9 }));
  // substrate in the open gutter, 12 mm in from its rims
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(2 * gut.size[0] - 0.024, 2 * half - 0.024),
    new THREE.MeshStandardMaterial({ color: SOIL, roughness: 1 }));
  soil.position.set(gut.pos[0], yc, top + 0.001);
  for (const m of [leafMesh, stemMesh, soil]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
}
