# Preset "Fuji Clear Sea" – Sony A7IV (RAW .ARW)

Tone biển kiểu máy Fuji: trong veo, sạch, da sáng hồng nhẹ, nước biển xanh ngọc (cyan), lá dừa xanh dịu, hạt film rất mịn.

## Bộ preset gồm 4 file
| File | Dùng khi |
|---|---|
| 01 Clear Sea (Base) | Preset chuẩn, áp dụng cho hầu hết ảnh biển |
| 02 Clear Sea - Bright Skin | Ưu tiên da sáng, mịn (chân dung gần, ngược sáng) |
| 03 Clear Sea - Golden Hour | Ảnh chiều/hoàng hôn như ảnh mẫu (nắng vàng, trời cháy sáng) |
| 04 Clear Sea - Airy Pastel | Tông nhạt, thoáng, kiểu "film trong veo" Hàn/Nhật |

## Cài đặt
**Lightroom Classic:** Develop → panel Presets → dấu `+` → *Import Presets…* → chọn 4 file `.xmp`.
**Lightroom (CC / Mobile):** Edit → Presets → `…` → *Import Presets*. (Trên điện thoại: import trên máy tính trước, preset sẽ tự đồng bộ.)
**Photoshop Camera Raw:** Mở ACR → tab Presets → `…` → *Import Profiles & Presets*.

## Thông số chính (bản Base)
- **Profile:** Adobe Standard (có thể thử *Camera Neutral* nếu muốn trong hơn nữa)
- **Light (kéo cứu cháy + trải sáng đều):** Exposure +0.30 · Contrast −15 · Highlights −75 · Shadows +45 · Whites +8 · Blacks −4
- **Parametric curve:** Highlights −12 · Lights +8 · Darks +6 · Shadows +6 (ép vùng sáng xuống, mở vùng tối lên cho cân)
- **Presence:** Texture −8 · Clarity −6 · Dehaze +8 · Vibrance +12 · Saturation −6
- **Tone Curve:** nâng điểm đen (0→10) tạo độ "film", hạ nhẹ điểm trắng (255→253); kênh Blue chỉ nâng shadow (0→6), giữ nguyên điểm trắng để trời không ám xanh rêu
- **HSL:**
  - Đỏ/Cam: Cam Hue −5, Sat −12, Lum +16 → **da sáng, hồng, không vàng**
  - Vàng −15 Hue, −22 Sat → loại bỏ ám vàng trên bê tông, cát
  - Xanh lá +22 Hue, −28 Sat → lá dừa xanh dịu kiểu Fuji
  - Aqua −10 Hue, +6 Sat, +8 Lum → thúng chai & biển xanh ngọc trong
  - Xanh dương −12 Hue → trời/biển ngả cyan
- **Color Grading:** Shadow xanh teal (200°/8) · Highlight vàng kem rất nhẹ (45°/3) · Blending 60
- **Calibration:** Red +8/+6 · Green −12/−8 · Blue −18/+18 (đặc trưng màu Fuji)
- **Detail:** Sharpen 40 / 1.0 / 25 / Masking 45 · NR Luminance 8 · Color 25
- **Grain:** 10 / 18 / 45 (hạt rất mịn)
- **Gradient bầu trời có sẵn trong preset** (Linear Gradient từ mép trên xuống ~55% khung): Exposure −0.10 · Highlights −25 · Whites −5 · Dehaze +8 · Temp −5 · Sat +5 → cứu trời cháy, giữ chút xanh. Ảnh dọc/ngang khác nhau thì vào Masking kéo lại vị trí gradient cho khớp đường chân trời; ảnh không có trời thì xoá mask này.
- **Lens:** bật Profile Correction + Remove Chromatic Aberration

## Quy trình chỉnh sâu sau khi áp preset
1. **White Balance** (preset giữ *As Shot* để đúng với từng ảnh):
   biển ban ngày ~5200–5500K, Tint +4 đến +8; chiều tối ~5600–6000K.
2. **Exposure:** chỉnh lại ±0.3 cho đúng sáng – mắt nhìn da phải sáng nhưng trời không mất chi tiết.
3. **Mask da (quan trọng để da sáng):** Masking → *Select People* → tick *Face Skin + Body Skin*:
   - Exposure +0.20 đến +0.35 · Texture −15 · Clarity −5
   - Saturation −5 · Temp −3 (bớt vàng) · Tint +3 (hồng nhẹ)
4. **Bầu trời:** preset đã có gradient trời. Nếu trời vẫn còn cháy → *Select Sky* thêm Highlights −20, Whites −10. Nếu trời bị xám → tăng Exposure của gradient lên 0 hoặc +0.10.
5. **Mask chủ thể** (*Select Subject*): Exposure +0.10, Whites +5 giúp người nổi khỏi nền.
6. Nếu biển quá xanh lá → HSL Aqua Hue kéo thêm về −15/−20; nếu da hơi đỏ → Red Sat −10.

## Mẹo chụp trên Sony A7IV để preset ăn đẹp nhất
- Chụp RAW (Uncompressed hoặc Lossless Compressed), DRO tắt.
- Đo sáng ưu tiên da (Face priority), chấp nhận trời hơi cháy – preset có Highlights −75 + gradient trời để kéo lại.
- Ảnh ngược sáng/chiều muộn: dùng bản **03 Golden Hour**; trời trưa nắng gắt: dùng **01 Base** hoặc **04 Airy**.
