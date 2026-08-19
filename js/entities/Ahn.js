/* =====================================================================
 * SCAPE AHN!  --  Ahn.js   (the evil candy man)
 * ---------------------------------------------------------------------
 * AHN is a pressure gauge you can see, hear and feel. His screen X is a
 * rubber band:
 *
 *     targetX = lerp(X_FAR, X_NEAR, intensity)   // ramps in with difficulty
 *             + hits * HIT_PUSH                  // punished: he gains ground
 *             - nearMissCredit                   // rewarded: he falls back
 *
 * He has no hitbox: obstacles are what end a run. His ONE offensive move is
 * the swipe -- if he stays pinned at maximum proximity long enough he takes
 * a telegraphed grab at her, which a jump dodges (see `SWIPE_*` in config).
 *
 * When the player pulls far enough ahead he trips over his own candy cane.
 * ===================================================================== */

class Ahn extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, ASSETS.ahn.key, 0);
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(15);                 // behind the player, in front of the street

    this.targetX = x;
    this.credit = 0;                   // near-miss "skill credit", in px of pushback
    this.tripping = false;
    this.catching = false;
    this.baseY = y;

    this.nextTripAt = scene.time.now + Phaser.Math.Between(AHN.TRIP_MIN_DELAY, AHN.TRIP_MAX_DELAY);
    this.lastTripCleanPx = 0;

    // Swipe state machine: idle -> charging -> telegraph -> strike -> recover
    this.swipeState = 'idle';
    this.swipeT = 0;
    this.onSwipeStrike = null;         // set by GameScene
    this.onFootstep = null;            // set by GameScene

    this.play('ahn-run');

    // Footfalls: fire once per landing frame of the run cycle. This is what
    // GameScene turns into a camera thump, so his weight is felt.
    this.lastFootFrame = -1;
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (anim, frame) => {
      if (anim.key !== 'ahn-run' || !this.onFootstep) return;
      if (AHN.FOOTSTEP_FRAMES.indexOf(frame.index - 1) !== -1 && frame.index !== this.lastFootFrame) {
        this.lastFootFrame = frame.index;
        this.onFootstep(this.proximity());
      }
    });

    // Recover from the trip gag and get back to the chase.
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim) => {
      if (anim.key === 'ahn-trip') {
        this.tripping = false;
        this.setAngle(0);
        this.play('ahn-run');
      }
    });
  }

  /** 0 = as far back as he ever gets, 1 = right on her shoulder. */
  proximity() {
    return Phaser.Math.Clamp((this.x - AHN.X_FAR) / (AHN.X_MAX - AHN.X_FAR), 0, 1);
  }

  /** Near miss or candy => he loses a bit of ground. */
  addCredit(px) { this.credit = Math.min(AHN.CREDIT_MAX, this.credit + px); }

  /**
   * @param {number} dt        seconds since last frame
   * @param {number} intensity 0..1 difficulty ramp
   * @param {number} hits      hits the player has taken so far
   * @param {number} cleanPx   px travelled since the last hit
   */
  tick(dt, intensity, hits, cleanPx) {
    if (this.catching) return;         // the game-over sequence drives him instead

    // Skill credit bleeds off, so pushback has to be re-earned.
    this.credit = Math.max(0, this.credit - AHN.CREDIT_DECAY * dt);

    const base = Phaser.Math.Linear(AHN.X_FAR, AHN.X_NEAR, intensity);
    this.targetX = Math.min(AHN.X_MAX, base + hits * AHN.HIT_PUSH - this.credit);

    // Exponential ease toward the target -- frame-rate independent.
    const t = 1 - Math.pow(1 - AHN.FOLLOW_LERP, dt);
    this.x = Phaser.Math.Linear(this.x, this.targetX, t);

    // Loping bob so he reads as running even while nearly stationary on screen.
    if (!this.tripping) this.y = this.baseY + Math.sin(this.scene.time.now * 0.007) * 3;

    this.updateSwipe(dt);
    this.maybeTrip(cleanPx);
  }

  /* ------------------------------------------------------------------
   * THE SWIPE
   * ------------------------------------------------------------------ */
  updateSwipe(dt) {
    if (!AHN.SWIPE_ENABLED || this.tripping) return;
    this.swipeT += dt * 1000;
    const pinned = this.x >= AHN.X_MAX - 6;

    if (this.swipeState === 'idle') {
      if (!pinned) { this.swipeT = 0; return; }
      if (this.swipeT >= AHN.SWIPE_CHARGE_MS) { this.beginTelegraph(); }
    } else if (this.swipeState === 'telegraph') {
      if (this.swipeT >= AHN.SWIPE_TELEGRAPH_MS) {
        this.swipeState = 'recover';
        this.swipeT = 0;
        this.play('ahn-run');
        this.setScale(1);
        if (this.onSwipeStrike) this.onSwipeStrike();   // GameScene decides hit/miss
        this.credit += AHN.SWIPE_PUSHBACK;              // he over-commits and drops back
      }
    } else if (this.swipeState === 'recover' && this.swipeT >= AHN.SWIPE_RECOVER_MS) {
      this.swipeState = 'idle';
      this.swipeT = 0;
    }
  }

  beginTelegraph() {
    this.swipeState = 'telegraph';
    this.swipeT = 0;
    this.play('ahn-catch');
    // Rear back, then lunge: unmistakable, and long enough to react to.
    this.scene.tweens.add({
      targets: this, scaleX: 1.14, scaleY: 1.14,
      duration: AHN.SWIPE_TELEGRAPH_MS * 0.7, yoyo: true, ease: 'Quad.easeIn',
    });
    if (this.onSwipeTelegraph) this.onSwipeTelegraph();
  }

  /* ------------------------------------------------------------------
   * COMEDY
   * ------------------------------------------------------------------ */
  /**
   * Pratfall. Two triggers, because gating it purely on near-miss credit
   * meant a good player could go a whole run without ever seeing the gag:
   *   - you banked enough near-miss credit, or
   *   - you have simply run clean for a long stretch.
   */
  maybeTrip(cleanPx) {
    if (this.tripping || this.catching || this.swipeState !== 'idle') return;
    const now = this.scene.time.now;
    if (now < this.nextTripAt) return;

    const earnedBySkill = this.credit >= AHN.TRIP_CREDIT_MIN;
    const earnedByStreak = (cleanPx - this.lastTripCleanPx) >= AHN.TRIP_CLEAN_PX;
    if (!earnedBySkill && !earnedByStreak) return;

    this.tripping = true;
    this.lastTripCleanPx = cleanPx;
    this.play('ahn-trip');
    this.scene.tweens.add({                        // faceplant dip
      targets: this, y: this.baseY + 10, duration: 240, yoyo: true, ease: 'Quad.easeOut',
    });
    this.nextTripAt = now + Phaser.Math.Between(AHN.TRIP_MIN_DELAY, AHN.TRIP_MAX_DELAY);
  }

  /** Game over: he stops rubber-banding and lunges in for the grab. */
  startCatch(targetX, onArrive) {
    this.catching = true;
    this.tripping = false;
    this.swipeState = 'idle';
    this.setAngle(0);
    this.play('ahn-catch');
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.scene.tweens.add({
      targets: this, x: targetX, y: this.baseY,
      duration: 700, ease: 'Back.easeIn',
      onComplete: () => { if (onArrive) onArrive(); },
    });
  }
}
