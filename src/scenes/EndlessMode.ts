import Phaser from 'phaser';
import { getTimeLimit, generateEquation } from '../lib/equation';
import { KEYPAD } from '../lib/keypad';
import { AudioManager } from '../lib/audio';
import { theme, panel, label, primaryButton, secondaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { submitEndlessRun, fetchMyBestEndless, type EndlessBest } from '../lib/endless';
import type { Tier, RoundResult } from '../shared/types';

const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', boss: 'Boss' };

type Phase = 'landing' | 'countdown' | 'playing' | 'round_result' | 'complete';

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

// Round -> tier: 5 rounds per tier climbing easy -> medium -> hard -> boss
// (rounds 1-20), then holds at boss forever. Unlike Daily Challenge's hidden
// bonus stages, there's no further time-tightening past round 20 — per the
// locked design, difficulty past the tier climb comes from sustained
// pressure (one mistake ends it), not an ever-shrinking timer.
function tierForRound(round: number): Tier {
  if (round <= 5) return 'easy';
  if (round <= 10) return 'medium';
  if (round <= 15) return 'hard';
  return 'boss';
}

function timeLimitForRound(round: number): number {
  const tier = tierForRound(round);
  // Rounds 1-20 ramp 1..5 within their tier block same as the ladder/Daily
  // Challenge. Round 21+ stays pinned at boss's round-5 (steady-state) limit.
  const roundInTier = round <= 20 ? ((round - 1) % 5) + 1 : 5;
  return getTimeLimit(tier, roundInTier);
}

/**
 * Phase 3 — Endless Mode.
 *
 * Infinite survival run: equations generate on the fly (never a fixed set),
 * climbing easy -> medium -> hard -> boss over the first 20 rounds and then
 * holding steady at boss's normal difficulty. One mistake or timeout ends
 * the run immediately; points already earned still count toward the score.
 * No public leaderboard yet (see lib/endless.ts — same Phase 1.5 score-
 * integrity gate as Daily Challenge applies before this can go global).
 */
export class EndlessMode extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  private phase: Phase = 'landing';
  private round = 1;
  private results: RoundResult[] = [];

  private currentEquation = '';
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
    super('EndlessMode');
  }

  init(data: { audio?: AudioManager }) {
    if (data?.audio) this.audio = data.audio;
    this.phase = 'landing';
    this.round = 1;
    this.results = [];
    this.timerDone = false;
    this.answerInput = '';
    this.isQuitModalOpen = false;
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'endless-mode-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="endless-frame" style="background:${theme.color.bg};"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#endless-frame') as HTMLDivElement;

    this.showLanding();
  }

  shutdown() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private stageLabel(): string {
    return `Endless · ${TIER_LABELS[tierForRound(this.round)]} · Round ${this.round}`;
  }

  // ── Landing ──────────────────────────────────────────────────────────

  private async showLanding() {
    this.phase = 'landing';
    const c = theme.color;

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:28px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;gap:14px;">
        <span style="font-family:${theme.font.display};font-size:22px;font-weight:800;color:${c.textPrimary};">
          Endless Mode
        </span>
        <span style="font-size:11.5px;color:${c.textMuted};max-width:280px;line-height:1.6;">
          One mistake ends it. Climb Easy → Boss, then hold on as long as you can.
        </span>
        <div id="endless-best-card" style="width:100%;max-width:320px;${panel('padding:16px 18px;')}min-height:52px;
          display:flex;align-items:center;justify-content:center;">
          ${spinnerRow()}
        </div>
        <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;margin-top:6px;">
          ${primaryButton('Start', 'btn-endless-start', 'max-width:320px;')}
          ${secondaryButton('Back', 'btn-endless-back', 'max-width:320px;')}
        </div>
      </div>
    `;

    this.containerEl.querySelector('#btn-endless-start')?.addEventListener('click', () => {
      this.audio.playClick();
      this.showCountdown();
    });
    this.containerEl.querySelector('#btn-endless-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    });

    const identity = getIdentity();
    const bestCard = this.containerEl.querySelector('#endless-best-card') as HTMLElement;
    if (!identity || identity.isGuest) {
      // Shouldn't normally happen — Home.ts already gates guests out of
      // this scene — but render something sane rather than an infinite spinner.
      bestCard.innerHTML = `<span style="font-size:12px;color:${c.textMuted};">Log in to track your best run.</span>`;
      return;
    }

    let best: EndlessBest | null = null;
    try {
      best = await fetchMyBestEndless(identity.userId);
    } catch (err) {
      console.error('[TypeType] fetchMyBestEndless failed:', err);
    }

    // Phase is checked in case the player already tapped Start while this
    // was loading — don't clobber the countdown/playing UI that replaced it.
    if (this.phase !== 'landing') return;

    if (!best) {
      bestCard.innerHTML = `<span style="font-size:12.5px;color:${c.textMuted};">No runs yet — go for it!</span>`;
    } else {
      bestCard.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;width:100%;">
          <span style="font-size:11px;color:${c.textMuted};font-weight:600;">Your best run</span>
          <span style="font-family:${theme.font.display};font-size:26px;font-weight:800;color:${c.textPrimary};">
            ${best.totalScore} pts
          </span>
          <span style="font-size:11px;color:${c.accentBright};font-weight:600;">
            ${best.roundsCleared} rounds · reached ${TIER_LABELS[best.highestTierReached]}
          </span>
        </div>`;
    }
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
        <div id="countdown-value" style="font-family:${theme.font.display};font-size:72px;font-weight:800;
          color:${c.textPrimary};margin-top:16px;">GO</div>
      </div>
    `;

    // Endless is about pace and flow, not ceremony — no 3-2-1 tick between
    // rounds like the ladder/Daily Challenge. Just a quick GO flash so the
    // player still gets a beat to look up before typing starts.
    this.audio.playCountdownGo();
    this.timerEvent = this.time.delayedCall(250, () => {
      this.audio.startMusic(1);
      this.showPlaying();
    });
  }

  // ── Playing ──────────────────────────────────────────────────────────

  private showPlaying() {
    this.phase = 'playing';

    const tier = tierForRound(this.round);
    const eq = generateEquation(tier);
    this.currentEquation = eq.equation;
    this.currentTarget = stripSpaces(eq.targetAnswer);
    this.currentTimeLimit = timeLimitForRound(this.round);

    this.answerInput = '';
    this.timerDone = false;
    this.timeLeft = this.currentTimeLimit;
    this.startTime = performance.now();
    this.renderPlaying();
    this.startTimer();
    this.bindKeyboard();
  }

  private renderPlaying() {
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
    eqEl.style.fontSize = eqFontSize(this.currentEquation.length);
    eqEl.textContent = this.currentEquation;
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

  // ── Quit modal ────────────────────────────────────────────────────────
  // Ported from Game.ts / DailyChallenge.ts so all three modes share the
  // same free-quit-count / rewarded-ad gating.

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
          ${needsAd ? "You're out of free retries" : 'Quit this run?'}
        </div>
        <p style="font-size:12.5px;color:${c.textSecondary};line-height:1.7;margin:0;">
          ${needsAd
            ? 'Watch a short ad to unlock unlimited quits and retries, for good.'
            : `You'll lose this run's progress.<br><span style="color:${c.textMuted};">${freeLeft} free ${freeLeft === 1 ? 'retry' : 'retries'} left.</span>`}
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

  private quitToLobby() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.scene.start('Home');
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
      equation: this.currentEquation,
      targetAnswer: this.currentTarget,
      playerInput: finalInput,
      timeTaken,
      timeLimit: this.currentTimeLimit,
      status: timeout ? 'timeout' : isCorrect ? 'correct' : 'failed',
      points,
    };
    this.results.push(result);

    // One mistake ends the run immediately (points already earned still
    // count) — the entire point of Endless per the locked design.
    this.showRoundResult(result, /* forceComplete */ !isCorrect);
  }

  private showRoundResult(result: RoundResult, forceComplete: boolean) {
    this.phase = 'round_result';
    const ok = result.status === 'correct';
    const timeout = result.status === 'timeout';
    const c = theme.color;
    const statusColor = ok ? c.success : c.danger;
    const statusText = ok ? 'Correct!' : timeout ? "Time's up" : 'Not quite';

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
          ${ok ? infoRow('Points', `+${result.points}`, c.success) : ''}
        </div>

        ${forceComplete ? `<p style="font-size:12px;color:${c.textMuted};max-width:280px;margin-bottom:16px;">
          A miss ends the run here — your points so far still count.</p>` : ''}

        ${primaryButton(forceComplete ? 'See Results' : 'Next', 'btn-next', 'max-width:320px;')}
      </div>
    `;

    this.containerEl.querySelector('#btn-next')?.addEventListener('click', () => {
      this.audio.playClick();
      if (forceComplete) {
        this.goToComplete();
      } else {
        this.round++;
        this.showCountdown();
      }
    });
  }

  // ── Completion ───────────────────────────────────────────────────────

  private async goToComplete() {
    this.phase = 'complete';
    const totalScore = this.results.reduce((a, r) => a + r.points, 0);
    const roundsCleared = this.results.filter(r => r.status === 'correct').length;
    const highestTierReached = tierForRound(this.round);

    const identity = getIdentity();
    if (identity && !identity.isGuest) {
      submitEndlessRun(identity.userId, {
        results: this.results,
        totalScore,
        roundsCleared,
        highestTierReached,
      }).catch(err => console.error('[TypeType] submitEndlessRun error:', err));
    }

    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">

        <div style="font-family:${theme.font.display};font-size:15px;font-weight:700;color:${c.textMuted};margin-bottom:6px;">
          Run Over
        </div>
        <div style="font-family:${theme.font.display};font-size:40px;font-weight:800;color:${c.textPrimary};margin-bottom:22px;">
          ${totalScore} pts
        </div>

        <div style="width:100%;max-width:320px;${panel('padding:18px 18px;')}display:flex;flex-direction:column;gap:12px;margin-bottom:22px;font-size:13px;">
          ${infoRow('Rounds cleared', String(roundsCleared), c.textPrimary)}
          ${infoRow('Reached', TIER_LABELS[highestTierReached], c.accentBright)}
        </div>

        <p style="font-size:11.5px;color:${c.textMuted};max-width:280px;margin-bottom:20px;">
          Global leaderboard coming soon — for now it's just you against your own best.
        </p>

        <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;">
          ${primaryButton('Run It Back', 'btn-retry', 'max-width:320px;')}
          ${secondaryButton('Back to Menu', 'btn-back', 'max-width:320px;')}
        </div>
      </div>
    `;

    this.containerEl.querySelector('#btn-retry')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.restart({ audio: this.audio });
    });
    this.containerEl.querySelector('#btn-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    });
  }
}
