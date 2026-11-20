import { defaultParams, clone, PANELS, HSL_BANDS } from './params.js';
import { Renderer } from './renderer.js';
import { loadRaw, loadImage, isRawName, fullSize } from './loader.js';
import { computeGeometry, ASPECTS } from './geometry.js';
import { BUILTIN_PRESETS, parseXmp } from './presets.js';
import { PROFILES, buildProfileLUT, parseCube } from './profiles.js';
import { evalCurve } from './curves.js';

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
  crop: '<path d="M7 3v14h14M3 7h14v14" fill="none" stroke="currentColor" stroke-width="1.6"/>',
};
const TABS = [
  ['looks', 'Kiểu'], ['profile', 'Profile'], ['light', 'Ánh sáng'], ['color', 'Màu'], ['presence', 'Hiện diện'],
  ['hsl', 'HSL'], ['curve', 'Đường cong'], ['grading', 'Chỉnh màu'], ['selective', 'Chọn lọc'], ['gradient', 'Gradient'],
  ['detail', 'Chi tiết'], ['effects', 'Hiệu ứng'], ['calibration', 'Hiệu chuẩn'], ['crop', 'Cắt xoay'],
];

// ---- state ------------------------------------------------------------------
const state = {
  img: null, src: null, params: defaultParams(), history: [], future: [], tab: 'looks',
  hslBand: 1, curveCh: 'rgb', selPoint: -1, original: false, lutCache: {}, customLut: null,
  thumbs: {}, userPresets: loadUserPresets(), activeLook: null, half: true,
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
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
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
  const id = state.params.profile;
  let lut = null;
  if (id === 'custom') lut = state.customLut;
  else if (id) lut = state.lutCache[id] || (state.lutCache[id] = buildProfileLUT(id));
  if (renderer && renderer.lut !== lut) renderer.setLut(lut);
}

// ---- view layout & render ---------------------------------------------------------
function geomFor(p, w, h) { return computeGeometry(p, w, h); }

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
  const pw = Math.max(1, Math.min(Math.round(cssW * dpr), Math.round(cw))), ph = Math.max(1, Math.min(Math.round(cssH * dpr), Math.round(ch)));
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  $('#viewWrap').style.width = cssW + 'px'; $('#viewWrap').style.height = cssH + 'px';
  drawOverlay();
}

let raf = 0;
function render() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    if (!state.src || !renderer) return;
    const cv = $('#view');
    const { geo, cw } = geomFor(state.params, state.src.w, state.src.h);
    renderer.draw(state.src, state.params, {
      geo, outW: cv.width, outH: cv.height, detailScale: Math.max(1, cw / cv.width),
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
    showStatus('Đang chuẩn bị…');
    renderer.deleteSource(state.src);
    state.img = img;
    state.src = renderer.makeSource(img.preview);
    renderer.setBlur(img.blur.data, img.blur.w, img.blur.h);
    state.params = defaultParams();
    state.history = []; state.future = []; state.thumbs = {}; state.activeLook = null; state.selPoint = -1;
    commit();
    ensureLut();
    $('#empty').hidden = true; $('#viewWrap').hidden = false; $('#hist').hidden = false;
    for (const b of ['#btnExport', '#btnCompare']) $(b).disabled = false;
    layout(); render(); renderPanel();
    showStatus('');
    const [fw, fh] = fullSize(img);
    toast(`${img.isRaw ? 'RAW' : 'Ảnh'} ${fw}×${fh}${img.meta && img.meta.model ? ' · ' + (img.meta.make || '') + ' ' + img.meta.model : ''}`);
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
  tabs.append(el('button', { 'data-tab': id, onclick: () => { state.tab = id; renderPanel(); drawOverlay(); } },
    (() => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = ICONS[id]; return s; })(),
    el('span', {}, name)));
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
  lab.addEventListener('dblclick', reset);
  val.addEventListener('dblclick', reset);
  upd();
  return el('div', { class: 'slider' + (hue ? ' hue' : '') }, lab, val, inp);
}
const pSlider = ([key, label, min, max, step]) =>
  slider(label, min, max, step, () => state.params[key], (v) => { state.params[key] = v; }, { def: defaultParams()[key], hue: /H$/.test(key) && max === 360 });

function title(text, ...extra) { return el('div', { class: 'panel-title' }, el('span', {}, text), el('div', { class: 'row', style: 'margin:0' }, ...extra)); }
function resetKeys(keys) {
  const d = defaultParams();
  return el('button', { class: 'btn small', onclick: () => { for (const k of keys) state.params[k] = clone(d[k]); render(); commit(); renderPanel(); } }, 'Đặt lại');
}

function renderPanel() {
  for (const b of tabs.children) b.classList.toggle('active', b.dataset.tab === state.tab);
  const body = $('#panelBody'); body.innerHTML = '';
  if (!state.img && state.tab !== 'looks') { body.append(el('p', { class: 'hint' }, 'Mở một ảnh để bắt đầu.')); return; }
  const t = state.tab;
  if (PANELS[t]) {
    const P = PANELS[t];
    body.append(title(P.title, resetKeys(P.sliders.map((s) => s[0]))));
    P.sliders.forEach((s) => body.append(pSlider(s)));
    if (t === 'color') body.append(el('p', { class: 'hint' }, 'RAW: cân bằng trắng gốc lấy theo máy; Nhiệt độ/Sắc thái chỉnh thêm từ đó.'));
    return;
  }
  ({ looks: panelLooks, profile: panelProfile, hsl: panelHsl, curve: panelCurve, selective: panelSelective,
    gradient: panelGradient, crop: panelCrop })[t](body);
}

// ---- Looks (presets) ------------------------------------------------------------
function applyPreset(params, id) {
  const keepGeo = ['rotate90', 'flipH', 'straighten', 'aspect', 'zoom', 'panX', 'panY'];
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
  const { geo } = geomFor(base, state.src.w, state.src.h);
  const S = 132, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const savedLut = renderer.lut;
  const one = (id, params) => {
    const p = Object.assign(defaultParams(), clone(params), { rotate90: base.rotate90, flipH: base.flipH, aspect: 1, zoom: 1, panX: 0, panY: 0, straighten: 0, points: [] });
    const lut = p.profile && p.profile !== 'custom' ? (state.lutCache[p.profile] ||= buildProfileLUT(p.profile)) : null;
    renderer.setLut(lut);
    const px = renderer.renderToPixels(state.src, p, { geo, outW: S, outH: S, detailScale: state.src.w / S, isRaw: state.img.isRaw });
    ctx.putImageData(new ImageData(px, S, S), 0, 0);
    state.thumbs[id] = cv.toDataURL('image/jpeg', 0.8);
  };
  one('__none', defaultParams());
  for (const it of items) one(it.id, it.params);
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
      const p = clone(state.params); p.points = [];
      if (p.profile === 'custom') p.profile = '';
      state.userPresets.push({ id: 'u' + Date.now(), name, params: p });
      saveUserPresets(); makeThumbs(); toast(`Đã lưu "${name}"`);
    } }, 'Lưu kiểu hiện tại'),
    el('button', { class: 'btn small', onclick: () => xmpIn.click() }, 'Nhập preset .xmp'),
    xmpIn));
  body.append(el('p', { class: 'hint' }, 'Nhập được preset Lightroom/Camera Raw (.xmp): ánh sáng, HSL, đường cong, chỉnh màu, hiệu chuẩn, gradient.'));
}

// ---- Profile (LUT) ---------------------------------------------------------------
function panelProfile(body) {
  body.append(title('Profile màu (LUT 3D)'));
  const chips = el('div', { class: 'chips' });
  const pick = (id) => { state.params.profile = id; ensureLut(); render(); commit(); renderPanel(); };
  chips.append(el('button', { class: 'chip' + (!state.params.profile ? ' active' : ''), onclick: () => pick('') }, 'Không'));
  for (const [id, P] of Object.entries(PROFILES)) chips.append(el('button', { class: 'chip' + (state.params.profile === id ? ' active' : ''), onclick: () => pick(id) }, P.name.replace(' (phong cách)', '')));
  if (state.customLut) chips.append(el('button', { class: 'chip' + (state.params.profile === 'custom' ? ' active' : ''), onclick: () => pick('custom') }, state.customLut.name));
  body.append(chips);
  body.append(pSlider(['lutAmount', 'Độ đậm profile', 0, 200, 1]));
  const cubeIn = el('input', { type: 'file', accept: '.cube', hidden: true });
  cubeIn.addEventListener('change', async () => {
    const f = cubeIn.files[0]; if (!f) return;
    try {
      state.customLut = parseCube(await f.text(), f.name.replace(/\.cube$/i, ''));
      state.params.profile = 'custom'; renderer.setLut(null); ensureLut(); render(); commit(); renderPanel();
      toast(`Đã nạp LUT ${state.customLut.size}³`);
    } catch (e) { toast(e.message, 5000); }
  });
  body.append(el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => cubeIn.click() }, 'Nhập LUT .cube'), cubeIn));
  body.append(el('p', { class: 'hint' }, 'Các profile "phong cách" là màu mô phỏng do app tạo, không phải dữ liệu chính thức của Fujifilm. Độ đậm >100 sẽ làm màu mạnh hơn.'));
}

// ---- HSL ------------------------------------------------------------------------------
function panelHsl(body) {
  body.append(title('HSL / Màu', el('button', { class: 'btn small', onclick: () => {
    state.params.hslH.fill(0); state.params.hslS.fill(0); state.params.hslL.fill(0); render(); commit(); renderPanel();
  } }, 'Đặt lại')));
  const chips = el('div', { class: 'chips' });
  HSL_BANDS.forEach((b, i) => chips.append(el('button', { class: 'chip' + (state.hslBand === i ? ' active' : ''), onclick: () => { state.hslBand = i; renderPanel(); } },
    el('span', { class: 'dot', style: `background:${b.color}` }), b.name)));
  body.append(chips);
  const i = state.hslBand, p = () => state.params;
  body.append(slider('Sắc (Hue)', -100, 100, 1, () => p().hslH[i], (v) => { p().hslH[i] = v; }));
  body.append(slider('Bão hoà', -100, 100, 1, () => p().hslS[i], (v) => { p().hslS[i] = v; }));
  body.append(slider('Độ sáng', -100, 100, 1, () => p().hslL[i], (v) => { p().hslL[i] = v; }));
  body.append(el('p', { class: 'hint' }, 'Da người nằm ở dải Cam: tăng Độ sáng, giảm nhẹ Bão hoà để da sáng và trong.'));
}

// ---- Curves -----------------------------------------------------------------------
function panelCurve(body) {
  body.append(title('Đường cong', el('button', { class: 'btn small', onclick: () => {
    state.params.curves[state.curveCh] = [[0, 0], [255, 255]]; render(); commit(); renderPanel();
  } }, 'Đặt lại kênh')));
  const chips = el('div', { class: 'chips' });
  [['rgb', 'RGB'], ['r', 'Đỏ'], ['g', 'Lục'], ['b', 'Lam']].forEach(([k, n]) =>
    chips.append(el('button', { class: 'chip' + (state.curveCh === k ? ' active' : ''), onclick: () => { state.curveCh = k; renderPanel(); } }, n)));
  body.append(chips);
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
  body.append(title('Cắt & xoay', resetKeys(['rotate90', 'flipH', 'straighten', 'aspect', 'zoom', 'panX', 'panY'])));
  const chips = el('div', { class: 'chips' });
  ASPECTS.forEach((a) => chips.append(el('button', { class: 'chip' + (Math.abs(p.aspect - a.v) < 1e-6 ? ' active' : ''), onclick: () => { p.aspect = a.v; p.panX = p.panY = 0; layout(); render(); commit(); renderPanel(); } }, a.label)));
  body.append(chips);
  const relayout = () => { layout(); };
  body.append(slider('Làm thẳng', -45, 45, 0.1, () => p.straighten, (v) => { p.straighten = v; relayout(); }));
  body.append(slider('Thu phóng', 1, 4, 0.01, () => p.zoom, (v) => { p.zoom = v; relayout(); }, { def: 1 }));
  body.append(el('div', { class: 'row' },
    el('button', { class: 'btn small', onclick: () => { p.rotate90 = (p.rotate90 + 3) % 4; layout(); render(); commit(); } }, '⟲ Xoay trái'),
    el('button', { class: 'btn small', onclick: () => { p.rotate90 = (p.rotate90 + 1) % 4; layout(); render(); commit(); } }, '⟳ Xoay phải'),
    el('button', { class: 'btn small', onclick: () => { p.flipH = !p.flipH; render(); commit(); } }, '⇋ Lật')));
  body.append(el('p', { class: 'hint' }, 'Kéo ảnh để chọn vùng cắt khi đã thu phóng hoặc đổi tỉ lệ.'));
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
  } else if (state.tab === 'crop') {
    ov.append(el('div', { class: 'cropgrid' }));
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
    } else if (state.tab === 'crop') {
      mode = { t: 'pan', px: state.params.panX, py: state.params.panY };
    } else mode = null;
  });
  ov.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const [x, y, r] = rel(e);
    if (Math.hypot(e.clientX - start.cx, e.clientY - start.cy) > 4) moved = true;
    if (mode.t === 'pt' && moved) {
      const p = state.params.points[mode.i]; p.x = Math.min(1, Math.max(0, x)); p.y = Math.min(1, Math.max(0, y));
      p.col = null; drawOverlay(); render();
    } else if (mode.t === 'grad') {
      state.params.grad[mode.k] = Math.min(1, Math.max(0, y)); drawOverlay(); render();
    } else if (mode.t === 'pan') {
      const p = state.params;
      p.panX = Math.min(1, Math.max(-1, mode.px - (e.clientX - start.cx) / r.width * 2 / Math.max(1, p.zoom)));
      p.panY = Math.min(1, Math.max(-1, mode.py - (e.clientY - start.cy) / r.height * 2 / Math.max(1, p.zoom)));
      render();
    }
  });
  ov.addEventListener('pointerup', (e) => {
    if (!mode) return;
    const [x, y] = rel(e);
    if (mode.t === 'newpt' && !moved && state.params.points.length < 8) {
      // sample colour from the image without the point adjustments
      const saved = state.params.points; state.params.points = [];
      const { geo, cw } = geomFor(state.params, state.src.w, state.src.h);
      const cv = $('#view');
      renderer.draw(state.src, state.params, { geo, outW: cv.width, outH: cv.height, detailScale: Math.max(1, cw / cv.width), isRaw: state.img.isRaw });
      const col = samplePointColor(x, y);
      state.params.points = saved;
      saved.push({ x, y, r: 0.18, bright: 0, contrast: 0, sat: 0, warmth: 0, col });
      state.selPoint = saved.length - 1;
      render(); commit(); renderPanel(); drawOverlay();
    } else if (mode.t === 'pt' && moved) {
      const p = state.params.points[mode.i];
      const saved = state.params.points; state.params.points = [];
      const { geo, cw } = geomFor(state.params, state.src.w, state.src.h);
      const cv = $('#view');
      renderer.draw(state.src, state.params, { geo, outW: cv.width, outH: cv.height, detailScale: Math.max(1, cw / cv.width), isRaw: state.img.isRaw });
      p.col = samplePointColor(p.x, p.y);
      state.params.points = saved; render(); commit();
    } else if (mode.t === 'grad' || mode.t === 'pan') commit();
    mode = null;
  });
})();

// ---- export ----------------------------------------------------------------------------
const dlg = $('#exportDlg');
$('#expQ').addEventListener('input', () => { $('#expQv').textContent = $('#expQ').value; });
$('#btnExport').onclick = () => {
  if (!state.img) return;
  const [fw, fh] = fullSize(state.img);
  const { cw, ch } = geomFor(state.params, fw, fh);
  $('#expInfo').textContent = `Kích thước đầy đủ: ${Math.round(cw)}×${Math.round(ch)} px` + (state.img.isRaw && state.half ? ' (RAW giải mã ½ để chạy nhẹ trên điện thoại)' : '');
  dlg.showModal();
};
dlg.addEventListener('close', () => { if (dlg.returnValue === 'ok') doExport(+$('#expSize').value, +$('#expQ').value / 100); });

async function saveBlob(blob, filename) {
  // 1) Claude artifact host
  try {
    if (window.claude && window.claude.use) {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename, data: blob }); return 'saved'; }
    }
  } catch (e) {
    if (e && e.code === 'declined') return 'declined';
    if (e && e.code && e.code !== 'unavailable' && e.code !== 'not_granted') throw new Error(e.message || e.code);
  }
  // 2) Web Share (iOS: "Lưu hình ảnh")
  const file = new File([blob], filename, { type: 'image/jpeg' });
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
    const { geo, cw, ch } = geomFor(state.params, fw, fh);
    let ow = Math.round(cw), oh = Math.round(ch);
    const lim = Math.min(maxSide || Infinity, renderer.maxTex);
    if (Math.max(ow, oh) > lim) { const s = lim / Math.max(ow, oh); ow = Math.round(ow * s); oh = Math.round(oh * s); }
    // scale point radii etc. are in uv space -> resolution independent
    const px = renderer.renderToPixels(fullSrc, state.params, { geo, outW: ow, outH: oh, detailScale: Math.max(1, cw / ow), isRaw: img.isRaw });
    renderer.deleteSource(fullSrc); fullSrc = null;
    const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
    cv.getContext('2d').putImageData(new ImageData(px, ow, oh), 0, 0);
    const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Không tạo được JPEG'))), 'image/jpeg', quality));
    cv.width = cv.height = 1;
    const base = img.name.replace(/\.[^.]+$/, '');
    showStatus('');
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
