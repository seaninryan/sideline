#!/usr/bin/env python3
"""Generate the Here We Go app icons.

A pitch-green pill with a yellow outline and "HWG" (cream HW, yellow G),
on a TRANSPARENT background. Both outputs are identical and transparent:

- icon-180.png        favicon
- icon-touch-180.png  apple-touch-icon (iOS fills transparency with black;
                      the pill + cream/yellow stays legible there)

Text uses the bundled LiberationSans-Bold (PIL has no Bebas); the on-screen
title-bar logo uses Bebas via the web font, so they are close but not
pixel-identical. Rendered 4x and downscaled for antialiasing.

Usage: python3 tools/make-icon.py   (writes both PNGs in the repo root)
"""
import os
from PIL import Image, ImageDraw, ImageFont

S = 180          # final size (apple-touch-icon standard)
AA = 4           # supersampling factor
W = S * AA       # 720
CX = W / 2

PITCH = "#0c3b2a"
CREAM = "#f4efe1"
YELLOW = "#f5c518"

root = os.path.join(os.path.dirname(__file__), "..")
FONT = os.path.join(root, "assets", "LiberationSans-Bold.ttf")


def icon_layer():
    """Transparent RGBA layer: yellow-outlined green pill with 'HWG'."""
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # pill geometry: mockup 128-space rect (6,34)-(122,94) r30, scaled x5.625
    x0, y0, x1, y1 = 34, 191, 686, 529
    d.rounded_rectangle([x0, y0, x1, y1], radius=169,
                        fill=PITCH, outline=YELLOW, width=22)
    # "HWG": HW cream, G yellow, centred on the pill
    font = ImageFont.truetype(FONT, 225)
    cy = (y0 + y1) / 2
    w_hw = d.textlength("HW", font=font)
    w_g = d.textlength("G", font=font)
    start = CX - (w_hw + w_g) / 2
    d.text((start, cy), "HW", font=font, fill=CREAM, anchor="lm")
    d.text((start + w_hw, cy), "G", font=font, fill=YELLOW, anchor="lm")
    return layer


icon = icon_layer().resize((S, S), Image.LANCZOS)
icon.save(os.path.join(root, "icon-180.png"), optimize=True)
icon.save(os.path.join(root, "icon-touch-180.png"), optimize=True)

print("wrote icon-180.png and icon-touch-180.png (transparent pill)")
