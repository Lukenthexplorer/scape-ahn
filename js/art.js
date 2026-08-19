/* =====================================================================
 * SCAPE AHN!  --  art.js
 * ---------------------------------------------------------------------
 * TEXTURE BUILDER.
 *
 * Every character/obstacle sheet is a canvas texture sliced into numbered
 * frames -- byte-for-byte what `this.load.spritesheet()` produces. Frames
 * come from one of two places:
 *
 *   1. REAL ART   : an ASSETS entry with `sources` + `compose` gets its
 *                   frames composited from the supplied PNG files
 *                   (optionally re-posed: offset, squashed, tinted).
 *   2. PLACEHOLDER: anything else is drawn procedurally below.
 *
 * Entries with a `path` skip this file entirely -- BootScene loads them as
 * ordinary spritesheets. That is the end state for every asset.
 * ===================================================================== */

const PlaceholderArt = (function () {

  /* --- tiny drawing helpers (integer rects => crisp at pixelArt scale) ---- */
  const r = (c, x, y, w, h, fill) => { c.fillStyle = fill; c.fillRect(x | 0, y | 0, w | 0, h | 0); };
  const circle = (c, x, y, rad, fill) => {
    c.fillStyle = fill; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  };
  const tri = (c, pts, fill) => {
    c.fillStyle = fill; c.beginPath(); c.moveTo(pts[0], pts[1]);
    c.lineTo(pts[2], pts[3]); c.lineTo(pts[4], pts[5]); c.closePath(); c.fill();
  };

  /* --- tiny 3x5 bitmap font ---------------------------------------------
   * Hand-plotted rather than canvas fillText: a system font rasterised at
   * 5px high is mush, and it would not sit on the pixel grid. Each glyph is
   * five rows of three columns; drawn in DESIGN px, so artScale turns every
   * dot into a clean 2x2 block. Add glyphs as labels need them.
   * --------------------------------------------------------------------- */
  const GLYPHS_3x5 = {
    K: ['X.X', 'XX.', 'X..', 'XX.', 'X.X'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
    M: ['X.X', 'XXX', 'X.X', 'X.X', 'X.X'],
    C: ['XXX', 'X..', 'X..', 'X..', 'XXX'],
    H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'],
  };

  /** Width in design px of `str` rendered with the 3x5 font. */
  function pixelTextWidth(str) { return str.length * 4 - 1; }

  /** Draw `str` at (x, y) as 1px blocks. Unknown characters are skipped. */
  function pixelText(c, x, y, str, color) {
    c.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const g = GLYPHS_3x5[str[i]];
      if (!g) continue;
      for (let row = 0; row < g.length; row++) {
        for (let col = 0; col < 3; col++) {
          if (g[row][col] === 'X') c.fillRect(x + i * 4 + col, y + row, 1, 1);
        }
      }
    }
  }

  /** Image key used for one file inside an ASSETS `sources` list. */
  function sourceKey(assetKey, srcName, index) {
    return assetKey + '__' + srcName + index;
  }

  /**
   * Add a 1px dark keyline around the opaque pixels of every frame.
   * Flat placeholder shapes disappear against a busy background; an outline
   * is what makes them read as game objects. Neighbour lookups are clamped to
   * each frame's own rect so the outline can never bleed into the next frame.
   */
  function outlineFrames(tex, fw, fh, count, color) {
    const ctx = tex.getContext();
    const img = ctx.getImageData(0, 0, fw * count, fh);
    const d = img.data;
    const W = fw * count;
    const at = (x, y) => d[(y * W + x) * 4 + 3];
    const rgb = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16),
                 parseInt(color.slice(5, 7), 16)];
    const writes = [];
    for (let f = 0; f < count; f++) {
      const x0 = f * fw, x1 = x0 + fw - 1;
      for (let y = 0; y < fh; y++) {
        for (let x = x0; x <= x1; x++) {
          if (at(x, y) > 8) continue;                       // already opaque
          const near =
            (x > x0 && at(x - 1, y) > 128) || (x < x1 && at(x + 1, y) > 128) ||
            (y > 0 && at(x, y - 1) > 128) || (y < fh - 1 && at(x, y + 1) > 128);
          if (near) writes.push((y * W + x) * 4);
        }
      }
    }
    writes.forEach((i) => { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; });
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  /**
   * Build one horizontal strip texture and register `count` frames on it,
   * named 0..count-1 (identical to a loaded spritesheet's frame names).
   */
  function strip(scene, key, fw, fh, count, draw, scale) {
    scale = scale || 1;
    // fw/fh are FINAL frame size; the draw callback works in the design grid
    // (fw/scale x fh/scale) and the context does the integer upscale.
    const dw = fw / scale, dh = fh / scale;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, fw * count, fh);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < count; i++) {
      ctx.save();
      ctx.translate(i * fw, 0);
      ctx.scale(scale, scale);          // NEAREST upscale, stays pixel-crisp
      draw(ctx, i, dw, dh);
      ctx.restore();
      tex.add(i, 0, i * fw, 0, fw, fh);
    }
    tex.refresh();
    return tex;
  }

  /* ==================================================================
   * COMPOSITOR -- builds frames out of real source images
   * ================================================================== */

  /**
   * Resample a source image to `kx` x `ky` times its size, NEAREST-neighbour.
   * `ky` defaults to `kx` for a uniform resize; passing both independently is
   * how a character gets squashed/widened without distorting the source
   * pixel grid.
   *
   * Smooth (antialiased) resampling here used to be the plan -- shrink
   * smoothly, then let the strip's integer artScale blow the result back up
   * with smoothing OFF -- but for source art this small (48x48) the smooth
   * shrink blurs edges into soft gradients, and the later nearest upscale
   * just blows that blur up into visible mush instead of clean pixels.
   * Nearest-neighbour at every step keeps colours flat and edges crisp,
   * which reads as real pixel art even at a non-integer scale factor.
   */
  function resampled(img, kx, ky) {
    if (ky == null) ky = kx;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.width * kx));
    cv.height = Math.max(1, Math.round(img.height * ky));
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  }

  /**
   * Rotate an image about its centre, nearest-neighbour, on its own canvas.
   * Same reasoning as `resampled`: smoothing here would soften edges that
   * the later nearest upscale would then blow up into mush. A little
   * stair-stepping on the rotated edge reads as pixel art; a blur does not.
   */
  function rotated(img, deg) {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.translate(cv.width / 2, cv.height / 2);
    c.rotate((deg * Math.PI) / 180);
    c.drawImage(img, -img.width / 2, -img.height / 2);
    return cv;
  }

  /** Returns a canvas holding `img` with a flat colour burned over its pixels. */
  function tinted(img, color, alpha) {
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop';   // respect the sprite's alpha
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }

  /**
   * Draw one composed frame. The source image is bottom-aligned in the frame
   * so the character's feet stay on the ground line across every pose, then
   * the per-frame transforms from `compose` are applied:
   *   dy       - nudge up/down (jump/fall poses)
   *   rotate   - degrees, about the sprite's centre (lean into a jump)
   *   squashY  - vertical scale, still bottom-aligned (duck poses)
   *   tint     - flat colour burn (hurt pose)
   *
   * The asset-level `sourceScale` (or the `sourceScaleX`/`sourceScaleY` pair,
   * for a non-uniform squash/widen) resizes the source art before any of
   * that, which is how a character can be made smaller -- or stockier --
   * than its source files without leaving the pixel grid (see `resampled`).
   */
  function drawComposed(scene, asset, ctx, i, fw, fh) {
    const spec = asset.compose[i];
    if (!spec || !spec.src) return false;

    const key = sourceKey(asset.key, spec.src, spec.i || 0);
    if (!scene.textures.exists(key)) return false;      // file missing -> placeholder

    let img = scene.textures.get(key).getSourceImage();
    const sx = asset.sourceScaleX || asset.sourceScale;
    const sy = asset.sourceScaleY || asset.sourceScale;
    if ((sx && sx !== 1) || (sy && sy !== 1)) img = resampled(img, sx || 1, sy || 1);
    if (spec.rotate) img = rotated(img, spec.rotate);
    const sw = img.width, sh = img.height;
    if (spec.tint) img = tinted(img, spec.tint, spec.tintAlpha != null ? spec.tintAlpha : 0.5);

    const scaleY = spec.squashY || 1;
    const dw = sw;
    const dh = Math.round(sh * scaleY);
    const dx = Math.round((fw - dw) / 2);
    const dy = fh - dh + (spec.dy || 0);                // bottom-aligned

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
    return true;
  }

  /* ==================================================================
   * PLACEHOLDER DRAWINGS
   * ================================================================== */

  /* GIRL fallback -- only used if the real run frames are missing.
   * 48x64, feet on the bottom edge. 0-3 run | 4 jump | 5 fall | 6-7 duck | 8 hurt */
  function drawGirl(c, f) {
    const P = PAL;
    const bounce = (f === 1 || f === 3) ? 1 : 0;
    const top = 10 + bounce;

    if (f <= 5 || f === 8) {
      const ox = (f === 8) ? -3 : 0;
      r(c, 10 + ox, top + 6, 7, 20, P.girlHair);
      circle(c, 24 + ox, top + 8, 9, P.girlSkin);
      r(c, 15 + ox, top - 1, 18, 7, P.girlHair);
      if (f === 8) { r(c, 21 + ox, top + 7, 4, 2, '#000'); r(c, 27 + ox, top + 7, 4, 2, '#000'); }
      else { r(c, 21 + ox, top + 7, 2, 3, '#2b1a2b'); r(c, 28 + ox, top + 7, 2, 3, '#2b1a2b'); }
      r(c, 16 + ox, top + 17, 17, 19, P.girlPink);
      r(c, 14 + ox, top + 30, 21, 7, P.girlPinkDark);
      const armA = (f === 0 || f === 4) ? -3 : 3;
      r(c, 12 + ox, top + 19 + armA, 5, 12, P.girlSkin);
      r(c, 32 + ox, top + 19 - armA, 5, 12, P.girlSkin);
      const fwd = (f === 0) ? 6 : (f === 2) ? -4 : 1;
      r(c, 20 + fwd, 52, 6, 12, P.girlSkin);
      r(c, 22 - fwd, 52, 6, 12, P.girlSkin);
      r(c, 19 + fwd, 61, 9, 3, P.girlPinkDark);
      r(c, 21 - fwd, 61, 9, 3, P.girlPinkDark);
    } else {
      const shift = (f === 7) ? 1 : 0;
      r(c, 6, 40 + shift, 8, 14, P.girlHair);
      circle(c, 20, 44 + shift, 8, P.girlSkin);
      r(c, 16, 50 + shift, 22, 12, P.girlPink);
      r(c, 14, 58 + shift, 26, 5, P.girlPinkDark);
      r(c, 30, 60, 10, 4, P.girlPinkDark);
    }
  }

  /* ==================================================================
   * AHN  --  56x88 design grid (112x176 final at artScale 2).
   * frames: 0-3 run | 4-5 stumble | 6 sprawled | 7-8 catch
   *
   * Follows the comic panels: dark swept hair, round glasses, a grin far too
   * wide, and a lanky candy-cane body. The head is deliberately oversized --
   * roughly 43% of his height against a human's ~13%. That is the joke, so
   * do not "correct" the proportions.
   *
   * Note the deep pratfall (frame 6) is DRAWN, not rotated. Rotating a 66px
   * body about its feet swings the head 40+px sideways, straight out of a
   * 56px frame; the mild stumbles rotate, the full fall is its own pose.
   * ================================================================== */
  function drawAhnHead(c, hx, hy, opts) {
    const P = PAL;
    const grin = (opts && opts.grin) || 1;      // 1 = normal, >1 = manic
    const dazed = opts && opts.dazed;

    r(c, hx + 2, hy + 9, 26, 26, P.ahnSkin);          // face
    r(c, hx, hy + 15, 2, 12, P.ahnSkin);              // ears
    r(c, hx + 28, hy + 15, 2, 12, P.ahnSkin);
    r(c, hx + 3, hy + 32, 24, 3, P.ahnSkinShade);     // jaw shading
    r(c, hx + 4, hy + 35, 22, 2, P.ahnSkinShade);     // chin

    // Hair: a real mass of it, swept up and back off a widow's peak. Thin
    // hair on a head this big just reads as a pale mask.
    r(c, hx + 1, hy + 2, 28, 11, P.ahnHair);
    r(c, hx + 3, hy, 24, 3, P.ahnHair);               // crown
    r(c, hx, hy + 8, 4, 12, P.ahnHair);               // sideburns
    r(c, hx + 26, hy + 8, 4, 12, P.ahnHair);
    r(c, hx + 12, hy + 12, 7, 4, P.ahnHair);          // widow's peak
    r(c, hx + 5, hy - 3, 7, 4, P.ahnHair);            // swept-up tufts
    r(c, hx + 17, hy - 4, 8, 5, P.ahnHair);

    // Round glasses: rims, lenses, and the eyes behind them.
    const eyeY = hy + 21;
    [hx + 8, hx + 22].forEach((ex) => {
      r(c, ex - 4, eyeY - 4, 9, 9, P.ahnBlack);       // rim
      r(c, ex - 3, eyeY - 3, 7, 7, P.ahnLens);        // lens
      if (dazed) {                                     // X eyes for the pratfall
        r(c, ex - 2, eyeY - 2, 5, 1, P.ahnBlack);
        r(c, ex, eyeY - 2, 1, 5, P.ahnBlack);
      } else {
        r(c, ex - 1, eyeY - 1, 3, 4, P.ahnBlack);     // pupil
        r(c, ex, eyeY - 1, 1, 1, '#ffffff');          // glint
      }
    });
    r(c, hx + 12, eyeY, 6, 2, P.ahnBlack);            // bridge

    // Angled brows, kept a pixel clear of the rims -- touching them merges
    // into one dark band and the face loses its expression.
    r(c, hx + 4, hy + 14, 8, 2, P.ahnHair);
    r(c, hx + 19, hy + 14, 8, 2, P.ahnHair);
    r(c, hx + 11, hy + 16, 3, 2, P.ahnHair);          // inward tilt = menace

    // The grin: wide, toothy, clownish.
    const gw = Math.round(16 * grin);
    const gx = hx + 15 - Math.round(gw / 2);
    r(c, gx, hy + 28, gw, 5, P.ahnBlack);
    for (let t = 1; t < gw - 1; t += 3) r(c, gx + t, hy + 28, 2, 3, '#ffffff');
    r(c, gx + 1, hy + 32, gw - 2, 1, '#a33');         // tongue line
  }

  function drawAhnCane(c, x, y, len) {
    const P = PAL;
    r(c, x, y, 4, len, P.ahnPale);
    for (let s = 0; s < len; s += 8) r(c, x, y + s, 4, 4, P.ahnRedLight);
    r(c, x - 6, y - 4, 10, 4, P.ahnPale);             // hook
    r(c, x - 6, y - 4, 4, 8, P.ahnRedLight);
  }

  function drawAhn(c, f) {
    const P = PAL;
    const GROUND = 87;

    /* ---- frame 6: sprawled on his face, cane flung clear ---------------- */
    if (f === 6) {
      // Face-planted: head down at the right where he was heading, torso
      // trailing back up to the left, legs still in the air. Drawn as one
      // connected chain -- the earlier version read as loose debris because
      // the pieces did not touch.
      r(c, 4, 62, 24, 15, P.ahnRed);                  // torso, tipped forward
      for (let s = 0; s < 24; s += 8) r(c, 4 + s, 62, 4, 15, P.ahnBlack);
      r(c, 22, 60, 12, 6, P.ahnRedLight);             // collar meeting the head

      r(c, 4, 44, 6, 19, P.ahnBlack);                 // legs kicked up
      r(c, 12, 40, 6, 23, P.ahnBlack);
      r(c, 1, 41, 11, 4, '#3d0d18');                  // shoes in the air
      r(c, 9, 37, 11, 4, '#3d0d18');

      r(c, 8, 76, 16, 6, P.ahnRedLight);              // arm splayed on the ground
      r(c, 22, 78, 6, 5, P.ahnPale);

      drawAhnHead(c, 24, 48, { grin: 0.7, dazed: true });

      drawAhnCane(c, 2, 22, 16);                      // cane bouncing away
      r(c, 40, 36, 11, 3, PAL.uiWarn);                // impact stars
      r(c, 44, 32, 3, 11, PAL.uiWarn);
      r(c, 20, 28, 7, 2, PAL.uiWarn);
      return;
    }

    const tripping = (f === 4 || f === 5);
    const catching = (f >= 7);

    if (tripping) {
      // Mild stumble: rotate about the feet, nudged right so the head, which
      // swings left as he tips, stays inside the frame.
      const ang = (f === 4 ? -10 : -24) * Math.PI / 180;
      const shift = f === 4 ? 4 : 11;
      c.translate(28 + shift, GROUND);
      c.rotate(ang);
      c.translate(-28, -GROUND);
    }

    const bob = (f === 1 || f === 3) ? 1 : 0;
    const stride = (f === 0) ? 3 : (f === 2) ? -3 : (tripping ? 5 : 0);
    const swing = (f === 0) ? -3 : (f === 2) ? 3 : 0;

    // --- legs -----------------------------------------------------------
    const l1 = 20 + stride, l2 = 32 - stride;
    r(c, l1, 62 + bob, 6, 22, P.ahnBlack);
    r(c, l2, 62 + bob, 6, 22, P.ahnBlack);
    r(c, l1 - 3, GROUND - 3, 11, 4, '#3d0d18');       // pointy shoes
    r(c, l2 - 3, GROUND - 3, 11, 4, '#3d0d18');

    // --- candy cane (behind the arm) -------------------------------------
    drawAhnCane(c, 46, 46 + bob, 34);

    // --- torso: candy-cane stripes ---------------------------------------
    const ty = 41 + bob;
    r(c, 20, ty, 18, 23, P.ahnRed);
    for (let sx = 0; sx < 18; sx += 6) r(c, 20 + sx, ty, 3, 23, P.ahnBlack);
    r(c, 17, ty - 2, 24, 4, P.ahnRedLight);           // collar
    r(c, 26, ty - 1, 6, 4, P.ahnPale);                // bow tie

    // --- arms -------------------------------------------------------------
    if (catching) {
      r(c, 38, ty + 4, 15, 5, P.ahnRedLight);         // reaching for her
      r(c, 38, ty + 13, 12, 5, P.ahnRedLight);
      r(c, 51, ty + 1, 5, 11, P.ahnPale);             // claw
      r(c, 48, ty + 12, 6, 9, P.ahnPale);
    } else {
      r(c, 13, ty + 4 + swing, 6, 26, P.ahnRedLight);
      r(c, 39, ty + 4 - swing, 6, 26, P.ahnRedLight);
    }

    // --- head -------------------------------------------------------------
    drawAhnHead(c, 13, 1 + bob, { grin: catching ? 1.25 : 1 });
  }

  /* KIMCHI JAR -- 36x36, sits on the ground. 2-frame bubbling ferment. */
  function drawKimchi(c, f) {
    const P = PAL;
    r(c, 4, 10, 28, 26, P.kimchiGlass);
    r(c, 4, 10, 28, 3, P.kimchiDark);
    r(c, 2, 5, 32, 6, P.kimchiLid);
    r(c, 2, 3, 32, 3, '#8a5a3d');
    r(c, 7, 18, 22, 15, '#b8452c');
    r(c, 10, 21 + (f ? -1 : 0), 5, 4, '#d9603f');
    r(c, 18, 25 + (f ? 1 : 0), 7, 4, '#e0724a');
    r(c, 14, 28, 4, 3, '#8f2f1e');

    // Paper label, like the jars painted on the comic panels.
    const label = 'KIMCHI';
    const lw = pixelTextWidth(label);              // 23 design px
    r(c, 4, 19, 28, 9, '#f0e2c4');                 // label paper
    r(c, 4, 19, 28, 1, '#d8c49f');                 // top shadow line
    pixelText(c, Math.round((36 - lw) / 2), 21, label, '#8f2f1e');

    r(c, 7, 13, 3, 18, 'rgba(255,255,255,0.28)');  // glass highlight, over the label
    r(c, 4, 33, 28, 3, P.kimchiDark);
  }

  /* SPIKES -- 48x24, grey triangles. Frame 1 adds a glint. */
  function drawSpike(c, f) {
    const P = PAL;
    r(c, 0, 19, 48, 5, P.spikeDark);
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 15;
      tri(c, [x, 21, x + 7, 4, x + 14, 21], P.spikeGrey);
      tri(c, [x + 7, 4, x + 14, 21, x + 10, 21], P.spikeDark);
      if (f === 1) r(c, x + 5, 7, 2, 3, '#ffffff');
    }
  }

  /* K-POP IDOL -- 40x48.
   * 0-1 dance | 2 HIGH pose (duck under) | 3 LOW pose (jump over)
   * The pose frames swap to hot pink so the required input reads instantly. */
  function drawIdol(c, f) {
    const P = PAL;
    const posing = f >= 2;
    const suit = posing ? P.idolPose : (f === 0 ? P.idolA : P.idolB);

    if (f === 2) {
      // HIGH: arms up, legs tucked -- compact silhouette at head height.
      r(c, 5, 6, 6, 14, suit); r(c, 29, 6, 6, 14, suit);       // raised arms
      circle(c, 20, 18, 7, P.girlSkin);                        // head
      r(c, 13, 10, 14, 6, '#2b1a2b');                          // hair
      r(c, 17, 16, 2, 3, '#2b1a2b'); r(c, 22, 16, 2, 3, '#2b1a2b');
      r(c, 14, 24, 12, 12, suit);                              // torso
      r(c, 14, 34, 5, 5, suit); r(c, 22, 34, 5, 5, suit);      // tucked legs
      r(c, 9, 21, 22, 2, '#ffffff');                           // stage-light flare
    } else if (f === 3) {
      // LOW: wide floor stance -- a ground blocker.
      r(c, 1, 36, 38, 5, suit);                                // leg sweep
      circle(c, 20, 24, 7, P.girlSkin);
      r(c, 13, 16, 14, 6, '#2b1a2b');
      r(c, 17, 22, 2, 3, '#2b1a2b'); r(c, 22, 22, 2, 3, '#2b1a2b');
      r(c, 14, 29, 12, 11, suit);
      r(c, 4, 27, 10, 4, suit); r(c, 26, 27, 10, 4, suit);     // arms out
      r(c, 7, 42, 26, 3, 'rgba(255,255,255,0.25)');
    } else {
      // Dance: little side-to-side step.
      const s = (f === 0) ? -2 : 2;
      circle(c, 20 + s, 12, 7, P.girlSkin);
      r(c, 13 + s, 4, 14, 6, '#2b1a2b');
      r(c, 17 + s, 10, 2, 3, '#2b1a2b'); r(c, 22 + s, 10, 2, 3, '#2b1a2b');
      r(c, 14 + s, 18, 12, 15, suit);
      r(c, 9 + s, 20, 5, 10, suit); r(c, 26 + s, 20, 5, 10, suit);
      r(c, 15 + s, 33, 4, 12, suit); r(c, 21 + s, 33, 4, 12, suit);
      r(c, 13 + s, 44, 7, 4, '#2b1a2b'); r(c, 21 + s, 44, 7, 4, '#2b1a2b');
    }
  }

  /* --- phase 2 (subway) obstacles ---------------------------------------- */

  /* TURNSTILE -- 32x36 design, ground obstacle (jump). A waist-high gate;
   * the swing arm bobs a px between frames like the kimchi jar's wobble. */
  function drawTurnstile(c, f) {
    const P = SUBWAY;
    r(c, 2, 4, 5, 30, P.pillar);
    r(c, 25, 4, 5, 30, P.pillar);
    r(c, 3, 8, 4, 6, P.signBg);                       // card reader
    const armY = 14 + (f ? 1 : 0);
    r(c, 6, armY, 20, 4, P.platformEdge);              // hazard-yellow arm
    for (let x = 6; x < 26; x += 6) r(c, x, armY, 3, 4, '#1a1014');
    r(c, 0, 32, 32, 4, P.pillarDark);                  // base plate
  }

  /* LUGGAGE CART -- 44x28 design, ground obstacle (jump), wider than the
   * turnstile. Frame 1 nudges the top suitcase, just enough visual life to
   * not read as a static prop. */
  function drawCart(c, f) {
    const P = SUBWAY;
    circle(c, 8, 25, 3, '#1a1014'); circle(c, 36, 25, 3, '#1a1014');
    r(c, 2, 20, 40, 4, P.pillarDark);                  // bed
    r(c, 2, 6, 3, 16, P.pillar);                        // handle
    r(c, 8, 10 + (f ? 1 : 0), 14, 10, '#8f2f1e');       // suitcase
    r(c, 24, 6, 12, 14, P.wallTrim);                    // suitcase
    r(c, 24, 6, 12, 2, P.platformEdge);                 // strap
  }

  /* HANGING SIGN -- 40x48 design (same grid as the idol), duck obstacle.
   * A dot-matrix departure board; the lit dots shift a step between frames
   * so it reads as an active display rather than a flat sticker. */
  function drawSign(c, f) {
    const P = SUBWAY;
    r(c, 19, 0, 2, 8, P.pillar);                        // hanger rod
    r(c, 4, 8, 32, 20, P.signBg);
    r(c, 4, 8, 32, 3, P.wallTrim);                       // top trim
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 8; col++) {
        if ((col + row + f) % 3 !== 0) r(c, 7 + col * 3, 14 + row * 5, 2, 2, P.signText);
      }
    }
    r(c, 8, 28, 3, 10, P.pillar); r(c, 29, 28, 3, 10, P.pillar);  // support legs
  }

  function drawDust(c) { r(c, 0, 0, 6, 6, '#e8d5f2'); }

  /* CANDY -- 28x28 design, a lollipop. Frame 1 rotates the swirl a little. */
  function drawCandy(c, f) {
    const swirl = f === 0 ? '#ff5c9e' : '#ff8ab4';
    r(c, 13, 16, 2, 12, '#efe3d8');                  // stick
    circle(c, 14, 11, 9, '#fff2f7');                 // candy disc
    circle(c, 14, 11, 7, swirl);
    circle(c, 14, 11, 4, '#fff2f7');
    circle(c, 14, 11, 2, swirl);
    r(c, 10, 5, 3, 2, 'rgba(255,255,255,0.8)');      // highlight
  }

  /* SPEED STREAK -- 26x2 horizontal line, drawn at final size. */
  function drawStreak(c) {
    r(c, 0, 0, 26, 2, 'rgba(255,214,240,0.55)');
    r(c, 18, 0, 8, 2, 'rgba(255,255,255,0.9)');   // brighter leading end
  }

  /* RAINDROP -- 2x14, drawn at final size (no artScale). */
  function drawDrop(c) {
    r(c, 0, 0, 2, 14, 'rgba(190,214,255,0.55)');
    r(c, 0, 0, 2, 4, 'rgba(226,238,255,0.85)');
  }

  function drawHeart(c, f) {
    const fill = f === 0 ? '#ff5c7a' : '#4a3355';
    r(c, 2, 2, 6, 6, fill); r(c, 12, 2, 6, 6, fill);
    r(c, 2, 6, 16, 5, fill); r(c, 4, 11, 12, 3, fill); r(c, 7, 14, 6, 3, fill);
    if (f === 1) r(c, 5, 5, 10, 6, '#2b1c36');
  }

  const DRAWERS = {
    girl: drawGirl, ahn: drawAhn, kimchi: drawKimchi, spike: drawSpike,
    idol: drawIdol, candy: drawCandy, dust: drawDust, drop: drawDrop, streak: drawStreak,
    heart: drawHeart, turnstile: drawTurnstile, cart: drawCart, sign: drawSign,
  };

  /**
   * Radial vignette used for AHN's proximity pressure. Built as its own
   * texture rather than a tinted rectangle so the darkening falls off
   * smoothly from the edges instead of flatly covering the street.
   */
  function buildVignette(scene, key, w, h) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.30,
                                       w / 2, h / 2, Math.max(w, h) * 0.62);
    g.addColorStop(0, 'rgba(120,0,20,0)');
    g.addColorStop(0.55, 'rgba(120,0,20,0.35)');
    g.addColorStop(1, 'rgba(90,0,14,0.95)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    tex.refresh();
    return tex;
  }

  /**
   * Phase 2's backdrop: a Seoul subway platform, built at the exact pixel
   * size of the street's far/near layers (BG_SRC) so Backdrop's existing
   * scale/split math shows it with no changes -- Backdrop.setLayers() just
   * repoints the same two tileSprites at these keys.
   *
   * Drawn flat + keylined, unlike the street's painted photo, on purpose:
   * the palette/style shift is what sells "somewhere new" the instant it
   * swaps in, before the player has registered a single new obstacle shape.
   * Every repeating element (tile grid, pillars, floor seams) sits on a
   * period that divides BG_SRC.W evenly, so the horizontal tiling loops
   * with no seam.
   *
   * The far layer is built TWICE -- once with its tunnel recesses empty,
   * once with them lit up as a passing train -- rather than painting one
   * shared texture in place and toggling it. A TileSprite bakes its source
   * into an internal repeating pattern at setTexture() time and does not
   * reliably re-bake just because the source texture's pixels changed
   * underneath it; a genuine key swap (Backdrop.setFarTrainFlash()) is what
   * a WebGL TileSprite is guaranteed to pick up.
   */
  const SUBWAY_BAY = 224;                     // 1344 / 224 = 6, divides evenly
  const SUBWAY_RECESS = { x: 96, y: 40, w: 128, hInset: 100 };  // within each bay

  function buildSubwayBackdrop(scene) {
    const P = SUBWAY;
    const FW = BG_SRC.W, FH = BG_SRC.SPLIT_Y;               // 1344 x 504
    const NH = BG_SRC.H - BG_SRC.SPLIT_Y;                   // 264

    // ---- FAR: tiled wall, pillars, ceiling lights, a recess that's either
    // empty or lit up with a passing train -------------------------------
    const buildFar = (key, withTrain) => {
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const tex = scene.textures.createCanvas(key, FW, FH);
      const fc = tex.getContext();
      fc.imageSmoothingEnabled = false;

      fc.fillStyle = P.ceilingDark; fc.fillRect(0, 0, FW, FH);

      const TILE = 28;                                      // 1344 / 28 = 48, divides evenly
      for (let y = 40; y < FH - 20; y += TILE) {
        for (let x = 0; x < FW; x += TILE) {
          fc.fillStyle = ((x / TILE + y / TILE) % 2 === 0) ? P.wallTile : P.wallTileDark;
          fc.fillRect(x, y, TILE - 1, TILE - 1);
        }
      }
      fc.fillStyle = P.wallTrim; fc.fillRect(0, 180, FW, 14);  // metro-line colour band

      const R = SUBWAY_RECESS, rh = FH - R.hInset;
      for (let x = 0; x < FW; x += SUBWAY_BAY) {
        fc.fillStyle = P.pillar; fc.fillRect(x + 20, 10, 26, FH - 30);
        fc.fillStyle = P.pillarDark; fc.fillRect(x + 20, 10, 6, FH - 30);
        fc.fillStyle = P.lightGlow; fc.fillRect(x + 70, 4, 60, 8);   // ceiling fixture

        const rx = x + R.x, ry = R.y;
        fc.fillStyle = '#05070a';
        fc.fillRect(rx, ry, R.w, rh);
        if (!withTrain) continue;
        fc.fillStyle = P.trainBody;
        fc.fillRect(rx, ry + rh * 0.28, R.w, rh * 0.55);
        fc.fillStyle = P.trainWindow;
        for (let wx = rx + 6; wx < rx + R.w - 6; wx += 18) {
          fc.fillRect(wx, ry + rh * 0.36, 12, rh * 0.22);
        }
        fc.fillStyle = P.lightGlow;
        fc.fillRect(rx, ry + rh * 0.14, R.w, 4);              // headlight streak up top
      }
      tex.refresh();
    };
    buildFar(BACKGROUND.SUBWAY_FAR.key, false);
    buildFar(BACKGROUND.SUBWAY_FAR_TRAIN.key, true);

    // ---- NEAR: the platform floor, scrolling under her feet at full speed
    const nearKey = BACKGROUND.SUBWAY_NEAR.key;
    if (scene.textures.exists(nearKey)) scene.textures.remove(nearKey);
    const nearTex = scene.textures.createCanvas(nearKey, FW, NH);
    const nc = nearTex.getContext();
    nc.imageSmoothingEnabled = false;

    nc.fillStyle = P.platformFloor; nc.fillRect(0, 0, FW, NH);
    nc.fillStyle = P.platformEdge; nc.fillRect(0, 0, FW, 10);            // tactile warning strip
    nc.fillStyle = P.pillarDark; nc.fillRect(0, 10, FW, 4);
    const SEAM = 56;                                        // 1344 / 56 = 24, divides evenly
    nc.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < FW; x += SEAM) nc.fillRect(x, 14, 2, NH - 14);   // floor tile seams
    nearTex.refresh();
  }

  /**
   * The station-entrance archway shown briefly in GameScene's phase-2 intro
   * (Nina runs into it and "descends" out of frame as the world changes
   * underneath). A stylised, flat-shaded nod to the ornate ironwork transit
   * entrances of old -- twin lamps, a curved arch, a roundel sign -- redrawn
   * in the same simple-shapes-plus-keyline language as every other
   * placeholder here, not a copy of any one real entrance. Drawn once at
   * final size (it is a one-off prop, not an animated spritesheet).
   */
  function buildMetroEntrance(scene, key) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const W = 150, H = 190;
    const tex = scene.textures.createCanvas(key, W, H);
    const c = tex.getContext();
    c.imageSmoothingEnabled = false;
    const P = SUBWAY;

    // Staircase, receding down into the ground -- drawn first so the arch
    // and its posts sit in front of it.
    for (let i = 0; i < 7; i++) {
      const sy = H - 6 - i * 9;
      c.fillStyle = (i % 2 === 0) ? '#0a0d10' : '#161d22';
      c.fillRect(28, sy, 94, 9);
    }

    // Twin posts.
    c.fillStyle = P.archGreen;
    c.fillRect(16, 44, 11, 106);
    c.fillRect(123, 44, 11, 106);
    c.fillStyle = P.archGreenDark;
    c.fillRect(16, 44, 4, 106);
    c.fillRect(123, 44, 4, 106);

    // Curled tops -- an approximation of ironwork scrollwork, not a trace.
    c.fillStyle = P.archGreen;
    c.beginPath();
    c.moveTo(21, 46); c.quadraticCurveTo(6, 14, 42, 10); c.lineTo(42, 20);
    c.quadraticCurveTo(20, 24, 21, 46); c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(129, 46); c.quadraticCurveTo(144, 14, 108, 10); c.lineTo(108, 20);
    c.quadraticCurveTo(130, 24, 129, 46); c.closePath(); c.fill();

    // Arch bar joining the posts, and the sign it carries.
    c.fillStyle = P.archGreen; c.fillRect(16, 44, 118, 8);
    c.fillStyle = P.signPlate; c.fillRect(38, 16, 74, 24);
    c.fillStyle = P.archGreenDark; c.fillRect(38, 16, 74, 3);
    c.fillRect(38, 37, 74, 3); c.fillRect(38, 16, 3, 24); c.fillRect(109, 16, 3, 24);

    // A roundel "M" on the sign -- reuses the 3x5 font's existing M glyph,
    // scaled up via a context transform (fillRect stays crisp under scale).
    c.save();
    c.translate(66, 20);
    c.scale(3, 3);
    pixelText(c, 0, 0, 'M', P.archGreenDark);
    c.restore();

    // Lamp globes on top of each post.
    circle(c, 21, 12, 7, P.archLamp);
    circle(c, 129, 12, 7, P.archLamp);
    circle(c, 21, 12, 3, P.lightGlow);
    circle(c, 129, 12, 3, P.lightGlow);

    tex.refresh();
  }

  /* ==================================================================
   * PUBLIC
   * ================================================================== */

  /** All source-image files that BootScene must preload, as {key, path}. */
  function sourceFiles() {
    const out = [];
    Object.keys(ASSETS).forEach((name) => {
      const a = ASSETS[name];
      if (a.path || !a.sources) return;
      Object.keys(a.sources).forEach((srcName) => {
        a.sources[srcName].forEach((path, i) => {
          out.push({ key: sourceKey(a.key, srcName, i), path: path });
        });
      });
    });
    return out;
  }

  /** Build every texture that is not a plain loaded spritesheet. */
  function buildAll(scene) {
    buildVignette(scene, 'vignette', GAME.WIDTH, GAME.HEIGHT);
    buildSubwayBackdrop(scene);
    buildMetroEntrance(scene, PHASE2.ENTRANCE_KEY);
    Object.keys(ASSETS).forEach((name) => {
      const a = ASSETS[name];
      if (a.path) return;                       // loaded by BootScene instead
      const draw = DRAWERS[name];
      const tex = strip(scene, a.key, a.frameWidth, a.frameHeight, a.frameCount, (ctx, i, fw, fh) => {
        // Real art first; fall back to the placeholder drawing per frame, so a
        // half-supplied character still produces a complete sheet.
        if (a.compose && drawComposed(scene, a, ctx, i, fw, fh)) return;
        if (draw) draw(ctx, i, fw, fh);
        else console.warn('[art] no placeholder drawer for', name, 'frame', i);
      }, a.artScale || 1);
      if (a.outline) outlineFrames(tex, a.frameWidth, a.frameHeight, a.frameCount, a.outline);
    });
  }

  return { buildAll, sourceFiles, strip, buildVignette };
})();
