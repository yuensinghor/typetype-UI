import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { AudioManager } from '../lib/audio';
import { buildInviteLink } from '../lib/identity';
import { theme, panel, label, logoTitle } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { renderInstallButton } from '../lib/installUI';
import { TIER_ORDER, type LadderEntry, type SquadEntry, type Tier } from '../shared/types';

const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', boss: 'Boss' };
const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3, boss: 4 };

// Difficulty escalates cool -> warm through the palette: mint (calm) up to
// coral (urgent) for Boss, so the tier grid reads as a difficulty ramp at a
// glance, not just four identically-styled cards.
const TIER_COLORS: Record<Tier, string> = {
  easy: theme.palette.mint,
  medium: theme.palette.yellow,
  hard: theme.palette.orange,
  boss: theme.palette.coral,
};

// Same difficulty-color ramp, but for small TEXT usage (the "Level X"
// label). Pale yellow fails contrast as text on a light card, so Medium
// gets the readable warningText amber here instead — TIER_COLORS above is
// still used as-is for the card's border/glow, where contrast isn't a
// factor since it's decorative, not text.
const TIER_LABEL_TEXT_COLORS: Record<Tier, string> = {
  easy: theme.palette.mint,
  medium: theme.color.warningText,
  hard: theme.palette.orange,
  boss: theme.palette.coral,
};

type LbTab = 'global' | 'friends';

export class MainMenu extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();
  private activeTab: LbTab = 'global';

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

      <div style="display:flex;flex-direction:column;flex:1;min-height:220px;">
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <button id="tab-global" style="${tabStyle(this.activeTab === 'global')}">Leaderboard</button>
          <button id="tab-friends" style="${tabStyle(this.activeTab === 'friends')}">Friends</button>
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

    // Self-checks whether install is actually offerable right now (not
    // already installed, platform supports either the native prompt or
    // iOS's manual path) — no-ops and adds nothing to the DOM otherwise.
    renderInstallButton(this.containerEl, {
      id: 'btn-install-app',
      label: '📲 Install App',
      variant: 'secondary',
      extra: 'margin-top:-4px;',
    });

    this.bindEvents();
    this.refreshLeaderboard();
  }

  private bindEvents() {
    this.containerEl.querySelector('#tab-global')?.addEventListener('click', () => {
      if (this.activeTab === 'global') return;
      this.audio.playClick();
      this.activeTab = 'global';
      this.refreshTabs();
      this.refreshLeaderboard();
    });

    this.containerEl.querySelector('#tab-friends')?.addEventListener('click', () => {
      if (this.activeTab === 'friends') return;
      this.audio.playClick();
      this.activeTab = 'friends';
      this.refreshTabs();
      this.refreshLeaderboard();
    });

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

  private refreshTabs() {
    const g = this.containerEl.querySelector('#tab-global') as HTMLButtonElement;
    const f = this.containerEl.querySelector('#tab-friends') as HTMLButtonElement;
    if (g) g.style.cssText = tabStyle(this.activeTab === 'global');
    if (f) f.style.cssText = tabStyle(this.activeTab === 'friends');
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
    try {
      entries = this.activeTab === 'global'
        ? await platform.fetchLadder()
        : identity
        ? await platform.fetchSquad(identity.userId, identity.invitedBy)
        : [];
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
          ${this.activeTab === 'friends'
            ? 'No friends yet — invite someone to see them here.'
            : 'No scores yet. Be the first to clear a level!'}
        </div>`;
      return;
    }

    lbCard.style.justifyContent = 'flex-start';
    lbCard.innerHTML = `
      <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
        ${entries.map((e, i) => lbRow(e, i, username)).join('')}
      </div>`;
  }
}

// ─── Style helpers ────────────────────────────────────────────────────────

function tabStyle(active: boolean) {
  return `flex:1;padding:10px 0;border-radius:10px;border:1px solid ${active ? theme.color.accent : theme.color.border};
          font-size:12.5px;font-weight:700;cursor:pointer;font-family:${theme.font.body};
          background:${active ? theme.color.accentDim : theme.color.bgCard};
          color:${active ? theme.color.accent : theme.color.textMuted};transition:all 0.15s;`;
}

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

function spinner(msg = 'Loading…') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;">
      <div style="width:20px;height:20px;border:2px solid ${theme.color.border};border-top:2px solid ${theme.color.accent};
                  border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span style="font-size:11px;color:${theme.color.textMuted};">${msg}</span>
    </div>`;
}

function lbRow(e: LadderEntry, i: number, myUsername: string) {
  const c = theme.color;
  const isMe = e.username.toLowerCase() === myUsername.toLowerCase();
  const rankColor = i === 0 ? theme.palette.yellow : i === 1 ? c.textSecondary : i === 2 ? theme.palette.orange : c.textMuted;

  let badgeHtml = '';
  if (e.clearedHiddenBonusTiers?.length) {
    badgeHtml = `<span style="font-size:10px;font-weight:700;color:${theme.palette.orange};margin-right:5px;">🏅×${e.clearedHiddenBonusTiers.length}</span>`;
  }
  if (e.hasLimitBreakAward) {
    badgeHtml += `<span style="font-size:10px;font-weight:700;color:${c.success};margin-right:5px;">⚡</span>`;
  }

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 10px;border-radius:10px;font-size:12px;
      background:${isMe ? theme.color.accentDim : 'transparent'};">
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
    </div>`;
}
