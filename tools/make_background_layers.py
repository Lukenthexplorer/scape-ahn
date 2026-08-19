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

OUT_DIR  = 'assets/sprites/background'
SPLIT_Y  = 504     # back edge of the sidewalk (source px)
BLEND_PX = 56      # wrap-blend width for the far layer

# Every backdrop must end up with its walkable ground at the SAME source row,
# because Backdrop.setLayers() swaps textures without re-measuring geometry.
# `shift_up` slides a source image so its flat ground lands there; the rows
# that opens up at the bottom are refilled by repeating the ground band, which
# only works because that band is flat pavement in every one of these images.
BACKDROPS = [
    # (source, output prefix, shift_up)
    ('background.jpg',  'background',  0),
    # Insper: its plaza starts ~75px lower than the Seoul street's pavement,
    # so it is lifted to put flat ground under both SPLIT_Y and GROUND_Y.
    # Without the lift the split lands mid-staircase and the steps tear in
    # half, the two layers scrolling at different speeds.
    ('background2.jpg', 'background2', 75),
]


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


def lift(im, shift_up):
    """Slide the image up, refilling the bottom by repeating its last rows."""
    if not shift_up:
        return im
    W, H = im.size
    out = Image.new('RGB', (W, H))
    out.paste(im.crop((0, shift_up, W, H)), (0, 0))
    # Refill from a band just above the new bottom edge: flat pavement, so a
    # straight repeat is invisible.
    band = out.crop((0, H - shift_up - 24, W, H - shift_up))
    y = H - shift_up
    while y < H:
        out.paste(band, (0, y))
        y += band.height
    return out


def build(src_name, prefix, shift_up):
    im = Image.open(os.path.join(OUT_DIR, src_name)).convert('RGB')
    W, H = im.size
    im = lift(im, shift_up)

    far = wrap_blend(im.crop((0, 0, W, SPLIT_Y)), BLEND_PX)
    far.save(os.path.join(OUT_DIR, prefix + '_far.png'))

    near = im.crop((0, SPLIT_Y, W, H))
    near.save(os.path.join(OUT_DIR, prefix + '_near.png'))

    print('%-16s %dx%d  lift %-3d ->  far %dx%d + near %dx%d'
          % (src_name, W, H, shift_up, far.width, far.height, near.width, near.height))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for src_name, prefix, shift_up in BACKDROPS:
        build(src_name, prefix, shift_up)


if __name__ == '__main__':
    main()
