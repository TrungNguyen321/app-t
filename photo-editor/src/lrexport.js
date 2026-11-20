// Convert app looks to Lightroom / Camera Raw presets (.xmp) and pack files into a .zip.
// Works in the browser and in Node (no DOM needed).

const BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
const sg = (v, d = 0) => { const n = +(+v).toFixed(d); return (n > 0 ? '+' : '') + n.toFixed(d); };
const clampI = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function uuid() {
  const h = '0123456789ABCDEF'; let s = '';
  for (let i = 0; i < 32; i++) s += h[Math.floor(Math.random() * 16)];
  return s;
}

/**
 * p = effective app params (recipes already applied via effectiveParams).
 * Returns { xmp, notes[] }.
 */
export function paramsToXmp(name, p, { group = 'Fuji RAW Editor', profileNote = '' } = {}) {
  const notes = [];
  const a = {};
  // light (DR / highlight recovery folded into Highlights, as Lightroom has no such sliders)
  const drExtra = (p.dr || 100) >= 400 ? -25 : (p.dr || 100) >= 200 ? -12 : 0;
  a.Exposure2012 = sg(p.exposure, 2);
  a.Contrast2012 = sg(clampI(p.contrast, -100, 100));
  a.Highlights2012 = sg(clampI(p.highlights + drExtra - (p.recover || 0) * 0.5, -100, 100));
  a.Shadows2012 = sg(clampI(p.shadows, -100, 100));
  a.Whites2012 = sg(clampI(p.whites, -100, 100));
  a.Blacks2012 = sg(clampI(p.blacks, -100, 100));
  a.Texture = sg(clampI(p.texture, -100, 100));
  a.Clarity2012 = sg(clampI(p.clarity, -100, 100));
  a.Dehaze = sg(clampI(p.dehaze, -100, 100));
  a.Vibrance = sg(clampI(p.vibrance, -100, 100));
  a.Saturation = sg(clampI(p.saturation, -100, 100));
  // white balance: relative shifts only exist for JPEG/HEIC in Lightroom (Incremental*)
  if (p.temp || p.tint) {
    a.IncrementalTemperature = sg(clampI(p.temp, -100, 100));
    a.IncrementalTint = sg(clampI(p.tint, -100, 100));
    notes.push(`Cân bằng trắng: Nhiệt độ ${sg(Math.round(p.temp))}, Sắc thái ${sg(Math.round(p.tint))} (với RAW hãy tự kéo Temp/Tint theo hướng này)`);
  }
  // HSL (+ Fuji colour chrome effects approximated with luminance)
  const chrome = p.chrome || 0, chromeB = p.chromeBlue || 0;
  BANDS.forEach((b, i) => {
    let lum = p.hslL[i] - chrome * 6;
    let sat = p.hslS[i];
    if (b === 'Blue' || b === 'Aqua') { lum -= chromeB * (b === 'Blue' ? 12 : 7); sat += chromeB * 4; }
    a['HueAdjustment' + b] = sg(clampI(p.hslH[i], -100, 100));
    a['SaturationAdjustment' + b] = sg(clampI(sat, -100, 100));
    a['LuminanceAdjustment' + b] = sg(clampI(lum, -100, 100));
  });
  // colour grading
  a.SplitToningShadowHue = clampI(p.gradeShadowH, 0, 359);
  a.SplitToningShadowSaturation = clampI(p.gradeShadowS, 0, 100);
  a.SplitToningHighlightHue = clampI(p.gradeHighH, 0, 359);
  a.SplitToningHighlightSaturation = clampI(p.gradeHighS, 0, 100);
  a.SplitToningBalance = sg(clampI(p.gradeBalance, -100, 100));
  a.ColorGradeMidtoneHue = clampI(p.gradeMidH, 0, 359);
  a.ColorGradeMidtoneSat = clampI(p.gradeMidS, 0, 100);
  a.ColorGradeShadowLum = sg(clampI(p.gradeShadowL, -100, 100));
  a.ColorGradeMidtoneLum = sg(clampI(p.gradeMidL, -100, 100));
  a.ColorGradeHighlightLum = sg(clampI(p.gradeHighL, -100, 100));
  a.ColorGradeBlending = clampI(p.gradeBlend, 0, 100);
  a.ColorGradeGlobalHue = 0; a.ColorGradeGlobalSat = 0; a.ColorGradeGlobalLum = 0;
  // calibration
  a.ShadowTint = sg(clampI(p.shadowTint, -100, 100));
  a.RedHue = sg(clampI(p.calRedH, -100, 100)); a.RedSaturation = sg(clampI(p.calRedS, -100, 100));
  a.GreenHue = sg(clampI(p.calGreenH, -100, 100)); a.GreenSaturation = sg(clampI(p.calGreenS, -100, 100));
  a.BlueHue = sg(clampI(p.calBlueH, -100, 100)); a.BlueSaturation = sg(clampI(p.calBlueS, -100, 100));
  // parametric curve
  const pc = p.paramCurve || {};
  a.ParametricShadows = sg(clampI(pc.shadows || 0, -100, 100));
  a.ParametricDarks = sg(clampI(pc.darks || 0, -100, 100));
  a.ParametricLights = sg(clampI(pc.lights || 0, -100, 100));
  a.ParametricHighlights = sg(clampI(pc.highlights || 0, -100, 100));
  a.ParametricShadowSplit = 25; a.ParametricMidtoneSplit = 50; a.ParametricHighlightSplit = 75;
  a.ToneCurveName2012 = 'Custom';
  // detail / effects
  a.Sharpness = clampI(p.sharpen, 0, 150); a.SharpenRadius = '+1.0'; a.SharpenDetail = 25; a.SharpenEdgeMasking = 0;
  a.LuminanceSmoothing = clampI(p.noise, 0, 100); a.ColorNoiseReduction = 25;
  a.GrainAmount = clampI(p.grain, 0, 100); a.GrainSize = clampI(p.grainSize, 0, 100); a.GrainFrequency = 50;
  a.PostCropVignetteAmount = sg(clampI(p.vignette, -100, 100)); a.PostCropVignetteMidpoint = clampI(p.vignetteMid, 0, 100);
  a.PostCropVignetteFeather = 50; a.PostCropVignetteStyle = 1;
  a.LensProfileEnable = 1; a.AutoLateralCA = 1;
  const L = p.lens || {};
  if (L.persV || L.persH || L.distort) {
    a.PerspectiveVertical = sg(clampI(-(L.persV || 0), -100, 100)); a.PerspectiveHorizontal = sg(clampI(-(L.persH || 0), -100, 100));
    a.LensManualDistortionAmount = sg(clampI(-(L.distort || 0), -100, 100));
  }
  if (p.profile) notes.push(`Profile màu: dùng kèm "${profileNote || p.profile}" (file .cube trong thư mục Profiles)`);
  if (p.faces && p.faces.length || p.boxes && p.boxes.length || p.pushes && p.pushes.length || p.skin && (p.skin.smooth || p.skin.bright))
    notes.push('Chỉnh khuôn mặt / dáng / da không chuyển được sang Lightroom (Lightroom không có tính năng tương ứng)');
  if (L.fisheye) notes.push('Hiệu ứng mắt cá không có trong Lightroom');
  if (p.lensBlur && p.lensBlur.on) notes.push('Làm mờ ống kính: dùng Lens Blur của Lightroom và chỉnh tay');

  const attrs = Object.entries(a).map(([k, v]) => `   crs:${k}="${v}"`).join('\n');
  const seq = (tag, pts) => `   <crs:${tag}>\n    <rdf:Seq>\n${pts.map(([x, y]) => `     <rdf:li>${Math.round(x)}, ${Math.round(y)}</rdf:li>`).join('\n')}\n    </rdf:Seq>\n   </crs:${tag}>\n`;
  const alt = (tag, text) => `   <crs:${tag}>\n    <rdf:Alt>\n     <rdf:li xml:lang="x-default">${esc(text)}</rdf:li>\n    </rdf:Alt>\n   </crs:${tag}>\n`;
  const sortPts = (pts) => [...pts].sort((x, y) => x[0] - y[0]);
  let grad = '';
  const g = p.grad;
  if (g && g.on) {
    grad = `   <crs:GradientBasedCorrections>
    <rdf:Seq>
     <rdf:li>
      <rdf:Description crs:What="Correction" crs:CorrectionAmount="1.000000" crs:CorrectionActive="true"
       crs:LocalExposure2012="${(+g.exposure).toFixed(6)}" crs:LocalHighlights2012="${(g.highlights / 100).toFixed(6)}"
       crs:LocalTemperature="${(g.temp / 100).toFixed(6)}" crs:LocalSaturation="${(g.saturation / 100).toFixed(6)}"
       crs:LocalContrast2012="0.000000" crs:LocalShadows2012="0.000000" crs:LocalWhites2012="0.000000" crs:LocalBlacks2012="0.000000"
       crs:LocalClarity2012="0.000000" crs:LocalDehaze="0.000000" crs:LocalTint="0.000000" crs:LocalTexture="0.000000">
      <crs:CorrectionMasks>
       <rdf:Seq>
        <rdf:li crs:What="Mask/Gradient" crs:MaskValue="1.000000" crs:ZeroX="0.500000" crs:ZeroY="${(+g.y1).toFixed(6)}" crs:FullX="0.500000" crs:FullY="${(+g.y0).toFixed(6)}"/>
       </rdf:Seq>
      </crs:CorrectionMasks>
      </rdf:Description>
     </rdf:li>
    </rdf:Seq>
   </crs:GradientBasedCorrections>
`;
  }
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal"
   crs:Cluster=""
   crs:UUID="${uuid()}"
   crs:SupportsAmount="False"
   crs:SupportsColor="True"
   crs:SupportsMonochrome="True"
   crs:SupportsHighDynamicRange="True"
   crs:SupportsNormalDynamicRange="True"
   crs:SupportsSceneReferred="True"
   crs:SupportsOutputReferred="True"
   crs:RequiresRGBTables="False"
   crs:CameraModelRestriction=""
   crs:Copyright=""
   crs:ContactInfo=""
   crs:Version="15.0"
   crs:ProcessVersion="11.0"
${attrs}
   crs:HasSettings="True"
   crs:HasCrop="False">
${alt('Name', name)}${alt('ShortName', name)}${alt('SortName', name)}${alt('Group', group)}${alt('Description', notes.join(' · ') || 'Fuji RAW Editor')}${seq('ToneCurvePV2012', sortPts(p.curves.rgb))}${seq('ToneCurvePV2012Red', sortPts(p.curves.r))}${seq('ToneCurvePV2012Green', sortPts(p.curves.g))}${seq('ToneCurvePV2012Blue', sortPts(p.curves.b))}${grad}  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
  return { xmp, notes };
}

/** LUT {size, data Float32Array(rgb), name} -> .cube text */
export function lutToCube(lut, title) {
  const out = [`TITLE "${title || lut.name}"`, '# Fuji RAW Editor film-style LUT (sRGB in/out)', `LUT_3D_SIZE ${lut.size}`, 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0'];
  const d = lut.data;
  for (let i = 0; i < d.length; i += 3) out.push(`${d[i].toFixed(6)} ${d[i + 1].toFixed(6)} ${d[i + 2].toFixed(6)}`);
  return out.join('\n') + '\n';
}

// ---- minimal ZIP writer (stored, no compression) -------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/** files: [{name, data: string|Uint8Array}] -> Uint8Array (.zip) */
export function makeZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}

export const README_LR = `BỘ PRESET LIGHTROOM - FUJI RAW EDITOR
=====================================

Thư mục:
  Presets/   : file .xmp (preset Lightroom / Camera Raw)
  Profiles/  : file .cube (LUT 3D giả lập phim, dùng làm Profile)

1) CÀI PRESET (.xmp)
  - Lightroom Classic: Develop > panel Presets > dấu + > Import Presets... > chọn các file .xmp
    (hoặc chọn cả file .zip này - Lightroom Classic nhập được zip).
  - Lightroom (CC/desktop): Edit > Presets > ... > Import Presets.
  - Camera Raw (Photoshop): tab Presets > ... > Import Profiles & Presets.

2) DÙNG PROFILE (.cube) - phần "màu phim" chính của công thức
  Lightroom không nhập trực tiếp .cube làm Profile, cần tạo 1 lần trong Camera Raw (Photoshop):
  - Mở 1 ảnh RAW trong Camera Raw, Profile = Adobe Standard, đặt lại mọi thanh về 0.
  - Panel Presets: giữ Alt (Win) / Option (Mac) + bấm "Create Preset" -> thành "Create Profile".
  - Uncheck All > Advanced Settings: tick "Color Lookup Table" > Load Table > chọn file .cube.
  - Tick Amount Slider (0-200), Table Space: sRGB > OK. Khởi động lại Lightroom là có Profile.
  Hoặc dùng .cube trực tiếp trong Photoshop (Adjustment > Color Lookup), DaVinci, CapCut...

3) CÁCH ÁP MỘT CÔNG THỨC
  - Chọn Profile tương ứng (ghi trong phần Description của preset), rồi bấm preset .xmp.
  - Với file RAW: cân bằng trắng trong preset chỉ là dịch tương đối (chỉ JPEG nhận);
    hãy kéo Temp/Tint theo ghi chú trong Description.

4) LƯU Ý
  - Thông số đã quy đổi sang thang Lightroom; thuật toán Lightroom khác app nên màu gần giống,
    không giống tuyệt đối - chỉnh thêm Exposure/Highlights theo từng ảnh.
  - DR200/DR400 và "Cứu vùng cháy" đã gộp vào thanh Highlights.
  - Color Chrome Effect được mô phỏng bằng HSL Luminance.
  - Chỉnh khuôn mặt, dáng, da, mắt cá, làm mờ ống kính không có tương đương trong Lightroom.
  - Các giả lập phim là màu "phong cách" do app tạo, không phải dữ liệu chính thức của Fujifilm.
`;
