// Small three.js viewer. All viewers on a page share one WebGL context: the shared
// renderer draws a visible view into the corner of its offscreen canvas and the view
// copies that into its own 2D canvas (seven contexts on the start page, one per view,
// made a real Android phone drop the hero's context).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// three.js r186 needs WebGL 2; the probe context is released so it does not take a slot
export function webglAvailable() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch (e) { return false; }
}

// phones: one live 3D view per page, no shadow map, pixel ratio <= 1.5 (GPU memory)
export const PHONE = matchMedia('(hover: none), (max-width: 600px)').matches;

let shared = null;   // { r, views }
function sharedRenderer() {
  if (shared) return shared;
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  r.setPixelRatio(1);   // views pass device pixels
  r.setClearColor(0xffffff, 1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.setScissorTest(true);
  // no shadow map on phones: on a real Android phone (PowerVR) the hero, the only
  // view with shadows, lost its context within 2 s, the essay views without them ran
  r.shadowMap.enabled = !PHONE;
  r.shadowMap.type = THREE.PCFShadowMap;
  shared = { r, views: [] };
  // if the browser drops the context (memory pressure), stop; makeViewer shows a still image
  r.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); r.setAnimationLoop(null); });
  r.setAnimationLoop(() => shared.views.forEach((v) => v.frame()));
  return shared;
}

export class Viewer {
  constructor(el, opt = {}) {
    this.el = el;
    this.opt = Object.assign({ autoRotate: false, zoom: false, grid: true, az: 35, el: 22, fov: 28, margin: 1.12 }, opt);
    this.ticks = [];
    this.visible = true;
    this.last = performance.now();
    this.t = 0;

    const sh = sharedRenderer();
    const r = this.renderer = sh.r;   // shared: listen on r.domElement for context loss only
    this.dpr = Math.min(window.devicePixelRatio || 1, PHONE ? 1.5 : 2);
    const cv = this.canvas = document.createElement('canvas');   // pointer events go here
    cv.style.cssText = 'display:block;width:100%;height:100%';   // buffer is w*dpr; CSS keeps it in its box
    this.ctx = cv.getContext('2d');
    el.appendChild(cv);

    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 2.3));
    const d1 = this.sun = new THREE.DirectionalLight(0xffffff, 2.2); d1.position.set(2, -3, 5); s.add(d1);
    if (this.opt.shadow && !PHONE) {
      d1.castShadow = true;
      d1.shadow.mapSize.setScalar(2048);
      d1.shadow.bias = -0.0005; d1.shadow.normalBias = 0.01;
      s.add(d1.target);
    }
    const d2 = new THREE.DirectionalLight(0xffffff, 0.8); d2.position.set(-4, 3, 2); s.add(d2);

    const c = this.camera = new THREE.PerspectiveCamera(this.opt.fov, 1, 0.01, 50);
    c.up.set(0, 0, 1);
    const ctl = this.controls = new OrbitControls(c, cv);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.enablePan = false; ctl.enableZoom = this.opt.zoom;
    ctl.autoRotate = this.opt.autoRotate; ctl.autoRotateSpeed = 0.5;
    ctl.minPolarAngle = 0.15; ctl.maxPolarAngle = Math.PI * 0.62;
    // let the page scroll vertically on touch devices; horizontal drag rotates
    cv.style.touchAction = 'pan-y';

    this.root = new THREE.Group(); s.add(this.root);

    new ResizeObserver(() => this.resize()).observe(el);
    new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(el);
    this.resize();
    sh.views.push(this);
  }

  stop() { shared.views = shared.views.filter((x) => x !== this); }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.lastFit) this.fit(this.lastFit, false);
  }

  setObject(obj, { fit = true, keepView = false } = {}) {
    this.el.classList.remove('loading');
    this.root.clear();
    this.root.add(obj);
    if (this.opt.grid) this.root.add(this.makeGrid(obj));
    if (fit) this.fit(obj, !keepView);
  }

  makeGrid(obj) {
    const b = new THREE.Box3().setFromObject(obj);
    const size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, 0.3) * 1.3;
    const step = 0.05;
    const n = Math.ceil(size / step / 2) * 2;
    const g = new THREE.GridHelper(n * step, n, 0xd9d9d9, 0xececec);
    g.rotation.x = Math.PI / 2;
    g.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.min.z - 0.0005);
    g.position.x = Math.round(g.position.x / step) * step;
    g.position.y = Math.round(g.position.y / step) * step;
    return g;
  }

  // aim the shadow-casting light at a scene of bounding sphere sph
  shadowAround(sph) {
    const d = this.sun, sc = d.shadow.camera, R = sph.radius * 1.2;
    d.target.position.copy(sph.center);
    d.position.copy(sph.center).add(new THREE.Vector3(2, -3, 5).normalize().multiplyScalar(4 * R));
    sc.left = sc.bottom = -R; sc.right = sc.top = R; sc.near = R; sc.far = 8 * R;
    sc.updateProjectionMatrix();
  }

  // fit camera to the bounding sphere of obj; resetView = set the iso direction
  fit(obj, resetView = true, sphereOverride) {
    this.lastFit = obj;
    const sph = sphereOverride || new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
    const c = this.camera;
    const vfov = THREE.MathUtils.degToRad(c.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * c.aspect);
    const dist = (sph.radius * this.opt.margin) / Math.sin(Math.min(vfov, hfov) / 2);
    let dir;
    if (resetView || !this.dir) {
      const az = THREE.MathUtils.degToRad(this.opt.az), el = THREE.MathUtils.degToRad(this.opt.el);
      dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), Math.sin(el));
    } else {
      dir = c.position.clone().sub(this.controls.target).normalize();
    }
    this.dir = dir;
    this.controls.target.copy(sph.center);
    c.position.copy(sph.center).addScaledVector(dir, dist);
    c.near = dist / 50; c.far = dist * 10;
    c.updateProjectionMatrix();
    this.controls.update();
  }

  frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (!this.visible) return;
    this.t += dt;
    try {   // an exception must not stop the animation loop
      for (const f of this.ticks) f(this.t, dt);
      this.controls.update();
      const r = this.renderer, cv = this.canvas, w = cv.width, h = cv.height;
      if (!w || !h) return;
      const size = r.getSize(new THREE.Vector2());
      if (size.x < w || size.y < h) r.setSize(Math.max(size.x, w), Math.max(size.y, h), false);   // grows only
      r.setViewport(0, 0, w, h); r.setScissor(0, 0, w, h);
      r.render(this.scene, this.camera);
      // viewport (0,0) is the bottom left of the drawing buffer
      this.ctx.drawImage(r.domElement, 0, r.domElement.height - h, w, h, 0, 0, w, h);
    } catch (e) { console.error(e); }
  }
}
