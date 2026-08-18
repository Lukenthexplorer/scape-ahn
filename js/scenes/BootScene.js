/* =====================================================================
 * SCAPE AHN!  --  BootScene.js
 * ---------------------------------------------------------------------
 * Loads real assets (if any are configured), generates placeholders for
 * the rest, registers every animation from the ASSETS manifest, then
 * hands off to the title screen.
 *
 * THE ASSET SWAP HAPPENS HERE, AUTOMATICALLY:
 *   ASSETS.girl.path === null  -> placeholder strip is generated
 *   ASSETS.girl.path === '...' -> load.spritesheet() with the same key
 * Either way the frame indices and animation keys are identical, so no
 * gameplay code changes.
 * ===================================================================== */

class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // --- real spritesheets, only for entries that declare a path ---------
    Object.keys(ASSETS).forEach((name) => {
      const a = ASSETS[name];
      if (!a.path) return;
      this.load.spritesheet(a.key, a.path, {
        frameWidth: a.frameWidth, frameHeight: a.frameHeight,
      });
    });

    // --- individual source frames for composited sheets (see art.js) -----
    PlaceholderArt.sourceFiles().forEach((f) => this.load.image(f.key, f.path));

    // --- the street background, pre-split into parallax layers -----------
    this.load.image(BACKGROUND.FAR.key, BACKGROUND.FAR.path);
    this.load.image(BACKGROUND.NEAR.key, BACKGROUND.NEAR.path);

    // NOTE: audio is NOT loaded here on purpose -- see js/audio.js. It is
    // fetched in the background so a slow track can never stall the boot.

    // Simple loading bar (matters once real assets exist).
    const g = this.add.graphics();
    this.load.on('progress', (p) => {
      g.clear();
      g.fillStyle(0x2b1c36, 1).fillRect(GAME.WIDTH / 2 - 160, GAME.HEIGHT / 2 - 8, 320, 16);
      g.fillStyle(0xff6fa5, 1).fillRect(GAME.WIDTH / 2 - 156, GAME.HEIGHT / 2 - 4, 312 * p, 8);
    });
    this.load.on('complete', () => g.destroy());
  }

  create() {
    // Placeholders for everything without a real asset path.
    PlaceholderArt.buildAll(this);

    // Register animations from the manifest. Explicit frame lists (rather
    // than generateFrameNumbers) keep this identical for generated
    // placeholders and loaded spritesheets alike.
    Object.keys(ASSETS).forEach((name) => {
      const a = ASSETS[name];
      Object.keys(a.anims || {}).forEach((animKey) => {
        if (this.anims.exists(animKey)) return;
        const def = a.anims[animKey];
        this.anims.create({
          key: animKey,
          frames: def.frames.map((f) => ({ key: a.key, frame: f })),
          frameRate: def.frameRate,
          repeat: def.repeat,
        });
      });
    });

    Sfx.init();          // starts background fetch/decode; never blocks
    this.scene.start(DEV.has('skip') ? 'Game' : 'Title');
  }
}

/* =====================================================================
 * TITLE SCREEN
 * ===================================================================== */
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.cameras.main.setBackgroundColor(GAME.BG_COLOR);

    // The real street, so the title screen is the game with the HUD off.
    this.backdrop = new Backdrop(this);

    const girl = this.add.sprite(GAME.WIDTH / 2 + 130, GAME.GROUND_Y, ASSETS.girl.key)
      .setOrigin(0.5, 1).setDepth(20).play('girl-run');
    const ahn = this.add.sprite(GAME.WIDTH / 2 - 40, GAME.GROUND_Y, ASSETS.ahn.key)
      .setOrigin(0.5, 1).setDepth(15).play('ahn-run');
    this.tweens.add({ targets: ahn, y: GAME.GROUND_Y - 5, duration: 420, yoyo: true, repeat: -1 });

    // Scrims: the street art is gorgeous and completely illegible behind text.
    // Everything from here up must also sit above the backdrop's near layer
    // (depth 2), or the bottom half of the UI disappears under the pavement.
    this.add.rectangle(0, 40, GAME.WIDTH, 180, 0x0d0710, 0.62).setOrigin(0, 0).setDepth(40);
    this.add.rectangle(0, 404, GAME.WIDTH, 136, 0x0d0710, 0.62).setOrigin(0, 0).setDepth(40);

    this.add.text(GAME.WIDTH / 2, 86, 'SCAPE AHN!', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '78px', color: PAL.uiAccent,
      stroke: '#2b0d1c', strokeThickness: 10,
    }).setOrigin(0.5).setDepth(50);

    this.add.text(GAME.WIDTH / 2, 150, 'the evil candy man is right behind you', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '20px', color: '#d9c3e8',
    }).setOrigin(0.5).setDepth(50);

    const best = Number(localStorage.getItem(SCORE.BEST_KEY) || 0);
    if (best > 0) {
      this.add.text(GAME.WIDTH / 2, 184, 'BEST  ' + best, {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '22px', color: PAL.uiWarn,
      }).setOrigin(0.5).setDepth(50);
    }

    const prompt = this.add.text(GAME.WIDTH / 2, 432,
      'SPACE / UP / TAP  to jump      DOWN / SWIPE DOWN  to duck', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: '#ffffff',
      }).setOrigin(0.5).setDepth(50);

    const start = this.add.text(GAME.WIDTH / 2, 486, 'PRESS  SPACE  OR  TAP  TO  RUN', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '26px', color: '#ffffff',
      backgroundColor: '#8f0f22', padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: start, alpha: 0.35, duration: 620, yoyo: true, repeat: -1 });
    prompt.setAlpha(0.85);

    const go = () => { Sfx.unlock(); Sfx.playMusic(); this.scene.start('Game'); };
    this.input.keyboard.once('keydown-SPACE', go);
    this.input.keyboard.once('keydown-UP', go);
    this.input.keyboard.once('keydown-ENTER', go);
    this.input.once('pointerdown', go);
  }

  update(_, delta) {
    this.backdrop.scroll(0.22 * delta);   // idle drift, sells the endless run
  }
}
