// Formwerk: procedural design models of the seven modules (fallback for the
// CadQuery GLB export). Dimensions follow cad/formwerk/params.py (mm).
// Conventions as in the CAD code: Z-up; every Port frame has its origin in
// the centre of the contact face and +Z pointing out of the module.
import * as THREE from 'three';

export const MM = 0.001; // scene unit = metre

export const COL = {
  alu: 0x4a4e55,     // anodised dark grey aluminium (slightly lifted for screen)
  black: 0x1e1f22,
  orange: 0xe8590c,  // Port collars and e-stop only
  carbon: 0x2c2c2e,
  contact: 0x9a9da1,
  context: 0xe2e2e0,
};

const matCache = new Map();
export function mat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.05 }));
  }
  return matCache.get(color);
}

function mesh(geom, color) {
  const m = new THREE.Mesh(geom, mat(color));
  m.userData.baseColor = color;
  return m;
}

// cylinder along local Z from z0 to z0+h (mm)
function cylZ(r, h, z0, color, seg = 40, r2 = r) {
  const g = new THREE.CylinderGeometry(r2 * MM, r * MM, h * MM, seg);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + h / 2) * MM);
  return mesh(g, color);
}

function box(x0, x1, y0, y1, z0, z1, color) {
  const g = new THREE.BoxGeometry((x1 - x0) * MM, (y1 - y0) * MM, (z1 - z0) * MM);
  g.translate(((x0 + x1) / 2) * MM, ((y0 + y1) / 2) * MM, ((z0 + z1) / 2) * MM);
  return mesh(g, color);
}

// frame with origin o, local Z = z, local X = x (all in mm / unit vectors)
function frame(o, z, x) {
  const f = new THREE.Object3D();
  const Z = new THREE.Vector3(...z).normalize();
  const X = new THREE.Vector3(...x).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  f.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  f.position.set(o[0] * MM, o[1] * MM, o[2] * MM);
  return f;
}

// Port: flange ø70 x 8, orange locking collar ø75, recessed contact field
function portVisual(f, flange = true) {
  if (!flange) return;
  f.add(cylZ(35, 8, -8, COL.alu, 40));
  f.add(cylZ(37.5, 5.5, -7, COL.orange, 40));
  f.add(cylZ(15.5, 0.6, -0.4, COL.black, 24));
  for (let k = 0; k < 4; k++) {           // 4 bayonet lugs
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const lug = box(-4, 4, -7, 7, 0, 3, COL.alu);
    const g = new THREE.Group();
    g.add(lug); lug.position.x = 31 * MM;
    g.rotation.z = a;
    f.add(g);
  }
}

class Module {
  constructor(type, label) {
    this.type = type;
    this.label = label;
    this.group = new THREE.Group();
    this.group.name = type;
    this.group.userData.module = this;
    this.ports = {};      // name -> frame Object3D (child of group or rotor)
    this.joints = [];     // rotor Object3Ds (local +Z = axis)
    this.children = [];   // attached child modules
    this.parent = null; this.parentPort = null;
  }
  addPort(name, owner, f, flange = true) {
    f.name = `${this.type}_port_${name}`;
    portVisual(f, flange);
    owner.add(f);
    this.ports[name] = f;
    return f;
  }
}

// ---------------------------------------------------------------- modules
export function makeJoint(size = 'M') {
  const m = new Module('joint', `Joint ${size}`);
  m.size = size;
  const g = m.group;
  g.add(cylZ(45, 92, 0, COL.alu));
  g.add(box(-53, -30, -40, 40, 2, 78, COL.alu));                 // base pad
  g.add(box(40, 43, -17, 17, 12, 80, COL.black));                // cartridge cover
  m.addPort('in', g, frame([-61, 0, 40], [-1, 0, 0], [0, 0, 1]));
  const rotor = new THREE.Group();
  rotor.name = 'joint_rotor';
  rotor.position.z = 92 * MM;
  rotor.add(cylZ(38, 1, 0, COL.black));
  rotor.add(cylZ(45, 27, 1, COL.alu));
  for (let k = 0; k < 4; k++) {                                  // index marks
    const mk = box(43, 45.5, -1, 1, 22, 28, COL.contact);
    const gg = new THREE.Group(); gg.add(mk); gg.rotation.z = (k * Math.PI) / 2;
    rotor.add(gg);
  }
  g.add(rotor);
  m.addPort('out', rotor, frame([0, 0, 120 - 92 + 8], [0, 0, 1], [1, 0, 0]));
  m.joints.push(rotor);
  rotor.userData.size = size;
  return m;
}

export function makeLink(length = 300, elbow = false) {
  const m = new Module('link', elbow ? `Link ${length} elbow` : `Link ${length}`);
  m.length = length; m.elbow = elbow;
  const g = m.group;
  m.addPort('in', g, frame([0, 0, 0], [0, 0, -1], [1, 0, 0]));
  if (!elbow) {
    g.add(cylZ(33, 16, 0, COL.alu));
    g.add(cylZ(33, 16, length - 16, COL.alu));
    const mid = 16 + (length - 32) * 0.55;
    g.add(cylZ(30, mid - 16, 16, COL.carbon));
    g.add(cylZ(26, length - 16 - mid, mid, COL.carbon));
    g.add(cylZ(32, 8, mid - 8, COL.black));                      // detent collar
    m.addPort('out', g, frame([0, 0, length], [0, 0, 1], [1, 0, 0]));
  } else {
    const A = 90, B = length - A;
    g.add(cylZ(33, A, 0, COL.alu));
    const s = new THREE.Mesh(new THREE.SphereGeometry(33 * MM, 32, 16), mat(COL.alu));
    s.position.z = A * MM; g.add(s);
    const arm = new THREE.Group();                               // local Z along +X
    arm.position.z = A * MM; arm.rotation.y = Math.PI / 2;
    arm.add(cylZ(33, 45, 0, COL.alu));
    arm.add(cylZ(30, Math.max(B - 61, 1), 45, COL.carbon));
    arm.add(cylZ(33, 16, B - 16, COL.alu));
    arm.add(cylZ(32, 8, 45 + (B - 61) * 0.5, COL.black));
    g.add(arm);
    m.addPort('out', g, frame([B, 0, A], [1, 0, 0], [0, 0, 1]));
  }
  return m;
}

export function makeHub() {
  const m = new Module('hub', 'Hub');
  const g = m.group;
  const W = 200, H = 140, R = 18;
  const sh = new THREE.Shape();
  const w = W / 2 * MM, r = R * MM;
  sh.moveTo(-w + r, -w); sh.lineTo(w - r, -w); sh.quadraticCurveTo(w, -w, w, -w + r);
  sh.lineTo(w, w - r); sh.quadraticCurveTo(w, w, w - r, w); sh.lineTo(-w + r, w);
  sh.quadraticCurveTo(-w, w, -w, w - r); sh.lineTo(-w, -w + r); sh.quadraticCurveTo(-w, -w, -w + r, -w);
  const eg = new THREE.ExtrudeGeometry(sh, { depth: H * MM, bevelEnabled: false, curveSegments: 6 });
  eg.translate(0, 0, -H / 2 * MM);
  g.add(mesh(eg, COL.alu));
  g.add(box(100, 101.5, 34, 94, -20, 40, COL.black));             // display (front, +X)
  { const pi = cylZ(11, 6, 0, COL.black, 24); const pg = new THREE.Group(); pg.add(pi);  // power input (back)
    pg.position.set(-100 * MM, -64 * MM, 0); pg.rotation.y = -Math.PI / 2; g.add(pg); }
  g.add(box(100, 101, -94, -40, 52, 58, COL.black));              // status bar
  const es = new THREE.Group(); es.position.set(68 * MM, 68 * MM, 70 * MM);
  es.add(cylZ(22, 6, 0, COL.black)); es.add(cylZ(17, 14, 6, COL.orange));
  g.add(es);
  const hx = 108, hz = 78;
  const faces = {
    top: [[0, 0, hz], [0, 0, 1], [1, 0, 0]],
    bottom: [[0, 0, -hz], [0, 0, -1], [1, 0, 0]],
    front: [[hx, 0, 0], [1, 0, 0], [0, 0, 1]],
    back: [[-hx, 0, 0], [-1, 0, 0], [0, 0, 1]],
    left: [[0, hx, 0], [0, 1, 0], [0, 0, 1]],
    right: [[0, -hx, 0], [0, -1, 0], [0, 0, 1]],
  };
  for (const [n, [o, z, x]] of Object.entries(faces)) m.addPort(n, g, frame(o, z, x));
  return m;
}

export function makeEye() {
  const m = new Module('eye', 'Eye');
  const g = m.group;
  m.addPort('in', g, frame([0, 0, 0], [0, 0, -1], [1, 0, 0]));
  g.add(cylZ(36, 10, 0, COL.alu));
  g.add(box(-17, 17, -65, 65, 10, 46, COL.alu));
  for (const y of [-40, 40]) {
    const l = cylZ(9, 7, 0, COL.black, 24);
    const gg = new THREE.Group(); gg.add(l);
    gg.position.set(17 * MM, y * MM, 28 * MM); gg.rotation.y = Math.PI / 2;
    g.add(gg);
  }
  g.add(box(17, 18, -6, 6, 24, 32, COL.contact));                // IR projector window
  return m;
}

// ISO 9409-1-50-4-M6 mounting face of a tool (Hand, Suction): plate ø63 x 8, no Formwerk Port
function isoToolFace(m, g) {
  const f = m.addPort('in', g, frame([0, 0, 0], [0, 0, -1], [1, 0, 0]), false);
  f.add(cylZ(31.5, 8, -8, COL.alu, 40));
  f.userData.iface = 'iso9409';
}

export function makeHand() {
  const m = new Module('hand', 'Hand');
  const g = m.group;
  isoToolFace(m, g);
  g.add(cylZ(55, 72, 0, COL.alu));
  g.add(box(47, 67, -40, 40, 6, 76, COL.alu));                    // aux pad
  m.addPort('aux', g, frame([75, 0, 41], [1, 0, 0], [0, 0, 1]));
  g.add(cylZ(24, 3, 72, COL.black));
  m.fingers = [];
  for (const deg of [180, 60, -60]) {
    const base = new THREE.Group();
    base.rotation.z = THREE.MathUtils.degToRad(deg);
    base.position.z = 72 * MM;
    const f = new THREE.Group();          // finger in local frame, x radial
    f.position.x = 38 * MM;
    f.add(box(-12, 12, -13, 13, 0, 12, COL.black));
    const prox = new THREE.Group(); prox.position.z = 14 * MM;
    prox.add(box(-7, 7, -10, 10, 0, 58, COL.black));
    const dist = new THREE.Group(); dist.position.z = 58 * MM;
    dist.add(box(-6, 6, -9, 9, 0, 42, COL.black));
    dist.add(box(-7.5, -6, -7, 7, 6, 38, COL.contact));
    prox.add(dist); f.add(prox);
    base.add(f); g.add(base);
    m.fingers.push({ prox, dist });
  }
  m.setGrip = (s) => { // 0 = open, 1 = closed
    for (const fi of m.fingers) {
      fi.prox.rotation.y = THREE.MathUtils.degToRad(15 - 30 * s);
      fi.dist.rotation.y = THREE.MathUtils.degToRad(-20 - 25 * s);
    }
  };
  m.setGrip(0.3);
  return m;
}

export function makeSuction() {
  const m = new Module('suction', 'Suction');
  const g = m.group;
  isoToolFace(m, g);
  g.add(cylZ(42, 92, 0, COL.alu));
  const pump = cylZ(23, 70, -35, COL.black);
  const pg = new THREE.Group(); pg.add(pump);
  pg.position.set(-42 * MM, 0, 40 * MM); pg.rotation.x = Math.PI / 2;
  g.add(pg);
  g.add(box(34, 54, -40, 40, 8, 84, COL.alu));
  m.addPort('aux', g, frame([62, 0, 46], [1, 0, 0], [0, 0, 1]));
  g.add(cylZ(8, 22, 92, COL.contact, 20));
  g.add(cylZ(12, 8, 112, COL.black, 24));
  g.add(cylZ(14, 6, 120, COL.black, 24, 17));
  g.add(cylZ(17, 6, 126, COL.black, 24, 20));
  return m;
}

// Battery: 48 V flat pack 180 x 180 x 18, Port in a pocket on the top face, corner notch,
// charging socket and charge-level bar on the +X edge (cad/formwerk/battery.py)
export function makeBattery() {
  const m = new Module('battery', 'Battery');
  const g = m.group;
  m.addPort('in', g, frame([0, 0, 0], [0, 0, 1], [1, 0, 0]));
  const sh = new THREE.Shape();
  const w = 90 * MM, r = 18 * MM, n = 42 * MM, rn = 10 * MM;
  sh.moveTo(-w + r, -w); sh.lineTo(w - r, -w); sh.quadraticCurveTo(w, -w, w, -w + r);
  sh.lineTo(w, n - rn); sh.quadraticCurveTo(w, n, w - rn, n);          // corner notch (+X +Y)
  sh.lineTo(n + rn, n); sh.quadraticCurveTo(n, n, n, n + rn);
  sh.lineTo(n, w - rn); sh.quadraticCurveTo(n, w, n - rn, w);
  sh.lineTo(-w + r, w); sh.quadraticCurveTo(-w, w, -w, w - r); sh.lineTo(-w, -w + r); sh.quadraticCurveTo(-w, -w, -w + r, -w);
  const hole = new THREE.Path(); hole.absarc(0, 0, 40 * MM, 0, Math.PI * 2, true); sh.holes.push(hole);
  const eg = new THREE.ExtrudeGeometry(sh, { depth: 18 * MM, bevelEnabled: false, curveSegments: 8 });
  eg.translate(0, 0, -11 * MM);
  g.add(mesh(eg, COL.alu));
  g.add(cylZ(40, 3, -11, COL.alu, 40));                          // pocket floor under the Port
  g.add(box(90, 90.8, -65, -15, -5, 1, COL.black));              // charge-level bar
  g.add(box(90.8, 91.2, -64, -36, -3.5, -0.5, COL.contact));     // 3 of 5 segments lit
  const cp = new THREE.Group(); cp.position.set(90 * MM, 10 * MM, -2 * MM); cp.rotation.y = Math.PI / 2;
  cp.add(cylZ(7.5, 4, 0, COL.black, 20));                        // charging socket
  g.add(cp);
  return m;
}

export function makeWheel() {
  const m = new Module('wheel', 'Wheel');
  const g = m.group;
  m.addPort('in', g, frame([0, 0, 0], [0, 0, -1], [1, 0, 0]), false);
  g.add(cylZ(36, 20, 0, COL.alu));
  g.add(cylZ(100, 50, 20, COL.black, 48));
  g.add(cylZ(75, 52, 19, COL.alu, 40));
  return m;
}

export function makeClamp(withTable = true) {
  const m = new Module('clamp', 'Table clamp (accessory)');
  const g = m.group;
  g.add(box(-65, 65, -65, 65, 0, 16, COL.alu));
  g.add(box(65, 85, -20, 20, -50, 16, COL.alu));
  g.add(box(-20, 85, -20, 20, -66, -50, COL.alu));
  g.add(cylZ(6, 40, -100, COL.contact, 16));
  if (withTable) g.add(box(-200, 75, -180, 180, -30, 0, COL.context));
  m.addPort('out', g, frame([0, 0, 24], [0, 0, 1], [1, 0, 0]));
  return m;
}

export function makeModule(type, opt = {}) {
  switch (type) {
    case 'joint': return makeJoint(opt.size || 'M');
    case 'link': return makeLink(opt.length || 300, !!opt.elbow);
    case 'hub': return makeHub();
    case 'eye': return makeEye();
    case 'battery': return makeBattery();
    case 'hand': return makeHand();
    case 'suction': return makeSuction();
    case 'wheel': return makeWheel();
    case 'clamp': return makeClamp(opt.table !== false);
  }
  throw new Error('unknown module ' + type);
}

// ---------------------------------------------------------------- mating
const FLIP = new THREE.Matrix4().makeRotationX(Math.PI);
// Mate child.childPort to parent.parentPort. index = one of 4 x 90 deg positions.
export function attach(parent, parentPort, child, childPort = 'in', index = 0) {
  const pf = parent.ports[parentPort];
  const cf = child.ports[childPort];
  if (!pf || !cf) throw new Error(`port missing: ${parentPort} / ${childPort}`);
  cf.updateMatrix();
  const M = new THREE.Matrix4()
    .multiply(FLIP)
    .multiply(new THREE.Matrix4().makeRotationZ((-Math.PI / 2) * index))
    .multiply(cf.matrix.clone().invert());
  M.decompose(child.group.position, child.group.quaternion, child.group.scale);
  pf.add(child.group);
  child.parent = parent; child.parentPort = parentPort; child.childPort = childPort;
  child.mateIndex = index;
  parent.children.push(child);
  return child;
}

export function allJoints(root) {
  const out = [];
  (function walk(m) { out.push(...m.joints); m.children.forEach(walk); })(root);
  return out;
}

// ---------------------------------------------------------------- module data
export const MODULE_INFO = [
  { type: 'joint', name: 'Joint', fn: 'One revolute axis, two Ports (input, output).',
    specs: [['Housing', 'ø 90 x 120 mm'], ['Drive cartridge', 'S 12 / M 30 / L 60 Nm peak'],
      ['Brake', 'spring-applied, holds without power'], ['Encoder', 'absolute, on output'],
      ['Torque sensing', 'motor current + output encoder'], ['Wheel mode', 'continuous rotation'],
      ['Tool mount', 'ISO 9409-1-50-4-M6 pattern on the output Port, M8 tool connector']] },
  { type: 'link', name: 'Link', fn: 'Rigid spacer, two Ports.', opt: { length: 300 },
    specs: [['Tube', 'carbon fibre, ø 60 mm'], ['Length', '150-450 mm, 25 mm detents'],
      ['Length sensing', 'Hall array, written to descriptor'], ['Variants', 'straight, 90° elbow']] },
  { type: 'hub', name: 'Hub', fn: 'Root of every robot: compute, e-stop, power input.',
    specs: [['Ports', '6 (one per face)'], ['Compute', 'Jetson-class GPU module'],
      ['Power', 'mains input, or Battery modules'], ['Safety', 'e-stop receiver, STO loop'], ['Housing', '200 x 200 x 140 mm']] },
  { type: 'battery', name: 'Battery', fn: 'Power for mobile robots. One Port, swaps without tools.',
    specs: [['Voltage', '48 V'], ['Charging', 'own charging port, on or off the robot'],
      ['Protection', 'own battery management, disconnects on a fault'], ['Pack', 'flat, 180 x 180 x 18 mm, under the Hub'], ['Use', 'one per mobile robot, none on fixed robots']] },
  { type: 'wheel', name: 'Wheel', fn: 'Drive wheel for mobile bases, turned by a Joint in wheel mode.',
    specs: [['Types', 'standard or omni wheel'], ['Mount', 'one Port, on a Joint output'],
      ['Descriptor', 'radius and roller type']] },
  { type: 'eye', name: 'Eye', fn: 'Perception. One Port, mounts anywhere.',
    specs: [['Sensor', 'stereo depth, global shutter'], ['Resolution', '2 x 1.6 MP'],
      ['Baseline', '80 mm'], ['Inertial', 'IMU']] },
  { type: 'hand', name: 'Hand', fn: 'Grasping. Underactuated, adaptive.',
    specs: [['Fingers', '3, one drive'], ['Modes', 'pinch / wide / parallel'],
      ['Max. opening', '140 mm'], ['Grip force', '40 N'], ['Mount', 'Port with ISO 9409-1-50-4-M6 pattern, also fits standard cobots']] },
];
