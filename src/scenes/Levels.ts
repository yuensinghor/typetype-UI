import Phaser from 'phaser';
import { KEYPAD } from '../lib/keypad';
import { AudioManager } from '../lib/audio';
import { theme, panel, label, primaryButton, secondaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { generateLevel, computeStars } from '../lib/levelGenerator';
import { fetchLevelProgress, submitLevelResult } from '../lib/levels';
import type { LevelDefinition, LevelProgress, RoundResult, StarCount } from '../shared/types';

type Phase = 'loading' | 'select' | 'countdown' | 'playing' | 'round_result' | 'level_complete';

const TOTAL_VISIBLE_LEVELS_AHEAD = 3; // how far past highestLevel+1 the path renders as locked previews

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

function eqFontSize(len: number): string {
  if (len <= 7) return '30px';
  if (len <= 13) return '22px';
  return '16px';
}

function formatTimer(sec: number): string {
  return `${Math.max(0, sec).toFixed(2)}s`;
}

function spinnerRow() {
  return `
    <div style="width:16px;height:16px;border:2px solid ${theme.color.border};border-top:2px solid ${theme.color.accent};
      border-radius:50%;animation:spin 0.9s linear infinite;"></div>`;
}

function infoRow(labelText: string, value: string, color: string) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="color:${theme.color.textMuted};white-space:nowrap;font-size:11px;">${labelText}</span>
      <span style="color:${color};font-weight:700;text-align:right;word-break:break-all;font-family:${theme.font.mono};">${value}</span>
    </div>`;
}

function starRow(stars: StarCount, size = 22): string {
  let out = '<div style="display:flex;gap:4px;justify-content:center;">';
  for (let i = 0; i < 3; i++) {
    const filled = i < stars;
    out += `<span style="font-size:${size}px;color:${filled ? theme.palette.yellow : theme.color.border};">★</span>`;
  }
  return out + '</div>';
}

/**
 * Phase 4 — Discrete Levels.
 *
 * v1 level-select is a single continuous vertical path (locked design's
 * low-risk fallback) rather than the full island-archipelago map — same
 * generator and progress model either way, so upgrading to the full
 * island art later doesn't touch this scene's logic, only renderSelect().
 *
 * Each level is EQUATIONS_PER_LEVEL rounds (see levelGenerator.ts). Unlike
 * Endless, a mistake does NOT end the level early — all rounds play out,
 * then stars are computed from accuracy + total time (computeStars()).
 */
export class Levels extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  private phase: Phase = 'loading';
  private progress: LevelProgress | null = null;

  private currentLevelNumber = 1;
  private currentLevelDef: LevelDefinition | null = null;
  private round = 1; // 1-based within the level
  private results: RoundResult[] = [];

  private currentTarget = '';
  private currentTimeLimit = 0;
  private answerInput = '';
  private timeLeft = 0;
  private startTime = 0;
  private lastTime = 0;
  private timerDone = false;
  private timerEvent?: Phaser.Time.TimerEvent;
  private onKeyDown?: (e: KeyboardEvent) => void;
  private isQuitModalOpen = false;

  constructor() {
    super('Levels');
  }

  init(data: { audio?: AudioManager }) {
    if (data?.audio) this.audio = data.audio;
    this.phase = 'loading';
    this.results = [];
    this.timerDone = false;
    this.answerInput = '';
    this.isQuitModalOpen = false;
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'levels-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="levels-frame" style="background:${theme.color.bg};"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#levels-frame') as HTMLDivElement;

    this.showSelect();
  }

  shutdown() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private stageLabel(): string {
    return `Level ${this.currentLevelNumber} · Round ${this.round}/${this.currentLevelDef?.equations.length ?? 5}`;
  }

  // ── Level select (v1 single-path fallback) ──────────────────────────────

  private async showSelect() {
    this.phase = 'loading';
    const c = theme.color;

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:18px 16px;display:flex;flex-direction:column;align-items:center;
        justify-content:center;gap:12px;box-sizing:border-box;">
        ${spinnerRow()}
      </div>`;

    const identity = getIdentity();
    if (!identity || identity.isGuest) {
      // Shouldn't normally happen — Home.ts already gates guests out — but
      // render something sane rather than an infinite spinner.
      this.containerEl.innerHTML = `
        <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
          align-items:center;justify-content:center;text-align:center;gap:14px;box-sizing:border-box;">
          <span style="font-size:12.5px;color:${c.textMuted};">Log in to play Levels.</span>
          ${secondaryButton('Back', 'btn-back', 'max-width:280px;')}
        </div>`;
      this.containerEl.querySelector('#btn-back')?.addEventListener('click', () => {
        this.audio.playClick();
        this.scene.start('Home');
      });
      return;
    }

    try {
      this.progress = await fetchLevelProgress(identity.userId);
    } catch (err) {
      console.error('[TypeType] fetchLevelProgress failed:', err);
      this.progress = null;
    }

    if (this.phase !== 'loading') return; // player already navigated away mid-fetch
    this.renderSelect();
  }

  private renderSelect() {
    this.phase = 'select';
    const c = theme.color;
    const highestLevel = this.progress?.highestLevel ?? 0;
    const nextPlayable = highestLevel + 1;
    const maxVisible = nextPlayable + TOTAL_VISIBLE_LEVELS_AHEAD;

    const nodes: string[] = [];
    for (let lvl = 1; lvl <= maxVisible; lvl++) {
      const stars = (this.progress?.starsByLevel[lvl] ?? 0) as StarCount;
      const isPlayable = lvl <= nextPlayable;
      const isCleared = stars > 0;
      nodes.push(`
        <button class="level-node" data-level="${lvl}" ${isPlayable ? '' : 'disabled'} style="
          width:100%;max-width:320px;${panel('padding:14px 16px;')}display:flex;align-items:center;
          justify-content:space-between;gap:12px;cursor:${isPlayable ? 'pointer' : 'not-allowed'};
          opacity:${isPlayable ? '1' : '0.45'};text-align:left;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div style="width:38px;height:38px;border-radius:10px;flex-shrink:0;
              background:${isCleared ? c.successDim : isPlayable ? c.accentDim : c.bgElevated};
              display:flex;align-items:center;justify-content:center;
              font-family:${theme.font.display};font-weight:800;font-size:15px;
              color:${isCleared ? c.success : isPlayable ? c.accent : c.textMuted};">
              ${isPlayable ? lvl : '🔒'}
            </div>
            <span style="font-family:${theme.font.display};font-weight:700;font-size:14px;color:${c.textPrimary};">
              Level ${lvl}
            </span>
          </div>
          ${isPlayable ? starRow(stars, 16) : ''}
        </button>`);
    }

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));
        display:flex;flex-direction:column;gap:14px;box-sizing:border-box;overflow-y:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">Levels</span>
          <button id="btn-select-back" style="padding:7px 14px;background:transparent;
            border:1px solid ${c.borderStrong};color:${c.textSecondary};border-radius:8px;font-size:11px;
            font-weight:700;cursor:pointer;">Back</button>
        </div>
        <span style="font-size:11.5px;color:${c.textMuted};">
          Bite-sized rounds. Clear a level for a star, ace it for three.
        </span>
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px;">
          ${nodes.join('')}
        </div>
      </div>`;

    this.containerEl.querySelector('#btn-select-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    });

    this.containerEl.querySelectorAll('.level-node:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const lvl = Number((btn as HTMLElement).dataset.level);
        this.audio.playClick();
        this.startLevel(lvl);
      });
    });
  }

  private startLevel(levelNumber: number) {
    this.currentLevelNumber = levelNumber;
    this.currentLevelDef = generateLevel(levelNumber);
    this.round = 1;
    this.results = [];
    this.showCountdown();
  }

  // ── Countdown ────────────────────────────────────────────────────────

  private showCountdown() {
    this.phase = 'countdown';
    this.timerEvent?.destroy();
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = undefined;
    }

    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:32px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">
        ${label(this.stageLabel(), c.accentBright)}
        <div style="font-family:${theme.font.display};font-size:72px;font-weight:800;
          color:${c.textPrimary};margin-top:16px;">GO</div>
      </div>
    `;

    this.audio.playCountdownGo();
    this.timerEvent = this.time.delayedCall(250, () => {
      this.audio.startMusic(1);
      this.showPlaying();
    });
  }

  // ── Playing ──────────────────────────────────────────────────────────

  private showPlaying() {
    this.phase = 'playing';
    const def = this.currentLevelDef!;
    const eq = def.equations[this.round - 1];
    this.currentTarget = stripSpaces(eq.targetAnswer);
    this.currentTimeLimit = eq.timeLimit;

    this.answerInput = '';
    this.timerDone = false;
    this.timeLeft = this.currentTimeLimit;
    this.startTime = performance.now();
    this.renderPlaying(eq.equation);
    this.startTimer();
    this.bindKeyboard();
  }

  private renderPlaying(equationText: string) {
    const c = theme.color;

    this.containerEl.innerHTML = `
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:14px 14px 6px;box-sizing:border-box;">

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;">
          <h1 style="font-family:${theme.font.display};font-size:17px;font-weight:800;color:${c.textPrimary};margin:0;">
            TypeType
          </h1>
          <button id="btn-quit" style="padding:7px 14px;background:transparent;
            border:1px solid ${c.danger};color:${c.danger};border-radius:8px;font-size:11px;
            font-weight:700;cursor:pointer;">Quit</button>
        </div>

        <div style="margin-bottom:8px;flex-shrink:0;">${label(this.stageLabel(), c.textMuted)}</div>

        <div style="${panel('padding:16px 14px;')}display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:8px;flex-shrink:0;">
          <div style="align-self:flex-start;">${label('Type this', c.textMuted)}</div>
          <div id="eq-display" style="font-family:${theme.font.mono};font-weight:700;letter-spacing:0.03em;
            color:${c.textPrimary};text-align:center;word-break:break-all;line-height:1.4;font-size:${eqFontSize(equationText.length)};">${equationText}</div>

          <div style="width:100%;height:1px;background:${c.border};margin:2px 0;"></div>

          <div style="width:100%;display:flex;flex-direction:column;align-items:center;gap:6px;">
            <div style="align-self:flex-start;">${label('Your answer', c.textMuted)}</div>
            <div id="answer-display" style="font-family:${theme.font.mono};font-size:22px;font-weight:700;
              letter-spacing:0.03em;min-height:30px;text-align:center;word-break:break-all;"></div>
          </div>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;
          ${panel('padding:10px 14px;')}margin-bottom:10px;flex-shrink:0;">
          ${label('Time left', c.textMuted)}
          <div id="timer-display" style="font-family:${theme.font.mono};font-size:18px;font-weight:700;color:${c.accentBright};"></div>
        </div>
        <div style="height:6px;border-radius:4px;background:${c.border};overflow:hidden;margin-bottom:14px;flex-shrink:0;">
          <div id="time-bar" style="height:100%;width:100%;background:${c.accent};transition:width 0.1s linear, background 0.15s;"></div>
        </div>

        <div style="flex:1;display:flex;flex-direction:column;gap:8px;min-height:0;">
          ${KEYPAD.map(row => `
            <div style="flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
              ${row.map(key => {
                const isBack = key.v === '⌫';
                const isOp = key.v === '+' || key.v === '−';
                const char = key.k ?? key.v;
                return `<button class="kp" data-char="${char}" data-back="${isBack ? '1' : '0'}" style="
                  grid-column:${key.wide ? 'span 2' : 'span 1'};width:100%;height:100%;border-radius:12px;
                  font-family:${theme.font.display};font-size:20px;font-weight:700;cursor:pointer;
                  border:1px solid ${isBack ? 'rgba(240,68,82,0.3)' : c.border};
                  background:${isBack ? c.dangerDim : c.bgCard};
                  color:${isBack ? c.danger : isOp ? c.accentBright : c.textPrimary};
                  -webkit-tap-highlight-color:transparent;">${key.v}</button>`;
              }).join('')}
            </div>`).join('')}
        </div>
        <div style="height:env(safe-area-inset-bottom,6px);flex-shrink:0;"></div>
      </div>
    `;

    this.updateInputDisplay();

    const timerDisplay = this.containerEl.querySelector('#timer-display') as HTMLElement;
    timerDisplay.textContent = formatTimer(this.timeLeft);

    this.containerEl.querySelector('#btn-quit')?.addEventListener('click', () => {
      this.audio.playClick();
      this.renderQuitModal();
    });

    this.containerEl.querySelectorAll('.kp').forEach(btn => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const el = btn as HTMLButtonElement;
        if (el.dataset.back === '1') this.deleteChar();
        else this.addChar(el.dataset.char ?? '');
      });
    });
  }

  private startTimer() {
    this.timerEvent?.destroy();
    this.lastTime = performance.now();
    this.timerEvent = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (this.timerDone || this.phase !== 'playing' || this.isQuitModalOpen) {
          this.lastTime = performance.now();
          return;
        }
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.timeLeft = Math.max(0, this.timeLeft - delta);
        const pct = this.timeLeft / this.currentTimeLimit;

        const timerDisplay = this.containerEl.querySelector('#timer-display') as HTMLElement;
        const timeBar = this.containerEl.querySelector('#time-bar') as HTMLElement;
        if (timerDisplay) timerDisplay.textContent = formatTimer(this.timeLeft);
        if (timeBar) {
          timeBar.style.width = `${Math.max(0, pct * 100)}%`;
          timeBar.style.background = pct <= 0.25 ? theme.color.danger : pct <= 0.5 ? theme.palette.orange : theme.color.accent;
        }

        if (this.timeLeft <= 0) this.finishRound(this.answerInput, true);
      },
    });
  }

  private bindKeyboard() {
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.timerDone || this.phase !== 'playing' || this.isQuitModalOpen) return;
      const k = e.key;
      if (/^[0-9.]$/.test(k) || k === '+' || k === '-') {
        e.preventDefault();
        this.addChar(k);
      } else if (k === 'Backspace') {
        e.preventDefault();
        this.deleteChar();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  // ── Quit modal (ported from EndlessMode.ts) ─────────────────────────────

  private renderQuitModal() {
    this.isQuitModalOpen = true;
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);

    const c = theme.color;
    const identity = getIdentity();
    const userId = identity?.userId ?? 'anon';
    const unlimited = platform.hasUnlimitedQuitRetry(userId);
    const freeLeft = platform.getFreeQuitsRemaining(userId);
    const needsAd = !unlimited && freeLeft <= 0;

    const modal = document.createElement('div');
    modal.id = 'quit-modal-overlay';
    modal.style.cssText = `
      position:absolute;inset:0;z-index:1000;background:rgba(45,52,54,0.55);backdrop-filter:blur(4px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;
      font-family:${theme.font.body};animation:fadeIn 0.15s;
    `;

    modal.innerHTML = `
      <div style="width:100%;max-width:300px;${panel('padding:24px 20px;')}display:flex;flex-direction:column;
        align-items:center;gap:16px;text-align:center;animation:popIn 0.18s;">
        <div style="font-family:${theme.font.display};font-size:16px;font-weight:800;color:${c.textPrimary};">
          ${needsAd ? "You're out of free retries" : 'Quit this level?'}
        </div>
        <p style="font-size:12.5px;color:${c.textSecondary};line-height:1.7;margin:0;">
          ${needsAd
            ? 'Watch a short ad to unlock unlimited quits and retries, for good.'
            : `You'll lose this attempt's progress.<br><span style="color:${c.textMuted};">${freeLeft} free ${freeLeft === 1 ? 'retry' : 'retries'} left.</span>`}
        </p>
        <div style="width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button id="btn-modal-resume" style="padding:12px 0;background:transparent;border:1px solid ${c.borderStrong};
            border-radius:10px;color:${c.textPrimary};font-family:${theme.font.display};font-weight:700;font-size:13px;cursor:pointer;">
            Keep Playing
          </button>
          <button id="btn-modal-quit" style="padding:12px 0;background:${c.dangerDim};
            border:1px solid ${c.danger};border-radius:10px;color:${c.danger};font-family:${theme.font.display};
            font-weight:700;font-size:13px;cursor:pointer;">
            ${needsAd ? 'Watch Ad' : 'Quit'}
          </button>
        </div>
      </div>
    `;

    this.containerEl.appendChild(modal);

    const btnResume = modal.querySelector('#btn-modal-resume') as HTMLButtonElement;
    const btnQuit = modal.querySelector('#btn-modal-quit') as HTMLButtonElement;

    btnResume.addEventListener('click', () => {
      this.audio.playClick();
      modal.remove();
      this.isQuitModalOpen = false;
      this.lastTime = performance.now();
      this.bindKeyboard();
    });

    btnQuit.addEventListener('click', async () => {
      this.audio.playClick();
      if (needsAd) {
        btnQuit.textContent = 'Loading…';
        btnQuit.disabled = true;
        const granted = await platform.showRewardedAd();
        modal.remove();
        if (granted) this.quitToSelect();
        else {
          this.isQuitModalOpen = false;
          this.lastTime = performance.now();
          this.bindKeyboard();
        }
        return;
      }
      if (!unlimited) platform.consumeFreeQuit(userId);
      modal.remove();
      this.quitToSelect();
    });
  }

  private quitToSelect() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.scene.restart({ audio: this.audio });
  }

  // ── Input handling ───────────────────────────────────────────────────

  private addChar(ch: string) {
    if (this.timerDone || this.phase !== 'playing' || this.isQuitModalOpen) return;
    const targetLen = this.currentTarget.length;
    if (targetLen === 0) return;

    this.audio.playClick();
    this.answerInput += ch;

    if (this.answerInput.length >= targetLen) {
      this.answerInput = this.answerInput.slice(0, targetLen);
      this.updateInputDisplay();
      this.time.delayedCall(80, () => this.finishRound(this.answerInput, false));
    } else {
      this.updateInputDisplay();
    }
  }

  private deleteChar() {
    if (this.timerDone || this.phase !== 'playing' || this.isQuitModalOpen) return;
    this.audio.playClick();
    this.answerInput = this.answerInput.slice(0, -1);
    this.updateInputDisplay();
  }

  private updateInputDisplay() {
    const target = this.currentTarget;
    const el = this.containerEl.querySelector('#answer-display') as HTMLElement;
    if (!el) return;

    if (this.answerInput.length === 0) {
      el.innerHTML = `<span style="color:${theme.color.textMuted};">${'_'.repeat(target.length)}</span>`;
      return;
    }

    const spans = this.answerInput.split('').map((ch, i) => {
      const ok = target[i] === ch;
      const color = ok ? theme.color.success : theme.color.danger;
      return `<span style="color:${color};">${ch}</span>`;
    });
    const remaining = '_'.repeat(Math.max(0, target.length - this.answerInput.length));
    el.innerHTML = spans.join('') + `<span style="color:${theme.color.textMuted};">${remaining}</span>`;
  }

  // ── Round resolution ─────────────────────────────────────────────────

  private finishRound(finalInput: string, timeout: boolean) {
    if (this.timerDone) return;
    this.timerDone = true;
    this.timerEvent?.destroy();
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = undefined;
    }
    this.audio.stopMusic();

    const timeTaken = Math.min(this.currentTimeLimit, (performance.now() - this.startTime) / 1000);
    const isCorrect = !timeout && finalInput === this.currentTarget;

    let points = 0;
    if (isCorrect) {
      const speedBonus = Math.max(0, (this.currentTimeLimit - timeTaken) * 8);
      points = Math.round(100 + speedBonus);
      this.audio.playCorrect();
    } else {
      this.audio.playFail();
    }

    const result: RoundResult = {
      roundIndex: this.round,
      equation: this.currentLevelDef!.equations[this.round - 1].equation,
      targetAnswer: this.currentTarget,
      playerInput: finalInput,
      timeTaken,
      timeLimit: this.currentTimeLimit,
      status: timeout ? 'timeout' : isCorrect ? 'correct' : 'failed',
      points,
    };
    this.results.push(result);

    // Unlike Endless, a miss does NOT end the level — every round plays
    // out, and stars reflect overall accuracy/speed at the end.
    this.showRoundResult(result);
  }

  private showRoundResult(result: RoundResult) {
    this.phase = 'round_result';
    const ok = result.status === 'correct';
    const timeout = result.status === 'timeout';
    const c = theme.color;
    const statusColor = ok ? c.success : c.danger;
    const statusText = ok ? 'Correct!' : timeout ? "Time's up" : 'Not quite';
    const isLastRound = this.round >= (this.currentLevelDef?.equations.length ?? 5);

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">

        <div style="font-family:${theme.font.display};font-size:26px;font-weight:800;color:${statusColor};margin-bottom:22px;">
          ${statusText}
        </div>

        <div style="width:100%;max-width:320px;${panel('padding:18px 18px;')}display:flex;flex-direction:column;gap:12px;margin-bottom:22px;font-size:13px;">
          ${infoRow('Equation', result.equation, c.textPrimary)}
          ${infoRow('Your answer', timeout ? '(no answer)' : (result.playerInput || '(empty)'), ok ? c.success : c.danger)}
          ${infoRow('Time', `${result.timeTaken.toFixed(3)}s / ${result.timeLimit.toFixed(2)}s`, c.accentBright)}
        </div>

        ${primaryButton(isLastRound ? 'See Results' : 'Next', 'btn-next', 'max-width:320px;')}
      </div>
    `;

    this.containerEl.querySelector('#btn-next')?.addEventListener('click', () => {
      this.audio.playClick();
      if (isLastRound) {
        this.goToLevelComplete();
      } else {
        this.round++;
        this.showCountdown();
      }
    });
  }

  // ── Level completion ─────────────────────────────────────────────────

  private async goToLevelComplete() {
    this.phase = 'level_complete';
    const stars = computeStars(this.currentLevelNumber, this.results);
    const correctCount = this.results.filter(r => r.status === 'correct').length;
    const totalScore = this.results.reduce((a, r) => a + r.points, 0);

    const identity = getIdentity();
    if (identity && !identity.isGuest) {
      submitLevelResult(identity.userId, this.currentLevelNumber, stars).catch(err =>
        console.error('[TypeType] submitLevelResult error:', err),
      );
    }

    const c = theme.color;
    const canGoNext = stars > 0;

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">

        <div style="font-family:${theme.font.display};font-size:15px;font-weight:700;color:${c.textMuted};margin-bottom:10px;">
          Level ${this.currentLevelNumber} ${stars > 0 ? 'Cleared' : 'Try Again'}
        </div>
        <div style="margin-bottom:18px;">${starRow(stars, 40)}</div>

        <div style="width:100%;max-width:320px;${panel('padding:18px 18px;')}display:flex;flex-direction:column;gap:12px;margin-bottom:22px;font-size:13px;">
          ${infoRow('Rounds correct', `${correctCount}/${this.results.length}`, c.textPrimary)}
          ${infoRow('Score', String(totalScore), c.accentBright)}
        </div>

        <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;">
          ${canGoNext ? primaryButton('Next Level', 'btn-next-level', 'max-width:320px;') : ''}
          ${secondaryButton(stars > 0 ? 'Retry' : 'Try Again', 'btn-retry', 'max-width:320px;')}
          ${secondaryButton('Back to Levels', 'btn-back', 'max-width:320px;')}
        </div>
      </div>
    `;

    this.containerEl.querySelector('#btn-next-level')?.addEventListener('click', () => {
      this.audio.playClick();
      this.startLevel(this.currentLevelNumber + 1);
    });
    this.containerEl.querySelector('#btn-retry')?.addEventListener('click', () => {
      this.audio.playClick();
      this.startLevel(this.currentLevelNumber);
    });
    this.containerEl.querySelector('#btn-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.restart({ audio: this.audio });
    });
  }
}
