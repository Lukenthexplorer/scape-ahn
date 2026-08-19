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
 * 1b. OPENING COMIC (LoreScene)
 * ---------------------------------------------------------------------
 * The intro is data, not code: add a panel by adding a path here. Panels
 * are shown in array order, scaled to fit the screen with their aspect
 * ratio preserved (letterboxed on black -- never stretched).
 *
 * A listed file that fails to load is skipped rather than shown as a
 * broken panel, so you can add 04/05 to the list before the art exists.
 * ------------------------------------------------------------------- */
const LORE = {
  /* One entry per panel: the image and its caption travel together, so adding
   * a beat to the story is a single object here and nothing else anywhere. */
  PANELS: [
    { img: 'assets/sprites/lore/01.jpg',
      text: '"Psst... quer um docinho, pequena?"' },
    { img: 'assets/sprites/lore/02.jpg',
      text: 'Nina sabia. Doce demais pra ser verdade.' },
    { img: 'assets/sprites/lore/03.jpg',
      text: 'E lá se foi ela — correndo pela própria vida (e pelos potes de kimchi).' },
    // { img: 'assets/sprites/lore/04.jpg', text: '...' },   <- drop the file in, uncomment, done
    // { img: 'assets/sprites/lore/05.jpg', text: '...' },
  ],

  /* Comic caption box. Cream card with a hard black border, the way a
   * narration box reads in print -- it has to hold its own against very busy
   * pixel art, which a plain drop-shadowed label does not. */
  CAPTION: {
    FONT: '"Press Start 2P"',   // loaded in index.html; falls back to monospace
    FALLBACK: 'monospace',
    SIZE: 15,
    LINE_SPACING: 10,
    COLOR: '#1a1014',
    BG: 0xf5e6c8,
    BORDER: 0x1a1014,
    BORDER_PX: 4,
    PAD_X: 20,
    PAD_Y: 14,
    MAX_WIDTH: 0.80,            // fraction of the canvas the box may occupy
    BOTTOM_MARGIN: 44,          // px from the bottom edge to the box's underside
  },

  FADE_MS: 350,            // fade-to-black between panels and on exit
  HINT_DELAY_MS: 1500,     // how long a panel is up before "tap to continue"
  ONCE_PER_SESSION: false, // true = show it only on the first load per tab
  SESSION_KEY: 'scapeahn.loreSeen',
};

/* ---------------------------------------------------------------------
 * 2. PLAYER (the girl)
 * ------------------------------------------------------------------- */
const PLAYER = {
  X: 250,                 // Fixed screen X. World scrolls past her.
  LIVES: 3,               // <-- SET TO 1 FOR TIGHT, ONE-HIT-DEATH TENSION.
  // Apex works out to ~161px, about 2.7x her height. Everything that depends
  // on the jump -- spawn gaps, cluster spacing, pattern spacing -- is derived
  // from the resulting arc, so changing this re-paces the level automatically.
  JUMP_VELOCITY: -950,    // Initial upward impulse.
  JUMP_CUT: 0.42,         // Release jump early -> velocity *= this (variable jump height).
  COYOTE_MS: 90,          // Grace period to still jump just after leaving the ground.
  JUMP_BUFFER_MS: 130,    // Press jump slightly before landing and it still fires.
  DUCK_FAST_FALL: 2.0,    // Gravity multiplier while holding duck in mid-air.
  INVULN_MS: 1300,        // Post-hit mercy invulnerability (flashing).
  HIT_KNOCK_MS: 320,      // Stagger duration after a hit (visual only).

  // Collision boxes in FINAL frame px (frame is 96x128, origin at the feet).
  // Measured against the real run art at ASSETS.girl.sourceScaleX/Y
  // (0.90 / 0.58), which puts her silhouette at frame y 76..127, x 28..64.
  // Deliberately narrower than the sprite -- the ponytail and trailing arm
  // are not solid, and generous hitboxes are what make an endless runner
  // feel fair at speed.
  BODY_STAND: { w: 36, h: 51, ox: 28, oy: 76 },
  // The duck frames are the run art squashed to 55% height (ASSETS.girl
  // .compose), putting her silhouette at frame y 98..127.
  BODY_DUCK:  { w: 41, h: 29, ox: 26, oy: 98 },
};

/* ---------------------------------------------------------------------
 * 3. AHN (the chasing evil candy man)
 * ---------------------------------------------------------------------
 * AHN is pure "rubber band" pressure: he never actually kills you by
 * touching you mid-run. His X is a soft difficulty read-out.
 *   x = LERP(X_FAR, X_NEAR, intensity) + hit pressure - skill credit
 * ------------------------------------------------------------------- */
const AHN = {
  // NOTE: these are tuned for his 112px-wide frame. He is a big sprite now, so
  // the numbers are smaller than you would expect -- at X_MAX his shoulder is
  // already about 15px from her back.
  X_FAR: 10,              // Furthest back (mostly off the left edge) = you're doing great.
  X_NEAR: 100,            // Closest he creeps during normal play = breathing down your neck.
  X_MAX: 150,             // Hard clamp. Hit pressure stacks, and without this
                          // he would walk straight through the girl and out the
                          // right of the screen after a few hits.
  X_LUNGE: 190,           // Where he snaps to during the game-over catch.
  FOLLOW_LERP: 0.55,      // How fast he eases to his target X (per second, 0..1-ish).
                          // Lower = he lumbers, and gaining/losing ground on him
                          // reads as a slow drift instead of a snap.
  HIT_PUSH: 46,           // Px closer per hit taken. Persistent pressure.
  NEARMISS_CREDIT: 14,    // Px pushed back per near miss (rewards risky play).
  CREDIT_MAX: 70,         // Cap on accumulated near-miss credit.
  CREDIT_DECAY: 4.5,      // Px/second the credit bleeds away.
  Y_OFFSET: 2,            // Fine-tune his feet against the ground line.
  WARN_X: 128,            // Screen X past which the "AHN IS CLOSE!" warning shows.

  /* Weight. He is a 176px giant, so his footfalls shake the camera. The shake
   * scales with how close he is, which turns his proximity into something you
   * feel rather than something you have to look at. */
  FOOTSTEP_FRAMES: [0, 2],   // frames of 'ahn-run' where a foot lands
  FOOTSTEP_SHAKE_MIN: 0.0016,
  FOOTSTEP_SHAKE_MAX: 0.0075,
  FOOTSTEP_SHAKE_MS: 110,
  FOOTSTEP_FROM: 0.30,       // proximity (0..1) below which he makes no impact

  /* Red vignette that closes in as he does. Same 0..1 proximity. */
  VIGNETTE_FROM: 0.25,
  VIGNETTE_MAX_ALPHA: 0.72,

  /* THE SWIPE: if he is pinned at X_MAX for this long he takes a telegraphed
   * grab at her. Jump it and he misses. This is the one way he can actually
   * hurt you -- set SWIPE_ENABLED false to go back to him being pure pressure. */
  SWIPE_ENABLED: true,
  SWIPE_CHARGE_MS: 2200,     // time at max proximity before he commits
  SWIPE_TELEGRAPH_MS: 780,   // windup you get to react to
  SWIPE_RECOVER_MS: 900,     // he falls back and cannot swipe again immediately
  SWIPE_PUSHBACK: 34,        // px he loses after swinging, hit or miss

  // Comedic trip gag: only fires when the player has genuinely pulled ahead.
  // Gated on accumulated near-miss credit rather than on his screen X, so the
  // gag keeps working at every difficulty -- an X threshold only ever lines up
  // with one point on the ramp (and broke outright when his sprite was resized).
  // At NEARMISS_CREDIT 14 per near miss, this is "about three clean ones".
  TRIP_CREDIT_MIN: 22,
  // ...or after a long clean stretch, so the gag is not gated purely on a
  // stat most players never notice. Measured runs showed zero trips in 50s of
  // good play before this second trigger existed.
  TRIP_CLEAN_PX: 5200,
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

  // Pattern-authoring limits, in jump arcs. A gap is either small enough to
  // clear both obstacles in one jump (a "double") or big enough to land and
  // jump again. validatePatterns() checks doubles against the actual jump
  // parabola rather than a flat arc-length rule -- see the comment there.
  PATTERN_REJUMP_MIN_ARC: 1.00,
  PATTERN_MIN_WINDOW_ARC: 0.30,   // take-off freedom a double must leave the player
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
    highY: 17,            // Px the HIGH idol's feet float above the ground.
                          // TUNED, DO NOT EYEBALL: it puts her hitbox bottom at
                          // GROUND_Y-41, inside the window between a standing
                          // player's head (GROUND_Y-52) and a ducking player's
                          // head (GROUND_Y-30) -- ~11px of margin either way.
                          // Re-derive if you touch BODY_STAND, BODY_DUCK,
                          // ASSETS.girl.sourceScaleX/Y or the idol frame height.
    bodyHigh: { w: 60, h: 60, ox: 10, oy: 12 },
    bodyLow:  { w: 52, h: 60, ox: 14, oy: 36 },
    // Choreography: side-step -> pose -> settle into blocking position.
    stepSpeed: 130,       // Extra px/s of lateral drift during the side-step.
    stepMs: 520,          // Duration of the side-step.
    poseMs: 340,          // Pose beat before locking in.
    // The routine is compressed to finish by this screen X, so the pose is a
    // telegraph rather than a surprise. Fitting it to "before she arrives"
    // instead left only ~0.16s of reading time at top speed.
    POSE_BY_X: 620,
  },
};

/* ---------------------------------------------------------------------
 * 5b. OBSTACLE PATTERNS  --  the level's vocabulary
 * ---------------------------------------------------------------------
 * The spawner emits PATTERNS, not lone obstacles. Random single obstacles
 * give an endless runner no rhythm; hand-authored little phrases do, and
 * players start to recognise and anticipate them.
 *
 * `gap` is measured in JUMP ARCS, not pixels. One arc is the ground distance
 * a full jump covers at the current speed, so a pattern authored once stays
 * playable at every speed the game ever reaches.
 *
 * THE FAIRNESS RULE, enforced by validatePatterns() at boot:
 *   - two GROUND obstacles less than ~0.55 arcs apart must be clearable in a
 *     single jump -> that is a "double", and it is fine.
 *   - anything else must be at least 1.0 arcs apart, so she can land, and
 *     jump again.
 *   - a duck (idol-high) next to anything needs 1.0+ arcs either side: you
 *     cannot duck and jump at the same time.
 * Author freely; the validator will complain in the console if a pattern is
 * unfair, rather than letting you ship an impossible spawn.
 * ------------------------------------------------------------------- */
const PATTERNS = [
  // --- bread and butter, available from the first second ----------------
  { name: 'jar',            minI: 0.00, weight: 10, items: [{ type: 'kimchi' }] },
  { name: 'spikes',         minI: 0.00, weight: 10, items: [{ type: 'spike' }] },

  // --- idols phase in once the player has the basics --------------------
  { name: 'idol',           minI: 0.10, weight: 7,  items: [{ type: 'idol' }] },

  // --- doubles: one jump clears both -----------------------------------
  { name: 'double-jar',     minI: 0.18, weight: 5,  items: [{ type: 'kimchi' }, { type: 'kimchi', gap: 0.36 }] },
  { name: 'spike-jar',      minI: 0.22, weight: 5,  items: [{ type: 'spike' },  { type: 'kimchi', gap: 0.40 }] },
  { name: 'jar-spike',      minI: 0.30, weight: 4,  items: [{ type: 'kimchi' }, { type: 'spike',  gap: 0.32 }] },

  // --- land-and-jump-again rhythms --------------------------------------
  { name: 'two-beat',       minI: 0.25, weight: 6,  items: [{ type: 'spike' },  { type: 'spike',  gap: 1.15 }] },
  { name: 'three-beat',     minI: 0.45, weight: 4,  items: [{ type: 'kimchi' }, { type: 'spike',  gap: 1.12 },
                                                            { type: 'kimchi', gap: 1.12 }] },

  // --- mixed inputs: jump, then duck, then jump -------------------------
  { name: 'jump-duck',      minI: 0.38, weight: 4,  items: [{ type: 'spike' },  { type: 'idol-high', gap: 1.30 }] },
  { name: 'duck-jump',      minI: 0.45, weight: 4,  items: [{ type: 'idol-high' }, { type: 'kimchi', gap: 1.30 }] },
  { name: 'duck-double',    minI: 0.62, weight: 3,  items: [{ type: 'idol-high' }, { type: 'spike', gap: 1.35 },
                                                            { type: 'kimchi', gap: 0.44 }] },

  // --- late-game showpieces ---------------------------------------------
  { name: 'gauntlet',       minI: 0.70, weight: 3,  items: [{ type: 'spike' },  { type: 'kimchi', gap: 0.40 },
                                                            { type: 'spike',  gap: 1.25 }] },
  { name: 'idol-sandwich',  minI: 0.78, weight: 2,  items: [{ type: 'idol-low' }, { type: 'idol-high', gap: 1.35 },
                                                            { type: 'kimchi', gap: 1.30 }] },
];

/* ---------------------------------------------------------------------
 * 5c. CANDY PICKUPS
 * ---------------------------------------------------------------------
 * Optional reward, deliberately placed where a jump already takes you: at
 * the apex of the arc over an obstacle. Collecting one shoves AHN back, so
 * greed and safety point the same way -- but only if you jump well.
 * ------------------------------------------------------------------- */
const CANDY = {
  ENABLED: true,
  CHANCE: 0.42,           // per pattern, once the ramp has started
  MIN_INTENSITY: 0.08,
  HEIGHT: 120,            // px above the ground (inside a ~161px jump apex)
  SCORE: 90,
  AHN_PUSHBACK: 20,       // px of skill credit, same currency as a near miss
  BODY: { w: 40, h: 40, ox: 8, oy: 8 },
};

/* ---------------------------------------------------------------------
 * 5d. WEATHER
 * ---------------------------------------------------------------------
 * Rain rolls through in bands so the street is not visually static over a
 * long run. Cosmetic only -- it never changes physics or visibility enough
 * to affect play.
 * ------------------------------------------------------------------- */
const WEATHER = {
  ENABLED: true,
  PERIOD_PX: 26000,       // one full dry -> rain -> dry cycle
  RAIN_PX: 11000,         // how much of that cycle is wet
  FADE_PX: 2200,          // ramp in/out so it never snaps on
  DROPS: 190,
  TINT_ALPHA: 0.16,
};

/* ---------------------------------------------------------------------
 * 5e. BEST-RUN GHOST
 * ---------------------------------------------------------------------
 * A marker parked at the exact distance your best run died. Chasing a line
 * you can see beats chasing a number in a menu.
 * ------------------------------------------------------------------- */
const GHOST = {
  ENABLED: true,
  BEST_DIST_KEY: 'scapeahn.bestDist',
  MIN_DIST: 1200,         // do not bother marking a trivially short best
};

/* ---------------------------------------------------------------------
 * 6. SCORING
 * ------------------------------------------------------------------- */
const SCORE = {
  PER_PIXEL: 0.05,        // Base score per world px travelled.
  NEAR_MISS_MARGIN: 18,   // Px gap between hitboxes that still counts as "near".
                          // Scaled with the player: ~30% of her height.
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
    // She is drawn well under her source size so AHN reads as a giant next to
    // her. Smoothly downscaled first, then upscaled 2x by artScale, so she
    // stays on the same pixel grid as him -- see `resampled` in art.js. The
    // frame keeps its size; she just occupies less of it, which is why the
    // body boxes below are re-measured.
    //
    // X and Y are scaled unevenly on purpose: shorter than the old uniform
    // 0.7 (a "squish") and noticeably wider (a stocky, chubby stance), which
    // reads as a rounder silhouette instead of a plain shrink.
    sourceScaleX: 0.90,
    sourceScaleY: 0.58,
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
      // Leaning into the arc is what separates "jumping" from "running while
      // off the ground". 10 degrees reads as a leap; much more and she looks
      // like she is falling over.
      { src: 'run', i: 2, dy: -3, rotate: -10 },     // 4 jump  -- tucked stride, lifted, leaning
      { src: 'run', i: 0, dy: 1, rotate: 5 },        // 5 fall  -- reaching for the ground
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
    frameWidth: 112, frameHeight: 176, frameCount: 9,  // body on a 2px grid, photo head at full res
    anims: {
      // Slower cadence than the girl on purpose: he is half again her size, and
      // a big sprite with a fast leg cycle reads as frantic rather than looming.
      'ahn-run':   { frames: [0, 1, 2, 3], frameRate: 7, repeat: -1 },
      'ahn-trip':  { frames: [4, 5, 6],    frameRate: 6, repeat: 0 },
      'ahn-catch': { frames: [7, 8],       frameRate: 8, repeat: -1 },
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

  // Candy pickup (placeholder lollipop).
  candy: {
    key: 'candy',
    path: null,
    frameWidth: 56, frameHeight: 56, frameCount: 2, artScale: 2,
    outline: '#150c1c',
    anims: { 'candy-spin': { frames: [0, 1], frameRate: 5, repeat: -1 } },
  },

  // Small UI / FX textures (placeholders).
  dust:  { key: 'dust',  path: null, frameWidth: 12, frameHeight: 12, frameCount: 1, artScale: 2, anims: {} },
  drop:  { key: 'drop',  path: null, frameWidth: 2,  frameHeight: 14, frameCount: 1, anims: {} },
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
    // The `synth` blocks below are placeholder sound design, not just beeps:
    // `noise` is a filtered noise burst, `layers` stacks voices, `delay`
    // offsets one inside the cue. Drop a real file into `src` and the whole
    // synth block is ignored.
    land:     { src: null, volume: 0.35, synth: { layers: [
                 { noise: true, dur: 0.09, cutFrom: 1800, cutTo: 300 },
                 { type: 'sine', freq: 180, to: 90, dur: 0.10 },
               ] } },
    hit:      { src: null, volume: 0.75, synth: { layers: [
                 { type: 'sawtooth', freq: 260, to: 60, dur: 0.26 },
                 { type: 'square', freq: 130, to: 40, dur: 0.20 },
                 { noise: true, dur: 0.16, cutFrom: 3000, cutTo: 500 },
               ] } },
    nearmiss: { src: null, volume: 0.45, synth: { layers: [
                 { type: 'triangle', freq: 900, to: 1500, dur: 0.09 },
                 { type: 'triangle', freq: 1350, to: 2100, dur: 0.07, delay: 0.05 },
               ] } },
    candy:    { src: null, volume: 0.5, synth: { layers: [
                 { type: 'square', freq: 780, to: 800, dur: 0.06 },
                 { type: 'square', freq: 1180, to: 1200, dur: 0.06, delay: 0.06 },
                 { type: 'square', freq: 1560, to: 1600, dur: 0.10, delay: 0.12 },
               ] } },
    swipe:    { src: null, volume: 0.6, synth: { layers: [
                 { noise: true, dur: 0.34, cutFrom: 400, cutTo: 4200 },
                 { type: 'sawtooth', freq: 90, to: 220, dur: 0.34 },
               ] } },
    gameover: { src: null, volume: 0.85, synth: { layers: [
                 { type: 'sawtooth', freq: 420, to: 60, dur: 0.85 },
                 { type: 'square', freq: 210, to: 40, dur: 0.85, delay: 0.06 },
                 { noise: true, dur: 0.5, cutFrom: 2200, cutTo: 200, delay: 0.1 },
               ] } },
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
