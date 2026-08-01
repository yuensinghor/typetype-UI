/**
 * Sound manager: short SFX (clicks, correct/fail, countdown) stay
 * WebAudio-synthesized square/sine blips — cheap, instant, no asset needed.
 * Menu/background music is a real looping track (public/audio/menu-music.mp3,
 * precached by the service worker — see vite.config.ts's
 * maximumFileSizeToCacheInBytes bump for this) played through a single
 * shared <audio> element, replacing the earlier procedurally-generated
 * arpeggio placeholder.
 *
 * Exported as a single shared instance (`audioManager`, below) rather than
 * one-per-scene, so the mute toggle and "is menu music currently playing"
 * state stay correct across scene.start() transitions without every scene
 * needing to manually pass `{ audio: this.audio }` around.
 */
const MUTE_KEY = 'dd_sound_muted';
const MENU_MUSIC_SRC = `${import.meta.env.BASE_URL}audio/menu-music.mp3`;
const MENU_MUSIC_VOLUME = 0.4;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private soundEnabled = true;
  private musicEnabled = true;
  private menuMusicEl: HTMLAudioElement | null = null;
  // Tracks whether menu music *should* be playing right now, so unmuting
  // resumes it and re-entering a menu after gameplay restarts it cleanly.
  private wantsMenuMusic = false;

  constructor() {
    const muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
    this.soundEnabled = !muted;
    this.musicEnabled = !muted;
  }

  isMuted(): boolean {
    return !this.soundEnabled;
  }

  /** Flips mute state, persists it, and pauses/resumes menu music to match
   *  without losing track of whether menu music *should* be playing.
   *  Returns the new muted state (true = now muted). */
  toggleMute(): boolean {
    this.soundEnabled = !this.soundEnabled;
    this.musicEnabled = this.soundEnabled;
    try { localStorage.setItem(MUTE_KEY, this.soundEnabled ? '0' : '1'); } catch { /* ignore */ }

    if (!this.soundEnabled) {
      this.pauseMusicPlayback();
    } else if (this.wantsMenuMusic) {
      this.startMenuMusic();
    }
    return !this.soundEnabled;
  }

  /** Pauses the audible track without forgetting we're still "in a menu" —
   *  currentTime is preserved (not reset), so unmuting or coming back from
   *  a gameplay round resumes mid-track rather than restarting from 0. */
  private pauseMusicPlayback() {
    this.menuMusicEl?.pause();
  }

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

  private getMenuMusicEl(): HTMLAudioElement {
    if (!this.menuMusicEl) {
      const el = new Audio(MENU_MUSIC_SRC);
      el.loop = true;
      el.preload = 'auto';
      el.volume = MENU_MUSIC_VOLUME;
      this.menuMusicEl = el;
    }
    return this.menuMusicEl;
  }

  /**
   * Looping menu theme. Meant to play continuously on every non-gameplay
   * screen (Preloader, Home, results, landing pages) and stop the instant a
   * typing round actually starts, where only keypad/SFX sounds should be
   * heard.
   */
  startMenuMusic() {
    this.wantsMenuMusic = true;
    if (!this.musicEnabled) return;
    try {
      const el = this.getMenuMusicEl();
      // play() returns a Promise that rejects if the browser's autoplay
      // policy blocks it (no user gesture yet) — same "fail silently and
      // let the next real interaction retry" behavior as the old
      // WebAudio-context path had.
      el.play().catch(() => { /* ignore — will retry on next call */ });
    } catch {
      /* ignore */
    }
  }

  /** @deprecated kept as an alias so any leftover call sites still compile;
   *  prefer startMenuMusic() — gameplay itself should stay music-free. */
  startMusic(_seed: number) {
    this.startMenuMusic();
  }

  stopMusic() {
    this.wantsMenuMusic = false;
    this.pauseMusicPlayback();
  }

  setSoundEnabled(v: boolean) { this.soundEnabled = v; }
  setMusicEnabled(v: boolean) {
    this.musicEnabled = v;
    if (!v) this.stopMusic();
  }
}

/** Shared instance — import this everywhere instead of `new AudioManager()`
 *  so mute state and menu-music playback stay consistent across scenes. */
export const audioManager = new AudioManager();