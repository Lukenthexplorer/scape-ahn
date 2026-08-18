/* =====================================================================
 * SCAPE AHN!  --  Player.js   (the girl)
 * ---------------------------------------------------------------------
 * A normal Phaser Arcade sprite. She never moves horizontally: the world
 * scrolls past her. All she does is jump, duck, and get hurt.
 *
 * Feel features worth knowing about when tuning:
 *   - Coyote time     : jump still works briefly after walking off an edge.
 *   - Jump buffering  : a jump pressed just before landing fires on landing.
 *   - Variable height : releasing jump early cuts upward velocity.
 *   - Duck fast-fall  : holding duck in the air slams you down faster.
 * ===================================================================== */

class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    super(scene, x, y, ASSETS.girl.key, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setOrigin(0.5, 1);        // anchor at the feet so ground alignment is trivial
    this.setDepth(20);
    this.body.setCollideWorldBounds(false);
    this.body.setAllowGravity(true);

    this.state = 'run';            // run | jump | fall | duck | hurt | caught
    this.isDucking = false;
    this.invulnUntil = 0;
    this.lastGroundedAt = 0;       // for coyote time
    this.jumpBufferedAt = -9999;   // for jump buffering
    this.wasOnGround = true;
    this.onLand = null;            // optional callback(scene) set by GameScene
    this.dead = false;

    this.applyBody(PLAYER.BODY_STAND);
    this.play('girl-run');
  }

  /** Swap the hitbox between standing and ducking shapes (from config). */
  applyBody(b) {
    this.body.setSize(b.w, b.h, false);
    this.body.setOffset(b.ox, b.oy);
  }

  get onGround() { return this.body.blocked.down || this.body.touching.down; }
  get invulnerable() { return this.scene.time.now < this.invulnUntil; }

  /* ---------------- input entry points (called by GameScene) ---------- */

  /** Request a jump. Honours coyote time; otherwise gets buffered. */
  requestJump() {
    if (this.dead) return;
    const now = this.scene.time.now;
    this.jumpBufferedAt = now;
    const coyoteOk = (now - this.lastGroundedAt) <= PLAYER.COYOTE_MS;
    if (this.onGround || coyoteOk) this.doJump();
  }

  doJump() {
    this.jumpBufferedAt = -9999;
    this.lastGroundedAt = -9999;               // consume the coyote window
    this.setDuck(false);
    this.body.setVelocityY(PLAYER.JUMP_VELOCITY);
    this.setState_('jump');
    Sfx.play('jump');
    if (this.scene.spawnDust) this.scene.spawnDust(this.x, this.y, 6);
  }

  /** Cut the jump short when the button is released (variable jump height). */
  releaseJump() {
    if (this.body.velocity.y < 0) this.body.setVelocityY(this.body.velocity.y * PLAYER.JUMP_CUT);
  }

  setDuck(on) {
    if (this.dead || this.isDucking === on) return;
    this.isDucking = on;
    this.applyBody(on ? PLAYER.BODY_DUCK : PLAYER.BODY_STAND);
  }

  /* ---------------- damage & death ------------------------------------ */

  /**
   * Take a hit. Returns false if it was ignored (mercy invulnerability),
   * which lets GameScene skip the life deduction as well.
   */
  takeHit() {
    if (this.dead || this.invulnerable) return false;
    this.invulnUntil = this.scene.time.now + PLAYER.INVULN_MS;
    this.hurtUntil = this.scene.time.now + PLAYER.HIT_KNOCK_MS;
    this.setDuck(false);
    this.setState_('hurt');
    this.body.setVelocityY(-320);              // small stagger hop

    // Flash while invulnerable so the mercy window is readable.
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
    this.flashTween = this.scene.tweens.add({
      targets: this, alpha: 0.25, duration: 110, yoyo: true,
      repeat: Math.floor(PLAYER.INVULN_MS / 220),
      onComplete: () => this.setAlpha(1),
    });
    return true;
  }

  /** Frozen pose for the game-over catch sequence. */
  startCaught() {
    this.dead = true;
    this.setState_('hurt');
    this.setDuck(false);
    this.body.setVelocityX(0);
    this.scene.tweens.killTweensOf(this);
    this.setAlpha(1);
  }

  /* ---------------- per-frame state machine --------------------------- */

  setState_(s) {
    if (this.state === s) return;
    this.state = s;
    const anim = {
      run: 'girl-run', jump: 'girl-jump', fall: 'girl-fall',
      duck: 'girl-duck', hurt: 'girl-hurt', caught: 'girl-hurt',
    }[s];
    if (anim) this.play(anim, true);
  }

  /** Called every frame by GameScene (after physics). */
  tick() {
    if (this.dead) return;
    const now = this.scene.time.now;
    const grounded = this.onGround;

    if (grounded) {
      // Landing edge: dust, thud, and any buffered jump fires now.
      if (!this.wasOnGround) {
        Sfx.play('land');
        if (this.scene.spawnDust) this.scene.spawnDust(this.x, this.y, 8);
      }
      this.lastGroundedAt = now;
      if ((now - this.jumpBufferedAt) <= PLAYER.JUMP_BUFFER_MS) { this.doJump(); }
    }
    this.wasOnGround = grounded;

    // Duck held in the air = fast-fall (extra gravity on top of world gravity).
    const extraG = (!grounded && this.isDucking) ? GAME.GRAVITY * (PLAYER.DUCK_FAST_FALL - 1) : 0;
    this.body.setGravityY(extraG);

    // Pick the pose.
    if (this.hurtUntil && now < this.hurtUntil) {
      this.setState_('hurt');
    } else if (!grounded) {
      this.setState_(this.body.velocity.y < 0 ? 'jump' : 'fall');
    } else if (this.isDucking) {
      this.setState_('duck');
    } else {
      this.setState_('run');
    }
  }
}
