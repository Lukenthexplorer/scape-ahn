/* =====================================================================
 * SCAPE AHN!  --  GameScene.js
 * ---------------------------------------------------------------------
 * The run itself:
 *   - the difficulty ramp (`intensity`), which paces everything else
 *   - the pattern spawner, obstacles, candy pickups
 *   - scoring, near misses, lives
 *   - AHN's pressure: vignette, footstep shake, and his one attack
 *   - weather, the best-run ghost marker, pause, and the game-over catch
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
    this.cleanDistance = 0;   // px since the last hit; feeds AHN's trip gag
    this.speedBoost = 0;      // sugar rush, as a fraction of base speed (see CANDY)
    this.running = true;
    this.isOver = false;

    this.buildWorld();
    this.buildEntities();
    this.buildHud();
    this.buildOverlays();
    this.bindInput();

    // Obstacles and candy live in plain groups; each member carries its own
    // Arcade body, so the overlap checks below work directly on them.
    this.obstacles = this.add.group();
    this.candies = this.add.group();
    this.spawner = new ObstacleSpawner(this, this.obstacles, this.candies);
    this.physics.add.overlap(this.player, this.obstacles, this.onObstacleHit, null, this);
    this.physics.add.overlap(this.player, this.candies, this.onCandyPickup, null, this);

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

    // Speed lines, only while the sugar rush is up.
    this.streaks = this.add.particles(0, 0, 'streak', {
      x: GAME.WIDTH + 30,
      y: { min: 60, max: GAME.GROUND_Y - 10 },
      speedX: { min: -1500, max: -1000 },
      lifespan: 700,
      quantity: 1,
      frequency: 60,
      alpha: { start: 0.9, end: 0 },
      scaleX: { min: 0.7, max: 1.8 },
      emitting: false,
    }).setDepth(19);

    this.buildWeather();
  }

  buildEntities() {
    this.player = new Player(this, PLAYER.X, GAME.GROUND_Y);
    this.physics.add.collider(this.player, this.floor);

    this.ahn = new Ahn(this, AHN.X_FAR, GAME.GROUND_Y + AHN.Y_OFFSET);

    // His weight, felt: every footfall thumps the camera, harder the closer
    // he is. This is the main reason he reads as a 176px monster rather than
    // a large sprite that happens to be on screen.
    this.ahn.onFootstep = (prox) => {
      if (this.isOver || prox < AHN.FOOTSTEP_FROM) return;
      const t = (prox - AHN.FOOTSTEP_FROM) / (1 - AHN.FOOTSTEP_FROM);
      this.cameras.main.shake(AHN.FOOTSTEP_SHAKE_MS,
        Phaser.Math.Linear(AHN.FOOTSTEP_SHAKE_MIN, AHN.FOOTSTEP_SHAKE_MAX, t), true);
    };
    this.ahn.onSwipeTelegraph = () => this.onSwipeTelegraph();
    this.ahn.onSwipeStrike = () => this.onSwipeStrike();
  }

  spawnDust(x, y, count) { this.dust.emitParticleAt(x, y - 2, count); }

  /* ==================================================================
   * WEATHER  --  rain rolls through in bands, purely cosmetic
   * ================================================================== */
  buildWeather() {
    if (!WEATHER.ENABLED) return;
    this.rainTint = this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x3d6ea8, 0)
      .setOrigin(0, 0).setDepth(80);
    this.rain = this.add.particles(0, 0, 'drop', {
      x: { min: -80, max: GAME.WIDTH + 80 },
      y: -20,
      speedY: { min: 900, max: 1150 },
      speedX: { min: -220, max: -140 },     // slanted, matching the run direction
      lifespan: 900,
      quantity: 3,
      frequency: 24,
      scale: { min: 0.8, max: 1.4 },
      emitting: false,
    }).setDepth(81);
  }

  updateWeather() {
    if (!WEATHER.ENABLED || !this.rain) return;
    // Where we are in the dry -> wet -> dry cycle, as a 0..1 wetness.
    const phase = this.distance % WEATHER.PERIOD_PX;
    let wet = 0;
    if (phase < WEATHER.RAIN_PX) {
      const inRamp = Math.min(1, phase / WEATHER.FADE_PX);
      const outRamp = Math.min(1, (WEATHER.RAIN_PX - phase) / WEATHER.FADE_PX);
      wet = Math.min(inRamp, outRamp);
    }
    this.wetness = wet;
    this.rainTint.setAlpha(wet * WEATHER.TINT_ALPHA);
    if (wet > 0.02) {
      this.rain.emitting = true;
      this.rain.frequency = Phaser.Math.Linear(90, 12, wet);
    } else {
      this.rain.emitting = false;
    }
  }

  /* ==================================================================
   * HUD + OVERLAYS
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

    /* Sugar-rush meter. The bar's full length IS the cap, so hitting the end
     * is what "maxed out" looks like -- the ceiling is shown, not just
     * enforced. Hidden entirely when the boost is zero. */
    this.boostUi = this.add.container(GAME.WIDTH - 20, 92).setDepth(100).setAlpha(0);
    this.boostUi.add(this.add.text(-118, -2, 'SUGAR', {
      fontFamily: F, fontSize: '13px', color: '#ff8ab4',
    }).setOrigin(0, 0.5));
    this.boostUi.add(this.add.rectangle(0, 0, 112, 10, 0x2b1c36)
      .setOrigin(1, 0.5).setStrokeStyle(2, 0x6b4a7a));
    this.boostBar = this.add.rectangle(-110, 0, 0, 6, 0xff5c9e).setOrigin(0, 0.5);
    this.boostUi.add(this.boostBar);
    this.boostMaxText = this.add.text(6, -2, 'MAX!', {
      fontFamily: F, fontSize: '13px', color: PAL.uiWarn,
    }).setOrigin(0, 0.5).setAlpha(0);
    this.boostUi.add(this.boostMaxText);

    // Reserved for the swipe telegraph. General "he's close" pressure is the
    // vignette's job -- a permanent warning label is noise.
    this.warnText = this.add.text(GAME.WIDTH / 2, 40, '', {
      fontFamily: F, fontSize: '38px', color: '#ffd84a', stroke: '#2b0d1c', strokeThickness: 7,
    }).setOrigin(0.5, 0).setDepth(101).setAlpha(0);
  }

  buildOverlays() {
    const F = 'Trebuchet MS, sans-serif';

    // AHN proximity vignette: the pressure gauge you feel rather than read.
    this.vignette = this.add.image(0, 0, 'vignette')
      .setOrigin(0, 0).setDepth(90).setAlpha(0);

    // Pause panel. Built up front and toggled by the scene's own events, so
    // it is already on screen for the frame the scene stops updating on.
    this.pausePanel = this.add.container(GAME.WIDTH / 2, GAME.HEIGHT / 2).setDepth(200);
    this.pausePanel.add(this.add.rectangle(0, 0, GAME.WIDTH, GAME.HEIGHT, 0x0d0710, 0.7));
    this.pausePanel.add(this.add.text(0, -24, 'PAUSED', {
      fontFamily: F, fontSize: '52px', color: PAL.uiAccent, stroke: '#2b0d1c', strokeThickness: 8,
    }).setOrigin(0.5));
    this.pausePanel.add(this.add.text(0, 30, 'P or TAP to resume     M to mute', {
      fontFamily: F, fontSize: '20px', color: '#d9c3e8',
    }).setOrigin(0.5));
    this.pausePanel.setVisible(false);
    this.events.on(Phaser.Scenes.Events.PAUSE, () => this.pausePanel.setVisible(true));
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.pausePanel.setVisible(false));

    this.buildTouchHint();
  }

  /** First-run touch hint. Swipe-down-to-duck is not discoverable otherwise. */
  buildTouchHint() {
    if (!this.sys.game.device.input.touch) return;
    if (localStorage.getItem('scapeahn.seenTouch')) return;
    localStorage.setItem('scapeahn.seenTouch', '1');

    const F = 'Trebuchet MS, sans-serif';
    const hint = this.add.container(0, 0).setDepth(150);
    hint.add(this.add.text(GAME.WIDTH * 0.30, GAME.HEIGHT * 0.34, 'TAP\nto jump', {
      fontFamily: F, fontSize: '26px', color: '#ffffff', align: 'center',
      backgroundColor: '#00000099', padding: { x: 14, y: 10 },
    }).setOrigin(0.5));
    hint.add(this.add.text(GAME.WIDTH * 0.70, GAME.HEIGHT * 0.34, 'SWIPE DOWN\nto duck', {
      fontFamily: F, fontSize: '26px', color: '#ffffff', align: 'center',
      backgroundColor: '#00000099', padding: { x: 14, y: 10 },
    }).setOrigin(0.5));
    this.tweens.add({
      targets: hint, alpha: 0, delay: 3600, duration: 700,
      onComplete: () => hint.destroy(),
    });
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
    /* Pause and mute are bound at the WINDOW, not on the scene.
     * A paused Phaser scene stops running its own input plugin, so a
     * scene-level 'keydown-P' can pause the game but can never un-pause it.
     * Same reason the resume tap is a window listener. Both are torn down on
     * shutdown so restarts do not stack them up. */
    this.onWindowKey = (e) => {
      const k = (e.key || '').toLowerCase();
      if (k === 'p') { e.preventDefault(); this.togglePause(); }
      else if (k === 'm') Sfx.toggleMute();
    };
    this.onWindowPointer = () => {
      if (!this.isOver && this.scene.isPaused()) this.scene.resume();
    };
    window.addEventListener('keydown', this.onWindowKey);
    window.addEventListener('pointerdown', this.onWindowPointer);

    /* ---- touch --------------------------------------------------------
     * Jump fires immediately on touch-down (zero input latency matters far
     * more than gesture purity in a runner). If the finger then drags down
     * past the swipe threshold *within* SWIPE_MAX_MS, we reinterpret the
     * gesture as a duck and cancel the jump that just started. Holding the
     * finger down keeps the duck; lifting it stands her back up.
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
        t.swiped = true;                 // consumed by updateDuck() each frame
        // Undo the jump this gesture started, if it is still fresh.
        if ((this.time.now - t.downAt) <= TOUCH.SWIPE_MAX_MS && this.player.body.velocity.y < 0) {
          this.player.body.setVelocityY(0);
        }
      }
    });

    const endTouch = () => {
      this.touch.active = false;
      this.touch.swiped = false;         // lifting the finger stands her back up
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
      window.removeEventListener('keydown', this.onWindowKey);
      window.removeEventListener('pointerdown', this.onWindowPointer);
    });
  }

  /** Duck is a held state, so it is polled every frame from both input paths. */
  updateDuck() {
    const held = this.keys.down.isDown || this.keys.s.isDown ||
                 (this.touch.active && this.touch.swiped);
    this.player.setDuck(held);
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
       * Speed, spawn gaps, pattern unlocks and AHN's creep all read it,
       * so this one line paces the whole game.
       * ------------------------------------------------------------- */
      const raw = Phaser.Math.Clamp(this.distance / DIFFICULTY.RAMP_DISTANCE, 0, 1);
      this.intensity = Math.pow(raw, DIFFICULTY.RAMP_CURVE);

      // Sugar rush decays continuously, so it has to be re-earned; it rides on
      // top of the ramp and deliberately pushes past SPEED_MAX.
      this.speedBoost = Math.max(0, this.speedBoost - CANDY.BOOST_DECAY * dt);
      const baseSpeed = Phaser.Math.Linear(DIFFICULTY.SPEED_START, DIFFICULTY.SPEED_MAX, this.intensity);
      this.speed = baseSpeed * (1 + this.speedBoost);

      const dDist = this.speed * dt;
      this.distance += dDist;
      this.cleanDistance += dDist;

      /* --- 2. SCROLL THE WORLD -------------------------------------- */
      this.backdrop.scroll(dDist);

      /* --- 3. SPAWN + MOVE OBSTACLES -------------------------------- */
      this.spawner.update(dDist, this.intensity, this.speed);

      // slice(): the list is mutated as things are recycled, and mutating it
      // mid-iteration silently skips the next obstacle.
      this.obstacles.getChildren().slice().forEach((o) => {
        if (!o.active) return;
        o.tickMotion(this.speed, dt);
        if (o.trackNearMiss(this.player)) this.awardNearMiss(o);
        if (o.x < -160) o.deactivate();       // back to the pool
      });
      this.candies.getChildren().slice().forEach((c) => {
        if (!c.active) return;
        c.tickMotion(this.speed, dt);
        if (c.x < -160) c.deactivate();
      });

      /* --- 4. SCORE + MULTIPLIER DECAY ------------------------------ */
      this.score += dDist * SCORE.PER_PIXEL * this.multiplier;
      if (this.multiplier > 1 && (time - this.lastNearMissAt) > SCORE.MULT_DECAY_DELAY) {
        this.multiplier = Math.max(1, this.multiplier - SCORE.MULT_DECAY_RATE * dt);
      }

      /* --- 5. CHARACTERS -------------------------------------------- */
      // Sell the acceleration: the run cycle plays faster as the world does.
      // Driven by real speed, not the ramp, so a sugar rush is visible in her
      // legs and not only in the HUD.
      const speedRatio = this.speed / DIFFICULTY.SPEED_START;
      this.player.anims.timeScale = Phaser.Math.Clamp(0.85 * speedRatio, 0.85, 2.4);
      this.ahn.anims.timeScale = 0.7 + 0.4 * this.intensity;   // he lopes, she sprints

      this.streaks.emitting = this.speedBoost > 0.005;

      this.updateDuck();
      this.player.tick();
      this.ahn.tick(dt, this.intensity, this.hits, this.cleanDistance);

      /* --- 6. DRESSING ---------------------------------------------- */
      this.updateWeather();
      this.updateGhost(dDist);
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

    // Sugar meter: fill is boost/cap, so a full bar reads as "capped".
    const frac = Phaser.Math.Clamp(this.speedBoost / CANDY.BOOST_MAX, 0, 1);
    this.boostUi.setAlpha(frac > 0.01 ? 1 : Math.max(0, this.boostUi.alpha - 0.06));
    this.boostBar.width = 108 * frac;
    this.boostBar.fillColor = frac >= 0.999 ? 0xffd84a : 0xff5c9e;
    this.boostMaxText.setAlpha(frac >= 0.999 ? 1 : 0);

    // Vignette tracks AHN's proximity continuously -- no state, no tweens.
    const prox = this.ahn.proximity();
    const v = Phaser.Math.Clamp((prox - AHN.VIGNETTE_FROM) / (1 - AHN.VIGNETTE_FROM), 0, 1);
    this.vignette.setAlpha(v * v * AHN.VIGNETTE_MAX_ALPHA);   // squared: stays subtle until it matters
  }

  /* ==================================================================
   * BEST-RUN GHOST  --  a line on the road where your best run died
   * ================================================================== */
  updateGhost(dDist) {
    if (!GHOST.ENABLED) return;
    if (this.ghostDone) return;

    if (!this.ghost) {
      const best = Number(localStorage.getItem(GHOST.BEST_DIST_KEY) || 0);
      if (best < GHOST.MIN_DIST) { this.ghostDone = true; return; }
      const ahead = best - this.distance;
      if (ahead > GAME.WIDTH || ahead < 0) return;     // not in view yet
      this.ghost = this.add.container(PLAYER.X + ahead, 0).setDepth(14);
      this.ghost.add(this.add.rectangle(0, GAME.GROUND_Y, 4, 150, 0xffd84a, 0.5).setOrigin(0.5, 1));
      this.ghost.add(this.add.text(0, GAME.GROUND_Y - 158, 'BEST', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: PAL.uiWarn,
        stroke: '#2b0d1c', strokeThickness: 4,
      }).setOrigin(0.5));
      return;
    }

    this.ghost.x -= dDist;
    if (this.ghost.x <= PLAYER.X) {
      this.ghostDone = true;
      this.flourish('NEW BEST!', PAL.uiWarn);
      Sfx.play('nearmiss');
      this.tweens.add({
        targets: this.ghost, alpha: 0, duration: 500,
        onComplete: () => this.ghost.destroy(),
      });
    }
  }

  /** Big centred callout used for milestones. */
  flourish(text, color) {
    const t = this.add.text(GAME.WIDTH / 2, GAME.HEIGHT * 0.34, text, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '44px', color: color,
      stroke: '#2b0d1c', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(120).setScale(0.7);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: t, alpha: 0, y: t.y - 40, delay: 700, duration: 500,
      onComplete: () => t.destroy(),
    });
  }

  /* ==================================================================
   * NEAR MISS + CANDY  --  the risk/reward hooks
   * ================================================================== */
  awardNearMiss(obstacle) {
    // Bonus is scored at the multiplier you HAD when you took the risk; the
    // step up applies to everything after. The popup shows that same number.
    const bonus = Math.round(SCORE.NEAR_MISS_BONUS * this.multiplier);
    this.score += bonus;
    this.multiplier = Math.min(SCORE.MULT_MAX, this.multiplier + SCORE.MULT_STEP);
    this.lastNearMissAt = this.time.now;
    this.ahn.addCredit(AHN.NEARMISS_CREDIT);   // slick play literally pushes AHN back
    Sfx.play('nearmiss');
    this.popup('NEAR MISS +' + bonus, PAL.uiWarn);
  }

  onCandyPickup(player, candy) {
    if (!candy.active || candy.collected) return;
    candy.collected = true;
    const bonus = Math.round(CANDY.SCORE * this.multiplier);
    this.score += bonus;
    this.ahn.addCredit(CANDY.AHN_PUSHBACK);

    const wasCapped = this.speedBoost >= CANDY.BOOST_MAX - 1e-6;
    this.speedBoost = Math.min(CANDY.BOOST_MAX, this.speedBoost + CANDY.BOOST_ADD);

    Sfx.play('candy');
    this.spawnDust(candy.x, candy.y + 20, 10);
    this.popup('+' + bonus + (wasCapped ? '' : '  SPEED+'), '#ff8ab4');
    // A small kick so the acceleration is felt, not only metered.
    this.cameras.main.shake(90, 0.003);
    candy.deactivate();
  }

  popup(text, color) {
    const pop = this.add.text(this.player.x + 30, this.player.y - 74, text, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: color,
      stroke: '#2b0d1c', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(100);
    this.tweens.add({
      targets: pop, y: pop.y - 42, alpha: 0, duration: 700, ease: 'Quad.easeOut',
      onComplete: () => pop.destroy(),
    });
  }

  /* ==================================================================
   * AHN'S SWIPE
   * ================================================================== */
  onSwipeTelegraph() {
    if (this.isOver) return;
    Sfx.play('swipe');
    this.warnText.setText('JUMP!');
    this.tweens.killTweensOf(this.warnText);
    this.warnText.setAlpha(1).setScale(1);
    this.tweens.add({ targets: this.warnText, scale: 1.15, duration: 160, yoyo: true, repeat: 2 });
  }

  onSwipeStrike() {
    this.tweens.add({ targets: this.warnText, alpha: 0, duration: 200 });
    if (this.isOver || this.player.dead) return;

    // Airborne dodges it. On the ground -- ducking included -- it connects.
    if (this.player.onGround) {
      this.applyHit(this.player.x, this.player.y - 40);
    } else {
      this.score += SCORE.NEAR_MISS_BONUS * 2;
      this.multiplier = Math.min(SCORE.MULT_MAX, this.multiplier + SCORE.MULT_STEP * 2);
      this.lastNearMissAt = this.time.now;
      this.popup('DODGED!', PAL.uiWarn);
      Sfx.play('nearmiss');
    }
  }

  /* ==================================================================
   * DAMAGE
   * ================================================================== */
  onObstacleHit(player, obstacle) {
    if (this.isOver || obstacle.hitAlready || !obstacle.active) return;

    // Mark it resolved BEFORE the mercy check. Otherwise an obstacle you walk
    // straight through while invulnerable stays unresolved and later scores a
    // near miss for a gap of zero -- free points for being hit.
    obstacle.hitAlready = true;
    this.applyHit(obstacle.x, obstacle.y);
  }

  /** One place where a hit is resolved, whatever caused it. */
  applyHit(fxX, fxY) {
    if (!this.player.takeHit()) return;        // mercy invulnerability swallowed it

    this.hits += 1;
    this.lives -= 1;
    this.multiplier = 1;                        // combo wiped
    this.cleanDistance = 0;                     // clean-run streak broken
    this.refreshHearts();

    Sfx.play('hit');
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(120, 255, 80, 110);
    this.spawnDust(fxX, fxY, 10);

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
      if (!o.active) return;
      o.body.setVelocityX(0);
      this.tweens.killTweensOf(o);
    });
    this.candies.getChildren().forEach((c) => { if (c.active) c.body.setVelocityX(0); });
    this.warnText.setAlpha(0);
    if (this.rain) this.rain.emitting = false;
    if (this.streaks) this.streaks.emitting = false;
    this.boostUi.setAlpha(0);

    this.cameras.main.shake(260, 0.008);
    this.ahn.startCatch(AHN.X_LUNGE, () => {
      this.cameras.main.shake(220, 0.02);
      this.spawnDust(this.player.x, this.player.y, 16);
      this.tweens.add({ targets: this.player, alpha: 0.35, duration: 260 });

      const finalScore = Math.floor(this.score);
      const best = Number(localStorage.getItem(SCORE.BEST_KEY) || 0);
      const isNewBest = finalScore > best;
      if (isNewBest) {
        localStorage.setItem(SCORE.BEST_KEY, String(finalScore));
        // Distance is stored separately: it is what the ghost marker chases.
        localStorage.setItem(GHOST.BEST_DIST_KEY, String(Math.floor(this.distance)));
      }

      this.time.delayedCall(420, () => {
        this.scene.launch('GameOver', {
          score: finalScore,
          best: Math.max(best, finalScore),
          isNewBest,
          distance: Math.floor(this.distance / SCORE.PX_PER_METRE),
        });
        this.scene.pause();
      });
    });
  }
}
