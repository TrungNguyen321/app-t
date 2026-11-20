#!/usr/bin/env python3
"""
Tạo LUT "Fuji Beach Clear" cho Sony A7IV.

LUT cho ẢNH (input/output sRGB): dùng trong Lightroom/Camera Raw (tạo profile), Photoshop
(Color Lookup), Lightroom Mobile/VSCO/Snapseed... trên file RAW đã xuất hoặc JPEG Standard.
- A7IV_FujiBeach_Clear.cube      : 100% độ mạnh
- A7IV_FujiBeach_Clear_Soft.cube : 60% độ mạnh (an toàn cho da, nắng gắt)

Pipeline (S-Log3):
  S-Log3 -> linear -> S-Gamut3.Cine->Rec.709 (linear) -> phơi sáng/ cân trắng
  -> tone curve kiểu phim Fuji (vai highlight mềm, chân shadow sạch)
  -> grade màu trong OKLab/OKLCh (xoay hue theo vùng: trời/biển/da/cát/lá)
  -> split-tone nhẹ -> nén chroma -> Rec.709 gamma
"""
import numpy as np, os, sys

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------- Sony S-Log3 ----------------
def slog3_to_lin(x):
    x = np.asarray(x, dtype=np.float64)
    hi = (10.0 ** ((x * 1023.0 - 420.0) / 261.5)) * (0.18 + 0.01) - 0.01
    lo = (x * 1023.0 - 95.0) * 0.01125 / (171.2102946929 - 95.0)
    return np.where(x >= 171.2102946929 / 1023.0, hi, lo)

def lin_to_slog3(y):
    y = np.asarray(y, dtype=np.float64)
    hi = (420.0 + np.log10(np.maximum((y + 0.01) / (0.18 + 0.01), 1e-10)) * 261.5) / 1023.0
    lo = (y * (171.2102946929 - 95.0) / 0.01125 + 95.0) / 1023.0
    return np.where(y >= 0.01125000, hi, lo)

def rgb_to_xyz_matrix(prim, white):
    def xy2XYZ(xy):
        x, y = xy
        return np.array([x / y, 1.0, (1 - x - y) / y])
    P = np.stack([xy2XYZ(p) for p in prim], axis=1)
    S = np.linalg.solve(P, xy2XYZ(white))
    return P * S

D65 = (0.3127, 0.3290)
SG3C = [(0.766, 0.275), (0.225, 0.800), (0.089, -0.087)]
REC709 = [(0.64, 0.33), (0.30, 0.60), (0.15, 0.06)]
M_SG3C_XYZ = rgb_to_xyz_matrix(SG3C, D65)
M_709_XYZ = rgb_to_xyz_matrix(REC709, D65)
M_SG3C_TO_709 = np.linalg.inv(M_709_XYZ) @ M_SG3C_XYZ

# ---------------- Rec.709 transfer ----------------
def oetf709_inv_display(v):          # display encode (gamma 2.4 inverse, kiểu BT.1886)
    return np.clip(v, 0, None) ** (1 / 2.4)

def display_to_lin(v):
    return np.clip(v, 0, None) ** 2.4

# ---------------- OKLab ----------------
M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
               [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
               [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])
M1i, M2i = np.linalg.inv(M1), np.linalg.inv(M2)

def lin_to_oklab(rgb):
    lms = rgb @ M1.T
    return np.cbrt(lms) @ M2.T

def oklab_to_lin(lab):
    lms = lab @ M2i.T
    return (lms ** 3) @ M1i.T

# ---------------- Tone curve kiểu phim ----------------
def film_curve(lin, exposure_stops=0.35):
    """Lin scene -> display linear. Toe sạch, vai highlight cuộn mềm (giữ mây/nắng không cháy)."""
    x = np.maximum(lin, 0) * (2.0 ** exposure_stops)
    # đường cong log-space sigmoid, neo 18% xám -> ~0.20 display linear (sáng, thoáng)
    ev = np.log2(np.maximum(x, 1e-6) / 0.18)
    # contrast vừa (Provia/Astia), vai dài
    c = 1.18
    s = ev * c
    # sigmoid: map ev -> 0..1
    lo, hi = -6.5, 6.0                          # dải động ~12.5 stop
    t = 1.0 / (1.0 + np.exp(-s * 0.62 - 0.32))
    t0 = 1.0 / (1.0 + np.exp(-lo * c * 0.62 - 0.32))
    t1 = 1.0 / (1.0 + np.exp(-hi * c * 0.62 - 0.32))
    y = (t - t0) / (t1 - t0)
    y = np.clip(y, 0, 1)
    # y đang là "display-encoded-ish"; đưa về display linear
    return y ** 2.2

# ---------------- Grade màu (OKLCh) ----------------
def hue_weight(h, center, width):
    d = np.angle(np.exp(1j * (h - np.deg2rad(center))))
    return np.exp(-0.5 * (d / np.deg2rad(width)) ** 2)

def fuji_grade(rgb_lin):
    lab = lin_to_oklab(np.clip(rgb_lin, 0, None))
    L, a, b = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    h = np.arctan2(b, a)
    hd = np.rad2deg(h)

    # trọng số theo màu (độ OKLCh): đỏ~25, cam/da~55, vàng/cát~95, lá~140, cyan/biển~200, xanh trời~255
    w_red   = hue_weight(h, 25, 14)
    w_skin  = hue_weight(h, 58, 18)
    w_sand  = hue_weight(h, 95, 16)
    w_green = hue_weight(h, 140, 22)
    w_aqua  = hue_weight(h, 200, 20)
    w_blue  = hue_weight(h, 250, 20)
    lowC = np.clip(C / 0.06, 0, 1)             # bảo vệ vùng trung tính (không nhuộm màu trắng/xám)

    # --- Xoay hue (độ) ---
    dh = (+3.0 * w_red                     # đỏ hơi về cam-son, kiểu Fuji
          + (62.0 - hd) * 0.35 * w_skin    # gom da về một tông đào sáng (~62°)
          - 5.0 * w_sand                   # cát bớt vàng chanh, về vàng kem
          + 14.0 * w_green                 # lá về xanh ngọc (emerald/teal) đặc trưng Fuji
          - 4.0 * w_aqua                   # nước biển xanh ngọc trong
          - 12.0 * w_blue)                 # trời xanh dương ngả cyan, trong veo
    h2 = h + np.deg2rad(dh) * lowC

    # --- Độ bão hòa ---
    sat = (1.0
           + 0.06 * w_red
           - 0.10 * w_skin                 # da mịn, không đỏ gắt
           - 0.18 * w_sand                 # cát sạch
           - 0.12 * w_green                # lá dịu
           + 0.12 * w_aqua                 # biển trong, có chiều sâu
           + 0.14 * w_blue)                # trời nhạt vẫn giữ ánh xanh
    C2 = C * sat

    # --- Độ sáng theo màu ---
    dL = (+0.035 * w_skin * np.clip(C / 0.04, 0, 1)   # DA SÁNG
          + 0.015 * w_sand
          - 0.010 * w_green
          - 0.015 * w_blue * np.clip((L - 0.4) / 0.4, 0, 1) * 0)  # trời giữ nguyên độ sáng
    # trời xanh nhẹ đậm hơn ở chroma cao cho trong veo, không bệt
    dL += -0.02 * w_blue * np.clip(C / 0.12, 0, 1)
    L2 = L + dL
    # Độ đặc màu kiểu phim Fuji: màu xanh (biển, thuyền, trời) đậm hơn theo chroma, không đụng da/cát
    w_cool = np.clip(w_aqua + w_blue + 0.6 * w_green, 0, 1)
    L2 = L2 - 0.22 * C * w_cool * np.clip((L - 0.25) / 0.3, 0, 1)

    # --- Split-tone rất nhẹ: shadow lạnh ngọc, highlight ấm kem ---
    sh = np.clip((0.45 - L2) / 0.45, 0, 1) ** 1.5
    hl = np.clip((L2 - 0.65) / 0.35, 0, 1) ** 1.5
    a2 = C2 * np.cos(h2) + (-0.006) * sh + (0.000) * hl
    b2 = C2 * np.sin(h2) + (-0.004) * sh + (0.0015) * hl

    # --- Nén chroma ở highlight (trắng sạch, nắng không bị vàng/cháy màu) ---
    Cn = np.hypot(a2, b2)
    hl_desat = 1.0 - 0.20 * np.clip((L2 - 0.93) / 0.07, 0, 1)   # chỉ trắng hóa vùng gần cháy, giữ ánh cyan của trời
    knee, maxc = 0.16, 0.26
    Cc = np.where(Cn > knee, knee + (maxc - knee) * np.tanh((Cn - knee) / (maxc - knee)), Cn)
    scale = np.where(Cn > 1e-9, Cc / np.maximum(Cn, 1e-9), 1.0) * hl_desat
    a2, b2 = a2 * scale, b2 * scale

    # tiêu sắc đen: shadow sâu sạch, không nhiễu màu
    deep = np.clip(L2 / 0.12, 0, 1)
    a2, b2 = a2 * (0.6 + 0.4 * deep), b2 * (0.6 + 0.4 * deep)

    out = oklab_to_lin(np.stack([L2, a2, b2], axis=-1))
    return gamut_clip(out)

def gamut_clip(rgb):
    """Kéo màu ngoài gamut về phía xám cùng độ sáng thay vì cắt cứng (tránh banding)."""
    Y = rgb @ np.array([0.2126, 0.7152, 0.0722])
    Y = np.clip(Y, 0, 1)[..., None]
    mn = rgb.min(axis=-1, keepdims=True)
    t = np.where(mn < 0, Y / np.maximum(Y - mn, 1e-9), 1.0)
    rgb = Y + (rgb - Y) * np.clip(t, 0, 1)
    mx = rgb.max(axis=-1, keepdims=True)
    t = np.where(mx > 1, (1 - Y) / np.maximum(mx - Y, 1e-9), 1.0)
    rgb = Y + (rgb - Y) * np.clip(t, 0, 1)
    return np.clip(rgb, 0, 1)

def white_balance(lin, warm=0.0, tint=0.0):
    """warm>0 ấm hơn; tint>0 hồng hơn (bù xanh lá do nắng biển phản chiếu)."""
    gains = np.array([1 + 0.5 * warm + 0.25 * tint, 1 - 0.5 * tint, 1 - 0.5 * warm + 0.25 * tint])
    Y = np.clip(lin @ np.array([0.2126, 0.7152, 0.0722]), 0, 1)[..., None]
    k = 1.0 - np.clip((Y - 0.35) / 0.55, 0, 1) ** 1.5      # không ám ấm vùng trời/highlight
    return lin * (1 + (gains - 1) * k)

# ---------------- sRGB (ảnh) ----------------
def srgb_to_lin(v):
    v = np.clip(v, 0, 1)
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)

def lin_to_srgb(l):
    l = np.clip(l, 0, 1)
    return np.where(l <= 0.0031308, l * 12.92, 1.055 * l ** (1 / 2.4) - 0.055)

def tone_photo(v, brighten=0.035, shoulder=0.035, black=0.006):
    """Tone trên giá trị sRGB đã mã hóa: nâng trung tính (da sáng, thoáng), vai highlight mềm, đen sạch có độ nổi nhẹ."""
    v = v + brighten * np.sin(np.pi * v) * (1 - v) ** 1.5 * 1.8     # nâng trung tính/da, gần như không đụng highlight
    v = v - shoulder * np.sin(2 * np.pi * v) * (v > 0.5)
    v = black + (1 - black) * v                          # matte rất nhẹ kiểu film Fuji
    return np.clip(v, 0, 1)

def pipeline_photo(rgb, strength=1.0):
    lin = srgb_to_lin(rgb)
    lin = white_balance(lin, warm=0.01, tint=0.008)
    v = tone_photo(lin_to_srgb(lin))
    out = lin_to_srgb(fuji_grade(srgb_to_lin(v)))
    return rgb + (out - rgb) * strength

def write_cube(path, title, fn, n=33):
    g = np.linspace(0, 1, n)
    b, gg, r = np.meshgrid(g, g, g, indexing="ij")    # R thay đổi nhanh nhất
    rgb = np.stack([r, gg, b], axis=-1).reshape(-1, 3)
    out = np.clip(fn(rgb), 0, 1)
    with open(path, "w") as f:
        f.write(f'TITLE "{title}"\n')
        f.write("# Sony A7IV photo - Fuji Beach Clear (trong veo, da sang). Input/Output: sRGB\n")
        f.write(f"LUT_3D_SIZE {n}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n")
        for p in out:
            f.write(f"{p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n")
    print("wrote", path)

if __name__ == "__main__":
    write_cube(os.path.join(OUT, "A7IV_FujiBeach_Clear.cube"),
               "A7IV FujiBeach Clear", pipeline_photo, 33)
    write_cube(os.path.join(OUT, "A7IV_FujiBeach_Clear_Soft.cube"),
               "A7IV FujiBeach Clear Soft", lambda x: pipeline_photo(x, 0.6), 33)
