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
    exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
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
    // Gradient (trời)
    grad: { on: false, y0: 0.0, y1: 0.5, exposure: 0, highlights: 0, temp: 0, saturation: 0 },
    // Chọn lọc (điểm như Snapseed)
    points: [],
  };
}

export const clone = (p) => JSON.parse(JSON.stringify(p));

// Slider definitions for each tool panel.
export const PANELS = {
  light: {
    title: 'Ánh sáng',
    sliders: [
      ['exposure', 'Phơi sáng', -5, 5, 0.05],
      ['contrast', 'Tương phản', -100, 100, 1],
      ['highlights', 'Vùng sáng', -100, 100, 1],
      ['shadows', 'Vùng tối', -100, 100, 1],
      ['whites', 'Trắng', -100, 100, 1],
      ['blacks', 'Đen', -100, 100, 1],
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
