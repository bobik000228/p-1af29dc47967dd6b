// Section 04 figure: one controller network above the six robots; on every link an adapter,
// the robot's body description computed from assets/morphs.json (Joints with sizes, Link lengths, tool, base).
import { ROBOTS } from './robots.js';

const NS = 'http://www.w3.org/2000/svg';
const fig = document.getElementById('bfig');
const wires = document.getElementById('bwires');
const bodiesEl = document.getElementById('bodies');
const brain = document.getElementById('brain');
const net = document.getElementById('bnet');
const still = matchMedia('(prefers-reduced-motion: reduce)');

const TOOL = { hand: 'Hand', suction: 'Suction', eye: 'Eye' };
const isWheelJoint = (mods, i) => mods[i].type === 'joint' && mods[i + 1] && mods[i + 1].type === 'omni_wheel';

// ---------------------------------------------------------------- body description
function describe(key, m) {
  const mods = m.modules;
  const wheels = mods.filter((x) => x.type === 'omni_wheel');
  const joints = mods.filter((x, i) => x.type === 'joint' && !isWheelJoint(mods, i));
  const links = mods.filter((x) => x.type === 'link');
  // arms: Joints and Links in list order, a Hand or Suction ends an arm
  const arms = [];
  let cur = [];
  mods.forEach((x, i) => {
    if ((x.type === 'joint' && !isWheelJoint(mods, i)) || x.type === 'link') cur.push(x);
    else if (x.type === 'hand' || x.type === 'suction') { cur.push(x); arms.push(cur); cur = []; }
  });
  if (cur.length) arms.push(cur);
  const sig = (a) => a.map((x) => x.type + (x.size || '') + (x.length || '') + (x.elbow ? 'e' : '')).join();
  const same = arms.length > 1 && arms.every((a) => sig(a) === sig(arms[0]));
  const count = {};
  joints.forEach((j) => { count[j.size] = (count[j.size] || 0) + 1; });
  const sizes = ['L', 'M', 'S'].filter((s) => count[s]).map((s) => `${count[s]}${s}`).join(' ');
  const tools = {};
  mods.forEach((x) => { if (TOOL[x.type]) tools[TOOL[x.type]] = (tools[TOOL[x.type]] || 0) + 1; });
  const toolTxt = Object.entries(tools).map(([t, n]) => (n > 1 ? `2 ${t}s` : t)).join(' + ');
  const fixed = mods.some((x) => x.type === 'table_clamp');
  return {
    key, title: m.title.split(',')[0], full: m.title, mods, arms: same ? [arms[0]] : arms, twin: same,
    joints: `${joints.length} · ${sizes}`,
    links: links.map((l) => `${l.length}${l.elbow ? 'e' : ''}`)
      .reduce((o, v) => { const p = o[o.length - 1]; if (p && p[0] === v) p[1]++; else o.push([v, 1]); return o; }, [])
      .map(([v, n]) => (n > 1 ? `${n} × ${v}` : v)).join(' · '),
    tool: toolTxt,
    base: fixed ? 'fixed, clamp' : `${wheels.length} omni wheels`,
    tokens: mods.length,
  };
}

// ---------------------------------------------------------------- chain strip, Links to one scale
const R = { S: 2.4, M: 3, L: 3.7 };
const W = 132, H = 30;
function chainWidth(arm, k) {
  return arm.reduce((s, x) => s + (x.type === 'joint' ? 2 * R[x.size] + 1 : x.type === 'link' ? x.length * k : 8), 0);
}
function chainSVG(d, k) {
  let s = '';
  const x0 = d.twin ? 24 : 14;
  // base symbol
  const by = 12;
  if (d.base.startsWith('fixed')) {
    s += `<line x1="${x0 - 3}" y1="${by - 7}" x2="${x0 - 3}" y2="${by + 7}" stroke="#111" stroke-width="1.2"/>`;
    for (let i = -6; i <= 4; i += 3.5) s += `<line x1="${x0 - 3}" y1="${by + i}" x2="${x0 - 7}" y2="${by + i + 3}" stroke="#6b6f76" stroke-width=".8"/>`;
  } else {
    s += `<circle cx="${x0 - 7}" cy="${by + 6}" r="2.6" fill="none" stroke="#111"/><line x1="${x0 - 12}" y1="${by + 8.6}" x2="${x0 - 2}" y2="${by + 8.6}" stroke="#6b6f76" stroke-width=".8"/>`;
    s += `<line x1="${x0 - 7}" y1="${by + 3}" x2="${x0 - 3}" y2="${by}" stroke="#111"/>`;
  }
  if (d.twin) s += `<text x="0" y="${by + 3.5}" font-size="9" font-family="monospace" fill="#e8590c">2×</text>`;
  d.arms.forEach((arm, ai) => {
    let x = x0 - 3, y = by + ai * 16;
    if (ai > 0) s += `<path d="M${x0 - 3} ${by} V${y}" stroke="#111" fill="none"/>`;
    for (const m of arm) {
      if (m.type === 'joint') {
        const r = R[m.size];
        s += `<line x1="${x}" y1="${y}" x2="${x + 1}" y2="${y}" stroke="#111"/>`;
        s += `<circle cx="${x + 1 + r}" cy="${y}" r="${r}" fill="#fff" stroke="#111" stroke-width="1.1"/>`;
        x += 2 * r + 1;
      } else if (m.type === 'link') {
        const L = m.length * k;
        if (m.elbow) {
          // elbow Link: straight part, then a 90 degree bend down to a lower line
          s += `<path d="M${x} ${y} H${x + L - 3} q3 0 3 3 V${y + 6}" fill="none" stroke="#e8590c" stroke-width="2.4"/>`;
          y += 6;
        } else {
          s += `<line x1="${x}" y1="${y}" x2="${x + L}" y2="${y}" stroke="#e8590c" stroke-width="2.4"/>`;
        }
        x += L;
      } else if (m.type === 'hand') {
        s += `<path d="M${x} ${y} h3 M${x + 3} ${y - 3} v6 M${x + 3} ${y - 3} h4 M${x + 3} ${y + 3} h4" stroke="#111" fill="none"/>`;
        x += 8;
      } else if (m.type === 'suction') {
        s += `<path d="M${x} ${y} h4 M${x + 4} ${y - 3.5} v7" stroke="#111" stroke-width="1.6" fill="none"/>`;
        x += 8;
      }
    }
    // an arm without a gripper ends in the Eye
    if (!arm.some((m) => m.type === 'hand' || m.type === 'suction')) s += `<rect x="${x}" y="${y - 2.5}" width="5" height="5" fill="#111"/>`;
  });
  return `<svg class="chain" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMid meet" aria-hidden="true">${s}</svg>`;
}

function moduleList(d) {
  const rows = [];
  const m = d.mods;
  for (let i = 0; i < m.length; i++) {
    const x = m[i];
    if (isWheelJoint(m, i)) { rows.push(['Joint ' + x.size, 'wheel']); continue; }
    if (x.type === 'omni_wheel') { rows.push([`Wheel ø${x.d}`, 'module']); continue; }
    if (x.type === 'joint') rows.push([`Joint ${x.size}`, '']);
    else if (x.type === 'link') rows.push([`Link ${x.length} mm`, x.elbow ? 'elbow' : 'straight', 'lk']);
    else if (x.type === 'hub') rows.push(['Hub', 'root']);
    else if (x.type === 'battery') rows.push(['Battery', 'power']);
    else if (x.type === 'table_clamp') rows.push(['Table clamp', 'accessory']);
    else rows.push([TOOL[x.type] || x.type, x.type === 'eye' ? 'sensor' : 'tool']);
  }
  // collapse equal neighbours: "Joint M  x4"
  const out = [];
  for (const r of rows) {
    const p = out[out.length - 1];
    if (p && p[0] === r[0] && p[1] === r[1]) p[3] = (p[3] || 1) + 1; else out.push([...r]);
  }
  return out.map((r) => `<li class="${r[2] || ''}">${r[0]}${r[3] ? ' × ' + r[3] : ''}<span>${r[1]}</span></li>`).join('');
}

// ---------------------------------------------------------------- network drawing
function drawNet() {
  const rows = [16, 34, 52, 70], n = 11;
  let s = '';
  const xs = (k, N) => 20 + (k * 260) / (N - 1);
  for (let r = 0; r < rows.length - 1; r++)
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) if ((a * 7 + b * 3 + r) % 4 === 0) s += `<line x1="${xs(a, n)}" y1="${rows[r]}" x2="${xs(b, n)}" y2="${rows[r + 1]}"/>`;
  rows.forEach((y) => { for (let a = 0; a < n; a++) s += `<circle cx="${xs(a, n)}" cy="${y}" r="3"/>`; });
  // input row: one square per module (max over the six robots)
  for (let t = 0; t < 26; t++) s += `<rect class="tok" x="${20 + t * 10.1 - 3}" y="${82}" width="6" height="6"/>`;
  for (let a = 0; a < n; a++) s += `<line x1="${xs(a, n)}" y1="${rows[3]}" x2="${xs(a, n)}" y2="80"/>`;
  net.innerHTML = s;
}

// ---------------------------------------------------------------- wires and pulses
let paths = [];
function layout() {
  const f = fig.getBoundingClientRect();
  const b = brain.getBoundingClientRect();
  const stacked = getComputedStyle(bodiesEl).gridTemplateColumns.split(' ').length === 1;
  wires.setAttribute('viewBox', `0 0 ${f.width} ${f.height}`);
  let s = '';
  const bodies = [...bodiesEl.children];
  const N = bodies.length;
  bodies.forEach((el, i) => {
    const a = el.querySelector('.adp').getBoundingClientRect();
    const p = el.querySelector('.pic').getBoundingClientRect();
    let d, stem;
    if (stacked) {
      const x0 = b.left - f.left + 10, y0 = b.bottom - f.top;
      const y1 = a.top - f.top + 20, x1 = a.left - f.left;
      d = `M${x0} ${y0} V${y1 - 8} Q${x0} ${y1} ${x0 + 8} ${y1} H${x1}`;
      stem = `M${a.right - f.left} ${y1} H${p.left - f.left + 6}`;
    } else {
      const x0 = b.left - f.left + b.width / 2 + (i - (N - 1) / 2) * 16, y0 = b.bottom - f.top;
      const x1 = a.left - f.left + a.width / 2, y1 = a.top - f.top;
      const m = (y1 - y0) / 2;
      d = `M${x0} ${y0} C${x0} ${y0 + m} ${x1} ${y1 - m} ${x1} ${y1}`;
      stem = `M${x1} ${a.bottom - f.top} V${p.top - f.top + 4}`;
    }
    s += `<path class="w" data-i="${i}" d="${d}"/><path class="stem" data-i="${i}" d="${stem}"/>`;
    s += `<circle class="p dn" data-i="${i}" r="3.2" cx="-20" cy="-20"/><circle class="p up" data-i="${i}" r="2.6" cx="-20" cy="-20"/>`;
  });
  wires.innerHTML = s;
  paths = [...wires.querySelectorAll('path.w')].map((p) => ({
    p, len: p.getTotalLength(), dn: wires.querySelector(`.p.dn[data-i="${p.dataset.i}"]`), up: wires.querySelector(`.p.up[data-i="${p.dataset.i}"]`),
  }));
  mark();
  frame(performance.now(), true);
}

const PERIOD = 2600;
let visible = false, raf = 0;
function frame(t, once) {
  for (const [i, q] of paths.entries()) {
    const ph = ((t / PERIOD) + i * 0.17) % 1;
    const u = still.matches ? 0.35 : ph;
    const a = q.p.getPointAtLength(u * q.len);
    const c = q.p.getPointAtLength((1 - ((u + 0.5) % 1)) * q.len);
    q.dn.setAttribute('cx', a.x); q.dn.setAttribute('cy', a.y);
    q.up.setAttribute('cx', c.x); q.up.setAttribute('cy', c.y);
  }
  if (!once && visible && !still.matches) raf = requestAnimationFrame((t2) => frame(t2));
}
function run() { cancelAnimationFrame(raf); if (visible && !still.matches) raf = requestAnimationFrame((t) => frame(t)); }

// ---------------------------------------------------------------- highlight
let active = -1;
let D = [];
function mark() {
  fig.classList.toggle('hl', active >= 0);
  [...bodiesEl.children].forEach((el, i) => el.classList.toggle('on', i === active));
  wires.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('on', +el.dataset.i === active));
  const n = active >= 0 ? D[active].tokens : 0;
  net.querySelectorAll('rect.tok').forEach((r, k) => {
    r.classList.toggle('on', active >= 0 && k < n);
    r.classList.toggle('off', active >= 0 && k >= n);
  });
}
function set(i) { if (i !== active) { active = i; mark(); } }

// ---------------------------------------------------------------- build
(async () => {
  const morphs = await (await fetch('assets/morphs.json')).json();
  D = ROBOTS.map((k) => describe(k, morphs[k]));
  // one scale for all chains: the longest arm fills the strip
  const k = Math.min(...D.map((d) => {
    const fixedW = d.arms[0].reduce((s, x) => s + (x.type === 'link' ? 0 : x.type === 'joint' ? 2 * R[x.size] + 1 : 8), 0);
    const lin = Math.max(...d.arms.map((a) => a.reduce((s, x) => s + (x.length || 0), 0)));
    return lin ? (W - (d.twin ? 24 : 14) - 10 - fixedW) / lin : 1;
  }));
  bodiesEl.innerHTML = D.map((d, i) => `
    <div class="body" data-i="${i}">
      <button class="adp" type="button" aria-label="adapter of the ${d.full}">
        <span class="at">adapter<b>${d.tokens} modules</b></span>
        ${chainSVG(d, k)}
        <dl><dt>Joints</dt><dd>${d.joints}</dd><dt>Links</dt><dd class="lk">${d.links}</dd>
          <dt>Tool</dt><dd>${d.tool}</dd><dt>Base</dt><dd>${d.base}</dd></dl>
        <span class="full"><span class="at">${d.title}<b>${d.tokens} modules</b></span><ol>${moduleList(d)}</ol></span>
      </button>
      <div class="pic"><img src="assets/sw/${d.key}.png" alt="${d.full}, CAD design model" width="480" height="360" loading="lazy"></div>
      <div class="bt">${d.title}</div>
    </div>`).join('');
  drawNet();

  [...bodiesEl.children].forEach((el, i) => {
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') set(i); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') set(-1); });
    el.addEventListener('click', (e) => { e.stopPropagation(); if (e.pointerType !== 'mouse') set(active === i ? -1 : i); });
    el.querySelector('.adp').addEventListener('focus', (e) => { if (e.target.matches(':focus-visible')) set(i); });
    el.querySelector('.adp').addEventListener('blur', () => set(-1));
  });
  document.addEventListener('click', () => set(-1));

  new ResizeObserver(() => layout()).observe(fig);
  bodiesEl.querySelectorAll('img').forEach((im) => im.addEventListener('load', layout));
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; run(); }).observe(fig);
  still.addEventListener('change', () => { frame(performance.now(), true); run(); });
  layout();
})();
