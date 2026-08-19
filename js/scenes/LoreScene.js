/* =====================================================================
 * SCAPE AHN!  --  LoreScene.js
 * ---------------------------------------------------------------------
 * The opening comic. Runs before the title screen: Boot -> Lore -> Title.
 *
 * Panel list lives in LORE.PANELS (js/config.js) -- this file has no idea
 * how many panels there are, so extending the story is a one-line change
 * in config. Panels that fail to load are dropped, which means you can
 * list future panels before their art exists.
 *
 * Controls: tap / click / Space / Enter advances, SKIP jumps to the menu.
 * ===================================================================== */

class LoreScene extends Phaser.Scene {
  constructor() { super('Lore'); }

  /**
   * Ask the browser to actually fetch the caption face. Safe to call more
   * than once (BootScene warms it up so it is usually ready before the first
   * panel is drawn). Resolves false if the font is unavailable, in which case
   * the caption keeps its monospace fallback and the game carries on.
   */
  static loadCaptionFont() {
    const spec = LORE.CAPTION.SIZE + 'px ' + LORE.CAPTION.FONT;
    if (!document.fonts || !document.fonts.load) return Promise.resolve(false);
    return document.fonts.load(spec)
      .then((fonts) => fonts.length > 0)
      .catch(() => false);
  }

  /** Should the intro play at all? Checked by BootScene. */
  static shouldPlay() {
    if (!LORE.PANELS.length) return false;
    if (DEV.has('nolore')) return false;
    if (LORE.ONCE_PER_SESSION && sessionStorage.getItem(LORE.SESSION_KEY)) return false;
    return true;
  }

  preload() {
    // Panels are loaded here rather than in BootScene so the intro's weight
    // never delays the gameplay assets. Missing files are collected and
    // filtered out in create().
    this.failed = {};
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file) => {
      console.warn('[lore] panel missing, skipping:', file.src);
      this.failed[file.key] = true;
    });
    LORE.PANELS.forEach((panel, i) => this.load.image(this.panelKey(i), panel.img));
  }

  panelKey(i) { return 'lore' + i; }

  create() {
    // Only the panels that actually arrived, image and caption kept together.
    this.panels = LORE.PANELS
      .map((panel, i) => ({ key: this.panelKey(i), text: panel.text || '' }))
      .filter((p) => !this.failed[p.key] && this.textures.exists(p.key));

    if (!this.panels.length) { this.finish(true); return; }

    if (LORE.ONCE_PER_SESSION) sessionStorage.setItem(LORE.SESSION_KEY, '1');

    this.cameras.main.setBackgroundColor('#000000');
    this.index = 0;
    this.busy = true;              // ignores input while a fade is running

    // The panel itself. One image object, re-pointed at each texture, so
    // there is nothing to create or destroy as the story advances.
    this.panel = this.add.image(GAME.WIDTH / 2, GAME.HEIGHT / 2, this.panels[0].key).setDepth(1);
    this.fitPanel();

    this.buildUi();
    this.buildCaption();
    this.setCaption(this.panels[0].text);
    this.bindInput();

    this.cameras.main.fadeIn(LORE.FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
      this.busy = false;
      this.armHint();
    });
  }

  /**
   * Scale the current panel to fill as much of the screen as possible while
   * preserving its aspect ratio. Whatever is left over stays black, which is
   * why the camera background is black: letterbox or pillarbox, never stretch.
   */
  fitPanel() {
    const tex = this.textures.get(this.panel.texture.key).getSourceImage();
    const scale = Math.min(GAME.WIDTH / tex.width, GAME.HEIGHT / tex.height);
    this.panel.setScale(scale);
    this.panel.setPosition(GAME.WIDTH / 2, GAME.HEIGHT / 2);
  }

  /* ==================================================================
   * CAPTION BOX
   * ------------------------------------------------------------------
   * A comic narration card: cream fill, hard black border, pixel font.
   * It has to hold its own over very busy pixel art, which is why it is a
   * solid card rather than text with a shadow.
   *
   * The box is sized to its text after wrapping, not fixed, so a one-line
   * caption does not sit in an oversized frame.
   * ================================================================== */
  buildCaption() {
    const C = LORE.CAPTION;
    this.caption = this.add.container(GAME.WIDTH / 2, 0).setDepth(9);

    this.captionBg = this.add.rectangle(0, 0, 10, 10, C.BG)
      .setStrokeStyle(C.BORDER_PX, C.BORDER);
    this.captionText = this.add.text(0, 0, '', {
      fontFamily: C.FONT + ', ' + C.FALLBACK,
      fontSize: C.SIZE + 'px',
      color: C.COLOR,
      align: 'center',
      lineSpacing: C.LINE_SPACING,
      wordWrap: { width: GAME.WIDTH * C.MAX_WIDTH - C.PAD_X * 2 },
    }).setOrigin(0.5);

    this.caption.add(this.captionBg);
    this.caption.add(this.captionText);

    // Canvas text does NOT reliably trigger a webfont download -- the browser
    // only fetches a font when the DOM asks for it, and Phaser never touches
    // the DOM. So request it explicitly, then re-lay the box out once it
    // lands; without this the caption silently stays in the fallback face.
    LoreScene.loadCaptionFont().then((ok) => {
      if (ok && this.scene.isActive() && this.captionText) this.setCaption(this.currentText);
    });
  }

  setCaption(text) {
    this.currentText = text || '';
    if (!this.currentText) { this.caption.setVisible(false); return; }

    const C = LORE.CAPTION;
    this.caption.setVisible(true);
    this.captionText.setText(this.currentText);

    // Size the card to the wrapped text, then sit it above the dots and hint.
    const w = Math.ceil(this.captionText.width) + C.PAD_X * 2;
    const h = Math.ceil(this.captionText.height) + C.PAD_Y * 2;
    this.captionBg.setSize(w, h);
    this.caption.y = GAME.HEIGHT - C.BOTTOM_MARGIN - h / 2;
  }

  /* ==================================================================
   * UI: skip button, continue hint, progress dots
   * ================================================================== */
  buildUi() {
    const F = 'Trebuchet MS, sans-serif';

    // --- SKIP, top right, small and out of the way --------------------
    this.skipBtn = this.add.text(GAME.WIDTH - 16, 14, 'SKIP', {
      fontFamily: F, fontSize: '16px', color: '#d9c3e8',
      backgroundColor: '#00000088', padding: { x: 10, y: 6 },
    }).setOrigin(1, 0).setDepth(10).setAlpha(0.75).setInteractive({ useHandCursor: true });

    this.skipBtn.on('pointerover', () => this.skipBtn.setAlpha(1).setColor('#ffffff'));
    this.skipBtn.on('pointerout', () => this.skipBtn.setAlpha(0.75).setColor('#d9c3e8'));
    this.skipBtn.on('pointerup', () => this.finish(false));

    // --- "tap to continue", bottom right ------------------------------
    // Built from blocks rather than a glyph so it reads as pixel art.
    this.hint = this.add.container(GAME.WIDTH - 20, GAME.HEIGHT - 22).setDepth(10).setAlpha(0);
    const label = this.add.text(-16, 0, this.sys.game.device.input.touch ? 'TAP' : 'PRESS SPACE', {
      fontFamily: F, fontSize: '14px', color: '#ffffff',
    }).setOrigin(1, 0.5);
    this.hint.add(label);
    // Pixel chevron: five 3px blocks stepping out and back.
    const chev = this.add.graphics();
    chev.fillStyle(0xffd84a, 1);
    [[-6, -6], [-3, -3], [0, 0], [-3, 3], [-6, 6]].forEach(([x, y]) => chev.fillRect(x, y - 1, 3, 3));
    this.hint.add(chev);
    this.hintTween = this.tweens.add({
      targets: this.hint, alpha: { from: 0.45, to: 1 },
      duration: 620, yoyo: true, repeat: -1, paused: true,
    });

    // --- progress dots, bottom centre ---------------------------------
    // Cheap orientation for a multi-panel story: which beat am I on.
    this.dots = this.panels.map((_, i) => this.add.rectangle(
      GAME.WIDTH / 2 + (i - (this.panels.length - 1) / 2) * 14,
      GAME.HEIGHT - 16, 6, 6, 0xffffff, i === 0 ? 0.9 : 0.28,
    ).setDepth(10));
  }

  /** Show the continue hint after a beat, so it never covers a fresh panel. */
  armHint() {
    this.hint.setAlpha(0);
    this.hintTween.pause();
    if (this.hintTimer) this.hintTimer.remove();
    this.hintTimer = this.time.delayedCall(LORE.HINT_DELAY_MS, () => {
      this.hint.setAlpha(0.45);
      this.hintTween.restart();
    });
  }

  refreshDots() {
    this.dots.forEach((d, i) => d.setAlpha(i === this.index ? 0.9 : 0.28));
  }

  /* ==================================================================
   * INPUT
   * ================================================================== */
  bindInput() {
    this.input.on('pointerdown', (p) => {
      // The SKIP button handles its own clicks; Phaser has no event bubbling,
      // so ignore taps that land on it instead of also advancing a panel.
      if (this.skipBtn.getBounds().contains(p.x, p.y)) return;
      Sfx.unlock();          // first gesture of the session: starts the music
      this.advance();
    });
    this.input.keyboard.on('keydown-SPACE', () => { Sfx.unlock(); this.advance(); });
    this.input.keyboard.on('keydown-ENTER', () => { Sfx.unlock(); this.advance(); });
    this.input.keyboard.on('keydown-ESC', () => this.finish(false));
  }

  /* ==================================================================
   * FLOW
   * ================================================================== */
  advance() {
    if (this.busy) return;
    if (this.index >= this.panels.length - 1) { this.finish(false); return; }

    this.busy = true;
    this.hintTween.pause();
    this.hint.setAlpha(0);

    this.cameras.main.fadeOut(LORE.FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.index += 1;
      this.panel.setTexture(this.panels[this.index].key);
      this.fitPanel();
      this.setCaption(this.panels[this.index].text);
      this.refreshDots();
      this.cameras.main.fadeIn(LORE.FADE_MS, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
        this.busy = false;
        this.armHint();
      });
    });
  }

  /** @param {boolean} immediate skip the fade (used when there is nothing to show) */
  finish(immediate) {
    if (this.finishing) return;
    this.finishing = true;
    if (immediate) { this.scene.start('Title'); return; }

    this.busy = true;
    this.cameras.main.fadeOut(LORE.FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE,
      () => this.scene.start('Title'));
  }
}
