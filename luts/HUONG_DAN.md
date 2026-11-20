# LUT ảnh Sony A7IV – Fuji Beach Clear

Tông Fuji cho ảnh biển: trong veo, sạch, da sáng.

| File | Dùng khi |
|---|---|
| `A7IV_FujiBeach_Clear.cube` | Độ mạnh 100%: nắng đẹp, trời xanh |
| `A7IV_FujiBeach_Clear_Soft.cube` | Độ mạnh 60%: nắng gắt, ảnh chân dung cận mặt |

Đầu vào/đầu ra: **sRGB**, lưới 33×33×33.

## Màu đã chỉnh
- **Da:** sáng thêm, gom về một tông hồng đào, giảm đỏ gắt.
- **Trời:** xanh dương ngả cyan, trong veo; highlight giữ trắng sạch (mây, nắng không bị ố vàng).
- **Biển:** xanh ngọc, tăng nhẹ độ bão hòa để nước có chiều sâu.
- **Cát:** giảm vàng chanh, sang màu kem sạch.
- **Lá cây:** xanh ngọc (emerald) đặc trưng Fuji, dịu lại.
- **Đỏ:** hơi ngả cam son.
- **Tone:** nâng vùng trung tính, vai highlight mềm, đen nâng rất nhẹ như phim.

## Cách dùng
- **Lightroom Classic / Camera Raw:** mở ảnh trong Camera Raw → bảng Presets → giữ Alt/Option, bấm *Create Profile* → *Color Lookup Table* → chọn file `.cube` → lưu. Trong Lightroom, chọn profile này ở mục **Profile** và kéo thanh **Amount** để chỉnh độ mạnh.
- **Photoshop:** Layer → New Adjustment Layer → *Color Lookup* → *3DLUT File* → chọn file `.cube` → giảm Opacity nếu thấy quá mạnh.
- **Điện thoại (Lightroom Mobile, VSCO, Snapseed…):** app nào nhập được `.cube` thì dùng trực tiếp; nếu không, áp LUT trên máy tính rồi lưu thành preset.

## Gợi ý khi chụp và chỉnh
- Chụp RAW. Khi chỉnh RAW, đặt Profile = **Adobe Color** hoặc **Camera Standard** trước khi áp LUT.
- Cân trắng khoảng 5300–5600K. Nếu ảnh ngả xanh lá do nước phản chiếu, kéo Tint +3 đến +5.
- Chụp dư sáng khoảng +0.3 đến +0.7 EV để da sáng, nhưng không để cháy trời.
- Áp LUT xong thì chỉnh Exposure, Highlights, Shadows **trước** LUT (dùng thanh Amount hoặc Opacity để giảm độ mạnh).
- Nắng trưa gắt thì dùng bản `Soft`, hoặc giảm Highlights về khoảng −30.

Muốn chỉnh lại công thức thì sửa `generate_luts.py`, sau đó chạy `python3 generate_luts.py`.
