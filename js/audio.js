/* =====================================================================
 * SCAPE AHN!  --  audio.js
 * ---------------------------------------------------------------------
 * Gameplay code only ever says `Sfx.play('jump')`.
 *
 * Audio is deliberately kept OUT of Phaser's asset loader. Phaser's loader
 * waits on decodeAudioData for every audio file, so one slow or undecodable
 * file freezes the loading screen and the game never starts. Here, sounds
 * are fetched and decoded in the background: the game is playable
 * immediately and cues simply become real as they finish decoding.
 *
 * Resolution order per cue:
 *   1. The decoded sample, once it has arrived (Web Audio, zero latency).
 *   2. A synth blip, if AUDIO.SYNTH_FALLBACK is on -- also covers the
 *      window before decoding finishes, and any cue with no file yet.
 *   3. Silence.
 *
 * Music is separate again: a streaming <audio> element, so a multi-megabyte
 * track starts instantly instead of being fully decoded up front.
 *
 * TO ADD A REAL SOUND: set `src` on the cue in config.js. Nothing else.
 * ===================================================================== */

const Sfx = (function () {
  const buffers = {};       // cue key -> decoded AudioBuffer
  let actx = null;          // shared AudioContext
  let masterGain = null;
  let music = null;         // HTMLAudioElement
  let muted = false;
  let started = false;

  function ctx() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      masterGain = actx.createGain();
      masterGain.gain.value = AUDIO.MASTER_VOLUME;
      masterGain.connect(actx.destination);
    }
    return actx;
  }

  /** Kick off background fetch+decode for every cue that has a file. */
  function init() {
    if (started) return;
    started = true;

    const c = ctx();
    Object.keys(AUDIO.SOUNDS).forEach((key) => {
      const def = AUDIO.SOUNDS[key];
      if (!def.src || !c) return;
      const url = Array.isArray(def.src) ? def.src[0] : def.src;
      fetch(url)
        .then((res) => res.arrayBuffer())
        .then((buf) => c.decodeAudioData(buf))
        .then((decoded) => { buffers[key] = decoded; })
        .catch((e) => console.warn('[sfx] could not load', key, url, e));
    });

    if (AUDIO.MUSIC && AUDIO.MUSIC.src && !music) {
      music = new Audio(AUDIO.MUSIC.src);
      music.loop = AUDIO.MUSIC.loop !== false;
      music.preload = 'auto';
      music.volume = AUDIO.MUSIC.volume * AUDIO.MASTER_VOLUME;
    }
  }

  /** Browsers block audio until a user gesture; call this from any input. */
  function unlock() {
    const c = ctx();
    if (c && c.state === 'suspended') c.resume();
    playMusic();
  }

  /** Short pitch-swept blip: covers cues with no sample (yet). */
  function blip(def) {
    const c = ctx();
    if (!c || !def.synth) return;
    const s = def.synth;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const vol = (def.volume != null ? def.volume : 1) * 0.35;
    osc.type = s.type || 'square';
    osc.frequency.setValueAtTime(s.freq, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.to), c.currentTime + s.dur);
    gain.gain.setValueAtTime(vol, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + s.dur);
    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + s.dur + 0.02);
  }

  function play(key) {
    if (!AUDIO.ENABLED || muted) return;
    const def = AUDIO.SOUNDS[key];
    if (!def) { console.warn('[sfx] unknown cue:', key); return; }

    const c = ctx();
    if (c && buffers[key]) {
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = (def.volume != null ? def.volume : 1);
      src.buffer = buffers[key];
      src.connect(gain).connect(masterGain);
      src.start(0);
      return;
    }
    if (AUDIO.SYNTH_FALLBACK) blip(def);
  }

  /** Start the looping background music. Safe to call repeatedly. */
  function playMusic() {
    if (!AUDIO.ENABLED || muted || !music || !music.paused) return;
    const p = music.play();
    if (p && p.catch) p.catch(() => {});   // pre-gesture rejection is expected
  }

  function stopMusic() { if (music) music.pause(); }

  /** Pull the music down under the game-over panel, then bring it back. */
  function duckMusic(on) {
    if (!music) return;
    const full = AUDIO.MUSIC.volume * AUDIO.MASTER_VOLUME;
    music.volume = on ? full * AUDIO.MUSIC_DUCK : full;
  }

  function setMuted(v) {
    muted = v;
    if (masterGain) masterGain.gain.value = v ? 0 : AUDIO.MASTER_VOLUME;
    if (music) { music.muted = v; if (!v) playMusic(); }
    return muted;
  }
  function toggleMute() { return setMuted(!muted); }
  function isMuted() { return muted; }

  return { init, unlock, play, playMusic, stopMusic, duckMusic, setMuted, toggleMute, isMuted };
})();
