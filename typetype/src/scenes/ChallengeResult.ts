import Phaser from 'phaser';
import { theme, panel, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';

interface SceneData {
  testScore: number;
  correct: boolean;
  challengerUsername: string;
  challengerScore: number | null;
}

const LOSE_LINES = [
  'Not official yet — log in to unleash your real power!',
  "Doesn't count... yet. Log in and come back stronger.",
  "This one's off the record. Log in for a real rematch.",
];

const CTA_LABEL = 'Lock In My Score';

/**
 * Challenge Flow — Screen 3 (result / comparison).
 *
 * Shows the test-round score against the challenger's Easy score, then
 * hands off to Preloader (Screen 4) carrying just the display copy — never
 * the raw score. The test score is discarded here; nothing about it
 * survives past this scene.
 */
export class ChallengeResult extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private sceneData!: SceneData;

  constructor() {
    super('ChallengeResult');
  }

  init(data: SceneData) {
    this.sceneData = data;
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'challenge-result-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="challenge-result-frame" style="align-items:center;justify-content:center;
      display:flex;flex-direction:column;gap:16px;padding:24px;font-family:${theme.font.body};"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#challenge-result-frame') as HTMLDivElement;
    this.render();
  }

  shutdown() {
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private render() {
    const c = theme.color;
    const { testScore, challengerUsername, challengerScore } = this.sceneData;
    const hasChallengerRecord = challengerScore !== null;
    const won = hasChallengerRecord && testScore > (challengerScore as number);

    let resultLine: string;
    let ctaSubline: string;

    if (!hasChallengerRecord) {
      resultLine = `You scored ${testScore} — you're now the one to beat!`;
      ctaSubline = `Log in so ${challengerUsername} has to catch up to you.`;
    } else if (won) {
      resultLine = `${testScore} vs ${challengerUsername}'s ${challengerScore}. You win!`;
      ctaSubline = `Log in so ${challengerUsername} has to see this ranked above them, forever.`;
    } else {
      resultLine = `${testScore} vs ${challengerUsername}'s ${challengerScore}.`;
      ctaSubline = LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)];
    }

    const accentColor = !hasChallengerRecord || won ? c.success : c.textSecondary;

    this.containerEl.innerHTML = `
      <div style="width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;">
        <h1 style="font-family:${theme.font.display};font-size:22px;font-weight:800;color:${c.textPrimary};margin:0;">
          TypeType
        </h1>

        <div style="width:100%;${panel('padding:22px 18px;')}display:flex;flex-direction:column;gap:14px;">
          <div style="font-family:${theme.font.display};font-size:15px;font-weight:800;color:${accentColor};line-height:1.4;">
            ${resultLine}
          </div>
          <div style="font-family:${theme.font.body};font-size:13px;color:${c.textSecondary};line-height:1.6;">
            ${ctaSubline}
          </div>
        </div>

        ${primaryButton(CTA_LABEL, 'btn-challenge-cta')}
      </div>
    `;

    this.containerEl.querySelector('#btn-challenge-cta')?.addEventListener('click', () => {
      this.containerEl?.closest('.dd-shell')?.remove();
      // Carries only display copy forward — never the raw score. Preloader
      // re-skins its existing login-choice screen with this instead of the
      // generic "How to play" panel. No new auth logic is introduced here.
      this.scene.start('Preloader', {
        challengeContext: {
          headline: resultLine,
          subline: ctaSubline,
        },
      });
    });
  }
}
