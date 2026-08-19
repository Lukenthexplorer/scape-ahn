/* =====================================================================
 * SCAPE AHN!  --  GameOverScene.js
 * ---------------------------------------------------------------------
 * Overlay scene launched on top of the frozen run. Shows the final score,
 * the best score (persisted in localStorage by GameScene) and a restart
 * button. Space / Enter / tap also restart.
 *
 * The backdrop is the illustrated "AHN got you" splash (GAMEOVER.IMAGE,
 * config.js), cover-fit behind the panel. Same resilience as LORE.PANELS:
 * a missing/failed file is skipped rather than shown broken, falling back
 * to a plain dark panel.
 * ===================================================================== */

class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }
  static artKey() { return 'gameoverArt'; }

  preload() {
    this.artFailed = false;
    if (this.textures.exists(GameOverScene.artKey())) return;   // already loaded on a prior run
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file) => {
      if (file.key === GameOverScene.artKey()) this.artFailed = true;
    });
    this.load.image(GameOverScene.artKey(), GAMEOVER.IMAGE);
  }

  create(data) {
    const hasArt = !this.artFailed && this.textures.exists(GameOverScene.artKey());
    if (hasArt) this.buildSplash(data);
    else this.buildFallbackPanel(data);

    // Small delay before accepting input, so the death button-mash does not
    // instantly skip the game-over screen.
    this.time.delayedCall(350, () => {
      this.input.keyboard.once('keydown-SPACE', () => this.restart());
      this.input.keyboard.once('keydown-ENTER', () => this.restart());
      this.input.once('pointerdown', () => this.restart());
    });
  }

  /* --- illustrated splash: full-bleed art + a bottom scrim for the panel */
  buildSplash(data) {
    const F = 'Trebuchet MS, sans-serif';
    const cx = GAME.WIDTH / 2;

    // Cover-fit: scale to fill the canvas, cropping top/bottom overflow --
    // the canvas viewport clips anything outside it, so no explicit mask.
    const tex = this.textures.get(GameOverScene.artKey()).getSourceImage();
    const cover = Math.max(GAME.WIDTH / tex.width, GAME.HEIGHT / tex.height);
    this.add.image(cx, GAME.HEIGHT / 2, GameOverScene.artKey()).setScale(cover).setDepth(0);

    // Bottom scrim: a vertical gradient so the score/button panel is legible
    // while the art still shows through near its top edge.
    const scrimY = GAME.HEIGHT - GAMEOVER.SCRIM_HEIGHT;
    this.add.graphics().setDepth(1)
      .fillGradientStyle(0x0d0710, 0x0d0710, 0x0d0710, 0x0d0710,
        GAMEOVER.SCRIM_TOP, GAMEOVER.SCRIM_TOP, GAMEOVER.SCRIM_BOTTOM, GAMEOVER.SCRIM_BOTTOM)
      .fillRect(0, scrimY, GAME.WIDTH, GAMEOVER.SCRIM_HEIGHT);

    const panel = this.add.container(cx, GAME.HEIGHT / 2).setDepth(2);

    panel.add(this.add.text(0, -224, 'AHN GOT YOU!', {
      fontFamily: F, fontSize: '46px', color: PAL.uiAccent, stroke: '#2b0d1c', strokeThickness: 8,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 26, 'SCORE', {
      fontFamily: F, fontSize: '16px', color: '#d9c3e8', stroke: '#2b0d1c', strokeThickness: 4,
    }).setOrigin(0.5));
    panel.add(this.add.text(0, 58, String(data.score), {
      fontFamily: F, fontSize: '52px', color: '#ffffff', stroke: '#2b0d1c', strokeThickness: 7,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 106, (data.isNewBest ? 'NEW BEST!  ' : 'BEST  ') + data.best, {
      fontFamily: F, fontSize: '22px', color: data.isNewBest ? PAL.uiWarn : '#d9c3e8',
      stroke: '#2b0d1c', strokeThickness: 4,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 136, data.distance + ' m survived', {
      fontFamily: F, fontSize: '15px', color: '#d9c3e8', stroke: '#2b0d1c', strokeThickness: 3,
    }).setOrigin(0.5));

    const btn = this.buildRestartButton(F);
    panel.add(btn);
    panel.add(this.add.text(0, 232, 'space / enter / tap', {
      fontFamily: F, fontSize: '14px', color: '#c9b6d8', stroke: '#2b0d1c', strokeThickness: 3,
    }).setOrigin(0.5));

    panel.setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 320, ease: 'Sine.easeOut' });
  }

  /* --- plain panel, used if the splash art fails to load ---------------- */
  buildFallbackPanel(data) {
    const F = 'Trebuchet MS, sans-serif';
    const cx = GAME.WIDTH / 2;

    // Dim the frozen run behind the panel.
    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x0d0710, 0.72).setOrigin(0, 0);

    const panel = this.add.container(cx, GAME.HEIGHT / 2 + 10);
    const bg = this.add.rectangle(0, 0, 460, 336, 0x1a1024, 0.98).setStrokeStyle(4, 0x8f0f22);
    panel.add(bg);

    panel.add(this.add.text(0, -132, 'AHN GOT YOU!', {
      fontFamily: F, fontSize: '46px', color: PAL.uiAccent, stroke: '#2b0d1c', strokeThickness: 8,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -72, 'SCORE', {
      fontFamily: F, fontSize: '18px', color: '#d9c3e8',
    }).setOrigin(0.5));
    panel.add(this.add.text(0, -40, String(data.score), {
      fontFamily: F, fontSize: '58px', color: '#ffffff', stroke: '#2b0d1c', strokeThickness: 6,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 14, (data.isNewBest ? 'NEW BEST!  ' : 'BEST  ') + data.best, {
      fontFamily: F, fontSize: '24px', color: data.isNewBest ? PAL.uiWarn : '#d9c3e8',
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 46, data.distance + ' m survived', {
      fontFamily: F, fontSize: '16px', color: '#9d86ad',
    }).setOrigin(0.5));

    const btn = this.buildRestartButton(F);
    btn.setY(104);
    panel.add(btn);

    panel.add(this.add.text(0, 146, 'space / enter / tap', {
      fontFamily: F, fontSize: '14px', color: '#7d6a8d',
    }).setOrigin(0.5));

    // Entrance pop.
    panel.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
  }

  /** Shared restart button, styled the same on either background. */
  buildRestartButton(F) {
    const btn = this.add.text(0, 186, 'RUN AGAIN', {
      fontFamily: F, fontSize: '28px', color: '#ffffff',
      backgroundColor: '#8f0f22', padding: { x: 26, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#c8172f' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#8f0f22' }));
    btn.on('pointerup', () => this.restart());
    return btn;
  }

  restart() {
    this.scene.stop('GameOver');
    this.scene.stop('Game');
    this.scene.start('Game');
  }
}
