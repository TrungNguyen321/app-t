// Built-in looks ("Kiểu") and Lightroom/Camera Raw .xmp preset import.
import { defaultParams, clone } from './params.js';

const merge = (over) => Object.assign(defaultParams(), clone(over));

// Values follow the Fuji Clear Sea Lightroom presets made earlier, mapped to this app.
const CLEAR_SEA = {
  exposure: 0.3, contrast: -15, highlights: -75, shadows: 45, whites: 8, blacks: -4,
  texture: -8, clarity: -6, dehaze: 8, vibrance: 12, saturation: -6,
  hslH: [4, -5, -15, 22, -10, -12, 10, 5],
  hslS: [-6, -12, -22, -28, 6, -4, -20, -15],
  hslL: [4, 16, 8, 6, 8, 4, 0, 4],
  gradeShadowH: 200, gradeShadowS: 8, gradeHighH: 45, gradeHighS: 3, gradeMidH: 30, gradeMidS: 3,
  gradeBlend: 60, gradeBalance: 15,
  shadowTint: -4, calRedH: 8, calRedS: 6, calGreenH: -12, calGreenS: -8, calBlueH: -18, calBlueS: 18,
  curves: { rgb: [[0, 10], [40, 44], [96, 100], [160, 166], [214, 219], [255, 253]], r: [[0, 2], [128, 129], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 6], [128, 129], [255, 255]] },
  paramCurve: { shadows: 6, darks: 6, lights: 8, highlights: -12 },
  sharpen: 40, noise: 8, grain: 10, grainSize: 18,
  grad: { on: true, y0: 0.0, y1: 0.55, exposure: -0.1, highlights: -25, temp: -5, saturation: 5 },
};

export const BUILTIN_PRESETS = [
  { id: 'clear-sea', name: 'Fuji Clear Sea', params: merge(CLEAR_SEA) },
  { id: 'clear-sea-skin', name: 'Clear Sea · Da sáng', params: merge({ ...CLEAR_SEA, exposure: 0.45, highlights: -80, shadows: 50, texture: -14, clarity: -10,
    hslH: [4, -7, -15, 22, -10, -12, 10, 5], hslS: [-6, -16, -22, -28, 6, -4, -20, -15], hslL: [8, 24, 8, 6, 8, 4, 0, 4] }) },
  { id: 'clear-sea-golden', name: 'Clear Sea · Hoàng hôn', params: merge({ ...CLEAR_SEA, highlights: -85, whites: 0, shadows: 50, vibrance: 8,
    gradeHighH: 42, gradeHighS: 6, gradeShadowS: 10, gradeMidS: 5 }) },
  { id: 'clear-sea-airy', name: 'Clear Sea · Pastel', params: merge({ ...CLEAR_SEA, exposure: 0.45, contrast: -22, highlights: -70, shadows: 50, blacks: 4,
    saturation: -12, vibrance: 6, dehaze: -4, hslS: [-6, -12, -22, -28, 0, -4, -20, -15], hslL: [4, 16, 8, 6, 14, 10, 0, 4] }) },
  { id: 'clear-sea-profile', name: 'Profile Clear Sea + sáng', params: merge({ exposure: 0.3, contrast: -15, highlights: -75, shadows: 45, whites: 8, blacks: -4,
    texture: -8, clarity: -6, dehaze: 8, sharpen: 40, noise: 8, grain: 10, grainSize: 18, profile: 'fuji-clear-sea',
    paramCurve: { shadows: 6, darks: 6, lights: 8, highlights: -12 },
    grad: { on: true, y0: 0.0, y1: 0.55, exposure: -0.1, highlights: -25, temp: -5, saturation: 5 } }) },
  // Reala Ace recipe (FujiXWeekly-style settings): DR400, Highlight -1, Shadow 0, Color 0, grain weak/small, Color Chrome strong
  { id: 'reala-ace', name: 'Reala Ace', params: merge({ profile: 'reala-ace', exposure: 0.33, highlights: -45, shadows: 15, whites: -5,
    vibrance: 8, dehaze: 4, grain: 12, grainSize: 15, sharpen: 25,
    hslS: [6, 0, 4, 4, 10, 10, 0, 0], hslL: [-4, 4, -2, -4, -6, -8, 0, 0] }) },
  { id: 'reala-ace-sea', name: 'Reala Ace · Biển xanh', params: merge({ profile: 'reala-ace', exposure: 0.4, highlights: -55, shadows: 20, whites: -5, temp: -6,
    vibrance: 10, dehaze: 6, grain: 12, grainSize: 15, sharpen: 25,
    hslH: [0, -3, -6, 12, 8, -6, 0, 0], hslS: [0, -8, -25, -15, 20, 15, 0, 0], hslL: [0, 12, 4, 0, 4, -4, 0, 0],
    gradeHighH: 195, gradeHighS: 6, gradeShadowH: 205, gradeShadowS: 6 }) },
  { id: 'classic-chrome', name: 'Classic Chrome', params: merge({ profile: 'classic-chrome', highlights: -20, shadows: -5, grain: 18, grainSize: 25, sharpen: 25 }) },
  { id: 'classic-neg', name: 'Classic Neg', params: merge({ profile: 'classic-neg', highlights: -25, shadows: 5, grain: 20, grainSize: 30, sharpen: 25 }) },
  { id: 'provia', name: 'Provia', params: merge({ profile: 'provia', sharpen: 25 }) },
  { id: 'velvia', name: 'Velvia', params: merge({ profile: 'velvia', highlights: -15, sharpen: 30 }) },
  { id: 'astia', name: 'Astia', params: merge({ profile: 'astia', highlights: -20, shadows: 10, sharpen: 20 }) },
  { id: 'eterna', name: 'Eterna', params: merge({ profile: 'eterna', highlights: -30, shadows: 20, grain: 10 }) },
  { id: 'acros', name: 'Acros B&W', params: merge({ profile: 'acros', contrast: 10, grain: 30, grainSize: 30, sharpen: 30 }) },
];

// ---- XMP import --------------------------------------------------------------
const num = (v) => (v == null ? undefined : parseFloat(String(v).replace('+', '')));
const BAND_XMP = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];

/** Parse a Lightroom / Camera Raw .xmp preset into app params. Returns {name, params, notes[]}. */
export function parseXmp(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('File .xmp không đọc được');
  const desc = [...doc.getElementsByTagName('*')].find((e) => e.localName === 'Description' &&
    [...e.attributes].some((a) => a.name.startsWith('crs:')));
  if (!desc) throw new Error('Không thấy thông số Camera Raw (crs:) trong file');
  const a = {};
  for (const at of desc.attributes) if (at.name.startsWith('crs:')) a[at.name.slice(4)] = at.value;
  // child elements (Name, tone curves)
  const child = (local) => [...desc.children].find((e) => e.localName === local);
  const seq = (local) => {
    const el = child(local); if (!el) return null;
    return [...el.getElementsByTagName('*')].filter((e) => e.localName === 'li').map((li) => li.textContent.split(',').map((s) => parseFloat(s)));
  };
  const nameEl = child('Name');
  const name = (nameEl && nameEl.textContent.trim()) || 'Preset XMP';

  const p = defaultParams(), notes = [];
  const set = (key, attr, scale = 1) => { const v = num(a[attr]); if (v !== undefined && !Number.isNaN(v)) p[key] = v * scale; };
  set('exposure', 'Exposure2012'); set('contrast', 'Contrast2012'); set('highlights', 'Highlights2012');
  set('shadows', 'Shadows2012'); set('whites', 'Whites2012'); set('blacks', 'Blacks2012');
  set('texture', 'Texture'); set('clarity', 'Clarity2012'); set('dehaze', 'Dehaze');
  set('vibrance', 'Vibrance'); set('saturation', 'Saturation');
  if (a.IncrementalTemperature) set('temp', 'IncrementalTemperature', 1);
  if (a.IncrementalTint) set('tint', 'IncrementalTint', 1);
  if (a.WhiteBalance && a.WhiteBalance !== 'As Shot' && a.Temperature) notes.push('Cân bằng trắng tuyệt đối (Kelvin) không áp dụng — chỉnh bằng thanh Nhiệt độ.');
  BAND_XMP.forEach((b, i) => {
    const h = num(a['HueAdjustment' + b]), s = num(a['SaturationAdjustment' + b]), l = num(a['LuminanceAdjustment' + b]);
    if (h !== undefined) p.hslH[i] = h; if (s !== undefined) p.hslS[i] = s; if (l !== undefined) p.hslL[i] = l;
  });
  set('gradeShadowH', 'SplitToningShadowHue'); set('gradeShadowS', 'SplitToningShadowSaturation');
  set('gradeHighH', 'SplitToningHighlightHue'); set('gradeHighS', 'SplitToningHighlightSaturation');
  set('gradeBalance', 'SplitToningBalance');
  set('gradeMidH', 'ColorGradeMidtoneHue'); set('gradeMidS', 'ColorGradeMidtoneSat');
  set('gradeShadowL', 'ColorGradeShadowLum'); set('gradeMidL', 'ColorGradeMidtoneLum'); set('gradeHighL', 'ColorGradeHighlightLum');
  set('gradeBlend', 'ColorGradeBlending');
  set('shadowTint', 'ShadowTint');
  set('calRedH', 'RedHue'); set('calRedS', 'RedSaturation'); set('calGreenH', 'GreenHue');
  set('calGreenS', 'GreenSaturation'); set('calBlueH', 'BlueHue'); set('calBlueS', 'BlueSaturation');
  set('sharpen', 'Sharpness'); set('noise', 'LuminanceSmoothing');
  set('vignette', 'PostCropVignetteAmount'); set('vignetteMid', 'PostCropVignetteMidpoint');
  set('grain', 'GrainAmount'); set('grainSize', 'GrainSize');
  const pc = p.paramCurve;
  ['Shadows', 'Darks', 'Lights', 'Highlights'].forEach((z) => {
    const v = num(a['Parametric' + z]); if (v !== undefined) pc[z.toLowerCase()] = v;
  });
  const curveMap = { rgb: 'ToneCurvePV2012', r: 'ToneCurvePV2012Red', g: 'ToneCurvePV2012Green', b: 'ToneCurvePV2012Blue' };
  for (const [k, tag] of Object.entries(curveMap)) {
    const s = seq(tag);
    if (s && s.length >= 2 && s.every((pt) => pt.length === 2 && pt.every(Number.isFinite))) p.curves[k] = s;
  }
  // graduated filter (legacy GradientBasedCorrections) -> sky gradient
  const grads = [...desc.getElementsByTagName('*')].filter((e) => e.localName === 'Description' && e.getAttribute('crs:What') === 'Correction');
  if (grads.length) {
    const g = grads[0];
    const mask = [...g.getElementsByTagName('*')].find((e) => e.getAttribute && e.getAttribute('crs:What') === 'Mask/Gradient');
    if (mask) {
      p.grad = {
        on: true,
        y0: num(mask.getAttribute('crs:FullY')) ?? 0, y1: num(mask.getAttribute('crs:ZeroY')) ?? 0.5,
        exposure: num(g.getAttribute('crs:LocalExposure2012')) || 0,
        highlights: (num(g.getAttribute('crs:LocalHighlights2012')) || 0) * 100,
        temp: (num(g.getAttribute('crs:LocalTemperature')) || 0) * 100,
        saturation: (num(g.getAttribute('crs:LocalSaturation')) || 0) * 100,
      };
    }
  }
  if (a.CameraProfile && a.CameraProfile !== 'Adobe Standard') notes.push(`Profile "${a.CameraProfile}" không có trong app — đã dùng màu mặc định.`);
  if (a.RGBTable || a.LookTable) notes.push('Profile dạng LUT nhúng trong .xmp chưa hỗ trợ — hãy nhập file .cube.');
  return { name, params: p, notes };
}
