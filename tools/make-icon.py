#!/usr/bin/env python3
"""Generate icon-180.png — the Sideline app icon (soccer ball on pitch green).

Drawn geometry rather than an emoji glyph so it renders identically everywhere
and carries no font licence. Rendered 4x and downscaled for antialiasing.
iOS rounds the corners itself, so the background is full-bleed.

Usage: python3 tools/make-icon.py   (writes icon-180.png in the repo root)
"""
import math
import os
from PIL import Image, ImageChops, ImageDraw

S = 180          # final size (apple-touch-icon standard)
AA = 4           # supersampling factor
W = S * AA
CX = CY = W / 2
R = 56 * AA      # ball radius
PITCH = "#0c3b2a"
BALL = "#f7f7f2"
INK = "#1c1c1c"


def pent(cx, cy, r, rot_deg):
    """Vertices of a regular pentagon, one vertex at rot_deg."""
    return [(cx + r * math.cos(math.radians(rot_deg + 72 * i)),
             cy + r * math.sin(math.radians(rot_deg + 72 * i))) for i in range(5)]


img = Image.new("RGB", (W, W), PITCH)

# Ball drawn on its own layer, then clipped to the circle.
layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
d.ellipse([CX - R, CY - R, CX + R, CY + R], fill=BALL)
d.polygon(pent(CX, CY, 20 * AA, -90), fill=INK)            # central pentagon
for i in range(5):
    a = math.radians(-90 + 72 * i)
    # seam from the central pentagon out to the rim patch
    d.line([CX + 20 * AA * math.cos(a), CY + 20 * AA * math.sin(a),
            CX + R * 0.86 * math.cos(a), CY + R * 0.86 * math.sin(a)],
           fill=INK, width=3 * AA)
    # rim patch: pentagon mostly outside the circle, vertex pointing inward
    px, py = CX + R * 1.10 * math.cos(a), CY + R * 1.10 * math.sin(a)
    d.polygon(pent(px, py, 18 * AA, math.degrees(a) + 180), fill=INK)

# clip to the circle: paste with (layer alpha AND circle mask)
mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
img.paste(layer, (0, 0), ImageChops.multiply(layer.split()[3], mask))

# thin outline so the white ball doesn't bleed into light UI chrome
ImageDraw.Draw(img).ellipse([CX - R, CY - R, CX + R, CY + R], outline=INK, width=2 * AA)

out = os.path.join(os.path.dirname(__file__), "..", "icon-180.png")
img.resize((S, S), Image.LANCZOS).save(out, optimize=True)
print("wrote", os.path.abspath(out))
