import Phaser from 'phaser';
import { getTimeLimit, getEndlessTimeLimit } from '../lib/equation';
import { KEYPAD } from '../lib/keypad';
import { AudioManager } from '../lib/audio';
import { theme, panel, label, primaryButton, secondaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { fetchDailyChallenge, submitDailyChallengeRun, fetchMyBestToday, type DailyEquation, type DailyChallengeBest } from '../lib/dailyChallenge';
import type { Tier, RoundResult } from '../shared/types';

// Stage -> tier mapping. MUST match supabase/functions/get-daily-challenge/index.ts
// exactly, since the equation SET is generated server-side but the TIME LIMIT
// for each stage is computed client-side from this same mapping.
const STAGE_TIER: Record<number, Tier> = {
  1: 'easy', 2: 'easy', 3: 'medium', 4: 'hard', 5: 'boss',
  6: 'boss', 7: 'boss', 8: 'boss', 9: 'boss', 10: 'boss',
};

const TOTAL_BASIC = 5;
const TOTAL_STAGES = 10;

type Phase = 'loading' | 'landing' | 'countdown' | 'playing' | 'round_result' | 'benchmark_check' | 'complete' | 'error';

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

function formatChallengeDate(isoDate: string): string {
  // isoDate is YYYY-MM-DD (UTC) from the server. Parsed as UTC explicitly
  // so it can't shift a day depending on the player's local timezone.
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
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

/**
 * Phase 1 — Daily Challenge.
 *
 * 5 basic stages ramping easy -> medium -> hard -> boss format (same digit/
 * decimal shapes as the ladder, via STAGE_TIER + getTimeLimit). Clearing all
 * 5 with an average time at/under the day's speed_benchmark_ms unlocks 5
 * hidden bonus stages (boss format, tightening 5% per stage same as the
 * ladder's hidden stages) — UNLIKE the ladder, bonus stages here add real
 * points to the score since Daily Challenge is a competitive leaderboard
 * mode, not an onboarding funnel. One mistake during bonus stages ends the
 * run immediately (points already earned still count).
 *
 * Every player who opens this on the same UTC day gets the identical 10
 * equations (server-locked, see get-daily-challenge Edge Function).
 */
export class DailyChallenge extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  private phase: Phase = 'loading';
  private challengeDate = '';
  private equationSet: DailyEquation[] = [];
  private speedBenchmarkMs = 0;

  private stage = 1;
  private results: RoundResult[] = [];
  private reachedBonus = false;

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
    super('DailyChallenge');
  }

  init() {
    this.phase = 'loading';
    this.stage = 1;
    this.results = [];
    this.reachedBonus = false;
    this.timerDone = false;
    this.answerInput = '';
    this.isQuitModalOpen = false;
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'daily-challenge-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="daily-challenge-frame" style="background:${theme.color.bg};"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#daily-challenge-frame') as HTMLDivElement;

    this.renderLoading();
    this.loadTodaysChallenge();
  }

  shutdown() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private stageLabel(): string {
    if (this.stage <= TOTAL_BASIC) return `Daily Challenge · ${this.stage}/${TOTAL_BASIC}`;
    return `Daily Challenge · Bonus ${this.stage - TOTAL_BASIC}/5`;
  }

  // ── Loading ──────────────────────────────────────────────────────────

  private renderLoading() {
    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:32px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;gap:12px;box-sizing:border-box;">
        <div style="width:24px;height:24px;border:3px solid ${c.border};border-top:3px solid ${c.accent};
          border-radius:50%;animation:spin 0.9s linear infinite;"></div>
        <span style="font-size:12px;color:${c.textMuted};">Loading today's challenge…</span>
      </div>`;
  }

  private async loadTodaysChallenge() {
    try {
      const daily = await fetchDailyChallenge();
      this.challengeDate = daily.challengeDate;
      this.equationSet = daily.equationSet;
      this.speedBenchmarkMs = daily.speedBenchmarkMs;
      this.showLanding();
    } catch (err) {
      console.error('[TypeType] loadTodaysChallenge failed:', err);
      this.renderError();
    }
  }

  private renderError() {
    this.phase = 'error';
    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:32px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;gap:14px;box-sizing:border-box;">
        <span style="font-size:14px;color:${c.textPrimary};font-weight:700;">Couldn't load today's challenge</span>
        <span style="font-size:12px;color:${c.textMuted};max-width:280px;">
          Check your connection and try again.
        </span>
        ${primaryButton('Back to Menu', 'btn-back-error', 'max-width:280px;')}
      </div>`;
    this.containerEl.querySelector('#btn-back-error')?.addEventListener('click', () => {
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    });
  }

  // ── Landing ──────────────────────────────────────────────────────────

  private async showLanding() {
    this.phase = 'landing';
    const c = theme.color;

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:28px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;gap:14px;">
        <span style="font-family:${theme.font.display};font-size:22px;font-weight:800;color:${c.textPrimary};">
          Daily Challenge
        </span>
        <span style="font-size:11.5px;color:${c.textMuted};">${formatChallengeDate(this.challengeDate)}</span>
        <div id="daily-best-card" style="width:100%;max-width:320px;${panel('padding:16px 18px;')}min-height:52px;
          display:flex;align-items:center;justify-content:center;">
          ${spinnerRow()}
        </div>
        <div style="width:100%;max-width:320px;display:flex;flex-direction:column;gap:10px;margin-top:6px;">
          ${primaryButton('Start', 'btn-daily-start', 'max-width:320px;')}
          ${secondaryButton('Back', 'btn-daily-back', 'max-width:320px;')}
        </div>
      </div>
    `;

    this.containerEl.querySelector('#btn-daily-start')?.addEventListener('click', () => {
      this.audio.playClick();
      this.showCountdown();
    });
    this.containerEl.querySelector('#btn-daily-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    });

    const identity = getIdentity();
    const bestCard = this.containerEl.querySelector('#daily-best-card') as HTMLElement;
    if (!identity || identity.isGuest) {
      // Shouldn't normally happen — Home.ts already gates guests out of
      // this scene — but render something sane rather than an infinite spinner.
      bestCard.innerHTML = `<span style="font-size:12px;color:${c.textMuted};">Log in to track your daily scores.</span>`;
      return;
    }

    let best: DailyChallengeBest | null = null;
    try {
      best = await fetchMyBestToday(identity.userId, this.challengeDate);
    } catch (err) {
      console.error('[TypeType] fetchMyBestToday failed:', err);
    }

    // Phase is checked in case the player already tapped Start while this
    // was loading — don't clobber the countdown/playing UI that replaced it.
    if (this.phase !== 'landing') return;

    if (!best) {
      bestCard.innerHTML = `<span style="font-size:12.5px;color:${c.textMuted};">You haven't played today yet — go for it!</span>`;
    } else {
      bestCard.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:4px;width:100%;">
          <span style="font-size:11px;color:${c.textMuted};font-weight:600;">Your best today</span>
          <span style="font-family:${theme.font.display};font-size:26px;font-weight:800;color:${c.textPrimary};">
            ${best.totalScore} pts
          </span>
          <span style="font-size:11px;color:${best.reachedBonus ? c.accentBright : c.textMuted};font-weight:600;">
            ${best.reachedBonus ? `${best.bonusStagesCleared}/5 bonus stages cleared` : 'Bonus stages not unlocked'}
          </span>
        </div>`;
      const startBtn = this.containerEl.querySelector('#btn-daily-start');
      if (startBtn) startBtn.textContent = 'Play Again';
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
          color:${c.textPrimary};margin-top:16px;">3</div>
        <p style="font-family:${theme.font.body};font-size:12.5px;color:${c.textMuted};max-width:280px;line-height:1.7;margin-top:14px;">
          Type the equation back exactly, as fast as you can.
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
          valueEl.textContent = 'GO';
          this.time.delayedCall(400, () => {
            this.audio.startMusic(1);
            this.showPlaying();
          });
        }
      },
    });
  }

  // ── Playing ──────────────────────────────────────────────────────────

  private showPlaying() {
    this.phase = 'playing';

    const eq = this.equationSet[this.stage - 1];
    const tier = STAGE_TIER[this.stage];
    this.currentEquation = eq.display;
    this.currentTarget = stripSpaces(eq.display);
    this.currentTimeLimit =
      this.stage <= TOTAL_BASIC
        ? getTimeLimit(tier, 1)
        : getEndlessTimeLimit('boss', this.stage);

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

        if (this.timeLeft <= 0) this.finishStage(this.answerInput, true);
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
  // Ported from Game.ts's quit modal so both the ladder and Daily Challenge
  // share the same free-quit-count / rewarded-ad gating.

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
            : `You'll lose progress on today's challenge.<br><span style="color:${c.textMuted};">${freeLeft} free ${freeLeft === 1 ? 'retry' : 'retries'} left.</span>`}
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
      this.time.delayedCall(80, () => this.finishStage(this.answerInput, false));
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

  // ── Stage resolution ─────────────────────────────────────────────────

  private finishStage(finalInput: string, timeout: boolean) {
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
      roundIndex: this.stage,
      equation: this.currentEquation,
      targetAnswer: this.currentTarget,
      playerInput: finalInput,
      timeTaken,
      timeLimit: this.currentTimeLimit,
      status: timeout ? 'timeout' : isCorrect ? 'correct' : 'failed',
      points,
    };
    this.results.push(result);

    // Bonus stages: one mistake ends the run immediately (points already
    // earned still count toward the total — this mode rewards them for
    // reaching bonus stages at all, unlike the ladder's cosmetic-only badge).
    if (this.stage > TOTAL_BASIC && !isCorrect) {
      this.showStageResult(result, /* forceComplete */ true);
      return;
    }

    this.showStageResult(result, false);
  }

  private showStageResult(result: RoundResult, forceComplete: boolean) {
    this.phase = 'round_result';
    const ok = result.status === 'correct';
    const timeout = result.status === 'timeout';
    const c = theme.color;
    const statusColor = ok ? c.success : c.danger;
    const statusText = ok ? 'Correct!' : timeout ? "Time's up" : 'Not quite';

    const isLastBasic = this.stage === TOTAL_BASIC;
    const isLastStage = this.stage === TOTAL_STAGES;

    let btnLabel = 'Next';
    if (forceComplete || isLastStage) btnLabel = 'See Results';
    else if (isLastBasic) btnLabel = 'Continue';

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
          A miss during bonus stages ends the run here — your points so far still count.</p>` : ''}

        ${primaryButton(btnLabel, 'btn-next', 'max-width:320px;')}
      </div>
    `;

    this.containerEl.querySelector('#btn-next')?.addEventListener('click', () => {
      this.audio.playClick();
      if (forceComplete) {
        this.goToComplete();
      } else {
        this.onIntermissionComplete();
      }
    });
  }

  private onIntermissionComplete() {
    if (this.stage === TOTAL_BASIC) {
      this.checkBenchmark();
      return;
    }
    if (this.stage < TOTAL_STAGES) {
      this.stage++;
      this.showCountdown();
      return;
    }
    this.goToComplete();
  }

  // ── Benchmark gate (after basic stage 5) ────────────────────────────

  private checkBenchmark() {
    this.phase = 'benchmark_check';
    const basicResults = this.results.slice(0, TOTAL_BASIC);

    // Bug fix: a fast WRONG answer has a low timeTaken too, so averaging
    // timeTaken alone let 0-point runs sneak under the benchmark and unlock
    // bonus stages. Bonus stages must be earned by clearing all 5 basic
    // stages correctly, on top of beating the speed benchmark.
    const allCorrect = basicResults.every(r => r.status === 'correct');
    const totalMs = basicResults.reduce((a, r) => a + r.timeTaken * 1000, 0);
    const avgMs = totalMs / basicResults.length;
    this.reachedBonus = allCorrect && avgMs <= this.speedBenchmarkMs;

    if (this.reachedBonus) {
      this.showBonusUnlocked(avgMs);
    } else {
      this.goToComplete();
    }
  }

  private showBonusUnlocked(avgMs: number) {
    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">
        <div style="font-family:${theme.font.display};font-size:24px;font-weight:800;color:${theme.palette.orange};margin-bottom:10px;">
          🔥 Bonus Stages Unlocked!
        </div>
        <p style="font-size:12.5px;color:${c.textMuted};max-width:280px;line-height:1.6;margin-bottom:22px;">
          Your average (${(avgMs / 1000).toFixed(2)}s) beat today's benchmark of
          ${(this.speedBenchmarkMs / 1000).toFixed(2)}s. Five bonus stages, boss-level difficulty,
          tightening each round. One mistake ends it — but every point you earn counts toward
          today's leaderboard.
        </p>
        ${primaryButton('Start Bonus Stages', 'btn-bonus-start', 'max-width:320px;')}
      </div>`;

    this.containerEl.querySelector('#btn-bonus-start')?.addEventListener('click', () => {
      this.audio.playClick();
      this.stage = TOTAL_BASIC + 1;
      this.showCountdown();
    });
  }

  // ── Completion ───────────────────────────────────────────────────────

  private async goToComplete() {
    this.phase = 'complete';
    const totalScore = this.results.reduce((a, r) => a + r.points, 0);
    const bonusResults = this.results.slice(TOTAL_BASIC);
    const bonusStagesCleared = bonusResults.filter(r => r.status === 'correct').length;

    const identity = getIdentity();
    if (identity && !identity.isGuest) {
      submitDailyChallengeRun(identity.userId, {
        challengeDate: this.challengeDate,
        results: this.results,
        totalScore,
        reachedBonus: this.reachedBonus,
        bonusStagesCleared,
      }).catch(err => console.error('[TypeType] submitDailyChallengeRun error:', err));
    }

    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">

        <div style="font-family:${theme.font.display};font-size:15px;font-weight:700;color:${c.textMuted};margin-bottom:6px;">
          Daily Challenge Complete
        </div>
        <div style="font-family:${theme.font.display};font-size:40px;font-weight:800;color:${c.textPrimary};margin-bottom:22px;">
          ${totalScore} pts
        </div>

        <div style="width:100%;max-width:320px;${panel('padding:18px 18px;')}display:flex;flex-direction:column;gap:12px;margin-bottom:22px;font-size:13px;">
          ${infoRow('Basic stages', `${this.results.slice(0, TOTAL_BASIC).filter(r => r.status === 'correct').length}/${TOTAL_BASIC} correct`, c.textPrimary)}
          ${infoRow('Bonus stages', this.reachedBonus ? `${bonusStagesCleared}/5 cleared` : 'Not unlocked', this.reachedBonus ? c.accentBright : c.textMuted)}
        </div>

        <p style="font-size:11.5px;color:${c.textMuted};max-width:280px;margin-bottom:20px;">
          Come back tomorrow for a new challenge. Global leaderboard coming soon.
        </p>

        ${primaryButton('Back to Menu', 'btn-back', 'max-width:320px;')}
      </div>
    `;

    this.containerEl.querySelector('#btn-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    });
  }
}
