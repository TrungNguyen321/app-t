// Crop / rotate / straighten / flip -> affine map from output uv to source uv.

export const ASPECTS = [
  { label: 'Gốc', v: 0 }, { label: '1:1', v: 1 }, { label: '4:5', v: 4 / 5 }, { label: '3:4', v: 3 / 4 },
  { label: '2:3', v: 2 / 3 }, { label: '9:16', v: 9 / 16 }, { label: '3:2', v: 3 / 2 }, { label: '16:9', v: 16 / 9 },
];

/**
 * @returns {{geo: Float32Array, cw: number, ch: number}} cw/ch = crop size in source pixels
 */
export function computeGeometry(p, srcW, srcH) {
  const k = ((p.rotate90 % 4) + 4) % 4;
  const W = k % 2 ? srcH : srcW, H = k % 2 ? srcW : srcH;
  const A = p.aspect || W / H;
  let cw, ch;
  if (A > W / H) { cw = W; ch = W / A; } else { ch = H; cw = H * A; }
  const th = (p.straighten * Math.PI) / 180, c = Math.cos(th), s = Math.abs(Math.sin(th));
  const f = Math.min(1, W / (cw * c + ch * s), H / (cw * s + ch * c));
  cw *= f / p.zoom; ch *= f / p.zoom;
  const bbW = cw * c + ch * s, bbH = cw * s + ch * c;
  const cx = W / 2 + p.panX * Math.max(0, (W - bbW) / 2);
  const cy = H / 2 + p.panY * Math.max(0, (H - bbH) / 2);
  const sn = Math.sin(th);

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
