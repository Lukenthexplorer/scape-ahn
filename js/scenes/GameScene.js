/* =====================================================================
 * SCAPE AHN!  --  GameScene.js
 * ---------------------------------------------------------------------
 * The run itself. Responsibilities:
 *   - build the world (parallax, ground, player, AHN)
 *   - own the difficulty ramp (`intensity`) and world speed
 *   - drive the spawner and recycle off-screen obstacles
 *   - handle input (keyboard + touch)
 *   - scoring, near misses, lives, and the game-over catch sequence
 * ===================================================================== */

class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.cameras.main.setBackgroundColor(GAME.BG_COLOR);
    this.physics.world.gravity.y = GAME.GRAVITY;

    /* ---------- run state ------------------------------------------- */
    // ?dist=12000 starts mid-run -- handy for tuning the late-game curve.
    this.distance = Number(DEV.get('dist')) || 0;   // world px travelled (drives EVERYTHING)
    this.speed = DIFFICULTY.SPEED_START;
    this.intensity = 0;       // 0..1 normalized difficulty ramp
    this.score = 0;
    this.multiplier = 1;
    this.lastNearMissAt = -9999;
    this.lives = PLAYER.LIVES;
    this.hits = 0;
    this.running = true;
    this.isOver = false;

    this.buildWorld();
    this.buildEntities();
    this.buildHud();
    this.bindInput();

    // Obstacles live in a plain group; each one already carries its own
    // Arcade body, so the overlap check below works directly on it.
    this.obstacles = this.add.group();
    this.spawner = new ObstacleSpawner(this, this.obstacles);
    this.physics.add.overlap(this.player, this.obstacles, this.onObstacleHit, null, this);

    // Short grace period so the player is never hit before they can react.
    this.spawner.distanceSinceSpawn = -260;

    Sfx.playMusic();          // no-op if it is already looping from the title
    Sfx.duckMusic(false);
    this.cameras.main.fadeIn(220, 0, 0, 0);
  }

  /* ==================================================================
   * WORLD
   * ================================================================== */
  buildWorld() {
    // The street: far layer drifts, near layer (pavement) runs at full speed.
    this.backdrop = new Backdrop(this);

    // Invisible static body the player actually stands on.
    this.floor = this.add.rectangle(GAME.WIDTH / 2, GAME.GROUND_Y + 24, GAME.WIDTH * 2, 48, 0x000000, 0);
    this.physics.add.existing(this.floor, true);

    // Landing / jump dust. Particle textures are normal assets too.
    this.dust = this.add.particles(0, 0, 'dust', {
      speed: { min: 40, max: 150 }, angle: { min: 170, max: 250 },
      scale: { start: 1, end: 0 }, alpha: { start: 0.8, end: 0 },
      lifespan: { min: 200, max: 420 }, gravityY: 420, emitting: false,
    }).setDepth(12);
  }

  buildEntities() {
    this.player = new Player(this, PLAYER.X, GAME.GROUND_Y);
    this.physics.add.collider(this.player, this.floor);

    this.ahn = new Ahn(this, AHN.X_FAR, GAME.GROUND_Y + AHN.Y_OFFSET);
  }

  spawnDust(x, y, count) { this.dust.emitParticleAt(x, y - 2, count); }

  /* ==================================================================
   * HUD
   * ================================================================== */
  buildHud() {
    const F = 'Trebuchet MS, sans-serif';

    this.scoreText = this.add.text(GAME.WIDTH - 20, 18, '0', {
      fontFamily: F, fontSize: '34px', color: PAL.uiText, stroke: '#2b0d1c', strokeThickness: 5,
    }).setOrigin(1, 0).setDepth(100);

    this.multText = this.add.text(GAME.WIDTH - 20, 58, '', {
      fontFamily: F, fontSize: '22px', color: PAL.uiWarn, stroke: '#2b0d1c', strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(100);

    // Hearts: frame 0 = full, frame 1 = spent. Hidden entirely at 1 life
    // (one-hit-death mode reads better with no HUD clutter).
    this.hearts = [];
    if (PLAYER.LIVES > 1) {
      for (let i = 0; i < PLAYER.LIVES; i++) {
        this.hearts.push(this.add.image(30 + i * 38, 30, 'heart', 0).setScale(0.8).setDepth(100));
      }
    }

    this.warnText = this.add.text(GAME.WIDTH / 2, 34, '', {
      fontFamily: F, fontSize: '24px', color: '#ff5c7a', stroke: '#2b0d1c', strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(100).setAlpha(0);
  }

  refreshHearts() {
    this.hearts.forEach((h, i) => h.setFrame(i < this.lives ? 0 : 1));
  }

  /* ==================================================================
   * INPUT  (keyboard + touch)
   * ================================================================== */
  bindInput() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys({
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      w: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      s: Phaser.Input.Keyboard.KeyCodes.S,
    });

    const jumpDown = () => { Sfx.unlock(); this.player.requestJump(); };
    const jumpUp = () => this.player.releaseJump();
    kb.on('keydown-SPACE', jumpDown); kb.on('keydown-UP', jumpDown); kb.on('keydown-W', jumpDown);
    kb.on('keyup-SPACE', jumpUp);     kb.on('keyup-UP', jumpUp);     kb.on('keyup-W', jumpUp);
    kb.on('keydown-M', () => Sfx.toggleMute());
    kb.on('keydown-P', () => this.togglePause());

    /* ---- touch --------------------------------------------------------
     * Jump fires immediately on touch-down (zero input latency matters far
     * more than gesture purity in a runner). If the finger then drags down
     * past the swipe threshold *within* SWIPE_MAX_MS, we reinterpret the
     * gesture as a duck and cancel the jump that just started. Holding the
     * finger down keeps the duck; lifting it stands back up.
     * ------------------------------------------------------------------ */
    this.touch = { downAt: 0, downY: 0, swiped: false, active: false };

    this.input.on('pointerdown', (p) => {
      Sfx.unlock();
      if (this.isOver) return;
      this.touch = { downAt: this.time.now, downY: p.y, swiped: false, active: true };
      this.player.requestJump();
    });

    this.input.on('pointermove', (p) => {
      const t = this.touch;
      if (!t.active || t.swiped || !p.isDown) return;
      const dy = p.y - t.downY;
      if (dy > TOUCH.SWIPE_DOWN_PX) {
        t.swiped = true;
        // Undo the jump this gesture started, if it is still fresh.
        if ((this.time.now - t.downAt) <= TOUCH.SWIPE_MAX_MS && this.player.body.velocity.y < 0) {
          this.player.body.setVelocityY(0);
        }
        this.player.setDuck(true);
      }
    });

    const endTouch = () => {
      this.touch.active = false;
      if (this.touch.swiped) this.player.setDuck(false);
      this.player.releaseJump();
    };
    this.input.on('pointerup', endTouch);
    this.input.on('pointerupoutside', endTouch);

    // Pause when the tab/window loses focus so you don't die off-screen.
    // Registered on the *game* emitter, so it must be torn down on shutdown
    // or restarts would stack up duplicate listeners.
    this.onBlur = () => { if (!this.isOver) this.scene.pause(); };
    this.onFocus = () => { if (this.scene.isPaused()) this.scene.resume(); };
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.onFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur);
      this.game.events.off(Phaser.Core.Events.FOCUS, this.onFocus);
    });
  }

  togglePause() {
    if (this.isOver) return;
    if (this.scene.isPaused()) this.scene.resume(); else this.scene.pause();
  }

  /* ==================================================================
   * MAIN LOOP
   * ================================================================== */
  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;   // clamp: a stalled tab must not teleport the world

    if (this.running) {
      /* --- 1. DIFFICULTY RAMP ---------------------------------------
       * intensity is normalized distance, shaped by RAMP_CURVE:
       *   curve < 1 -> ramps hard early, then eases (current default)
       *   curve > 1 -> slow burn that spikes late
       * Speed, spawn gaps, obstacle weights and AHN's creep all read it,
       * so this one line paces the whole game.
       * ------------------------------------------------------------- */
      const raw = Phaser.Math.Clamp(this.distance / DIFFICULTY.RAMP_DISTANCE, 0, 1);
      this.intensity = Math.pow(raw, DIFFICULTY.RAMP_CURVE);
      this.speed = Phaser.Math.Linear(DIFFICULTY.SPEED_START, DIFFICULTY.SPEED_MAX, this.intensity);

      const dDist = this.speed * dt;
      this.distance += dDist;

      /* --- 2. SCROLL THE WORLD -------------------------------------- */
      this.backdrop.scroll(dDist);

      /* --- 3. SPAWN + MOVE OBSTACLES -------------------------------- */
      this.spawner.update(dDist, this.intensity, this.speed);

      this.obstacles.getChildren().forEach((o) => {
        o.tickMotion(this.speed, dt);
        if (o.trackNearMiss(this.player)) this.awardNearMiss(o);
        if (o.x < -140) o.destroy();          // recycle off the left edge
      });

      /* --- 4. SCORE + MULTIPLIER DECAY ------------------------------ */
      this.score += dDist * SCORE.PER_PIXEL * this.multiplier;
      if (this.multiplier > 1 && (time - this.lastNearMissAt) > SCORE.MULT_DECAY_DELAY) {
        this.multiplier = Math.max(1, this.multiplier - SCORE.MULT_DECAY_RATE * dt);
      }

      /* --- 5. CHARACTERS -------------------------------------------- */
      // Sell the acceleration: the run cycle plays faster as the world does.
      this.player.anims.timeScale = 0.85 + 0.75 * this.intensity;
      this.ahn.anims.timeScale = 0.9 + 0.6 * this.intensity;

      this.player.tick();
      this.ahn.tick(dt, this.intensity, this.hits);

      this.updateHud();
    } else if (this.player) {
      this.player.tick();
    }
  }

  updateHud() {
    this.scoreText.setText(Math.floor(this.score).toString());
    if (this.multiplier > 1.01) {
      this.multText.setText('x' + this.multiplier.toFixed(2));
      this.multText.setAlpha(1);
    } else {
      this.multText.setAlpha(0);
    }

    // "HE'S CLOSE!" nudge once AHN is breathing down her neck.
    const close = this.ahn.x > AHN.X_NEAR * 0.72;
    if (close && this.warnText.alpha < 1) {
      this.warnText.setText('AHN IS CLOSE!');
      this.tweens.add({ targets: this.warnText, alpha: 1, duration: 200 });
    } else if (!close && this.warnText.alpha > 0) {
      this.tweens.add({ targets: this.warnText, alpha: 0, duration: 300 });
    }
  }

  /* ==================================================================
   * NEAR MISS  --  the risk/reward hook
   * ================================================================== */
  awardNearMiss(obstacle) {
    this.score += SCORE.NEAR_MISS_BONUS * this.multiplier;
    this.multiplier = Math.min(SCORE.MULT_MAX, this.multiplier + SCORE.MULT_STEP);
    this.lastNearMissAt = this.time.now;
    this.ahn.addCredit(AHN.NEARMISS_CREDIT);   // slick play literally pushes AHN back
    Sfx.play('nearmiss');

    const pop = this.add.text(this.player.x + 30, this.player.y - 70, 'NEAR MISS +' +
      Math.round(SCORE.NEAR_MISS_BONUS * this.multiplier), {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: PAL.uiWarn,
        stroke: '#2b0d1c', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: pop, y: pop.y - 42, alpha: 0, duration: 700, ease: 'Quad.easeOut',
      onComplete: () => pop.destroy(),
    });
  }

  /* ==================================================================
   * DAMAGE
   * ================================================================== */
  onObstacleHit(player, obstacle) {
    if (this.isOver || obstacle.hitAlready) return;
    if (!player.takeHit()) return;             // mercy invulnerability swallowed it

    obstacle.hitAlready = true;
    this.hits += 1;
    this.lives -= 1;
    this.multiplier = 1;                        // combo wiped
    this.refreshHearts();

    Sfx.play('hit');
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 255, 80, 110);
    this.spawnDust(obstacle.x, obstacle.y, 10);

    // AHN gains ground immediately -- the hit is felt, not just counted.
    this.ahn.credit = 0;
    this.ahn.x += AHN.HIT_PUSH * 0.6;

    if (this.lives <= 0) this.gameOver();
  }

  /* ==================================================================
   * GAME OVER  --  AHN finally catches her
   * ================================================================== */
  gameOver() {
    if (this.isOver) return;
    this.isOver = true;
    this.running = false;

    Sfx.play('gameover');
    Sfx.duckMusic(true);      // pull the music down under the game-over panel
    this.player.startCaught();

    // Freeze the world; the catch sequence is the only thing still moving.
    this.obstacles.getChildren().forEach((o) => {
      o.body.setVelocityX(0);
      this.tweens.killTweensOf(o);
    });
    this.warnText.setAlpha(0);

    this.cameras.main.shake(260, 0.008);
    this.ahn.startCatch(AHN.X_LUNGE, () => {
      this.cameras.main.shake(220, 0.02);
      this.spawnDust(this.player.x, this.player.y, 16);
      this.tweens.add({ targets: this.player, alpha: 0.35, duration: 260 });

      const finalScore = Math.floor(this.score);
      const best = Number(localStorage.getItem(SCORE.BEST_KEY) || 0);
      const isNewBest = finalScore > best;
      if (isNewBest) localStorage.setItem(SCORE.BEST_KEY, String(finalScore));

      this.time.delayedCall(420, () => {
        this.scene.launch('GameOver', {
          score: finalScore,
          best: Math.max(best, finalScore),
          isNewBest,
          distance: Math.floor(this.distance),
        });
        this.scene.pause();
      });
    });
  }
}
