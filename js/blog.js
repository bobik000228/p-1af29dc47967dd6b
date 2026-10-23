import * as THREE from 'three';
import { makeViewer, specTable } from './common.js';
import { moduleModel } from './models.js';
import { MODULE_INFO, MM, makeHub, makeJoint, makeLink, makeHand, makeSuction, makeEye, attach, COL, mat } from './parts.js';

// ---------------------------------------------------------------- Figure 1
(async () => {
  const el = document.getElementById('fig1-view');
  const panel = document.getElementById('fig1-panel');
  const v = await makeViewer(el, { az: 28, el: 30, margin: 0.78 }, 'assets/still/fig1.png');
  const showInfo = (i) => {
    if (i < 0) { panel.innerHTML = '<span class="note">Select a module.</span>'; return; }
    const info = MODULE_INFO[i];
    panel.innerHTML = `<h3>${String(i + 1).padStart(2, '0')} ${info.name}</h3><div class="note">${info.fn}</div>` + specTable(info.specs);
  };
  showInfo(0);
  if (!v) return;
  const all = new THREE.Group();
  const items = [];
  const pitch = 0.3;
  for (let i = 0; i < MODULE_INFO.length; i++) {
    const info = MODULE_INFO[i];
    const m = await moduleModel(info.type, info.type === 'link' ? { length: 250 } : info.opt);
    const slot = new THREE.Group();
    const obj = m.object;
    // centre each model on its slot, standing on z = 0
    const b = new THREE.Box3().setFromObject(obj);
    const c = b.getCenter(new THREE.Vector3());
    obj.position.x -= c.x; obj.position.y -= c.y; obj.position.z -= b.min.z;
    slot.add(obj);
    slot.position.set(((i % 4) - 1.5) * pitch, (Math.floor(i / 4) - 0.5) * -pitch, 0);
    obj.traverse((n) => { n.userData.slot = i; });
    // selection marker: thin orange square on the floor
    const sq = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.26, 0.26)),
      new THREE.LineBasicMaterial({ color: COL.orange }));
    sq.visible = false;
    slot.add(sq);
    all.add(slot);
    items.push({ slot, sq, mod: m.module });
  }
  v.setObject(all);
  const select = (i) => { items.forEach((it, k) => { it.sq.visible = k === i; }); showInfo(i); };
  select(0);
  v.ticks.push((t) => { const h = items[MODULE_INFO.findIndex((m) => m.type === 'hand')].mod; if (h && h.setGrip) h.setGrip(0.5 + 0.5 * Math.sin(t)); });

  const ray = new THREE.Raycaster();
  let down = null;
  const cv = v.canvas;
  cv.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = cv.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(p, v.camera);
    const hit = ray.intersectObject(all, true).find((h) => h.object.isMesh && h.object.userData.slot !== undefined);
    if (hit) select(hit.object.userData.slot);
  });
})();

// ---------------------------------------------------------------- Figure 2
(async () => {
  const el = document.getElementById('fig2-view');
  const v = await makeViewer(el, { az: 35, el: 20, margin: 1.2 }, 'assets/still/fig2.png');
  const urdfEl = document.getElementById('fig2-urdf');
  const readout = document.getElementById('fig2-readout');
  const hint = document.getElementById('fig2-hint');
  const lenSel = document.getElementById('fig2-len');
  const buttons = document.querySelectorAll('#fig2-controls [data-add]');
  const MAX = 12;
  const DEFAULT = [
    { t: 'joint', size: 'M' }, { t: 'elbow', len: 300 }, { t: 'joint', size: 'M' }, { t: 'elbow', len: 250 },
  ];
  let chain = DEFAULT.slice();

  function build() {
    const hub = makeHub();
    const mods = [hub];
    let cur = hub, port = 'top', nJ = 0, closed = false;
    for (const s of chain) {
      let m;
      if (s.t === 'joint') m = makeJoint(s.size);
      else if (s.t === 'link') m = makeLink(s.len, false);
      else if (s.t === 'elbow') m = makeLink(s.len, true);
      else if (s.t === 'hand') m = makeHand();
      else if (s.t === 'suction') m = makeSuction();
      else if (s.t === 'eye') m = makeEye();
      const idx = s.t === 'joint' ? (nJ++ % 2) : 0;
      attach(cur, port, m, 'in', idx);
      m.spec = s;
      mods.push(m);
      if (m.ports.out) { cur = m; port = 'out'; } else { closed = true; }
    }
    // stand the hub on the floor
    const root = new THREE.Group();
    hub.group.position.z = 70 * MM;
    root.add(hub.group);
    return { root, mods, closed, freeName: closed ? null : `${cur === hub ? 'hub' : cur.type}/${port}` };
  }

  // ---- URDF generation from the assembled tree (descriptor data only)
  const f = (x) => (Math.abs(x) < 5e-5 ? 0 : x).toFixed(4).replace(/\.?0+$/, '') || '0';
  const vec = (a) => a.map(f).join(' ');
  const EFFORT = { S: 12, M: 30, L: 60 };
  function urdf(mods) {
    const name = new Map();
    const counters = {};
    const lines = ['<robot name="formwerk_assembly">'];
    const mark = [];
    for (const m of mods) {
      const k = m.type; counters[k] = (counters[k] || 0) + 1;
      const base = m.type === 'hub' ? 'hub' : `${k}${counters[k]}`;
      name.set(m, base);
    }
    mods.forEach((m, i) => {
      const start = lines.length;
      const n = name.get(m);
      if (m.type === 'joint') {
        lines.push(`  <link name="${n}_stator"/>`, `  <link name="${n}_rotor"/>`);
        lines.push(`  <joint name="${n}" type="revolute">`,
          `    <parent link="${n}_stator"/><child link="${n}_rotor"/>`,
          `    <origin xyz="0 0 0.092" rpy="0 0 0"/><axis xyz="0 0 1"/>`,
          `    <limit lower="-3.1416" upper="3.1416" effort="${EFFORT[m.size]}" velocity="3.0"/>`,
          '  </joint>');
      } else {
        const extra = m.type === 'link' ? ` <!-- ${m.elbow ? 'elbow, ' : ''}${m.length} mm (Hall detent) -->` : '';
        lines.push(`  <link name="${n}"/>${extra}`);
      }
      if (m.parent) {
        const pn = name.get(m.parent);
        const pl = m.parent.type === 'joint' ? `${pn}_rotor` : pn;
        const cl = m.type === 'joint' ? `${n}_stator` : n;
        const pf = m.parent.ports[m.parentPort];
        pf.updateMatrix(); m.group.updateMatrix();
        const M = pf.matrix.clone().multiply(m.group.matrix);
        const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
        M.decompose(p, q, s);
        const e = new THREE.Euler().setFromQuaternion(q, 'ZYX');
        lines.push(`  <joint name="${pn}_to_${n}" type="fixed"> <!-- Port ${m.parentPort}, index ${m.mateIndex} -->`,
          `    <parent link="${pl}"/><child link="${cl}"/>`,
          `    <origin xyz="${vec([p.x, p.y, p.z])}" rpy="${vec([e.x, e.y, e.z])}"/>`,
          '  </joint>');
      }
      if (i === mods.length - 1 && mods.length > 1) mark.push([start, lines.length]);
    });
    lines.push('</robot>');
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return lines.map((l, i) => {
      const hl = mark.some(([a, b]) => i >= a && i < b);
      return hl ? `<span class="hl">${esc(l)}</span>` : esc(l);
    }).join('\n');
  }

  let anim = [];
  function update(refit = true) {
    const r = build();
    const joints = r.mods.filter((m) => m.type === 'joint');
    const nLinks = r.mods.filter((m) => m.type === 'link').length;
    readout.innerHTML = `<span>modules <b>${r.mods.length}</b></span><span>DoF <b>${joints.length}</b></span>` +
      `<span>links <b>${nLinks}</b></span><span>free Port <b>${r.freeName || 'none (tool fitted)'}</b></span>`;
    hint.textContent = r.freeName ? `free Port: ${r.freeName}` : 'chain closed by tool';
    urdfEl.innerHTML = urdf(r.mods);
    urdfEl.scrollTop = urdfEl.scrollHeight;
    buttons.forEach((b) => { b.disabled = r.closed || chain.length >= MAX; });
    lenSel.disabled = r.closed || chain.length >= MAX;
    // mark the free Port with an orange ring
    if (r.freeName) {
      const last = r.mods[r.mods.length - 1];
      const pf = last.ports[last === r.mods[0] ? 'top' : 'out'];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(46 * MM, 2 * MM, 8, 48), mat(COL.orange));
      ring.position.z = 4 * MM;
      pf.add(ring);
    }
    if (!v) return;
    v.setObject(r.root, { keepView: true, fit: refit });
    anim = joints.map((j, i) => ({ o: j.joints[0], ph: i * 1.1 }));
    v.ticks.length = 0;
    v.ticks.push((t) => {
      for (const a of anim) a.o.rotation.z = 0.5 * Math.sin(0.5 * t + a.ph);
    });
  }

  buttons.forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.add;
    const s = { t };
    if (t === 'joint') s.size = b.dataset.size;
    if (t === 'link' || t === 'elbow') s.len = Math.max(+lenSel.value, t === 'elbow' ? 200 : 150);
    chain.push(s);
    update();
  }));
  document.getElementById('fig2-undo').addEventListener('click', () => { chain.pop(); update(); });
  document.getElementById('fig2-reset').addEventListener('click', () => { chain = DEFAULT.slice(); update(); });
  update();
})();

// ---------------------------------------------------------------- large images: spinner until loaded
document.querySelectorAll('img.sim').forEach((img) => {
  if (img.complete) return;
  const box = img.parentElement;
  box.classList.add('loading');
  const done = () => box.classList.remove('loading');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
});
