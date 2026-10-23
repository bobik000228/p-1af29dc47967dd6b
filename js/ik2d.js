// Figure 3: planar arm with n links, end effector follows a draggable target.
// Damped least squares IK as a stand-in for the learned body controller.
const cv = document.getElementById('fig3-canvas');
const ctx = cv.getContext('2d');
const nIn = document.getElementById('fig3-n');
const nVal = document.getElementById('fig3-nval');
const out = document.getElementById('fig3-readout');
const INK = '#111', GREY = '#3a3d42', MUTE = '#6b6f76', RULE = '#d4d6d9', ACC = '#e8590c';

const REACH = 1000;        // mm, total length of the chain
const LIM = (160 * Math.PI) / 180;
let n = +nIn.value;
let L = [];                // link lengths, mm
let q = [];                // joint angles (relative), rad
let target = { x: 450, y: 450 };
let userUntil = 0;         // timestamp until which the user owns the target
let dragging = false;

function randomLengths() {
  const raw = Array.from({ length: n }, () => 0.5 + Math.random());
  const s = raw.reduce((a, b) => a + b, 0);
  L = raw.map((r) => Math.round((r / s) * REACH / 5) * 5);
  L[n - 1] += REACH - L.reduce((a, b) => a + b, 0);
}
function setN(k) {
  n = k; nVal.textContent = k;
  const old = q;
  q = Array.from({ length: n }, (_, i) => (i < old.length ? old[i] : 0.2));
  if (old.length === 0) q[0] = Math.PI / 2;
  randomLengths();
}

function fk() {
  const pts = [{ x: 0, y: 0 }];
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    a += q[i]; x += L[i] * Math.cos(a); y += L[i] * Math.sin(a);
    pts.push({ x, y });
  }
  return pts;
}

// one damped-least-squares step: dq = J^T (J J^T + l^2 I)^-1 e
function dlsStep(maxStep) {
  const p = fk(), e = p[n];
  let ex = target.x - e.x, ey = target.y - e.y;
  const em = Math.hypot(ex, ey), cap = 60;
  if (em > cap) { ex *= cap / em; ey *= cap / em; }
  const J = [];
  for (let i = 0; i < n; i++) J.push([-(e.y - p[i].y), e.x - p[i].x]);
  let a = 0, b = 0, d = 0;
  for (const [jx, jy] of J) { a += jx * jx; b += jx * jy; d += jy * jy; }
  const lam2 = 120 * 120;
  a += lam2; d += lam2;
  const det = a * d - b * b;
  const ux = (d * ex - b * ey) / det, uy = (-b * ex + a * ey) / det;
  for (let i = 0; i < n; i++) {
    let dq = J[i][0] * ux + J[i][1] * uy;
    dq = Math.max(-maxStep, Math.min(maxStep, dq));
    q[i] += dq;
    if (i > 0) q[i] = Math.max(-LIM, Math.min(LIM, q[i]));
  }
  // keep the base joint pointing roughly upward (arm stands on a floor)
  q[0] = Math.max(0.05, Math.min(Math.PI - 0.05, q[0]));
}

// view transform
let W = 0, H = 0, S = 1, OX = 0, OY = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S = Math.min(W / (2.3 * REACH), (H - 56) / (1.08 * REACH));
  OX = W / 2; OY = H - 30;
}
const toPx = (p) => [OX + p.x * S, OY - p.y * S];
const toW = (x, y) => ({ x: (x - OX) / S, y: (OY - y) / S });

function clampTarget(t) {
  t.y = Math.max(20, t.y);
  const r = Math.hypot(t.x, t.y), lim = REACH * 1.15;
  if (r > lim) { t.x *= lim / r; t.y *= lim / r; }
  return t;
}

function draw(err) {
  ctx.clearRect(0, 0, W, H);
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  // workspace boundary
  ctx.strokeStyle = RULE; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.arc(OX, OY, REACH * S, Math.PI, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = MUTE; ctx.fillText('reach ' + REACH + ' mm', OX + 6, OY - REACH * S - 6);
  // floor with hatching (DIN fixed support)
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(OX - 40, OY + 8); ctx.lineTo(OX + 40, OY + 8); ctx.stroke();
  ctx.beginPath();
  for (let x = -40; x < 40; x += 7) { ctx.moveTo(OX + x, OY + 16); ctx.lineTo(OX + x + 8, OY + 8); }
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OX - 10, OY + 8); ctx.lineTo(OX, OY); ctx.lineTo(OX + 10, OY + 8); ctx.stroke();
  // links
  const p = fk().map(toPx);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = GREY; ctx.lineWidth = Math.max(5, 11 - i * 1.2);
    ctx.beginPath(); ctx.moveTo(...p[i]); ctx.lineTo(...p[i + 1]); ctx.stroke();
  }
  // joints
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(...p[i], 5.5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  // end effector
  ctx.fillStyle = INK;
  ctx.fillRect(p[n][0] - 3.5, p[n][1] - 3.5, 7, 7);
  // target
  const [tx, ty] = toPx(target);
  ctx.strokeStyle = ACC; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(tx, ty, 11, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx - 17, ty); ctx.lineTo(tx - 5, ty); ctx.moveTo(tx + 5, ty); ctx.lineTo(tx + 17, ty);
  ctx.moveTo(tx, ty - 17); ctx.lineTo(tx, ty - 5); ctx.moveTo(tx, ty + 5); ctx.lineTo(tx, ty + 17); ctx.stroke();
  ctx.fillStyle = MUTE;
  ctx.fillText('target', tx + 14, ty - 12);
  ctx.fillText(W < 520 ? 'ILLUSTRATION · numerical IK' : 'ILLUSTRATION · numerical IK, not the learned controller', 10, 16);
  out.innerHTML = `<span>links <b>${n}</b></span><span>DoF <b>${n}</b></span>` +
    `<span>lengths <b>${L.join(' / ')}</b> mm</span><span>error <b>${err.toFixed(0)}</b> mm</span>`;
}

let t0 = performance.now();
function loop(now) {
  const t = (now - t0) / 1000;
  if (!dragging && now > userUntil) {
    // idle: target moves on a slow Lissajous path inside the workspace
    target = { x: 600 * Math.sin(t * 0.37), y: 520 + 260 * Math.sin(t * 0.53 + 0.7) };
  }
  for (let k = 0; k < 8; k++) dlsStep(0.02);
  const e = fk()[n];
  draw(Math.hypot(target.x - e.x, target.y - e.y));
  requestAnimationFrame(loop);
}

function pointer(e) {
  const r = cv.getBoundingClientRect();
  target = clampTarget(toW(e.clientX - r.left, e.clientY - r.top));
  userUntil = performance.now() + 6000;
}
cv.addEventListener('pointerdown', (e) => { dragging = true; cv.setPointerCapture(e.pointerId); pointer(e); });
cv.addEventListener('pointermove', (e) => { if (dragging) pointer(e); });
cv.addEventListener('pointerup', () => { dragging = false; userUntil = performance.now() + 6000; });
cv.addEventListener('pointercancel', () => { dragging = false; });
nIn.addEventListener('input', () => setN(+nIn.value));
document.getElementById('fig3-rand').addEventListener('click', randomLengths);
new ResizeObserver(resize).observe(cv);

setN(n);
resize();
requestAnimationFrame(loop);
