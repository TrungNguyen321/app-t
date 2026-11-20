// Edit parameters: one plain object, easy to clone for undo/redo and presets.

export const HSL_BANDS = [
  { key: 'red', name: 'Đỏ', hue: 0, color: '#e5484d' },
  { key: 'orange', name: 'Cam', hue: 30, color: '#f76b15' },
  { key: 'yellow', name: 'Vàng', hue: 60, color: '#ffe629' },
  { key: 'green', name: 'Xanh lá', hue: 120, color: '#30a46c' },
  { key: 'aqua', name: 'Xanh ngọc', hue: 180, color: '#12a594' },
  { key: 'blue', name: 'Xanh dương', hue: 240, color: '#0090ff' },
  { key: 'purple', name: 'Tím', hue: 275, color: '#8e4ec6' },
  { key: 'magenta', name: 'Hồng tím', hue: 315, color: '#d6409f' },
];

export const IDENTITY_CURVE = () => [[0, 0], [255, 255]];

export function defaultParams() {
  return {
    // Ánh sáng
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, recover: 0,
    // Cân bằng trắng
    temp: 0, tint: 0,
    // Hiện diện
    texture: 0, clarity: 0, dehaze: 0, vibrance: 0, saturation: 0,
    // HSL
    hslH: [0, 0, 0, 0, 0, 0, 0, 0],
    hslS: [0, 0, 0, 0, 0, 0, 0, 0],
    hslL: [0, 0, 0, 0, 0, 0, 0, 0],
    // Chỉnh màu (color grading)
    gradeShadowH: 0, gradeShadowS: 0, gradeShadowL: 0,
    gradeMidH: 0, gradeMidS: 0, gradeMidL: 0,
    gradeHighH: 0, gradeHighS: 0, gradeHighL: 0,
    gradeBlend: 50, gradeBalance: 0,
    // Hiệu chuẩn (calibration-like primaries)
    calRedH: 0, calRedS: 0, calGreenH: 0, calGreenS: 0, calBlueH: 0, calBlueS: 0, shadowTint: 0,
    // Đường cong
    curves: { rgb: IDENTITY_CURVE(), r: IDENTITY_CURVE(), g: IDENTITY_CURVE(), b: IDENTITY_CURVE() },
    paramCurve: { shadows: 0, darks: 0, lights: 0, highlights: 0 },
    // Profile (3D LUT): name of a built-in profile, 'custom' for an imported .cube, or ''
    profile: '',
    // Chi tiết
    sharpen: 0, noise: 0,
    // Hiệu ứng
    vignette: 0, vignetteMid: 50, grain: 0, grainSize: 25,
    // LUT (.cube)
    lutAmount: 100,
    // Hình học
    rotate90: 0, flipH: false, straighten: 0, aspect: 0, zoom: 1, panX: 0, panY: 0,
    cropRect: { x0: 0, y0: 0, x1: 1, y1: 1 },   // free crop (aspect -1)
    // Gradient (trời)
    grad: { on: false, y0: 0.0, y1: 0.5, exposure: 0, highlights: 0, temp: 0, saturation: 0 },
    // Chọn lọc (điểm như Snapseed)
    points: [],
    // Chân dung: khuôn mặt, dáng người, da
    faces: [],
    body: { y0: 0.55, y1: 0.95, height: 0 },
    boxes: [],
    pushes: [],
    skin: { smooth: 0, bright: 0, red: 0 },
    // Dải động & hiệu ứng màu Fuji (thường do công thức đặt)
    dr: 100, chrome: 0, chromeBlue: 0,
    // Công thức Fuji đang dùng (lớp riêng, cộng thêm vào các thanh chỉnh)
    recipe: null,
    // Ống kính: phối cảnh, méo, viền màu, làm mờ ống kính; lấp rìa thiếu; mở rộng khung
    lens: { persV: 0, persH: 0, zoom: 1, distort: 0, ca: 0, fisheye: 0, fisheyeCircle: false },
    lensBlur: { on: false, amount: 50, x: 0.5, y: 0.45, r: 0.18, feather: 0.22, bokeh: 30, shape: 'radial', angle: 0 },
    fill: 'mirror-blur',
    expand: 0,
  };
}

export const clone = (p) => JSON.parse(JSON.stringify(p));

/** merge saved/imported params onto defaults, replacing any NaN/Infinity/wrong-typed value */
export function sanitizeParams(src) {
  const def = defaultParams();
  const fix = (d, v) => {
    if (typeof d === 'number') return typeof v === 'number' && Number.isFinite(v) ? v : d;
    if (typeof d === 'boolean') return typeof v === 'boolean' ? v : d;
    if (typeof d === 'string') return typeof v === 'string' ? v : d;
    if (Array.isArray(d)) {
      if (!Array.isArray(v)) return d;
      if (d.length && typeof d[0] === 'number') return d.map((x, i) => fix(x, v[i]));
      return v;                       // lists of points/faces/etc. are taken as they are
    }
    if (d && typeof d === 'object') {
      const o = { ...d };
      if (v && typeof v === 'object') for (const k of Object.keys(v)) o[k] = k in d ? fix(d[k], v[k]) : v[k];
      return o;
    }
    return v === undefined ? d : v;
  };
  return fix(def, src || {});
}

// Slider definitions for each tool panel.
export const PANELS = {
  light: {
    title: 'Ánh sáng',
    sliders: [
      ['exposure', 'Phơi sáng', -5, 5, 0.05],
      ['contrast', 'Tương phản', -100, 100, 1],
      ['highlights', 'Vùng sáng', -100, 100, 1],
      ['recover', 'Cứu vùng cháy', 0, 100, 1],
      ['shadows', 'Vùng tối', -100, 100, 1],
      ['whites', 'Trắng', -100, 100, 1],
      ['blacks', 'Đen', -100, 100, 1],
      ['dr', 'Dải động (giữ vùng sáng)', 100, 400, 100],
    ],
  },
  color: {
    title: 'Màu',
    sliders: [
      ['temp', 'Nhiệt độ', -100, 100, 1],
      ['tint', 'Sắc thái', -100, 100, 1],
      ['vibrance', 'Độ rực', -100, 100, 1],
      ['saturation', 'Bão hoà', -100, 100, 1],
    ],
  },
  presence: {
    title: 'Hiện diện',
    sliders: [
      ['texture', 'Kết cấu', -100, 100, 1],
      ['clarity', 'Rõ nét', -100, 100, 1],
      ['dehaze', 'Khử sương', -100, 100, 1],
    ],
  },
  grading: {
    title: 'Chỉnh màu',
    sliders: [
      ['gradeShadowH', 'Vùng tối · Sắc', 0, 360, 1],
      ['gradeShadowS', 'Vùng tối · Độ đậm', 0, 100, 1],
      ['gradeShadowL', 'Vùng tối · Độ sáng', -100, 100, 1],
      ['gradeMidH', 'Trung tính · Sắc', 0, 360, 1],
      ['gradeMidS', 'Trung tính · Độ đậm', 0, 100, 1],
      ['gradeMidL', 'Trung tính · Độ sáng', -100, 100, 1],
      ['gradeHighH', 'Vùng sáng · Sắc', 0, 360, 1],
      ['gradeHighS', 'Vùng sáng · Độ đậm', 0, 100, 1],
      ['gradeHighL', 'Vùng sáng · Độ sáng', -100, 100, 1],
      ['gradeBlend', 'Hoà trộn', 0, 100, 1],
      ['gradeBalance', 'Cân bằng', -100, 100, 1],
    ],
  },
  calibration: {
    title: 'Hiệu chuẩn',
    sliders: [
      ['shadowTint', 'Sắc vùng tối', -100, 100, 1],
      ['calRedH', 'Đỏ gốc · Sắc', -100, 100, 1],
      ['calRedS', 'Đỏ gốc · Bão hoà', -100, 100, 1],
      ['calGreenH', 'Lục gốc · Sắc', -100, 100, 1],
      ['calGreenS', 'Lục gốc · Bão hoà', -100, 100, 1],
      ['calBlueH', 'Lam gốc · Sắc', -100, 100, 1],
      ['calBlueS', 'Lam gốc · Bão hoà', -100, 100, 1],
    ],
  },
  detail: {
    title: 'Chi tiết',
    sliders: [
      ['sharpen', 'Làm nét', 0, 150, 1],
      ['noise', 'Giảm nhiễu', 0, 100, 1],
    ],
  },
  effects: {
    title: 'Hiệu ứng',
    sliders: [
      ['vignette', 'Làm tối góc', -100, 100, 1],
      ['vignetteMid', 'Điểm giữa góc', 0, 100, 1],
      ['grain', 'Hạt film', 0, 100, 1],
      ['grainSize', 'Cỡ hạt', 1, 100, 1],
    ],
  },
};

export const FACE_SLIDERS = [
  ['slim', 'Gầy mặt'], ['vline', 'Cằm V-line'], ['size', 'Thu nhỏ mặt'], ['chin', 'Dài cằm'],
  ['eyeSize', 'Mắt to'], ['noseSlim', 'Thon mũi'], ['forehead', 'Trán cao'],
];

/** New face oval centred at (cx, cy) in crop uv; r = half-height in crop-height units. */
export function newFace(cx, cy, aspect, r = 0.12) {
  const rx = r * 0.78, ry = r;
  const ex = (rx * 0.42) / aspect;
  return {
    cx, cy, rx, ry, angle: 0,
    eyes: [[cx - ex, cy - ry * 0.12], [cx + ex, cy - ry * 0.12]],
    nose: [cx, cy + ry * 0.2],
    slim: 0, vline: 0, size: 0, chin: 0, eyeSize: 0, noseSlim: 0, forehead: 0,
  };
}
