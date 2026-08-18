/* =====================================================================
 * SCAPE AHN!  --  Obstacles.js
 * ---------------------------------------------------------------------
 * One base class + three obstacle types + the procedural spawner.
 *
 * All obstacles are gravity-less Arcade sprites that get pushed left at
 * the current world speed. Each one also tracks its own near-miss state
 * so scoring stays local to the object.
 * ===================================================================== */

/* ---------------------------------------------------------------------
 * BASE
 * ------------------------------------------------------------------- */
class Obstacle extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, textureKey) {
    super(scene, x, y, textureKey, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1);            // anchored at its base, like the player
    this.setDepth(18);
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);

    this.choreoVX = 0;                 // per-type lateral motion added to world scroll
    this.hasBeenAlongside = false;     // did it ever share the player's X band?
    this.minGap = Infinity;            // closest hitbox-to-hitbox distance seen
    this.nearMissScored = false;
    this.hitAlready = false;           // one damage event per obstacle
  }

  applyBody(b) {
    this.body.setSize(b.w, b.h, false);
    this.body.setOffset(b.ox, b.oy);
  }

  /** Scroll left. `speed` is the current world speed in px/s. */
  tickMotion(speed) { this.body.setVelocityX(-speed + this.choreoVX); }

  /**
   * Near-miss bookkeeping. While the obstacle shares the player's X band we
   * record the smallest vertical gap between hitboxes; once it is fully
   * behind the player we decide whether that counted as a near miss.
   * Returns true exactly once, on the frame the bonus should be awarded.
   */
  trackNearMiss(player) {
    if (this.nearMissScored || this.hitAlready || !this.body || !player.body) return false;
    const pb = player.body, ob = this.body;

    const xOverlap = pb.right > ob.left && pb.left < ob.right;
    if (xOverlap) {
      this.hasBeenAlongside = true;
      // Vertical separation between the two boxes (0 while they overlap).
      const gap = Math.max(ob.top - pb.bottom, pb.top - ob.bottom, 0);
      if (gap < this.minGap) this.minGap = gap;
    }

    // Fully cleared and behind her -> judge it.
    if (this.hasBeenAlongside && ob.right < pb.left) {
      this.nearMissScored = true;
      return this.minGap <= SCORE.NEAR_MISS_MARGIN;
    }
    return false;
  }
}

/* ---------------------------------------------------------------------
 * KIMCHI JAR -- ground obstacle, jump over. Some of them rock/roll.
 * ------------------------------------------------------------------- */
class KimchiJar extends Obstacle {
  constructor(scene, x) {
    super(scene, x, GAME.GROUND_Y, ASSETS.kimchi.key);
    this.obstacleType = 'kimchi';
    this.applyBody(OBSTACLES.KIMCHI.body);
    this.play('kimchi-idle');

    // Visual variety only -- the hitbox does not follow the rocking.
    if (Math.random() < OBSTACLES.KIMCHI.wobbleChance) {
      this.setAngle(-OBSTACLES.KIMCHI.wobbleAngle);
      scene.tweens.add({
        targets: this, angle: OBSTACLES.KIMCHI.wobbleAngle,
        duration: OBSTACLES.KIMCHI.wobbleMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
  }
}

/* ---------------------------------------------------------------------
 * SPIKES -- ground obstacle, pure jump-timing.
 * ------------------------------------------------------------------- */
class Spikes extends Obstacle {
  constructor(scene, x) {
    super(scene, x, GAME.GROUND_Y, ASSETS.spike.key);
    this.obstacleType = 'spike';
    this.applyBody(OBSTACLES.SPIKE.body);
    this.play('spike-idle');
  }
}

/* ---------------------------------------------------------------------
 * K-POP IDOL -- lane obstacle with choreography.
 * ---------------------------------------------------------------------
 * The lane (and therefore the required input) is decided at spawn and
 * telegraphed by the idol's Y, so it is always readable:
 *
 *   HIGH lane -> hovers at head height, strikes a raised pose -> DUCK
 *   LOW  lane -> stands on the ground, drops into a wide pose  -> JUMP
 *
 * The choreography is: side-step right, side-step left, strike the pose,
 * then settle into a plain blocking position. Durations are compressed
 * automatically at high speed so the pose always lands before she
 * reaches the player.
 * ------------------------------------------------------------------- */
class IdolDancer extends Obstacle {
  constructor(scene, x, worldSpeed) {
    const cfg = OBSTACLES.IDOL;
    const high = Math.random() < cfg.highChance;
    super(scene, x, high ? GAME.GROUND_Y - cfg.highY : GAME.GROUND_Y, ASSETS.idol.key);

    this.obstacleType = 'idol';
    this.isHigh = high;
    this.applyBody(high ? cfg.bodyHigh : cfg.bodyLow);
    this.play('idol-dance');

    // Compress the routine if she does not have time to finish it before
    // arriving at the player -- otherwise the pose would read too late.
    const travelMs = ((x - PLAYER.X - 140) / Math.max(1, worldSpeed)) * 1000;
    const scale = Phaser.Math.Clamp(travelMs / (cfg.stepMs + cfg.poseMs), 0.35, 1);
    this.stepMs = cfg.stepMs * scale;
    this.poseMs = cfg.poseMs * scale;

    this.phase = 'step';
    this.phaseT = 0;
    this.choreoVX = cfg.stepSpeed;      // drift right (slows her approach) ...
  }

  tickMotion(speed, dt) {
    const cfg = OBSTACLES.IDOL;
    this.phaseT += dt * 1000;

    if (this.phase === 'step') {
      // Halfway through the side-step, reverse the drift for the "step-back".
      this.choreoVX = (this.phaseT < this.stepMs * 0.5) ? cfg.stepSpeed : -cfg.stepSpeed;
      if (this.phaseT >= this.stepMs) {
        this.phase = 'pose';
        this.phaseT = 0;
        this.choreoVX = 0;
        this.play(this.isHigh ? 'idol-pose-high' : 'idol-pose-low');
        // Little pop on the pose beat -- scale only, the hitbox is untouched.
        this.scene.tweens.add({
          targets: this, scaleX: 1.18, scaleY: 1.18, duration: 90, yoyo: true, ease: 'Quad.easeOut',
        });
      }
    } else if (this.phase === 'pose' && this.phaseT >= this.poseMs) {
      this.phase = 'settled';           // locked in as a plain blocker from here on
    }

    super.tickMotion(speed);
  }
}

/* =====================================================================
 * SPAWNER
 * ---------------------------------------------------------------------
 * Distance-driven, NOT time-driven. Gaps are measured in world pixels, so
 * a gap that is jumpable at 400 px/s is still jumpable at 980 px/s -- a
 * timer-based spawner would silently become impossible as speed ramps.
 *
 * Per spawn event:
 *   1. Roll the next gap  : lerp(GAP_START -> GAP_END by intensity) + jitter,
 *                           clamped to GAP_MIN_ABS.
 *   2. Roll the type      : weights interpolate from weightStart to weightEnd,
 *                           so types can phase in over a run.
 *   3. Maybe cluster      : at higher intensity, spawn a second GROUND
 *                           obstacle close behind. Clusters are ground-only
 *                           on purpose -- a jump-then-duck combo at speed is
 *                           unfair, so idols never appear inside a cluster.
 * ===================================================================== */
class ObstacleSpawner {
  constructor(scene, group) {
    this.scene = scene;
    this.group = group;
    this.distanceSinceSpawn = 0;
    this.nextGap = DIFFICULTY.GAP_START;      // first obstacle gets a generous runway
    this.lastType = null;
  }

  reset() {
    this.distanceSinceSpawn = 0;
    this.nextGap = DIFFICULTY.GAP_START;
    this.lastType = null;
  }

  /**
   * @param {number} distanceDelta world px scrolled this frame
   * @param {number} intensity     0..1 difficulty ramp
   * @param {number} speed         current world speed (px/s)
   */
  update(distanceDelta, intensity, speed) {
    this.distanceSinceSpawn += distanceDelta;
    if (this.distanceSinceSpawn < this.nextGap) return;
    this.distanceSinceSpawn = 0;

    const spawnX = GAME.WIDTH + 90;           // just off the right edge
    const type = this.pickType(intensity);
    this.spawnOne(type, spawnX, speed);

    // --- optional cluster (ground obstacles only, see header note) -------
    let clusterExtra = 0;
    const clusterChance = intensity < DIFFICULTY.CLUSTER_MIN_INTENSITY ? 0 :
      Phaser.Math.Linear(DIFFICULTY.CLUSTER_CHANCE_START, DIFFICULTY.CLUSTER_CHANCE_END, intensity);
    if (type !== 'idol' && Math.random() < clusterChance) {
      const second = Math.random() < 0.5 ? 'kimchi' : 'spike';
      this.spawnOne(second, spawnX + DIFFICULTY.CLUSTER_GAP, speed);
      clusterExtra = DIFFICULTY.CLUSTER_GAP;  // the pair must be cleared as one unit
    }

    // --- roll the gap to the NEXT spawn ---------------------------------
    const base = Phaser.Math.Linear(DIFFICULTY.GAP_START, DIFFICULTY.GAP_END, intensity);
    const jitter = Math.random() * DIFFICULTY.GAP_JITTER;
    this.nextGap = Math.max(DIFFICULTY.GAP_MIN_ABS, base + jitter) + clusterExtra;
    this.lastType = type;
  }

  /** Weighted pick with weights interpolated across the difficulty ramp. */
  pickType(intensity) {
    const entries = [OBSTACLES.KIMCHI, OBSTACLES.SPIKE, OBSTACLES.IDOL].map((o) => ({
      type: o.type,
      weight: Math.max(0, Phaser.Math.Linear(o.weightStart, o.weightEnd, intensity)),
    }));

    // Mild anti-repeat so the same obstacle rarely appears three times running.
    entries.forEach((e) => { if (e.type === this.lastType) e.weight *= 0.55; });

    const total = entries.reduce((s, e) => s + e.weight, 0);
    let roll = Math.random() * total;
    for (const e of entries) { roll -= e.weight; if (roll <= 0) return e.type; }
    return 'kimchi';
  }

  spawnOne(type, x, speed) {
    let obs;
    if (type === 'kimchi') obs = new KimchiJar(this.scene, x);
    else if (type === 'spike') obs = new Spikes(this.scene, x);
    else obs = new IdolDancer(this.scene, x, speed);
    this.group.add(obs);
    return obs;
  }
}
