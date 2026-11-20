// GLSL for the whole develop pipeline. Two source variants:
//  SRC_U16  - linear 16-bit RGB from RAW (usampler2D, manual bilinear)
//  SRC_SRGB - 8-bit sRGB image (SRGB8_ALPHA8 texture: hardware linearises)

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // y = 0 at top
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export function fragSource(srcU16) {
  return `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler3D;
${srcU16 ? '#define SRC_U16 1' : ''}
in vec2 vUv;
out vec4 outColor;

#ifdef SRC_U16
uniform usampler2D uSrc;
#else
uniform sampler2D uSrc;
#endif
uniform vec2 uSrcSize;
uniform sampler2D uBlur;      // blurred linear luminance of the source
uniform sampler2D uCurve;     // 256x1 per-channel curve
uniform sampler3D uLut;
uniform float uLutOn, uLutAmount, uLutSize;
uniform mat3 uGeo;            // output uv -> source uv
uniform vec2 uOutSize;
uniform float uDetailScale;   // source px per output px (for neighbour taps)
uniform float uIsRaw, uOriginal;

uniform vec3 uWB;
uniform mat3 uCal;
uniform float uExposure, uContrast, uHighlights, uShadows, uWhites, uBlacks;
uniform float uTexture, uClarity, uDehaze, uVibrance, uSaturation;
uniform float uHslH[8], uHslS[8], uHslL[8];
uniform vec3 uGradeSh, uGradeMid, uGradeHi;   // (hue deg, sat 0..1, lum -1..1)
uniform float uGradeBlend, uGradeBalance, uShadowTint;
uniform float uSharpen, uNoise;
uniform float uVignette, uVignetteMid, uGrain, uGrainSize;
uniform vec4 uGradGeom;    // y0, y1, on, -
uniform vec4 uGradAdj;     // exposure, highlights, temp, saturation
uniform int uPointCount;
uniform vec4 uPtGeom[8];   // x, y, radius, -
uniform vec4 uPtAdj[8];    // bright, contrast, sat, warmth  (-1..1)
uniform vec3 uPtCol[8];

const float HUES[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 275.0, 315.0);

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float toSrgb1(float c) { return toSrgb(vec3(c)).r; }

#ifdef SRC_U16
vec3 fetchU(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(uSrcSize) - 1);
  return vec3(texelFetch(uSrc, p, 0).rgb) / 65535.0;
}
vec3 src(vec2 uv) {
  vec2 p = uv * uSrcSize - 0.5;
  vec2 f = fract(p); ivec2 i = ivec2(floor(p));
  vec3 a = fetchU(i), b = fetchU(i + ivec2(1, 0)), c = fetchU(i + ivec2(0, 1)), d = fetchU(i + ivec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
#else
vec3 src(vec2 uv) { return texture(uSrc, uv).rgb; }
#endif

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 hueColor(float deg) { return hsv2rgb(vec3(deg / 360.0, 1.0, 1.0)); }

float bandWeight(float hue, int i) {
  // piecewise-linear weight between neighbouring band centres
  float h = HUES[i];
  float prev = HUES[(i + 7) % 8], next = HUES[(i + 1) % 8];
  float dPrev = mod(h - prev + 360.0, 360.0), dNext = mod(next - h + 360.0, 360.0);
  float d = mod(hue - h + 540.0, 360.0) - 180.0;
  return d >= 0.0 ? clamp(1.0 - d / dNext, 0.0, 1.0) : clamp(1.0 + d / dPrev, 0.0, 1.0);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 suv = (uGeo * vec3(vUv, 1.0)).xy;
  if (suv.x < -0.001 || suv.y < -0.001 || suv.x > 1.001 || suv.y > 1.001) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 lin = src(suv);
  if (uOriginal > 0.5) {
    vec3 o = uIsRaw > 0.5 ? toSrgb(lin * exp2(0.35)) : toSrgb(lin);
    outColor = vec4(o, 1.0); return;
  }

  // ---- linear stage -------------------------------------------------------
  float baseExp = uIsRaw > 0.5 ? 0.35 : 0.0;
  float k = exp2(uExposure + baseExp);
  lin = max(uCal * (lin * uWB), 0.0) * k;
  float wbL = luma(uWB);
  float Lb = max(texture(uBlur, suv).r * wbL * k, 1e-5);
  float L = max(luma(lin), 1e-5);

  float ev = log2(L / 0.18), evb = log2(Lb / 0.18);
  float reg = mix(ev, evb, 0.65);
  float mh = smoothstep(-0.2, 2.6, reg);
  float ms = 1.0 - smoothstep(-4.5, -0.6, reg);
  float ev2 = ev;
  ev2 += uHighlights * 1.7 * mh;
  ev2 += uShadows * 1.7 * ms;
  ev2 += uClarity * 0.55 * (ev - evb) * (1.0 - 0.4 * mh);
  float L2 = 0.18 * exp2(ev2);
  lin *= L2 / L;
  // soft highlight clip: desaturate toward white instead of hue shifts
  float mx = max(lin.r, max(lin.g, lin.b));
  if (mx > 1.0) { float l = min(luma(lin), 1.0); lin = mix(lin / mx, vec3(1.0), clamp((mx - 1.0) / 1.5, 0.0, 1.0)); lin = mix(lin, lin * l / max(luma(lin), 1e-4), 0.0); }

  // ---- display stage ------------------------------------------------------
  vec3 c = toSrgb(lin);
  float lc = luma(c);
  if (uIsRaw > 0.5) {               // default RAW tone curve (gentle S, like camera)
    float t = mix(lc, lc * lc * (3.0 - 2.0 * lc), 0.28);
    c *= t / max(lc, 1e-4); lc = t;
  }
  // contrast on luminance (keeps hue)
  if (uContrast != 0.0) {
    float t = uContrast > 0.0 ? mix(lc, smoothstep(0.0, 1.0, lc), uContrast * 0.9)
                              : mix(lc, 0.5 + (lc - 0.5) * 0.55, -uContrast);
    c *= t / max(lc, 1e-4); lc = t;
  }
  c *= 1.0 + uWhites * 0.28 * smoothstep(0.45, 1.0, lc);
  c += uBlacks * 0.09 * (1.0 - smoothstep(0.0, 0.42, lc));

  // neighbour taps for texture / sharpen / noise (in display gamma, source luminance)
  if (uTexture != 0.0 || uSharpen > 0.0 || uNoise > 0.0) {
    vec2 px = uDetailScale / uSrcSize;
    mat2 R = mat2(uGeo[0].xy, uGeo[1].xy); // rotation part (scaled) of geometry
    vec2 dx = normalize(R * vec2(1.0, 0.0)) * px, dy = normalize(R * vec2(0.0, 1.0)) * px;
    float s = k * wbL;
    float c0 = toSrgb1(luma(src(suv)) * s);
    float n1 = (toSrgb1(luma(src(suv + dx)) * s) + toSrgb1(luma(src(suv - dx)) * s) +
                toSrgb1(luma(src(suv + dy)) * s) + toSrgb1(luma(src(suv - dy)) * s)) * 0.25;
    if (uSharpen > 0.0) c += (c0 - n1) * uSharpen * 1.6 * smoothstep(0.004, 0.02, abs(c0 - n1));
    if (uNoise > 0.0) { float d = n1 - c0; c += d * uNoise * exp(-d * d / 0.0015); }
    if (uTexture != 0.0) {
      float n3 = (toSrgb1(luma(src(suv + 3.0 * dx)) * s) + toSrgb1(luma(src(suv - 3.0 * dx)) * s) +
                  toSrgb1(luma(src(suv + 3.0 * dy)) * s) + toSrgb1(luma(src(suv - 3.0 * dy)) * s)) * 0.25;
      c += (c0 - n3) * uTexture * 0.9;
    }
  }

  // dehaze
  if (uDehaze != 0.0) {
    float hz = toSrgb1(Lb);
    if (uDehaze > 0.0) {
      float a = uDehaze * 0.32 * hz;
      c = (c - a) / max(1.0 - a, 0.2);
      float l = luma(c); c = l + (c - l) * (1.0 + uDehaze * 0.25);
    } else {
      c = mix(c, vec3(0.82), -uDehaze * 0.38);
    }
  }
  c = max(c, 0.0);

  // HSL
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float hue = hsv.x * 360.0;
  float dH = 0.0, dS = 0.0, dL = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = bandWeight(hue, i);
    dH += w * uHslH[i]; dS += w * uHslS[i]; dL += w * uHslL[i];
  }
  float satW = smoothstep(0.02, 0.25, hsv.y);
  if (dH != 0.0 || dS != 0.0 || dL != 0.0) {
    hsv.x = fract(hsv.x + dH * satW * 30.0 / 360.0 + 1.0);
    hsv.y = clamp(hsv.y * (1.0 + dS), 0.0, 1.0);
    vec3 nc = hsv2rgb(hsv);
    nc *= 1.0 + dL * 0.45 * satW;
    c = nc;
  }

  // vibrance / saturation
  float l = luma(c);
  float sat = hsv.y;
  float skin = 1.0 - 0.5 * bandWeight(hue, 1) * satW;
  c = l + (c - l) * (1.0 + uSaturation);
  c = l + (c - l) * (1.0 + uVibrance * (1.0 - sat) * skin);

  // shadow tint (calibration)
  c += uShadowTint * 0.05 * (1.0 - smoothstep(0.0, 0.5, l)) * vec3(0.5, -1.0, 0.5);

  // colour grading (3-way)
  float bal = uGradeBalance * 0.25;
  float wid = 0.15 + uGradeBlend * 0.5;
  float wSh = 1.0 - smoothstep(0.0, 0.33 + bal + wid * 0.5, l);
  float wHi = smoothstep(0.66 + bal - wid * 0.5, 1.0, l);
  float wMid = clamp(1.0 - wSh - wHi, 0.0, 1.0);
  c += wSh * ((hueColor(uGradeSh.x) - 0.5) * uGradeSh.y * 0.35 + uGradeSh.z * 0.15);
  c += wMid * ((hueColor(uGradeMid.x) - 0.5) * uGradeMid.y * 0.3 + uGradeMid.z * 0.15);
  c += wHi * ((hueColor(uGradeHi.x) - 0.5) * uGradeHi.y * 0.3 + uGradeHi.z * 0.15);
  c = clamp(c, 0.0, 1.0);

  // selective points (colour-aware like U-point)
  float aspect = uOutSize.x / uOutSize.y;
  for (int i = 0; i < 8; i++) {
    if (i >= uPointCount) break;
    vec2 d = (vUv - uPtGeom[i].xy) * vec2(aspect, 1.0);
    float r = uPtGeom[i].z;
    float w = exp(-dot(d, d) / (r * r * 0.5));
    vec3 dc = c - uPtCol[i];
    w *= exp(-dot(dc, dc) / 0.045);
    vec4 a = uPtAdj[i];
    vec3 nc = c * exp2(a.x * 0.9);
    float nl = luma(nc);
    nc = mix(nc, nl + (nc - nl), 1.0);
    nc = 0.5 + (nc - 0.5) * (1.0 + a.y * 0.6);
    nl = luma(nc);
    nc = nl + (nc - nl) * (1.0 + a.z);
    nc += a.w * vec3(0.06, 0.01, -0.06);
    c = mix(c, clamp(nc, 0.0, 1.0), w);
  }

  // linear gradient (sky)
  if (uGradGeom.z > 0.5) {
    float w = 1.0 - smoothstep(min(uGradGeom.x, uGradGeom.y), max(uGradGeom.x, uGradGeom.y), vUv.y);
    if (uGradGeom.x > uGradGeom.y) w = 1.0 - w;
    vec3 nc = c * exp2(uGradAdj.x);
    float gl = luma(nc);
    nc *= 1.0 + uGradAdj.y * 0.5 * smoothstep(0.5, 1.0, gl);
    nc += uGradAdj.z * vec3(0.07, 0.0, -0.07);
    gl = luma(nc); nc = gl + (nc - gl) * (1.0 + uGradAdj.w);
    c = mix(c, clamp(nc, 0.0, 1.0), w);
  }

  // tone curve
  c = clamp(c, 0.0, 1.0);
  c = vec3(texture(uCurve, vec2(c.r * 0.99609 + 0.00195, 0.5)).r,
           texture(uCurve, vec2(c.g * 0.99609 + 0.00195, 0.5)).g,
           texture(uCurve, vec2(c.b * 0.99609 + 0.00195, 0.5)).b);

  // 3D LUT (profile)
  if (uLutOn > 0.5) {
    vec3 lc3 = c * ((uLutSize - 1.0) / uLutSize) + 0.5 / uLutSize;
    c = mix(c, texture(uLut, lc3).rgb, uLutAmount);
  }

  // vignette
  if (uVignette != 0.0) {
    vec2 d = (vUv - 0.5) * vec2(aspect, 1.0) / max(aspect, 1.0) * 2.0;
    float r = length(d);
    float v = smoothstep(uVignetteMid * 1.2, 1.45, r);
    c = uVignette < 0.0 ? c * (1.0 + uVignette * v) : mix(c, vec3(1.0), uVignette * v);
  }
  // grain
  if (uGrain > 0.0) {
    float sc = 2400.0 / (6.0 + uGrainSize * 30.0);
    vec2 g = vUv * vec2(aspect, 1.0) * sc;
    float n = vnoise(g) * 0.6 + vnoise(g * 2.1 + 17.0) * 0.4;
    float gl = luma(c);
    c += (n - 0.5) * uGrain * 0.16 * (1.0 - abs(gl - 0.5) * 1.2);
  }
  outColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;
}
