import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { AudioManager } from '../lib/audio';
import { buildInviteLink } from '../lib/identity';
import { theme, panel, label, logoTitle, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { TIER_ORDER, type LadderEntry, type SquadEntry, type Tier, type RankOvertake } from '../shared/types';

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

/**
 * Challenge Categories — the existing 4-tier ladder (Easy -> Boss) plus the
 * Friends/Squad leaderboard, kept together (not split out) per the locked
 * nav-restructuring scope. This is the same content that used to live
 * inline in MainMenu.ts before it became a hub; markup/logic unchanged,
 * only relocated + given a "Back to Menu" exit.
 */
export class ChallengeCategories extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio = new AudioManager();

  constructor() {
    super('ChallengeCategories');
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
    const highestTier: Tier = phaserGame.registry.get('highestUnlockedTier') ?? 'easy';
    const badges: Partial<Record<Tier, boolean>> = phaserGame.registry.get('tierBadges') ?? {};

    const shell = document.createElement('div');
    shell.id = 'challenge-categories-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame dd-scroll" id="cc-frame"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#cc-frame') as HTMLDivElement;

    this.containerEl.style.cssText += `padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:16px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        ${logoTitle('TypeType', 24, false)}
      </div>

      <div>
        ${label('Choose a level', c.textSecondary)}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;">
          ${TIER_ORDER.map(t => levelCard(t, highestTier, !!badges[t])).join('')}
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

      ${primaryButton('Back to Menu', 'btn-back', 'margin-top:4px;')}
    `;

    this.bindEvents();
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

    this.containerEl.querySelector('#btn-back')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('MainMenu');
    });
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
