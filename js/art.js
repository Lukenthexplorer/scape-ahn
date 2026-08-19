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
   * Resample a source image to `k` times its size, with smoothing ON.
   *
   * This is a deliberate two-step: shrink smoothly here, then let the strip's
   * integer artScale blow the result back up with smoothing OFF. Doing it in
   * one pass instead (drawing the source at k * artScale) would either blur
   * the final sprite or, with nearest, leave ragged uneven pixel blocks.
   * Two steps give a clean sprite that still sits on the same pixel grid as
   * everything else in the game.
   */
  function resampled(img, k) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.width * k));
    cv.height = Math.max(1, Math.round(img.height * k));
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, 0, 0, cv.width, cv.height);
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
   *   squashY  - vertical scale, still bottom-aligned (duck poses)
   *   tint     - flat colour burn (hurt pose)
   *
   * The asset-level `sourceScale` resizes the source art before any of that,
   * which is how a character can be made smaller than its source files
   * without leaving the pixel grid (see `resampled`).
   */
  function drawComposed(scene, asset, ctx, i, fw, fh) {
    const spec = asset.compose[i];
    if (!spec || !spec.src) return false;

    const key = sourceKey(asset.key, spec.src, spec.i || 0);
    if (!scene.textures.exists(key)) return false;      // file missing -> placeholder

    let img = scene.textures.get(key).getSourceImage();
    if (asset.sourceScale && asset.sourceScale !== 1) img = resampled(img, asset.sourceScale);
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

  /* AHN fallback -- only used if assets/sprites/ahn/ahn.png is missing.
   * Drawn at 48x72 to match the generated sheet. */
  function drawAhn(c, f) {
    const P = PAL;
    const tripping = (f >= 4 && f <= 6);
    const catching = (f >= 7);
    if (tripping) {
      const ang = [-10, -30, -56][f - 4] * Math.PI / 180;
      c.translate(24, 70); c.rotate(ang); c.translate(-24, -70);
    }
    const bob = (f === 1 || f === 3) ? 1 : 0;
    const stride = (f === 0) ? 5 : (f === 2) ? -5 : 0;

    r(c, 18 + stride, 48 + bob, 4, 20, P.ahnBlack);
    r(c, 26 - stride, 48 + bob, 4, 20, P.ahnBlack);
    r(c, 16 + stride, 68, 9, 4, '#3d0d18');
    r(c, 25 - stride, 68, 9, 4, '#3d0d18');

    const by = 26 + bob;
    r(c, 16, by, 16, 24, P.ahnRed);
    for (let s = 0; s < 16; s += 6) r(c, 16 + s, by, 3, 24, P.ahnBlack);
    r(c, 14, by, 20, 3, P.ahnRedLight);

    if (catching) {
      r(c, 32, by + 6, 14, 5, P.ahnRedLight);
      r(c, 44, by + 4, 4, 9, P.ahnPale);
    } else {
      const sw = (f === 0) ? -3 : (f === 2) ? 3 : 0;
      r(c, 11, by + 5 + sw, 4, 17, P.ahnRedLight);
      r(c, 33, by + 5 - sw, 4, 17, P.ahnRedLight);
    }

    r(c, 14, 2 + bob, 20, 23, P.ahnPale);            // gaunt head
    r(c, 16, 1 + bob, 16, 6, P.ahnBlack);            // hair
    r(c, 18, 10 + bob, 4, 3, P.ahnBlack);            // eyes
    r(c, 27, 10 + bob, 4, 3, P.ahnBlack);
    r(c, 17, 17 + bob, 14, 4, P.ahnBlack);           // grin
    for (let t = 2; t < 12; t += 4) r(c, 17 + t, 17 + bob, 2, 4, P.ahnPale);

    const cx = tripping ? 40 : 38, cy = tripping ? 42 : 30;
    r(c, cx, cy, 4, 30, P.ahnPale);
    for (let s = 0; s < 30; s += 8) r(c, cx, cy + s, 4, 3, P.ahnRedLight);
    r(c, cx, cy - 6, 9, 3, P.ahnPale);
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
    r(c, 7, 13, 3, 18, 'rgba(255,255,255,0.28)');
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

  function drawDust(c) { r(c, 0, 0, 6, 6, '#e8d5f2'); }

  function drawHeart(c, f) {
    const fill = f === 0 ? '#ff5c7a' : '#4a3355';
    r(c, 2, 2, 6, 6, fill); r(c, 12, 2, 6, 6, fill);
    r(c, 2, 6, 16, 5, fill); r(c, 4, 11, 12, 3, fill); r(c, 7, 14, 6, 3, fill);
    if (f === 1) r(c, 5, 5, 10, 6, '#2b1c36');
  }

  const DRAWERS = {
    girl: drawGirl, ahn: drawAhn, kimchi: drawKimchi, spike: drawSpike,
    idol: drawIdol, dust: drawDust, heart: drawHeart,
  };

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

  return { buildAll, sourceFiles, strip };
})();
