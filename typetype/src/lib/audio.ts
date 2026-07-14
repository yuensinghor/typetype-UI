/**
 * Minimal WebAudio synth-based sound manager. No external audio files required,
 * which keeps the PWA installable/offline-friendly out of the box. Swap in
 * real audio files later by pointing these methods at an <audio> pool instead.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private musicEnabled = true;
  private musicTimer: number | null = null;
  private musicGain: GainNode | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  private beep(freq: number, duration: number, type: OscillatorType = 'square', gainVal = 0.05) {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = gainVal;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.stop(ctx.currentTime + duration);
    } catch {
      /* audio not available (e.g. no user gesture yet) — fail silently */
    }
  }

  playClick() { this.beep(600, 0.05, 'square', 0.03); }
  playCountdownTick() { this.beep(440, 0.08, 'sine', 0.04); }
  playCountdownGo() { this.beep(880, 0.18, 'sawtooth', 0.05); }
  playCorrect() { this.beep(1046, 0.12, 'sine', 0.05); }
  playFail() { this.beep(140, 0.25, 'sawtooth', 0.05); }
  playVictory() {
    if (!this.soundEnabled) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.beep(f, 0.15, 'sine', 0.04), i * 90);
    });
  }

  startMusic(_seed: number) {
    if (!this.musicEnabled) return;
    this.stopMusic();
    try {
      const ctx = this.getCtx();
      const gain = ctx.createGain();
      gain.gain.value = 0.015;
      gain.connect(ctx.destination);
      this.musicGain = gain;
      const notes = [220, 246, 277, 220];
      let i = 0;
      this.musicTimer = window.setInterval(() => {
        if (!this.musicEnabled) return;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = notes[i % notes.length];
        osc.connect(gain);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
        i++;
      }, 260);
    } catch {
      /* ignore */
    }
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setSoundEnabled(v: boolean) { this.soundEnabled = v; }
  setMusicEnabled(v: boolean) {
    this.musicEnabled = v;
    if (!v) this.stopMusic();
  }
}
