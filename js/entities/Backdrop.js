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

    this.farCfg = BACKGROUND.FAR;
    this.nearCfg = BACKGROUND.NEAR;

    this.far = scene.add.tileSprite(0, 0, GAME.WIDTH, splitY, this.farCfg.key)
      .setOrigin(0, 0).setDepth(0);
    this.far.setTileScale(s, s);

    this.near = scene.add.tileSprite(0, splitY, GAME.WIDTH, GAME.HEIGHT - splitY, this.nearCfg.key)
      .setOrigin(0, 0).setDepth(2);
    this.near.setTileScale(s, s);
  }

  /** @param {number} d world px scrolled this frame */
  scroll(d) {
    // tilePosition is in SOURCE px, so divide out the display scale.
    this.far.tilePositionX += (d * this.farCfg.factor) / GAME.BG_SCALE;
    this.near.tilePositionX += (d * this.nearCfg.factor) / GAME.BG_SCALE;
  }

  /**
   * Swap to a different layer pair (e.g. BACKGROUND.SUBWAY_FAR/NEAR) for a
   * phase change. Texture only -- every generated layer shares BG_SRC's
   * pixel dimensions, so the scale/split geometry set up in the
   * constructor stays correct with no re-measuring.
   */
  setLayers(farCfg, nearCfg) {
    this.farCfg = farCfg;
    this.nearCfg = nearCfg;
    this.far.setTexture(farCfg.key);
    this.near.setTexture(nearCfg.key);
  }

  /**
   * Swap the far layer to its "a train is passing" texture (or back). Two
   * fully separate pre-built textures (BACKGROUND.SUBWAY_FAR /
   * SUBWAY_FAR_TRAIN), not one repainted in place: a TileSprite bakes its
   * source into an internal repeating pattern at setTexture() time and does
   * not reliably re-bake just because the source texture's pixels changed
   * underneath it -- only a genuine key swap is guaranteed to redraw.
   */
  setFarTrainFlash(on) {
    this.far.setTexture(on ? BACKGROUND.SUBWAY_FAR_TRAIN.key : this.farCfg.key);
  }
}
