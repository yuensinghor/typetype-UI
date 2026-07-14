import Phaser from 'phaser';
import { generateEquation } from '../lib/equation';
import { KEYPAD } from '../lib/keypad';
import { AudioManager } from '../lib/audio';
import { theme, panel, label, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';

// Fixed time limit for every round of the test challenge — deliberately NOT
// the real Easy ramp (2.0s -> 1.4s). This is a first-touch acquisition funnel:
// keep it easy and welcoming so anonymous visitors have a good first
// experience and are more likely to convert into signing up, rather than
// getting the tightest, most punishing version of the tier immediately.
const TEST_TIME_LIMIT = 2.0;
const TOTAL_ROUNDS = 5;

type Phase = 'countdown' | 'playing' | 'round_result';

interface SceneData {
  challengerUsername: string;
  challengerScore: number | null;
}

interface TestRoundResult {
  equation: string;
  targetAnswer: string;
  playerInput: string;
  timeTaken: number;
  status: 'correct' | 'failed' | 'timeout';
  points: number;
}

function eqFontSize(len: number): string {
  if (len <= 7) return '30px';
  if (len <= 13) return '22px';
  return '16px';
}

function formatTimer(sec: number): string {
  return `${Math.max(0, sec).toFixed(2)}s`;
}

function infoRow(labelText: string, value: string, color: string) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="color:${theme.color.textMuted};white-space:nowrap;font-size:11px;">${labelText}</span>
      <span style="color:${color};font-weight:700;text-align:right;word-break:break-all;font-family:${theme.font.mono};">${value}</span>
    </div>`;
}

/**
 * Challenge Flow — Screen 2 (anonymous test run).
 *
 * Deliberately standalone from LadderEngine — no ladder state is touched,
 * nothing here counts toward or unlocks real tier progression, and no round
 * is ever saved. Mirrors the main game's 5-round structure (round-result
 * screen + countdown between each round) so the challenge feels like a real
 * taste of the game, but every round runs at a fixed, easy 2.0s so a
 * first-time anonymous visitor has the best shot at a good first impression.
 * No nickname/login prompt happens here — genuinely anonymous throughout.
 */
export class ChallengeTestRound extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();
  private sceneData!: SceneData;

  private phase: Phase = 'countdown';
  private stageInTier = 1;
  private results: TestRoundResult[] = [];

  private currentEq = { equation: '', targetAnswer: '' };
  private answerInput = '';
  private timeLeft = TEST_TIME_LIMIT;
  private startTime = 0;
  private lastTime = 0;
  private timerDone = false;
  private timerEvent?: Phaser.Time.TimerEvent;
  private onKeyDown?: (e: KeyboardEvent) => void;

  constructor() {
    super('ChallengeTestRound');
  }

  init(data: SceneData) {
    this.sceneData = data;
    this.phase = 'countdown';
    this.stageInTier = 1;
    this.results = [];
    this.timerDone = false;
    this.answerInput = '';
    this.currentEq = generateEquation('easy');
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'challenge-test-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="challenge-test-frame" style="background:${theme.color.bg};"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#challenge-test-frame') as HTMLDivElement;
    this.showCountdown();
  }

  shutdown() {
    this.timerEvent?.destroy();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.audio.stopMusic();
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private stageLabel(): string {
    return `Quick Challenge · Round ${this.stageInTier}/${TOTAL_ROUNDS}`;
  }

  // ── Countdown ─────────────────────────────────────────────────────────

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
            this.audio.startMusic(this.stageInTier);
            this.showPlaying();
          });
        }
      },
    });
  }

  // ── Playing ───────────────────────────────────────────────────────────

  private showPlaying() {
    this.phase = 'playing';
    this.answerInput = '';
    this.timerDone = false;
    this.timeLeft = TEST_TIME_LIMIT;
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
        if (this.timerDone || this.phase !== 'playing') {
          this.lastTime = performance.now();
          return;
        }
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;

        this.timeLeft = Math.max(0, this.timeLeft - delta);
        const pct = this.timeLeft / TEST_TIME_LIMIT;

        const timerDisplay = this.containerEl.querySelector('#timer-display') as HTMLElement;
        const timeBar = this.containerEl.querySelector('#time-bar') as HTMLElement;
        if (timerDisplay) timerDisplay.textContent = formatTimer(this.timeLeft);
        if (timeBar) {
          timeBar.style.width = `${Math.max(0, pct * 100)}%`;
          timeBar.style.background = pct <= 0.25 ? theme.color.danger : pct <= 0.5 ? theme.color.warning : theme.color.accent;
        }

        if (this.timeLeft <= 0) this.finishRound(this.answerInput, true);
      },
    });
  }

  private bindKeyboard() {
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    this.onKeyDown = (e: KeyboardEvent) => {
      if (this.timerDone || this.phase !== 'playing') return;
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

  // ── Input handling ────────────────────────────────────────────────────

  private addChar(ch: string) {
    if (this.timerDone || this.phase !== 'playing') return;
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
    if (this.timerDone || this.phase !== 'playing') return;
    this.audio.playClick();
    this.answerInput = this.answerInput.slice(0, -1);
    this.updateInputDisplay();
  }

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

    const timeTaken = Math.min(TEST_TIME_LIMIT, (performance.now() - this.startTime) / 1000);
    const isCorrect = !timeout && finalInput === this.currentEq.targetAnswer;

    // Same scoring formula as a real round (Game.ts) so the number feels
    // consistent — a wrong/timeout round simply contributes 0 points, same
    // as a partial real run. Nothing here is ever submitted or saved.
    let points = 0;
    if (isCorrect) {
      const speedBonus = Math.max(0, (TEST_TIME_LIMIT - timeTaken) * 8);
      points = Math.round(100 + speedBonus);
      this.audio.playCorrect();
    } else {
      this.audio.playFail();
    }

    const result: TestRoundResult = {
      equation: this.currentEq.equation,
      targetAnswer: this.currentEq.targetAnswer,
      playerInput: finalInput,
      timeTaken,
      status: timeout ? 'timeout' : isCorrect ? 'correct' : 'failed',
      points,
    };
    this.results.push(result);

    this.showRoundResult(result);
  }

  private showRoundResult(result: TestRoundResult) {
    this.phase = 'round_result';
    const ok = result.status === 'correct';
    const timeout = result.status === 'timeout';
    const c = theme.color;
    const statusColor = ok ? c.success : c.danger;
    const statusText = ok ? 'Correct!' : timeout ? "Time's up" : 'Not quite';
    const isLastRound = this.stageInTier >= TOTAL_ROUNDS;
    const btnLabel = isLastRound ? 'See My Score' : `Round ${this.stageInTier + 1}`;

    this.containerEl.innerHTML = `
      <div style="flex:1;width:100%;padding:24px 20px;display:flex;flex-direction:column;
        align-items:center;justify-content:center;text-align:center;box-sizing:border-box;">

        <div style="font-family:${theme.font.display};font-size:26px;font-weight:800;color:${statusColor};margin-bottom:22px;">
          ${statusText}
        </div>

        <div style="width:100%;max-width:320px;${panel('padding:18px 18px;')}display:flex;flex-direction:column;gap:12px;margin-bottom:22px;font-size:13px;">
          ${infoRow('Equation', result.equation, c.textPrimary)}
          ${infoRow('Your answer', timeout ? '(no answer)' : (result.playerInput || '(empty)'), ok ? c.success : c.danger)}
          ${infoRow('Time', `${result.timeTaken.toFixed(3)}s / ${TEST_TIME_LIMIT.toFixed(2)}s`, c.accentBright)}
          ${ok ? infoRow('Points', `+${result.points}`, c.success) : ''}
        </div>

        ${primaryButton(btnLabel, 'btn-next', 'max-width:320px;')}
      </div>
    `;

    this.containerEl.querySelector('#btn-next')?.addEventListener('click', () => {
      this.audio.playClick();
      this.onIntermissionComplete();
    });
  }

  private onIntermissionComplete() {
    if (this.stageInTier < TOTAL_ROUNDS) {
      this.stageInTier++;
      this.currentEq = generateEquation('easy');
      this.showCountdown();
      return;
    }

    this.goToResult();
  }

  private goToResult() {
    const totalScore = this.results.reduce((a, r) => a + r.points, 0);
    const allCorrect = this.results.every(r => r.status === 'correct');

    this.containerEl?.closest('.dd-shell')?.remove();
    this.scene.start('ChallengeResult', {
      testScore: totalScore,
      correct: allCorrect,
      challengerUsername: this.sceneData.challengerUsername,
      challengerScore: this.sceneData.challengerScore,
    });
  }
}
