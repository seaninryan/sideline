#!/usr/bin/env python3
"""Generate the Sideline app icons (soccer ball, green pattern).

- icon-180.png        transparent background, just the ball (favicon)
- icon-touch-180.png  same ball on the pitch-green tile (apple-touch-icon —
                      iOS fills transparency with black, so it gets a background)

Drawn geometry rather than an emoji glyph so it renders identically everywhere
and carries no font licence. Rendered 4x and downscaled for antialiasing.

Usage: python3 tools/make-icon.py   (writes both PNGs in the repo root)
"""
import math
import os
from PIL import Image, ImageChops, ImageDraw

S = 180          # final size (apple-touch-icon standard)
AA = 4           # supersampling factor
W = S * AA
CX = CY = W / 2
PITCH = "#0c3b2a"
BALL = "#f7f7f2"
INK = "#1f7a4d"  # the pattern green


def pent(cx, cy, r, rot_deg):
    """Vertices of a regular pentagon, one vertex at rot_deg."""
    return [(cx + r * math.cos(math.radians(rot_deg + 72 * i)),
             cy + r * math.sin(math.radians(rot_deg + 72 * i))) for i in range(5)]


def ball_layer(R):
    """The ball as an RGBA layer, clipped to its circle."""
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
    # clip to the circle, then a thin outline
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
    layer.putalpha(ImageChops.multiply(layer.split()[3], mask))
    ImageDraw.Draw(layer).ellipse([CX - R, CY - R, CX + R, CY + R], outline=INK, width=2 * AA)
    return layer


root = os.path.join(os.path.dirname(__file__), "..")

# favicon: transparent, the ball fills most of the canvas
fav = Image.new("RGBA", (W, W), (0, 0, 0, 0))
fav.alpha_composite(ball_layer(86 * AA))
fav.resize((S, S), Image.LANCZOS).save(os.path.join(root, "icon-180.png"), optimize=True)

# home-screen tile: pitch green behind (iOS blackens transparency), some breathing room
touch = Image.new("RGBA", (W, W), PITCH)
touch.alpha_composite(ball_layer(62 * AA))
touch.convert("RGB").resize((S, S), Image.LANCZOS).save(os.path.join(root, "icon-touch-180.png"), optimize=True)

print("wrote icon-180.png (transparent) and icon-touch-180.png (tile)")
