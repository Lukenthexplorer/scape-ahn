#!/usr/bin/env python3
"""
SCAPE AHN!  --  AHN spritesheet generator  [NOT WIRED IN BY DEFAULT]
====================================================================
AHN is currently drawn procedurally in js/art.js (ASSETS.ahn.path is null),
following the comic panels. This script builds the older photo-headed sheet
instead. To use it: run it, then set

    ASSETS.ahn.path = 'assets/sprites/ahn/ahn.png'

and drop `artScale` from that entry.

Builds assets/sprites/ahn/ahn.png : a 9-frame horizontal spritesheet that
matches the ASSETS.ahn entry in js/config.js.

    frames 0-3 : run cycle
    frames 4-6 : trip gag (pratfall)
    frames 7-8 : catch (game-over grab)

THE LOOK: a smooth, full-resolution photo head, deliberately oversized, sitting
on a chunky pixel-art body. The mismatch is the joke -- do not "fix" it by
pixelating the face.

Two resolutions live in one image on purpose:

  * The BODY is drawn directly in final pixels, but every coordinate is even,
    so it lands on the same 2px grid as the girl's upscaled art and reads as
    pixel art.
  * The HEAD is resampled smoothly (LANCZOS) straight to its final size, so it
    keeps real photographic detail instead of turning into colour blocks.

Re-run after swapping the photo:
    python3 tools/make_ahn_sheet.py [path/to/photo.jpg]
"""
import sys, os
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

# ---- frame geometry: MUST match ASSETS.ahn in js/config.js ----------------
FW, FH, COUNT = 112, 176, 9
GROUND = FH - 1              # feet line inside the frame
GRID = 2                     # body coordinates stay on this pixel grid

# ---- palette (mirrors PAL in js/config.js) -------------------------------
RED       = (143, 15, 34, 255)
RED_LIGHT = (200, 23, 47, 255)
BLACK     = (20, 10, 16, 255)
PALE      = (239, 227, 216, 255)
SHOE      = (61, 13, 24, 255)
WARN      = (255, 216, 74, 255)

PHOTO = sys.argv[1] if len(sys.argv) > 1 else 'assets/sprites/ahn/IMG_6044.jpg'
OUT   = 'assets/sprites/ahn/ahn.png'

# The head is 60x76 against a 176px body: roughly 43% of his height, where a
# human is about 13%. That is the gag -- he is a bobblehead giant.
HEAD_W, HEAD_H = 60, 76
HEAD_X = (FW - HEAD_W) // 2
HEAD_Y = 0
FACE_CROP = (134, 48, 324, 340)   # tight on the face: any wider and the
                                  # bright ballroom background survives the mask


def build_head():
    """Photo -> a big, smooth, background-free head with a dark keyline."""
    src = Image.open(PHOTO).convert('RGB').crop(FACE_CROP)
    head = src.resize((HEAD_W, HEAD_H), Image.LANCZOS)      # smooth, NOT pixelated
    head = ImageEnhance.Color(head).enhance(1.25)
    head = ImageEnhance.Contrast(head).enhance(1.12)
    head = head.convert('RGBA')

    # Head-shaped alpha: ellipse for the skull, squared-off jaw, corners cut
    # hard so the photo's ceiling lights never survive as a halo.
    mask = Image.new('L', (HEAD_W, HEAD_H), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((7, 1, HEAD_W - 8, HEAD_H - 2), fill=255)
    d.rectangle((15, HEAD_H // 2, HEAD_W - 16, HEAD_H - 1), fill=255)
    d.rectangle((0, 0, 12, 10), fill=0)
    d.rectangle((HEAD_W - 13, 0, HEAD_W - 1, 10), fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))       # soften the cutout edge
    head.putalpha(mask)

    # Keyline: 2px dark outline so a photo head still reads against neon.
    out = Image.new('RGBA', (HEAD_W + 8, HEAD_H + 8), (0, 0, 0, 0))
    silhouette = Image.new('RGBA', head.size, BLACK)
    silhouette.putalpha(mask.point(lambda a: 255 if a > 40 else 0))
    for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (-2, -2), (2, -2), (-2, 2), (2, 2)):
        out.alpha_composite(silhouette, (4 + dx, 4 + dy))
    out.alpha_composite(head, (4, 4))
    return out


def draw_body(d, frame, stride, bob, reach):
    """Everything below the neck, in final px on an even (2px) grid.

    Leg separation and stride are deliberately paired: legs 30px apart with a
    +/-6 stride keeps a visible gap between them at every step. Widen the
    stride without widening the gap and the two legs merge into one blob.
    """
    top = 78 + bob                      # shoulder line, just under the head

    # --- legs: long spindly stilts, alternating stride --------------------
    l1, l2 = 38 + stride, 68 - stride
    d.rectangle((l1, 122 + bob, l1 + 10, GROUND - 8), fill=BLACK)
    d.rectangle((l2, 122 + bob, l2 + 10, GROUND - 8), fill=BLACK)
    d.rectangle((l1 - 4, GROUND - 8, l1 + 12, GROUND), fill=SHOE)   # pointy shoes
    d.rectangle((l2 - 4, GROUND - 8, l2 + 12, GROUND), fill=SHOE)

    # --- torso: vertical candy-cane stripes (sinister barber pole) --------
    x0, y0, x1, y1 = 40, top + 4, 76, 126 + bob
    d.rectangle((x0, y0, x1, y1), fill=RED)
    for sx in range(x0, x1, 12):
        d.rectangle((sx, y0, sx + 6, y1), fill=BLACK)
    d.rectangle((x0 - 6, top, x1 + 6, top + 6), fill=RED_LIGHT)   # collar
    d.rectangle((52, top + 4, 64, top + 12), fill=PALE)           # bow tie

    # --- arms: held clear of the torso so the silhouette stays readable ---
    swing = -6 if frame == 0 else (6 if frame == 2 else 0)
    if reach:
        # Reaching forward for the grab, with clawed hands.
        d.rectangle((74, top + 14, 104, top + 24), fill=RED_LIGHT)
        d.rectangle((74, top + 32, 100, top + 42), fill=RED_LIGHT)
        d.rectangle((102, top + 8, 110, top + 28), fill=PALE)
        d.rectangle((96, top + 28, 106, top + 48), fill=PALE)
    else:
        d.rectangle((24, top + 12 + swing, 34, top + 64 + swing), fill=RED_LIGHT)
        d.rectangle((82, top + 12 - swing, 92, top + 64 - swing), fill=RED_LIGHT)


def draw_cane(d, tripping):
    """The candy cane he keeps tripping over."""
    cx = 94 if not tripping else 96
    cy = 96 if not tripping else 124
    d.rectangle((cx, cy, cx + 8, cy + 64), fill=PALE)
    for s in range(0, 64, 16):                      # red twist
        d.rectangle((cx, cy + s, cx + 8, cy + s + 8), fill=RED_LIGHT)
    d.rectangle((cx - 12, cy - 10, cx + 8, cy - 2), fill=PALE)    # hook
    d.rectangle((cx - 12, cy - 10, cx - 4, cy + 6), fill=RED_LIGHT)


def build_frame(i, head):
    """One 112x176 frame."""
    img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    tripping = 4 <= i <= 6
    catching = i >= 7

    # run cycle: 0/2 are the extended strides, 1/3 the passing poses (+bob)
    stride = 6 if i == 0 else (-6 if i == 2 else 0)
    bob = 2 if i in (1, 3) else 0
    if tripping:
        stride, bob = 8, 0
    if catching:
        stride, bob = (4 if i == 7 else -4), 0

    draw_cane(d, tripping)
    draw_body(d, i, stride, bob, reach=catching)
    img.alpha_composite(head, (HEAD_X - 4, HEAD_Y + bob - 4))

    if tripping:
        # Rotate the whole pratfall about his feet on an oversized canvas so
        # nothing is lost, then re-seat it: feet on the ground line, centred.
        # BICUBIC keeps the photo head smooth through the rotation; the body is
        # large flat colour and survives it fine.
        ang = {4: -10, 5: -30, 6: -56}[i]
        pad = Image.new('RGBA', (FW * 3, FH * 2), (0, 0, 0, 0))
        pad.alpha_composite(img, (FW, FH))
        pad = pad.rotate(ang, resample=Image.BICUBIC, center=(FW + FW // 2, FH * 2 - 4))
        bb = pad.getbbox()
        body = pad.crop(bb)
        if body.width > FW:                      # deep poses go wide; keep the head
            body = body.crop((body.width - FW, 0, body.width, body.height))
        if body.height > FH:
            body = body.crop((0, body.height - FH, body.width, body.height))
        img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        img.alpha_composite(body, ((FW - body.width) // 2, max(0, FH - body.height)))
        if i == 6:                               # cartoon impact star
            d2 = ImageDraw.Draw(img)
            d2.rectangle((6, 34, 26, 40), fill=WARN)
            d2.rectangle((13, 27, 19, 47), fill=WARN)
    return img


def main():
    if not os.path.exists(PHOTO):
        raise SystemExit('reference photo not found: ' + PHOTO)
    head = build_head()
    sheet = Image.new('RGBA', (FW * COUNT, FH), (0, 0, 0, 0))
    for i in range(COUNT):
        sheet.alpha_composite(build_frame(i, head), (i * FW, 0))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print('wrote %s  (%dx%d, %d frames of %dx%d, head %dx%d)'
          % (OUT, sheet.width, sheet.height, COUNT, FW, FH, HEAD_W, HEAD_H))


if __name__ == '__main__':
    main()
