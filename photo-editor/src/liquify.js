// Liquify: compose "push" strokes into an inverse displacement field over crop uv.
export const DISP_N = 256;

function sample(field, n, u, v) {
  const x = Math.min(n - 1, Math.max(0, u * n - 0.5)), y = Math.min(n - 1, Math.max(0, v * n - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(n - 1, x0 + 1), y1 = Math.min(n - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * n + x0) * 2, i10 = (y0 * n + x1) * 2, i01 = (y1 * n + x0) * 2, i11 = (y1 * n + x1) * 2;
  const r = [0, 1].map((c) => (field[i00 + c] * (1 - fx) + field[i10 + c] * fx) * (1 - fy) + (field[i01 + c] * (1 - fx) + field[i11 + c] * fx) * fy);
  return r;
}

/** Apply one push {ax, ay, bx, by, r} (uv coords, r in crop-height units) in place. */
export function applyPush(field, n, ps, aspect) {
  const vx = ps.bx - ps.ax, vy = ps.by - ps.ay, r2 = ps.r * ps.r;
  const out = new Float32Array(field.length);
  const reach = ps.r * 2.2;
  const u0 = Math.max(0, Math.floor((ps.bx - reach / aspect) * n)), u1 = Math.min(n - 1, Math.ceil((ps.bx + reach / aspect) * n));
  const v0 = Math.max(0, Math.floor((ps.by - reach) * n)), v1 = Math.min(n - 1, Math.ceil((ps.by + reach) * n));
  out.set(field);
  for (let j = v0; j <= v1; j++) {
    for (let i = u0; i <= u1; i++) {
      const u = (i + 0.5) / n, v = (j + 0.5) / n;
      const dx = (u - ps.bx) * aspect, dy = v - ps.by;
      const w = Math.exp(-(dx * dx + dy * dy) / r2);
      if (w < 1e-3) continue;
      const pu = u - vx * w, pv = v - vy * w;          // pull content from behind the stroke
      const [ou, ov] = sample(field, n, pu, pv);
      const k = (j * n + i) * 2;
      out[k] = pu - u + ou; out[k + 1] = pv - v + ov;
    }
  }
  field.set(out);
}

/** Incremental cache keyed by the pushes array contents. */
export class DispCache {
  constructor() { this.field = null; this.list = []; this.aspect = 1; }
  update(pushes, aspect) {
    const n = DISP_N;
    if (!pushes.length) { this.field = null; this.list = []; return null; }
    const prefixOk = this.field && this.aspect === aspect && this.list.length <= pushes.length &&
      this.list.every((p, i) => p === pushes[i] || JSON.stringify(p) === JSON.stringify(pushes[i]));
    if (!prefixOk) { this.field = new Float32Array(n * n * 2); this.list = []; this.aspect = aspect; }
    for (let i = this.list.length; i < pushes.length; i++) applyPush(this.field, n, pushes[i], aspect);
    this.list = pushes.slice();
    return this.field;
  }
}
