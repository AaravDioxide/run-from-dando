// js/audio.js — Procedural Web Audio API sound effects, dynamic Heat intensity music, and Easter Egg scream synth

export class AudioManager {
  constructor(saveManager) {
    this.saveManager = saveManager;
    this.ctx = null;
    this.unlocked = false;
    this.musicTimer = null;
    this.currentMapId = 'downtown';
    this.pursuitIntensity = 0;
    this.isPlayingMusic = false;
    this.beatStep = 0;
  }

  initFromGesture() {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.unlocked = true;
    } catch (e) {
      this.unlocked = false;
    }
  }

  _getEffectiveSfxGain() {
    const s = this.saveManager.data.settings;
    return (s.masterVolume ?? 0.8) * (s.effectsVolume ?? 0.8);
  }

  _getEffectiveMusicGain() {
    const s = this.saveManager.data.settings;
    return (s.masterVolume ?? 0.8) * (s.musicVolume ?? 0.55);
  }

  playTone(freq, duration = 0.12, type = 'sine', gainMult = 0.25, slideTo = null) {
    if (!this.ctx || !this.unlocked) return;
    const vol = this._getEffectiveSfxGain() * gainMult;
    if (vol <= 0.001) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      }
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (e) {
      // Ignore audio scheduling errors
    }
  }

  playSfx(name) {
    if (!this.ctx || !this.unlocked) return;
    switch (name) {
      case 'click':
        this.playTone(620, 0.04, 'square', 0.14, 820);
        break;
      case 'countdown':
        this.playTone(440, 0.12, 'square', 0.18);
        break;
      case 'go':
        this.playTone(880, 0.24, 'sawtooth', 0.24, 1180);
        break;
      case 'dodge':
        this.playTone(300, 0.16, 'triangle', 0.26, 760);
        break;
      case 'sprint':
        this.playTone(240, 0.09, 'sawtooth', 0.12, 420);
        break;
      case 'ability':
        this.playTone(520, 0.22, 'sawtooth', 0.24, 980);
        setTimeout(() => this.playTone(780, 0.18, 'square', 0.20, 1240), 55);
        break;
      case 'pickup':
        this.playTone(587.33, 0.09, 'triangle', 0.24, 880);
        setTimeout(() => this.playTone(880, 0.13, 'square', 0.20, 1174.66), 70);
        break;
      case 'shield_break':
        this.playTone(640, 0.22, 'sawtooth', 0.25, 140);
        break;
      case 'damage':
        this.playTone(145, 0.28, 'sawtooth', 0.34, 52);
        break;
      case 'warning':
        this.playTone(760, 0.11, 'square', 0.18, 520);
        break;
      case 'lunge':
        this.playTone(230, 0.22, 'sawtooth', 0.26, 92);
        break;
      case 'nearmiss':
        this.playTone(940, 0.11, 'triangle', 0.22, 1420);
        break;
      case 'terminal':
        this.playTone(660, 0.11, 'square', 0.22, 990);
        setTimeout(() => this.playTone(990, 0.16, 'triangle', 0.24, 1320), 85);
        break;
      case 'heat_up':
        this.playTone(330, 0.15, 'sawtooth', 0.24, 660);
        setTimeout(() => this.playTone(440, 0.22, 'sawtooth', 0.26, 880), 120);
        break;
      case 'scream':
        // Comedic panicked high-pitched warble for "STOP FOLLOWING ME!" Easter egg
        this.playTone(980, 0.14, 'sawtooth', 0.30, 1480);
        setTimeout(() => this.playTone(1420, 0.18, 'square', 0.28, 760), 110);
        setTimeout(() => this.playTone(1260, 0.22, 'sawtooth', 0.30, 540), 230);
        break;
      case 'cheat':
        this.playTone(480, 0.08, 'square', 0.22, 960);
        setTimeout(() => this.playTone(960, 0.12, 'square', 0.22, 1440), 70);
        break;
      case 'victory':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
          setTimeout(() => this.playTone(f, 0.20, 'square', 0.22), idx * 90);
        });
        break;
      case 'gameover':
        [320, 270, 210, 145].forEach((f, idx) => {
          setTimeout(() => this.playTone(f, 0.24, 'sawtooth', 0.22), idx * 105);
        });
        break;
      case 'buy':
        this.playTone(700, 0.09, 'square', 0.22, 1080);
        break;
      case 'error':
        this.playTone(180, 0.16, 'sawtooth', 0.20, 130);
        break;
    }
  }

  startMusic(mapId = 'downtown') {
    this.currentMapId = mapId;
    this.stopMusic();
    this.isPlayingMusic = true;
    this.beatStep = 0;

    const scales = {
      downtown: [110, 130.81, 146.83, 164.81, 196.0, 220.0],
      afterparty: [116.54, 138.59, 155.56, 174.61, 207.65, 233.08],
      carnival: [130.81, 146.83, 164.81, 196.0, 220.0, 261.63]
    };

    const tick = () => {
      if (!this.isPlayingMusic) return;
      const musicGain = this._getEffectiveMusicGain();
      if (this.ctx && this.unlocked && musicGain > 0.005 && document.visibilityState !== 'hidden') {
        const scale = scales[this.currentMapId] || scales.downtown;
        const note = scale[this.beatStep % scale.length];
        this.playTone(note, 0.15, 'triangle', musicGain * 0.13);

        if (this.pursuitIntensity > 0.45 && this.beatStep % 2 === 0) {
          this.playTone(note * 2, 0.07, 'square', musicGain * 0.07 * this.pursuitIntensity);
        }
      }
      this.beatStep++;
      const tempoMs = Math.max(130, 225 - Math.floor(this.pursuitIntensity * 75));
      this.musicTimer = setTimeout(tick, tempoMs);
    };

    tick();
  }

  setPursuitIntensity(val) {
    this.pursuitIntensity = Math.max(0, Math.min(1, val));
  }

  stopMusic() {
    this.isPlayingMusic = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
