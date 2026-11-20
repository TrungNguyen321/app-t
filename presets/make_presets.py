#!/usr/bin/env python3
"""Tạo preset Lightroom/Camera Raw (.xmp) cho RAW Sony A7IV - tông Fuji biển trong veo, da sáng."""
import os, uuid, zipfile

OUT = os.path.dirname(os.path.abspath(__file__))

BASE = dict(
    # Basic
    Exposure2012="+0.15", Contrast2012="-8", Highlights2012="-45", Shadows2012="+28",
    Whites2012="+12", Blacks2012="-6", Texture="-6", Clarity2012="-4", Dehaze="+5",
    Vibrance="+8", Saturation="-4",
    # HSL - Hue
    HueAdjustmentRed="+4", HueAdjustmentOrange="+3", HueAdjustmentYellow="-14",
    HueAdjustmentGreen="+28", HueAdjustmentAqua="-8", HueAdjustmentBlue="-16",
    HueAdjustmentPurple="0", HueAdjustmentMagenta="-6",
    # HSL - Saturation
    SaturationAdjustmentRed="+4", SaturationAdjustmentOrange="-12", SaturationAdjustmentYellow="-22",
    SaturationAdjustmentGreen="-18", SaturationAdjustmentAqua="+14", SaturationAdjustmentBlue="+6",
    SaturationAdjustmentPurple="-12", SaturationAdjustmentMagenta="-10",
    # HSL - Luminance
    LuminanceAdjustmentRed="+2", LuminanceAdjustmentOrange="+16", LuminanceAdjustmentYellow="+10",
    LuminanceAdjustmentGreen="-8", LuminanceAdjustmentAqua="-8", LuminanceAdjustmentBlue="-12",
    LuminanceAdjustmentPurple="0", LuminanceAdjustmentMagenta="+4",
    # Color grading: shadow ngọc lạnh, highlight kem ấm, midtone đào
    ColorGradeShadowHue="192", ColorGradeShadowSat="9", ColorGradeShadowLum="0",
    ColorGradeMidtoneHue="32", ColorGradeMidtoneSat="4", ColorGradeMidtoneLum="0",
    ColorGradeHighlightHue="48", ColorGradeHighlightSat="5", ColorGradeHighlightLum="0",
    ColorGradeGlobalHue="0", ColorGradeGlobalSat="0", ColorGradeGlobalLum="0",
    ColorGradeBlending="60", SplitToningBalance="+12",
    # Calibration - "chìa khóa" màu Fuji: xanh dương ngả ngọc, đỏ trong, da sạch
    ShadowTint="-3", RedHue="+6", RedSaturation="+10", GreenHue="-6", GreenSaturation="+4",
    BlueHue="-18", BlueSaturation="+18",
    # Grain nhẹ kiểu film
    GrainAmount="10", GrainSize="18", GrainFrequency="45",
    # Chi tiết & ống kính
    Sharpness="40", SharpenRadius="+1.0", SharpenDetail="25", SharpenEdgeMasking="20",
    LuminanceSmoothing="8", ColorNoiseReduction="25",
    EnableLensCorrections="True", LensProfileEnable="1", AutoLateralCA="1",
    PostCropVignetteAmount="-6", PostCropVignetteMidpoint="50", PostCropVignetteFeather="70",
    PostCropVignetteRoundness="0", PostCropVignetteStyle="1", PostCropVignetteHighlightContrast="0",
)
CURVE = ["0, 8", "60, 58", "128, 134", "192, 198", "255, 252"]   # S nhẹ, đen hơi matte

SOFT = dict(BASE, Exposure2012="+0.05", Contrast2012="-14", Highlights2012="-60", Shadows2012="+20",
            Whites2012="0", Dehaze="+8", Vibrance="+4",
            SaturationAdjustmentAqua="+18", SaturationAdjustmentBlue="+12",
            LuminanceAdjustmentAqua="-12", LuminanceAdjustmentBlue="-18",
            ColorGradeHighlightSat="3")
SOFT_CURVE = ["0, 6", "64, 62", "128, 132", "192, 196", "255, 250"]

def xmp(name, desc, s, curve):
    attrs = "\n".join(f'   crs:{k}="{v}"' for k, v in s.items())
    pts = "\n".join(f"      <rdf:li>{p}</rdf:li>" for p in curve)
    li = lambda t: f'<rdf:Alt>\n     <rdf:li xml:lang="x-default">{t}</rdf:li>\n    </rdf:Alt>'
    return f'''<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Adobe XMP Core 7.0-c000 1.000000, 0000/00/00-00:00:00        ">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
   crs:PresetType="Normal"
   crs:Cluster=""
   crs:UUID="{uuid.uuid5(uuid.NAMESPACE_URL, name).hex.upper()}"
   crs:SupportsAmount="True"
   crs:SupportsAmount2="True"
   crs:SupportsColor="True"
   crs:SupportsMonochrome="False"
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
{attrs}
   crs:ToneCurveName2012="Custom"
   crs:HasSettings="True">
   <crs:Name>
    {li(name)}
   </crs:Name>
   <crs:ShortName>
    {li("")}
   </crs:ShortName>
   <crs:SortName>
    {li("")}
   </crs:SortName>
   <crs:Group>
    {li("A7IV Fuji Beach")}
   </crs:Group>
   <crs:Description>
    {li(desc)}
   </crs:Description>
   <crs:ToneCurvePV2012>
    <rdf:Seq>
{pts}
    </rdf:Seq>
   </crs:ToneCurvePV2012>
   <crs:ToneCurvePV2012Red><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012Red>
   <crs:ToneCurvePV2012Green><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012Green>
   <crs:ToneCurvePV2012Blue><rdf:Seq><rdf:li>0, 0</rdf:li><rdf:li>255, 255</rdf:li></rdf:Seq></crs:ToneCurvePV2012Blue>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
'''

files = [
    ("A7IV Fuji Beach - Clear.xmp", "A7IV Fuji Beach - Clear",
     "RAW Sony A7IV: bien trong veo, da sang, tong Fuji. Nang dep, troi xanh.", BASE, CURVE),
    ("A7IV Fuji Beach - Soft.xmp", "A7IV Fuji Beach - Soft",
     "RAW Sony A7IV: cho anh da sang/ troi nhat/ nang gat - giu troi xanh, da sang.", SOFT, SOFT_CURVE),
]
with zipfile.ZipFile(os.path.join(OUT, "A7IV_Fuji_Beach_Presets.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for fn, name, desc, s, c in files:
        p = os.path.join(OUT, fn)
        open(p, "w", encoding="utf-8").write(xmp(name, desc, s, c))
        z.write(p, fn)
        print("wrote", p)
