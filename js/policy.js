// Figure 6: share of reaches within 5 mm against the number of Joints, per controller.
// Data: assets/policy.json, written by sim/formwerk_sim/plots.py (policy).
const cv = document.getElementById('fig6-canvas');
const ctx = cv.getContext('2d');
const base = document.getElementById('fig6-base');
const out = document.getElementById('fig6-readout');
const MUTE = '#6b6f76', RULE = '#d4d6d9';
const CTRL = [
  ['analytic', 'model-based', '#8a8d91'],
  ['learned', 'learned, with module list', '#e8590c'],
  ['blind', 'learned, without module list', '#2f6db5'],
];

let D = null, W = 0, H = 0;
const PAD = { l: 44, r: 14, t: 14, b: 34 };
const X = (i) => PAD.l + (i + 0.5) / D.joints.length * (W - PAD.l - PAD.r);
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
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.lineWidth = 1; ctx.strokeStyle = RULE; ctx.fillStyle = MUTE;
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Y(f);
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText(f * 100 + ' %', PAD.l - 6, y + 4);
  }
  ctx.textAlign = 'center';
  D.joints.forEach((n, i) => ctx.fillText(n, X(i), H - PAD.b + 14));
  ctx.fillText('Joints in the arm', PAD.l + (W - PAD.l - PAD.r) / 2, H - 4);
  for (const [c, , col] of CTRL) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    D[c][key].forEach((f, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i), Y(f)));
    ctx.stroke();
    D[c][key].forEach((f, i) => { ctx.beginPath(); ctx.arc(X(i), Y(f), 3, 0, 2 * Math.PI); ctx.fill(); });
  }
  const last = D.joints.length - 1;
  out.innerHTML = `<span>reaches <b>${D.n[key]}</b></span>` + CTRL.map(([c, label, col]) =>
    `<span><i class="sw" style="background:${col}"></i>${label}: ${D.joints[0]} Joints <b>${(100 * D[c][key][0]).toFixed(1)}&nbsp;%</b>, ` +
    `${D.joints[last]} Joints <b>${(100 * D[c][key][last]).toFixed(1)}&nbsp;%</b></span>`).join('');
}

base.addEventListener('change', draw);
new ResizeObserver(resize).observe(cv);
fetch('assets/policy.json').then((r) => r.json()).then((d) => { D = d; draw(); });
