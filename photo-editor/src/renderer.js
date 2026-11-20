// WebGL2 renderer: uploads the source, builds helper textures and draws the pipeline.
import { VERT, fragSource } from './shader.js';
import { buildCurveLUT } from './curves.js';

function compile(gl, type, srcText) {
  const s = gl.createShader(type);
  gl.shaderSource(s, srcText);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

// Kelvin-free white balance: temp/tint sliders -> RGB multipliers (normalised to keep luminance)
export function wbMultipliers(temp, tint) {
  const t = temp / 100, g = tint / 100;
  let r = Math.pow(2, t * 0.55), b = Math.pow(2, -t * 0.55), gr = Math.pow(2, -g * 0.35);
  const l = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
  return [r / l, gr / l, b / l];
}

// Calibration: rotate / scale each primary around the grey axis
function calMatrix(p) {
  const prim = [[1, 0, 0, p.calRedH, p.calRedS], [0, 1, 0, p.calGreenH, p.calGreenS], [0, 0, 1, p.calBlueH, p.calBlueS]];
  const cols = prim.map(([r, g, b, h, s]) => {
    const grey = 1 / 3;
    let v = [r - grey, g - grey, b - grey];
    // rotate around (1,1,1) by h * 20deg
    const a = (h / 100) * (20 * Math.PI) / 180;
    const k = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
    const cos = Math.cos(a), sin = Math.sin(a);
    const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    v = v.map((x, i) => x * cos + cross[i] * sin + k[i] * dot * (1 - cos));
    const sc = 1 + s / 100;
    return v.map((x) => grey + x * sc);
  });
  // column-major mat3
  return new Float32Array([...cols[0], ...cols[1], ...cols[2]]);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('Trình duyệt không hỗ trợ WebGL2');
    this.gl = gl;
    this.init();
  }

  /** (re)create every GPU resource; also used after Safari restores a lost context */
  init() {
    const gl = this.gl;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    this.progs = {};
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.curveTex = this._tex2D();
    this.blurTex = this._tex2D();
    this.dispTex = this._tex2D();
    this.dispOn = false;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array(2));
    this.lutTex = gl.createTexture();
    this.lut = null;
    this._curveKey = '';
    // dummy 1x1x1 LUT so the sampler is always valid
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  }

  _tex2D() {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  prog(u16) {
    const key = u16 ? 'u16' : 'srgb';
    if (!this.progs[key]) this.progs[key] = program(this.gl, fragSource(u16));
    return this.progs[key];
  }

  /** Create a source texture. img = {kind:'u16', w, h, data:Uint16Array(rgb)} or {kind:'srgb', source: canvas|ImageBitmap} */
  makeSource(img) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (img.kind === 'u16') {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB16UI, img.w, img.h, 0, gl.RGB_INTEGER, gl.UNSIGNED_SHORT, img.data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      return { tex: t, w: img.w, h: img.h, u16: true };
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img.source);
    return { tex: t, w: img.source.width, h: img.source.height, u16: false };
  }

  deleteSource(s) { if (s) this.gl.deleteTexture(s.tex); }

  /** blurred linear luminance, Float32Array w*h */
  setBlur(data, w, h) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.blurTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  /** Liquify displacement field: Float32Array(n*n*2) in crop-uv units, or null */
  setDisp(field, n) {
    const gl = this.gl;
    this.dispOn = !!field;
    if (!field) return;
    gl.bindTexture(gl.TEXTURE_2D, this.dispTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, n, n, 0, gl.RG, gl.FLOAT, field);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  setLut(lut) {
    const gl = this.gl;
    this.lut = lut;
    if (!lut) return;
    const n = lut.size, rgba = new Uint8Array(n * n * n * 4);
    for (let i = 0, j = 0; i < n * n * n; i++, j += 3) {
      rgba[i * 4] = Math.round(Math.min(1, Math.max(0, lut.data[j])) * 255);
      rgba[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, lut.data[j + 1])) * 255);
      rgba[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, lut.data[j + 2])) * 255);
      rgba[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  _updateCurve(p) {
    const key = JSON.stringify([p.curves, p.paramCurve]);
    if (key === this._curveKey) return;
    this._curveKey = key;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildCurveLUT(p));
  }

  /**
   * Draw. target: null = canvas, or {fbo, w, h}. geo: Float32Array(9) mapping output uv -> source uv.
   */
  draw(source, p, { geo, outW, outH, detailScale = 1, isRaw = false, original = false, fbo = null, aspectC = 1, vpW = 0, vpH = 0, tile = null }) {
    this._isRaw = isRaw;
    const gl = this.gl;
    const { p: prog, u } = this.prog(source.u16);
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, vpW || outW, vpH || outH);
    if (u.uTile) gl.uniform4fv(u.uTile, tile || [0, 0, 1, 1]);
    this._updateCurve(p);

    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.tex); gl.uniform1i(u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.blurTex); gl.uniform1i(u.uBlur, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.curveTex); gl.uniform1i(u.uCurve, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_3D, this.lutTex); gl.uniform1i(u.uLut, 3);

    const f = (n, v) => u[n] && gl.uniform1f(u[n], v);
    gl.uniform2f(u.uSrcSize, source.w, source.h);
    gl.uniformMatrix3fv(u.uGeo, false, geo);
    gl.uniform2f(u.uOutSize, outW, outH);
    f('uDetailScale', detailScale);
    f('uIsRaw', isRaw ? 1 : 0);
    f('uOriginal', original ? 1 : 0);
    gl.uniform3fv(u.uClip, this.clip || [1, 1, 1]);
    f('uLutOn', this.lut && !original ? 1 : 0);
    f('uLutAmount', p.lutAmount / 100);
    f('uLutSize', this.lut ? this.lut.size : 1);

    gl.uniform3fv(u.uWB, wbMultipliers(p.temp, p.tint));
    gl.uniformMatrix3fv(u.uCal, false, calMatrix(p));
    f('uExposure', p.exposure);
    f('uContrast', p.contrast / 100);
    f('uHighlights', p.highlights / 100);
    f('uShadows', p.shadows / 100);
    f('uWhites', p.whites / 100);
    f('uBlacks', p.blacks / 100);
    f('uTexture', p.texture / 100);
    f('uClarity', p.clarity / 100);
    f('uDehaze', p.dehaze / 100);
    f('uVibrance', p.vibrance / 100);
    f('uSaturation', p.saturation / 100);
    gl.uniform4fv(u.uHslH, p.hslH.map((v) => v / 100));
    gl.uniform4fv(u.uHslS, p.hslS.map((v) => v / 100));
    gl.uniform4fv(u.uHslL, p.hslL.map((v) => v / 100));
    gl.uniform3f(u.uGradeSh, p.gradeShadowH, p.gradeShadowS / 100, p.gradeShadowL / 100);
    gl.uniform3f(u.uGradeMid, p.gradeMidH, p.gradeMidS / 100, p.gradeMidL / 100);
    gl.uniform3f(u.uGradeHi, p.gradeHighH, p.gradeHighS / 100, p.gradeHighL / 100);
    f('uGradeBlend', p.gradeBlend / 100);
    f('uGradeBalance', p.gradeBalance / 100);
    f('uShadowTint', p.shadowTint / 100);
    f('uSharpen', p.sharpen / 100);
    f('uNoise', p.noise / 100);
    f('uVignette', p.vignette / 100);
    f('uVignetteMid', p.vignetteMid / 100);
    f('uGrain', p.grain / 100);
    f('uGrainSize', p.grainSize / 100);
    const g = p.grad;
    gl.uniform4f(u.uGradGeom, g.y0, g.y1, g.on ? 1 : 0, 0);
    gl.uniform4f(u.uGradAdj, g.exposure, g.highlights / 100, g.temp / 100, g.saturation / 100);
    const pts = p.points.slice(0, 8);
    gl.uniform1i(u.uPointCount, pts.length);
    if (pts.length) {
      const geom = new Float32Array(32), adj = new Float32Array(32), col = new Float32Array(24);
      pts.forEach((pt, i) => {
        geom.set([pt.x, pt.y, pt.r, 0], i * 4);
        adj.set([pt.bright / 100, pt.contrast / 100, pt.sat / 100, pt.warmth / 100], i * 4);
        col.set(pt.col || [0.5, 0.5, 0.5], i * 3);
      });
      gl.uniform4fv(u.uPtGeom, geom); gl.uniform4fv(u.uPtAdj, adj); gl.uniform3fv(u.uPtCol, col);
    }
    this._warpUniforms(u, p, aspectC, original);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _warpUniforms(u, p, aspectC, original) {
    const gl = this.gl, f = (n, v) => u[n] && gl.uniform1f(u[n], v);
    const b = p.body, sk = p.skin;
    const off = original;
    gl.uniform4f(u.uStretch, b.y0, b.y1, 1 + b.height / 100 * 0.35, !off && b.height > 0 && b.y1 > b.y0 ? 1 : 0);
    f('uAspectC', aspectC);
    const faces = off ? [] : p.faces.slice(0, 4);
    gl.uniform1i(u.uFaceCount, faces.length);
    if (faces.length) {
      const A = new Float32Array(16), B = new Float32Array(16), C = new Float32Array(16), D = new Float32Array(16), E = new Float32Array(16);
      faces.forEach((fc, i) => {
        const X = (x) => x * aspectC;
        A.set([X(fc.cx), fc.cy, fc.rx, fc.ry], i * 4);
        B.set([fc.angle * Math.PI / 180, X(fc.eyes[0][0]), fc.eyes[0][1], X(fc.eyes[1][0])], i * 4);
        C.set([fc.eyes[1][1], X(fc.nose[0]), fc.nose[1], 0], i * 4);
        D.set([fc.slim / 100, fc.vline / 100, fc.size / 100, fc.chin / 100], i * 4);
        E.set([fc.eyeSize / 100, fc.noseSlim / 100, fc.forehead / 100, 0], i * 4);
      });
      gl.uniform4fv(u.uFaceA, A); gl.uniform4fv(u.uFaceB, B); gl.uniform4fv(u.uFaceC, C); gl.uniform4fv(u.uFaceD, D); gl.uniform4fv(u.uFaceE, E);
    }
    const boxes = off ? [] : p.boxes.slice(0, 6);
    gl.uniform1i(u.uBoxCount, boxes.length);
    if (boxes.length) {
      const A = new Float32Array(24), B = new Float32Array(24);
      boxes.forEach((bx, i) => { A.set([bx.cx * aspectC, bx.cy, bx.hw, bx.hh], i * 4); B.set([bx.amount / 100, bx.angle * Math.PI / 180, 0, 0], i * 4); });
      gl.uniform4fv(u.uBoxA, A); gl.uniform4fv(u.uBoxB, B);
    }
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.dispTex); gl.uniform1i(u.uDisp, 4);
    f('uDispOn', !off && this.dispOn && p.pushes && p.pushes.length ? 1 : 0);
    f('uSkinSmooth', off ? 0 : sk.smooth / 100);
    f('uSkinBright', off ? 0 : sk.bright / 100);
    f('uSkinRed', off ? 0 : sk.red / 100);
    {
      const dr = p.dr || 100;
      const wb = wbMultipliers(p.temp, p.tint);
      const gain = Math.pow(2, p.exposure + (this._isRaw ? 1.35 : 0)) * Math.max(...wb) * (1 + Math.max(0, p.shadows) / 100 * 0.3);
      let knee = off ? 1 : dr >= 400 ? 0.5 : dr >= 300 ? 0.6 : dr >= 200 ? 0.68 : 1;
      if (!off && p.recover > 0) knee = Math.min(knee, 1 - (p.recover / 100) * 0.45);
      f('uRecover', off ? 0 : (p.recover || 0) / 100);
      gl.uniform2f(u.uDRk, Math.max(1.05, gain), knee);
    }
    const L = p.lens || {};
    gl.uniform4f(u.uLensA, off ? 0 : (L.persV || 0) / 100, off ? 0 : (L.persH || 0) / 100, off ? 1 : (L.zoom || 1), off ? 0 : (L.distort || 0) / 100);
    f('uCA', off ? 0 : (L.ca || 0) / 100);
    gl.uniform2f(u.uFish, off ? 0 : (L.fisheye || 0) / 100, !off && L.fisheyeCircle && L.fisheye > 0 ? 1 : 0);
    gl.uniform1i(u.uFill, ['black', 'white', 'edge', 'mirror', 'mirror-blur'].indexOf(p.fill || 'mirror-blur'));
    const B = p.lensBlur || {};
    gl.uniform4f(u.uLB, !off && B.on ? 1 : 0, (B.amount || 0) / 100, B.r ?? 0.2, B.feather ?? 0.2);
    gl.uniform4f(u.uLB2, B.x ?? 0.5, B.y ?? 0.5, (B.bokeh || 0) / 100, B.shape === 'linear' ? 1 : 0);
    f('uLBAngle', ((B.angle || 0) * Math.PI) / 180);
    f('uChrome', off ? 0 : p.chrome || 0);
    f('uChromeBlue', off ? 0 : p.chromeBlue || 0);
  }

  /**
   * Export in tiles (default 1024 px) straight into a 2D canvas, so the GPU never needs one
   * huge framebuffer. Throws if the GPU context is lost or the result is completely black.
   */
  renderTiledToCanvas(source, p, opts, tile = 1024) {
    const gl = this.gl, { outW, outH } = opts;
    const cv = document.createElement('canvas'); cv.width = outW; cv.height = outH;
    const ctx = cv.getContext('2d');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tile, tile, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Uint8ClampedArray(tile * tile * 4);
    let nonBlack = false;
    try {
      for (let ty = 0; ty < outH; ty += tile) {
        for (let tx = 0; tx < outW; tx += tile) {
          const w = Math.min(tile, outW - tx), h = Math.min(tile, outH - ty);
          this.draw(source, p, { ...opts, fbo, vpW: w, vpH: h, tile: [tx / outW, ty / outH, w / outW, h / outH] });
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          if (gl.isContextLost()) throw new Error('GPU bị Safari thu hồi (thiếu bộ nhớ)');
          const img = new ImageData(w, h), d = img.data, rb = w * 4;
          for (let y = 0; y < h; y++) d.set(px.subarray((h - 1 - y) * rb, (h - y) * rb), y * rb);
          if (!nonBlack) for (let i = 0; i < d.length; i += 4 * 97) if (d[i] | d[i + 1] | d[i + 2]) { nonBlack = true; break; }
          ctx.putImageData(img, tx, ty);
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    }
    if (!nonBlack) throw new Error('Ảnh xuất ra toàn màu đen — GPU không vẽ được (có thể Safari thiếu bộ nhớ). Hãy tải lại trang và thử xuất cỡ nhỏ hơn.');
    return cv;
  }

  /** Render offscreen and read RGBA8 pixels (top row first). */
  renderToPixels(source, p, opts) {
    const gl = this.gl, { outW, outH } = opts;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, outW, outH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    this.draw(source, p, { ...opts, fbo });
    const px = new Uint8ClampedArray(outW * outH * 4);
    if (gl.isContextLost()) throw new Error('GPU bị Safari thu hồi (thiếu bộ nhớ)');
    gl.readPixels(0, 0, outW, outH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    // GL rows are bottom-up; our vertex shader already put y=0 at top of uv, which lands at the
    // bottom row of the framebuffer -> flip back.
    const row = outW * 4, out = new Uint8ClampedArray(px.length);
    for (let y = 0; y < outH; y++) out.set(px.subarray((outH - 1 - y) * row, (outH - y) * row), y * row);
    return out;
  }
}
