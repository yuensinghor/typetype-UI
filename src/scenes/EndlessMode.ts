import Phaser from 'phaser';
import { AudioManager } from '../lib/audio';
import { theme, panel, logoTitle, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';

/**
 * Endless Mode — placeholder page (Phase 3 not yet built).
 *
 * Unreachable from the MainMenu hub today: canAccessMode() reports
 * 'endless' as not_yet_available, so the hub's nav card stays locked and
 * non-clickable. This scene exists now purely as routing scaffolding —
 * when Phase 3 ships, the real game logic replaces buildUI()'s placeholder
 * content and NOT_YET_BUILT in modeAccess.ts drops 'endless', at which
 * point the hub card becomes clickable and lands here for real.
 */
export class EndlessMode extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  constructor() {
    super('EndlessMode');
  }

  init(data: { audio?: AudioManager }) {
    if (data?.audio) this.audio = data.audio;
  }

  create() {
    injectGlobalStyles();
    this.buildUI();
  }

  shutdown() {
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private buildUI() {
    const c = theme.color;

    const shell = document.createElement('div');
    shell.id = 'endless-mode-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame dd-scroll" id="endless-frame"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#endless-frame') as HTMLDivElement;

    this.containerEl.style.cssText += `padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:16px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        ${logoTitle('TypeType', 24, false)}
      </div>

      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
        <div style="${panel('padding:28px 22px;')}max-width:320px;display:flex;flex-direction:column;gap:10px;align-items:center;">
          <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">
            Endless Mode
          </span>
          <span style="font-size:11px;font-weight:700;color:${c.textMuted};">🔒 Coming soon</span>
          <p style="font-size:12.5px;color:${c.textMuted};margin-top:4px;">
            One mistake ends it. How far can you get? Unlocks after 7 distinct days of Daily Challenge.
          </p>
        </div>
      </div>

      ${primaryButton('Back to Menu', 'btn-back', 'margin-top:4px;')}
    `;

    this.containerEl.querySelector('#btn-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('MainMenu');
    });
  }
}
