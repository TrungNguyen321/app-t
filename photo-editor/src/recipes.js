// Fujifilm-style film recipes and the .profile file format.
// A recipe is stored in params.recipe and applied as an extra layer on top of the user's
// own sliders (effectiveParams), so slider edits and recipes don't overwrite each other.
import { clone } from './params.js';

export const FILM_SIMS = [
  ['provia', 'Provia / Standard'], ['velvia', 'Velvia / Vivid'], ['astia', 'Astia / Soft'],
  ['classic-chrome', 'Classic Chrome'], ['reala-ace', 'Reala Ace'], ['pro-neg-std', 'PRO Neg. Std'],
  ['classic-neg', 'Classic Neg.'], ['nostalgic-neg', 'Nostalgic Neg.'], ['eterna', 'Eterna'],
  ['acros', 'Acros'], ['fuji-clear-sea', 'Fuji Clear Sea'],
];
export const WB_MODES = [['auto', 'Tự động'], ['awp', 'Auto ưu tiên trắng'], ['daylight', 'Ánh sáng ban ngày'], ['kelvin', 'Nhiệt độ K']];
export const LEVEL3 = [['off', 'Tắt'], ['weak', 'Yếu'], ['strong', 'Mạnh']];

/** Default/blank recipe (camera menu style values). */
export const blankRecipe = () => ({
  name: 'Công thức mới', film: 'provia', dr: 100, grain: 'off', grainSize: 'small', chrome: 'off', chromeBlue: 'off',
  wb: 'auto', kelvin: 5500, wbR: 0, wbB: 0, highlight: 0, shadow: 0, color: 0, sharpness: 0, nr: 0, clarity: 0, exposure: 0,
  source: '',
});

const R = (o) => Object.assign(blankRecipe(), o);
// Recipes transcribed from the cards you sent (FujiXWeekly / FUJISTYLE app / Fujifilm VN).
export const RECIPES = [
  R({ id: 'shining-provia', name: 'Shining Provia', film: 'provia', dr: 400, chrome: 'weak', wb: 'kelvin', kelvin: 5000, wbR: 1, wbB: -3,
    highlight: -1, shadow: 2, color: 2, sharpness: -1, nr: 0, clarity: -1, source: 'Shining Provia' }),
  R({ id: 'classic-chrome-vn', name: 'Classic Chrome (Fujifilm VN)', film: 'classic-chrome', dr: 200, chrome: 'strong', chromeBlue: 'strong',
    wb: 'awp', wbR: 0, wbB: 4, highlight: -2, shadow: -1, color: 2, sharpness: 2, nr: 1, clarity: 0, source: 'Fujifilm Việt Nam' }),
  R({ id: 'chup-dem', name: 'Chụp Đêm', film: 'classic-chrome', dr: 200, wb: 'auto', wbR: 3, wbB: -4,
    highlight: -1, shadow: -2, color: 2, sharpness: 1, source: 'FUJISTYLE · X-S10' }),
  R({ id: 'pastoral-freshness', name: 'Pastoral Freshness', film: 'classic-neg', dr: 400, chrome: 'weak', wb: 'awp', wbR: 0, wbB: 2,
    color: 2, nr: -4, source: 'FUJISTYLE · X-T5' }),
  R({ id: 'romantic-youth', name: 'Romantic Youth', film: 'classic-neg', dr: 400, chrome: 'weak', chromeBlue: 'weak', wb: 'awp', wbR: -2, wbB: 2,
    highlight: -2, shadow: -2, color: 1, source: 'FUJISTYLE · X-S10' }),
  R({ id: 'fuji-latte', name: 'Fuji Latte', film: 'classic-chrome', dr: 100, chrome: 'weak', wb: 'kelvin', kelvin: 5000, wbR: 2, wbB: 1,
    highlight: -1, shadow: -1.5, source: 'FUJISTYLE · X-S20' }),
  R({ id: 'espresso-moments', name: 'Espresso Moments', film: 'classic-neg', dr: 200, chromeBlue: 'weak', wb: 'awp', wbR: -2, wbB: 2,
    highlight: -2, shadow: 1.5, color: 1, source: 'FUJISTYLE · X-T30 II' }),
  R({ id: 'kodak-gold-400', name: 'Kodak Gold Max 400', film: 'reala-ace', dr: 400, grain: 'strong', grainSize: 'large', chrome: 'strong',
    wb: 'kelvin', kelvin: 6700, wbR: 1, wbB: 4, highlight: -1.5, shadow: 1.5, color: -2, sharpness: -3, nr: -4, exposure: 0.17, source: 'FujiXWeekly' }),
  R({ id: 'fujicolor-100-industrial', name: 'Fujicolor 100 Industrial', film: 'reala-ace', dr: 400, grain: 'weak', chrome: 'weak',
    wb: 'auto', wbR: 8, wbB: -8, highlight: 0.5, shadow: 1.5, sharpness: -1, nr: -4, exposure: -1, color: -1, clarity: -2, source: 'FujiXWeekly' }),
  R({ id: 'nostalgia-negative', name: 'Nostalgia Negative', film: 'nostalgic-neg', dr: 400, grain: 'weak', chrome: 'weak',
    wb: 'daylight', wbR: 3, wbB: -3, highlight: -1, shadow: 1, sharpness: -1, nr: -4, exposure: -1, color: 4, clarity: -3, source: 'FujiXWeekly' }),
  R({ id: 'fujifilm-negative', name: 'Fujifilm Negative', film: 'reala-ace', dr: 400, grain: 'weak', chrome: 'strong',
    wb: 'auto', wbR: 0, wbB: -2, highlight: -1, shadow: -0.5, color: 2, sharpness: -1, nr: -4, exposure: 0.67, source: 'FujiXWeekly' }),
  R({ id: 'pro-negative-160c', name: 'PRO Negative 160C', film: 'reala-ace', dr: 200, grain: 'weak', chrome: 'strong',
    wb: 'auto', wbR: 1, wbB: -2, highlight: -1, shadow: -1, color: 4, sharpness: -1, nr: -4, exposure: 0.33, source: 'FujiXWeekly' }),
  R({ id: 'reala-ace-recipe', name: 'Fujifilm Reala Ace', film: 'reala-ace', dr: 400, grain: 'weak', chrome: 'strong',
    wb: 'auto', highlight: -1, color: 0, nr: -4, exposure: 0.67, source: 'FujiXWeekly' }),
];

/**
 * Combine user params with the recipe layer -> what the renderer draws.
 * Exposure compensation from recipes is meant for shooting, so only half is applied to an existing photo.
 */
export function effectiveParams(p) {
  const r = p.recipe;
  if (!r) return p;
  const e = { ...p, paramCurve: { ...p.paramCurve } };
  e.profile = p.profile || r.film;
  e.dr = Math.max(p.dr || 100, r.dr === 'auto' ? 200 : +r.dr);
  // white balance
  let t = 0, g = 0;
  if (r.wb === 'kelvin') t += (r.kelvin - 5500) / 40;
  if (r.wb === 'awp') t -= 3;
  t += (r.wbR - r.wbB) * 2.5; g += (r.wbR + r.wbB) * 1.5;
  e.temp = p.temp + t; e.tint = p.tint + g;
  // tone: Fuji highlight + = brighter/harder highlights, shadow + = darker/harder shadows
  e.paramCurve.highlights += r.highlight * 12; e.paramCurve.lights += r.highlight * 4;
  e.paramCurve.shadows -= r.shadow * 10; e.paramCurve.darks -= r.shadow * 4;
  e.saturation = p.saturation + r.color * 6;
  e.clarity = p.clarity + r.clarity * 8;
  e.sharpen = Math.max(0, p.sharpen + 25 + r.sharpness * 8);
  e.noise = Math.max(p.noise, 10 + r.nr * 2.5);
  e.exposure = p.exposure + r.exposure * 0.5;
  const lv = { off: 0, weak: 0.5, strong: 1 };
  e.chrome = Math.max(p.chrome || 0, lv[r.chrome] || 0);
  e.chromeBlue = Math.max(p.chromeBlue || 0, lv[r.chromeBlue] || 0);
  if (r.grain !== 'off') {
    e.grain = Math.max(p.grain, r.grain === 'strong' ? 28 : 14);
    e.grainSize = r.grainSize === 'large' ? 38 : 16;
  }
  return e;
}

export function recipeSummary(r) {
  const sim = (FILM_SIMS.find((f) => f[0] === r.film) || [0, r.film])[1];
  const wb = r.wb === 'kelvin' ? `${r.kelvin}K` : (WB_MODES.find((w) => w[0] === r.wb) || [0, r.wb])[1];
  const sgn = (v) => (v > 0 ? '+' + v : String(v));
  return `${sim} · DR${r.dr} · ${wb} R${sgn(r.wbR)} B${sgn(r.wbB)} · H${sgn(r.highlight)} S${sgn(r.shadow)} · Màu ${sgn(r.color)}`;
}

// ---- .profile files ---------------------------------------------------------------
// JSON: { format: "fuji-raw-editor-profile", version: 1, name, recipe, params, lut }
const COLOR_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks', 'temp', 'tint', 'texture', 'clarity', 'dehaze',
  'vibrance', 'saturation', 'hslH', 'hslS', 'hslL', 'gradeShadowH', 'gradeShadowS', 'gradeShadowL', 'gradeMidH', 'gradeMidS', 'gradeMidL',
  'gradeHighH', 'gradeHighS', 'gradeHighL', 'gradeBlend', 'gradeBalance', 'calRedH', 'calRedS', 'calGreenH', 'calGreenS', 'calBlueH',
  'calBlueS', 'shadowTint', 'curves', 'paramCurve', 'profile', 'lutAmount', 'sharpen', 'noise', 'vignette', 'vignetteMid', 'grain',
  'grainSize', 'dr', 'chrome', 'chromeBlue', 'skin'];

function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

export function makeProfileFile(name, params, customLut) {
  const out = { format: 'fuji-raw-editor-profile', version: 1, name, created: new Date().toISOString(), recipe: params.recipe ? clone(params.recipe) : null, params: {}, lut: null };
  for (const k of COLOR_KEYS) if (k in params) out.params[k] = clone(params[k]);
  if (params.profile === 'custom' && customLut) {
    const u8 = new Uint8Array(customLut.data.length);
    for (let i = 0; i < u8.length; i++) u8[i] = Math.round(Math.min(1, Math.max(0, customLut.data[i])) * 255);
    out.lut = { name: customLut.name, size: customLut.size, encoding: 'rgb8-base64', data: b64(u8) };
  }
  return JSON.stringify(out, null, 1);
}

/** returns { name, recipe, params (partial), lut|null } */
export function parseProfileFile(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('File .profile không hợp lệ'); }
  if (!j || j.format !== 'fuji-raw-editor-profile') throw new Error('Không phải file .profile của app này');
  let lut = null;
  if (j.lut && j.lut.data) {
    const u8 = unb64(j.lut.data), data = new Float32Array(u8.length);
    for (let i = 0; i < u8.length; i++) data[i] = u8[i] / 255;
    if (data.length !== j.lut.size ** 3 * 3) throw new Error('LUT trong .profile bị hỏng');
    lut = { size: j.lut.size, data, name: j.lut.name || j.name };
  }
  const params = {};
  for (const k of COLOR_KEYS) if (j.params && k in j.params) params[k] = j.params[k];
  return { name: j.name || 'Profile', recipe: j.recipe ? Object.assign(blankRecipe(), j.recipe) : null, params, lut };
}
