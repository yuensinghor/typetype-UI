import Phaser from 'phaser';
import { AudioManager } from '../lib/audio';
import { generateEquation, getTimeLimit, getEndlessTimeLimit, LIMIT_BREAK_LIMITS } from '../lib/equation';
import { LadderEngine, type LadderState } from '../lib/ladderEngine';
import { platform } from '../lib/standaloneAdapter';
import { phaserGame, getIdentity } from '../game';
import { theme, panel, label, primaryButton, secondaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { KEYPAD } from '../lib/keypad';
import type { RoundResult, Tier } from '../shared/types';

type Phase = 'countdown' | 'playing' | 'round_result';

interface SceneData {
  startTier: Tier;
  audio: AudioManager;
}

const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', boss: 'Boss' };
const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3, boss: 4 };

function eqFontSize(len: number): string {
  if (len <= 7) return '30px';
  if (len <= 13) return '22px';
  return '16px';
}

function formatTimer(sec: number): string {
  const clamped = Math.max(0, sec);
  return `${clamped.toFixed(2)}s`;
}

export class Game extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio!: AudioManager;
  private engine!: LadderEngine;

  private currentEq = { equation: '', targetAnswer: '' };
  private phase: Phase = 'countdown';

  private answerInput = '';
  private timeLeft = 0;
  private timeLimit = 0;
  private startTime = 0;
  private lastTime = 0;
  private timerDone = false;
  private timerEvent?: Phaser.Time.TimerEvent;
  private onKeyDown?: (e: KeyboardEvent) => void;
  private isQuitModalOpen = false;
  private startTier!: Tier;

  constructor() {
    super('Game');
  }

  init(data: SceneData) {
    this.audio = data.audio ?? new AudioManager();
    this.isQuitModalOpen = false;
    this.startTier = data.startTier;
    this.engine = new LadderEngine(data.startTier);
    this.currentEq = generateEquation(data.startTier);
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'game-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="game-frame" style="background:${theme.color.bg};"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#game-frame') as HTMLDivElement;
    this.showCountdown();
  }

  shutdown() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  // ── Countdown ─────────────────────────────────────────────────────────

  private showCountdown() {
    this.phase = 'countdown';
    this.timerEvent?.destroy();
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = undefined;
    }

    const s = this.engine.getState();
    const c = theme.color;
    const g = s.phase === 'limit_break';

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:32px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">
        ${label(this.stageLabel(s), g ? c.warningText : c.textMuted)}
        <div id="countdown-value" style="font-family:${theme.font.display};font-size:72px;font-weight:800;
          color:${g ? c.warningText : c.textPrimary};margin-top:16px;">3</div>
        <p style="font-family:${theme.font.body};font-size:12.5px;color:${c.textMuted};max-width:280px;line-height:1.7;margin-top:14px;">
          ${g ? 'This one is extremely tight. Good luck.' : 'Type the equation back exactly, as fast as you can.'}
        </p>
      </div>
    `;

    const valueEl = this.containerEl.querySelector('#countdown-value') as HTMLElement;
    let count = 3;
    this.audio.playCountdownTick();

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        count--;
        if (count > 0) {
          this.audio.playCountdownTick();
          valueEl.textContent = String(count);
        } else {
          this.audio.playCountdownGo();
          valueEl.textContent = g ? 'GO!' : 'GO';
          this.time.delayedCall(400, () => {
            this.audio.startMusic(s.stageInTier);
            this.showPlaying();
          });
        }
      },
    });
  }

  private stageLabel(s: LadderState): string {
    if (s.phase === 'limit_break') return 'Final Stage · Limit Break';
    if (s.phase === 'hidden_bonus') return `Level ${TIER_NUMBER[s.tier]} · ${TIER_LABELS[s.tier]} · Bonus Stage ${s.stageInTier}/10`;
    return `Level ${TIER_NUMBER[s.tier]} · ${TIER_LABELS[s.tier]} · Round ${s.stageInTier}/5`;
  }

  // ── Playing ───────────────────────────────────────────────────────────

  private showPlaying() {
    this.phase = 'playing';
    this.answerInput = '';
    this.timerDone = false;
    const s = this.engine.getState();
    this.timeLimit = this.calcTimeLimit(s);
    this.timeLeft = this.timeLimit;
    this.startTime = performance.now();

    if (!this.currentEq.equation || !this.currentEq.targetAnswer) {
      this.currentEq = generateEquation(s.tier);
    }

    this.renderPlaying();
    this.startTimer();
    this.bindKeyboard();
  }

  private calcTimeLimit(s: LadderState): number {
    if (s.phase === 'limit_break') return LIMIT_BREAK_LIMITS[s.tier];
    if (s.phase === 'hidden_bonus') return getEndlessTimeLimit(s.tier, s.stageInTier);
    return getTimeLimit(s.tier, s.stageInTier);
  }

  private renderPlaying() {
    const s = this.engine.getState();
    const g = s.phase === 'limit_break';
    const c = theme.color;
    const stageLabel = this.stageLabel(s);

    this.containerEl.innerHTML = `
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;padding:14px 14px 6px;box-sizing:border-box;">

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-shrink:0;">
          <h1 style="font-family:${theme.font.display};font-size:17px;font-weight:800;color:${g ? c.warningText : c.textPrimary};margin:0;">
            TypeType
          </h1>
          <button id="btn-quit" style="padding:7px 14px;background:transparent;
            border:1px solid ${c.danger};color:${c.danger};border-radius:8px;font-size:11px;
            font-weight:700;cursor:pointer;">Quit</button>
        </div>

        <div style="margin-bottom:8px;flex-shrink:0;">${label(stageLabel, g ? c.warningText : c.textMuted)}</div>

        <div style="${panel('padding:16px 14px;')}display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:8px;flex-shrink:0;">
          <div style="align-self:flex-start;">${label('Type this', c.textMuted)}</div>
          <div id="eq-display" style="font-family:${theme.font.mono};font-weight:700;letter-spacing:0.03em;
            color:${c.textPrimary};text-align:center;word-break:break-all;line-height:1.4;"></div>

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
          <div id="timer-display" style="font-family:${theme.font.mono};font-size:18px;font-weight:700;color:${c.accent};"></div>
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
                  border:1px solid ${isBack ? theme.color.dangerDim : c.border};
                  background:${isBack ? c.dangerDim : c.bgCard};
                  color:${isBack ? c.danger : isOp ? c.accentBright : c.textPrimary};
                  -webkit-tap-highlight-color:transparent;">${key.v}</button>`;
              }).join('')}
            </div>`).join('')}
        </div>
        <div style="height:env(safe-area-inset-bottom,6px);flex-shrink:0;"></div>
      </div>
    `;

    this.renderEquation();
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

  private renderEquation() {
    const eqEl = this.containerEl.querySelector('#eq-display') as HTMLElement;
    if (!eqEl) return;
    eqEl.style.fontSize = eqFontSize(this.currentEq.equation.length);
    eqEl.textContent = this.currentEq.equation;
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
        const pct = this.timeLeft / this.timeLimit;

        const timerDisplay = this.containerEl.querySelector('#timer-display') as HTMLElement;
        const timeBar = this.containerEl.querySelector('#time-bar') as HTMLElement;
        if (timerDisplay) timerDisplay.textContent = formatTimer(this.timeLeft);
        if (timeBar) {
          timeBar.style.width = `${Math.max(0, pct * 100)}%`;
          // Coral (plenty of time) -> punchy orange (getting tight) -> red (critical).
          // Using the raw palette orange here instead of the pale warning
          // yellow — a fill bar needs to visually pop against the light
          // track, and pale yellow barely reads as a state change.
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

  // ── Quit modal ────────────────────────────────────────────────────────

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
    // Warm dark scrim (derived from textPrimary #2D3436) instead of the old
    // near-black navy overlay — a pure near-black scrim looked out of place
    // popping up over the cream/white palette everywhere else.
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
            : `You'll lose progress on this level.<br><span style="color:${c.textMuted};">${freeLeft} free ${freeLeft === 1 ? 'retry' : 'retries'} left.</span>`}
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
        if (granted) platform.grantUnlimitedQuitRetry(userId);
        modal.remove();
        if (granted) this.quitToLobby();
        else {
          this.isQuitModalOpen = false;
          this.lastTime = performance.now();
          this.bindKeyboard();
        }
        return;
      }
      if (!unlimited) platform.consumeFreeQuit(userId);
      modal.remove();
      this.quitToLobby();
    });
  }

  // ── Input handling ────────────────────────────────────────────────────

  private addChar(ch: string) {
    if (this.timerDone || this.phase !== 'playing' || this.isQuitModalOpen) return;
    const targetLen = this.currentEq.targetAnswer.length;
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

  /** Live character-by-character feedback: green = correct so far, red = wrong so far. */
  private updateInputDisplay() {
    const target = this.currentEq.targetAnswer;
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

  // ── Round resolution ──────────────────────────────────────────────────

  private finishRound(finalInput: string, timeout: boolean) {
    if (this.timerDone) return;
    this.timerDone = true;
    this.timerEvent?.destroy();
    if (this.onKeyDown) {
      window.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = undefined;
    }
    this.audio.stopMusic();

    const timeTaken = Math.min(this.timeLimit, (performance.now() - this.startTime) / 1000);
    const isCorrect = !timeout && finalInput === this.currentEq.targetAnswer;
    const beforeState = this.engine.getState();

    let points = 0;
    if (isCorrect) {
      const speedBonus = Math.max(0, (this.timeLimit - timeTaken) * 8);
      points = Math.round(100 + speedBonus);
      this.audio.playCorrect();
    } else {
      this.audio.playFail();
    }

    const result: RoundResult = {
      roundIndex: beforeState.stageInTier,
      equation: this.currentEq.equation,
      targetAnswer: this.currentEq.targetAnswer,
      playerInput: finalInput,
      timeTaken,
      timeLimit: this.timeLimit,
      status: timeout ? 'timeout' : isCorrect ? 'correct' : 'failed',
      points,
    };

    const newState = this.engine.submitRoundResult(result);
    this.showRoundResult(result, newState);
  }

  private showRoundResult(result: RoundResult, state: LadderState) {
    this.phase = 'round_result';
    const ok = result.status === 'correct';
    const timeout = result.status === 'timeout';
    const c = theme.color;
    const g = state.phase === 'limit_break';
    const statusColor = ok ? c.success : c.danger;
    const statusText = ok ? (g ? 'Cleared!' : 'Correct!') : timeout ? "Time's up" : 'Not quite';

    let btnLabel = 'Continue';
    if (state.phase === 'game_over' || state.phase === 'run_complete') {
      btnLabel = 'See Results';
    } else if (state.phase === 'tier_cleared') {
      btnLabel = 'Continue';
    } else if (state.phase === 'hidden_bonus') {
      btnLabel = `Bonus Stage ${state.stageInTier}`;
    } else if (state.phase === 'limit_break') {
      btnLabel = 'Final Stage';
    } else {
      btnLabel = `Round ${state.stageInTier}`;
    }

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">

        <div style="font-family:${theme.font.display};font-size:26px;font-weight:800;color:${statusColor};margin-bottom:22px;">
          ${statusText}
        </div>

        <div style="width:100%;max-width:320px;${panel('padding:18px 18px;')}display:flex;flex-direction:column;gap:12px;margin-bottom:22px;font-size:13px;">
          ${infoRow('Equation', result.equation, c.textPrimary)}
          ${infoRow('Your answer', timeout ? '(no answer)' : (result.playerInput || '(empty)'), ok ? c.success : c.danger)}
          ${infoRow('Time', `${result.timeTaken.toFixed(3)}s / ${result.timeLimit.toFixed(2)}s`, c.accent)}
          ${ok ? infoRow('Points', `+${result.points}`, c.success) : ''}
        </div>

        ${primaryButton(btnLabel, 'btn-next', 'max-width:320px;')}
      </div>
    `;

    this.containerEl.querySelector('#btn-next')?.addEventListener('click', () => {
      this.audio.playClick();
      this.onIntermissionComplete(state);
    });
  }

  private onIntermissionComplete(state: LadderState) {
    if (state.phase === 'game_over' || state.phase === 'run_complete') {
      this.goToGameOver();
      return;
    }

    if (state.phase === 'tier_cleared') {
      const resolved = this.engine.resolveTierClearedTransition();
      if (resolved.phase === 'hidden_bonus') {
        this.showStageUnlockScreen('hidden_stages', resolved);
        return;
      }
      if (resolved.phase === 'limit_break') {
        this.showStageUnlockScreen('limit_break', resolved);
        return;
      }
      // Every other outcome (game_over or run_complete) ends this tier's
      // session here — no more silent chaining into the next tier's countdown.
      this.goToGameOver();
      return;
    }

    if (state.phase === 'limit_break' && state.reachedLimitBreak && state.stageInTier === 11) {
      this.showStageUnlockScreen('limit_break', state);
      return;
    }

    this.currentEq = generateEquation(state.tier);
    this.showCountdown();
  }

  private showStageUnlockScreen(type: 'hidden_stages' | 'limit_break', state: LadderState) {
    this.phase = 'round_result';
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);

    const c = theme.color;
    const isHidden = type === 'hidden_stages';
    const accent = isHidden ? c.warningText : c.success;
    const headline = isHidden ? 'Bonus Stages Unlocked!' : 'Final Stage';

    const screen = document.createElement('div');
    screen.id = 'stage-unlock-screen';
    screen.style.cssText = `
      position:absolute;inset:0;z-index:500;background:${c.bg};display:flex;flex-direction:column;
      align-items:center;justify-content:center;padding:24px;font-family:${theme.font.body};text-align:center;
    `;

    screen.innerHTML = `
      <div style="max-width:340px;display:flex;flex-direction:column;align-items:center;gap:14px;">
        <div style="font-family:${theme.font.display};font-size:22px;font-weight:800;color:${accent};">${headline}</div>
        <p style="font-size:13px;color:${c.textSecondary};line-height:1.8;margin:0;">
          ${isHidden
            ? `You beat the target speed for ${TIER_LABELS[state.tier]}. Bonus stages 6-10 are open — one mistake ends the run, but clearing them earns a cosmetic badge.`
            : `Bonus stages cleared. One stage remains — it's brutally fast. Good luck.`}
        </p>
        ${primaryButton(isHidden ? 'Start Bonus Stages' : 'Attempt Final Stage', 'btn-enter-system')}
      </div>
    `;

    this.containerEl.appendChild(screen);

    screen.querySelector('#btn-enter-system')?.addEventListener('click', () => {
      this.audio.playClick();
      screen.remove();
      this.currentEq = generateEquation(state.tier);
      this.showCountdown();
    });
  }

  // ── Exit paths ────────────────────────────────────────────────────────

  private goToGameOver() {
    const state = this.engine.getState();
    const identity = getIdentity();
    const username = identity?.username ?? '';
    const snapshot = this.engine.getLastClearedSnapshot();

    const correct = state.overallResults.filter(r => r.status === 'correct').length;
    const total = state.overallResults.length;
    const attemptAccuracy = total > 0 ? correct / total : 0;
    const attemptScore = state.overallResults.reduce((a, r) => a + r.points, 0);
    const attemptTotalTimeMs = Math.round(state.overallResults.reduce((a, r) => a + r.timeTaken * 1000, 0));

    this.scene.start('GameOver', {
      snapshot,
      unlockedTierReached: this.engine.getHighestTierReachedThisRun(),
      startTier: this.startTier,
      username,
      audio: this.audio,
      attemptAccuracy,
      roundsCorrect: correct,
      roundsTotal: total,
      attemptScore,
      attemptTotalTimeMs,
      badgesEarned: state.clearedTierBadges,
      hasLimitBreakAward: this.engine.hasLimitBreakAward(),
    });
  }

  private quitToLobby() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.scene.start('MainMenu');
  }
}

function infoRow(labelText: string, value: string, color: string) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="color:${theme.color.textMuted};white-space:nowrap;font-size:11px;">${labelText}</span>
      <span style="color:${color};font-weight:700;text-align:right;word-break:break-all;font-family:${theme.font.mono};">${value}</span>
    </div>`;
}
