// Hero figure: robots built from the same modules, each at a task. Every motion
// is a recorded MuJoCo rollout (sim/formwerk_sim/tasks.py -> assets/rollouts/):
// the robot generated from its module list, objects moved only by contact
// forces. A slideshow shows each robot for SLIDE seconds; each keeps playing
// its task from where it was when it comes back. Pointing at the figure (tap on
// touch screens) stops the robot and pulls it apart from its centre; the scene
// stays where it is and goes grey. Pointing at a module or a part thumbnail
// highlights it.
import * as THREE from 'three';
import { makeViewer, GL_ERR } from './common.js';
import { glbObject } from './models.js';
import { strawberryPlants } from './plants.js';

// robots with a recorded task, in order of appearance
const SHOWN = ['bench_arm', 'dual_arm', 'snake', 'mobile_picker', 'mobile_manipulator', 'palletizer', 'quadruped'];
let ORDER = SHOWN;

// ------------------------------------------------------------ scene objects
// Schematic style: flat light grey with dark edges; the robot keeps its CAD look.
const S_COL = 0xf2f2f0, E_COL = 0x7d8086;
const STYLE = { scene: S_COL, table: S_COL, leg: S_COL, item: 0xc8b27e, metal: 0xa9adb3, part: 0x8f959d,
  fruit: 0xc8352b, leaf: 0xa9c9a0, stem: 0x6f9a5b, unripe: 0xd9e4b8, housing: S_COL };
const GREY = new THREE.Color(0xe6e6e6), GREY_E = new THREE.Color(0xd2d2d2);

function geometry(g) {
  if (g.shape === 'box') return new THREE.BoxGeometry(2 * g.size[0], 2 * g.size[1], 2 * g.size[2]);
  if (g.shape === 'cylinder') return new THREE.CylinderGeometry(g.size[0], g.size[0], 2 * g.size[1], 32).rotateX(Math.PI / 2);
  if (g.shape === 'sphere') return new THREE.SphereGeometry(g.size[0], 20, 14);
  if (g.shape === 'capsule') return new THREE.CapsuleGeometry(g.size[0], 2 * g.size[1], 6, 16).rotateX(Math.PI / 2);
  throw new Error('shape ' + g.shape);
}
// one simulated geom as a schematic solid; pose from MuJoCo (pos, quat w x y z)
function solid(g) {
  const geo = geometry(g);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: STYLE[g.style] ?? S_COL, roughness: g.style === 'fruit' ? 0.6 : 0.95 }));
  if (!['fruit', 'stem', 'leaf', 'unripe'].includes(g.style)) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: E_COL })));
  m.castShadow = m.receiveShadow = true;
  if (g.style === 'housing') {     // machine housing: see-through, so the inside shows
    Object.assign(m.material, { transparent: true, opacity: 0.18, depthWrite: false });
    m.castShadow = false;
  }
  m.position.fromArray(g.pos);
  m.quaternion.set(g.quat[1], g.quat[2], g.quat[3], g.quat[0]);
  m.userData.fit = g.style !== 'leg';
  return m;
}

const WHEEL_R = 0.1;     // m, omni wheel radius
const WHEEL_BASE = 0.2;  // m, wheel contact to base centre (approx.)
const KNUCKLE = 14;      // mm above a finger's base: the axis it closes about (cad/formwerk/hand.py)
const SPREAD = 0.45;     // pulled apart: each module moves 45 % further from the robot centre
const HI = new THREE.Color(0xe8590c);
const NM = { S: 12, M: 30, L: 60 };
const SLIDE = 4;         // s per robot in the slideshow
const HOLD = 0.4, FADE = 0.35;  // s: rest at the end of a rollout, then the task objects fade out and back in at their start

// part groups in the thumbnail row, in this order
const PARTS = [
  ['hub', 'Hub', (m) => m.type === 'hub', 'compute, e-stop, power input, 6 Ports'],
  ['battery', 'Battery', (m) => m.type === 'battery', '48 V, charging port, own battery management'],
  ['joint', 'Joint', (m) => m.type === 'joint', 'one revolute axis; drive S 12, M 30, L 60 Nm peak'],
  ['link_300', 'Link', (m) => m.type === 'link' && !m.elbow, 'telescopic carbon tube, 150-450 mm'],
  ['link_elbow_250', 'Elbow link', (m) => m.type === 'link' && m.elbow, '90° elbow, telescopic leg'],
  ['eye', 'Eye', (m) => m.type === 'eye', 'stereo depth camera'],
  ['hand', 'Hand', (m) => m.type === 'hand', '3-finger adaptive gripper, also fits standard cobots'],
  ['suction', 'Suction', (m) => m.type === 'suction', 'standard vacuum gripper, bolts onto any Joint'],
  ['wheel', 'Wheel', (m) => m.type === 'omni_wheel', 'omni wheel, turned by a Joint in wheel mode'],
  ['foot', 'Foot', (m) => m.type === 'foot', 'rubber ball, passive accessory'],
];
function partText(g, ms) {
  if (g[0] !== 'joint') return `${g[1]}: ${g[3]}`;
  const n = { L: 0, M: 0, S: 0 };
  ms.forEach((m) => n[m.size]++);
  return `${g[1]}: ${Object.entries(n).filter(([, c]) => c).map(([s, c]) => `${c} × ${s} (${NM[s]} Nm)`).join(', ')}. One revolute axis each`;
}

const lerp = (a, b, f) => a + (b - a) * f;
const Z = new THREE.Vector3(0, 0, 1), qt = new THREE.Quaternion();
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const quatOf = (q, o = 0) => new THREE.Quaternion(q[o + 1], q[o + 2], q[o + 3], q[o]);

// Set robot r to recorded frame position f (fractional: interpolated).
function apply(r, f) {
  const R = r.rec, n = R.n, i = Math.max(0, Math.min(n - 1, Math.floor(f))), j = Math.min(n - 1, i + 1), u = Math.max(0, Math.min(1, f - i));
  // root module pose from the simulation; the GLB hangs below it
  const pa = R.root_pose[i], pb = R.root_pose[j];
  qa.copy(quatOf(pa, 3)).slerp(quatOf(pb, 3), u);
  v3.set(lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u), lerp(pa[2], pb[2], u));
  r.holder.matrix.compose(v3, qa, r.scale).multiply(r.rootInv);   // the GLB is in mm
  r.holder.matrixWorldNeedsUpdate = true;
  r.rotors.forEach((q) => {
    let ang;
    if (q.wheel) ang = lerp(r.wheelAng[i][q.wheel - 1], r.wheelAng[j][q.wheel - 1], u);
    else { const k = r.jIdx[q.joint]; ang = k === undefined ? 0 : lerp(R.q[i][k], R.q[j][k], u) - R.cad[q.joint]; }
    q.n.quaternion.copy(q.q0).multiply(qt.setFromAxisAngle(Z, ang));
  });
  r.fingers.forEach((fg) => {   // closes about the knuckle axis (local y)
    const a = lerp(R.fingers[i][fg.k], R.fingers[j][fg.k], u);
    m5.makeTranslation(0, 0, KNUCKLE).multiply(m4.makeRotationY(a)).multiply(m4.makeTranslation(0, 0, -KNUCKLE));
    fg.nodes.forEach(([nd, M0]) => { nd.matrix.copy(M0).multiply(m5); nd.matrixWorldNeedsUpdate = true; });
  });
  r.objs.forEach((o, k) => {
    const a = R.obj[i][k], b = R.obj[j][k];
    o.position.set(lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u));
    o.quaternion.copy(quatOf(a, 3)).slerp(quatOf(b, 3), u);
  });
  r.holder.updateMatrixWorld(true);
}
const boxOf = (meshes) => { const b = new THREE.Box3(); meshes.forEach((s) => b.expandByObject(s)); return b; };

// Omni wheel angles from the recorded base motion (the wheels are not simulated):
// wheels 1/3 roll with the base's local x, 2/4 with local y, all with yaw.
function wheelAngles(R) {
  const out = [], acc = [0, 0, 0, 0];
  for (let k = 0; k < R.n; k++) {
    if (k) {
      const a = R.root_pose[k - 1], b = R.root_pose[k];
      const yaw = new THREE.Euler().setFromQuaternion(quatOf(b, 3), 'ZYX').z;
      const ya = new THREE.Euler().setFromQuaternion(quatOf(a, 3), 'ZYX').z;
      const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.cos(yaw), s = Math.sin(yaw);
      const lx = c * dx + s * dy, ly = -s * dx + c * dy;
      let dyaw = yaw - ya; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      acc[0] += (lx + WHEEL_BASE * dyaw) / WHEEL_R; acc[2] += (lx + WHEEL_BASE * dyaw) / WHEEL_R;
      acc[1] += (ly + WHEEL_BASE * dyaw) / WHEEL_R; acc[3] += (ly + WHEEL_BASE * dyaw) / WHEEL_R;
    }
    out.push(acc.slice());
  }
  return out;
}

// Prepare one robot: module nodes and meshes, rotors, fingers, scene, camera sphere.
async function prepare(key, data) {
  const [obj, rec] = await Promise.all([glbObject(`morph_${key}.glb`), fetch(`assets/rollouts/${key}.json`).then((x) => x.json())]);
  obj.position.set(0, 0, 0);
  const holder = new THREE.Group();
  holder.matrixAutoUpdate = false;
  holder.add(obj);
  holder.updateMatrixWorld(true);
  const byName = new Map();
  obj.traverse((n) => { if (n.name) byName.set(n.name, n); });
  const rootNode = byName.get(rec.root === 'clamp' ? 'table_clamp' : rec.root);
  const rootInv = rootNode.matrixWorld.clone().invert();
  const scale = new THREE.Vector3().setFromMatrixScale(rootNode.matrixWorld);
  const mods = data.modules.map((m) => ({ ...m, node: byName.get(m.name), meshes: [] })).filter((m) => m.node);
  const modOf = new Map(mods.map((m) => [m.node, m]));
  for (const m of mods) {
    (function walk(n) {
      if (n !== m.node && modOf.has(n)) return;
      if (n.isMesh) { m.meshes.push(n); n.userData.mod = m; n.castShadow = true; }
      n.children.forEach(walk);
    })(m.node);
    let p = m.node.parent;
    while (p && !modOf.has(p)) p = p.parent;
    m.parent = p ? modOf.get(p) : null;
    m.base = m.node.position.clone();
    m.off = new THREE.Vector3();
  }
  const rotors = [];
  obj.traverse((n) => {
    if (!/_rotor$/.test(n.name)) return;
    const w = n.name.match(/_w(\d+)_rotor$/);
    rotors.push({ n, q0: n.quaternion.clone(), joint: n.name.slice(0, -6), wheel: w ? +w[1] : 0 });
  });
  const fingers = [];
  rec.hands.forEach((h, hi) => ['a', 'b', 'c'].forEach((t, ti) => {
    const nodes = [`${h}_finger_${t}`, `${h}_finger_${t}_pads`].map((nm) => byName.get(nm)).filter(Boolean)
      .map((nd) => { nd.matrixAutoUpdate = false; nd.updateMatrix(); return [nd, nd.matrix.clone()]; });
    fingers.push({ k: hi * 3 + ti, nodes });
  }));
  const r = { key, data, rec, obj, holder, rootInv, scale, mods, rotors, fingers, z0: 0, clock: 0,
    jIdx: Object.fromEntries(rec.joints.map((j, k) => [j, k])), wheelAng: wheelAngles(rec) };
  r.scene = new THREE.Group();
  rec.scene.forEach((g) => r.scene.add(solid(g)));
  r.objs = rec.objects.map((g) => { const m = solid(g); r.scene.add(m); return m; });
  strawberryPlants(r.scene, rec, r.objs);   // plants drawn over the simulated plant geoms
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.12 }));
  floor.receiveShadow = true;
  r.floor = floor;
  // materials that go grey when the robot is pulled apart
  r.mats = [];
  r.scene.traverse((n) => { if (n.material) { n.material = n.material.clone(); r.mats.push([n.material, n.material.color.clone(), n.isLineSegments ? GREY_E : GREY]); } });
  // the task objects fade out and back in where the rollout loops
  r.objMats = [];
  r.objs.forEach((o) => o.traverse((n) => { if (n.material) { n.material.transparent = true; r.objMats.push(n.material); } }));
  // camera: everything the robot sweeps plus the task objects (not legs, not the floor)
  const fitBox = new THREE.Box3();
  for (let f = 0; f < rec.n; f += 10) { apply(r, f); fitBox.expandByObject(obj); r.objs.forEach((o) => fitBox.expandByObject(o)); }
  r.scene.children.forEach((n) => { if (n.userData.fit) fitBox.expandByObject(n); });
  r.sphere = fitBox.getBoundingSphere(new THREE.Sphere());
  apply(r, 0);
  r.restMinZ = new THREE.Box3().setFromObject(obj).min.z;
  return r;
}

// Pull-apart offsets in the current pose: every module moves away from the
// robot's centre by SPREAD times its distance (less if the camera, which does
// not move, would cut it off); the robot is lifted so that no part goes lower
// than the robot stands.
function spread(r, camera) {
  r.mods.forEach((m) => m.node.position.copy(m.base));
  r.obj.updateMatrixWorld(true);
  const C = new THREE.Box3().setFromObject(r.obj).getCenter(new THREE.Vector3());
  const D = new Map(r.mods.map((m) => [m, boxOf(m.meshes).getCenter(new THREE.Vector3()).sub(C).multiplyScalar(SPREAD)]));
  const lowNow = new THREE.Box3().setFromObject(r.obj).min.z;
  for (const m of r.mods) {
    const d = D.get(m).clone();
    if (m.parent) d.sub(D.get(m.parent));
    const par = m.node.parent, w0 = m.node.getWorldPosition(new THREE.Vector3());
    m.off = par.worldToLocal(w0.clone().add(d)).sub(par.worldToLocal(w0.clone()));
  }
  for (const k of [1, 0.85, 0.7, 0.55, 0.4]) {
    r.mods.forEach((m) => m.node.position.copy(m.base).addScaledVector(m.off, k));
    r.obj.updateMatrixWorld(true);
    const apart = new THREE.Box3().setFromObject(r.obj);
    r.lift = Math.max(0, Math.min(lowNow, r.restMinZ + 0.01) - apart.min.z);
    r.k = k;
    const { min: a, max: b } = apart;
    const inView = [0, 1, 2, 3, 4, 5, 6, 7].every((c) =>
      v3.set(c & 1 ? b.x : a.x, c & 2 ? b.y : a.y, (c & 4 ? b.z : a.z) + r.lift).project(camera).toArray().slice(0, 2).every((x) => Math.abs(x) < 0.95));
    if (inView) break;
  }
  r.mods.forEach((m) => m.off.multiplyScalar(r.k));
  r.zRest = r.obj.position.z;
  r.mods.forEach((m) => m.node.position.copy(m.base));
  r.obj.updateMatrixWorld(true);
}

(async () => {
  const el = document.getElementById('hero-view');
  const fig = document.getElementById('hero');
  const v = await makeViewer(el, { grid: false, shadow: true, margin: 0.8 }, 'bench');
  const data = await fetch('assets/morphs.json').then((r) => r.json());
  const have = await fetch('assets/rollouts/index.json').then((x) => x.json());
  ORDER = SHOWN.filter((k) => have.includes(k));
  const titleEl = document.getElementById('hero-title');
  const partEl = document.getElementById('hero-part');
  const listEl = document.getElementById('hero-parts');
  const touch = matchMedia('(hover: none)').matches;
  const hintEl = document.getElementById('hero-hint'), pausedEl = document.getElementById('hero-paused');
  const HINT = touch ? ['tap: take apart · drag: rotate', 'tap a part: name · tap beside: reassemble'] : ['point at a part: name · drag: rotate', 'point at a part: name · drag: rotate'];
  hintEl.textContent = HINT[0];
  let shownApart = false, shownPaused = false;

  let idx = 0, cur = null, slide = 0, e = 0, eTarget = 0, hiMods = [], over = false, frozen = null;
  const cache = new Map();
  const get = (i) => {
    const k = ORDER[i];
    if (!cache.has(k)) cache.set(k, prepare(k, data[k]));
    return cache.get(k);
  };

  function highlight(mods, g) {
    for (const m of hiMods) m.meshes.forEach((s) => s.material.emissive.setRGB(0, 0, 0));
    hiMods = mods;
    for (const m of hiMods) m.meshes.forEach((s) => { s.material.emissive.copy(HI); s.material.emissiveIntensity = 0.55; });
    g = g || (mods.length ? PARTS.find((p) => p[2](mods[0])) : null);
    listEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !!g && b.dataset.g === g[0]));
    partEl.textContent = g ? partText(g, cur.mods.filter(g[2])) : '';
  }

  function partsList(r) {
    listEl.innerHTML = '';
    for (const g of PARTS) {
      const ms = r.mods.filter(g[2]);
      if (!ms.length) continue;
      const b = document.createElement('button');
      b.dataset.g = g[0];
      b.innerHTML = `<img src="assets/thumb/${g[0]}.png" alt="" width="64" height="64"><span>${g[1]}</span><b>× ${ms.length}</b>`;
      b.addEventListener('pointerenter', () => { eTarget = 1; highlight(ms, g); });
      b.addEventListener('pointerleave', () => highlight([]));
      b.addEventListener('click', () => { eTarget = 1; highlight(ms, g); });
      listEl.appendChild(b);
    }
  }

  // Robot r at its own clock. Each robot keeps its clock while the others are
  // shown. At the end of the rollout the robot is back at its start pose; the
  // task objects fade out, the clock wraps and they fade in at their start.
  function play(r) {
    const T = r.rec.n / r.rec.fps, L = T + HOLD + FADE;
    if (frozen !== null) r.clock = frozen;
    else if (r.clock >= L) { r.clock -= L; r.looped = true; }
    apply(r, Math.min(r.clock, T) * r.rec.fps);
    const a = r.clock < FADE && r.looped ? r.clock / FADE : r.clock > T + HOLD ? 1 - (r.clock - T - HOLD) / FADE : 1;
    r.objMats.forEach((m) => { m.opacity = a; });
    r.objs.forEach((o) => { o.visible = a > 0; o.castShadow = a > 0.5; });
  }

  // No live 3D view (no WebGL 2, context lost, or index.html?video): the same
  // slideshow from videos of the rollouts (tools/hero_video.py); each video
  // pauses while the others are shown and goes on from there.
  let vids = null, timer = 0;
  function useVideo(why) {
    if (vids) return;
    vids = new Map();
    if (v) v.stop();
    document.getElementById('hero-hint').textContent = /[?&]gl\b/.test(location.search) ? why : '';
    showVideo(idx);
  }
  function showVideo(i) {
    idx = (i + ORDER.length) % ORDER.length;
    const k = ORDER[idx];
    el.querySelectorAll('canvas, .noweb').forEach((n) => n.remove());
    el.classList.remove('loading');   // the video's poster shows at once
    vids.forEach((x) => { x.pause(); x.hidden = true; });
    let x = vids.get(k);
    if (!x) {
      x = document.createElement('video');
      ['muted', 'loop', 'playsinline'].forEach((a) => x.setAttribute(a, ''));
      x.muted = true;
      x.className = 'hvid';
      x.poster = `assets/video/${k}.jpg`;
      x.src = `assets/video/${k}.mp4`;
      el.prepend(x);
      vids.set(k, x);
    }
    x.hidden = false;
    x.play().catch(() => {});   // autoplay refused (power saving): the poster stays
    if (cur) highlight([]);
    cur = { mods: data[k].modules.map((m) => ({ ...m, meshes: [] })) };
    titleEl.textContent = data[k].title;
    partsList(cur);
    clearTimeout(timer);
    timer = setTimeout(() => showVideo(idx + 1), SLIDE * 1000);
  }

  async function show(i) {
    if (vids) return showVideo(i);
    slide = -Infinity;                        // no slide change while this one loads
    idx = (i + ORDER.length) % ORDER.length;
    const r = await get(idx);
    get((idx + 1) % ORDER.length);           // preload the next one
    if (cur) highlight([]);
    fig.classList.add('fade');
    await new Promise((res) => setTimeout(res, v ? 250 : 0));
    if (vids) return;
    cur = r; slide = 0; e = 0; eTarget = over ? 1 : 0;
    r.mods.forEach((m) => m.node.position.copy(m.base));
    r.mats.forEach(([m, c]) => m.color.copy(c));
    play(r);
    titleEl.textContent = r.data.title;
    partsList(r);
    if (v) {
      v.setObject(r.holder, { fit: false });
      v.root.add(r.scene, r.floor);
      v.opt.az = r.rec.cam.az; v.opt.el = r.rec.cam.el;
      v.fit(r.obj, true, r.sphere);
      v.shadowAround(r.sphere);
      v.png = `morph_${r.key}`;
      // breadcrumb for the device log: GPU memory and context count after each slide
      // (a phone reported 0 geometries: was the view drawn, culled, or never visible?)
      setTimeout(() => {
        const cv = v.canvas, px = cv.width ? Array.from(v.ctx.getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data) : null;
        console.error('hero slide', r.key, JSON.stringify(v.renderer.info.memory), JSON.stringify(v.renderer.info.render),
          'buffer', v.renderer.domElement.width, v.renderer.domElement.height, 'canvases', document.querySelectorAll('canvas').length,
          'visible', v.visible, 'lost', v.renderer.getContext().isContextLost(), 'cam', v.camera.position.toArray().map((x) => +x.toFixed(2)),
          'aspect', +v.camera.aspect.toFixed(3), 'centre px', px);
      }, 1000);
    }
    fig.classList.remove('fade');
  }

  function tick(t, dt) {
    if (!cur) return;
    const paused = eTarget > 0 || e > 0;
    if (paused !== shownPaused) { shownPaused = paused; pausedEl.classList.toggle('on', paused); }
    if ((eTarget > 0) !== shownApart) { shownApart = eTarget > 0; hintEl.textContent = HINT[+shownApart]; }
    if (!paused) {
      cur.clock += dt;
      play(cur);
      slide += dt;
      if (slide >= SLIDE && frozen === null) { show(idx + 1); return; }
    }
    if (eTarget > 0 && e === 0) spread(cur, v.camera);
    const e0 = e;
    e += Math.sign(eTarget - e) * Math.min(Math.abs(eTarget - e), dt * 1.8);
    if (e !== e0) {
      const s = 0.5 - 0.5 * Math.cos(Math.PI * e);   // ease in-out
      cur.mods.forEach((m) => m.node.position.copy(m.base).addScaledVector(m.off, s));
      cur.obj.position.z = cur.zRest + cur.lift * s;
      cur.mats.forEach(([m, c, g]) => m.color.copy(c).lerp(g, s));
    }
  }

  // pointer: the robot comes apart while the mouse is on the figure; on touch
  // screens a tap anywhere takes it apart, a tap on a module then highlights it,
  // a tap beside the robot puts it together again
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    if (!v || !cur) return null;
    const rc = v.canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - rc.left) / rc.width) * 2 - 1, -((ev.clientY - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, v.camera);
    const hit = ray.intersectObject(cur.obj, true).find((h) => h.object.userData.mod);
    return hit ? hit.object.userData.mod : null;
  }
  if (v) {
    v.ticks.push(tick);
    v.renderer.domElement.addEventListener('webglcontextlost', () => setTimeout(() => useVideo('context lost'), 0));
    const c = v.canvas;
    fig.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') { over = true; eTarget = 1; } });
    fig.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') { over = false; eTarget = 0; highlight([]); } });
    c.addEventListener('pointermove', (ev) => {
      if (ev.pointerType !== 'mouse') return;
      const m = pick(ev);
      if (m || hiMods.length) highlight(m ? [m] : []);
    });
    c.addEventListener('click', (ev) => {
      if (ev.pointerType === 'mouse') return;
      const m = eTarget ? pick(ev) : null;
      if (!eTarget) eTarget = 1;
      else if (!m) eTarget = 0;
      highlight(m ? [m] : []);
    });
  }
  document.getElementById('hero-prev').addEventListener('click', () => show(idx - 1));
  document.getElementById('hero-next').addEventListener('click', () => show(idx + 1));
  // largest distance (m) between a drawn module and its simulated body, at the frames in rec.check
  function check() {
    let worst = 0;
    const by = new Map();
    cur.obj.traverse((n) => { if (n.name) by.set(n.name, n); });
    for (const c of cur.rec.check) {
      apply(cur, c.frame);
      for (const [name, p] of Object.entries(c.bodies)) {
        const nd = by.get(name === 'clamp' ? 'table_clamp' : name);
        if (nd) worst = Math.max(worst, nd.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...p)));
      }
    }
    return worst;
  }
  window.hero = { order: ORDER, show: (i) => show(i), freeze: (t) => { frozen = t; }, check, spread: (on) => { eTarget = on ? 1 : 0; }, get cur() { return cur; } };
  if (!v || /[?&]video\b/.test(location.search)) useVideo(GL_ERR || 'video forced');
  else {
    show(0);
    if (/[?&]gl\b/.test(location.search)) document.getElementById('hero-hint').textContent = 'WebGL 2 ok';
  }
})();
