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
uniform vec4 uHslH[2], uHslS[2], uHslL[2];
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
// ---- reshape (warp) ----
uniform vec4 uStretch;      // y0, y1, factor, on    (display v -> crop v)
uniform float uAspectC;     // crop aspect (w/h) before stretch
uniform int uFaceCount;
uniform vec4 uFaceA[4];     // cx, cy, rx, ry   (q units: x*aspect, y)
uniform vec4 uFaceB[4];     // angle, eyeLx, eyeLy, eyeRx
uniform vec4 uFaceC[4];     // eyeRy, noseX, noseY, -
uniform vec4 uFaceD[4];     // slim, vline, size, chin   (-1..1)
uniform vec4 uFaceE[4];     // eyes, nose, forehead, -
uniform int uBoxCount;
uniform vec4 uBoxA[6];      // cx, cy, hw, hh
uniform vec4 uBoxB[6];      // amount, angle, -, -
uniform sampler2D uDisp;    // liquify displacement field (crop uv), RG
uniform float uDispOn;
uniform float uSkinSmooth, uSkinBright, uSkinRed;
uniform vec2 uDRk;                 // (input white point, knee) for the DR shoulder; knee >= 1 = off
uniform float uChrome, uChromeBlue; // colour chrome effect / blue (0..1)
// ---- lens ----
uniform vec4 uLensA;      // persV, persH, persZoom, distort
uniform float uCA;        // chromatic aberration (-1..1)
uniform int uFill;        // 0 black, 1 white, 2 edge, 3 mirror, 4 mirror+blur
uniform vec4 uLB;         // on, amount, radius, feather
uniform vec4 uLB2;        // x, y, bokeh, shape (0 radial, 1 linear)
uniform float uLBAngle;

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

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

// inverse warp: display uv -> crop uv (pre-geometry)
vec2 warp(vec2 uv) {
  // leg/height stretch (piecewise-linear band)
  if (uStretch.w > 0.5) {
    float L = uStretch.y - uStretch.x, k = uStretch.z;
    float t = uv.y * (1.0 + L * (k - 1.0));
    float y0 = uStretch.x;
    uv.y = t < y0 ? t : (t < y0 + L * k ? y0 + (t - y0) / k : t - L * (k - 1.0));
  }
  if (uDispOn > 0.5) uv += texture(uDisp, uv).rg;
  vec2 q = vec2(uv.x * uAspectC, uv.y);
  // slimming boxes: squeeze horizontally toward the box centre line
  for (int i = 0; i < 6; i++) {
    if (i >= uBoxCount) break;
    vec4 b = uBoxA[i];
    vec2 l = rot(-uBoxB[i].y) * (q - b.xy);
    float wy = 1.0 - smoothstep(0.55, 1.0, abs(l.y) / b.w);
    float ax = abs(l.x) / b.z;
    float wx = 1.0 - smoothstep(0.9, 1.7, ax);
    l.x *= 1.0 + uBoxB[i].x * 0.22 * wy * wx;
    q = b.xy + rot(uBoxB[i].y) * l;
  }
  // faces
  for (int i = 0; i < 4; i++) {
    if (i >= uFaceCount) break;
    vec4 A = uFaceA[i], B = uFaceB[i], C = uFaceC[i], D = uFaceD[i], E = uFaceE[i];
    vec2 c = A.xy, rr = A.zw;
    mat2 Ri = rot(-B.x), Rf = rot(B.x);
    // eyes (bulge)
    if (E.x != 0.0) {
      float re = rr.x * 0.34;
      for (int e = 0; e < 2; e++) {
        vec2 ep = e == 0 ? B.yz : vec2(B.w, C.x);
        vec2 d = q - ep;
        float t = length(d) / re;
        if (t < 1.0) { float f = 1.0 - t * t; q = ep + d * (1.0 - E.x * 0.32 * f * f); }
      }
    }
    // nose (narrow)
    if (E.y != 0.0) {
      vec2 np = C.yz;
      vec2 l = Ri * (q - np);
      float g = exp(-(l.x * l.x) / (rr.x * rr.x * 0.06) - (l.y * l.y) / (rr.y * rr.y * 0.08));
      l.x *= 1.0 + E.y * 0.3 * g;
      q = np + Rf * l;
    }
    vec2 l = Ri * (q - c) / rr;       // unit-oval coordinates, y down
    float rl = length(l);
    float fall = 1.0 - smoothstep(0.75, 1.45, rl);
    // face size (uniform scale)
    l *= 1.0 + D.z * 0.12 * fall;
    // slim cheeks + jaw (horizontal), stronger below the eyes
    float wS = fall * smoothstep(-0.55, 0.25, l.y);
    l.x *= 1.0 + D.x * 0.13 * wS;
    // V-line: jaw only
    float wV = (1.0 - smoothstep(0.85, 1.4, rl)) * smoothstep(0.15, 0.85, l.y);
    l.x *= 1.0 + D.y * 0.2 * wV;
    // chin length (vertical around chin)
    float gc = exp(-(l.x * l.x) / 0.18 - pow(l.y - 0.95, 2.0) / 0.12);
    l.y -= D.w * 0.12 * gc;
    // forehead (top) height
    float gf = exp(-(l.x * l.x) / 0.5 - pow(l.y + 0.95, 2.0) / 0.12);
    l.y += E.z * 0.1 * gf;
    q = c + Rf * (l * rr);
  }
  return vec2(q.x / uAspectC, q.y);
}

// perspective (keystone) + barrel/pincushion distortion, in crop uv
vec2 lensGeom(vec2 uv) {
  vec2 p = uv - 0.5; p.x *= uAspectC;
  p /= uLensA.z;
  float w = 1.0 + uLensA.y * p.x * 0.9 + uLensA.x * p.y * 0.9;
  p /= max(w, 0.2);
  p *= 1.0 + uLensA.w * dot(p, p) * 0.6;
  p.x /= uAspectC;
  return p + 0.5;
}
vec2 toSrc(vec2 cuv) { return (uGeo * vec3(cuv, 1.0)).xy; }
vec2 mirrorUv(vec2 s) { return 1.0 - abs(1.0 - abs(s)); }
// golden-angle disk blur around crop-uv point; R in crop-height units
vec3 diskBlur(vec2 cuv, float R, float bokeh) {
  vec3 acc = vec3(0.0); float ws = 0.0;
  for (int i = 0; i < 28; i++) {
    float r = sqrt((float(i) + 0.5) / 28.0) * R, a = float(i) * 2.39996;
    vec2 o = vec2(cos(a) * r / uAspectC, sin(a) * r);
    vec3 s = src(mirrorUv(toSrc(cuv + o)));
    float l = luma(s);
    float w = 1.0 + bokeh * l * l * 10.0;
    acc += s * w; ws += w;
  }
  return acc / ws;
}

void main() {
  vec2 cuv = lensGeom(warp(vUv));
  vec2 suv = toSrc(cuv);
  vec2 od2 = max(-suv, suv - 1.0);
  float od = max(max(od2.x, od2.y), 0.0);
  float fillBlur = 0.0;
  if (od > 0.0005) {
    if (uFill == 0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    if (uFill == 1) { outColor = vec4(1.0); return; }
    if (uFill == 2) suv = clamp(suv, 0.0, 1.0);
    else { suv = mirrorUv(suv); if (uFill == 4) fillBlur = 0.012 + od * 0.25; }
  }
  vec3 lin;
  // lens blur mask (display space)
  float lbM = 0.0;
  if (uLB.x > 0.5 && uOriginal < 0.5) {
    vec2 d = (vUv - uLB2.xy) * vec2(uOutSize.x / uOutSize.y, 1.0);
    float dist;
    if (uLB2.w > 0.5) { vec2 n = vec2(-sin(uLBAngle), cos(uLBAngle)); dist = abs(dot(d, n)); }
    else dist = length(d);
    lbM = smoothstep(uLB.z, uLB.z + max(uLB.w, 0.001), dist);
  }
  float R = max(fillBlur, lbM * uLB.y * 0.035);
  if (R > 0.0008) lin = diskBlur(cuv, R, uLB2.z * (fillBlur > 0.0 ? 0.0 : 1.0));
  else lin = src(suv);
  if (uCA != 0.0 && R <= 0.0008) {
    vec2 c0 = cuv - 0.5;
    lin.r = src(mirrorUv(toSrc(0.5 + c0 * (1.0 + uCA * 0.006)))).r;
    lin.b = src(mirrorUv(toSrc(0.5 + c0 * (1.0 - uCA * 0.006)))).b;
  }
  if (uOriginal > 0.5) {
    vec3 o = uIsRaw > 0.5 ? toSrgb(lin * exp2(0.35)) : toSrgb(lin);
    outColor = vec4(o, 1.0); return;
  }

  // ---- skin (bilateral smoothing on skin tones) ------------------------------
  float skinM = 0.0;
  if (uSkinSmooth > 0.0 || uSkinBright != 0.0 || uSkinRed > 0.0) {
    vec3 sh = rgb2hsv(toSrgb(lin * uWB * exp2(uExposure)));
    float hd = mod(sh.x * 360.0 + 30.0, 360.0);          // skin ~ 0..50 deg -> 30..80
    skinM = smoothstep(18.0, 32.0, hd) * (1.0 - smoothstep(75.0, 95.0, hd))
          * smoothstep(0.08, 0.2, sh.y) * (1.0 - smoothstep(0.65, 0.85, sh.y)) * smoothstep(0.12, 0.3, sh.z);
    if (uSkinSmooth > 0.0 && skinM > 0.0) {
      vec2 px = uDetailScale / uSrcSize * max(1.5, uSrcSize.y / 450.0);
      vec3 acc = lin; float wsum = 1.0; float l0 = sqrt(luma(lin));
      for (int j = 1; j <= 2; j++) for (int a = 0; a < 8; a++) {
        float ang = float(a) * 0.785398 + float(j) * 0.39;
        vec3 s = src(suv + vec2(cos(ang), sin(ang)) * px * float(j) * 1.6);
        float d = sqrt(luma(s)) - l0;
        float w = exp(-d * d / 0.0035);
        acc += s * w; wsum += w;
      }
      lin = mix(lin, acc / wsum, skinM * uSkinSmooth);
    }
  }

  // ---- linear stage -------------------------------------------------------
  float baseExp = uIsRaw > 0.5 ? 0.35 : 0.0;
  float k = exp2(uExposure + baseExp);
  lin = max(uCal * (lin * uWB), 0.0) * k;
  float wbL = luma(uWB);
  float Lb = max(texture(uBlur, suv).r * wbL * k, 1e-5);
  float L = max(luma(lin), 1e-5);

  float ev = log2(L / 0.18), evb = log2(Lb / 0.18);
  float reg = mix(ev, evb, 0.4);
  // tone regions measured in perceived (display) brightness, like Lightroom
  float pr = toSrgb1(min(0.18 * exp2(reg), 1.0));
  float mh = smoothstep(0.38, 1.0, pr);
  float ms = 1.0 - smoothstep(0.04, 0.72, pr);
  float ev2 = ev;
  ev2 += uHighlights * 1.9 * mh;
  ev2 += uShadows * 2.2 * ms;
  ev2 += uClarity * 0.55 * (ev - evb) * (1.0 - 0.4 * mh);
  float L2 = 0.18 * exp2(ev2);
  lin *= L2 / L;
  // dynamic range (DR200/DR400): film-like shoulder that keeps highlight detail
  if (uDRk.y < 0.99) {
    float W = uDRk.x, kn = uDRk.y;
    float pw = (W - kn) / (1.0 - kn);
    float m = max(lin.r, max(lin.g, lin.b));
    if (m > kn) {
      float t = clamp((m - kn) / (W - kn), 0.0, 1.0);
      float m2 = kn + (1.0 - kn) * (1.0 - pow(1.0 - t, pw));
      lin *= m2 / m;
      lin = mix(lin, vec3(m2), smoothstep(0.85, 1.0, t) * 0.6);
    }
  }
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

  if (skinM > 0.0) {
    c *= 1.0 + uSkinBright * 0.22 * skinM;
    float lr = luma(c);
    c = mix(c, vec3(lr) + (c - lr) * vec3(0.85, 1.05, 1.1), uSkinRed * 0.6 * skinM);
  }
  // HSL
  vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
  float hue = hsv.x * 360.0;
  float dH = 0.0, dS = 0.0, dL = 0.0;
  for (int i = 0; i < 8; i++) {
    float w = bandWeight(hue, i);
    dH += w * uHslH[i / 4][i % 4]; dS += w * uHslS[i / 4][i % 4]; dL += w * uHslL[i / 4][i % 4];
  }
  float satW = smoothstep(0.0, 0.18, hsv.y);
  if (dH != 0.0 || dS != 0.0 || dL != 0.0) {
    hsv.x = fract(hsv.x + dH * satW * 45.0 / 360.0 + 1.0);
    hsv.y = clamp(dS > 0.0 ? hsv.y + (1.0 - hsv.y) * dS * 0.5 * satW + hsv.y * dS * 0.3 : hsv.y * (1.0 + dS), 0.0, 1.0);
    vec3 nc = hsv2rgb(hsv);
    nc *= 1.0 + dL * (dL > 0.0 ? 0.7 : 0.6) * satW;
    c = nc;
  }

  // colour chrome effect: deeper tones in highly saturated colours (Fuji-style)
  if (uChrome > 0.0 || uChromeBlue > 0.0) {
    vec3 h2 = rgb2hsv(clamp(c, 0.0, 1.0));
    float sat2 = h2.y * h2.y;
    float k2 = uChrome * 0.16 * sat2;
    float hb = h2.x * 360.0;
    k2 += uChromeBlue * 0.2 * h2.y * (bandWeight(hb, 5) + 0.6 * bandWeight(hb, 4));
    c *= 1.0 - k2;
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
