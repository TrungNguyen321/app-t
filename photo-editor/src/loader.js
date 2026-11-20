// Load RAW (via LibRaw WASM) or normal images, and build preview + blur data.
import LibRaw from 'libraw-wasm';

export const RAW_EXT = ['arw', 'srf', 'sr2', 'cr2', 'cr3', 'crw', 'nef', 'nrw', 'dng', 'raf', 'orf', 'rw2', 'rwl', 'pef',
  'srw', 'x3f', '3fr', 'fff', 'iiq', 'erf', 'mef', 'mos', 'mrw', 'kdc', 'dcr', 'raw'];

export const isRawName = (name) => RAW_EXT.includes((name.split('.').pop() || '').toLowerCase());

const PREVIEW_MAX = 2048;

/** Downscale 16-bit RGB with a box filter. */
function downscaleU16(src, w, h, maxSide) {
  const s = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
  if (s === 1) return { data: src, w, h };
  const nw = Math.floor(w / s), nh = Math.floor(h / s);
  const out = new Uint16Array(nw * nh * 3);
  const area = s * s;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < s; dy++) {
        let i = ((y * s + dy) * w + x * s) * 3;
        for (let dx = 0; dx < s; dx++, i += 3) { r += src[i]; g += src[i + 1]; b += src[i + 2]; }
      }
      const o = (y * nw + x) * 3;
      out[o] = r / area; out[o + 1] = g / area; out[o + 2] = b / area;
    }
  }
  return { data: out, w: nw, h: nh };
}

/** Blurred linear luminance map (~160 px long side). get(x,y) returns linear luminance 0..1 */
function blurMap(w, h, get) {
  const long = 160, sc = Math.max(w, h) / long;
  const bw = Math.max(4, Math.round(w / sc)), bh = Math.max(4, Math.round(h / sc));
  let m = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    // average a few samples in the cell
    let acc = 0, n = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const sx = Math.min(w - 1, Math.floor((x + (i + 0.5) / 3) * w / bw));
      const sy = Math.min(h - 1, Math.floor((y + (j + 0.5) / 3) * h / bh));
      acc += get(sx, sy); n++;
    }
    m[y * bw + x] = acc / n;
  }
  // 3 box passes ~ gaussian (radius 3 cells)
  const tmp = new Float32Array(m.length), r = 3;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let a = 0, n = 0;
      for (let k = -r; k <= r; k++) { const xx = Math.min(bw - 1, Math.max(0, x + k)); a += m[y * bw + xx]; n++; }
      tmp[y * bw + x] = a / n;
    }
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let a = 0, n = 0;
      for (let k = -r; k <= r; k++) { const yy = Math.min(bh - 1, Math.max(0, y + k)); a += tmp[yy * bw + x]; n++; }
      m[y * bw + x] = a / n;
    }
  }
  return { data: m, w: bw, h: bh };
}

const SRGB_TO_LIN = new Float32Array(256).map((_, i) => {
  const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

let libraw = null;

export async function loadRaw(file, { half = true, onStatus = () => {} } = {}) {
  onStatus('Đang đọc file RAW…');
  const buf = new Uint8Array(await file.arrayBuffer());
  if (libraw) { try { libraw.dispose(); } catch { /* ignore */ } }
  libraw = new LibRaw();
  onStatus('Đang giải mã RAW (có thể mất 5–20 giây)…');
  await libraw.open(buf, {
    useCameraWb: true, outputBps: 16, gamm: [1, 1], noAutoBright: true,
    outputColor: 1, highlight: 0, userQual: 3, halfSize: half,
  });
  const meta = await libraw.metadata(false).catch(() => ({}));
  const img = await libraw.imageData();
  if (!img || !img.data) throw new Error('Không giải mã được file RAW này');
  if (img.colors !== 3 || img.bits !== 16) throw new Error(`Định dạng đầu ra không hỗ trợ (${img.colors} kênh, ${img.bits} bit)`);
  const data = img.data instanceof Uint16Array ? img.data : new Uint16Array(img.data.buffer, img.data.byteOffset, img.data.byteLength / 2);
  const w = img.width, h = img.height;
  onStatus('Đang tạo ảnh xem trước…');
  const prev = downscaleU16(data, w, h, PREVIEW_MAX);
  const pd = prev.data, pw = prev.w;
  const blur = blurMap(prev.w, prev.h, (x, y) => {
    const i = (y * pw + x) * 3;
    return (0.2126 * pd[i] + 0.7152 * pd[i + 1] + 0.0722 * pd[i + 2]) / 65535;
  });
  try { libraw.dispose(); } catch { /* ignore */ }
  libraw = null;
  return {
    isRaw: true, name: file.name, meta,
    full: { kind: 'u16', w, h, data },
    preview: { kind: 'u16', w: prev.w, h: prev.h, data: prev.data },
    blur,
  };
}

async function decodeBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // fallback through <img> (e.g. HEIC on Safari)
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally { URL.revokeObjectURL(url); }
  }
}

export async function loadImage(file, { onStatus = () => {} } = {}) {
  onStatus('Đang mở ảnh…');
  const bmp = await decodeBitmap(file);
  const s = Math.min(1, PREVIEW_MAX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(bmp.width * s)); cv.height = Math.max(1, Math.round(bmp.height * s));
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  const id = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const blur = blurMap(cv.width, cv.height, (x, y) => {
    const i = (y * cv.width + x) * 4;
    return 0.2126 * SRGB_TO_LIN[id[i]] + 0.7152 * SRGB_TO_LIN[id[i + 1]] + 0.0722 * SRGB_TO_LIN[id[i + 2]];
  });
  return {
    isRaw: false, name: file.name, meta: {},
    full: { kind: 'srgb', source: bmp },
    preview: { kind: 'srgb', source: cv },
    blur,
  };
}

export function fullSize(img) {
  return img.full.kind === 'u16' ? [img.full.w, img.full.h] : [img.full.source.width, img.full.source.height];
}
