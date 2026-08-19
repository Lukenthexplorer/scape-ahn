# SCAPE AHN!

A browser endless runner: **Nina** sprints down a neon Seoul candy-shop street
while **AHN**, the evil candy man, chases her from just off the left edge.
Opens with a comic-panel intro. Phaser 3 from a CDN, vanilla JS, no bundler,
no npm.

Scene flow: `Boot -> Lore -> Title -> Game -> GameOver`.

## Run it

```bash
# any static server works; opening index.html directly also works
python3 -m http.server 8000
# -> http://localhost:8000
```

A server is recommended: the composited sprite frames are loaded with `fetch`,
which some browsers block on `file://`.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Jump | `Space` / `↑` / `W` | tap |
| Duck | `↓` / `S` | swipe down, hold to stay down |
| Pause | `P` | tap while paused to resume |
| Mute | `M` | — |
| Advance the intro | `Space` / `Enter` | tap |
| Skip the intro | `Esc` | SKIP, top right |

Jumps are variable-height (release early to hop short), buffered (press just
before landing and it still fires) and forgiving (coyote time). Holding duck in
mid-air fast-falls.

## How it plays

- **Score = distance**, ticking continuously, multiplied by your near-miss combo.
- **Near miss**: clear an obstacle within `SCORE.NEAR_MISS_MARGIN` px and you get
  a flat bonus, a bump to the multiplier, and AHN is physically shoved back.
  The multiplier decays if you stop taking risks.
- **Obstacles**: kimchi jars (jump; some wobble), spikes (jump), and K-pop idols
  that side-step, strike a pose, then settle into a blocking position — a *high*
  pose floats at head height (duck under, or clear it with a well-timed jump), a
  *low* pose is a ground blocker (jump).
- **AHN** is a visible pressure gauge, not a hitbox. He creeps closer as
  difficulty ramps and lunges forward every time you take a hit; near misses push
  him back. Pull far enough ahead and he trips over his own candy cane. Only
  obstacles end the run — AHN catching you *is* the death animation.
- **Candy** sits at the apex of the jump you were already making. Grabbing one
  scores and shoves AHN back, so greed and safety point the same way -- if you
  jump well.
- **AHN's swipe**: he is pressure, not a hitbox, with one exception. Pin him at
  maximum proximity long enough and he takes a telegraphed grab at Nina
  (`JUMP!` flashes, ~0.8s of windup). Jumping dodges it and scores; standing
  still costs a life. `AHN.SWIPE_ENABLED: false` turns it off.
- **Lives**: `PLAYER.LIVES` (default 3). Set it to `1` for one-hit-death tension.
- **The ghost**: a marker parked at the exact distance your best run died.
- Rain rolls through in bands; purely cosmetic.

## The opening comic

`LoreScene` plays before the title screen. Panels are listed in `LORE.PANELS`
(config.js) and shown in order, scaled to fit while preserving aspect ratio --
letterboxed on black, never stretched.

Each entry carries its image **and** its caption, so a story beat is one object:

```js
{ img: 'assets/sprites/lore/01.jpg',
  text: '"Psst... quer um docinho, pequena?"' },
```

**Adding panels 4 and 5 is one entry each**: drop the file into
`assets/sprites/lore/` and uncomment its line. The scene reads the array's
length for everything (progress dots included), and a listed file that fails to
load is skipped rather than shown broken, so you can list panels before their
art exists. An entry with no `text` simply shows no caption.

Captions render as a comic narration card -- cream fill, hard black border,
`Press Start 2P` -- sized to the wrapped text rather than fixed, and styled
via `LORE.CAPTION`.

One non-obvious thing about the font: **canvas text does not trigger a webfont
download**. The browser only fetches a face when the DOM asks for it, and
Phaser never touches the DOM, so the caption silently renders in the fallback
unless the font is requested explicitly. `LoreScene.loadCaptionFont()` does
that (warmed up in BootScene, re-laying the box out when it lands). If the font
is unavailable -- offline, say -- the caption falls back to monospace and the
game carries on.

`LORE.ONCE_PER_SESSION: true` limits it to the first load per tab.

## Tuning

**Everything tunable is in [`js/config.js`](js/config.js)** — speeds, gravity,
jump feel, spawn gaps, obstacle weights, scoring, AHN's rubber band, audio.
Nothing else holds magic numbers. The two most important knobs:

- `DIFFICULTY.RAMP_DISTANCE` — world px to reach full difficulty. This single
  number paces the whole game: speed, spawn density, obstacle mix and AHN's
  creep all read the resulting `intensity` (0..1).
- `DIFFICULTY.GAP_*` — spacing between patterns, measured in **world pixels,
  not seconds**. That is deliberate: a pixel gap stays jumpable at any speed,
  whereas a time-based spawner becomes impossible as the game accelerates.
- `PATTERNS` — the level's vocabulary. The spawner emits authored little
  phrases ("spike, then a jar half an arc later"), not lone random obstacles,
  which is what gives the game rhythm. Gaps inside a pattern are measured in
  **jump arcs**, so a pattern authored once stays playable at every speed.

### The pattern validator

`ObstacleSpawner.validatePatterns()` runs at boot and prints to the console.
It checks each pair of obstacles inside a pattern against the actual jump
parabola, not a flat distance rule:

```
window = (1 - clear(h2)) - w2 - gap - clear(h1)      [in arcs]
```

Whether two obstacles can be cleared in one jump is a question of **apex**,
not arc length -- you must already be above the first when you reach it and
still above the second when you leave it, and both ends of a parabola are low.
The validator reports the take-off window a pattern leaves the player, and the
maximum fair gap when that window is too small:

```
[patterns] "jar-spike" item 1: gap 0.44 arcs leaves only 0.205 arcs of
take-off window (need 0.3). Max fair gap here is 0.34.
```

This is not theoretical: instrumented bot runs were landing on top of the
second obstacle in exactly the three patterns it flagged.

Dev hooks (append to the URL):

| URL | Effect |
|---|---|
| `?debug` | draw every Arcade hitbox |
| `?skip` | boot straight into a run (skips intro and title) |
| `?nolore` | straight to the title screen, skipping the comic |
| `?dist=12000` | start mid-run, for tuning the late curve |

## Assets

| Asset | Status | Source |
|---|---|---|
| Comic intro panels | **real art** | `assets/sprites/lore/*.jpg` |
| Girl — run cycle | **real art**, downscaled to 70% | `assets/sprites/16-bit_pixel_art_character_sprite/.../Running/south-east/` |
| Girl — jump / fall / duck / hurt | derived from the run frames | re-posed in `ASSETS.girl.compose` |
| AHN | **real spritesheet** | generated by `tools/make_ahn_sheet.py` from the reference photo |
| Street background | **real art** | `assets/sprites/background/background.jpg`, split by `tools/make_background_layers.py` |
| Kimchi / spikes / idol | placeholder shapes | drawn in `js/art.js` |
| Jump SFX, soundtrack | **real audio** | `assets/audio/` |
| Land / hit / near-miss / game-over SFX | synth blips | `AUDIO.SOUNDS[*].synth` |

### Swapping in real pixel art

Every sprite is a real Phaser `Sprite` driven by the animation system, so
swapping art never touches gameplay code. In `ASSETS` (config.js):

- **Have a packed spritesheet?** Set `path` and the matching
  `frameWidth`/`frameHeight`. That entry then skips the generator entirely.
- **Have individual PNG frames?** Add them to `sources` and point `compose` at
  them (see `ASSETS.girl`). Frames with no source fall back to the placeholder
  drawing, so a half-finished character still produces a complete sheet.
- Then re-measure that entry's `body` box — hitboxes are plain frame-local
  pixels, listed next to each obstacle in config.js.

`artScale` upscales generated art by an integer factor at texture-build time
(NEAREST, stays crisp), so drawing code stays in a small design grid while the
game gets 2x sprites. Real spritesheets should just be exported at final size.

### Regenerating the generated assets

```bash
python3 tools/make_ahn_sheet.py [photo.jpg]   # -> assets/sprites/ahn/ahn.png
python3 tools/make_background_layers.py       # -> background_far.png + background_near.png
```

Requires Pillow. `make_background_layers.py` cuts the street at `SPLIT_Y`, the
back edge of the sidewalk, so the far layer can drift slowly while the pavement
scrolls at full speed without tearing any vertical object in half.

To resize AHN, grow the `FW`/`FH` design grid in `make_ahn_sheet.py` and
re-lay the body coordinates -- do **not** raise `OUT_SCALE`, which would give
him chunkier pixels than the girl (she is upscaled 2x). Then update
`ASSETS.ahn.frameWidth`/`frameHeight` and re-check `AHN.X_NEAR` / `X_MAX`,
which are measured against his frame width. He currently stands ~148px to her
~59px -- a deliberate 2.5x, so he reads as a giant.

The girl's size is `ASSETS.girl.sourceScale` (0.7). Changing it moves her
silhouette inside the frame, so `PLAYER.BODY_STAND` / `BODY_DUCK` must be
re-measured, and `OBSTACLES.IDOL.highY` re-derived from the resulting gap
between her standing and ducking head heights.

### Adding sounds

Set `src` on a cue in `AUDIO.SOUNDS` — that's the whole job. Until then the cue
plays a synth blip. Audio is fetched and decoded **outside** Phaser's loader on
purpose: Phaser's loader blocks on `decodeAudioData`, so one heavy track would
otherwise freeze the loading screen. Background music streams from an `<audio>`
element for the same reason.

## Layout

```
index.html            script tags, in load order
js/config.js          ALL tunable constants + the asset & audio manifests
js/art.js             texture builder: composites real frames, draws placeholders
js/audio.js           Sfx.play('jump') -- sample, else synth blip, else silence
js/entities/
  Backdrop.js         two-layer parallax street
  Player.js           the girl: jump/duck feel, hitbox swap, damage
  Ahn.js              the rubber-band chase + trip gag
  Obstacles.js        obstacle types + the procedural spawner
js/scenes/
  BootScene.js        asset load/build, animation registration, title screen
  GameScene.js        the run: difficulty ramp, scoring, collisions, game over
  GameOverScene.js    score / best / restart panel
js/main.js            Phaser config
tools/                asset generators (Python + Pillow)
```

## AHN's look

His head is the reference photo at **full resolution**, deliberately oversized
(60x76 against a 176px body, where a human head would be ~13% of their height).
The body is drawn on the same 2px pixel grid as Nina; the head is not pixelated
at all. That mismatch is the joke, not a bug -- don't "fix" it by downsampling
the face.

Two resolutions coexist in one sheet because the body is drawn first in pixel
blocks and the photo is composited over it afterwards, at final size. See the
header comment in `tools/make_ahn_sheet.py`.

## Notes for the next iteration

- Obstacle art (kimchi jar, spikes, idol dancer) is still procedural placeholder
  shapes with an auto-generated keyline. The jar carries a "KIMCHI" paper label
  drawn with a hand-plotted 3x5 bitmap font (`GLYPHS_3x5` in art.js) -- a
  system font rasterised that small is mush and would not sit on the pixel
  grid. Add glyphs there if you want to label anything else. They are sized against Nina's sprite,
  so real art dropped in at the same frame sizes needs no retuning.
- Nina only has a real run cycle; jump / fall / duck / hurt are re-posed from
  it. Real frames for those are the highest-value art upgrade left.
- Sound effects other than the jump are still procedural: layered oscillators
  and filtered noise (`AUDIO.SOUNDS[*].synth`), not beeps, but not samples
  either. Setting `src` on a cue replaces it.
- Panels 4 and 5 of the comic are stubbed out in `LORE.PANELS`.
