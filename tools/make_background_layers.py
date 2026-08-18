#!/usr/bin/env python3
"""
SCAPE AHN!  --  background layer splitter
=========================================
Splits assets/sprites/background/background.jpg into the two parallax
layers the game scrolls at different speeds:

    background_far.png   rows 0..SPLIT_Y   (sky, skyline, shopfronts)  -> slow
    background_near.png  rows SPLIT_Y..H   (pavement, curb, wall)      -> full speed

SPLIT_Y is chosen at the back edge of the sidewalk: everything below it is
flat ground, so the two layers can slide against each other without any
vertical object being visibly torn in half.

The far layer also gets a narrow wrap-blend on its left/right edges so it
tiles without a hard vertical step in the sky. The near layer already wraps
cleanly and is left untouched (blending would smear the pavement).

Re-run after replacing background.jpg:
    python3 tools/make_background_layers.py
"""
import os
from PIL import Image

SRC      = 'assets/sprites/background/background.jpg'
OUT_DIR  = 'assets/sprites/background'
SPLIT_Y  = 504     # back edge of the sidewalk (source px)
BLEND_PX = 56      # wrap-blend width for the far layer


def wrap_blend(im, b):
    """Make `im` tile horizontally by fading its right edge into its left edge."""
    im = im.convert('RGB')
    W, H = im.size
    out = im.copy()
    left = im.crop((0, 0, b, H))
    px_out, px_left = out.load(), left.load()
    for i in range(b):
        t = (i + 1) / (b + 1)                 # 0 -> 1 across the blend band
        x = W - b + i
        for y in range(H):
            a = px_out[x, y]
            c = px_left[i, y]
            px_out[x, y] = tuple(int(a[k] * (1 - t) + c[k] * t) for k in range(3))
    return out


def main():
    im = Image.open(SRC).convert('RGB')
    W, H = im.size
    os.makedirs(OUT_DIR, exist_ok=True)

    far = wrap_blend(im.crop((0, 0, W, SPLIT_Y)), BLEND_PX)
    far.save(os.path.join(OUT_DIR, 'background_far.png'))

    near = im.crop((0, SPLIT_Y, W, H))
    near.save(os.path.join(OUT_DIR, 'background_near.png'))

    print('source      %dx%d' % (W, H))
    print('far layer   %dx%d  (rows 0..%d)' % (far.width, far.height, SPLIT_Y))
    print('near layer  %dx%d  (rows %d..%d)' % (near.width, near.height, SPLIT_Y, H))


if __name__ == '__main__':
    main()
