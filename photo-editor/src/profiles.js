// Built-in colour profiles, generated as 33^3 LUTs at runtime.
// These are our own film-style looks (approximations), not Fujifilm's official data.

const N = 33;

function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-8) {
    if (mx === r) h = (((g - b) / d) % 6 + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, mx > 0 ? d / mx : 0, mx];
}
function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360 / 60;
  const i = Math.floor(h) % 6, f = h - Math.floor(h);
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
}
const interp = (x, xs, ys) => {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) {
    const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
  }
  return ys[ys.length - 1];
};
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// tone: [xs, ys] in 0..255; bands: [centre, width, hueShift, satMult, valMult]
export const PROFILES = {
  'fuji-clear-sea': {
    name: 'Fuji Clear Sea',
    tone: [[0, 40, 96, 160, 214, 255], [10, 44, 100, 166, 219, 253]],
    rLift: 2, bLift: 6,
    bands: [[5, 35, 3, 0.94, 1.02], [28, 30, -4, 0.86, 1.08], [55, 30, -10, 0.78, 1.03], [110, 45, 14, 0.72, 1.02],
      [180, 35, -8, 1.1, 1.05], [220, 35, -10, 0.98, 1.03], [270, 40, 8, 0.8, 1], [320, 40, 4, 0.85, 1.02]],
    vib: 0.12, sat: -0.05, sh: [-0.012, 0.004, 0.012], hi: [0.006, 0.003, -0.004],
  },
  'reala-ace': {
    name: 'Reala Ace (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [4, 36, 94, 166, 222, 254]],
    rLift: 0, bLift: 2,
    bands: [[5, 35, 2, 1.02, 1], [28, 30, -2, 0.96, 1.04], [55, 30, -5, 0.9, 1.02], [110, 45, 6, 0.9, 1],
      [180, 35, -4, 1.06, 1.02], [220, 35, -6, 1.06, 1], [270, 40, 0, 0.95, 1], [320, 40, 0, 0.95, 1]],
    vib: 0.06, sat: 0.02, sh: [-0.004, 0.002, 0.006], hi: [0.002, 0.002, 0.0],
  },
  'classic-chrome': {
    name: 'Classic Chrome (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [6, 32, 90, 168, 220, 250]],
    rLift: 3, bLift: 0,
    bands: [[5, 35, 4, 0.85, 0.98], [28, 30, -2, 0.88, 1.02], [55, 30, -8, 0.72, 1], [110, 45, -10, 0.7, 0.97],
      [180, 35, 6, 0.8, 0.98], [220, 35, -12, 0.75, 0.96], [270, 40, 0, 0.7, 1], [320, 40, 0, 0.75, 1]],
    vib: 0, sat: -0.16, sh: [0.0, 0.004, 0.008], hi: [0.01, 0.005, -0.008],
  },
  'classic-neg': {
    name: 'Classic Neg (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [8, 32, 86, 170, 228, 250]],
    rLift: 0, bLift: 6,
    bands: [[5, 35, -4, 1.0, 0.96], [28, 30, -6, 0.9, 1.0], [55, 30, -12, 0.78, 1.0], [110, 45, 22, 0.72, 0.98],
      [180, 35, -6, 0.95, 0.98], [220, 35, -15, 0.9, 0.97], [270, 40, 10, 0.8, 1], [320, 40, 6, 0.85, 1]],
    vib: 0, sat: -0.04, sh: [-0.02, 0.008, 0.016], hi: [0.012, -0.002, 0.004],
  },
  provia: {
    name: 'Provia (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [2, 38, 95, 165, 220, 254]],
    rLift: 0, bLift: 0,
    bands: [[5, 35, 0, 1.05, 1], [28, 30, -2, 1.0, 1.02], [55, 30, 0, 1.0, 1], [110, 45, 4, 1.02, 1],
      [180, 35, 0, 1.05, 1], [220, 35, -4, 1.06, 1], [270, 40, 0, 1, 1], [320, 40, 0, 1, 1]],
    vib: 0.08, sat: 0.04, sh: [0, 0, 0], hi: [0, 0, 0],
  },
  velvia: {
    name: 'Velvia (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [0, 30, 88, 170, 226, 255]],
    rLift: 0, bLift: 0,
    bands: [[5, 35, -2, 1.25, 0.97], [28, 30, -3, 1.08, 1.0], [55, 30, -4, 1.2, 1], [110, 45, 6, 1.3, 0.95],
      [180, 35, 0, 1.3, 0.97], [220, 35, -6, 1.3, 0.92], [270, 40, 4, 1.2, 0.97], [320, 40, 2, 1.2, 1]],
    vib: 0.15, sat: 0.12, sh: [0, 0, 0.004], hi: [0, 0, 0],
  },
  astia: {
    name: 'Astia (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [5, 40, 98, 164, 216, 252]],
    rLift: 2, bLift: 2,
    bands: [[5, 35, 2, 0.95, 1.02], [28, 30, -3, 0.9, 1.06], [55, 30, -4, 0.92, 1.02], [110, 45, 6, 1.05, 1],
      [180, 35, -2, 1.1, 1.02], [220, 35, -6, 1.1, 1.0], [270, 40, 0, 0.95, 1], [320, 40, 0, 0.95, 1]],
    vib: 0.08, sat: 0, sh: [0, 0.002, 0.006], hi: [0.004, 0.002, 0],
  },
  eterna: {
    name: 'Eterna (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [14, 46, 98, 158, 206, 242]],
    rLift: 0, bLift: 4,
    bands: [[5, 35, 2, 0.8, 1], [28, 30, -2, 0.82, 1.02], [55, 30, -8, 0.7, 1], [110, 45, 12, 0.68, 0.98],
      [180, 35, 6, 0.85, 1], [220, 35, -8, 0.8, 1], [270, 40, 0, 0.7, 1], [320, 40, 0, 0.7, 1]],
    vib: 0, sat: -0.2, sh: [-0.014, 0.006, 0.014], hi: [0.008, 0.004, -0.004],
  },
  'nostalgic-neg': {
    name: 'Nostalgic Neg (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [8, 42, 96, 164, 218, 250]],
    rLift: 4, bLift: 0,
    bands: [[5, 35, 2, 1.08, 0.98], [28, 30, 2, 1.04, 1.02], [55, 30, -6, 1.0, 1.0], [110, 45, -6, 0.8, 0.98],
      [180, 35, 4, 0.85, 1], [220, 35, -6, 0.85, 0.98], [270, 40, 0, 0.8, 1], [320, 40, 0, 0.85, 1]],
    vib: 0.04, sat: 0, sh: [0.004, 0.0, -0.004], hi: [0.022, 0.01, -0.016],
  },
  'pro-neg-std': {
    name: 'PRO Neg. Std (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [6, 42, 98, 162, 214, 250]],
    rLift: 0, bLift: 2,
    bands: [[5, 35, 0, 0.88, 1.02], [28, 30, -2, 0.88, 1.04], [55, 30, -4, 0.85, 1.02], [110, 45, 4, 0.85, 1],
      [180, 35, 0, 0.9, 1], [220, 35, -4, 0.9, 1], [270, 40, 0, 0.85, 1], [320, 40, 0, 0.85, 1]],
    vib: 0, sat: -0.08, sh: [0, 0.002, 0.004], hi: [0, 0, 0],
  },
  acros: {
    name: 'Acros đen trắng (phong cách)',
    tone: [[0, 40, 96, 160, 214, 255], [4, 30, 88, 170, 226, 252]],
    mono: [0.42, 0.5, 0.08],
  },
};

export function buildProfileLUT(id) {
  const P = PROFILES[id];
  if (!P) return null;
  const data = new Float32Array(N * N * N * 3);
  const xs = P.tone[0].map((v) => v / 255), ys = P.tone[1].map((v) => v / 255);
  let o = 0;
  for (let bi = 0; bi < N; bi++) for (let gi = 0; gi < N; gi++) for (let ri = 0; ri < N; ri++) {
    let r = ri / (N - 1), g = gi / (N - 1), b = bi / (N - 1);
    if (P.mono) {
      let l = r * P.mono[0] + g * P.mono[1] + b * P.mono[2];
      l = interp(l, xs, ys);
      data[o++] = l; data[o++] = l; data[o++] = l * 0.995;
      continue;
    }
    r = interp(r, xs, ys); g = interp(g, xs, ys); b = interp(b, xs, ys);
    r = interp(r, [0, 0.5, 1], [P.rLift / 255, 0.505, 1]);
    b = interp(b, [0, 0.5, 1], [P.bLift / 255, 0.505, 1]);
    let [h, s, v] = rgb2hsv(r, g, b);
    const sw = Math.min(1, s * 3);
    let dh = 0, sm = 1, vm = 1;
    for (const [ctr, wd, hh, ss, vv] of P.bands) {
      const dist = Math.abs(((h - ctr + 540) % 360) - 180);
      const w = (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, dist / wd))) * sw;
      dh += w * hh; sm *= 1 + w * (ss - 1); vm *= 1 + w * (vv - 1);
    }
    [r, g, b] = hsv2rgb(h + dh, Math.min(1, s * sm), Math.min(1, v * vm));
    let l = luma(r, g, b);
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const k = 1 + P.sat + P.vib * (1 - Math.min(1, sat * 2));
    r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
    l = luma(r, g, b);
    const wsh = Math.pow(Math.max(0, 1 - l / 0.55), 1.3), whi = Math.pow(Math.max(0, (l - 0.6) / 0.4), 1.3);
    r += wsh * P.sh[0] + whi * P.hi[0]; g += wsh * P.sh[1] + whi * P.hi[1]; b += wsh * P.sh[2] + whi * P.hi[2];
    data[o++] = Math.min(1, Math.max(0, r)); data[o++] = Math.min(1, Math.max(0, g)); data[o++] = Math.min(1, Math.max(0, b));
  }
  return { size: N, data, name: P.name };
}

/** Parse an Adobe/Resolve .cube file (3D only). */
export function parseCube(text, name = 'LUT') {
  let size = 0; const vals = [];
  let dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const up = line.toUpperCase();
    if (up.startsWith('LUT_3D_SIZE')) { size = parseInt(line.split(/\s+/)[1], 10); continue; }
    if (up.startsWith('DOMAIN_MIN')) { dmin = line.split(/\s+/).slice(1).map(Number); continue; }
    if (up.startsWith('DOMAIN_MAX')) { dmax = line.split(/\s+/).slice(1).map(Number); continue; }
    if (/^[A-Z_]/.test(up)) continue;
    const p = line.split(/\s+/).map(Number);
    if (p.length >= 3 && p.every((x) => !Number.isNaN(x))) vals.push(p[0], p[1], p[2]);
  }
  if (!size) throw new Error('File .cube không có LUT_3D_SIZE (chỉ hỗ trợ LUT 3D)');
  if (vals.length !== size * size * size * 3) throw new Error('File .cube bị thiếu dữ liệu');
  const data = new Float32Array(vals.length);
  for (let i = 0; i < vals.length; i++) {
    const c = i % 3;
    data[i] = (vals[i] - dmin[c]) / (dmax[c] - dmin[c] || 1);
  }
  return { size, data, name };
}
