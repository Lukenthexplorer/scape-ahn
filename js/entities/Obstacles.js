/* =====================================================================
 * SCAPE AHN!  --  Obstacles.js
 * ---------------------------------------------------------------------
 * Obstacle types, the candy pickup, and the pattern-driven spawner.
 *
 * All of them are gravity-less Arcade sprites pushed left at the current
 * world speed. They are POOLED: an obstacle that leaves the screen is
 * deactivated and handed back out on the next spawn, so a long run does
 * not allocate a new sprite every few hundred pixels.
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
    this.resetState();
  }

  /** Per-spawn state. Called by the constructor and again on every reuse. */
  resetState() {
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

  /** Return to the pool: invisible, inert, and ignored by collisions. */
  deactivate() {
    this.scene.tweens.killTweensOf(this);
    this.setActive(false).setVisible(false).setAngle(0).setScale(1);
    this.body.setVelocity(0, 0);
    this.body.enable = false;
  }

  /** Come back out of the pool at `x`. Subclasses extend this. */
  reset(x, y) {
    this.setActive(true).setVisible(true).setAngle(0).setScale(1).setAlpha(1);
    this.setPosition(x, y);
    this.body.enable = true;
    this.resetState();
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
    this.reset(x, GAME.GROUND_Y);
  }

  reset(x) {
    super.reset(x, GAME.GROUND_Y);
    this.applyBody(OBSTACLES.KIMCHI.body);
    this.play('kimchi-idle');

    // Visual variety only -- the hitbox does not follow the rocking.
    if (Math.random() < OBSTACLES.KIMCHI.wobbleChance) {
      this.setAngle(-OBSTACLES.KIMCHI.wobbleAngle);
      this.scene.tweens.add({
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
    this.reset(x);
  }

  reset(x) {
    super.reset(x, GAME.GROUND_Y);
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
 * The routine is side-step, side-step, strike the pose, then settle. It is
 * compressed so the POSE LANDS BY `POSE_BY_X`, not merely before she
 * arrives: at top speed the old version finished ~0.16s before contact,
 * which is far too late to read as a telegraph.
 * ------------------------------------------------------------------- */
class IdolDancer extends Obstacle {
  constructor(scene, x, worldSpeed, forceHigh) {
    super(scene, x, GAME.GROUND_Y, ASSETS.idol.key);
    this.obstacleType = 'idol';
    this.reset(x, worldSpeed, forceHigh);
  }

  reset(x, worldSpeed, forceHigh) {
    const cfg = OBSTACLES.IDOL;
    const high = (forceHigh === undefined) ? (Math.random() < cfg.highChance) : forceHigh;
    this.isHigh = high;

    super.reset(x, high ? GAME.GROUND_Y - cfg.highY : GAME.GROUND_Y);
    this.applyBody(high ? cfg.bodyHigh : cfg.bodyLow);
    this.play('idol-dance');

    // Fit the routine into the distance she has before the read line.
    const readMs = ((x - cfg.POSE_BY_X) / Math.max(1, worldSpeed)) * 1000;
    const scale = Phaser.Math.Clamp(readMs / (cfg.stepMs + cfg.poseMs), 0.28, 1);
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

/* ---------------------------------------------------------------------
 * CANDY -- the only thing on screen you WANT to touch.
 * ------------------------------------------------------------------- */
class Candy extends Obstacle {
  constructor(scene, x, y) {
    super(scene, x, y, ASSETS.candy.key);
    this.obstacleType = 'candy';
    this.setDepth(17);
    this.reset(x, y);
  }

  reset(x, y) {
    super.reset(x, y);
    this.applyBody(CANDY.BODY);
    this.play('candy-spin');
    this.collected = false;
    this.scene.tweens.add({          // gentle bob so it reads as a pickup
      targets: this, y: y - 10, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  trackNearMiss() { return false; }  // pickups never score near misses
}

/* =====================================================================
 * SPAWNER
 * ---------------------------------------------------------------------
 * Emits PATTERNS (js/config.js), not lone obstacles, so the level has a
 * vocabulary instead of noise. Everything is measured in JUMP ARCS and
 * converted to pixels at spawn time, which is what keeps a pattern
 * authored at 400 px/s still fair at 900 px/s.
 * ===================================================================== */
class ObstacleSpawner {
  /** Ground distance covered by one full jump arc at `speed` px/s. */
  static jumpArcPx(speed) {
    return (2 * Math.abs(PLAYER.JUMP_VELOCITY) / GAME.GRAVITY) * speed;
  }

  /**
   * Boot-time sanity check on the authored patterns. Logs, never throws:
   * a bad pattern should be loud while you tune, not fatal.
   */
  static validatePatterns() {
    const DOUBLE = DIFFICULTY.PATTERN_DOUBLE_MAX_ARC;
    const REJUMP = DIFFICULTY.PATTERN_REJUMP_MIN_ARC;
    let bad = 0;
    PATTERNS.forEach((p) => {
      for (let i = 1; i < p.items.length; i++) {
        const gap = p.items[i].gap || 0;
        const involvesDuck = p.items[i].type === 'idol-high' || p.items[i - 1].type === 'idol-high';
        if (involvesDuck && gap < REJUMP) {
          console.warn('[patterns] "' + p.name + '" item ' + i + ': ' + gap +
            ' arcs next to a duck. You cannot duck and jump at once; needs >= ' + REJUMP);
          bad++;
        } else if (!involvesDuck && gap > DOUBLE && gap < REJUMP) {
          console.warn('[patterns] "' + p.name + '" item ' + i + ': ' + gap +
            ' arcs is the unfair zone (too far for one jump, too close to land). ' +
            'Use <= ' + DOUBLE + ' or >= ' + REJUMP);
          bad++;
        }
      }
    });
    if (!bad) console.log('[patterns] ' + PATTERNS.length + ' patterns, all clearable');
    return bad;
  }

  constructor(scene, group, candyGroup) {
    this.scene = scene;
    this.group = group;
    this.candyGroup = candyGroup;
    this.pools = { kimchi: [], spike: [], idol: [], candy: [] };
    this.reset();
  }

  reset() {
    this.distanceSinceSpawn = 0;
    this.nextGap = DIFFICULTY.GAP_START;
    this.lastPattern = null;
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

    const arc = ObstacleSpawner.jumpArcPx(speed);
    const spawnX = GAME.WIDTH + 90;
    const pattern = this.pickPattern(intensity);

    // Lay the pattern out, converting arc-relative gaps into pixels.
    let cursor = 0;
    const placed = [];
    pattern.items.forEach((item) => {
      cursor += (item.gap || 0) * arc;
      placed.push({ item: item, x: spawnX + cursor });
      this.spawnOne(item.type, spawnX + cursor, speed);
    });

    this.maybeSpawnCandy(placed, intensity, arc, speed);

    // Gap to the NEXT pattern: the usual spacing, plus this pattern's length,
    // so dense patterns do not also arrive back-to-back.
    const base = Phaser.Math.Linear(DIFFICULTY.GAP_START, DIFFICULTY.GAP_END, intensity);
    const jitter = Math.random() * DIFFICULTY.GAP_JITTER;
    const floor = Math.max(DIFFICULTY.GAP_MIN_ABS, arc * DIFFICULTY.GAP_MIN_ARC_FRAC);
    this.nextGap = Math.max(floor, base + jitter) + cursor;
    this.lastPattern = pattern.name;
  }

  /** Weighted pick among the patterns unlocked at this intensity. */
  pickPattern(intensity) {
    const usable = PATTERNS.filter((p) =>
      intensity >= (p.minI || 0) && intensity <= (p.maxI !== undefined ? p.maxI : 1));
    if (!usable.length) return PATTERNS[0];

    // Mild anti-repeat so the same phrase rarely plays twice in a row.
    const weights = usable.map((p) => (p.name === this.lastPattern ? p.weight * 0.4 : p.weight));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < usable.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return usable[i];
    }
    return usable[usable.length - 1];
  }

  /**
   * Park a candy at the apex of the jump over the pattern's first ground
   * obstacle -- i.e. exactly where a good jump already puts her. Reward for
   * a jump she was going to make anyway, if she makes it well.
   */
  maybeSpawnCandy(placed, intensity, arc, speed) {
    if (!CANDY.ENABLED || intensity < CANDY.MIN_INTENSITY) return;
    if (Math.random() > CANDY.CHANCE) return;
    const target = placed.find((p) => p.item.type !== 'idol-high');
    if (!target) return;
    const candy = this.obtain('candy', target.x - arc * 0.06, GAME.GROUND_Y - CANDY.HEIGHT, speed);
    this.candyGroup.add(candy);
  }

  /** Pull one from the pool, or build it if the pool is empty. */
  obtain(type, x, y, speed, forceHigh) {
    const poolKey = (type === 'idol-high' || type === 'idol-low') ? 'idol' : type;
    const pool = this.pools[poolKey];
    const spare = pool.find((o) => !o.active);
    if (spare) {
      if (poolKey === 'idol') spare.reset(x, speed, forceHigh);
      else if (poolKey === 'candy') spare.reset(x, y);
      else spare.reset(x);
      return spare;
    }
    let obj;
    if (type === 'kimchi') obj = new KimchiJar(this.scene, x);
    else if (type === 'spike') obj = new Spikes(this.scene, x);
    else if (poolKey === 'candy') obj = new Candy(this.scene, x, y);
    else obj = new IdolDancer(this.scene, x, speed, forceHigh);
    pool.push(obj);
    return obj;
  }

  spawnOne(type, x, speed) {
    const forceHigh = type === 'idol-high' ? true : (type === 'idol-low' ? false : undefined);
    const obs = this.obtain(type, x, GAME.GROUND_Y, speed, forceHigh);
    this.group.add(obs);
    return obs;
  }
}
