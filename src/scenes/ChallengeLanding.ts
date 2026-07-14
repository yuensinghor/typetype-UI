import Phaser from 'phaser';
import { platform } from '../lib/standaloneAdapter';
import { consumePendingInviteCode, markChallengeSeen } from '../lib/identity';
import { theme, primaryButton, secondaryButton, panel } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import type { ChallengerSnapshot } from '../shared/types';

const GIVEUP_TAUNTS = [
  '...really?',
  'are you sure??',
  'ok, coward mode',
];

/**
 * Challenge Flow — Screen 1 (Challenge Landing).
 *
* Shown once, only to first-time anonymous visitors arriving via a valid
 * ?ref=CODE invite link. Preloader routes here before its normal boot.
 * Give up routes straight back to Preloader's normal login choice (door
 * stays open, no punishment). Start routes into ChallengeTestRound (Screen 2).
 *
 * markChallengeSeen() fires unconditionally at the top of create() — this is
 * what prevents a redirect loop back from Preloader on an invalid/unresolvable
 * invite code, and what stops this screen from reappearing on reload.
 */
export class ChallengeLanding extends Phaser.Scene {
  private containerEl!: HTMLDivElement;

  constructor() {
    super('ChallengeLanding');
  }

  create() {
    injectGlobalStyles();
    markChallengeSeen();

    const el = document.createElement('div');
    el.id = 'challenge-ui';
    el.className = 'dd-shell';
    el.innerHTML = `<div class="dd-frame" id="challenge-frame" style="align-items:center;justify-content:center;
      display:flex;flex-direction:column;gap:16px;padding:24px;font-family:${theme.font.body};"></div>`;
    document.getElementById('game-container')?.appendChild(el);
    this.containerEl = el.querySelector('#challenge-frame') as HTMLDivElement;

    this.showSpinner('Loading challenge…');
    this.resolveChallenge();
  }

  shutdown() {
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private showSpinner(msg: string) {
    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="width:28px;height:28px;border:3px solid ${c.border};
        border-top:3px solid ${c.accent};border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span style="font-family:${theme.font.body};font-size:13px;color:${c.textSecondary};">${msg}</span>
    `;
  }

  private async resolveChallenge() {
    const inviteCode = consumePendingInviteCode();
    if (!inviteCode) {
      this.goToPreloader();
      return;
    }

    try {
      const snapshot = await platform.fetchChallengerByInviteCode(inviteCode);
      if (!snapshot) {
        // Invalid/unresolvable code — silently fall through, never crash.
        this.goToPreloader();
        return;
      }
      this.renderLanding(snapshot);
    } catch (err) {
      console.error('[DigitDash] Challenge lookup failed:', err);
      this.goToPreloader();
    }
  }

  private renderLanding(snapshot: ChallengerSnapshot) {
    const c = theme.color;
    const hasRecord = snapshot.bestEasyScore !== null;

    const headline = hasRecord
      ? `⚡ ${snapshot.username} scored ${snapshot.bestEasyScore} on Easy.`
      : `${snapshot.username} invited you to play Digit Dash!`;
    const subline = hasRecord
      ? `Let's go show ${snapshot.username} your real speed!`
      : `Think you've got fast fingers?`;

    this.containerEl.innerHTML = `
      <div style="width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;">
        <h1 style="font-family:${theme.font.display};font-size:24px;font-weight:800;color:${c.textPrimary};margin:0;">
          TypeType
        </h1>

        <div style="width:100%;${panel('padding:22px 18px;')}display:flex;flex-direction:column;gap:10px;">
          <div style="font-family:${theme.font.display};font-size:17px;font-weight:800;color:${c.accentBright};line-height:1.4;">
            ${headline}
          </div>
          <div style="font-family:${theme.font.body};font-size:13px;color:${c.textSecondary};line-height:1.6;">
            ${subline}
          </div>
        </div>

        ${primaryButton('Start', 'btn-challenge-start')}
        ${secondaryButton('Give up', 'btn-challenge-giveup')}
      </div>
    `;

    const giveUpBtn = this.containerEl.querySelector('#btn-challenge-giveup') as HTMLButtonElement;
    const startBtn = this.containerEl.querySelector('#btn-challenge-start') as HTMLButtonElement;
    const originalGiveUpText = giveUpBtn.textContent ?? 'Give up';

    // Playful taunt on hover — not a real block, just friction before they commit.
    let tauntTimer: ReturnType<typeof setTimeout> | undefined;
    giveUpBtn.addEventListener('pointerenter', () => {
      clearTimeout(tauntTimer);
      giveUpBtn.textContent = GIVEUP_TAUNTS[Math.floor(Math.random() * GIVEUP_TAUNTS.length)];
    });
    giveUpBtn.addEventListener('pointerleave', () => {
      tauntTimer = setTimeout(() => {
        if (giveUpBtn) giveUpBtn.textContent = originalGiveUpText;
      }, 150);
    });

    giveUpBtn.addEventListener('click', () => this.goToPreloader());

startBtn.addEventListener('click', () => {
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('ChallengeTestRound', {
        challengerUsername: snapshot.username,
        challengerScore: snapshot.bestEasyScore,
      });
    });
  }

  private goToPreloader() {
    this.containerEl?.closest('.dd-shell')?.remove();
    this.scene.start('Preloader');
  }
}