/* =====================================================================
 * SCAPE AHN!  --  Ahn.js   (the evil candy man)
 * ---------------------------------------------------------------------
 * AHN is a pressure gauge you can see. He has NO hitbox and cannot end
 * the run by touching the player -- obstacles do that. His screen X is a
 * rubber band:
 *
 *     targetX = lerp(X_FAR, X_NEAR, intensity)   // ramps in with difficulty
 *             + hits * HIT_PUSH                  // punished: he gains ground
 *             - nearMissCredit                   // rewarded: he falls back
 *
 * When the player pulls far enough ahead he periodically trips over his
 * own candy cane. Pure comedy, zero gameplay effect.
 * ===================================================================== */

class Ahn extends Phaser.GameObjects.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, ASSETS.ahn.key, 0);
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setDepth(15);                 // behind the player, in front of the parallax

    this.targetX = x;
    this.credit = 0;                   // accumulated near-miss "skill credit" (px of pushback)
    this.tripping = false;
    this.catching = false;
    this.nextTripAt = scene.time.now + Phaser.Math.Between(AHN.TRIP_MIN_DELAY, AHN.TRIP_MAX_DELAY);
    this.baseY = y;

    this.play('ahn-run');
    // Recover from the trip gag and get back to the chase.
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, (anim) => {
      if (anim.key === 'ahn-trip') {
        this.tripping = false;
        this.setAngle(0);
        this.play('ahn-run');
      }
    });
  }

  /** Near miss => he loses a bit of ground. Called by GameScene. */
  addCredit(px) { this.credit = Math.min(AHN.CREDIT_MAX, this.credit + px); }

  /**
   * @param {number} dt        seconds since last frame
   * @param {number} intensity 0..1 difficulty ramp
   * @param {number} hits      hits the player has taken so far
   */
  tick(dt, intensity, hits) {
    if (this.catching) return;         // the game-over sequence drives him instead

    // Skill credit bleeds off, so pushback has to be re-earned.
    this.credit = Math.max(0, this.credit - AHN.CREDIT_DECAY * dt);

    const base = Phaser.Math.Linear(AHN.X_FAR, AHN.X_NEAR, intensity);
    this.targetX = Math.min(AHN.X_MAX, base + hits * AHN.HIT_PUSH - this.credit);

    // Exponential ease toward the target -- frame-rate independent.
    const t = 1 - Math.pow(1 - AHN.FOLLOW_LERP, dt);
    this.x = Phaser.Math.Linear(this.x, this.targetX, t);

    // Loping bob so he reads as running even while nearly stationary on screen.
    if (!this.tripping) this.y = this.baseY + Math.sin(this.scene.time.now * 0.011) * 3;

    this.maybeTrip();
  }

  /** Comedic pratfall: only when the player has genuinely pulled ahead. */
  maybeTrip() {
    if (this.tripping || this.catching) return;
    const now = this.scene.time.now;
    if (now < this.nextTripAt) return;
    if (this.x > AHN.TRIP_WHEN_X_BELOW) return;    // still too close to be funny

    this.tripping = true;
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
    this.setAngle(0);
    this.play('ahn-catch');
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this, x: targetX, y: this.baseY,
      duration: 520, ease: 'Back.easeIn',
      onComplete: () => { if (onArrive) onArrive(); },
    });
  }
}
