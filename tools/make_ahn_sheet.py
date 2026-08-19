#!/usr/bin/env python3
"""
SCAPE AHN!  --  AHN spritesheet generator
=========================================
Builds assets/sprites/ahn/ahn.png : a 9-frame horizontal spritesheet that
matches the ASSETS.ahn entry in js/config.js.

    frames 0-3 : run cycle
    frames 4-6 : trip gag (pratfall)
    frames 7-8 : catch (game-over grab)

AHN's head is the reference photo, downsampled to pixel-art resolution and
masked out of its background; the body is a drawn candy-cane-striped
"evil candy man" -- tall, lanky, deep red / black stripes, candy cane prop.

Re-run after swapping the photo:
    python3 tools/make_ahn_sheet.py [path/to/photo.jpg]
"""
import sys, os
from PIL import Image, ImageDraw, ImageEnhance

# ---- frame geometry: MUST match ASSETS.ahn in js/config.js ----------------
# Drawn in a 56x76 design grid, exported at OUT_SCALE for a final 112x152 sheet.
# The girl's art is upscaled 2x the same way, so both share one pixel size --
# do NOT make him bigger by raising OUT_SCALE, that would give him chunkier
# pixels than her. Grow the design grid instead, as done here.
# He stands ~148px tall against her 84px: towering, and lanky rather than
# simply inflated (the extra height goes into legs and torso, not the head).
FW, FH, COUNT = 56, 76, 9
OUT_SCALE = 2
GROUND = FH - 1              # feet line inside the frame

# ---- palette (mirrors PAL in js/config.js) -------------------------------
RED       = (143, 15, 34, 255)
RED_LIGHT = (200, 23, 47, 255)
BLACK     = (20, 10, 16, 255)
PALE      = (239, 227, 216, 255)
SHOE      = (61, 13, 24, 255)
WARN      = (255, 216, 74, 255)

PHOTO = sys.argv[1] if len(sys.argv) > 1 else 'assets/sprites/ahn/IMG_6044.jpg'
OUT   = 'assets/sprites/ahn/ahn.png'

HEAD_W, HEAD_H = 21, 24
FACE_CROP = (126, 46, 344, 344)   # hair-top to chin in the source photo


def build_head():
    """Photo -> small, punchy, background-free pixel head."""
    src = Image.open(PHOTO).convert('RGB').crop(FACE_CROP)
    small = src.resize((HEAD_W, HEAD_H), Image.LANCZOS)
    small = ImageEnhance.Color(small).enhance(1.45)     # pop the skin/hair
    small = ImageEnhance.Contrast(small).enhance(1.25)
    small = small.convert('RGBA')

    # Head-shaped alpha mask: ellipse for the skull, squared-off jaw.
    mask = Image.new('L', (HEAD_W, HEAD_H), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((1, 1, HEAD_W - 2, HEAD_H - 3), fill=255)
    d.rectangle((4, HEAD_H // 2, HEAD_W - 5, HEAD_H - 2), fill=255)
    # The photo's ceiling lights sit right above the hair; clip the top corners
    # hard so none of that warm background survives as a halo.
    d.rectangle((0, 0, 4, 3), fill=0)
    d.rectangle((HEAD_W - 5, 0, HEAD_W - 1, 3), fill=0)
    small.putalpha(mask)

    # Dark keyline so he reads against the background at speed.
    out = Image.new('RGBA', (HEAD_W, HEAD_H), (0, 0, 0, 0))
    px = small.load()
    ol = Image.new('RGBA', (HEAD_W, HEAD_H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ol)
    for y in range(HEAD_H):
        for x in range(HEAD_W):
            if px[x, y][3] > 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < HEAD_W and 0 <= ny < HEAD_H and px[nx, ny][3] == 0:
                        od.point((nx, ny), BLACK)
    out.alpha_composite(ol)
    out.alpha_composite(small)
    return out


def draw_body(d, frame, stride, bob, reach):
    """Everything below the neck. `reach` > 0 = arms thrown forward (catch)."""
    top = 26 + bob                      # shoulder line

    # --- legs: long spindly stilts, alternating stride --------------------
    d.rectangle((22 + stride, 50 + bob, 26 + stride, GROUND - 3), fill=BLACK)
    d.rectangle((30 - stride, 50 + bob, 34 - stride, GROUND - 3), fill=BLACK)
    d.rectangle((18 + stride, GROUND - 3, 28 + stride, GROUND), fill=SHOE)   # pointy shoes
    d.rectangle((29 - stride, GROUND - 3, 39 - stride, GROUND), fill=SHOE)

    # --- torso: vertical candy-cane stripes (sinister barber pole) --------
    x0, y0, x1, y1 = 20, top + 1, 38, 52 + bob
    d.rectangle((x0, y0, x1, y1), fill=RED)
    for sx in range(x0, x1, 6):
        d.rectangle((sx, y0, sx + 3, y1), fill=BLACK)
    d.rectangle((x0 - 3, y0, x1 + 3, y0 + 3), fill=RED_LIGHT)   # collar
    d.rectangle((26, y0 + 2, 31, y0 + 5), fill=PALE)            # bow tie

    # --- arms -------------------------------------------------------------
    swing = -3 if frame == 0 else (3 if frame == 2 else 0)
    if reach:
        # Reaching forward for the grab, with clawed hands.
        d.rectangle((38, top + 6, 51, top + 10), fill=RED_LIGHT)
        d.rectangle((38, top + 13, 49, top + 17), fill=RED_LIGHT)
        d.rectangle((50, top + 3, 54, top + 12), fill=PALE)
        d.rectangle((47, top + 12, 52, top + 20), fill=PALE)
    else:
        d.rectangle((14, top + 5 + swing, 19, top + 24 + swing), fill=RED_LIGHT)
        d.rectangle((39, top + 5 - swing, 44, top + 24 - swing), fill=RED_LIGHT)


def draw_cane(d, tripping):
    """The candy cane he keeps tripping over."""
    cx = 45 if not tripping else 47
    cy = 31 if not tripping else 45
    d.rectangle((cx, cy, cx + 3, cy + 31), fill=PALE)
    for s in range(0, 31, 8):                       # red twist
        d.rectangle((cx, cy + s, cx + 3, cy + s + 3), fill=RED_LIGHT)
    d.rectangle((cx, cy - 7, cx + 9, cy - 4), fill=PALE)        # hook
    d.rectangle((cx + 6, cy - 7, cx + 9, cy + 1), fill=RED_LIGHT)


def build_frame(i, head):
    """One 48x72 frame."""
    img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    tripping = 4 <= i <= 6
    catching = i >= 7

    # run cycle: 0/2 are the extended strides, 1/3 the passing poses (+bob)
    stride = 5 if i == 0 else (-5 if i == 2 else 0)
    bob = 1 if i in (1, 3) else 0
    if tripping:
        stride, bob = 6, 0
    if catching:
        stride, bob = (3 if i == 7 else -3), 0

    draw_cane(d, tripping)
    draw_body(d, i, stride, bob, reach=catching)
    img.alpha_composite(head, ((FW - HEAD_W) // 2, 1 + bob))

    if tripping:
        # Rotate the whole pratfall about his feet, on an oversized canvas so
        # nothing is lost, then re-seat the result inside the frame: feet on
        # the ground line, body centred. Without this the head of the deepest
        # trip pose rotates clean out of the 48px-wide frame.
        ang = {4: -10, 5: -30, 6: -56}[i]
        pad = Image.new('RGBA', (FW * 3, FH * 2), (0, 0, 0, 0))
        pad.alpha_composite(img, (FW, FH))
        pad = pad.rotate(ang, resample=Image.NEAREST, center=(FW + FW // 2, FH * 2 - 2))
        bb = pad.getbbox()
        body = pad.crop(bb)
        if body.width > FW:                      # deep poses go wide; keep the head
            body = body.crop((body.width - FW, 0, body.width, body.height))
        img = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        img.alpha_composite(body, ((FW - body.width) // 2, max(0, FH - body.height)))
        if i == 6:                                   # cartoon impact star
            d2 = ImageDraw.Draw(img)
            d2.rectangle((3, 16, 12, 19), fill=WARN)
            d2.rectangle((6, 13, 9, 22), fill=WARN)
    return img


def main():
    if not os.path.exists(PHOTO):
        raise SystemExit('reference photo not found: ' + PHOTO)
    head = build_head()
    sheet = Image.new('RGBA', (FW * COUNT, FH), (0, 0, 0, 0))
    for i in range(COUNT):
        sheet.alpha_composite(build_frame(i, head), (i * FW, 0))
    if OUT_SCALE != 1:                     # NEAREST: stays pixel-crisp
        sheet = sheet.resize((sheet.width * OUT_SCALE, sheet.height * OUT_SCALE), Image.NEAREST)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.save(OUT)
    print('wrote %s  (%dx%d, %d frames of %dx%d)'
          % (OUT, sheet.width, sheet.height, COUNT, FW * OUT_SCALE, FH * OUT_SCALE))


if __name__ == '__main__':
    main()
