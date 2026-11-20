# Fuji RAW Editor: tổng quan dự án (để AI khác đọc và làm tiếp)

> Tài liệu này mô tả đầy đủ app chỉnh ảnh trên điện thoại đã xây dựng: mục tiêu, tính năng, kiến trúc,
> từng file, cách build/đăng, cách test, các lỗi đã gặp, giới hạn và việc nên làm tiếp.
> Người dùng nói tiếng Việt, dùng iPhone + máy ảnh Sony A7IV (RAW .ARW), thích tone màu Fuji.

---

## 1. Mục tiêu

App chỉnh ảnh **chạy trên trình duyệt điện thoại** (PWA, thêm vào màn hình chính iPhone), giống
**Snapseed + Lightroom/Camera Raw + Evoto**:
- Đọc **RAW** (ARW, DNG, CR2/CR3, NEF, RAF, ORF, RW2…) và JPEG/HEIC/PNG.
- Chỉnh màu chuyên sâu kiểu Lightroom; giao diện **ưu tiên khung ảnh** kiểu Snapseed (1 thước chỉnh, vuốt trên ảnh).
- **Công thức màu Fuji** (film simulation recipes) và profile LUT 3D, ít cháy sáng (DR200/DR400).
- Chỉnh chân dung kiểu Evoto (gầy mặt, mắt to, kéo chân, thon gọn, mịn da) bằng thao tác tay (không AI).
- Xuất JPEG, lưu/khôi phục bản chỉnh, xuất preset sang Lightroom PC.

## 2. Link đang chạy

| Bản | Link | Ghi chú |
|---|---|---|
| GitHub Pages (chính) | https://trungnguyen321.github.io/app-t/ | Có giải mã RAW (LibRaw WASM). Tự build từ nhánh `main` qua GitHub Actions. |
| Artifact trong Claude | (link riêng của chủ tài khoản) | Không có bộ giải mã RAW (không được nhúng file WASM bên thứ 3), chỉ JPEG/HEIC/PNG. Lưu file qua capability `downloads`. |

Repo: `TrungNguyen321/app-t` (public). Code app trong `photo-editor/`. Nhánh phát triển `claude/gallant-cray-3nlp2t`, merge vào `main` qua Pull Request → Pages tự đăng (~40 giây).

## 3. Công nghệ

- **Vanilla JS (ES modules) + Vite 6** (`vite build`, `base: './'`). Không framework.
- **WebGL2**: toàn bộ xử lý màu/biến dạng chạy trong 1 fragment shader (`src/shader.js`).
- **libraw-wasm 1.6.0** (npm) để giải mã RAW trong Web Worker; được `import()` động nên app vẫn chạy khi thiếu nó.
- **IndexedDB** (tự lưu bản chỉnh, ảnh đã xuất), **localStorage** (Kiểu của người dùng, cài đặt rung).
- PWA: `public/manifest.webmanifest` + icon (không có service worker).

## 4. Cấu trúc file

```
photo-editor/
  index.html              Khung giao diện: header (Mở, ☰, hoàn tác/làm lại, biểu đồ, so sánh, Xuất), stage, panel, tabs, dialog xuất, dialog menu
  vite.config.js          base './', worker ES, exclude libraw-wasm khỏi optimizeDeps
  package.json            deps: libraw-wasm; dev: vite
  public/manifest.webmanifest, icon-*.png, apple-touch-icon.png
  scripts/export-lightroom.mjs   Node: tạo zip preset Lightroom từ preset/công thức/profile có sẵn
  src/
    main.js       (~1600 dòng) UI + state + thao tác: tabs, panels, thước chỉnh, cử chỉ, overlay, xuất, menu, lưu trữ
    shader.js     GLSL ES 3.0: vertex (có uTile cho xuất theo ô) + fragment (toàn bộ pipeline)
    renderer.js   Lớp WebGL2: tạo program, texture nguồn (RGB16UI cho RAW / SRGB8_ALPHA8 cho JPEG), set uniform, vẽ, xuất theo ô, khôi phục khi mất context
    params.js     Schema thông số (defaultParams), định nghĩa thanh cho các panel, sanitizeParams, FACE_SLIDERS, newFace
    geometry.js   Cắt/xoay/làm thẳng/lật/cắt tự do/mở rộng khung → ma trận affine uv đầu ra → uv nguồn; helper kéo cao chân
    curves.js     Đường cong monotone cubic + đường cong tham số → LUT 256×1
    profiles.js   11 "giả lập phim" sinh LUT 3D 33³ bằng code (bảng dải màu HSV + tone + split tone); parseCube
    presets.js    14 Kiểu có sẵn (BUILTIN_PRESETS) + parseXmp (nhập preset Lightroom .xmp)
    recipes.js    13 công thức Fuji, effectiveParams (cộng lớp công thức lên thông số), định dạng .profile
    loader.js     Mở RAW (LibRaw: 16-bit tuyến tính, -1EV headroom, half-size mặc định) / ảnh thường; ảnh xem trước ≤2048px; bản đồ độ sáng mờ; mức cắt từng kênh
    liquify.js    Trường dịch chuyển 256² cho cọ "đẩy tự do" (cache tăng dần)
    storage.js    IndexedDB: edits (theo tên+cỡ file), exports (12 ảnh gần nhất); sao lưu/khôi phục JSON
    haptics.js    Rung: navigator.vibrate (Android) / mẹo <input type=checkbox switch> (iOS 18+)
    lrexport.js   Thông số app → .xmp Lightroom/Camera Raw; LUT → .cube; ghi file zip (stored)
    style.css     Giao diện tối, mobile-first
.github/workflows/pages.yml   Build photo-editor và deploy GitHub Pages khi push vào main
presets/fuji-clear-sea-a7iv/  Preset Lightroom .xmp "Fuji Clear Sea" ban đầu + hướng dẫn + LUT .cube
presets/fuji-raw-editor-lightroom.zip   Bộ preset Lightroom (14 Kiểu + 13 công thức + 11 profile)
```

## 5. Luồng xử lý ảnh (shader.js, theo thứ tự)

Mỗi pixel đầu ra (`vUv`, y=0 ở trên) đi ngược về ảnh nguồn rồi qua các bước màu:

1. **Khung tròn mắt cá**: đã bỏ, `uFish.y` luôn 0.
2. **warp()**, ánh xạ ngược: kéo cao chân (dải y0..y1 giãn tuyến tính) → cọ đẩy (texture `uDisp`) → vùng thon (tối đa 6 hộp) → khuôn mặt (tối đa 4: mắt to dạng phình, thon mũi, thu nhỏ mặt, gầy má, V-line, dài cằm, trán).
3. **lensGeom()**: phóng to → mắt cá (tan) → phối cảnh (keystone) → méo ống kính.
4. **uGeo** (mat3 từ geometry.js): cắt/xoay/làm thẳng/lật/cắt tự do/mở rộng → uv nguồn.
5. **Ra ngoài ảnh**: lấp theo `uFill` (đen/trắng/kéo mép/phản chiếu/phản chiếu+mờ).
6. Lấy mẫu nguồn (RAW: texelFetch bilinear thủ công trên RGB16UI, /65535 tuyến tính; JPEG: sRGB tự tuyến tính hoá). Có làm mờ ống kính (đĩa 28 mẫu, bokeh) và viền màu (CA).
7. Bật "xem gốc" (`uOriginal`) thì trả ảnh gốc ở đây.
8. **Da**: mặt nạ da theo màu → làm mịn kiểu bilateral (16 mẫu).
9. **Vùng cháy**: kênh nào gần mức cắt `uClip` thì kéo về trung tính (tránh ám hồng/xanh khi kéo sáng).
10. **Tuyến tính**: WB (`uWB`) → Hiệu chuẩn (`uCal`, mat3 xoay/scale màu gốc) → phơi sáng (RAW cộng thêm +1.35 EV nền vì đã giải mã -1EV) → vùng sáng/vùng tối/rõ nét theo vùng (mặt nạ theo độ sáng cảm nhận, trộn 40% độ sáng mờ quanh) → **Cứu vùng cháy** → **DR shoulder** (`uDRk`: điểm trắng theo mức tăng sáng, knee 0.5/0.6/0.68 cho DR400/300/200) → soft clip.
11. **Hiển thị (sRGB)**: đường S mặc định cho RAW → tương phản → trắng/đen → kết cấu/làm nét/giảm nhiễu (lấy mẫu láng giềng) → khử sương → sáng da/giảm đỏ → **HSL 8 dải** (Hue ±45°, Sat, Lum) → Color Chrome / Chrome Xanh → độ rực/bão hoà → sắc vùng tối → **chỉnh màu 3 vùng** → **điểm chọn lọc** (tối đa 8, theo vị trí + màu) → **gradient tuyến tính** (trời) → **đường cong** (texture) → **LUT 3D** (profile, độ đậm 0–200%) → tối góc → hạt film → (viền tròn: không dùng).

`renderer.js` truyền các uniform; `effectiveParams()` (recipes.js) gộp lớp công thức Fuji trước khi vẽ.

## 6. Thông số (params.js → defaultParams)

Ánh sáng: `exposure, contrast, highlights, shadows, whites, blacks, recover, dr`.
Màu: `temp, tint, vibrance, saturation`. Hiện diện: `texture, clarity, dehaze`.
HSL: `hslH[8], hslS[8], hslL[8]` (Đỏ, Cam, Vàng, Xanh lá, Xanh ngọc, Xanh dương, Tím, Hồng tím).
Chỉnh màu: `gradeShadowH/S/L, gradeMidH/S/L, gradeHighH/S/L, gradeBlend, gradeBalance`.
Hiệu chuẩn: `calRedH/S, calGreenH/S, calBlueH/S, shadowTint`.
Đường cong: `curves {rgb,r,g,b: [[x,y]...]}`, `paramCurve {shadows,darks,lights,highlights}`.
Profile: `profile` (id profile có sẵn / 'custom' / ''), `lutAmount`.
Chi tiết/hiệu ứng: `sharpen, noise, vignette, vignetteMid, grain, grainSize, chrome, chromeBlue`.
Hình học: `rotate90, flipH, straighten, aspect (0 gốc, -1 tự do, >0 tỉ lệ), cropRect {x0,y0,x1,y1}, zoom, panX, panY, expand`.
Ống kính: `lens {persV, persH, zoom, distort, ca, fisheye}`, `lensBlur {on, amount, x, y, r, feather, bokeh, shape, angle}`, `fill`.
Cục bộ: `grad {on,y0,y1,exposure,highlights,temp,saturation}`, `points[] {x,y,r,bright,contrast,sat,warmth,col}`.
Chân dung: `faces[] {cx,cy,rx,ry,angle,eyes[2],nose,slim,vline,size,chin,eyeSize,noseSlim,forehead}`, `body {y0,y1,height}`, `boxes[] {cx,cy,hw,hh,amount,angle}`, `pushes[] {ax,ay,bx,by,r,s}`, `skin {smooth,bright,red}`.
Công thức: `recipe` (null hoặc đối tượng công thức Fuji, xem recipes.js).

Toạ độ: điểm/gradient/làm mờ ống kính theo uv **hiển thị**; mặt/hộp/cọ đẩy theo uv **khung cắt** (trước khi kéo cao); bán kính theo đơn vị chiều cao khung cắt.

## 7. Giao diện và thao tác (main.js)

- **Tabs**: Kiểu · Profile (Công thức Fuji / Chỉnh công thức / Giả lập phim–LUT) · Ánh sáng · Màu · Hiện diện · HSL · Đường cong · Chỉnh màu · Khuôn mặt · Dáng người · Da · Chọn lọc · Gradient · Ống kính (Phối cảnh / Mắt cá / Méo & viền màu / Làm mờ ống kính / Rìa & mở rộng) · Chi tiết · Hiệu ứng · Hiệu chuẩn · Cắt xoay.
- **Bảng gọn kiểu Snapseed** (`compactSliders`): dải nút thông số + **thước có vạch** (`Ruler`, 9px/vạch, ±100 → 2 đơn vị/vạch), rung mỗi vạch, **dừng tại 0** (±1.6 vạch), nút ≡ hiện danh sách đầy đủ.
- **Chạm 2 lần về 0** ở mọi nút (`onDoubleTap`, nhớ theo khoá để chịu được việc vẽ lại panel).
- **Cử chỉ trên ảnh**: chụm 2 ngón / chạm 2 lần / cuộn = zoom (tới 800%, vẽ lại nét hơn, tối đa ~4MP); kéo 1 ngón khi đang zoom = di chuyển; khi chưa zoom: **vuốt ngang chỉnh giá trị, vuốt dọc đổi thông số**. Ở các tab công cụ (chọn lọc, mặt, dáng, gradient, cắt, làm mờ ống kính) 1 ngón dùng cho công cụ, 2 ngón để zoom.
- Chặn zoom cả trang (viewport, gesture events, double-tap cùng chỗ, font input 16px).
- Giữ vị trí cuộn panel khi chọn lại trong cùng tab.
- **Xuất**: hộp thoại cỡ (Đầy đủ/4096/2048; điện thoại mặc định 4096 khi ảnh lớn), chất lượng; vẽ theo **ô 1024px** vào canvas 2D; không lưu nếu GPU mất context hoặc ảnh toàn đen. Lưu: capability downloads (trong Claude) → Web Share (iOS: "Lưu hình ảnh") → tải xuống.
- **Menu ☰**: lưu/mở file bản chỉnh (`*.chinh.json`), sao lưu/khôi phục tất cả (`fuji-raw-saoluu-*.json`), xuất preset Lightroom (.zip), ảnh đã xuất gần đây, bản chỉnh đã lưu (áp vào ảnh / lưu thành Kiểu / lưu ra file), thông tin GPU.
- **Tự lưu** bản chỉnh theo tên+cỡ file; mở lại cùng file → tự khôi phục (có nút "Chỉnh lại từ đầu").

## 8. Định dạng file

- `.profile` / `.profile.json`: `{format:"fuji-raw-editor-profile", version:1, name, recipe, params(màu), lut:{size, encoding:"rgb8-base64", data}}`.
- Bản chỉnh: `{format:"fuji-raw-editor-edit", version:1, name, key, params}`.
- Sao lưu: `{format:"fuji-raw-editor-backup", version:1, userPresets[], edits[]}`.
- Nhập được: `.xmp` (Lightroom), `.cube` (LUT 3D), `.profile/.json`.
- Xuất Lightroom: `.zip` gồm `Presets/*.xmp`, `Profiles/*.cube`, `HUONG-DAN.txt`.

## 9. Build, chạy, đăng

```bash
cd photo-editor
npm ci
npx vite build            # ra dist/
npx vite preview --port 4173
node scripts/export-lightroom.mjs ../presets/fuji-raw-editor-lightroom.zip
```
Đăng: merge vào `main` → `.github/workflows/pages.yml` build + deploy Pages (Settings → Pages → Source: GitHub Actions).
Bản artifact Claude: đăng trực tiếp `index.html` + `src/*.js|css` (không bundle, không libraw).

## 10. Cách đã test

Playwright + Chromium headless (SwiftShader WebGL), viewport 390×844, có giả lập cảm ứng: mở JPEG và một file Sony ARW mẫu, áp preset/công thức, đo % cháy sáng, đo độ sáng vùng tối, kéo thước, chạm 2 lần, zoom, cắt tự do, mắt cá, xuất JPEG, giả lập mất context (`WEBGL_lose_context`), tự lưu/khôi phục, sao lưu. **Chưa có test trên Safari/WebKit thật**: máy chủ không có WebKit.

## 11. Lỗi đã gặp và cách xử lý

| Vấn đề | Nguyên nhân | Xử lý |
|---|---|---|
| Cả trang bị zoom/cắt trên iPhone | iOS zoom khi focus input <16px, double-tap | viewport user-scalable=no, chặn gesture, input 16px, double-tap tự xử lý |
| Bấm nhanh 2 nút khác nhau mất lần 2 | chặn touchend <320ms | chỉ chặn khi 2 lần chạm cùng chỗ |
| Vùng tối kéo không ăn | mặt nạ chỉ bắt vùng rất tối | mặt nạ theo độ sáng cảm nhận, giảm trộn độ sáng mờ quanh, tăng hệ số |
| HSL kém nhạy | biên độ nhỏ | Hue ±45°, Sat/Lum mạnh hơn, thước 2 đơn vị/vạch |
| **Màn đen + ảnh xuất đen trên iPhone** | Safari thu hồi WebGL context khi thiếu bộ nhớ (người dùng giải mã RAW đầy đủ ~33MP 7028×4688 và xuất nguyên cỡ) | xử lý `webglcontextlost/restored` + `Renderer.init()`; xuất theo ô; giới hạn khung xem; chặn lưu ảnh đen; mặc định xuất 4096 trên điện thoại; sanitize NaN |
| Kéo vùng sáng RAW bị ám hồng | kênh lục cháy trước | neutral hoá theo `uClip` |
| Lớp `.sel` CSS trùng | ô select và điểm được chọn cùng tên | đổi thành `.fsel` |
| Lưới cắt tự do lệch | `inset` ghi đè left/top | đặt `inset:auto` trước |

## 12. Giới hạn hiện tại

- Không có AI: không tự nhận diện mặt/khung xương, không xoá vật thể (healing), không "mở rộng thông minh". Lấp rìa chỉ phản chiếu + mờ.
- "Giả lập phim" là LUT tự tạo theo phong cách, **không phải dữ liệu Fujifilm**; quy đổi recipe (Highlight/Shadow/Kelvin/R-B) là ước lượng.
- RAW: half-size mặc định (A7IV ~3504×2336); đầy đủ có thể làm Safari hết bộ nhớ. Không giữ EXIF khi xuất.
- Rung trên iPhone dựa vào mẹo iOS 18+, có thể không chạy.
- Preset Lightroom: màu gần giống, WB tương đối chỉ áp cho JPEG; chân dung/mắt cá/làm mờ ống kính không chuyển được.
- Bản trong Claude không đọc RAW.

## 13. Gợi ý việc làm tiếp

1. Test thật trên iPhone Safari; nếu còn đen: xem dòng "Thông tin GPU" trong menu ☰.
2. Xuất RAW đầy đủ an toàn hơn: giải mã theo ô hoặc giảm bộ nhớ LibRaw; giữ EXIF (ghi lại APP1).
3. Nhận diện mặt tự động (MediaPipe Face Landmarker), cần tự host model trên Pages.
4. Healing/xoá vật thể (PatchMatch trên GPU) và làm mịn da tốt hơn (frequency separation).
5. Mask cục bộ dạng cọ vẽ và mask "chọn chủ thể/trời".
6. Service worker để dùng offline.
7. Tách `main.js` thành nhiều module (ui/panels, gestures, export, menu).
8. So màu công thức Fuji với JPEG thật từ máy Fuji để tinh chỉnh LUT.

## 14. Bối cảnh trao đổi với người dùng

- Ban đầu người dùng xin preset Lightroom "Fuji Clear Sea" cho A7IV (biển trong veo, da sáng), sau đó profile LUT, công thức Snapseed, rồi yêu cầu tự làm app chỉnh ảnh trên điện thoại "như Snapseed, đọc RAW, đủ tính năng Camera Raw".
- Các yêu cầu tiếp theo (đã làm): chân dung kiểu Evoto, công thức Fuji từ ảnh FujiXWeekly/FUJISTYLE, file `.profile`, khung ảnh ưu tiên + zoom, thước răng cưa có rung, ống kính (phối cảnh, mắt cá, làm mờ, lấp rìa), cứu vùng cháy, tự lưu + sao lưu, cắt tự do, xuất preset Lightroom.
- Người dùng muốn trả lời bằng **tiếng Việt**, ưu tiên thao tác trên iPhone.
