/* =====================================================================
 * SCAPE AHN!  --  Backdrop.js
 * ---------------------------------------------------------------------
 * The Seoul candy-shop street, split into two scrolling layers.
 *
 * The source art is one image, so tools/make_background_layers.py cuts it
 * at BG_SRC.SPLIT_Y -- the back edge of the sidewalk. Everything above that
 * line (sky, skyline, shopfronts) drifts slowly for depth; everything below
 * it (pavement, curb, platform wall) scrolls at full world speed so the
 * ground never appears to slide under the girl's feet.
 *
 * The cut is invisible because nothing vertical crosses it: below the line
 * the art is flat pavement.
 * ===================================================================== */

class Backdrop {
  constructor(scene) {
    const s = GAME.BG_SCALE;                       // one source copy spans the canvas
    const splitY = Math.round(BG_SRC.SPLIT_Y * s); // = 360 on screen

    this.far = scene.add.tileSprite(0, 0, GAME.WIDTH, splitY, BACKGROUND.FAR.key)
      .setOrigin(0, 0).setDepth(0);
    this.far.setTileScale(s, s);

    this.near = scene.add.tileSprite(0, splitY, GAME.WIDTH, GAME.HEIGHT - splitY, BACKGROUND.NEAR.key)
      .setOrigin(0, 0).setDepth(2);
    this.near.setTileScale(s, s);
  }

  /** @param {number} d world px scrolled this frame */
  scroll(d) {
    // tilePosition is in SOURCE px, so divide out the display scale.
    this.far.tilePositionX += (d * BACKGROUND.FAR.factor) / GAME.BG_SCALE;
    this.near.tilePositionX += (d * BACKGROUND.NEAR.factor) / GAME.BG_SCALE;
  }
}
