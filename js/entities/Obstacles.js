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

  /** Peak height of a jump, in px. */
  static jumpApexPx() {
    return (PLAYER.JUMP_VELOCITY * PLAYER.JUMP_VELOCITY) / (2 * GAME.GRAVITY);
  }

  /**
   * How far into the jump (0..1 of the arc) you first clear a `h` px obstacle.
   * The arc is a parabola of height A, so height(f) = 4*A*f*(1-f); solving for
   * height = h gives the first crossing. Returns null if the jump is simply
   * not tall enough to clear it at all.
   */
  static clearFraction(h) {
    const A = ObstacleSpawner.jumpApexPx();
    if (h >= A) return null;
    return 0.5 - 0.5 * Math.sqrt(1 - h / A);
  }

  /** Hitbox height/width of a pattern item type, in px. */
  static itemSize(type) {
    if (type === 'kimchi') return OBSTACLES.KIMCHI.body;
    if (type === 'spike') return OBSTACLES.SPIKE.body;
    if (type === 'idol-low') return OBSTACLES.IDOL.bodyLow;
    if (type === 'idol-high') return OBSTACLES.IDOL.bodyHigh;
    return OBSTACLES.IDOL.bodyLow;   // plain 'idol' may roll either way
  }

  /**
   * Boot-time fairness check on the authored patterns. Logs, never throws:
   * a bad pattern should be loud while you tune, not fatal.
   *
   * The interesting case is the DOUBLE -- two ground obstacles meant to be
   * cleared in one jump. Whether that works is NOT a question of arc length,
   * which was the original (wrong) rule here. It is a question of apex: you
   * must already be above the first obstacle when you reach it, and still
   * above the second when you leave it, and the jump is a parabola, so both
   * ends of the arc are low. That leaves a window of valid take-off points:
   *
   *     window = (1 - clear(h2)) - w2 - gap - clear(h1)
   *
   * measured in arcs. A double whose window is tiny is technically possible
   * and miserable to play, which is exactly the failure this catches --
   * instrumented runs showed the player landing on top of the second
   * obstacle even though the pair fit inside one arc.
   *
   * Widths are evaluated at the SLOWEST speed the pattern can appear at,
   * because a short arc makes every obstacle a bigger fraction of it.
   */
  static validatePatterns() {
    const REJUMP = DIFFICULTY.PATTERN_REJUMP_MIN_ARC;
    const MIN_WINDOW = DIFFICULTY.PATTERN_MIN_WINDOW_ARC;
    let bad = 0;

    PATTERNS.forEach((p) => {
      const speed = Phaser.Math.Linear(DIFFICULTY.SPEED_START, DIFFICULTY.SPEED_MAX, p.minI || 0);
      const arc = ObstacleSpawner.jumpArcPx(speed);

      for (let i = 1; i < p.items.length; i++) {
        const gap = p.items[i].gap || 0;
        const prev = p.items[i - 1].type, cur = p.items[i].type;
        const involvesDuck = cur === 'idol-high' || prev === 'idol-high';

        if (involvesDuck) {
          if (gap < REJUMP) {
            console.warn('[patterns] "' + p.name + '" item ' + i + ': ' + gap +
              ' arcs next to a duck. You cannot duck and jump at once; needs >= ' + REJUMP);
            bad++;
          }
          continue;
        }
        if (gap >= REJUMP) continue;            // land, then jump again: always fine

        // --- it is a double: check the take-off window ---------------------
        const a = ObstacleSpawner.itemSize(prev), b = ObstacleSpawner.itemSize(cur);
        const fa = ObstacleSpawner.clearFraction(a.h);
        const fb = ObstacleSpawner.clearFraction(b.h);
        if (fa === null || fb === null) {
          console.warn('[patterns] "' + p.name + '" item ' + i +
            ': the jump is not tall enough to clear this obstacle at all');
          bad++;
          continue;
        }
        const w2 = b.w / arc;
        const window = (1 - fb) - w2 - gap - fa;
        if (window < MIN_WINDOW) {
          console.warn('[patterns] "' + p.name + '" item ' + i + ': gap ' + gap +
            ' arcs leaves only ' + window.toFixed(3) + ' arcs of take-off window' +
            ' (need ' + MIN_WINDOW + '). Max fair gap here is ' +
            ((1 - fb) - w2 - fa - MIN_WINDOW).toFixed(2) + '.');
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
