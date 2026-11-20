// Crop / rotate / straighten / flip -> affine map from output uv to source uv.

export const ASPECTS = [
  { label: 'Tự do', v: -1 }, { label: 'Gốc', v: 0 }, { label: '1:1', v: 1 }, { label: '4:5', v: 4 / 5 }, { label: '3:4', v: 3 / 4 },
  { label: '2:3', v: 2 / 3 }, { label: '9:16', v: 9 / 16 }, { label: '3:2', v: 3 / 2 }, { label: '16:9', v: 16 / 9 },
];

/**
 * @param opts.ignoreRect  show the whole (rotated/straightened) frame while the free crop is edited
 * @returns {{geo: Float32Array, cw: number, ch: number}} cw/ch = crop size in source pixels
 */
export function computeGeometry(p, srcW, srcH, opts = {}) {
  const k = ((p.rotate90 % 4) + 4) % 4;
  const W = k % 2 ? srcH : srcW, H = k % 2 ? srcW : srcH;
  const A = p.aspect > 0 ? p.aspect : W / H;          // 0 = original, -1 = free (rect below)
  let cw, ch;
  if (A > W / H) { cw = W; ch = W / A; } else { ch = H; cw = H * A; }
  const th = (p.straighten * Math.PI) / 180, c = Math.cos(th), s = Math.abs(Math.sin(th)), sn = Math.sin(th);
  const f = Math.min(1, W / (cw * c + ch * s), H / (cw * s + ch * c));
  cw *= f / p.zoom; ch *= f / p.zoom;
  const bbW = cw * c + ch * s, bbH = cw * s + ch * c;
  let cx = W / 2 + p.panX * Math.max(0, (W - bbW) / 2);
  let cy = H / 2 + p.panY * Math.max(0, (H - bbH) / 2);
  // free crop: a sub-rectangle (0..1) of that window
  const r = p.aspect === -1 && p.cropRect && !opts.ignoreRect ? p.cropRect : null;
  if (r) {
    const mx = (r.x0 + r.x1) / 2 - 0.5, my = (r.y0 + r.y1) / 2 - 0.5;
    cx += c * mx * cw - sn * my * ch;
    cy += sn * mx * cw + c * my * ch;
    cw *= Math.max(0.02, r.x1 - r.x0); ch *= Math.max(0.02, r.y1 - r.y0);
  }
  // 'Mở rộng khung': grow the window beyond the photo; the shader fills the new border
  const ex = 1 + 2 * (p.expand || 0) / 100;
  cw *= ex; ch *= ex;

  const map = (u, v) => {
    const dx = (u - 0.5) * cw, dy = (v - 0.5) * ch;
    let ox = (cx + c * dx - sn * dy) / W, oy = (cy + sn * dx + c * dy) / H;
    if (p.flipH) ox = 1 - ox;
    // undo the 90° rotations (oriented -> source)
    if (k === 1) return [oy, 1 - ox];
    if (k === 2) return [1 - ox, 1 - oy];
    if (k === 3) return [1 - oy, ox];
    return [ox, oy];
  };
  const o = map(0, 0), a = map(1, 0), b = map(0, 1);
  const geo = new Float32Array([a[0] - o[0], a[1] - o[1], 0, b[0] - o[0], b[1] - o[1], 0, o[0], o[1], 1]);
  return { geo, cw, ch };
}

/** Height-stretch helpers (body.height > 0 stretches the band y0..y1 vertically). */
export function stretchFactor(p) {
  const b = p.body; return b.height > 0 && b.y1 > b.y0 ? 1 + b.height / 100 * 0.35 : 1;
}
export function outHeightScale(p) {
  const k = stretchFactor(p); return 1 + (p.body.y1 - p.body.y0) * (k - 1);
}
/** crop v -> display v */
export function cropToDisplayV(p, v) {
  const k = stretchFactor(p), { y0, y1 } = p.body, H = outHeightScale(p);
  if (k === 1) return v;
  const t = v < y0 ? v : v < y1 ? y0 + (v - y0) * k : v + (y1 - y0) * (k - 1);
  return t / H;
}
/** display v -> crop v */
export function displayToCropV(p, v) {
  const k = stretchFactor(p), { y0, y1 } = p.body, H = outHeightScale(p), L = y1 - y0;
  if (k === 1) return v;
  const t = v * H;
  return t < y0 ? t : t < y0 + L * k ? y0 + (t - y0) / k : t - L * (k - 1);
}
