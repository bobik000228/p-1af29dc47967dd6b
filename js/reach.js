// Figure 5: share of simulated reaches within a tolerance, per controller.
// Data: assets/reach.json, written by sim/formwerk_sim/plots.py (web).
const cv = document.getElementById('fig5-canvas');
const ctx = cv.getContext('2d');
const tolIn = document.getElementById('fig5-tol');
const tolVal = document.getElementById('fig5-tolval');
const base = document.getElementById('fig5-base');
const out = document.getElementById('fig5-readout');
const INK = '#111', MUTE = '#6b6f76', RULE = '#d4d6d9';
const CTRL = [
  ['servo', 'PD servo only', '#8a8d91'],
  ['grav', 'PD + gravity model', '#2f6db5'],
  ['ct', 'PD + inverse dynamics', '#e8590c'],
];
const fmt = (x) => (x >= 1 ? String(x) : x.toFixed(2).replace(/0$/, ''));

let D = null, W = 0, H = 0;
const PAD = { l: 44, r: 14, t: 14, b: 34 };
const X = (mm) => PAD.l + (Math.log10(mm) + 2) / 5 * (W - PAD.l - PAD.r);
const Y = (f) => H - PAD.b - f * (H - PAD.t - PAD.b);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function draw() {
  if (!D || !W) return;
  const key = base.value;
  const tol = D.steps_mm[+tolIn.value];
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  // grid and axes
  ctx.lineWidth = 1; ctx.strokeStyle = RULE; ctx.fillStyle = MUTE;
  for (let e = -2; e <= 3; e++) {
    const x = X(10 ** e);
    ctx.beginPath(); ctx.moveTo(x, PAD.t); ctx.lineTo(x, H - PAD.b); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText(fmt(10 ** e), x, H - PAD.b + 14);
  }
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Y(f);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(f * 100 + ' %', PAD.l - 6, y + 4);
  }
  ctx.textAlign = 'center';
  ctx.fillText('final tool-point error [mm]', PAD.l + (W - PAD.l - PAD.r) / 2, H - 4);
  // curves
  for (const [c, , col] of CTRL) {
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    D.tol_mm.forEach((t, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(t), Y(D[c][key][i])));
    ctx.stroke();
  }
  // tolerance marker
  const xt = X(tol);
  ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(xt, PAD.t); ctx.lineTo(xt, H - PAD.b); ctx.stroke();
  ctx.setLineDash([]);
  // readout
  const i = D.tol_mm.indexOf(tol);
  tolVal.textContent = fmt(tol) + ' mm';
  out.innerHTML = `<span>reaches <b>${D.n[key]}</b></span>` + CTRL.map(([c, label, col]) =>
    `<span><i class="sw" style="background:${col}"></i>${label} <b>${(100 * D[c][key][i]).toFixed(1)} %</b></span>`).join('');
}

tolIn.addEventListener('input', draw);
base.addEventListener('change', draw);
new ResizeObserver(resize).observe(cv);
fetch('assets/reach.json').then((r) => r.json()).then((d) => { D = d; draw(); });
