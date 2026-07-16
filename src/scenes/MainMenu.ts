import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { AudioManager } from '../lib/audio';
import { buildInviteLink } from '../lib/identity';
import { theme, panel, label, logoTitle } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { renderInstallButton } from '../lib/installUI';
import { TIER_ORDER, type LadderEntry, type SquadEntry, type Tier, type RankOvertake } from '../shared/types';
import { canAccessMode, type GameMode, type AuthState, type AccessResult, type PlayerUnlocks } from '../lib/modeAccess';
import { fetchPlayerUnlocks } from '../lib/playerUnlocks';

const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', boss: 'Boss' };
const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3, boss: 4 };

const TIER_COLORS: Record<Tier, string> = {
  easy: theme.palette.mint,
  medium: theme.palette.yellow,
  hard: theme.palette.orange,
  boss: theme.palette.coral,
};

const TIER_LABEL_TEXT_COLORS: Record<Tier, string> = {
  easy: theme.palette.mint,
  medium: theme.color.warningText,
  hard: theme.palette.orange,
  boss: theme.palette.coral,
};

// Progressive-reveal mode slots. Order matches the intended unlock chain
// (Daily Challenge -> Endless -> Levels). Battle Pass is deliberately
// excluded — it's always-on once logged in, not a teased/locked mode.
const REVEAL_MODES: { mode: GameMode; title: string; teaser: string }[] = [
  { mode: 'daily_challenge', title: 'Daily Challenge', teaser: 'A new puzzle every day. Global leaderboard.' },
  { mode: 'endless', title: 'Endless Mode', teaser: 'One mistake ends it. How far can you get?' },
  { mode: 'levels', title: 'Levels', teaser: 'Bite-sized stages. Collect stars.' },
];

const DEFAULT_UNLOCKS: PlayerUnlocks = {
  clearedEasyTier: false,
  distinctDaysPlayedDaily: 0,
  endlessRunsCompleted: 0,
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
    const highestTier: Tier = phaserGame.registry.get('highestUnlockedTier') ?? 'easy';
    const badges: Partial<Record<Tier, boolean>> = phaserGame.registry.get('tierBadges') ?? {};
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
        ${label('Choose a level', c.textSecondary)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
          ${TIER_ORDER.map(t => levelCard(t, highestTier, !!badges[t])).join('')}
        </div>
      </div>

      <div>
        ${label('More ways to play', c.textSecondary)}
        <div id="modes-card" style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          ${spinner()}
        </div>
      </div>

      <div style="display:flex;flex-direction:column;flex:1;min-height:220px;">
        <div style="margin-bottom:8px;">
          ${label('Friends', c.textSecondary)}
        </div>
        <div id="lb-card" style="${panel('padding:10px;')}flex:1;min-height:160px;overflow-y:auto;
          display:flex;flex-direction:column;justify-content:center;align-items:center;">
          ${spinner()}
        </div>
      </div>

      <button id="btn-invite" style="
        width:100%;padding:12px 0;background:transparent;border:1px dashed ${c.borderStrong};border-radius:12px;
        color:${c.textSecondary};font-family:${theme.font.body};font-weight:600;font-size:12.5px;cursor:pointer;">
        Invite friends
      </button>
    `;

    renderInstallButton(this.containerEl, {
      id: 'btn-install-app',
      label: '📲 Install App',
      variant: 'secondary',
      extra: 'margin-top:-4px;',
    });

    this.bindEvents();
    this.refreshModes();
    this.refreshLeaderboard();
  }

  private bindEvents() {
    this.containerEl.querySelectorAll('.dd-level-card').forEach(cardEl => {
      cardEl.addEventListener('click', () => {
        const el = cardEl as HTMLElement;
        if (el.dataset.locked === '1') return;
        this.audio.playClick();
        this.scene.start('Game', { startTier: el.dataset.tier as Tier, audio: this.audio });
      });
    });

    this.containerEl.querySelector('#btn-invite')?.addEventListener('click', async () => {
      this.audio.playClick();
      const identity = getIdentity();
      if (!identity?.inviteCode) return;
      const link = buildInviteLink(identity.inviteCode);
      try {
        await navigator.clipboard.writeText(link);
        const btn = this.containerEl.querySelector('#btn-invite') as HTMLButtonElement;
        const original = btn.textContent;
        btn.textContent = 'Link copied!';
        btn.style.color = theme.color.success;
        setTimeout(() => { if (btn) { btn.textContent = original; btn.style.color = theme.color.textSecondary; } }, 2000);
      } catch {
        prompt('Copy your invite link:', link);
      }
    });
  }

  // Progressive-reveal shell: fetches this player's unlock state (if logged
  // in) and renders each future mode as either a locked teaser or a
  // "log in to unlock" prompt for guests. None of these modes exist yet
  // (Phase 1/3/4), so canAccessMode currently reports them all as
  // not-yet-available — this scaffolding just means later phases only
  // need to ship the mode itself, not new home-screen logic.
  private async refreshModes() {
    const modesCard = this.containerEl?.querySelector('#modes-card') as HTMLElement;
    if (!modesCard) return;

    const identity = getIdentity();
    const isLoggedIn = !!identity && !identity.isGuest;

    let unlocks: PlayerUnlocks = DEFAULT_UNLOCKS;
    if (isLoggedIn && identity) {
      try {
        unlocks = await fetchPlayerUnlocks(identity.userId);
      } catch (err) {
        console.error('[TypeType] fetchPlayerUnlocks failed, defaulting to locked', err);
      }
    }

    const auth: AuthState = { isLoggedIn, unlocks };

    modesCard.innerHTML = REVEAL_MODES.map(({ mode, title, teaser }) => {
      const access = canAccessMode(mode, auth);
      return modeSlot(title, teaser, access);
    }).join('');
  }

  private async refreshLeaderboard() {
    const lbCard = this.containerEl?.querySelector('#lb-card') as HTMLElement;
    if (lbCard) {
      lbCard.style.justifyContent = 'center';
      lbCard.innerHTML = spinner();
    }

    const identity = getIdentity();
    const username = identity?.username ?? '';

    let entries: LadderEntry[] | SquadEntry[] = [];
    let overtookMeUserIds = new Set<string>();
    try {
      entries = identity ? await platform.fetchSquad(identity.userId, identity.invitedBy) : [];

      if (identity) {
        const overtakes: RankOvertake[] = await platform.fetchUnseenOvertakes(identity.userId);
        if (overtakes.length > 0) {
          overtookMeUserIds = new Set(overtakes.map(o => o.overtakenByUserId));
          platform.markOvertakesSeen(identity.userId).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[DigitDash] leaderboard fetch failed', err);
      if (lbCard) {
        lbCard.innerHTML = `<div style="color:${theme.color.textMuted};font-size:12px;text-align:center;padding:16px;">
          Couldn't load the leaderboard. Try again shortly.</div>`;
      }
      return;
    }

    phaserGame.registry.set('ladder', entries);
    if (!lbCard) return;

    if (entries.length === 0) {
      lbCard.style.justifyContent = 'center';
      lbCard.innerHTML = `
        <div style="color:${theme.color.textMuted};font-size:12px;text-align:center;padding:20px;">
          No friends yet — invite someone to see them here.
        </div>`;
      return;
    }

    lbCard.style.justifyContent = 'flex-start';
    lbCard.innerHTML = `
      <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
        ${entries.map((e, i) => lbRow(e, i, username, overtookMeUserIds)).join('')}
      </div>`;
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────

function levelCard(t: Tier, highest: Tier, hasBadge: boolean) {
  const unlocked = TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(highest);
  const isCurrent = t === highest;
  const c = theme.color;
  const tierColor = TIER_COLORS[t];
  const tierLabelColor = TIER_LABEL_TEXT_COLORS[t];
  return `
    <div class="dd-level-card" data-tier="${t}" data-locked="${unlocked ? '0' : '1'}" style="
      ${panel(`padding:14px 12px;${unlocked ? 'cursor:pointer;' : 'opacity:0.5;'}`)}
      display:flex;flex-direction:column;gap:4px;
      ${isCurrent ? `border-color:${tierColor};border-width:2px;box-shadow:0 2px 12px ${tierColor}33;` : ''}">
      <span style="font-size:10px;color:${unlocked ? tierLabelColor : c.textMuted};font-weight:700;">Level ${TIER_NUMBER[t]}</span>
      <span style="font-family:${theme.font.display};font-size:17px;font-weight:700;color:${c.textPrimary};">
        ${TIER_LABELS[t]}
      </span>
      <span style="font-size:10px;color:${unlocked ? c.success : c.textMuted};font-weight:600;">
        ${!unlocked ? '🔒 Locked' : hasBadge ? '🏅 Bonus cleared' : isCurrent ? 'Current' : 'Cleared'}
      </span>
    </div>`;
}

// Renders one locked/teased slot in the "More ways to play" progressive-reveal
// section. Deliberately non-interactive for now — none of these modes exist
// to navigate to yet. Later phases just need to (a) remove the mode from
// modeAccess.ts's NOT_YET_BUILT list and (b) add a click handler here that
// starts the real scene once canAccessMode reports allowed:true.
function modeSlot(title: string, teaser: string, access: AccessResult) {
  const c = theme.color;

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
    <div style="${panel('padding:12px 14px;opacity:0.6;')}display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
        <span style="font-family:${theme.font.display};font-size:14px;font-weight:700;color:${c.textPrimary};">${title}</span>
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

function lbRow(e: LadderEntry, i: number, myUsername: string, overtookMeUserIds?: Set<string>) {
  const c = theme.color;
  const isMe = e.username.toLowerCase() === myUsername.toLowerCase();
  const justPassedMe = !!overtookMeUserIds?.has(e.userId);
  const rankColor = i === 0 ? theme.palette.yellow : i === 1 ? c.textSecondary : i === 2 ? theme.palette.orange : c.textMuted;

  let badgeHtml = '';
  if (e.clearedHiddenBonusTiers?.length) {
    badgeHtml = `<span style="font-size:10px;font-weight:700;color:${theme.palette.orange};margin-right:5px;">🏅×${e.clearedHiddenBonusTiers.length}</span>`;
  }
  if (e.hasLimitBreakAward) {
    badgeHtml += `<span style="font-size:10px;font-weight:700;color:${c.success};margin-right:5px;">⚡</span>`;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:2px;padding:9px 10px;border-radius:10px;font-size:12px;
      background:${isMe ? theme.color.accentDim : justPassedMe ? theme.palette.coral + '1a' : 'transparent'};">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:9px;min-width:0;flex:1;">
          <span style="font-weight:700;color:${rankColor};width:20px;flex-shrink:0;">#${i + 1}</span>
          <div style="display:flex;align-items:center;gap:3px;min-width:0;overflow:hidden;">
            ${badgeHtml}
            <span style="font-weight:700;color:${e.hasLimitBreakAward ? c.success : c.textPrimary};
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.username}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font-size:10px;color:${c.textMuted};font-weight:700;">${TIER_LABELS[e.highestTier]}</span>
          <span style="color:${c.textPrimary};font-weight:700;font-family:${theme.font.mono};">${(e.bestTotalTimeMs / 1000).toFixed(3)}s</span>
        </div>
      </div>
      ${justPassedMe ? `<span style="font-size:10px;font-weight:700;color:${theme.palette.coral};padding-left:29px;">🔥 ${e.username} passed you!</span>` : ''}
    </div>`;
}
