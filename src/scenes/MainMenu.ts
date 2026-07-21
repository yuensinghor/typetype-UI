import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { AudioManager } from '../lib/audio';
import { theme, panel, label, logoTitle } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { renderInstallButton } from '../lib/installUI';
import { canAccessMode, type GameMode, type AuthState, type AccessResult, type PlayerUnlocks } from '../lib/modeAccess';
import { fetchPlayerUnlocks } from '../lib/playerUnlocks';

// Hub nav — one card per top-level system. 'challenge_categories' is always
// open (existing ladder + friends funnel); the rest reuse the same
// canAccessMode gating that used to live inline in this scene.
const NAV_MODES: { mode: GameMode; title: string; teaser: string; scene: string }[] = [
  { mode: 'challenge_categories', title: 'Challenge Categories', teaser: 'Climb the ladder. Compare with friends.', scene: 'ChallengeCategories' },
  { mode: 'daily_challenge', title: 'Daily Challenge', teaser: 'A new puzzle every day. Global leaderboard.', scene: 'DailyChallenge' },
  { mode: 'endless', title: 'Endless Mode', teaser: 'One mistake ends it. How far can you get?', scene: 'EndlessMode' },
  { mode: 'levels', title: 'Levels', teaser: 'Bite-sized stages. Collect stars.', scene: 'Levels' },
];

const DEFAULT_UNLOCKS: PlayerUnlocks = {
  clearedAllTiers: false,
  distinctDaysPlayed: 0,
};

export class MainMenu extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  constructor() {
    super('MainMenu');
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
    const identity = getIdentity();
    const username = identity?.username ?? 'Loading…';
    const hasLimitBreakAward: boolean = phaserGame.registry.get('hasLimitBreakAward') ?? false;

    const shell = document.createElement('div');
    shell.id = 'lobby-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame dd-scroll" id="lobby-frame"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#lobby-frame') as HTMLDivElement;

    this.containerEl.style.cssText += `padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:16px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        ${logoTitle('TypeType', 24, false)}
      </div>

      <div style="${panel('padding:14px 16px;')}display:flex;align-items:center;justify-content:space-between;">
        <span style="font-weight:700;font-size:15px;color:${hasLimitBreakAward ? c.success : c.textPrimary};">
          ${username}${hasLimitBreakAward ? ' ⚡' : ''}
        </span>
        <span style="color:${c.textMuted};font-size:11px;">${identity?.isGuest ? 'Guest' : 'Signed in'}</span>
      </div>

      <div>
        ${label('Play', c.textSecondary)}
        <div id="nav-card" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          ${spinner()}
        </div>
      </div>
    `;

    renderInstallButton(this.containerEl, {
      id: 'btn-install-app',
      label: '📲 Install App',
      variant: 'secondary',
      extra: 'margin-top:-4px;',
    });

    this.refreshNav();
  }

  // Fetches this player's unlock state (if logged in) and renders each
  // system as a nav card: open ('challenge_categories', and anything else
  // canAccessMode allows) or a locked teaser with the same reasons/progress
  // UI the old inline "More ways to play" section used.
  private async refreshNav() {
    const navCard = this.containerEl?.querySelector('#nav-card') as HTMLElement;
    if (!navCard) return;

    const identity = getIdentity();
    const isLoggedIn = !!identity && !identity.isGuest;

    let unlocks: PlayerUnlocks = DEFAULT_UNLOCKS;
    if (isLoggedIn && identity) {
      try {
        unlocks = await fetchPlayerUnlocks(identity.userId);
      } catch (err) {
        console.error('[DigitDash] fetchPlayerUnlocks failed', err);
      }
    }

    const auth: AuthState = { isLoggedIn, unlocks };

    navCard.innerHTML = NAV_MODES.map(({ mode, title, teaser, scene }) => {
      const access = canAccessMode(mode, auth);
      return navSlot(mode, title, teaser, access, scene);
    }).join('');

    navCard.querySelectorAll<HTMLElement>('[data-playable="1"]').forEach(el => {
      el.addEventListener('click', () => {
        this.audio.playClick();
        const scene = el.dataset.scene as string;
        this.scene.start(scene, { audio: this.audio });
      });
    });
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────

// Renders one hub nav card. Same visual language as the old inline
// "More ways to play" modeSlot — open systems are clickable and route to
// their scene; locked ones show the same reason/progress messaging as
// before, just relocated here from MainMenu's old single-scroll layout.
function navSlot(mode: GameMode, title: string, teaser: string, access: AccessResult, scene: string) {
  const c = theme.color;

  if (access.allowed) {
    return `
      <div class="dd-mode-slot" data-mode="${mode}" data-scene="${scene}" data-playable="1" style="
        ${panel('padding:14px 16px;cursor:pointer;')}display:flex;align-items:center;justify-content:space-between;gap:10px;
        border-color:${c.accent};">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
          <span style="font-family:${theme.font.display};font-size:15px;font-weight:700;color:${c.textPrimary};">${title}</span>
          <span style="font-size:11px;color:${c.textMuted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${teaser}</span>
        </div>
        <span style="font-size:10px;font-weight:700;color:${c.accent};">▶ Play</span>
      </div>`;
  }

  let statusHtml = '';
  if (access.reason === 'guest_not_allowed') {
    statusHtml = `<span style="font-size:10px;font-weight:700;color:${c.textMuted};">🔒 Log in to unlock</span>`;
  } else if (access.reason === 'not_yet_available') {
    statusHtml = `<span style="font-size:10px;font-weight:700;color:${c.textMuted};">🔒 Coming soon</span>`;
  } else if (access.progress) {
    const { current, required } = access.progress;
    statusHtml = `<span style="font-size:10px;font-weight:700;color:${c.textMuted};">🔒 ${current}/${required}</span>`;
  } else {
    statusHtml = `<span style="font-size:10px;font-weight:700;color:${c.textMuted};">🔒 Locked</span>`;
  }

  return `
    <div style="${panel('padding:14px 16px;opacity:0.6;')}display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
        <span style="font-family:${theme.font.display};font-size:15px;font-weight:700;color:${c.textPrimary};">${title}</span>
        <span style="font-size:11px;color:${c.textMuted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${teaser}</span>
      </div>
      ${statusHtml}
    </div>`;
}

function spinner(msg = 'Loading…') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;">
      <div style="width:20px;height:20px;border:2px solid ${theme.color.border};border-top:2px solid ${theme.color.accent};
                  border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span style="font-size:11px;color:${theme.color.textMuted};">${msg}</span>
    </div>`;
}