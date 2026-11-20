// Tone curves: monotone cubic (Fritsch–Carlson) through control points, plus the
// Lightroom-style parametric curve (shadows / darks / lights / highlights).

export function evalCurve(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  const out = new Float32Array(256);
  if (n < 2) { for (let i = 0; i < 256; i++) out[i] = i; return out; }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  for (let x = 0; x < 256; x++) {
    let y;
    if (x <= xs[0]) y = ys[0];
    else if (x >= xs[n - 1]) y = ys[n - 1];
    else {
      let i = 0; while (x > xs[i + 1]) i++;
      const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
      const t2 = t * t, t3 = t2 * t;
      y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
    }
    out[x] = Math.min(255, Math.max(0, y));
  }
  return out;
}

// parametric regions: smooth bumps centred on the four zones
function parametric(pc) {
  const out = new Float32Array(256);
  const zones = [[0.125, pc.shadows], [0.375, pc.darks], [0.625, pc.lights], [0.875, pc.highlights]];
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let dy = 0;
    for (const [c, v] of zones) {
      const w = Math.max(0, 1 - Math.abs(x - c) / 0.25);
      dy += (v / 100) * 0.12 * w * w * (3 - 2 * w);
    }
    dy *= Math.sin(Math.PI * x) * 0.5 + 0.5 * Math.min(1, x * 8) * Math.min(1, (1 - x) * 8);
    out[i] = Math.min(255, Math.max(0, (x + dy) * 255));
  }
  return out;
}

export function buildCurveLUT(p) {
  const master = evalCurve(p.curves.rgb);
  const pc = p.paramCurve || { shadows: 0, darks: 0, lights: 0, highlights: 0 };
  const par = parametric(pc);
  const ch = [evalCurve(p.curves.r), evalCurve(p.curves.g), evalCurve(p.curves.b)];
  const lerp = (arr, v) => {
    const i = Math.min(254, Math.floor(v)), f = v - i;
    return arr[i] * (1 - f) + arr[i + 1] * f;
  };
  const data = new Uint8Array(256 * 4);
  for (let x = 0; x < 256; x++) {
    const base = lerp(master, lerp(par, x));
    for (let c = 0; c < 3; c++) data[x * 4 + c] = Math.round(lerp(ch[c], base));
    data[x * 4 + 3] = 255;
  }
  return data;
}
