/* =====================================================================
 * SCAPE AHN!  --  GameOverScene.js
 * ---------------------------------------------------------------------
 * Overlay scene launched on top of the frozen run. Shows the final score,
 * the best score (persisted in localStorage by GameScene) and a restart
 * button. Space / Enter / tap also restart.
 * ===================================================================== */

class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(data) {
    const F = 'Trebuchet MS, sans-serif';
    const cx = GAME.WIDTH / 2;

    // Dim the frozen run behind the panel.
    this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x0d0710, 0.72).setOrigin(0, 0);

    const panel = this.add.container(cx, GAME.HEIGHT / 2 + 10);
    const bg = this.add.rectangle(0, 0, 460, 300, 0x1a1024, 0.98).setStrokeStyle(4, 0x8f0f22);
    panel.add(bg);

    panel.add(this.add.text(0, -116, 'AHN GOT YOU!', {
      fontFamily: F, fontSize: '46px', color: PAL.uiAccent, stroke: '#2b0d1c', strokeThickness: 8,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, -58, 'SCORE', {
      fontFamily: F, fontSize: '18px', color: '#d9c3e8',
    }).setOrigin(0.5));
    panel.add(this.add.text(0, -26, String(data.score), {
      fontFamily: F, fontSize: '58px', color: '#ffffff', stroke: '#2b0d1c', strokeThickness: 6,
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 26, (data.isNewBest ? 'NEW BEST!  ' : 'BEST  ') + data.best, {
      fontFamily: F, fontSize: '24px', color: data.isNewBest ? PAL.uiWarn : '#d9c3e8',
    }).setOrigin(0.5));

    panel.add(this.add.text(0, 58, Math.floor(data.distance) + ' m survived', {
      fontFamily: F, fontSize: '16px', color: '#9d86ad',
    }).setOrigin(0.5));

    // --- restart button -------------------------------------------------
    const btn = this.add.text(0, 112, 'RUN AGAIN', {
      fontFamily: F, fontSize: '28px', color: '#ffffff',
      backgroundColor: '#8f0f22', padding: { x: 26, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    panel.add(btn);

    btn.on('pointerover', () => btn.setStyle({ backgroundColor: '#c8172f' }));
    btn.on('pointerout', () => btn.setStyle({ backgroundColor: '#8f0f22' }));
    btn.on('pointerup', () => this.restart());

    panel.add(this.add.text(0, 146, 'space / enter / tap', {
      fontFamily: F, fontSize: '14px', color: '#7d6a8d',
    }).setOrigin(0.5));

    // Entrance pop.
    panel.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: panel, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });

    // Small delay before accepting input, so the death button-mash does not
    // instantly skip the game-over screen.
    this.time.delayedCall(350, () => {
      this.input.keyboard.once('keydown-SPACE', () => this.restart());
      this.input.keyboard.once('keydown-ENTER', () => this.restart());
      this.input.once('pointerdown', () => this.restart());
    });
  }

  restart() {
    this.scene.stop('GameOver');
    this.scene.stop('Game');
    this.scene.start('Game');
  }
}
