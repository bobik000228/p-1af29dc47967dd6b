import { makeViewer, still, PHONE } from './common.js';
import { moduleModel } from './models.js';
import { MODULE_INFO } from './parts.js';
import { ROBOTS } from './robots.js';

// ---------------------------------------------------------------- eighth cell: any standard tool
// Not a module: every Port carries the ISO 9409-1-50 bolt pattern, so standard tools bolt onto a Joint.
// Line drawings in a 120 x 120 box, hanging from the same Joint and Port (drawn once).
const TOOLS = [
  ['Parallel gripper', '<rect x="40" y="27" width="40" height="20"/><rect x="45" y="47" width="9" height="34"/><rect x="66" y="47" width="9" height="34"/><rect x="51" y="70" width="3" height="11" class="a"/><rect x="66" y="70" width="3" height="11" class="a"/>'],
  ['Vacuum gripper', '<rect x="50" y="27" width="20" height="14"/><rect x="57" y="41" width="6" height="30"/><path d="M44 90 L52 71 L68 71 L76 90 Z"/><path d="M70 33 C88 33 90 52 76 58" fill="none"/><line x1="44" y1="90" x2="76" y2="90" class="as"/>'],
  ['Magnetic gripper', '<rect x="46" y="27" width="28" height="14"/><rect x="40" y="41" width="40" height="30"/><rect x="40" y="71" width="12" height="16" class="a"/><rect x="68" y="71" width="12" height="16" class="a"/><rect x="52" y="71" width="16" height="9"/>'],
  ['Soft gripper', '<rect x="46" y="27" width="28" height="12"/><path d="M48 39 C40 58 38 74 50 90 L55 87 C46 72 48 58 54 39 Z"/><path d="M57 39 L57 92 L63 92 L63 39 Z"/><path d="M72 39 C80 58 82 74 70 90 L65 87 C74 72 72 58 66 39 Z"/>'],
  ['Screwdriver', '<rect x="47" y="27" width="26" height="32" rx="4"/><rect x="54" y="59" width="12" height="9"/><line x1="60" y1="68" x2="60" y2="96" class="t"/><path d="M57 96 L63 96 L60 101 Z" class="f"/>'],
  ['Welding torch', '<rect x="52" y="27" width="16" height="12"/><path d="M56 39 C56 62 64 72 76 82 L81 77 C70 68 64 58 64 39 Z"/><path d="M76 82 L81 77 L88 86 L83 91 Z" class="f"/><path d="M88 94 l4 6 M84 96 l1 7 M91 91 l7 3" class="as"/>'],
  ['Glue dispenser', '<rect x="50" y="27" width="20" height="42" rx="2"/><path d="M53 69 L67 69 L61 90 L59 90 Z"/><circle cx="60" cy="97" r="3" class="a"/>'],
  ['Sanding spindle', '<rect x="48" y="27" width="24" height="28" rx="3"/><rect x="57" y="55" width="6" height="12"/><ellipse cx="60" cy="72" rx="26" ry="6" class="a"/>'],
  ['Spray gun', '<rect x="48" y="27" width="24" height="20"/><rect x="54" y="47" width="12" height="22"/><path d="M57 69 L63 69 L62 76 L58 76 Z" class="f"/><path d="M58 80 L46 102 M60 80 L60 104 M62 80 L74 102" class="as"/>'],
  ['Inspection camera', '<rect x="42" y="27" width="36" height="24" rx="2"/><circle cx="60" cy="51" r="9"/><circle cx="60" cy="51" r="4" class="f"/><path d="M53 62 L38 100 M67 62 L82 100" class="as"/>'],
];
function anyTool() {
  const cell = document.createElement('div');
  cell.className = 'mod anytool';
  const mount = '<rect x="44" y="0" width="32" height="12" class="j"/><rect x="38" y="12" width="44" height="5" class="a"/>' +
    '<rect x="40" y="17" width="40" height="10"/><circle cx="46" cy="22" r="1.6" class="f"/><circle cx="74" cy="22" r="1.6" class="f"/>';
  cell.innerHTML = `<div class="tools"><svg viewBox="0 0 120 108" role="img" aria-label="Standard tools on a Joint">` +
    `<style>rect,path,circle,ellipse{fill:#fff;stroke:#111;stroke-width:1.3;stroke-linejoin:round}.a{fill:#e8590c}.f{fill:#111}.j{fill:#d4d6d9}` +
    `.as{fill:none;stroke:#e8590c;stroke-width:1.4;stroke-linecap:round}.t{stroke:#111;stroke-width:2.4}</style>` +
    `<g class="tool"></g>${mount}</svg><div class="tname"></div></div>` +
    `<h3><span class="no">+</span>Any tool</h3><p>Every Port carries the ISO 9409-1 bolt pattern, so standard tools bolt onto any Joint.</p>`;
  const g = cell.querySelector('.tool'), name = cell.querySelector('.tname');
  let k = 0;
  const show = () => { g.innerHTML = TOOLS[k][1]; name.textContent = TOOLS[k][0]; g.style.opacity = name.style.opacity = 1; };
  show();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(() => {
      g.style.opacity = name.style.opacity = 0;
      setTimeout(() => { k = (k + 1) % TOOLS.length; show(); }, 350);
    }, 1800);
  }
  return cell;
}

// ---------------------------------------------------------------- module grid
(async () => {
  const grid = document.getElementById('mods');
  MODULE_INFO.forEach((info, i) => {
    const cell = document.createElement('div');
    cell.className = 'mod';
    cell.innerHTML = `<div class="view"></div><h3><span class="no">${String(i + 1).padStart(2, '0')}</span>${info.name}</h3><p>${info.fn}</p>`;
    grid.appendChild(cell);
    if (PHONE) { still(cell.querySelector('.view'), `module_${info.type === 'link' ? 'link_300' : info.type}`); return; }  // one live 3D view per phone: the hero
    (async () => {
      const v = await makeViewer(cell.querySelector('.view'), { autoRotate: true, grid: false, az: 30 + i * 15, el: 24, margin: 1.15 }, info.type);
      if (!v) return;
      v.controls.autoRotateSpeed = 1.2;
      const m = await moduleModel(info.type, info.opt);
      v.setObject(m.object);
      if (m.module && m.module.setGrip) v.ticks.push((t) => m.module.setGrip(0.5 + 0.5 * Math.sin(t)));
    })();
  });
  grid.appendChild(anyTool());
})();

// ---------------------------------------------------------------- port drawing
(function portSVG() {
  const svg = document.getElementById('port-svg');
  const INK = '#111', MUTE = '#6b6f76', ACC = '#e8590c';
  const d2r = Math.PI / 180;
  const P = (r, a) => [r * Math.cos(a * d2r), -r * Math.sin(a * d2r)];
  const sector = (r0, r1, a0, a1) => {
    const [x0, y0] = P(r1, a0), [x1, y1] = P(r1, a1), [x2, y2] = P(r0, a1), [x3, y3] = P(r0, a0);
    return `M${x0} ${y0} A${r1} ${r1} 0 0 0 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 0 1 ${x3} ${y3}Z`;
  };
  let s = '';
  s += `<circle r="37.5" fill="${ACC}" stroke="${INK}" stroke-width="0.3"/>`;
  s += `<circle r="35" fill="#fff" stroke="${INK}" stroke-width="0.45"/>`;
  for (let k = 0; k < 4; k++) {
    const c = 90 * k, cs = 45 + 90 * k;
    s += `<path d="${sector(28, 35, c - 15, c + 15)}" fill="#fff" stroke="${INK}" stroke-width="0.35"/>`;
    s += `<path d="${sector(28, 35, cs - 18, cs + 18)}" fill="#e4e5e6" stroke="${INK}" stroke-width="0.25"/>`;
  }
  s += `<circle r="28" fill="none" stroke="${INK}" stroke-width="0.25"/>`;
  // ISO 9409-1-50-4-M6 tool pattern: 4 x M6 on a 50 mm pitch circle
  for (let k = 0; k < 4; k++) {
    const [x, y] = P(25, 80 + 90 * k);
    s += `<circle cx="${x}" cy="${y}" r="2.5" fill="#fff" stroke="${INK}" stroke-width="0.35"/><circle cx="${x}" cy="${y}" r="3" fill="none" stroke="${INK}" stroke-width="0.15" stroke-dasharray="0.8 0.6"/>`;
  }
  s += `<circle r="15.5" fill="#f3f3f2" stroke="${INK}" stroke-width="0.35"/>`;
  for (let k = 0; k < 10; k++) {
    const [x, y] = P(10.5, k * 36 + 18);
    s += `<circle cx="${x}" cy="${y}" r="1.3" fill="#3a3d42"/>`;
  }
  { const [x, y] = P(21, 10); s += `<circle cx="${x}" cy="${y}" r="2.5" fill="${INK}"/>`; }
  for (let k = 0; k < 4; k++) {
    const [x, y] = P(21, 35 + 90 * k);
    s += `<circle cx="${x}" cy="${y}" r="3" fill="#fff" stroke="${INK}" stroke-width="0.3"/>`;
  }
  // centre lines (dash-dot)
  s += `<g stroke="${MUTE}" stroke-width="0.2" stroke-dasharray="6 1.5 1 1.5"><line x1="-44" y1="0" x2="44" y2="0"/><line x1="0" y1="-44" x2="0" y2="44"/></g>`;
  // dimension ø70
  const dy = -47;
  s += `<g stroke="${INK}" stroke-width="0.2"><line x1="-35" y1="-3" x2="-35" y2="${dy - 2}"/><line x1="35" y1="-3" x2="35" y2="${dy - 2}"/>`;
  s += `<line x1="-35" y1="${dy}" x2="35" y2="${dy}"/></g>`;
  s += `<path d="M-35 ${dy} l4 -1.2 v2.4z M35 ${dy} l-4 -1.2 v2.4z" fill="${INK}"/>`;
  s += `<text x="0" y="${dy - 1.8}" font-size="4" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" fill="${INK}">ø70</text>`;
  // leaders
  const lab = (x0, y0, x1, y1, t, anchor = 'start') =>
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${INK}" stroke-width="0.2"/><circle cx="${x0}" cy="${y0}" r="0.6" fill="${INK}"/>` +
    `<text x="${x1 + (anchor === 'start' ? 1 : -1)}" y="${y1 + 1.2}" font-size="3.4" text-anchor="${anchor}" font-family="ui-monospace, Menlo, monospace" fill="${INK}">${t}</text>`;
  { const [x, y] = P(21, 10); s += lab(x, y, 44, -22, 'lock pin'); }
  s += lab(31, 0, 44, 8, 'lug (4x)');
  { const [x, y] = P(31, 225); s += lab(x, y, -44, 44, 'slot (4x)', 'end'); }
  { const [x, y] = P(10.5, 234); s += lab(x, y, -44, 30, 'contacts (10x)', 'end'); }
  { const [x, y] = P(36.3, 300); s += lab(x, y, 44, 50, 'locking collar'); }
  { const [x, y] = P(25, 170); s += lab(x, y, -44, -30, 'M6 (4x)', 'end'); }
  svg.innerHTML = s;
})();

// ---------------------------------------------------------------- parts matrix
// Columns: modules first, passive parts after the rule. Counts from assets/morphs.json.
const COLS = [
  ['Hub', (m) => m.type === 'hub'],
  ['Joint L', (m) => m.type === 'joint' && m.size === 'L'],
  ['Joint M', (m) => m.type === 'joint' && m.size === 'M'],
  ['Joint S', (m) => m.type === 'joint' && m.size === 'S'],
  ['Hand', (m) => m.type === 'hand'],
  ['Eye', (m) => m.type === 'eye'],
  ['Wheel', (m) => m.type === 'omni_wheel'],
  ['Battery', (m) => m.type === 'battery'],
  ['Link', (m) => m.type === 'link'],
  ['Suction', (m) => m.type === 'suction'],
  ['Clamp', (m) => m.type === 'table_clamp'],
];
const NMOD = 8; // first 8 columns: modules; Links are counted by length; Suction (a standard tool) and Clamp are bought parts
const linkKey = (m) => `${m.length}${m.elbow ? ' elbow' : ''}`;

(async () => {
  const data = await fetch('assets/morphs.json').then((r) => r.json());
  const robots = ROBOTS.map((k) => data[k]);
  const counts = robots.map((r) => COLS.map(([, f]) => r.modules.filter(f).length));
  const stock = COLS.map((_, j) => Math.max(...counts.map((c) => c[j])));
  // Links come in several lengths: the stock holds, per length, the most any robot uses.
  const linkMax = new Map();
  for (const r of robots) {
    const n = new Map();
    for (const m of r.modules.filter((m) => m.type === 'link')) n.set(linkKey(m), (n.get(linkKey(m)) || 0) + 1);
    for (const [k, v] of n) linkMax.set(k, Math.max(linkMax.get(k) || 0, v));
  }
  stock[NMOD] = [...linkMax.values()].reduce((a, b) => a + b, 0);
  const sum = (c) => c.slice(0, NMOD).reduce((a, b) => a + b, 0);
  const cell = (n, j) => `<td class="c${j === NMOD ? ' sep' : ''}">${n || '<span class="z">·</span>'}</td>`;
  const row = (name, c, cls = '') => `<tr${cls}><td>${name}</td>${c.map(cell).join('')}<td class="c sum">${sum(c)}</td></tr>`;
  document.getElementById('matrix').innerHTML =
    `<thead><tr><th>Robot</th>${COLS.map(([h], j) => `<th class="c${j === NMOD ? ' sep' : ''}">${h}</th>`).join('')}<th class="c sum">Modules</th></tr></thead>` +
    '<tbody>' + robots.map((r, i) => row(r.title.split(',')[0], counts[i])).join('') + '</tbody>' +
    `<tfoot>${row('Stock for any one', stock, ' class="stock"')}</tfoot>`;
  const total = counts.reduce((a, c) => a + sum(c), 0);
  document.getElementById('matrix-note').textContent =
    `One after another: ${sum(stock)} modules, ${stock[NMOD]} Links. Side by side: ${total} modules.`;
})();
