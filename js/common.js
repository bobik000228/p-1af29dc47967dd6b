// Shared helpers for pages.
import { Viewer, webglAvailable, PHONE } from './viewer.js';
import { manifest } from './models.js';

export const HAS_GL = webglAvailable();
export { PHONE };
export let GL_ERR = HAS_GL ? '' : 'no WebGL 2';   // why there is no live 3D view (page.html?gl shows it)

// Create a viewer in el, or show a static render / note if WebGL is missing.
export async function makeViewer(el, opt, pngKey) {
  el.classList.add('loading');   // spinner until the first model is shown (Viewer.setObject) or a still replaces it
  if (HAS_GL) {
    try {
      const v = new Viewer(el, opt);
      v.png = pngKey;   // the hero sets the robot on show
      v.renderer.domElement.addEventListener('webglcontextlost', () => still(el, v.png, true));
      return v;
    } catch (e) { console.warn('WebGL viewer failed', e); GL_ERR = String(e); }
  }
  return still(el, pngKey);
}

// static render instead of a 3D view; over = on top of the (lost) canvas, keeping overlays
export async function still(el, pngKey, over = false) {
  const m = await manifest();
  // pngKey: part of a CAD render name in assets/png/, or a path
  const hit = pngKey && m.png.find((f) => f.toLowerCase().includes(pngKey));
  const png = pngKey && pngKey.includes('/') ? pngKey : hit && 'assets/png/' + hit;
  const html = png
    ? `<div class="noweb"><img src="${png}" alt="${pngKey} render"></div>`
    : '<div class="noweb">3D view needs WebGL.</div>';
  if (over || el.childElementCount) el.insertAdjacentHTML('afterbegin', html.replace('class="noweb"', 'class="noweb over"'));
  else el.innerHTML = html;
  el.classList.remove('loading');
  return null;
}

export function h(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.innerHTML = html;
  return e;
}

export function specTable(rows) {
  return '<table class="spec"><tbody>' +
    rows.map(([k, v]) => `<tr><td>${k}</td><td class="v">${v}</td></tr>`).join('') +
    '</tbody></table>';
}
