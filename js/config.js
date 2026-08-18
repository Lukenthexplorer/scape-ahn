/* =====================================================================
 * SCAPE AHN!  --  config.js
 * ---------------------------------------------------------------------
 * EVERY tunable number lives in this file. Nothing else should contain
 * magic numbers you'd want to iterate on. Tweak here, refresh, play.
 * ===================================================================== */

/* ---------------------------------------------------------------------
 * 1. CANVAS / WORLD
 * ---------------------------------------------------------------------
 * The world geometry is DERIVED FROM THE BACKGROUND ART so the characters
 * stand on the painted sidewalk instead of an invented line. If you swap
 * background.jpg for a different street, re-measure the three BG_SRC
 * numbers below and everything else follows.
 * ------------------------------------------------------------------- */
const BG_SRC = {
  W: 1344, H: 768,   // source image size
  GROUND_Y: 545,     // source Y of the sidewalk surface the girl runs on
  SPLIT_Y: 504,      // source Y where the far layer ends and the pavement begins
};

const GAME = {
  WIDTH: 960,             // 16:9 design resolution. Scale manager FITs it to the window.
  HEIGHT: 540,
  BG_SCALE: 960 / BG_SRC.W,                              // 0.714 -- one bg copy spans the canvas
  GROUND_Y: Math.round(BG_SRC.GROUND_Y * (960 / BG_SRC.W)),  // = 389, the feet line
  GRAVITY: 2800,          // px/s^2. Higher = snappier, more arcade-y jumps.
  BG_COLOR: 0x0d0710,
};

/* Parallax split of the single background image. The far layer (sky,
 * skyline, shopfronts) drifts slowly; the near layer (pavement, curb,
 * platform wall) scrolls at full world speed so the ground never appears
 * to slide under the girl's feet. */
const BACKGROUND = {
  FAR:  { key: 'bgFar',  path: 'assets/sprites/background/background_far.png',  factor: 0.28 },
  NEAR: { key: 'bgNear', path: 'assets/sprites/background/background_near.png', factor: 1.0 },
};

/* ---------------------------------------------------------------------
 * 2. PLAYER (the girl)
 * ------------------------------------------------------------------- */
const PLAYER = {
  X: 250,                 // Fixed screen X. World scrolls past her.
  LIVES: 3,               // <-- SET TO 1 FOR TIGHT, ONE-HIT-DEATH TENSION.
  JUMP_VELOCITY: -1090,   // Initial upward impulse.
  JUMP_CUT: 0.42,         // Release jump early -> velocity *= this (variable jump height).
  COYOTE_MS: 90,          // Grace period to still jump just after leaving the ground.
  JUMP_BUFFER_MS: 130,    // Press jump slightly before landing and it still fires.
  DUCK_FAST_FALL: 2.0,    // Gravity multiplier while holding duck in mid-air.
  INVULN_MS: 1300,        // Post-hit mercy invulnerability (flashing).
  HIT_KNOCK_MS: 320,      // Stagger duration after a hit (visual only).

  // Collision boxes in FINAL frame px (frame is 96x128, origin at the feet).
  // Measured against the real run art, which is 48x48 source upscaled 2x, so
  // her silhouette lands at frame y 40..122, x 28..68. Deliberately narrower
  // than the sprite -- the ponytail and trailing arm are not solid, and
  // generous hitboxes are what make an endless runner feel fair at speed.
  BODY_STAND: { w: 40, h: 80, ox: 28, oy: 42 },
  // The duck frames are the run art squashed to 55% height (ASSETS.girl
  // .compose), putting her silhouette at frame y 80..126.
  BODY_DUCK:  { w: 48, h: 42, ox: 24, oy: 80 },
};

/* ---------------------------------------------------------------------
 * 3. AHN (the chasing evil candy man)
 * ---------------------------------------------------------------------
 * AHN is pure "rubber band" pressure: he never actually kills you by
 * touching you mid-run. His X is a soft difficulty read-out.
 *   x = LERP(X_FAR, X_NEAR, intensity) + hit pressure - skill credit
 * ------------------------------------------------------------------- */
const AHN = {
  X_FAR: 46,              // Furthest back (mostly off the left edge) = you're doing great.
  X_NEAR: 120,            // Closest he creeps during normal play = breathing down your neck.
  X_MAX: 168,             // Hard clamp. Hit pressure stacks, and without this
                          // he would walk straight through the girl and out the
                          // right of the screen after a few hits.
  X_LUNGE: 200,           // Where he snaps to during the game-over catch.
  FOLLOW_LERP: 0.9,       // How fast he eases to his target X (per second, 0..1-ish).
  HIT_PUSH: 46,           // Px closer per hit taken. Persistent pressure.
  NEARMISS_CREDIT: 14,    // Px pushed back per near miss (rewards risky play).
  CREDIT_MAX: 70,         // Cap on accumulated near-miss credit.
  CREDIT_DECAY: 6,        // Px/second the credit bleeds away.
  Y_OFFSET: 2,            // Fine-tune his feet against the ground line.
  WARN_X: 148,            // Screen X past which the "AHN IS CLOSE!" warning shows.

  // Comedic trip gag: only fires when the player has genuinely pulled ahead.
  TRIP_WHEN_X_BELOW: 40,  // He must be at least this far back to trip (i.e. you earned it).
  TRIP_MIN_DELAY: 3200,   // Random cooldown window between gags (ms).
  TRIP_MAX_DELAY: 7000,
};

/* ---------------------------------------------------------------------
 * 4. SPEED & DIFFICULTY CURVE
 * ---------------------------------------------------------------------
 * `intensity` is a normalized 0..1 ramp driven by distance travelled.
 * It drives run speed, spawn density and AHN's creep, so bending
 * RAMP_DISTANCE alone re-paces the entire game.
 * ------------------------------------------------------------------- */
const DIFFICULTY = {
  SPEED_START: 400,       // px/s at the start of a run.
  SPEED_MAX: 900,         // px/s ceiling.
  RAMP_DISTANCE: 26000,   // World px travelled to reach intensity 1.0 (full difficulty).
  RAMP_CURVE: 0.75,       // <1 ramps fast early then eases; >1 is a slow burn.

  // Spawn gaps are measured in WORLD PIXELS, not seconds. This is important:
  // a pixel gap stays jumpable no matter how fast the game gets, whereas a
  // time-based spawner gets impossible as speed climbs.
  GAP_START: 820,         // Comfy spacing at intensity 0.
  GAP_END: 620,           // Tightest spacing at intensity 1.
  GAP_JITTER: 210,        // Random extra gap so the rhythm never feels metronomic.
  // Hard floor in absolute px...
  GAP_MIN_ABS: 480,
  // ...and a second floor expressed as a fraction of the CURRENT jump arc.
  // A jump covers `arc = 2*|JUMP_VELOCITY|/GRAVITY * speed` px of ground, so
  // the arc grows as the game speeds up. Spacing obstacles at least this
  // fraction of an arc apart guarantees she can always land before the next
  // one instead of being dropped straight onto it. The spawner takes
  // whichever of the two floors is larger.
  GAP_MIN_ARC_FRAC: 0.85,

  // Chance a spawn becomes a 2-obstacle cluster (ramps in with intensity).
  CLUSTER_CHANCE_START: 0.0,
  CLUSTER_CHANCE_END: 0.30,
  // Inner spacing of a cluster, also derived from the jump arc: a cluster is
  // meant to be cleared by ONE jump, so the pair must fit comfortably inside a
  // single arc at whatever speed it spawns at. A fixed px value cannot do this
  // -- it is either trivial when slow or unclearable when fast.
  CLUSTER_GAP_ARC_FRAC: 0.32,
  CLUSTER_GAP_MIN: 140,
  CLUSTER_GAP_MAX: 300,
  CLUSTER_MIN_INTENSITY: 0.25, // No clusters before this much of the ramp.
};

/* ---------------------------------------------------------------------
 * 5. OBSTACLE TABLE
 * ---------------------------------------------------------------------
 * `weightStart` / `weightEnd` are the spawn weights at intensity 0 and 1;
 * they are interpolated, so you can phase obstacle types in over a run.
 * Set a weightStart of 0 to keep a type out of the opening seconds.
 * ------------------------------------------------------------------- */
const OBSTACLES = {
  KIMCHI: {
    type: 'kimchi',
    weightStart: 10, weightEnd: 7,
    body: { w: 48, h: 52, ox: 12, oy: 20 },
    wobbleChance: 0.45,   // Fraction that get the rolling/wobble gag.
    wobbleAngle: 13,      // Degrees of rock.
    wobbleMs: 420,
  },
  SPIKE: {
    type: 'spike',
    weightStart: 6, weightEnd: 9,
    body: { w: 80, h: 32, ox: 8, oy: 16 },
  },
  IDOL: {
    type: 'idol',
    weightStart: 3, weightEnd: 9,
    // Two poses decide the required input:
    //   'high' -> hovers at head height, arms up  -> DUCK under (a well-timed
    //             jump also clears her, and scores a near miss -- skill option)
    //   'low'  -> drops into a wide floor pose    -> JUMP over
    highChance: 0.5,
    highY: 38,            // Px the HIGH idol's feet float above the ground.
                          // TUNED, DO NOT EYEBALL: it puts her hitbox bottom at
                          // GROUND_Y-62, inside the window between a standing
                          // player's head (GROUND_Y-80) and a ducking player's
                          // head (GROUND_Y-42) -- ~18px of margin either way.
                          // Re-derive if you touch BODY_STAND, BODY_DUCK or the
                          // idol frame height.
    bodyHigh: { w: 60, h: 60, ox: 10, oy: 12 },
    bodyLow:  { w: 52, h: 60, ox: 14, oy: 36 },
    // Choreography: side-step -> pose -> settle into blocking position.
    stepSpeed: 130,       // Extra px/s of lateral drift during the side-step.
    stepMs: 520,          // Duration of the side-step.
    poseMs: 340,          // Pose beat before locking in.
  },
};

/* ---------------------------------------------------------------------
 * 6. SCORING
 * ------------------------------------------------------------------- */
const SCORE = {
  PER_PIXEL: 0.05,        // Base score per world px travelled.
  NEAR_MISS_MARGIN: 26,   // Px gap between hitboxes that still counts as "near".
  NEAR_MISS_BONUS: 30,    // Flat score pop per near miss.
  MULT_STEP: 0.25,        // Multiplier gained per near miss.
  MULT_MAX: 4.0,
  MULT_DECAY_DELAY: 2600, // ms of no near misses before the multiplier bleeds.
  MULT_DECAY_RATE: 0.55,  // Multiplier lost per second once decaying.
  PX_PER_METRE: 40,       // Purely cosmetic: world px -> the 'm survived' readout.
  BEST_KEY: 'scapeahn.best',
};

/* ---------------------------------------------------------------------
 * 7. ASSET MANIFEST  --  THE SWAP POINT FOR REAL PIXEL ART
 * ---------------------------------------------------------------------
 * Everything renders as a real Phaser Sprite driven by the animation
 * system. Placeholder art is generated into canvas textures that are
 * sliced into frames exactly like a spritesheet.
 *
 * TO DROP IN REAL ART: give an entry a `path` (and keep frameWidth /
 * frameHeight matching your sheet). BootScene will then `load.spritesheet`
 * it instead of generating placeholders. Frame indices below stay valid,
 * so no other file needs to change. Re-measure the `body` boxes above if
 * your art has different proportions.
 * ------------------------------------------------------------------- */
const ASSETS = {
  /* GIRL -- part real art, part placeholder.
   * `sources` lists real image files; `compose` says how each strip frame is
   * built from them. Frames that name no source fall back to the procedural
   * placeholder drawing in art.js, so the sheet is always complete.
   * The supplied art only contains a 4-frame run cycle, so the jump / fall /
   * duck / hurt frames are DERIVED from it (re-posed, squashed, tinted) --
   * that keeps one consistent art style on screen until real frames exist.
   * When they do: add them to `sources` and point `compose` at them.
   *
   * `artScale` upscales generated art by an integer factor at texture-build
   * time (NEAREST, so it stays crisp). frameWidth/frameHeight below are the
   * FINAL size the game sees; the drawing code in art.js works in the
   * design-size grid, i.e. these divided by artScale. Scaling here rather
   * than with sprite.setScale() keeps every hitbox in plain frame pixels. */
  girl: {
    key: 'girl',
    path: null,           // set this instead to use a single packed spritesheet
    frameWidth: 96, frameHeight: 128, frameCount: 9, artScale: 2,
    sources: {
      run: [
        'assets/sprites/16-bit_pixel_art_character_sprite/Idle/animations/Running/south-east/frame_000.png',
        'assets/sprites/16-bit_pixel_art_character_sprite/Idle/animations/Running/south-east/frame_001.png',
        'assets/sprites/16-bit_pixel_art_character_sprite/Idle/animations/Running/south-east/frame_002.png',
        'assets/sprites/16-bit_pixel_art_character_sprite/Idle/animations/Running/south-east/frame_003.png',
      ],
    },
    // One entry per strip frame. src/i = which source image; the rest are
    // transforms applied while compositing into the 48x64 frame.
    compose: [
      { src: 'run', i: 0 },                          // 0-3 run cycle (real art)
      { src: 'run', i: 1 },
      { src: 'run', i: 2 },
      { src: 'run', i: 3 },
      { src: 'run', i: 2, dy: -3 },                  // 4 jump  -- tucked stride, lifted
      { src: 'run', i: 0, dy: 1 },                   // 5 fall  -- extended stride, dropped
      { src: 'run', i: 0, squashY: 0.55 },           // 6 duck  -- squashed run frames
      { src: 'run', i: 2, squashY: 0.55 },           // 7 duck
      { src: 'run', i: 1, tint: '#ff2d55', tintAlpha: 0.55 },  // 8 hurt
    ],
    anims: {
      'girl-run':  { frames: [0, 1, 2, 3], frameRate: 12, repeat: -1 },
      'girl-jump': { frames: [4],          frameRate: 1,  repeat: 0 },
      'girl-fall': { frames: [5],          frameRate: 1,  repeat: 0 },
      'girl-duck': { frames: [6, 7],       frameRate: 10, repeat: -1 },
      'girl-hurt': { frames: [8],          frameRate: 1,  repeat: 0 },
    },
  },

  /* AHN -- a real spritesheet, generated by tools/make_ahn_sheet.py from the
   * reference photo in assets/sprites/ahn/. Re-run that script to rebuild it. */
  ahn: {
    key: 'ahn',
    path: 'assets/sprites/ahn/ahn.png',
    frameWidth: 88, frameHeight: 112, frameCount: 9,   // sheet is generated at 2x
    anims: {
      'ahn-run':   { frames: [0, 1, 2, 3], frameRate: 10, repeat: -1 },
      'ahn-trip':  { frames: [4, 5, 6],    frameRate: 7,  repeat: 0 },
      'ahn-catch': { frames: [7, 8],       frameRate: 9,  repeat: -1 },
    },
  },

  /* OBSTACLES -- still placeholders, sized against the real girl (42px tall). */
  kimchi: {
    key: 'kimchi',
    path: null,
    frameWidth: 72, frameHeight: 72, frameCount: 2, artScale: 2,
    outline: '#150c1c',   // keyline: flat shapes vanish against the neon street
    anims: { 'kimchi-idle': { frames: [0, 1], frameRate: 6, repeat: -1 } },
  },
  spike: {
    key: 'spike',
    path: null,
    frameWidth: 96, frameHeight: 48, frameCount: 2, artScale: 2,
    outline: '#150c1c',   // keyline: flat shapes vanish against the neon street
    anims: { 'spike-idle': { frames: [0, 1], frameRate: 4, repeat: -1 } },
  },
  idol: {
    key: 'idol',
    path: null,
    frameWidth: 80, frameHeight: 96, frameCount: 4, artScale: 2,
    outline: '#150c1c',   // keyline: flat shapes vanish against the neon street
    anims: {
      'idol-dance':     { frames: [0, 1], frameRate: 9, repeat: -1 },
      'idol-pose-high': { frames: [2],    frameRate: 1, repeat: 0 },
      'idol-pose-low':  { frames: [3],    frameRate: 1, repeat: 0 },
    },
  },

  // Small UI / FX textures (placeholders).
  dust:  { key: 'dust',  path: null, frameWidth: 12, frameHeight: 12, frameCount: 1, artScale: 2, anims: {} },
  heart: { key: 'heart', path: null, frameWidth: 40, frameHeight: 36, frameCount: 2, artScale: 2, anims: {} },
};

/* ---------------------------------------------------------------------
 * 8. AUDIO MANIFEST  --  DROP FILES IN, NOTHING ELSE TO CHANGE
 * ---------------------------------------------------------------------
 * `src: null` = no file yet. AudioManager falls back to a tiny WebAudio
 * synth blip (see SYNTH below) so the hooks are audible while you source
 * real CC0 samples. Point `src` at a file (or array of files for
 * ogg/mp3 fallbacks) and the real sample takes over automatically.
 * ------------------------------------------------------------------- */
const AUDIO = {
  ENABLED: true,
  MASTER_VOLUME: 0.55,

  /* Background music is deliberately NOT a Phaser cue. Phaser's loader waits
   * on decodeAudioData for every audio file, so a multi-megabyte track holds
   * the loading screen hostage until the whole thing is decoded. Streaming it
   * through a plain <audio> element starts instantly and loads while you play. */
  MUSIC: { src: 'assets/audio/soundtrack.mp3', volume: 0.34, loop: true },
  MUSIC_DUCK: 0.35,         // music volume multiplier during the game-over screen
  SYNTH_FALLBACK: true,   // Set false for total silence until real files land.
  SOUNDS: {
    // Real files. Everything else still falls back to the synth blips below
    // until you drop a file in and set its `src` the same way.
    jump:     { src: 'assets/audio/jump.mp3', volume: 0.55,
                synth: { freq: 620, to: 900, dur: 0.11, type: 'square' } },
    land:     { src: null, volume: 0.25, synth: { freq: 200, to: 120, dur: 0.07, type: 'sine' } },
    hit:      { src: null, volume: 0.7, synth: { freq: 240, to: 70,  dur: 0.22, type: 'sawtooth' } },
    nearmiss: { src: null, volume: 0.4, synth: { freq: 980, to: 1400, dur: 0.08, type: 'triangle' } },
    gameover: { src: null, volume: 0.8, synth: { freq: 420, to: 60,  dur: 0.75, type: 'sawtooth' } },
    // Add more cues here; `src` may also be an array of fallbacks,
    // e.g. ['assets/audio/hit.ogg', 'assets/audio/hit.mp3'].
  },
};

/* ---------------------------------------------------------------------
 * 9. TOUCH CONTROLS
 * ------------------------------------------------------------------- */
const TOUCH = {
  SWIPE_DOWN_PX: 34,      // Vertical drag distance that converts a tap into a duck.
  SWIPE_MAX_MS: 500,      // Drag must start within this window to count as a swipe.
};

/* ---------------------------------------------------------------------
 * 10. PALETTE (placeholder art + UI share these so recolors are central)
 * ------------------------------------------------------------------- */
const PAL = {
  girlPink: '#ff6fa5', girlPinkDark: '#c93f74', girlSkin: '#ffd9b8', girlHair: '#3b2233',
  ahnRed: '#8f0f22', ahnRedLight: '#c8172f', ahnBlack: '#140a10', ahnPale: '#efe3d8',
  kimchiGlass: '#7fae4a', kimchiLid: '#6b4630', kimchiDark: '#4d6f2c',
  spikeGrey: '#9aa3ad', spikeDark: '#5c646d',
  idolA: '#4ad6ff', idolB: '#ffd84a', idolPose: '#ff4ad6',
  uiText: '#ffffff', uiAccent: '#ff6fa5', uiWarn: '#ffd84a',
};
