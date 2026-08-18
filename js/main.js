/* =====================================================================
 * SCAPE AHN!  --  main.js
 * ---------------------------------------------------------------------
 * Phaser bootstrap. Everything tunable lives in js/config.js.
 * ===================================================================== */

/* Dev hooks, off by default:
 *   index.html?debug  -> draw every Arcade hitbox
 *   index.html?skip   -> boot straight into a run, skipping the title screen  */
const DEV = new URLSearchParams(location.search);

const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  backgroundColor: GAME.BG_COLOR,

  // Crisp pixel-art scaling: no smoothing, no sub-pixel sprite positions.
  pixelArt: true,
  roundPixels: true,

  scale: {
    mode: Phaser.Scale.FIT,             // letterbox the 16:9 canvas into any window
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: GAME.GRAVITY },
      debug: DEV.has('debug'),          // or just flip this to true
    },
  },

  input: { activePointers: 2 },         // allow a second finger on mobile

  scene: [BootScene, TitleScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(gameConfig);
