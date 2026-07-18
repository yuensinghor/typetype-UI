import Phaser from 'phaser';
import { AudioManager } from '../lib/audio';
import { theme, panel, logoTitle, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';

/**
 * Levels (Discrete Levels + Stars) — placeholder page (Phase 4 not yet built).
 *
 * Unreachable from the MainMenu hub today: canAccessMode() reports
 * 'levels' as not_yet_available, so the hub's nav card stays locked and
 * non-clickable. This scene exists now purely as routing scaffolding —
 * when Phase 4 ships, the real procedural-level content replaces
 * buildUI()'s placeholder and NOT_YET_BUILT in modeAccess.ts drops
 * 'levels', at which point the hub card becomes clickable and lands here.
 */
export class Levels extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  constructor() {
    super('Levels');
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
    shell.id = 'levels-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame dd-scroll" id="levels-frame"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#levels-frame') as HTMLDivElement;

    this.containerEl.style.cssText += `padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:16px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        ${logoTitle('TypeType', 24, false)}
      </div>

      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
        <div style="${panel('padding:28px 22px;')}max-width:320px;display:flex;flex-direction:column;gap:10px;align-items:center;">
          <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">
            Levels
          </span>
          <span style="font-size:11px;font-weight:700;color:${c.textMuted};">🔒 Coming soon</span>
          <p style="font-size:12.5px;color:${c.textMuted};margin-top:4px;">
            Bite-sized stages. Collect stars. Unlocks after playing Endless Mode a few times.
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
