import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { audioManager, type AudioManager } from '../lib/audio';
import { buildInviteLink } from '../lib/identity';
import { theme, panel, label, logoTitle } from '../lib/theme';
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

export class ChallengeCategories extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio: AudioManager = audioManager;

  constructor() {
    super('ChallengeCategories');
  }

  init(data: { audio?: AudioManager }) {
    if (data?.audio) this.audio = data.audio;
  }

  create() {
    this.events.once('shutdown', this.shutdown, this);
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

    this.containerEl.style.cssText += `
      padding: 0 0 80px 0; 
      font-family: ${theme.font.body};
      color: ${c.textPrimary};
      background: linear-gradient(180deg, #FF9A9E 0%, #FECFEF 100%); /* Sunset Playground Sky */
      position: relative;
      overflow-y: auto;
      overflow-x: hidden;
    `;

    this.containerEl.innerHTML = `
      <style>
        .bunting {
          position: absolute; top: 0; left: 0; right: 0; height: 20px; 
          display: flex; justify-content: space-around; pointer-events: none; z-index: 0;
        }
        .flag {
          width: 24px; height: 24px; 
          clip-path: polygon(0 0, 100% 0, 50% 100%);
          opacity: 0.8;
        }
      </style>

      <div class="bunting">
        <div class="flag" style="background:${c.accent};"></div>
        <div class="flag" style="background:${c.success};"></div>
        <div class="flag" style="background:${c.warning};"></div>
        <div class="flag" style="background:${c.danger};"></div>
        <div class="flag" style="background:${c.accent};"></div>
        <div class="flag" style="background:${c.success};"></div>
        <div class="flag" style="background:${c.warning};"></div>
        <div class="flag" style="background:${c.danger};"></div>
      </div>

      <div style="position: relative; z-index: 1; display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; padding: 30px 16px 20px;">
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          ${logoTitle('TypeType', 24, false)}
          <button id="btn-back" style="
            background: transparent; border: 1px solid ${c.borderStrong}; 
            color: ${c.textSecondary}; border-radius: 20px; padding: 8px 16px; 
            font-size: 12px; font-weight: 700; cursor: pointer;">
            Menu
          </button>
        </div>

        <!-- Rival Card -->
        <div id="rival-card" style="
          ${panel('padding: 14px;')}
          margin-bottom: 20px; border: 1px solid ${c.accent}33; 
          background: ${c.bgCard}; border-radius: 16px;
          display: flex; align-items: center; justify-content: center; min-height: 60px;">
          ${spinner()}
        </div>

        <!-- Tower Section -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; margin-bottom: 24px;">
          <!-- Reverse order so Boss is at Top, Easy at Bottom -->
          ${[...TIER_ORDER].reverse().map(t => levelCard(t, highestTier, !!badges[t])).join('')}
        </div>

        <!-- Leaderboard Section -->
        <div>
          <div style="margin-bottom: 8px;">
            ${label('Friends Ranking', c.textSecondary)}
          </div>
          <div id="lb-card" style="
            ${panel('padding: 8px;')} 
            border-radius: 16px; min-height: 100px; overflow-y: auto;
            display: flex; flex-direction: column; gap: 4px;">
            ${spinner()}
          </div>
        </div>

      </div>

      <!-- Floating Invite Button -->
      <button id="btn-invite" style="
        position: absolute; bottom: 20px; right: 16px; z-index: 10;
        width: 56px; height: 56px; border-radius: 50%; 
        background: ${c.accent}; border: none; box-shadow: 0 4px 12px ${c.accent}66;
        color: white; font-size: 24px; font-weight: 800; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        -webkit-tap-highlight-color: transparent;">
        +
      </button>
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
        btn.innerHTML = `<span style="font-size: 10px; font-weight: 700;">Copied!</span>`;
        setTimeout(() => { if (btn) btn.innerHTML = '+'; }, 2000);
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
    const rivalCard = this.containerEl?.querySelector('#rival-card') as HTMLElement;
    const c = theme.color;

    if (lbCard) lbCard.innerHTML = spinner();
    if (rivalCard) rivalCard.innerHTML = spinner();

    const identity = getIdentity();
    const myUsername = identity?.username ?? '';

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
      if (lbCard) lbCard.innerHTML = `<div style="color:${c.textMuted};font-size:12px;text-align:center;padding:16px;">Couldn't load the leaderboard. Try again shortly.</div>`;
      if (rivalCard) rivalCard.innerHTML = `<div style="color:${c.textMuted};font-size:12px;">Couldn't load rivals.</div>`;
      return;
    }

    phaserGame.registry.set('ladder', entries);
    
    if (!lbCard || !rivalCard) return;

    // --- Update Rival Card ---
    if (entries.length === 0) {
      rivalCard.innerHTML = `
        <div style="text-align: center; color: ${c.textSecondary}; font-size: 13px;">
          Invite friends to start competing!
        </div>`;
    } else {
      const myIndex = entries.findIndex(e => e.username.toLowerCase() === myUsername.toLowerCase());
      
      if (myIndex === -1) {
        rivalCard.innerHTML = `
          <div style="text-align: center; color: ${c.textSecondary}; font-size: 13px;">
            Play a round to get on the board!
          </div>`;
      } else if (myIndex === 0 && entries.length > 1) {
        // I am 1st place
        const second = entries[1] as LadderEntry;
        const diff = ((second.bestTotalTimeMs - (entries[0] as LadderEntry).bestTotalTimeMs) / 1000).toFixed(3);
        rivalCard.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${c.warning}; display: flex; align-items: center; justify-content: center; font-weight: 800; color: ${c.bg};">1</div>
            <div style="flex: 1;">
              <div style="font-size: 12px; color: ${c.textSecondary};">You are #1!</div>
              <div style="font-size: 14px; font-weight: 700; color: ${c.textPrimary};">${second.username} is ${diff}s behind you. Don't let up!</div>
            </div>
          </div>`;
      } else if (myIndex > 0) {
        // I have a rival ahead of me
        const rival = entries[myIndex - 1] as LadderEntry;
        const me = entries[myIndex] as LadderEntry;
        const diff = ((rival.bestTotalTimeMs - me.bestTotalTimeMs) / 1000).toFixed(3);
        rivalCard.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; width: 100%;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${c.accentDim}; display: flex; align-items: center; justify-content: center; font-weight: 800; color: ${c.accent};">⚡</div>
            <div style="flex: 1;">
              <div style="font-size: 12px; color: ${c.textSecondary};">Catch ${rival.username}! (${(rival.bestTotalTimeMs / 1000).toFixed(3)}s)</div>
              <div style="font-size: 14px; font-weight: 700; color: ${c.accent};">Beat them by ${diff}s to take rank #${myIndex}.</div>
            </div>
          </div>`;
      } else {
        rivalCard.innerHTML = `<div style="color:${c.textMuted};font-size:12px;">You are ranked!</div>`;
      }
    }

    // --- Update Leaderboard Card ---
    if (entries.length === 0) {
      lbCard.innerHTML = `
        <div style="color:${c.textMuted};font-size:12px;text-align:center;padding:20px;">
          No friends yet — tap the + button to invite someone!
        </div>`;
      return;
    }

    lbCard.innerHTML = `
      <div style="width:100%;display:flex;flex-direction:column;gap:4px;">
        ${entries.map((e, i) => lbRow(e, i, myUsername, overtookMeUserIds)).join('')}
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
      background: ${c.bgCard};
      border: 2px solid ${isCurrent ? tierColor : c.border};
      border-bottom: 4px solid ${isCurrent ? tierColor : c.borderStrong};
      border-radius: 12px;
      padding: 14px 18px;
      ${unlocked ? 'cursor: pointer;' : 'opacity: 0.6;'}
      display: flex; 
      align-items: center; 
      justify-content: space-between;
      box-shadow: ${isCurrent ? `0 4px 12px ${tierColor}33` : 'none'};
      transition: transform 0.1s;">
      
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-size: 10px; color: ${unlocked ? tierLabelColor : c.textMuted}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">
          Level ${TIER_NUMBER[t]}
        </span>
        <span style="font-family: ${theme.font.display}; font-size: 18px; font-weight: 800; color: ${c.textPrimary};">
          ${TIER_LABELS[t]}
        </span>
      </div>
      
      <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: ${unlocked ? c.success : c.textMuted};">
        ${!unlocked ? '🔒 Locked' : hasBadge ? '🏅 Bonus cleared' : isCurrent ? '▶ Current' : '✓ Cleared'}
      </div>
    </div>`;
}

function spinner(msg = 'Loading...') {
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
    <div style="display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:10px;font-size:13px;
      background:${isMe ? theme.color.accentDim : justPassedMe ? theme.palette.coral + '1a' : 'transparent'};">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
          <span style="font-weight:800;color:${rankColor};width:24px;flex-shrink:0;font-size:14px;">#${i + 1}</span>
          <div style="display:flex;align-items:center;gap:3px;min-width:0;overflow:hidden;">
            ${badgeHtml}
            <span style="font-weight:700;color:${e.hasLimitBreakAward ? c.success : c.textPrimary};
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.username}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font-size:10px;color:${c.textMuted};font-weight:700;text-transform:uppercase;">${TIER_LABELS[e.highestTier]}</span>
          <span style="color:${c.textPrimary};font-weight:800;font-family:${theme.font.mono};font-size:14px;">${(e.bestTotalTimeMs / 1000).toFixed(3)}s</span>
        </div>
      </div>
      ${justPassedMe ? `<span style="font-size:10px;font-weight:700;color:${theme.palette.coral};padding-left:34px;">🔥 ${e.username} passed you!</span>` : ''}
    </div>`;
}