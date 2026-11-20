import { defaultParams, clone, PANELS, HSL_BANDS, FACE_SLIDERS, newFace, sanitizeParams } from './params.js';
import { Renderer } from './renderer.js';
import { loadRaw, loadImage, isRawName, fullSize } from './loader.js';
import { computeGeometry, ASPECTS, outHeightScale, cropToDisplayV, displayToCropV } from './geometry.js';
import { BUILTIN_PRESETS, parseXmp } from './presets.js';
import { PROFILES, buildProfileLUT, parseCube } from './profiles.js';
import { evalCurve } from './curves.js';
import { RECIPES, FILM_SIMS, WB_MODES, LEVEL3, blankRecipe, effectiveParams, recipeSummary, makeProfileFile, parseProfileFile } from './recipes.js';
import { DispCache, DISP_N } from './liquify.js';
import { tick as haptic, hapticsOn, setHaptics } from './haptics.js';
import * as store from './storage.js';
import { paramsToXmp, lutToCube, makeZip, README_LR } from './lrexport.js';

const dispCache = new DispCache();
let dispKey = '';
function ensureDisp(p, aspectC) {
  const last = p.pushes[p.pushes.length - 1];
  const key = p.pushes.length + ':' + aspectC.toFixed(4) + ':' + (last ? [last.ax, last.ay, last.bx, last.by, last.r].join(',') : '');
  if (key === dispKey) return;
  dispKey = key;
  renderer.setDisp(dispCache.update(p.pushes, aspectC), DISP_N);
}

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
};

const ICONS = {
  looks: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  profile: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" opacity=".5"/>',
  light: '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" stroke="currentColor" stroke-width="1.6"/>',
  color: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.5-4-8-9-8z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7" r="1.3" fill="currentColor"/><circle cx="16" cy="10" r="1.3" fill="currentColor"/>',
  presence: '<path d="M4 18 10 6l4 8 2-3 4 7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  hsl: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="1.2"/>',
  curve: '<path d="M4 20C10 20 9 4 20 4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 4v16h16" fill="none" stroke="currentColor" stroke-width="1" opacity=".5"/>',
  grading: '<circle cx="8" cy="9" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="9" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="15.5" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  calibration: '<path d="M5 20V9M12 20V4M19 20v-8" stroke="currentColor" stroke-width="1.6"/><circle cx="5" cy="9" r="2" fill="currentColor"/><circle cx="12" cy="13" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
  detail: '<path d="M12 3 21 20H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  selective: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/>',
  gradient: '<rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 9h16" stroke="currentColor" stroke-width="1.6"/><path d="M4 14h16" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>',
  effects: '<rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cx="12" cy="12" rx="5" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  face: '<ellipse cx="12" cy="12" rx="6.5" ry="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9.5" cy="10.5" r="1" fill="currentColor"/><circle cx="14.5" cy="10.5" r="1" fill="currentColor"/><path d="M9.5 15.5q2.5 2 5 0" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  body: '<circle cx="12" cy="4.5" r="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v7M8 10h8M12 14l-3 7M12 14l3 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M20 4v16M18.5 6 20 4l1.5 2M18.5 18l1.5 2 1.5-2" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  skin: '<path d="M12 3c3 4 6 7 6 10.5a6 6 0 0 1-12 0C6 10 9 7 12 3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  lens: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 3.5 15 9M20.5 12 15 14.5M12 20.5 9 15M3.5 12 9 9.5" stroke="currentColor" stroke-width="1.1"/>',
  crop: '<path d="M7 3v14h14M3 7h14v14" fill="none" stroke="currentColor" stroke-width="1.6"/>',
};
const TABS = [
  ['looks', 'Kiểu'], ['profile', 'Profile'], ['light', 'Ánh sáng'], ['color', 'Màu'], ['presence', 'Hiện diện'],
  ['hsl', 'HSL'], ['curve', 'Đường cong'], ['grading', 'Chỉnh màu'], ['face', 'Khuôn mặt'], ['body', 'Dáng người'], ['skin', 'Da'], ['selective', 'Chọn lọc'], ['gradient', 'Gradient'],
  ['lens', 'Ống kính'], ['detail', 'Chi tiết'], ['effects', 'Hiệu ứng'], ['calibration', 'Hiệu chuẩn'], ['crop', 'Cắt xoay'],
];

// ---- state ------------------------------------------------------------------
const state = {
  img: null, src: null, params: defaultParams(), history: [], future: [], tab: 'looks',
  hslBand: 1, curveCh: 'rgb', selPoint: -1, original: false, lutCache: {}, customLut: null,
  thumbs: {}, userPresets: loadUserPresets(), activeLook: null, half: true,
  selFace: -1, selBox: -1, bodyMode: 'height', brush: 0.08,
  view: { s: 1, tx: 0, ty: 0 }, compact: true, activeParam: {}, swipe: null, pinching: false, showHist: false,
};
let renderer;
try { renderer = new Renderer($('#view')); } catch (e) { showStatus('Lỗi: ' + e.message); }

function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem('fre.presets') || '[]'); } catch { return []; }
}
function saveUserPresets() {
  try { localStorage.setItem('fre.presets', JSON.stringify(state.userPresets)); } catch { /* storage unavailable */ }
}

// ---- status / toast -----------------------------------------------------------
function showStatus(msg, spin = true) {
  const s = $('#status');
  if (!msg) { s.hidden = true; return; }
  s.hidden = false; s.innerHTML = '';
  if (spin) s.append(el('div', { class: 'spin' }));
  s.append(el('div', {}, msg));
}
let toastT;
function toast(msg, ms = 2600, action = null) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  if (action) t.append(' ', el('button', { class: 'btn small', style: 'margin-left:8px', onclick: () => { t.hidden = true; action.fn(); } }, action.label));
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---- history ----------------------------------------------------------------
function commit() {
  const snap = JSON.stringify(state.params);
  if (state.history.length && state.history[state.history.length - 1] === snap) return;
  state.history.push(snap);
  if (state.history.length > 80) state.history.shift();
  state.future = [];
  updateUndo();
  autosave();
}
// ---- autosave edits per photo (IndexedDB) ------------------------------------------
let saveT;
function editSnapshot() {
  const p = clone(state.params);
  if (p.profile === 'custom') p.profile = '';
  return p;
}
function smallThumb() {
  try {
    const c = $('#view'), t = document.createElement('canvas'), s = 160 / Math.max(c.width, c.height);
    t.width = Math.max(1, Math.round(c.width * s)); t.height = Math.max(1, Math.round(c.height * s));
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.7);
  } catch { return ''; }
}
function autosave() {
  if (!state.img || !state.fileKey || state.restoring) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const isDefault = state.history.length <= 1 && JSON.stringify(state.params) === JSON.stringify(defaultParams());
    if (isDefault) return;
    store.saveEdit({ key: state.fileKey, name: state.img.name, params: editSnapshot(), thumb: smallThumb() });
  }, 900);
}
function updateUndo() {
  $('#btnUndo').disabled = state.history.length < 2;
  $('#btnRedo').disabled = !state.future.length;
}
$('#btnUndo').onclick = () => {
  if (state.history.length < 2) return;
  state.future.push(state.history.pop());
  state.params = JSON.parse(state.history[state.history.length - 1]);
  afterParamsReplaced();
};
$('#btnRedo').onclick = () => {
  if (!state.future.length) return;
  const s = state.future.pop(); state.history.push(s);
  state.params = JSON.parse(s);
  afterParamsReplaced();
};
function afterParamsReplaced() {
  ensureLut(); layout(); render(); renderPanel(); updateUndo();
}

// ---- LUT / profile ------------------------------------------------------------
function ensureLut() {
  const id = effectiveParams(state.params).profile;
  let lut = null;
  if (id === 'custom') lut = state.customLut;
  else if (id) lut = state.lutCache[id] || (state.lutCache[id] = buildProfileLUT(id));
  if (renderer && renderer.lut !== lut) renderer.setLut(lut);
}

// ---- view layout & render ---------------------------------------------------------
function geomFor(p, w, h, forOutput = false) {
  // while the free crop is being edited, show the whole frame with the crop box on top
  const editingFree = !forOutput && state.tab === 'crop' && p.aspect === -1;
  const g = computeGeometry(p, w, h, { ignoreRect: editingFree });
  return { geo: g.geo, cw: g.cw, ch: g.ch * outHeightScale(p), aspectC: g.cw / g.ch };
}

function layout() {
  if (!state.src) return;
  const stage = $('#stage').getBoundingClientRect();
  const { cw, ch } = geomFor(state.params, state.src.w, state.src.h);
  const pad = 12, aw = stage.width - pad * 2, ah = stage.height - pad * 2;
  const s = Math.min(aw / cw, ah / ch);
  const cssW = Math.max(1, Math.floor(cw * s)), cssH = Math.max(1, Math.floor(ch * s));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cv = $('#view');
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  // when zoomed, render more pixels (up to the crop size, max 4096 px) so the view stays sharp
  // keep the view canvas within ~4 MP: iPhone Safari drops the GPU context when memory runs out
  const zs = Math.min(state.view.s, Math.sqrt(4.0e6 / (cssW * dpr * cssH * dpr)), 2600 / Math.max(cssW * dpr, cssH * dpr));
  const pw = Math.max(1, Math.min(Math.round(cssW * dpr * Math.max(1, zs)), Math.round(cw))), ph = Math.max(1, Math.min(Math.round(cssH * dpr * Math.max(1, zs)), Math.round(ch)));
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  $('#viewWrap').style.width = cssW + 'px'; $('#viewWrap').style.height = cssH + 'px';
  applyView();
  drawOverlay();
}

// ---- zoom / pan view ------------------------------------------------------------
function applyView() {
  const w = $('#viewWrap'), st = $('#stage');
  const v = state.view;
  const W = w.offsetWidth, H = w.offsetHeight, x0 = w.offsetLeft, y0 = w.offsetTop;
  const SW = st.clientWidth, SH = st.clientHeight;
  v.s = Math.min(8, Math.max(1, v.s));
  if (v.s <= 1.001) { v.s = 1; v.tx = 0; v.ty = 0; }
  const clampAx = (t, size, x, stage) => {
    const big = size * v.s;
    if (big <= stage) return (stage - big) / 2 - x;
    return Math.min(-x, Math.max(stage - x - big, t));
  };
  if (v.s > 1) { v.tx = clampAx(v.tx, W, x0, SW); v.ty = clampAx(v.ty, H, y0, SH); }
  w.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
  w.style.setProperty('--inv', String(1 / v.s));
  const z = $('#zoomBadge');
  if (z) { z.hidden = v.s <= 1; z.textContent = Math.round(v.s * 100) + '%'; }
}
function resetView() { state.view = { s: 1, tx: 0, ty: 0 }; applyView(); }
/** zoom by factor k keeping client point (cx, cy) fixed */
function zoomAt(k, cx, cy) {
  const w = $('#viewWrap'), v = state.view;
  const r = w.getBoundingClientRect();
  const px = (cx - r.left) / v.s, py = (cy - r.top) / v.s;     // content coords
  const ns = Math.min(8, Math.max(1, v.s * k));
  v.tx += px * v.s - px * ns; v.ty += py * v.s - py * ns; v.s = ns;
  applyView();
}
let relayoutT;
function relayoutSoon() { clearTimeout(relayoutT); relayoutT = setTimeout(() => { layout(); render(); }, 180); }

let raf = 0;
function render() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!state.src || !renderer) return;
    const cv = $('#view');
    const { geo, cw, aspectC } = geomFor(state.params, state.src.w, state.src.h);
    ensureDisp(state.params, aspectC);
    ensureLut();
    renderer.draw(state.src, effectiveParams(state.params), {
      geo, aspectC, outW: cv.width, outH: cv.height, detailScale: Math.max(1, cw / cv.width),
      isRaw: state.img.isRaw, original: state.original,
    });
    scheduleHist();
  });
}

let histT;
function scheduleHist() {
  clearTimeout(histT);
  histT = setTimeout(() => {
    const h = $('#hist'), ctx = h.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = 160; tmp.height = Math.max(1, Math.round(160 * $('#view').height / $('#view').width));
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.drawImage($('#view'), 0, 0, tmp.width, tmp.height);
    const d = tctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const bins = [new Uint32Array(64), new Uint32Array(64), new Uint32Array(64)];
    for (let i = 0; i < d.length; i += 4) { bins[0][d[i] >> 2]++; bins[1][d[i + 1] >> 2]++; bins[2][d[i + 2] >> 2]++; }
    const mx = Math.max(...bins.map((b) => Math.max(...b))) || 1;
    ctx.clearRect(0, 0, 128, 48);
    ctx.globalCompositeOperation = 'lighter';
    ['#ff4d4d', '#4dff88', '#4d8bff'].forEach((col, c) => {
      ctx.fillStyle = col + 'aa'; ctx.beginPath(); ctx.moveTo(0, 48);
      for (let i = 0; i < 64; i++) ctx.lineTo(i * 2 + 1, 48 - Math.sqrt(bins[c][i] / mx) * 46);
      ctx.lineTo(128, 48); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }, 120);
}

window.addEventListener('resize', () => { layout(); render(); });

// ---- GPU context loss (iPhone Safari frees the GPU under memory pressure) --------------
let lostT;
function restoreGpu() {
  renderer.init();
  dispKey = '';
  if (state.img) {
    state.src = renderer.makeSource(state.img.preview);
    renderer.setBlur(state.img.blur.data, state.img.blur.w, state.img.blur.h);
    renderer.clip = state.img.clip;
  }
  ensureLut(); layout(); render();
}
$('#view').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();                        // allow the browser to restore it
  showStatus('Safari tạm thu hồi GPU (thiếu bộ nhớ) — đang khôi phục…');
  clearTimeout(lostT);
  lostT = setTimeout(() => {
    const s = $('#status'); s.hidden = false; s.innerHTML = '';
    s.append(el('div', {}, 'Không khôi phục được GPU. Bản chỉnh đã được tự lưu — tải lại trang rồi mở lại ảnh là tiếp tục được.'),
      el('div', { class: 'row', style: 'justify-content:center' }, el('button', { class: 'btn primary small', onclick: () => location.reload() }, 'Tải lại trang')));
  }, 4000);
});
$('#view').addEventListener('webglcontextrestored', () => {
  clearTimeout(lostT);
  try { restoreGpu(); showStatus(''); toast('Đã khôi phục GPU'); } catch (err) { console.error(err); }
});
// the panel height changes with each tool -> the stage resizes; keep the canvas fitted
new ResizeObserver(() => { layout(); render(); }).observe($('#stage'));

// ---- open file ------------------------------------------------------------------
$('#fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) await openFile(file);
});
$('#stage').addEventListener('dragover', (e) => e.preventDefault());
$('#stage').addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f); });

async function openFile(file) {
  if (!renderer) return;
  try {
    const opts = { onStatus: (m) => showStatus(m), half: state.half };
    const img = isRawName(file.name) ? await loadRaw(file, opts) : await loadImage(file, opts);
    state.fileKey = store.imageKey(file);
    showStatus('Đang chuẩn bị…');
    renderer.deleteSource(state.src);
    state.img = img;
    state.src = renderer.makeSource(img.preview);
    renderer.setBlur(img.blur.data, img.blur.w, img.blur.h);
    renderer.clip = img.clip;
    state.params = defaultParams();
    state.history = []; state.future = []; state.thumbs = {}; state.activeLook = null; state.selPoint = -1;
    commit();
    ensureLut();
    $('#empty').hidden = true; $('#viewWrap').hidden = false; $('#hist').hidden = !state.showHist; state.view = { s: 1, tx: 0, ty: 0 };
    for (const b of ['#btnExport', '#btnCompare']) $(b).disabled = false;
    layout(); render(); renderPanel();
    showStatus('');
    const [fw, fh] = fullSize(img);
    const info = `${img.isRaw ? 'RAW' : 'Ảnh'} ${fw}×${fh}${img.meta && img.meta.model ? ' · ' + (img.meta.make || '') + ' ' + img.meta.model : ''}`;
    const saved = await store.getEdit(state.fileKey);
    if (saved && saved.params) {
      state.params = sanitizeParams(saved.params);
      commit(); ensureLut(); layout(); render(); renderPanel();
      toast(`${info} · Đã mở lại bản chỉnh trước`, 6000, { label: 'Chỉnh lại từ đầu', fn: () => { state.params = defaultParams(); commit(); ensureLut(); layout(); render(); renderPanel(); } });
    } else toast(info);
    setTimeout(makeThumbs, 50);
  } catch (err) {
    console.error(err);
    showStatus('');
    toast('Không mở được ảnh: ' + (err.message || err), 6000);
  }
}

// ---- compare (hold) -------------------------------------------------------------
const cmp = $('#btnCompare');
const setOrig = (v) => { state.original = v; cmp.classList.toggle('on', v); render(); };
cmp.addEventListener('pointerdown', (e) => { e.preventDefault(); setOrig(true); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => state.original && setOrig(false));

// ---- tabs & panels ---------------------------------------------------------------
const tabs = $('#tabs');
for (const [id, name] of TABS) {
  tabs.append(el('button', { 'data-tab': id, onclick: () => { const was = state.tab; state.tab = id; renderPanel(); if (was === 'crop' || id === 'crop') { layout(); render(); } drawOverlay(); } },
    (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = ICONS[id]; return s; })(),
    el('span', {}, name)));
}

/** double-tap detection that works even when page-level double-tap zoom is blocked */
const tapMem = new Map();
/** key: optional stable id so the double-tap survives the element being re-rendered */
function onDoubleTap(elm, fn, key = null) {
  const mem = key ? (tapMem.get(key) || tapMem.set(key, { t: 0, x: 0, y: 0 }).get(key)) : { t: 0, x: 0, y: 0 };
  elm.addEventListener('pointerup', (e) => {
    const now = Date.now();
    if (now - mem.t < 380 && Math.hypot(e.clientX - mem.x, e.clientY - mem.y) < 28) { mem.t = 0; fn(e); }
    else { mem.t = now; mem.x = e.clientX; mem.y = e.clientY; }
  });
}
function fmt(v, step) { return step < 1 ? (+v).toFixed(2) : String(Math.round(v)); }

/** generic slider bound to getter/setter */
function slider(label, min, max, step, get, set, { def = 0, hue = false } = {}) {
  const val = el('span', { class: 'val' });
  const inp = el('input', { type: 'range', min, max, step, value: get() });
  const upd = () => { val.textContent = fmt(get(), step); val.classList.toggle('nz', Math.abs(get() - def) > 1e-9); };
  inp.addEventListener('input', () => { set(parseFloat(inp.value)); upd(); render(); });
  inp.addEventListener('change', commit);
  const lab = el('label', { title: 'Chạm 2 lần để đặt lại' }, label);
  const reset = () => { set(def); inp.value = def; upd(); render(); commit(); };
  onDoubleTap(lab, reset);
  onDoubleTap(val, reset);
  onDoubleTap(inp, reset);
  upd();
  return el('div', { class: 'slider' + (hue ? ' hue' : '') }, lab, val, inp);
}
/**
 * Tick-mark ruler ("răng cưa") with a fixed centre needle. Drag the ruler; each tick gives a
 * light haptic, major ticks and the default value give a stronger one, and the default value
 * is a sticky detent so you don't overshoot it.
 */
const TICK_PX = 9;
class Ruler {
  constructor(onInput, onCommit) {
    this.onInput = onInput; this.onCommit = onCommit;
    this.cv = el('canvas', { class: 'ruler-cv' });
    this.el = el('div', { class: 'ruler' }, this.cv, el('div', { class: 'ruler-needle' }));
    this.v = 0;
    let drag = null;
    this.el.addEventListener('pointerdown', (e) => {
      this.el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, v0: this.v, moved: false };
    });
    this.el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 2) drag.moved = true;
      this.setValue(drag.v0 - (dx / TICK_PX) * this.u, true);
      this.onInput(this.v);
    });
    const up = () => { if (drag && drag.moved) this.onCommit(); drag = null; };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    new ResizeObserver(() => this.draw()).observe(this.el);
  }
  setDef(d) {
    this.d = d;
    const n = (d.max - d.min) / d.step;
    this.u = d.step * Math.max(1, Math.ceil(n / 100));
    const g = d.get();
    this.v = Number.isFinite(g) ? g : (d.def || 0); this.draw();
  }
  /** set value (raw, unquantised); with feedback=true apply detent + haptics */
  setValue(raw, feedback = false) {
    const d = this.d, def = d.def || 0, u = this.u;
    if (!Number.isFinite(raw)) raw = def;             // never let NaN reach the GPU
    let v = Math.min(d.max, Math.max(d.min, raw));
    if (feedback && Math.abs(v - def) < u * 1.6) v = def;           // sticky zero / default
    v = Math.round(v / d.step) * d.step;
    v = +v.toFixed(6);
    if (feedback) {
      const a = Math.round(this.v / u), b = Math.round(v / u);
      if (a !== b) {
        const major = Math.round(v / u) % 10 === 0;
        haptic(v === def || major || v === d.min || v === d.max ? 'strong' : 'light');
      }
    }
    this.v = v; this.draw();
    return v;
  }
  draw() {
    const cv = this.cv, W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !this.d) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const d = this.d, u = this.u, def = d.def || 0, cx = W / 2;
    const first = Math.ceil((d.min - 1e-9) / u), last = Math.floor((d.max + 1e-9) / u);
    const off = this.v / u;                                    // tick index under the needle
    ctx.font = '10px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let k = first; k <= last; k++) {
      const x = cx + (k - off) * TICK_PX;
      if (x < -20 || x > W + 20) continue;
      const val = k * u, major = k % 10 === 0, isDef = Math.abs(val - def) < u / 2;
      const fade = 1 - Math.min(1, Math.abs(x - cx) / (W / 2)) * 0.75;
      const inRange = (val - def) * (this.v - def) > 0 && Math.abs(val - def) <= Math.abs(this.v - def) + 1e-9;
      ctx.strokeStyle = inRange ? `rgba(127,224,211,${fade})` : `rgba(255,255,255,${fade * (major ? 0.9 : 0.5)})`;
      ctx.lineWidth = isDef ? 2 : major ? 1.6 : 1;
      const h = isDef ? 22 : major ? 16 : 9;
      ctx.beginPath(); ctx.moveTo(x, H - 8 - h); ctx.lineTo(x, H - 8); ctx.stroke();
      if (major && Math.abs(x - cx) > 16) { ctx.fillStyle = `rgba(255,255,255,${fade * 0.6})`; ctx.fillText(fmt(val, d.step), x, H - 8 - h - 4); }
    }
  }
}

/**
 * Snapseed-style compact control: a strip of parameter chips + one big slider.
 * defs: [{label, min, max, step, get, set, def, hue}]
 */
function compactSliders(body, id, defs, extraTitle) {
  if (!state.compact) {
    body.append(el('div', { class: 'row', style: 'margin:0 0 4px;justify-content:flex-end' },
      el('button', { class: 'btn small', onclick: () => { state.compact = true; renderPanel(); } }, '▭ Gọn')));
    defs.forEach((d) => body.append(slider(d.label, d.min, d.max, d.step, d.get, d.set, { def: d.def || 0, hue: d.hue })));
    return;
  }
  let i = Math.min(state.activeParam[id] || 0, defs.length - 1);
  const chips = el('div', { class: 'chips params' });
  const big = el('div', { class: 'bigval' });
  const ruler = new Ruler((v) => { defs[i].set(v); upd(); render(); }, commit);
  const chipEls = defs.map((d, k) => {
    const c = el('button', { class: 'chip' + (k === i ? ' active' : ''), onclick: () => select(k) }, d.label, el('b', {}));
    chips.append(c); return c;
  });
  const resetK = (k) => {
    const d = defs[k]; d.set(d.def || 0);
    if (k === i) ruler.setValue(d.def || 0);
    upd(); render(); commit(); haptic('strong');
  };
  chipEls.forEach((c, k) => onDoubleTap(c, () => resetK(k)));
  onDoubleTap(ruler.el, () => resetK(i));
  const updChips = () => defs.forEach((d, k) => {
    const v = d.get(), nz = Math.abs(v - (d.def || 0)) > 1e-9;
    chipEls[k].lastChild.textContent = nz ? ' ' + fmt(v, d.step) : '';
    chipEls[k].classList.toggle('nz', nz);
  });
  const upd = () => {
    const d = defs[i];
    big.innerHTML = '';
    big.append(el('span', { class: 'bv-label' }, d.label), el('span', { class: 'bv-num' + (Math.abs(d.get() - (d.def || 0)) > 1e-9 ? ' nz' : '') }, fmt(d.get(), d.step)));
    updChips();
  };
  const select = (k) => {
    i = k; state.activeParam[id] = k;
    chipEls.forEach((c, j) => c.classList.toggle('active', j === k));
    ruler.setDef(defs[k]);
    chipEls[k].scrollIntoView({ block: 'nearest', inline: 'center' });
    upd();
  };
  onDoubleTap(big, () => resetK(i));
  const head = el('div', { class: 'row', style: 'margin:0 0 2px;justify-content:space-between' }, big,
    el('div', { class: 'row', style: 'margin:0' }, extraTitle || null,
      el('button', { class: 'btn small' + (hapticsOn ? ' on' : ''), title: 'Rung khi qua vạch', onclick: (e) => { setHaptics(!hapticsOn); e.currentTarget.classList.toggle('on', hapticsOn); if (hapticsOn) haptic('strong'); } }, '〰'),
      el('button', { class: 'btn small', title: 'Hiện tất cả thanh', onclick: () => { state.compact = false; renderPanel(); } }, '≡')));
  const sl = el('div', { class: 'slider compact' }, ruler.el);
  body.append(head, sl, chips);
  select(i);
  // expose to the on-image swipe gesture
  state.swipe = {
    get def() { return defs[i]; },
    next(dir) { select((i + dir + defs.length) % defs.length); },
    apply(v) { const nv = ruler.setValue(v, true); defs[i].set(nv); upd(); render(); },
  };
}
const pDefs = (list) => list.map(([key, label, min, max, step]) => ({
  label, min, max, step, get: () => state.params[key], set: (v) => { state.params[key] = v; }, def: defaultParams()[key], hue: /H$/.test(key) && max === 360,
}));
const pSlider = ([key, label, min, max, step]) =>
  slider(label, min, max, step, () => state.params[key], (v) => { state.params[key] = v; }, { def: defaultParams()[key], hue: /H$/.test(key) && max === 360 });

function title(text, ...extra) { return el('div', { class: 'panel-title' }, el('span', {}, text), el('div', { class: 'row', style: 'margin:0' }, ...extra)); }
function resetKeys(keys) {
  const d = defaultParams();
  return el('button', { class: 'btn small', onclick: () => { for (const k of keys) state.params[k] = clone(d[k]); render(); commit(); renderPanel(); } }, 'Đặt lại');
}

// Re-rendering a panel must not jump the scroll position back to the start
// (picking a look/recipe/profile re-renders the same panel).
function renderPanel() {
  const panel = $('#panel'), body0 = $('#panelBody');
  const key = state.tab + '|' + (state.profTab || '') + '|' + state.bodyMode + '|' + (state.lensTab || '');
  const keep = renderPanel._key === key;
  const top = panel.scrollTop;
  const lefts = [...body0.querySelectorAll('.looks, .chips')].map((e) => e.scrollLeft);
  renderPanel._key = key;
  renderPanelInner();
  if (keep) {
    panel.scrollTop = top;
    body0.querySelectorAll('.looks, .chips').forEach((e, i) => { if (lefts[i] != null) e.scrollLeft = lefts[i]; });
  } else {
    panel.scrollTop = 0;
    // new panel: bring the selected look/recipe into view
    const act = body0.querySelector('.looks .look.active');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
}
function renderPanelInner() {
  for (const b of tabs.children) b.classList.toggle('active', b.dataset.tab === state.tab);
  const body = $('#panelBody'); body.innerHTML = '';
  state.swipe = null;
  if (!state.img && state.tab !== 'looks') { body.append(el('p', { class: 'hint' }, 'Mở một ảnh để bắt đầu.')); return; }
  const t = state.tab;
  if (PANELS[t]) {
    const P = PANELS[t];
    compactSliders(body, t, pDefs(P.sliders), resetKeys(P.sliders.map((s) => s[0])));
    if (t === 'color') body.append(el('p', { class: 'hint' }, 'RAW: cân bằng trắng gốc lấy theo máy; Nhiệt độ/Sắc thái chỉnh thêm từ đó.'));
    return;
  }
  ({ looks: panelLooks, profile: panelProfile, hsl: panelHsl, curve: panelCurve, selective: panelSelective,
    gradient: panelGradient, crop: panelCrop, face: panelFace, body: panelBody, skin: panelSkin, lens: panelLens })[t](body);
}

// ---- Looks (presets) ------------------------------------------------------------
function applyPreset(params, id) {
  const keepGeo = ['rotate90', 'flipH', 'straighten', 'aspect', 'zoom', 'panX', 'panY', 'faces', 'body', 'boxes', 'pushes', 'skin', 'lens', 'lensBlur', 'fill', 'expand'];
  const next = Object.assign(defaultParams(), clone(params));
  for (const k of keepGeo) next[k] = state.params[k];
  if (next.profile === 'custom' && !state.customLut) next.profile = '';
  state.params = next; state.activeLook = id;
  ensureLut(); render(); commit(); renderPanel();
}

function makeThumbs() {
  if (!state.img || !renderer) return;
  const items = [...BUILTIN_PRESETS, ...state.userPresets];
  const base = { ...defaultParams(), rotate90: state.params.rotate90, flipH: state.params.flipH, aspect: 1 };
  const { geo, aspectC } = geomFor(base, state.src.w, state.src.h);
  const S = 132, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const savedLut = renderer.lut;
  const one = (id, params) => {
    const p0 = Object.assign(defaultParams(), clone(params), { rotate90: base.rotate90, flipH: base.flipH, aspect: 1, zoom: 1, panX: 0, panY: 0, straighten: 0, points: [], faces: [], boxes: [], pushes: [], body: defaultParams().body });
    const p = effectiveParams(p0);
    const lut = p.profile && p.profile !== 'custom' ? (state.lutCache[p.profile] ||= buildProfileLUT(p.profile)) : null;
    renderer.setLut(lut);
    const px = renderer.renderToPixels(state.src, p, { geo, aspectC, outW: S, outH: S, detailScale: state.src.w / S, isRaw: state.img.isRaw });
    ctx.putImageData(new ImageData(px, S, S), 0, 0);
    state.thumbs[id] = cv.toDataURL('image/jpeg', 0.8);
  };
  one('__none', defaultParams());
  for (const it of items) one(it.id, it.params);
  for (const r of RECIPES) one('r:' + r.id, { ...defaultParams(), recipe: r });
  renderer.setLut(savedLut); ensureLut();
  render();
  if (state.tab === 'looks') renderPanel();
}

function lookCard(id, name, onPick, extra) {
  const src = state.thumbs[id];
  return el('button', { class: 'look' + (state.activeLook === id ? ' active' : ''), onclick: onPick },
    src ? el('img', { src, alt: '' }) : el('div', { class: 'ph' }), el('span', {}, name), extra || null);
}

function panelLooks(body) {
  body.append(title('Kiểu (preset)'));
  const strip = el('div', { class: 'looks' });
  strip.append(lookCard('__none', 'Gốc', () => applyPreset(defaultParams(), '__none')));
  for (const pr of BUILTIN_PRESETS) strip.append(lookCard(pr.id, pr.name, () => applyPreset(pr.params, pr.id)));
  body.append(strip);
  body.append(el('div', { class: 'sect' }, 'Kiểu của bạn'));
  if (state.userPresets.length) {
    const us = el('div', { class: 'looks' });
    state.userPresets.forEach((pr, i) => us.append(lookCard(pr.id, pr.name, () => applyPreset(pr.params, pr.id),
      el('span', { class: 'del', onclick: (e) => { e.stopPropagation(); state.userPresets.splice(i, 1); saveUserPresets(); renderPanel(); } }, 'Xoá'))));
    body.append(us);
  } else body.append(el('p', { class: 'hint' }, 'Chưa có. Chỉnh xong bấm "Lưu kiểu hiện tại" để dùng lại cho ảnh khác.'));
  const xmpIn = el('input', { type: 'file', accept: '.xmp,application/rdf+xml,text/xml', hidden: true, multiple: true });
  xmpIn.addEventListener('change', async () => {
    for (const f of xmpIn.files) {
      try {
        const { name, params, notes } = parseXmp(await f.text());
        const id = 'u' + Date.now() + Math.random().toString(36).slice(2, 6);
        state.userPresets.push({ id, name: name.replace(/^Fuji Clear Sea A7IV - /, ''), params });
        saveUserPresets();
        toast(`Đã nhập "${name}"` + (notes.length ? ' · ' + notes.join(' ') : ''), 5000);
      } catch (e) { toast(`${f.name}: ${e.message}`, 5000); }
    }
    makeThumbs(); renderPanel();
  });
  body.append(el('div', { class: 'row' },
    el('button', { class: 'btn small', disabled: !state.img, onclick: () => {
      const name = `Kiểu ${state.userPresets.length + 1}`;
      const p = clone(state.params); p.points = []; p.faces = []; p.boxes = []; p.pushes = []; p.body = defaultParams().body;
      if (p.profile === 'custom') p.profile = '';
      state.userPresets.push({ id: 'u' + Date.now(), name, params: p });
      saveUserPresets(); makeThumbs(); toast(`Đã lưu "${name}"`);
    } }, 'Lưu kiểu hiện tại'),
    el('button', { class: 'btn small', onclick: () => xmpIn.click() }, 'Nhập preset .xmp'),
    xmpIn));
  body.append(el('p', { class: 'hint' }, 'Nhập được preset Lightroom/Camera Raw (.xmp): ánh sáng, HSL, đường cong, chỉnh màu, hiệu chuẩn, gradient.'));
}

// ---- Profile: Fuji recipes, LUTs, .profile files ---------------------------------
function applyProfileData({ name, recipe, params, lut }) {
  const p = state.params;
  Object.assign(p, clone(params));
  p.recipe = recipe;
  if (lut) { state.customLut = lut; p.profile = 'custom'; renderer.setLut(null); }
  else if (p.profile === 'custom' && !state.customLut) p.profile = '';
  state.activeLook = null;
  ensureLut(); render(); commit(); renderPanel();
  toast(`Đã áp profile "${name}"`);
}
async function importProfileFiles(files) {
  for (const f of files) {
    try {
      const text = await f.text(), lower = f.name.toLowerCase();
      if (lower.endsWith('.cube')) {
        state.customLut = parseCube(text, f.name.replace(/\.cube$/i, ''));
        state.params.profile = 'custom'; renderer.setLut(null); ensureLut(); render(); commit(); renderPanel();
        toast(`Đã nạp LUT ${state.customLut.size}³`);
      } else if (lower.endsWith('.xmp')) {
        const { name, params } = parseXmp(text);
        state.userPresets.push({ id: 'u' + Date.now(), name, params }); saveUserPresets(); toast(`Đã thêm "${name}" vào Kiểu của bạn`);
      } else {
        const data = parseProfileFile(text);
        if (state.img) applyProfileData(data);
        const params = Object.assign(defaultParams(), clone(data.params), { recipe: data.recipe });
        if (!data.lut) state.userPresets.push({ id: 'u' + Date.now(), name: data.name, params });
        saveUserPresets();
      }
    } catch (e) { toast(`${f.name}: ${e.message}`, 5000); }
  }
  makeThumbs();
}
async function exportProfile() {
  const r = state.params.recipe;
  const name = (r && r.name) || 'Profile cua toi';
  const text = makeProfileFile(name, state.params, state.customLut);
  const safe = name.replace(/[^\w\- ]+/g, '').trim() || 'profile';
  const res = await saveBlob(new Blob([text], { type: 'application/json' }), `${safe}.profile`, 'application/json', `${safe}.profile.json`);
  if (res === 'saved') toast('Đã lưu file .profile');
}

function panelProfile(body) {
  const sub = state.profTab || 'recipes';
  const head = el('div', { class: 'chips params' });
  [['recipes', 'Công thức Fuji'], ['edit', 'Chỉnh công thức'], ['lut', 'Giả lập phim / LUT']].forEach(([k, n]) =>
    head.append(el('button', { class: 'chip' + (sub === k ? ' active' : ''), onclick: () => { state.profTab = k; renderPanel(); } }, n)));
  body.append(head);
  const fileIn = el('input', { type: 'file', accept: '.profile,.json,.cube,.xmp,application/json', multiple: true, hidden: true });
  fileIn.addEventListener('change', () => importProfileFiles([...fileIn.files]));
  const ioRow = el('div', { class: 'row' },
    el('button', { class: 'btn small', onclick: () => fileIn.click() }, 'Nhập .profile / .cube / .xmp'),
    el('button', { class: 'btn small', disabled: !state.img, onclick: exportProfile }, 'Xuất .profile'), fileIn);

  if (sub === 'recipes') {
    const cur = state.params.recipe;
    body.append(el('div', { class: 'looks' },
      lookCard('__none', 'Không', () => { state.params.recipe = null; render(); commit(); renderPanel(); }),
      ...RECIPES.map((r) => {
        const c = lookCard('r:' + r.id, r.name, () => {
          state.params.recipe = clone(r); state.params.profile = ''; ensureLut(); render(); commit(); renderPanel();
        });
        if (cur && cur.id === r.id) c.classList.add('active');
        return c;
      })));
    if (cur) {
      body.append(el('div', { class: 'recipe-card' },
        el('div', { class: 'rc-title' }, cur.name, cur.source ? el('span', {}, ' · ' + cur.source) : null),
        el('div', { class: 'hint', style: 'margin:2px 0 0' }, recipeSummary(cur))));
    }
    body.append(ioRow);
    body.append(el('p', { class: 'hint' }, 'Công thức là một lớp riêng: các thanh Ánh sáng/Màu… bạn chỉnh vẫn được cộng thêm. DR200/DR400 nén vùng sáng mềm như máy Fuji, giảm cháy sáng. Bù sáng trong công thức (dành cho lúc chụp) chỉ áp 1/2 lên ảnh đã chụp.'));
    return;
  }
  if (sub === 'edit') {
    if (!state.params.recipe) {
      body.append(el('p', { class: 'hint' }, 'Chưa có công thức. Chọn một công thức ở tab "Công thức Fuji" hoặc tạo mới.'));
      body.append(el('button', { class: 'btn small', onclick: () => { state.params.recipe = blankRecipe(); render(); commit(); renderPanel(); } }, '+ Tạo công thức mới'));
      body.append(ioRow);
      return;
    }
    const r = state.params.recipe;
    const upd = () => { ensureLut(); render(); };
    const sel = (label, key, opts) => {
      const s = el('select', { class: 'fsel', onchange: (e) => { r[key] = isNaN(+e.target.value) || e.target.value === '' ? e.target.value : +e.target.value; upd(); commit(); renderPanel(); } },
        ...opts.map(([v, n]) => el('option', { value: v, selected: String(r[key]) === String(v) }, n)));
      return el('label', { class: 'field' }, el('span', {}, label), s);
    };
    const nameIn = el('input', { class: 'fsel', value: r.name, onchange: (e) => { r.name = e.target.value; commit(); } });
    body.append(el('label', { class: 'field' }, el('span', {}, 'Tên'), nameIn));
    body.append(sel('Giả lập phim', 'film', FILM_SIMS));
    body.append(sel('Dải động', 'dr', [[100, 'DR100'], [200, 'DR200'], [400, 'DR400']]));
    body.append(sel('Hạt', 'grain', LEVEL3));
    body.append(sel('Cỡ hạt', 'grainSize', [['small', 'Nhỏ'], ['large', 'Lớn']]));
    body.append(sel('Color Chrome', 'chrome', LEVEL3));
    body.append(sel('Color Chrome Xanh', 'chromeBlue', LEVEL3));
    body.append(sel('Cân bằng trắng', 'wb', WB_MODES));
    const rs = (label, key, min, max, step) => slider(label, min, max, step, () => r[key], (v) => { r[key] = v; upd(); });
    if (r.wb === 'kelvin') body.append(rs('Nhiệt độ (K)', 'kelvin', 2500, 10000, 100));
    body.append(rs('Dịch WB · Đỏ (R)', 'wbR', -9, 9, 1));
    body.append(rs('Dịch WB · Lam (B)', 'wbB', -9, 9, 1));
    body.append(rs('Highlight', 'highlight', -2, 4, 0.5));
    body.append(rs('Shadow', 'shadow', -2, 4, 0.5));
    body.append(rs('Màu (Color)', 'color', -4, 4, 1));
    body.append(rs('Độ nét', 'sharpness', -4, 4, 1));
    body.append(rs('Khử nhiễu', 'nr', -4, 4, 1));
    body.append(rs('Clarity', 'clarity', -5, 5, 1));
    body.append(rs('Bù sáng (EV)', 'exposure', -2, 2, 0.33));
    body.append(el('div', { class: 'row' },
      el('button', { class: 'btn small', onclick: () => {
        const params = clone(state.params); params.points = []; params.faces = []; params.boxes = []; params.pushes = []; params.body = defaultParams().body;
        if (params.profile === 'custom') params.profile = '';
        state.userPresets.push({ id: 'u' + Date.now(), name: r.name, params }); saveUserPresets(); makeThumbs(); toast(`Đã lưu "${r.name}" vào Kiểu của bạn`);
      } }, 'Lưu vào Kiểu'),
      el('button', { class: 'btn small danger', onclick: () => { state.params.recipe = null; render(); commit(); renderPanel(); } }, 'Bỏ công thức')));
    body.append(ioRow);
    return;
  }
  // LUT / film simulation profile
  const chips = el('div', { class: 'chips' });
  const pick = (id) => { state.params.profile = id; ensureLut(); render(); commit(); renderPanel(); };
  chips.append(el('button', { class: 'chip' + (!state.params.profile ? ' active' : ''), onclick: () => pick('') }, state.params.recipe ? 'Theo công thức' : 'Không'));
  for (const [id, P] of Object.entries(PROFILES)) chips.append(el('button', { class: 'chip' + (state.params.profile === id ? ' active' : ''), onclick: () => pick(id) }, P.name.replace(' (phong cách)', '')));
  if (state.customLut) chips.append(el('button', { class: 'chip' + (state.params.profile === 'custom' ? ' active' : ''), onclick: () => pick('custom') }, state.customLut.name));
  body.append(chips);
  body.append(pSlider(['lutAmount', 'Độ đậm profile', 0, 200, 1]));
  body.append(ioRow);
  body.append(el('p', { class: 'hint' }, 'Giả lập phim là LUT 3D do app tạo theo phong cách Fuji (không phải dữ liệu chính thức). File .profile chứa công thức + toàn bộ thông số màu + LUT, mở lại được trên máy khác.'));
}

// ---- HSL ------------------------------------------------------------------------------
function panelHsl(body) {
  body.append(title('HSL / Màu', el('button', { class: 'btn small', onclick: () => {
    state.params.hslH.fill(0); state.params.hslS.fill(0); state.params.hslL.fill(0); render(); commit(); renderPanel();
  } }, 'Đặt lại')));
  const chips = el('div', { class: 'chips' });
  HSL_BANDS.forEach((b, i) => {
    const c = el('button', { class: 'chip' + (state.hslBand === i ? ' active' : ''), onclick: () => { state.hslBand = i; renderPanel(); } },
      el('span', { class: 'dot', style: `background:${b.color}` }), b.name);
    onDoubleTap(c, () => { const P = state.params; P.hslH[i] = P.hslS[i] = P.hslL[i] = 0; render(); commit(); renderPanel(); haptic('strong'); toast(`Đã đặt lại màu ${b.name}`); }, 'hsl-band-' + i);
    chips.append(c);
  });
  body.append(chips);
  const i = state.hslBand, p = () => state.params;
  compactSliders(body, 'hsl', [
    { label: 'Sắc (Hue)', min: -100, max: 100, step: 1, get: () => p().hslH[i], set: (v) => { p().hslH[i] = v; } },
    { label: 'Bão hoà', min: -100, max: 100, step: 1, get: () => p().hslS[i], set: (v) => { p().hslS[i] = v; } },
    { label: 'Độ sáng', min: -100, max: 100, step: 1, get: () => p().hslL[i], set: (v) => { p().hslL[i] = v; } },
  ]);
  body.append(el('p', { class: 'hint' }, 'Da người nằm ở dải Cam: tăng Độ sáng, giảm nhẹ Bão hoà để da sáng và trong.'));
}

// ---- Curves -----------------------------------------------------------------------
function panelCurve(body) {
  const chips = el('div', { class: 'chips', style: 'margin:0;flex-wrap:nowrap' });
  [['rgb', 'RGB'], ['r', 'Đỏ'], ['g', 'Lục'], ['b', 'Lam']].forEach(([k, n]) =>
    chips.append(el('button', { class: 'chip' + (state.curveCh === k ? ' active' : ''), onclick: () => { state.curveCh = k; renderPanel(); } }, n)));
  body.append(el('div', { class: 'row', style: 'margin:0 0 4px;justify-content:space-between;flex-wrap:nowrap' }, chips,
    el('button', { class: 'btn small', onclick: () => { state.params.curves[state.curveCh] = [[0, 0], [255, 255]]; render(); commit(); renderPanel(); } }, 'Đặt lại')));
  const box = el('div', { id: 'curveBox' });
  const cv = el('canvas', { width: 600, height: 600 });
  box.append(cv); body.append(box);
  const col = { rgb: '#fff', r: '#ff5c5c', g: '#5cff8a', b: '#5c9dff' }[state.curveCh];
  const draw = () => {
    const ctx = cv.getContext('2d'), W = 600;
    ctx.clearRect(0, 0, W, W);
    ctx.strokeStyle = '#ffffff18'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * W / 4, 0); ctx.lineTo(i * W / 4, W); ctx.moveTo(0, i * W / 4); ctx.lineTo(W, i * W / 4); ctx.stroke(); }
    ctx.strokeStyle = '#ffffff30'; ctx.beginPath(); ctx.moveTo(0, W); ctx.lineTo(W, 0); ctx.stroke();
    const pts = state.params.curves[state.curveCh], ys = evalCurve(pts);
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath();
    for (let x = 0; x < 256; x++) { const X = x / 255 * W, Y = W - ys[x] / 255 * W; x ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.stroke();
    for (const [x, y] of pts) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x / 255 * W, W - y / 255 * W, 12, 0, 7); ctx.fill(); }
  };
  draw();
  let drag = -1, lastTap = 0;
  const toXY = (e) => { const r = cv.getBoundingClientRect(); return [Math.min(255, Math.max(0, (e.clientX - r.left) / r.width * 255)), Math.min(255, Math.max(0, 255 - (e.clientY - r.top) / r.height * 255))]; };
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    const [x, y] = toXY(e), pts = state.params.curves[state.curveCh];
    let best = -1, bd = 18;
    pts.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    const now = Date.now();
    if (best >= 0 && now - lastTap < 350 && best > 0 && best < pts.length - 1) { pts.splice(best, 1); draw(); render(); commit(); drag = -1; return; }
    lastTap = now;
    if (best < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); best = pts.findIndex((p) => p[0] === x && p[1] === y); }
    drag = best; draw(); render();
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const pts = state.params.curves[state.curveCh];
    let [x, y] = toXY(e);
    const lo = drag > 0 ? pts[drag - 1][0] + 1 : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] - 1 : 255;
    if (drag === 0) x = Math.min(x, hi); else if (drag === pts.length - 1) x = Math.max(x, lo); else x = Math.min(hi, Math.max(lo, x));
    pts[drag] = [Math.round(x), Math.round(y)]; draw(); render();
  });
  cv.addEventListener('pointerup', () => { if (drag >= 0) commit(); drag = -1; });
  body.append(el('p', { class: 'hint' }, 'Chạm để thêm điểm, kéo để chỉnh, chạm 2 lần vào điểm để xoá.'));
  body.append(el('div', { class: 'sect' }, 'Đường cong vùng'));
  const pc = () => state.params.paramCurve;
  [['highlights', 'Vùng sáng'], ['lights', 'Sáng'], ['darks', 'Tối'], ['shadows', 'Vùng tối']].forEach(([k, n]) =>
    body.append(slider(n, -100, 100, 1, () => pc()[k], (v) => { pc()[k] = v; })));
}

// ---- Selective points -------------------------------------------------------------
function samplePointColor(x, y) {
  const cv = $('#view'), gl = renderer.gl;
  const px = new Uint8Array(4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(Math.round(x * (cv.width - 1)), Math.round((1 - y) * (cv.height - 1)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0] / 255, px[1] / 255, px[2] / 255];
}
function panelSelective(body) {
  const pts = state.params.points;
  body.append(title('Chọn lọc', pts.length ? el('button', { class: 'btn small danger', onclick: () => { state.params.points = []; state.selPoint = -1; render(); commit(); renderPanel(); drawOverlay(); } }, 'Xoá hết') : null));
  if (!pts.length || state.selPoint < 0) {
    body.append(el('p', { class: 'hint' }, `Chạm lên ảnh để đặt điểm (tối đa 8). Điểm chỉ ảnh hưởng vùng có màu giống chỗ bạn chạm — chạm vào da để chỉnh da, chạm vào trời để chỉnh trời. Đã có ${pts.length}/8 điểm.`));
    return;
  }
  const pt = pts[state.selPoint];
  body.append(el('div', { class: 'sect' }, `Điểm ${state.selPoint + 1}`));
  const s = (label, key, min = -100, max = 100) => slider(label, min, max, 1, () => pt[key], (v) => { pt[key] = v; if (key === 'r100') pt.r = v / 100; drawOverlay(); });
  pt.r100 = Math.round(pt.r * 100);
  body.append(s('Kích thước', 'r100', 5, 80));
  body.append(s('Độ sáng', 'bright'));
  body.append(s('Tương phản', 'contrast'));
  body.append(s('Bão hoà', 'sat'));
  body.append(s('Độ ấm', 'warmth'));
  body.append(el('div', { class: 'row' },
    el('button', { class: 'btn small', onclick: () => { state.selPoint = -1; renderPanel(); drawOverlay(); } }, 'Xong'),
    el('button', { class: 'btn small danger', onclick: () => { pts.splice(state.selPoint, 1); state.selPoint = -1; render(); commit(); renderPanel(); drawOverlay(); } }, 'Xoá điểm')));
}

// ---- Gradient ---------------------------------------------------------------------
function panelGradient(body) {
  const g = state.params.grad;
  body.append(title('Gradient tuyến tính (trời)', el('button', { class: 'btn small' + (g.on ? ' on' : ''), onclick: () => { g.on = !g.on; render(); commit(); renderPanel(); drawOverlay(); } }, g.on ? 'Đang bật' : 'Bật')));
  if (!g.on) { body.append(el('p', { class: 'hint' }, 'Bật để tối/xanh lại bầu trời bị cháy. Kéo 2 vạch trên ảnh: vạch liền = đầy hiệu ứng, vạch đứt = hết hiệu ứng.')); return; }
  body.append(slider('Phơi sáng', -2, 2, 0.05, () => g.exposure, (v) => { g.exposure = v; }));
  body.append(slider('Vùng sáng', -100, 100, 1, () => g.highlights, (v) => { g.highlights = v; }));
  body.append(slider('Nhiệt độ', -100, 100, 1, () => g.temp, (v) => { g.temp = v; }));
  body.append(slider('Bão hoà', -100, 100, 1, () => g.saturation, (v) => { g.saturation = v; }));
}

// ---- Crop ---------------------------------------------------------------------------
function panelCrop(body) {
  const p = state.params;
  body.append(title('Cắt & xoay', resetKeys(['rotate90', 'flipH', 'straighten', 'aspect', 'zoom', 'panX', 'panY', 'cropRect'])));
  const chips = el('div', { class: 'chips' });
  ASPECTS.forEach((a) => chips.append(el('button', { class: 'chip' + (Math.abs(p.aspect - a.v) < 1e-6 ? ' active' : ''), onclick: () => { p.aspect = a.v; p.panX = p.panY = 0; if (a.v === -1) p.zoom = 1; layout(); render(); commit(); renderPanel(); drawOverlay(); } }, a.label)));
  body.append(chips);
  const relayout = () => { layout(); };
  body.append(slider('Làm thẳng', -45, 45, 0.1, () => p.straighten, (v) => { p.straighten = v; relayout(); }));
  body.append(slider('Thu phóng', 1, 4, 0.01, () => p.zoom, (v) => { p.zoom = v; relayout(); }, { def: 1 }));
  body.append(el('div', { class: 'row' },
    el('button', { class: 'btn small', onclick: () => { p.rotate90 = (p.rotate90 + 3) % 4; layout(); render(); commit(); } }, '⟲ Xoay trái'),
    el('button', { class: 'btn small', onclick: () => { p.rotate90 = (p.rotate90 + 1) % 4; layout(); render(); commit(); } }, '⟳ Xoay phải'),
    el('button', { class: 'btn small', onclick: () => { p.flipH = !p.flipH; render(); commit(); } }, '⇋ Lật')));
  body.append(el('p', { class: 'hint' }, p.aspect === -1 ? 'Tự do: kéo 4 góc / 4 cạnh của khung để cắt, kéo bên trong khung để dời. Rời tab Cắt xoay để xem ảnh đã cắt.' : 'Kéo ảnh để chọn vùng cắt khi đã thu phóng hoặc đổi tỉ lệ.'));
}

// ---- Portrait: face ----------------------------------------------------------------
function cropAspect() { return geomFor(state.params, state.src.w, state.src.h).aspectC; }
function panelFace(body) {
  const faces = state.params.faces;
  body.append(title('Khuôn mặt', el('button', { class: 'btn small', disabled: faces.length >= 4, onclick: () => {
    faces.push(newFace(0.5, displayToCropV(state.params, 0.4), cropAspect()));
    state.selFace = faces.length - 1; render(); commit(); renderPanel(); drawOverlay();
  } }, '+ Thêm khuôn mặt')));
  if (!faces.length) {
    body.append(el('p', { class: 'hint' }, 'Chạm vào giữa khuôn mặt trên ảnh để đặt khung (tối đa 4 người). Sau đó kéo khung cho ôm mặt (trán đến cằm), kéo 2 chấm mắt và chấm mũi vào đúng chỗ, rồi dùng các thanh trượt.'));
    return;
  }
  if (state.selFace < 0 || state.selFace >= faces.length) state.selFace = 0;
  const chips = el('div', { class: 'chips' });
  faces.forEach((f, i) => chips.append(el('button', { class: 'chip' + (i === state.selFace ? ' active' : ''), onclick: () => { state.selFace = i; renderPanel(); drawOverlay(); } }, `Mặt ${i + 1}`)));
  body.append(chips);
  const f = faces[state.selFace];
  compactSliders(body, 'face', [
    ...FACE_SLIDERS.map(([k, n]) => ({ label: n, min: -100, max: 100, step: 1, get: () => f[k], set: (v) => { f[k] = v; } })),
    { label: 'Nghiêng khung', min: -45, max: 45, step: 1, get: () => f.angle, set: (v) => { f.angle = v; drawOverlay(); } },
  ]);
  body.append(el('div', { class: 'row' },
    el('button', { class: 'btn small', onclick: () => { const c = clone(f); faces.forEach((o) => { for (const [k] of FACE_SLIDERS) o[k] = c[k]; }); render(); commit(); toast('Đã áp cho mọi khuôn mặt'); } }, 'Áp cho tất cả'),
    el('button', { class: 'btn small danger', onclick: () => { faces.splice(state.selFace, 1); state.selFace = faces.length - 1; render(); commit(); renderPanel(); drawOverlay(); } }, 'Xoá khung')));
  body.append(el('p', { class: 'hint' }, 'Gợi ý tự nhiên: Gầy mặt 20–35, Cằm V 15–30, Mắt to 10–20. Giữ nút so sánh để xem trước/sau.'));
}

// ---- Portrait: body ----------------------------------------------------------------
function panelBody(body) {
  const p = state.params;
  body.append(title('Dáng người'));
  const chips = el('div', { class: 'chips params' });
  [['height', 'Kéo cao chân'], ['slim', 'Thon gọn'], ['push', 'Đẩy tự do']].forEach(([k, n]) =>
    chips.append(el('button', { class: 'chip' + (state.bodyMode === k ? ' active' : ''), onclick: () => { state.bodyMode = k; renderPanel(); drawOverlay(); } }, n)));
  body.append(chips);
  if (state.bodyMode === 'height') {
    body.append(slider('Độ cao (chân dài)', 0, 100, 1, () => p.body.height, (v) => { p.body.height = v; layout(); }));
    body.append(el('p', { class: 'hint' }, 'Kéo vạch "Bắt đầu" xuống ngang hông/đầu gối và vạch "Kết thúc" xuống mắt cá chân. Chỉ phần giữa 2 vạch được kéo dài, nên đặt vạch ở chỗ nền đơn giản để không lộ.'));
  } else if (state.bodyMode === 'slim') {
    body.append(el('div', { class: 'row', style: 'margin-top:0' }, el('button', { class: 'btn small', disabled: p.boxes.length >= 6, onclick: () => {
      p.boxes.push({ cx: 0.5, cy: displayToCropV(p, 0.6), hw: 0.08, hh: 0.1, amount: 30, angle: 0 });
      state.selBox = p.boxes.length - 1; render(); commit(); renderPanel(); drawOverlay();
    } }, '+ Thêm vùng thon')));
    if (!p.boxes.length) body.append(el('p', { class: 'hint' }, 'Chạm vào eo, bắp tay hoặc đùi để đặt vùng thon (tối đa 6). Vùng sẽ bóp nhỏ theo chiều ngang về giữa khung.'));
    else {
      if (state.selBox < 0 || state.selBox >= p.boxes.length) state.selBox = 0;
      const ch2 = el('div', { class: 'chips' });
      p.boxes.forEach((b, i) => ch2.append(el('button', { class: 'chip' + (i === state.selBox ? ' active' : ''), onclick: () => { state.selBox = i; renderPanel(); drawOverlay(); } }, `Vùng ${i + 1}`)));
      body.append(ch2);
      const b = p.boxes[state.selBox];
      body.append(slider('Độ thon', -100, 100, 1, () => b.amount, (v) => { b.amount = v; }));
      body.append(slider('Nghiêng', -60, 60, 1, () => b.angle, (v) => { b.angle = v; drawOverlay(); }));
      body.append(el('div', { class: 'row' }, el('button', { class: 'btn small danger', onclick: () => { p.boxes.splice(state.selBox, 1); state.selBox = p.boxes.length - 1; render(); commit(); renderPanel(); drawOverlay(); } }, 'Xoá vùng')));
    }
  } else {
    body.append(slider('Cỡ cọ', 2, 30, 1, () => Math.round(state.brush * 100), (v) => { state.brush = v / 100; }, { def: 8 }));
    body.append(el('div', { class: 'row', style: 'margin-top:0' },
      el('button', { class: 'btn small', disabled: !p.pushes.length, onclick: () => {
        // remove the last stroke
        const id = p.pushes.length ? p.pushes[p.pushes.length - 1].s : null;
        while (p.pushes.length && p.pushes[p.pushes.length - 1].s === id) p.pushes.pop();
        render(); commit(); renderPanel();
      } }, 'Bỏ nét cuối'),
      el('button', { class: 'btn small danger', disabled: !p.pushes.length, onclick: () => { p.pushes = []; render(); commit(); renderPanel(); } }, 'Xoá hết')));
    body.append(el('p', { class: 'hint' }, 'Kéo ngón tay trên ảnh để đẩy vùng ảnh theo hướng kéo (như Liquify): đẩy eo vào trong, nâng vai, chỉnh tay. Kéo ngắn, nhẹ nhiều lần sẽ tự nhiên hơn. Chú ý nền thẳng (cột, đường chân trời) dễ bị cong.'));
  }
}

// ---- Lens: perspective, distortion, lens blur, edge fill & expand ------------------------
const FILLS = [['mirror-blur', 'Phản chiếu + mờ'], ['mirror', 'Phản chiếu'], ['edge', 'Kéo dài mép'], ['black', 'Đen'], ['white', 'Trắng']];
function panelLens(body) {
  const p = state.params, L = p.lens, B = p.lensBlur;
  const sub = state.lensTab || 'persp';
  const head = el('div', { class: 'chips params' });
  [['persp', 'Phối cảnh'], ['fish', 'Mắt cá'], ['distort', 'Méo & viền màu'], ['blur', 'Làm mờ ống kính'], ['fill', 'Rìa & mở rộng']].forEach(([k, n]) =>
    head.append(el('button', { class: 'chip' + (sub === k ? ' active' : ''), onclick: () => { state.lensTab = k; renderPanel(); drawOverlay(); } }, n)));
  body.append(head);
  const d = (label, obj, key, min, max, step, def = 0, after) => ({ label, min, max, step, def, get: () => obj[key], set: (v) => { obj[key] = v; if (after) after(); } });
  if (sub === 'persp') {
    compactSliders(body, 'lens-persp', [
      d('Dọc (dựng thẳng)', L, 'persV', -100, 100, 1),
      d('Ngang', L, 'persH', -100, 100, 1),
      d('Xoay thẳng', p, 'straighten', -45, 45, 0.1, 0, layout),
      d('Phóng to (che rìa)', L, 'zoom', 1, 2, 0.01, 1),
    ]);
    body.append(el('p', { class: 'hint' }, 'Kéo "Dọc" để dựng thẳng cột, nhà bị chụm khi chụp ngước. Phần rìa bị hở sẽ được lấp theo mục "Rìa & mở rộng", hoặc tăng "Phóng to" để cắt bỏ.'));
  } else if (sub === 'fish') {
    compactSliders(body, 'lens-fish', [
      d('Mắt cá', L, 'fisheye', 0, 100, 1),
      d('Phóng to', L, 'zoom', 1, 2, 0.01, 1),
    ]);
    body.append(el('p', { class: 'hint' }, 'Mắt cá phóng to vùng giữa và bẻ cong mép như ống fisheye, ảnh vẫn kín khung (không viền đen). "Phóng to" để giảm độ cong ở mép.'));
  } else if (sub === 'distort') {
    compactSliders(body, 'lens-distort', [
      d('Méo ống kính', L, 'distort', -100, 100, 1),
      d('Viền màu (quang sai)', L, 'ca', -100, 100, 1),
    ]);
    body.append(el('p', { class: 'hint' }, 'Méo âm = sửa méo phình (ống góc rộng), dương = hiệu ứng mắt cá nhẹ. Viền màu tạo/khử viền tím-xanh ở mép như ống kính cổ.'));
  } else if (sub === 'blur') {
    body.append(el('div', { class: 'row', style: 'margin:0 0 6px' },
      el('button', { class: 'btn small' + (B.on ? ' on' : ''), onclick: () => { B.on = !B.on; render(); commit(); renderPanel(); drawOverlay(); } }, B.on ? 'Đang bật' : 'Bật làm mờ'),
      el('button', { class: 'chip' + (B.shape === 'radial' ? ' active' : ''), onclick: () => { B.shape = 'radial'; render(); commit(); renderPanel(); drawOverlay(); } }, 'Tròn'),
      el('button', { class: 'chip' + (B.shape === 'linear' ? ' active' : ''), onclick: () => { B.shape = 'linear'; render(); commit(); renderPanel(); drawOverlay(); } }, 'Dải (tilt-shift)')));
    const defs = [
      d('Độ mờ', B, 'amount', 0, 100, 1),
      d('Vùng nét', B, 'r', 0.02, 0.8, 0.01, 0.18, drawOverlay),
      d('Chuyển tiếp', B, 'feather', 0.02, 0.8, 0.01, 0.22, drawOverlay),
      d('Bokeh sáng', B, 'bokeh', 0, 100, 1),
    ];
    if (B.shape === 'linear') defs.push(d('Góc dải', B, 'angle', -90, 90, 1, 0, drawOverlay));
    compactSliders(body, 'lens-blur', defs);
    body.append(el('p', { class: 'hint' }, 'Chạm/kéo trên ảnh để đặt tâm vùng nét (vòng liền = nét, vòng đứt = mờ hẳn). Chụm 2 ngón để phóng to xem.'));
  } else {
    const chips = el('div', { class: 'chips' });
    FILLS.forEach(([k, n]) => chips.append(el('button', { class: 'chip' + ((p.fill || 'mirror-blur') === k ? ' active' : ''), onclick: () => { p.fill = k; render(); commit(); renderPanel(); } }, n)));
    body.append(el('div', { class: 'sect', style: 'margin-top:0' }, 'Lấp phần rìa bị thiếu'), chips);
    compactSliders(body, 'lens-fill', [d('Mở rộng khung (%)', p, 'expand', 0, 40, 1, 0, layout)]);
    body.append(el('p', { class: 'hint' }, 'Khi kéo dãn, xoay, chỉnh phối cảnh hoặc mở rộng khung làm hở mép ảnh, phần thiếu sẽ được lấp theo kiểu đã chọn. "Phản chiếu + mờ" tự nhiên nhất cho nền trời, lá, tường.'));
  }
}

// ---- Portrait: skin ----------------------------------------------------------------
function panelSkin(body) {
  const sk = state.params.skin;
  compactSliders(body, 'skin', [
    { label: 'Làm mịn da', min: 0, max: 100, step: 1, get: () => sk.smooth, set: (v) => { sk.smooth = v; } },
    { label: 'Sáng da', min: -100, max: 100, step: 1, get: () => sk.bright, set: (v) => { sk.bright = v; } },
    { label: 'Giảm đỏ da', min: 0, max: 100, step: 1, get: () => sk.red, set: (v) => { sk.red = v; } },
  ]);
  body.append(el('p', { class: 'hint' }, 'Tự nhận vùng da theo màu (không cần tô). Nếu tóc/nền màu gần da bị ảnh hưởng, hãy giảm mức hoặc dùng Chọn lọc.'));
}

// ---- overlay interactions ------------------------------------------------------------
function drawOverlay() {
  const ov = $('#overlay'); ov.innerHTML = '';
  if (!state.img) return;
  const W = ov.clientWidth, H = ov.clientHeight;
  if (state.tab === 'selective') {
    state.params.points.forEach((pt, i) => {
      const d = el('div', { class: 'pt' + (i === state.selPoint ? ' sel' : ''), style: `left:${pt.x * W}px;top:${pt.y * H}px` }, String(i + 1));
      if (i === state.selPoint) {
        const R = pt.r * H;
        d.append(el('div', { class: 'ring', style: `width:${2 * R}px;height:${2 * R}px;left:${13 - R - 2}px;top:${13 - R - 2}px` }));
      }
      ov.append(d);
    });
  } else if (state.tab === 'gradient' && state.params.grad.on) {
    const g = state.params.grad;
    ov.append(el('div', { class: 'gline', style: `top:${g.y0 * H}px` }, el('span', {}, '1')));
    ov.append(el('div', { class: 'gline end', style: `top:${g.y1 * H}px` }, el('span', {}, '0')));
  } else if (state.tab === 'crop' && state.params.aspect === -1) {
    const r = state.params.cropRect, L = r.x0 * W, T = r.y0 * H, R = r.x1 * W, B = r.y1 * H;
    ov.append(el('div', { class: 'cshade', style: `left:0;top:0;width:${W}px;height:${T}px` }),
      el('div', { class: 'cshade', style: `left:0;top:${B}px;width:${W}px;height:${H - B}px` }),
      el('div', { class: 'cshade', style: `left:0;top:${T}px;width:${L}px;height:${B - T}px` }),
      el('div', { class: 'cshade', style: `left:${R}px;top:${T}px;width:${W - R}px;height:${B - T}px` }),
      el('div', { class: 'cropgrid', style: `inset:auto;left:${L}px;top:${T}px;width:${R - L}px;height:${B - T}px` }));
    for (const [x, y, cls] of [[L, T, 'tl'], [R, T, 'tr'], [L, B, 'bl'], [R, B, 'br']]) ov.append(el('div', { class: 'chdl c-' + cls, style: `left:${x}px;top:${y}px` }));
    for (const [x, y, cls] of [[(L + R) / 2, T, 'h'], [(L + R) / 2, B, 'h'], [L, (T + B) / 2, 'v'], [R, (T + B) / 2, 'v']]) ov.append(el('div', { class: 'ehdl e-' + cls, style: `left:${x}px;top:${y}px` }));
  } else if (state.tab === 'crop') {
    ov.append(el('div', { class: 'cropgrid' }));
  } else if (state.tab === 'lens' && state.lensTab === 'blur' && state.params.lensBlur.on) {
    const B = state.params.lensBlur, x = B.x * W, y = B.y * H;
    if (B.shape === 'linear') {
      for (const [rr, cls] of [[B.r, ''], [B.r + B.feather, ' end']]) for (const sg of [-1, 1]) {
        const a = (B.angle * Math.PI) / 180, nx = -Math.sin(a), ny = Math.cos(a);
        ov.append(el('div', { class: 'lbline' + cls, style: `left:${x + nx * sg * rr * H}px;top:${y + ny * sg * rr * H}px;transform:translate(-50%,-50%) rotate(${B.angle}deg)` }));
      }
    } else {
      for (const [rr, cls] of [[B.r, ''], [B.r + B.feather, ' end']]) {
        const R = rr * H;
        ov.append(el('div', { class: 'lbring' + cls, style: `left:${x - R}px;top:${y - R}px;width:${2 * R}px;height:${2 * R}px` }));
      }
    }
    ov.append(el('div', { class: 'pt sel', style: `left:${x}px;top:${y}px` }, '◎'));
  } else if (state.tab === 'face') {
    const p = state.params, Hc = H / outHeightScale(p);
    p.faces.forEach((f, i) => {
      const sel = i === state.selFace;
      const cx = f.cx * W, cy = cropToDisplayV(p, f.cy) * H, rx = f.rx * Hc, ry = f.ry * Hc;
      ov.append(el('div', { class: 'faceov' + (sel ? ' sel' : ''), style: `left:${cx - rx}px;top:${cy - ry}px;width:${2 * rx}px;height:${2 * ry}px;transform:rotate(${f.angle}deg)` },
        el('span', { class: 'flabel' }, String(i + 1))));
      if (sel) {
        ov.append(el('div', { class: 'hdl', style: `left:${cx + rx * 0.72}px;top:${cy + ry * 0.72}px` }));
        f.eyes.forEach((e) => ov.append(el('div', { class: 'dot eye', style: `left:${e[0] * W}px;top:${cropToDisplayV(p, e[1]) * H}px` })));
        ov.append(el('div', { class: 'dot nose', style: `left:${f.nose[0] * W}px;top:${cropToDisplayV(p, f.nose[1]) * H}px` }));
      }
    });
  } else if (state.tab === 'body') {
    const p = state.params, Hc = H / outHeightScale(p);
    if (state.bodyMode === 'height') {
      const k = outHeightScale(p) > 1;
      const yA = cropToDisplayV(p, p.body.y0) * H, yB = k ? cropToDisplayV(p, p.body.y1) * H : p.body.y1 * H;
      ov.append(el('div', { class: 'hband', style: `top:${yA}px;height:${Math.max(0, yB - yA)}px` }));
      ov.append(el('div', { class: 'gline', style: `top:${yA}px` }, el('span', { class: 'wide' }, 'Bắt đầu')));
      ov.append(el('div', { class: 'gline end', style: `top:${yB}px` }, el('span', { class: 'wide' }, 'Kết thúc')));
    } else if (state.bodyMode === 'slim') {
      p.boxes.forEach((b, i) => {
        const cx = b.cx * W, cy = cropToDisplayV(p, b.cy) * H, hw = b.hw * Hc, hh = b.hh * Hc;
        ov.append(el('div', { class: 'boxov' + (i === state.selBox ? ' sel' : ''), style: `left:${cx - hw}px;top:${cy - hh}px;width:${2 * hw}px;height:${2 * hh}px;transform:rotate(${b.angle}deg)` },
          el('span', { class: 'flabel' }, '→ ' + (i + 1) + ' ←')));
        if (i === state.selBox) ov.append(el('div', { class: 'hdl', style: `left:${cx + hw}px;top:${cy + hh}px` }));
      });
    } else if (state.brushPos) {
      const r = state.brush * Hc;
      ov.append(el('div', { class: 'brush', style: `left:${state.brushPos[0] * W - r}px;top:${state.brushPos[1] * H - r}px;width:${2 * r}px;height:${2 * r}px` }));
    }
  }
}

(() => {
  const ov = $('#overlay');
  let mode = null, start = null, moved = false;
  const rel = (e) => { const r = ov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; };
  ov.addEventListener('pointerdown', (e) => {
    if (!state.img) return;
    ov.setPointerCapture(e.pointerId);
    const [x, y, r] = rel(e);
    moved = false; start = { x, y, cx: e.clientX, cy: e.clientY };
    if (state.tab === 'selective') {
      const pts = state.params.points;
      const hit = pts.findIndex((p) => Math.hypot((p.x - x) * r.width, (p.y - y) * r.height) < 22);
      if (hit >= 0) { mode = { t: 'pt', i: hit }; state.selPoint = hit; renderPanel(); drawOverlay(); }
      else mode = { t: 'newpt' };
    } else if (state.tab === 'gradient' && state.params.grad.on) {
      const g = state.params.grad;
      const d0 = Math.abs(g.y0 - y) * r.height, d1 = Math.abs(g.y1 - y) * r.height;
      mode = { t: 'grad', k: d0 <= d1 ? 'y0' : 'y1' };
    } else if (state.tab === 'crop' && state.params.aspect === -1) {
      const cr = state.params.cropRect, W = r.width, H = r.height;
      const nx = (v) => Math.abs(v - x) * W < 26, ny = (v) => Math.abs(v - y) * H < 26;
      const inY = y > cr.y0 - 0.03 && y < cr.y1 + 0.03, inX = x > cr.x0 - 0.03 && x < cr.x1 + 0.03;
      const ed = { l: nx(cr.x0) && inY, r: nx(cr.x1) && inY, t: ny(cr.y0) && inX, b: ny(cr.y1) && inX };
      if (ed.l || ed.r || ed.t || ed.b) mode = { t: 'crop', ed, r0: { ...cr }, x0: x, y0: y };
      else if (x > cr.x0 && x < cr.x1 && y > cr.y0 && y < cr.y1) mode = { t: 'crop', move: true, r0: { ...cr }, x0: x, y0: y };
      else mode = null;
    } else if (state.tab === 'crop') {
      mode = { t: 'pan', px: state.params.panX, py: state.params.panY };
    } else if (state.tab === 'lens' && state.lensTab === 'blur' && state.params.lensBlur.on) {
      mode = { t: 'lb' }; state.params.lensBlur.x = x; state.params.lensBlur.y = y; drawOverlay(); render();
    } else if (state.tab === 'face') {
      mode = faceDown(x, y, r);
    } else if (state.tab === 'body') {
      mode = bodyDown(x, y, r);
    } else mode = null;
  });
  ov.addEventListener('pointermove', (e) => {
    if (state.pinching) { mode = null; return; }
    if (!mode) return;
    const [x, y, r] = rel(e);
    if (Math.hypot(e.clientX - start.cx, e.clientY - start.cy) > 4) moved = true;
    if (mode.t === 'pt' && moved) {
      const p = state.params.points[mode.i]; p.x = Math.min(1, Math.max(0, x)); p.y = Math.min(1, Math.max(0, y));
      p.col = null; drawOverlay(); render();
    } else if (mode.t === 'grad') {
      state.params.grad[mode.k] = Math.min(1, Math.max(0, y)); drawOverlay(); render();
    } else if (mode.t === 'crop') {
      const cr = state.params.cropRect, o = mode.r0, dx = x - mode.x0, dy = y - mode.y0, MIN = 0.06;
      const cl = (v) => Math.min(1, Math.max(0, v));
      if (mode.move) {
        const w = o.x1 - o.x0, h = o.y1 - o.y0;
        cr.x0 = Math.min(1 - w, Math.max(0, o.x0 + dx)); cr.x1 = cr.x0 + w;
        cr.y0 = Math.min(1 - h, Math.max(0, o.y0 + dy)); cr.y1 = cr.y0 + h;
      } else {
        if (mode.ed.l) cr.x0 = Math.min(cl(o.x0 + dx), cr.x1 - MIN);
        if (mode.ed.r) cr.x1 = Math.max(cl(o.x1 + dx), cr.x0 + MIN);
        if (mode.ed.t) cr.y0 = Math.min(cl(o.y0 + dy), cr.y1 - MIN);
        if (mode.ed.b) cr.y1 = Math.max(cl(o.y1 + dy), cr.y0 + MIN);
      }
      drawOverlay();
    } else if (mode.t === 'lb') {
      state.params.lensBlur.x = Math.min(1, Math.max(0, x)); state.params.lensBlur.y = Math.min(1, Math.max(0, y)); drawOverlay(); render();
    } else if (mode.t && mode.t.startsWith('f-') || mode.t && mode.t.startsWith('b-')) {
      portraitMove(mode, x, y, r, e);
    } else if (mode.t === 'pan') {
      const p = state.params;
      p.panX = Math.min(1, Math.max(-1, mode.px - (e.clientX - start.cx) / r.width * 2 / Math.max(1, p.zoom)));
      p.panY = Math.min(1, Math.max(-1, mode.py - (e.clientY - start.cy) / r.height * 2 / Math.max(1, p.zoom)));
      render();
    }
  });
  ov.addEventListener('pointerup', (e) => {
    if (state.pinching) { mode = null; return; }
    if (!mode) return;
    const [x, y] = rel(e);
    if (mode.t === 'newpt' && !moved && state.params.points.length < 8) {
      // sample colour from the image without the point adjustments
      const saved = state.params.points; state.params.points = [];
      const { geo, cw, aspectC } = geomFor(state.params, state.src.w, state.src.h);
      const cv = $('#view');
      renderer.draw(state.src, state.params, { geo, aspectC, outW: cv.width, outH: cv.height, detailScale: Math.max(1, cw / cv.width), isRaw: state.img.isRaw });
      const col = samplePointColor(x, y);
      state.params.points = saved;
      saved.push({ x, y, r: 0.18, bright: 0, contrast: 0, sat: 0, warmth: 0, col });
      state.selPoint = saved.length - 1;
      render(); commit(); renderPanel(); drawOverlay();
    } else if (mode.t === 'pt' && moved) {
      const p = state.params.points[mode.i];
      const saved = state.params.points; state.params.points = [];
      const { geo, cw, aspectC } = geomFor(state.params, state.src.w, state.src.h);
      const cv = $('#view');
      renderer.draw(state.src, state.params, { geo, aspectC, outW: cv.width, outH: cv.height, detailScale: Math.max(1, cw / cv.width), isRaw: state.img.isRaw });
      p.col = samplePointColor(p.x, p.y);
      state.params.points = saved; render(); commit();
    } else if (mode.t === 'f-new' && !moved && state.params.faces.length < 4) {
      const p = state.params;
      p.faces.push(newFace(x, displayToCropV(p, y), cropAspect()));
      state.selFace = p.faces.length - 1; render(); commit(); renderPanel(); drawOverlay();
    } else if (mode.t === 'b-new' && !moved && state.params.boxes.length < 6) {
      const p = state.params;
      p.boxes.push({ cx: x, cy: displayToCropV(p, y), hw: 0.07, hh: 0.09, amount: 30, angle: 0 });
      state.selBox = p.boxes.length - 1; render(); commit(); renderPanel(); drawOverlay();
    } else if (mode.t === 'b-push') {
      state.brushPos = null; drawOverlay(); commit(); renderPanel();
    } else if (mode.t === 'grad' || mode.t === 'pan' || mode.t === 'lb' || mode.t === 'crop' || (mode.t.startsWith('f-') || mode.t.startsWith('b-')) && moved) commit();
    mode = null;
  });
})();

// hit-testing & dragging for face / body overlays (x, y = display uv)
function faceDown(x, y, r) {
  const p = state.params, W = r.width, H = r.height, Hc = H / outHeightScale(p);
  const f = p.faces[state.selFace];
  const near = (ux, uy, px = 18) => Math.hypot((ux - x) * W, (cropToDisplayV(p, uy) - y) * H) < px;
  if (f) {
    for (let k = 0; k < 2; k++) if (near(f.eyes[k][0], f.eyes[k][1], 14)) return { t: 'f-eye', k };
    if (near(f.nose[0], f.nose[1], 14)) return { t: 'f-nose' };
    const hx = f.cx + f.rx * 0.72 * Hc / W, hy = cropToDisplayV(p, f.cy) + f.ry * 0.72 * Hc / H;
    if (Math.hypot((hx - x) * W, (hy - y) * H) < 22) return { t: 'f-size', f0: clone(f), x0: x, y0: y };
  }
  const hit = p.faces.findIndex((o) => {
    const dx = (x - o.cx) * W / (o.rx * Hc), dy = (y - cropToDisplayV(p, o.cy)) * H / (o.ry * Hc);
    return dx * dx + dy * dy < 1;
  });
  if (hit >= 0) {
    if (hit !== state.selFace) { state.selFace = hit; renderPanel(); drawOverlay(); }
    return { t: 'f-move', f0: clone(p.faces[hit]), x0: x, y0: displayToCropV(p, y) };
  }
  return { t: 'f-new' };
}
function bodyDown(x, y, r) {
  const p = state.params, W = r.width, H = r.height, Hc = H / outHeightScale(p);
  if (state.bodyMode === 'height') {
    const yA = cropToDisplayV(p, p.body.y0), yB = outHeightScale(p) > 1 ? cropToDisplayV(p, p.body.y1) : p.body.y1;
    return { t: 'b-line', k: Math.abs(yA - y) <= Math.abs(yB - y) ? 'y0' : 'y1' };
  }
  if (state.bodyMode === 'slim') {
    const b = p.boxes[state.selBox];
    if (b) {
      const hx = b.cx + b.hw * Hc / W, hy = cropToDisplayV(p, b.cy) + b.hh * Hc / H;
      if (Math.hypot((hx - x) * W, (hy - y) * H) < 22) return { t: 'b-size', b0: clone(b), x0: x, y0: y };
    }
    const hit = p.boxes.findIndex((o) => Math.abs(x - o.cx) * W < o.hw * Hc && Math.abs(y - cropToDisplayV(p, o.cy)) * H < o.hh * Hc);
    if (hit >= 0) {
      if (hit !== state.selBox) { state.selBox = hit; renderPanel(); drawOverlay(); }
      return { t: 'b-move', b0: clone(p.boxes[hit]), x0: x, y0: displayToCropV(p, y) };
    }
    return { t: 'b-new' };
  }
  state.brushPos = [x, y];
  return { t: 'b-push', last: [x, displayToCropV(p, y)], sid: Date.now() };
}
function portraitMove(mode, x, y, r) {
  const p = state.params, W = r.width, H = r.height, Hc = H / outHeightScale(p);
  const cy = displayToCropV(p, y);
  if (mode.t === 'f-move') {
    const f = p.faces[state.selFace], dx = x - mode.x0, dy = cy - mode.y0, o = mode.f0;
    f.cx = o.cx + dx; f.cy = o.cy + dy;
    f.eyes = o.eyes.map((e) => [e[0] + dx, e[1] + dy]); f.nose = [o.nose[0] + dx, o.nose[1] + dy];
  } else if (mode.t === 'f-size') {
    const f = p.faces[state.selFace], o = mode.f0;
    const sx = Math.max(0.2, 1 + ((x - mode.x0) * W) / (o.rx * Hc * 0.72)), sy = Math.max(0.2, 1 + ((y - mode.y0) * H) / (o.ry * Hc * 0.72));
    f.rx = o.rx * sx; f.ry = o.ry * sy;
    f.eyes = o.eyes.map((e) => [o.cx + (e[0] - o.cx) * sx, o.cy + (e[1] - o.cy) * sy]);
    f.nose = [o.cx + (o.nose[0] - o.cx) * sx, o.cy + (o.nose[1] - o.cy) * sy];
  } else if (mode.t === 'f-eye') {
    p.faces[state.selFace].eyes[mode.k] = [x, cy];
  } else if (mode.t === 'f-nose') {
    p.faces[state.selFace].nose = [x, cy];
  } else if (mode.t === 'b-line') {
    const v = Math.min(1, Math.max(0, cy));
    if (mode.k === 'y0') p.body.y0 = Math.min(v, p.body.y1 - 0.02); else p.body.y1 = Math.max(v, p.body.y0 + 0.02);
    layout();
  } else if (mode.t === 'b-move') {
    const b = p.boxes[state.selBox]; b.cx = mode.b0.cx + (x - mode.x0); b.cy = mode.b0.cy + (cy - mode.y0);
  } else if (mode.t === 'b-size') {
    const b = p.boxes[state.selBox], o = mode.b0;
    b.hw = Math.max(0.01, o.hw + ((x - mode.x0) * W) / Hc); b.hh = Math.max(0.01, o.hh + ((y - mode.y0) * H) / Hc);
  } else if (mode.t === 'b-push') {
    state.brushPos = [x, y];
    const [lx, ly] = mode.last, a = cropAspect();
    const dist = Math.hypot((x - lx) * a, cy - ly);
    if (dist > state.brush * 0.15) {
      p.pushes.push({ ax: lx, ay: ly, bx: x, by: cy, r: state.brush, s: mode.sid });
      mode.last = [x, cy];
    }
  }
  drawOverlay(); render();
}

// ---- stage gestures: pinch-zoom, pan, double-tap, Snapseed swipe --------------------
(() => {
  const st = $('#stage');
  const TOOL_TABS = ['selective', 'face', 'body', 'gradient', 'crop'];
  const pts = new Map();
  let pinch = null, one = null, lastTap = { t: 0, x: 0, y: 0 };
  const hud = $('#hud');
  const showHud = (txt) => { hud.textContent = txt; hud.hidden = false; };
  const hideHud = () => { hud.hidden = true; };
  st.addEventListener('pointerdown', (e) => {
    if (!state.img || e.target.closest('#hist')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      state.pinching = true; one = null; hideHud();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      return;
    }
    if (pts.size === 1) {
      const tool = (TOOL_TABS.includes(state.tab) || (state.tab === 'lens' && state.lensTab === 'blur' && state.params.lensBlur.on)) && e.target.closest('#overlay');
      one = { x: e.clientX, y: e.clientY, tx: state.view.tx, ty: state.view.ty, tool, mode: null, v0: 0, moved: false };
    }
  }, true);
  st.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomAt(d / pinch.d, mx, my);
      state.view.tx += mx - pinch.mx; state.view.ty += my - pinch.my; applyView();
      pinch = { d, mx, my };
      return;
    }
    if (!one || one.tool) return;
    const dx = e.clientX - one.x, dy = e.clientY - one.y;
    if (!one.mode && Math.hypot(dx, dy) > 8) {
      one.moved = true;
      if (state.view.s > 1) one.mode = 'pan';
      else if (state.swipe) {
        one.mode = Math.abs(dx) >= Math.abs(dy) ? 'adjust' : 'param';
        one.v0 = state.swipe.def.get(); one.steps = 0;
      }
    }
    if (one.mode === 'pan') { state.view.tx = one.tx + dx; state.view.ty = one.ty + dy; applyView(); }
    else if (one.mode === 'adjust') {
      const d = state.swipe.def;
      const u = d.step * Math.max(1, Math.ceil((d.max - d.min) / d.step / 100));
      state.swipe.apply(one.v0 + (dx / TICK_PX) * u * 0.6);
      showHud(`${d.label}  ${fmt(d.get(), d.step)}`);
    } else if (one.mode === 'param') {
      const steps = Math.trunc(dy / 36);
      if (steps !== one.steps) { state.swipe.next(steps - one.steps); one.steps = steps; }
      showHud(state.swipe.def.label);
    }
  }, true);
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) {
      if (pts.size < 2) { pinch = null; relayoutSoon(); }
      if (pts.size === 0) setTimeout(() => { state.pinching = false; }, 0);
      return;
    }
    if (!one) return;
    if (one.mode === 'adjust') commit();
    if (one.mode) hideHud();
    // double-tap to zoom (not on tool tabs, where taps place points)
    if (!one.moved && !one.tool && e.type === 'pointerup') {
      const now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        if (state.view.s > 1) resetView(); else zoomAt(2.5, e.clientX, e.clientY);
        relayoutSoon(); lastTap.t = 0;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    one = null;
  };
  st.addEventListener('pointerup', end, true);
  st.addEventListener('pointercancel', end, true);
  // desktop: wheel / trackpad pinch
  st.addEventListener('wheel', (e) => {
    if (!state.img) return;
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX, e.clientY);
    relayoutSoon();
  }, { passive: false });
  // iOS Safari gesture events would zoom the whole page
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  // block page-level pinch / double-tap zoom anywhere (the photo view has its own zoom)
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // only a real double-tap (same spot, quick) is blocked; quick taps on different buttons still work
  let lastTouch = { t: 0, x: 0, y: 0 };
  document.addEventListener('touchend', (e) => {
    const now = Date.now(), t = e.changedTouches[0];
    const near = t && Math.hypot(t.clientX - lastTouch.x, t.clientY - lastTouch.y) < 30;
    if (now - lastTouch.t < 320 && near && !e.target.closest('input, select, textarea')) e.preventDefault();
    lastTouch = { t: now, x: t ? t.clientX : 0, y: t ? t.clientY : 0 };
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
})();

$('#zoomBadge').addEventListener('click', () => { resetView(); relayoutSoon(); });
$('#btnHist').addEventListener('click', () => { state.showHist = !state.showHist; $('#hist').hidden = !state.showHist || !state.img; $('#btnHist').classList.toggle('on', state.showHist); });

// ---- menu: save/open edits, backup/restore, exported images ---------------------------
const safeName = (n) => (n || 'anh').replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim() || 'anh';
async function saveJson(text, base) {
  // the Claude viewer only allows .json downloads; plain browsers get the same name
  return saveBlob(new Blob([text], { type: 'application/json' }), `${base}.json`, 'application/json');
}
async function renderMenu() {
  const body = $('#menuBody'); body.innerHTML = '';
  const fileIn = el('input', { type: 'file', accept: '.json,application/json,.profile', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const r = await store.restoreBackup(await f.text());
      if (r.single) {
        if (!state.img) throw new Error('Mở ảnh trước rồi mới áp bản chỉnh');
        state.params = sanitizeParams(r.single.params); commit(); ensureLut(); layout(); render(); renderPanel();
        toast(`Đã áp bản chỉnh của "${r.single.name}"`);
      } else {
        const have = new Set(state.userPresets.map((p) => p.id));
        for (const p of r.userPresets) if (!have.has(p.id)) state.userPresets.push(p);
        saveUserPresets(); makeThumbs();
        toast(`Đã khôi phục ${r.userPresets.length} kiểu và ${r.edits} bản chỉnh`, 4000);
      }
      renderMenu();
    } catch (e) { toast(e.message, 5000); }
  });
  const sect = (t) => el('div', { class: 'sect' }, t);
  body.append(sect('Ảnh đang chỉnh'), el('div', { class: 'row' },
    el('button', { class: 'btn small', disabled: !state.img, onclick: async () => {
      const text = JSON.stringify({ format: 'fuji-raw-editor-edit', version: 1, name: state.img.name, key: state.fileKey, params: editSnapshot() }, null, 1);
      if ((await saveJson(text, safeName(state.img.name) + '.chinh')) === 'saved') toast('Đã lưu file bản chỉnh');
    } }, 'Lưu bản chỉnh ra file'),
    el('button', { class: 'btn small', onclick: () => fileIn.click() }, 'Mở file bản chỉnh / sao lưu'), fileIn));
  body.append(el('p', { class: 'hint' }, 'App tự lưu bản chỉnh của từng ảnh trong trình duyệt: mở lại đúng ảnh đó là tiếp tục chỉnh được. Lưu ra file để không mất khi xoá dữ liệu Safari.'));
  body.append(sect('Sao lưu tất cả'), el('div', { class: 'row' },
    el('button', { class: 'btn small primary', onclick: async () => {
      const text = await store.makeBackup(state.userPresets);
      const d = new Date().toISOString().slice(0, 10);
      if ((await saveJson(text, `fuji-raw-saoluu-${d}`)) === 'saved') toast('Đã lưu file sao lưu — cất trong app Tệp (Files)', 4000);
    } }, 'Sao lưu ra file'),
    el('button', { class: 'btn small', onclick: () => fileIn.click() }, 'Khôi phục từ file')));
  body.append(el('p', { class: 'hint' }, 'File sao lưu chứa mọi "Kiểu của bạn" và bản chỉnh của các ảnh. Xoá cache/dữ liệu trang web xong chỉ cần bấm "Khôi phục từ file".'));
  body.append(sect('Xuất cho Lightroom PC'), el('div', { class: 'row' },
    el('button', { class: 'btn small primary', onclick: () => exportLightroom() }, 'Xuất preset Lightroom (.zip)')));
  body.append(el('p', { class: 'hint' }, 'File .zip gồm: bản đang chỉnh + mọi "Kiểu của bạn" dạng .xmp, kèm profile .cube và hướng dẫn. Chép sang máy tính rồi nhập vào Lightroom / Camera Raw.'));

  const exps = await store.listExports();
  body.append(sect(`Ảnh đã xuất gần đây (${exps.length})`));
  if (!exps.length) body.append(el('p', { class: 'hint' }, 'Chưa có. Ảnh xuất sẽ hiện ở đây để lưu/chia sẻ lại.'));
  const grid = el('div', { class: 'looks' });
  for (const x of exps) {
    grid.append(el('div', { class: 'look' },
      x.thumb ? el('img', { src: x.thumb, alt: '' }) : el('div', { class: 'ph' }),
      el('span', {}, `${x.w}×${x.h}`),
      el('button', { class: 'btn small', onclick: () => saveBlob(x.blob, x.name) }, 'Lưu lại'),
      el('button', { class: 'btn small danger', onclick: async () => { await store.deleteExport(x.id); renderMenu(); } }, 'Xoá')));
  }
  if (exps.length) body.append(grid);

  const edits = await store.listEdits();
  body.append(sect(`Bản chỉnh đã lưu (${edits.length})`));
  const eg = el('div', { class: 'looks' });
  for (const e of edits) {
    eg.append(el('div', { class: 'look' },
      e.thumb ? el('img', { src: e.thumb, alt: '' }) : el('div', { class: 'ph' }),
      el('span', {}, e.name),
      el('button', { class: 'btn small', disabled: !state.img, onclick: () => { state.params = sanitizeParams(e.params); commit(); ensureLut(); layout(); render(); renderPanel(); toast('Đã áp bản chỉnh này cho ảnh đang mở'); } }, 'Áp vào ảnh này'),
      el('button', { class: 'btn small', onclick: () => {
        const params = sanitizeParams(e.params);
        params.points = []; params.faces = []; params.boxes = []; params.pushes = []; params.body = defaultParams().body;
        const name = safeName(e.name).slice(-18);
        state.userPresets.push({ id: 'u' + Date.now(), name, params }); saveUserPresets(); if (state.img) makeThumbs();
        toast(`Đã lưu thành Kiểu "${name}" — xem ở tab Kiểu`, 4000);
      } }, 'Lưu thành Kiểu'),
      el('button', { class: 'btn small', onclick: async () => {
        const text = JSON.stringify({ format: 'fuji-raw-editor-edit', version: 1, name: e.name, key: e.key, params: e.params }, null, 1);
        if ((await saveJson(text, safeName(e.name) + '.chinh')) === 'saved') toast('Đã lưu file bản chỉnh');
      } }, 'Lưu ra file'),
      el('button', { class: 'btn small danger', onclick: async () => { await store.deleteEdit(e.key); renderMenu(); } }, 'Xoá')));
  }
  if (edits.length) body.append(eg);
  try {
    const gl = renderer.gl, dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    body.append(sect('Thông tin GPU (gửi khi báo lỗi)'), el('p', { class: 'hint', style: 'user-select:text' },
      `${gpu} · tối đa ${renderer.maxTex}px · ${gl.isContextLost() ? 'GPU ĐANG BỊ THU HỒI' : 'GPU ổn'} · ảnh ${state.img ? fullSize(state.img).join('×') + (state.img.isRaw ? ' RAW' : '') : '—'} · khung xem ${$('#view').width}×${$('#view').height}`));
  } catch { /* ignore */ }
  body.append(sect('Ảnh xuất được lưu ở đâu?'), el('p', { class: 'hint' },
    'iPhone: bấm Xuất → bảng Chia sẻ → "Lưu hình ảnh" để vào app Ảnh, hoặc "Lưu vào Tệp". Nếu trình duyệt tải xuống trực tiếp, ảnh nằm trong app Tệp → Tải về (Downloads). Trong app Claude: chọn "Lưu" ở bảng hiện ra.'));
}
async function exportLightroom() {
  const ascii = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'preset';
  const files = [{ name: 'HUONG-DAN.txt', data: README_LR }];
  const cubes = new Map();
  const add = (name, params, group) => {
    const p = effectiveParams(sanitizeParams(params));
    let note = '';
    if (p.profile === 'custom' && state.customLut) { note = ascii(state.customLut.name) + '.cube'; cubes.set(note, state.customLut); }
    else if (p.profile && PROFILES[p.profile]) { note = ascii(PROFILES[p.profile].name.replace(' (phong cách)', '')) + '.cube'; cubes.set(note, state.lutCache[p.profile] || (state.lutCache[p.profile] = buildProfileLUT(p.profile))); }
    files.push({ name: `Presets/${ascii(name)}.xmp`, data: paramsToXmp(name, p, { group, profileNote: note }).xmp });
  };
  if (state.img) add('Ban chinh - ' + safeName(state.img.name), state.params, 'Fuji RAW Editor - Ban chinh');
  for (const pr of state.userPresets) add(pr.name, pr.params, 'Fuji RAW Editor - Kieu cua ban');
  if (files.length === 1) { toast('Chưa có gì để xuất: mở ảnh đã chỉnh hoặc lưu "Kiểu của bạn" trước', 4000); return; }
  for (const [n, lut] of cubes) files.push({ name: `Profiles/${n}`, data: lutToCube(lut) });
  const zip = makeZip(files);
  const d = new Date().toISOString().slice(0, 10);
  const r = await saveBlob(new Blob([zip], { type: 'application/zip' }), `lightroom-presets-${d}.zip`, 'application/zip');
  if (r === 'saved') toast(`Đã xuất ${files.length - 1 - cubes.size} preset + ${cubes.size} profile`, 4000);
}
$('#btnMenu').addEventListener('click', () => { renderMenu(); $('#menuDlg').showModal(); });
store.persist();

// ---- export ----------------------------------------------------------------------------
const dlg = $('#exportDlg');
$('#expQ').addEventListener('input', () => { $('#expQv').textContent = $('#expQ').value; });
$('#expSize').addEventListener('change', () => { $('#expSize').dataset.touched = '1'; });
$('#btnExport').onclick = () => {
  if (!state.img) return;
  const [fw, fh] = fullSize(state.img);
  const { cw, ch } = geomFor(state.params, fw, fh, true);
  // phones: default to 4096 px for big images (full 30+ MP exports can exhaust Safari's GPU memory)
  if (matchMedia('(pointer: coarse)').matches && Math.max(cw, ch) > 4096 && !$('#expSize').dataset.touched) $('#expSize').value = '4096';
  $('#expInfo').textContent = `Kích thước đầy đủ: ${Math.round(cw)}×${Math.round(ch)} px` + (state.img.isRaw && state.half ? ' (RAW giải mã ½ để chạy nhẹ trên điện thoại)' : '');
  dlg.showModal();
};
dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') doExport(+$('#expSize').value, +$('#expQ').value / 100); });

async function saveBlob(blob, filename, mime = 'image/jpeg', altName = null) {
  // 1) Claude artifact host
  try {
    if (window.claude && window.claude.use) {
      const dl = await window.claude.use('downloads');
      if (dl) {
        try { await dl.save({ filename, data: blob }); return 'saved'; } catch (e1) {
          if (e1 && e1.code === 'rejected_extension' && altName) { await dl.save({ filename: altName, data: blob }); toast('Trình xem chỉ cho lưu đuôi .json — app vẫn mở được file này.', 5000); return 'saved'; }
          throw e1;
        }
      }
    }
  } catch (e) {
    if (e && e.code === 'declined') return 'declined';
    if (e && e.code && e.code !== 'unavailable' && e.code !== 'not_granted') throw new Error(e.message || e.code);
  }
  // 2) Web Share (iOS: "Lưu hình ảnh")
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'saved'; } catch (e) { if (e.name === 'AbortError') return 'declined'; }
  }
  // 3) plain download
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'saved';
}

async function doExport(maxSide, quality) {
  showStatus('Đang xuất ảnh…');
  await new Promise((r) => setTimeout(r, 30));
  let fullSrc = null;
  try {
    const img = state.img;
    let full = img.full;
    // keep within GPU limits
    const [fw, fh] = fullSize(img);
    if (Math.max(fw, fh) > renderer.maxTex) throw new Error(`Ảnh quá lớn cho GPU (${fw}×${fh}, tối đa ${renderer.maxTex})`);
    fullSrc = renderer.makeSource(full);
    const { geo, cw, ch, aspectC } = geomFor(state.params, fw, fh, true);
    ensureDisp(state.params, aspectC);
    let ow = Math.round(cw), oh = Math.round(ch);
    const lim = Math.min(maxSide || Infinity, renderer.maxTex);
    if (Math.max(ow, oh) > lim) { const s = lim / Math.max(ow, oh); ow = Math.round(ow * s); oh = Math.round(oh * s); }
    // scale point radii etc. are in uv space -> resolution independent
    ensureLut();
    const cv = renderer.renderTiledToCanvas(fullSrc, effectiveParams(state.params), { geo, aspectC, outW: ow, outH: oh, detailScale: Math.max(1, cw / ow), isRaw: img.isRaw });
    renderer.deleteSource(fullSrc); fullSrc = null;
    const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Không tạo được JPEG'))), 'image/jpeg', quality));
    const tcv = document.createElement('canvas'), ts = 160 / Math.max(ow, oh);
    tcv.width = Math.max(1, Math.round(ow * ts)); tcv.height = Math.max(1, Math.round(oh * ts));
    tcv.getContext('2d').drawImage(cv, 0, 0, tcv.width, tcv.height);
    cv.width = cv.height = 1;
    const base = img.name.replace(/\.[^.]+$/, '');
    showStatus('');
    store.addExport({ id: 'x' + Date.now(), name: `${base}-edit.jpg`, blob, w: ow, h: oh, date: Date.now(), thumb: tcv.toDataURL('image/jpeg', 0.7) });
    const r = await saveBlob(blob, `${base}-edit.jpg`);
    toast(r === 'saved' ? `Đã xuất ${ow}×${oh} (${(blob.size / 1048576).toFixed(1)} MB)` : 'Đã huỷ lưu');
  } catch (e) {
    console.error(e);
    if (fullSrc) renderer.deleteSource(fullSrc);
    showStatus('');
    toast('Lỗi xuất ảnh: ' + (e.message || e), 6000);
  }
  render();
}

renderPanel();
$('#optFull').addEventListener('change', (e) => { state.half = !e.target.checked; });
