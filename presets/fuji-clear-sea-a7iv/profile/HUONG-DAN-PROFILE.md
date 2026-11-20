# Profile màu "Fuji Clear Sea" (Creative Profile – Lightroom / Camera Raw)

Profile = màu "gốc" của ảnh (giống chọn film simulation trên máy Fuji). Chỉnh sâu hơn preset vì dùng **LUT 3D 33×33×33**: mỗi tổ hợp màu được đổi riêng (da, biển, thúng chai, lá dừa…), và có **thanh Amount 0–200** để chỉnh độ đậm.

## File
- `Fuji Clear Sea.cube` – LUT 3D, lõi màu của profile (sRGB)
- `../Fuji Clear Sea A7IV - 00 Light Only (dung kem Profile).xmp` – preset **chỉ chỉnh sáng** (cứu cháy, cân sáng, gradient trời, nét, hạt), **không đụng màu** để không chồng lên profile

## Màu trong LUT làm gì
| Màu | Thay đổi |
|---|---|
| Da (cam) | Hue −4 (hồng hơn), Sat −14%, sáng +8% → **da sáng, trong, không vàng** |
| Vàng | Hue −10, Sat −22% → hết ám vàng nền xi măng, cát |
| Xanh lá | Hue +14, Sat −28% → lá dừa xanh mát kiểu Fuji |
| Aqua | Hue −8, Sat +10%, sáng +5% → thúng chai, biển xanh ngọc trong |
| Xanh dương | Hue −10 → trời/biển ngả cyan |
| Tone | Điểm đen nâng (0→10), vai sáng mềm (255→253), shadow ánh teal, highlight kem rất nhẹ |
| Màu trung tính | Giữ trung tính (trắng vẫn trắng, xám vẫn xám) |

## Tạo profile (làm 1 lần, cần Photoshop – Camera Raw)
Lightroom **không tự tạo** được profile, chỉ Camera Raw trong Photoshop làm được. Sau khi tạo, Lightroom dùng được luôn.

1. Mở 1 file **.ARW** trong Photoshop → Camera Raw mở ra.
2. Panel Edit → **Profile: Adobe Standard**. Bấm reset để mọi thanh về 0.
3. Sang panel **Presets** (biểu tượng hình tròn chồng nhau) → **giữ Alt (Windows) / Option (Mac)** và bấm nút **Create Preset** → nút đổi thành **Create Profile**.
4. Hộp thoại Create Profile:
   - Name: `Fuji Clear Sea` · Group: `Fuji Clear Sea`
   - Bấm **Uncheck All** (bỏ chọn hết các thông số)
   - Phần **Advanced Settings**: tick **Color Lookup Table** → **Load Table…** → chọn `Fuji Clear Sea.cube`
   - **Amount Slider:** tick · Min 0 · Max 200
   - **Table Space:** sRGB · Gamut: Clip to sRGB (hoặc để mặc định)
5. Bấm **OK**. Profile được lưu vào:
   - Windows: `C:\Users\<tên>\AppData\Roaming\Adobe\CameraRaw\Settings\`
   - Mac: `~/Library/Application Support/Adobe/CameraRaw/Settings/`
6. **Lightroom Classic:** khởi động lại → Profile Browser → nhóm *Fuji Clear Sea*.
   **Lightroom CC / Mobile:** Import Profiles & Presets → chọn file `Fuji Clear Sea.xmp` vừa tạo trong thư mục trên (đồng bộ sang điện thoại).

## Cách dùng
1. Mở ảnh RAW → Profile Browser → **Fuji Clear Sea** → Amount **100** (ảnh trưa nắng gắt: 70–80; chiều dịu: 110–130).
2. Áp preset **00 Light Only** để cứu cháy + cân sáng + gradient trời.
3. Chỉnh White Balance theo ảnh (biển ngày ~5200–5500K, Tint +4…+8; chiều ~5600–6000K).
4. Mask da (*Select People → Skin*): Exposure +0.25, Texture −15, Temp −3, Tint +3 nếu muốn da sáng hơn nữa.

> Không dùng chung profile với preset 01–04: các preset đó đã có màu HSL/Calibration, áp thêm sẽ bị chồng màu. Profile → dùng preset **00 Light Only**.

## Dùng LUT ở chỗ khác
File `.cube` cũng dùng được trực tiếp: Photoshop (Adjustment → Color Lookup), Premiere/DaVinci/CapCut/VN (video), và các app ảnh có mục "Import LUT".
