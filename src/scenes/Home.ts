// Old achievementUI import removed - using Supabase RPC sync_user_badges now
import { fetchDailyLeaderboard, fetchWeeklyLeaderboard, fetchLastWeekChampions, type DailyLeaderboardEntry, type WeeklyLeaderboardEntry } from '../lib/dailyChallenge';
import { fetchDailyLeaderboard, type DailyLeaderboardEntry } from '../lib/dailyChallenge';
import { supabase } from '../lib/supabaseClient';
import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { audioManager, type AudioManager } from '../lib/audio';
import { soundToggleHTML, bindSoundToggle } from '../lib/soundToggle';
import { buildInviteLink, signOut, signInWithGoogle } from '../lib/identity';
import { theme, panel, label, logoTitle, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { canAccessMode, type AuthState, type AccessResult, DAILY_CHALLENGE_DAYS_REQUIRED, ENDLESS_LEVELS_DAYS_REQUIRED } from '../lib/modeAccess';
import { canOfferInstall, promptInstall, isIOS } from '../lib/installPrompt';
import { showIOSInstallInstructions } from '../lib/installUI';
import { fetchPlayerUnlocks } from '../lib/playerUnlocks';
import { TIER_ORDER, type LadderEntry, type SquadEntry, type Tier, type RankOvertake } from '../shared/types';

const ICON_DOWNLOAD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
  <polyline points="7 10 12 15 17 10"></polyline>
  <line x1="12" y1="15" x2="12" y2="3"></line>
</svg>`;

const ICON_LOGOUT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
  <polyline points="16 17 21 12 16 7"></polyline>
  <line x1="21" y1="12" x2="9" y2="12"></line>
</svg>`;

const ICON_TROPHY = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
  <path d="M4 22h16"></path>
  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
</svg>`;

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

const ICON_TAB_FRIENDS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
  <circle cx="9" cy="7" r="4"></circle>
  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
</svg>`;

const ICON_TAB_DAILY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="4" width="18" height="18" rx="2"></rect>
  <line x1="16" y1="2" x2="16" y2="6"></line>
  <line x1="8" y1="2" x2="8" y2="6"></line>
  <line x1="3" y1="10" x2="21" y2="10"></line>
</svg>`;

const ICON_TAB_ENDLESS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.096-8-12.191-8-5.096 0-5.096 8 0 8 5.095 0 7.096-8 12.191-8z"></path>
</svg>`;

const ICON_TAB_LEVELS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 20h4v-6H3v6z"></path>
  <path d="M10 20h4v-10h-4v10z"></path>
  <path d="M17 20h4v-16h-4v16z"></path>
</svg>`;

let stylesInjected = false;
function injectHomeStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'home-carousel-styles';
  style.textContent = `
    .home-panels {
      flex:1; position:relative; overflow:hidden;
    }
    .home-page {
      position:absolute; inset:0; overflow-y:auto; overflow-x:hidden;
      -webkit-overflow-scrolling:touch; display:none; flex-direction:column; gap:14px;
      padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));
    }
    .home-page.active { display:flex; }
    .home-page::-webkit-scrollbar { width:6px; }
    .home-page::-webkit-scrollbar-thumb { background:${theme.color.borderStrong}; border-radius:3px; }
    .home-tabbar {
      display:flex; flex-shrink:0; border-top:1px solid ${theme.color.border};
      background:${theme.color.bgCard}; padding-bottom:env(safe-area-inset-bottom,0px);
    }
    .home-tab {
      flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:3px; padding:8px 0 6px; background:none; border:none; cursor:pointer;
      color:${theme.color.textMuted}; font-family:${theme.font.body}; font-size:10px; font-weight:700;
    }
    .home-tab.active { color:${theme.palette.coral}; }
  `;
  document.head.appendChild(style);
}

export class Home extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio: AudioManager = audioManager;
  private auth: AuthState = { isLoggedIn: false, unlocks: { clearedAllTiers: false, distinctDaysPlayed: 0 } };
  private activePage = 0;
  private onInstallReady?: () => void;
  private onAppInstalled?: () => void;
  private dailyCountdownInterval?: number;
  private activeProfileTab: 'achievements' | 'friends' = 'achievements'; // <-- ADD THIS LINE

  constructor() {
    super('Home');
  }

  init(data: { audio?: AudioManager, returnToTab?: number }) {
    if (data?.audio) this.audio = data.audio;
    // Remember which tab we were on when returning from a game
    if (data?.returnToTab !== undefined) {
      this.activePage = data.returnToTab;
    }
  }

  create() {
    this.events.once('shutdown', this.shutdown, this);
    injectGlobalStyles();
    injectHomeStyles();
    this.buildShell();
    this.refreshChallengeLeaderboard();
    this.refreshAuthAndUnlocks();
  }

  shutdown() {
    if (this.dailyCountdownInterval) clearInterval(this.dailyCountdownInterval); // <--- ADD THIS LINE
    if (this.onInstallReady) window.removeEventListener('dd-install-ready', this.onInstallReady);
    if (this.onAppInstalled) window.removeEventListener('appinstalled', this.onAppInstalled);
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private buildShell() {
    const c = theme.color;

    const shell = document.createElement('div');
    shell.id = 'home-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame" id="home-frame" style="display:flex;flex-direction:column;"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#home-frame') as HTMLDivElement;

    this.containerEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;
        padding:14px 16px 6px;flex-shrink:0;font-family:${theme.font.body};color:${c.textPrimary};">
        ${logoTitle('TypeType', 22, false)}
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;" id="header-icons">
          ${soundToggleHTML('btn-sound-toggle', true)}
          ${canOfferInstall() ? this.installButtonHTML() : ''}
          
          <!-- ADDED GOOGLE LOGIN BUTTON FOR GUESTS -->
          <button id="btn-google-login" aria-label="Sign in" style="display:none; background:${c.bgCard};border:1px solid ${c.border};border-radius:12px;width:38px;height:38px;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:${c.textPrimary};">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
          </button>

          <button id="btn-logout" aria-label="Log out" style="
            display:none;background:${c.bgCard};border:1px solid ${c.border};border-radius:12px;width:38px;height:38px;
            align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:${c.textPrimary};">
            ${ICON_LOGOUT}
          </button>
          <button id="btn-achievements" aria-label="Achievements" style="
            background:${c.bgCard};border:1px solid ${c.border};border-radius:12px;width:38px;height:38px;
            display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:${c.textPrimary};">
            ${ICON_TROPHY}
          </button>
        </div>
      </div>

      <div class="home-panels" id="home-panels">
        <div class="home-page ${this.activePage === 0 ? 'active' : ''}" id="page-challenge_categories"></div>
        <div class="home-page ${this.activePage === 1 ? 'active' : ''}" id="page-daily_challenge"></div>
        <div class="home-page ${this.activePage === 2 ? 'active' : ''}" id="page-endless"></div>
        <div class="home-page ${this.activePage === 3 ? 'active' : ''}" id="page-levels"></div>
      </div>

      <div class="home-tabbar" id="home-tabbar">
        <button class="home-tab ${this.activePage === 0 ? 'active' : ''}" data-tab="0" aria-label="Friends">${ICON_TAB_FRIENDS}<span>Friends</span></button>
        <button class="home-tab ${this.activePage === 1 ? 'active' : ''}" data-tab="1" aria-label="Daily">${ICON_TAB_DAILY}<span>Daily</span></button>
        <button class="home-tab ${this.activePage === 2 ? 'active' : ''}" data-tab="2" aria-label="Endless">${ICON_TAB_ENDLESS}<span>Endless</span></button>
        <button class="home-tab ${this.activePage === 3 ? 'active' : ''}" data-tab="3" aria-label="Profile">${ICON_TAB_LEVELS}<span>Profile</span></button>
      </div>
    `;

    bindSoundToggle(this.containerEl);
    audioManager.startMenuMusic();

    this.renderChallengeCategoriesPage();
    this.renderDailyChallengePage({ allowed: false, reason: 'loading' }, this.auth);
    this.renderEndlessPage({ allowed: false, reason: 'loading' }, this.auth);
    this.renderProfilePage();

    this.bindShellEvents();
  }

  private installButtonHTML(): string {
    const c = theme.color;
    return `<button id="btn-install" aria-label="Install app" style="
      background:${c.bgCard};border:1px solid ${c.border};border-radius:12px;width:38px;height:38px;
      display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:${c.textPrimary};">
      ${ICON_DOWNLOAD}
    </button>`;
  }

  private bindInstallButton() {
    this.containerEl.querySelector('#btn-install')?.addEventListener('click', async () => {
      this.audio.playClick();
      const btn = this.containerEl.querySelector('#btn-install');
      if (isIOS()) {
        showIOSInstallInstructions(() => btn?.remove());
        return;
      }
      const accepted = await promptInstall();
      if (accepted) btn?.remove();
    });
  }

  private bindShellEvents() {
    this.bindInstallButton();

    this.onInstallReady = () => {
      if (this.containerEl?.querySelector('#btn-install')) return;
      if (!canOfferInstall()) return;
      const group = this.containerEl?.querySelector('#header-icons');
      const logoutBtn = group?.querySelector('#btn-logout');
      if (!group || !logoutBtn) return;
      logoutBtn.insertAdjacentHTML('beforebegin', this.installButtonHTML());
      this.bindInstallButton();
    };
    window.addEventListener('dd-install-ready', this.onInstallReady);

    this.onAppInstalled = () => {
      this.containerEl?.querySelector('#btn-install')?.remove();
    };
    window.addEventListener('appinstalled', this.onAppInstalled);

    // ADDED LOGIN BUTTON LISTENER
    this.containerEl.querySelector('#btn-google-login')?.addEventListener('click', async () => {
      this.audio.playClick();
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error('[TypeType] Google sign-in failed', err);
      }
    });

    this.containerEl.querySelector('#btn-achievements')?.addEventListener('click', () => {
      this.audio.playClick();
      this.containerEl?.closest('.dd-shell')?.remove();
      this.scene.start('Achievements', { audio: this.audio });
    });

    this.containerEl.querySelector('#btn-logout')?.addEventListener('click', async () => {
      this.audio.playClick();
      if (!confirm('Log out of this Google account?')) return;
      try {
        await signOut();
      } catch (err) {
        console.error('[TypeType] signOut failed:', err);
      }
      window.location.reload();
    });

    this.containerEl.querySelectorAll('.home-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number((btn as HTMLElement).dataset.tab);
        this.audio.playClick();
        this.setActiveTab(idx);
      });
    });
  }

  private setActiveTab(idx: number) {
    if (idx === this.activePage) return;
    this.activePage = idx;

    const pages = this.containerEl.querySelectorAll('.home-page');
    pages.forEach((page, i) => page.classList.toggle('active', i === idx));

    this.containerEl.querySelectorAll('.home-tab').forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });
  }

  // ── Page 1: Challenge Categories (Single Image + Invisible Buttons) ──

  private renderChallengeCategoriesPage() {
    const c = theme.color;
    const highestTier: Tier = phaserGame.registry.get('highestUnlockedTier') ?? 'easy';
    const badges: Partial<Record<Tier, boolean>> = phaserGame.registry.get('tierBadges') ?? {};
    const page = this.containerEl.querySelector('#page-challenge_categories') as HTMLElement;

    page.style.padding = '0';
    page.style.background = 'none';

    page.innerHTML = `
      <img src="/images/bg_playground.png" alt="Playground Background" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none;" />

        <!-- Page Title (Added here) -->
      <div style="position: absolute; top: 15px; left: 50%; transform: translateX(-50%); z-index: 10;">
        <span style="font-family: ${theme.font.display}; font-size: 25px; font-weight: 700; color: #FF6B6B; text-shadow: 2px 2px 0px rgba(0,0,0,0.2);">
          Friends Challenge
        </span>
      </div>

      <div style="position: relative; z-index: 1; display: flex; gap: 10px; flex: 1; padding: 12px; padding-bottom: 90px; box-sizing: border-box; height: 100%;">
        
        <!-- Left Column: Level Images -->
        <div style="flex: 1; min-width: 0; position: relative; height: 100%;">
          ${levelCard('boss', highestTier, !!badges.boss, '0%', '23%')}
          ${levelCard('hard', highestTier, !!badges.hard, '22%', '23%')}
          ${levelCard('medium', highestTier, !!badges.medium, '43%', '23%')}
          ${levelCard('easy', highestTier, !!badges.easy, '65%', '23%')}
        </div>

        <!-- Right Column: 4 Tier Leaderboards -->
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 4px; margin-top: 20px;">
          
        <!-- Right Column: 4 Tier Leaderboards (Absolute Positioned for alignment) -->
        <div style="flex: 1; min-width: 0; position: relative; height: 100%;">
          
          <!-- Boss Ranking (Top) -->
          <div id="lb-boss" style="
            position: absolute; top: 5%; left: 0; right: 0;
            height: 125px;
            background: url('/images/ranking.png') no-repeat center center; 
            background-size: 100% 100%; 
            border-radius: 12px; 
            padding: 15px;">
            ${spinner()}
          </div>

          <!-- Hard Ranking -->
          <div id="lb-hard" style="
            position: absolute; top: 28%; left: 0; right: 0;
            height: 125px;
            background: url('/images/ranking.png') no-repeat center center; 
            background-size: 100% 100%; 
            border-radius: 12px; 
            padding: 15px;">
            ${spinner()}
          </div>

          <!-- Medium Ranking -->
          <div id="lb-medium" style="
            position: absolute; top: 50%; left: 0; right: 0;
            height: 125px;
            background: url('/images/ranking.png') no-repeat center center; 
            background-size: 100% 100%; 
            border-radius: 12px; 
            padding: 15px;">
            ${spinner()}
          </div>

          <!-- Easy Ranking (Bottom) -->
          <div id="lb-easy" style="
            position: absolute; top: 72%; left: 0; right: 0;
            height: 125px;
            background: url('/images/ranking.png') no-repeat center center; 
            background-size: 100% 100%; 
            border-radius: 12px; 
            padding: 15px;">
            ${spinner()}
          </div>
        </div>
      </div>

      <img id="btn-invite" src="/images/btn_invite.png" alt="Invite Friends" style="position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); width: 200px; max-width: 60%; height: auto; cursor: pointer; z-index: 20; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));" />
    `;

    page.querySelectorAll('.dd-level-card').forEach(cardEl => {
      cardEl.addEventListener('click', () => {
        const el = cardEl as HTMLElement;
        if (el.dataset.locked === '1') return;
        this.audio.playClick();
                this.scene.start('Game', { startTier: el.dataset.tier as Tier, audio: this.audio, returnTab: this.activePage });
      });
    });

    page.querySelector('#btn-invite')?.addEventListener('click', async () => {
      this.audio.playClick();
      const identity = getIdentity();
      if (!identity?.inviteCode) return;
      const link = buildInviteLink(identity.inviteCode);
      try {
        await navigator.clipboard.writeText(link);
        const btn = page.querySelector('#btn-invite') as HTMLImageElement;
        btn.style.opacity = '0.6';
        setTimeout(() => { if (btn) btn.style.opacity = '1'; }, 2000);
      } catch {
        prompt('Copy your invite link:', link);
      }
    });
  }

  private async refreshChallengeLeaderboard() {
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
      console.error('[TypeType] leaderboard fetch failed', err);
    }

    phaserGame.registry.set('ladder', entries);

    // --- NEW: Fetch Tier Leaderboards ---
    const ids = new Set<string>();
    if (identity) {
      ids.add(identity.userId);
      entries.forEach(e => ids.add(e.userId));
    }

    const tierData: Record<Tier, { username: string; bestTimeMs: number }[]> = { easy: [], medium: [], hard: [], boss: [] };

    if (ids.size > 0) {
      try {
        const { data } = await supabase
          .from('tier_best_scores')
          .select('user_id, tier, best_time_ms, profiles(username)')
          .in('user_id', Array.from(ids));

        (data ?? []).forEach(row => {
          if (tierData[row.tier as Tier]) {
            tierData[row.tier as Tier].push({
              username: (row.profiles as any)?.username ?? 'Unknown',
              bestTimeMs: row.best_time_ms
            });
          }
        });

        for (const tier of ['easy', 'medium', 'hard', 'boss'] as Tier[]) {
          tierData[tier].sort((a, b) => a.bestTimeMs - b.bestTimeMs);
          tierData[tier] = tierData[tier].slice(0, 3);
        }
      } catch (err) {
        console.error('[TypeType] tier leaderboard fetch failed', err);
      }
    }

    this.renderTierLB('easy', tierData.easy, username);
    this.renderTierLB('medium', tierData.medium, username);
    this.renderTierLB('hard', tierData.hard, username);
    this.renderTierLB('boss', tierData.boss, username);
  }

  private renderTierLB(tier: Tier, entries: { username: string; bestTimeMs: number }[], myUsername: string) {
    const card = this.containerEl?.querySelector(`#lb-${tier}`) as HTMLElement;
    if (!card) return;
    
    // Strictly limit to Top 3
    const top3 = entries.slice(0, 3);

    // Custom colors for the ranking titles
    const titleColors: Record<Tier, string> = {
      easy: '#8FD694',
      medium: '#7CCBFF',
      hard: '#CBB6FF',
      boss: '#FF6B6B'
    };
    const titleColor = titleColors[tier];

    let html = `
      <div style="font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: 800; color: ${titleColor}; margin-bottom: 4px; text-align: center;">
        ${TIER_LABELS[tier]} Rankings
      </div>
    `;

    if (top3.length === 0) {
      html += `<div style="font-family: 'Nunito', sans-serif; font-size: 12px; color: #000000; text-align: center; padding: 4px; opacity: 0.7;">No records yet</div>`;
    } else {
      html += top3.map((e, i) => {
        const isMe = e.username.toLowerCase() === myUsername.toLowerCase();
        return `
          <div style="font-family: 'Nunito', sans-serif; display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; border-radius: 6px; font-size: 12px; margin-bottom: 2px;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <span style="font-weight: 800; color: #000000; width: 16px; flex-shrink: 0;">${i + 1}</span>
              <span style="font-weight: 700; color: #000000; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.username}</span>
            </div>
            <span style="font-weight: 800; color: #000000; flex-shrink: 0;">${(e.bestTimeMs / 1000).toFixed(3)}s</span>
          </div>
        `;
      }).join('');
    }
    card.innerHTML = html;
  }

  // ── Page 2: Daily Challenge ──

  private renderDailyChallengePage(access: AccessResult, auth: AuthState) {
    const c = theme.color;
    const page = this.containerEl.querySelector('#page-daily_challenge') as HTMLElement;

    // 1. Show spinner while checking Google login
    if (access.reason === 'loading') {
      page.innerHTML = `<div style="flex:1; display:flex; align-items:center; justify-content:center;">${spinner()}</div>`;
      return;
    }

    const locked = access.reason === 'guest_not_allowed' || access.reason === 'locked';

    if (locked) {
      const teaser = access.reason === 'guest_not_allowed'
        ? 'Log in to start today\u2019s puzzle'
        : 'A fresh puzzle drops every midnight \u2014 climb today\u2019s leaderboard';
      page.innerHTML = renderLockedPageHTML('Daily Challenge', teaser, auth, DAILY_CHALLENGE_DAYS_REQUIRED);
      return;
    }

    page.style.padding = '0';
    page.style.background = 'none';

    page.innerHTML = `
      <img src="/images/dailychallengebackground.png" alt="Daily Challenge Background" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none;" />

      <!-- LOCKED WRAPPER: overflow hidden guarantees 1 single page, no scrollbars ever -->
      <div style="position: relative; z-index: 1; flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 1px; text-align: center; padding: 2px 16px;">
        
        <!-- Main Title -->
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex-shrink: 0;">
          <span style="font-family: ${theme.font.display}; font-size: 28px; font-weight: 700; color: #FFC93C; text-shadow: 2px 2px 0px rgba(0,0,0,0.2);">
            Daily Challenge
          </span>
        </div>

        <!-- Last Week's Top 3 Award Card -->
        <div style="flex-shrink: 0;">
          
          <!-- 1. Fixed Height Container for the Image (Change height here to make the image area bigger) -->
          <div style="height: 80px; display: flex; align-items: center; justify-content: center; margin-bottom: 0px; flex-shrink: 0;">
            <!-- 2. Image scales INSIDE the container (Change max-height here to grow the image) -->
            <img src="/images/last_week_champions.png" alt="Last Week's Champions" style="max-height: 100%; max-width: 100%; width: auto; height: auto; object-fit: contain;" />
          </div>

          <!-- 3. The Box holding the 3 players (Fixed size, won't be pushed down) -->
          <div id="dc-awards-card" style="
            background: url('/images/dailybox.png') no-repeat center 46%; 
            background-size: 120% 300%; 
            aspect-ratio: 4 / 1; 
            border-radius: 20px; 
            padding: 5px 15px; 
            display:flex; justify-content:space-around; align-items:center;">
            ${spinner()}
          </div>
        </div>

        <!-- Side-by-Side Leaderboards: Today & This Week -->
        <div style="display: flex; gap: 12px; flex: 1; min-height: 0;">
          
          <!-- Left Column: Today Top 10 + Clock -->
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
            
            <!-- Title Image (Fixed slice) -->
            <div style="flex: 0 0 35px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px;">
              <img src="/images/top10.png" alt="Today Top 10" style="max-height: 100%; max-width: 100%; width: auto; height: auto;" />
            </div>

            <!-- Ranking Box (Gets 3 slices of the pie) -->
            <div id="daily-lb-today" style="
              background: url('/images/dailybox.png') no-repeat center center; 
              background-size: 150% 400%; 
              border-radius: 12px; 
              padding: 15px 10px; 
              flex: 3; /* CHANGE THIS NUMBER to make the list bigger/smaller relative to the clock */
              overflow-y: auto; 
              display:flex; flex-direction:column; gap:4px; min-height: 0;">
              ${spinner()}
            </div>

            <!-- Clock Countdown (Gets 2 slices of the pie) -->
            <div style="
              flex: 2; /* CHANGE THIS NUMBER to make the clock bigger/smaller relative to the list */
              min-height: 0; 
              display: flex; align-items: center; justify-content: center; 
              margin-top: 8px;">
              <div style="
                position: relative; 
                height: 100%; 
                aspect-ratio: 1 / 1; /* Keeps the clock perfectly circular/square */
                max-height: 180px; /* Prevents it from getting too huge on desktop */
                display: flex; align-items: center; justify-content: center; 
                background: url('/images/clock.png') no-repeat center center; 
                background-size: contain;">
                <span id="daily-countdown" style="
                  font-family: ${theme.font.mono}; 
                  font-weight: 800; 
                  font-size: 20px; 
                  color: ${c.accentBright}; 
                  position: absolute; 
                  top: 61%; 
                  left: 67%; 
                  transform: translate(-50%, -50%); 
                  text-align: center; 
                  width: 100%;">
                  00:00:00
                </span>
              </div>
            </div>
          </div>

          <!-- Right Column: This Week Top 10 -->
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column;">
            
            <!-- 1. IMAGE POSITION: Change margin-top to push the image down -->
            <div style="flex: 0 0 35px; display: flex; align-items: center; justify-content: center; margin-top: 186px; margin-bottom: 4px;">
              <img src="/images/weektop10.png" alt="This Week Top 10" style="max-height: 100%; max-width: 100%; width: auto; height: auto;" />
            </div>
            
            <!-- 2. BOX SIZE & POSITION: Changed flex: 5 to a fixed height so it doesn't stretch to the top -->
            <div id="daily-lb-weekly" style="
              background: url('/images/dailybox.png') no-repeat center center; 
              background-size: 150% 400%; 
              border-radius: 12px; 
              padding: 15px 10px; 
              height: 300px; /* Change this to make the box taller or shorter! */
              overflow-y: auto; display:flex; flex-direction:column; gap:4px; min-height: 0;">
              ${spinner()}
            </div>
          </div>
        </div>

        <!-- Custom Daily Start Button Image (Absolute Positioned) -->
        <img id="btn-start-daily" src="/images/dailystart.png" alt="Start Daily Challenge" style="
          position: absolute; 
          bottom: 300px; /* CHANGE THIS to move UP (e.g., 60px) or DOWN (e.g., 10px) */
          left: 75%; /* CHANGE THIS to move LEFT (e.g., 30%) or RIGHT (e.g., 70%) */
          transform: translateX(-50%); /* Keeps it perfectly centered on the % mark */
          
          width: 100%; 
          max-width: 200px; /* CHANGE THIS number to make the button bigger or smaller! */
          height: auto; 
          cursor: pointer; 
          z-index: 20; 
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));" 
        />

      </div>
    `;

    this.startDailyCountdown();
    this.refreshDailyAwards();
    this.refreshDailyLeaderboard();

    page.querySelector('#btn-start-daily')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('DailyChallenge', { audio: this.audio, returnTab: this.activePage });
    });
  }

  private async refreshDailyLeaderboard() {
    const todayCard = this.containerEl?.querySelector('#daily-lb-today') as HTMLElement;
    const weeklyCard = this.containerEl?.querySelector('#daily-lb-weekly') as HTMLElement;
    
    if (!todayCard || !weeklyCard) return;
    
    const c = theme.color;
    const identity = getIdentity();
    const myUserId = identity?.userId ?? '';
    const today = new Date().toISOString().split('T')[0];

    try {
      // Fetch both at the same time
      const [todayEntries, weeklyEntries] = await Promise.all([
        fetchDailyLeaderboard(today, 10),
        fetchWeeklyLeaderboard()
      ]);

      // Render Today
      if (todayEntries.length === 0) {
        todayCard.innerHTML = `<div style="color:${c.textMuted};font-size:11px;text-align:center;padding:20px;">No scores yet.</div>`;
      } else {
        todayCard.innerHTML = todayEntries.map((e, i) => this.renderDailyLbRow(e, i, myUserId, false)).join('');
      }

      // Render Weekly
      if (weeklyEntries.length === 0) {
        weeklyCard.innerHTML = `<div style="color:${c.textMuted};font-size:11px;text-align:center;padding:20px;">No scores yet.</div>`;
      } else {
                weeklyCard.innerHTML = weeklyEntries.slice(0, 10).map((e, i) => this.renderDailyLbRow(e, i, myUserId, true)).join('');;
      }
    } catch (err) {
      console.error('[TypeType] daily leaderboard fetch failed', err);
    }
  }

  private renderDailyLbRow(e: any, i: number, myUserId: string, isWeekly: boolean) {
    const c = theme.color;
    const isMe = !!myUserId && e.userId === myUserId;
    const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : c.textMuted;
    
    const mainScore = isWeekly ? `${e.weeklyScore}` : `${e.totalScore}`;
    const winBadge = isWeekly && e.dailyWins > 0 ? `<span style="font-size:9px;font-weight:700;color:${c.warning};margin-right:3px;">🏆${e.dailyWins}</span>` : '';
    const bonusBadge = !isWeekly && e.reachedBonus ? `<span style="font-size:9px;font-weight:700;color:${c.warning};margin-right:3px;">🔥${e.bonusStagesCleared}</span>` : '';

    return `
      <div class="daily-lb-row" data-userid="${e.userId}" data-username="${e.username}" style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-radius:6px; font-size:11px; background:${isMe ? 'rgba(0,0,0,0.1)' : 'transparent'}; font-family: 'Nunito', sans-serif; cursor: pointer;">
        <div style="display:flex; align-items:center; gap:6px; min-width:0; flex:1;">
          <span style="font-weight:800; color:${rankColor}; width:18px; flex-shrink:0;">${i + 1}</span>
          <span style="font-weight:700; color:#000000; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${winBadge}${bonusBadge}${e.username}
          </span>
        </div>
        <span style="color:#000000; font-weight:800; flex-shrink:0;">${mainScore}</span>
      </div>
    `;
  }

  private async refreshDailyAwards() {
    const card = this.containerEl?.querySelector('#dc-awards-card') as HTMLElement;
    if (!card) return;

    try {
      const champions = await fetchLastWeekChampions(3);
      const c = theme.color;

      if (champions.length === 0) {
        card.innerHTML = `<div style="font-size:12px; color:${c.textMuted}; text-align:center;">No champions crowned last week.</div>`;
        return;
      }

      const medals = ['🥇', '🥈', '🥉'];
      
      card.innerHTML = champions.map((champ, i) => `
        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex:1;">
          <span style="font-size: 20px;">${medals[i] || '🏅'}</span>
          <span style="font-family: 'Nunito', sans-serif; font-size: 12px; font-weight: 700; color: ${c.textPrimary}; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${champ.username}
          </span>
          <span style="font-family: 'Nunito', sans-serif; font-size: 10px; color: ${c.textMuted};">
            ${champ.dailyWins} Wins
          </span>
          <span style="font-family: 'Nunito', sans-serif; font-size: 10px; font-weight: 700; color: ${c.accentBright};">
            ${champ.weeklyScore} pts
          </span>
        </div>
      `).join('');
    } catch (err) {
      console.error('[TypeType] daily awards fetch failed', err);
      card.innerHTML = `<div style="font-size:12px; color:${c.textMuted}; text-align:center;">Couldn't load champions.</div>`;
    }
  }

  private startDailyCountdown() {
    const updateCountdown = () => {
      const now = new Date();
      // Get midnight UTC for tomorrow
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
      const diff = tomorrow.getTime() - now.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      const el = this.containerEl?.querySelector('#daily-countdown');
      if (el) {
        // Pad with leading zeros so it looks like 10:05:09 instead of 10:5:9
        el.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      } else if (this.dailyCountdownInterval) {
        clearInterval(this.dailyCountdownInterval);
      }
    };
    
    updateCountdown(); // Call once immediately
    this.dailyCountdownInterval = window.setInterval(updateCountdown, 1000);
  }

  // ── Page 3: Endless ──

    private renderEndlessPage(access: AccessResult, auth: AuthState) {
    const c = theme.color;
    const page = this.containerEl.querySelector('#page-endless') as HTMLElement;

    // 1. Show spinner while checking Google login
    if (access.reason === 'loading') {
      page.innerHTML = `<div style="flex:1; display:flex; align-items:center; justify-content:center;">${spinner()}</div>`;
      return;
    }

    const locked = access.reason === 'guest_not_allowed' || access.reason === 'locked';

    if (locked) {
      const teaser = access.reason === 'guest_not_allowed'
        ? 'Log in to start a run'
        : 'One mistake ends it \u2014 how far can you get?';
      page.innerHTML = renderLockedPageHTML('Endless Mode', teaser, auth, ENDLESS_LEVELS_DAYS_REQUIRED);
      return;
    }

    // Apply full-screen background and remove default padding
    page.style.padding = '0';
    page.style.background = 'none';

    page.innerHTML = `
      <!-- Full-Screen Background Layer -->
      <img src="/images/endless.png" alt="Endless Background" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none;" />

      <!-- Main Content Layer -->
      <div style="position: relative; z-index: 1; flex: 1; min-height: 0; overflow: hidden;">
        
        <!-- Page Title (Added here) -->
        <div style="position: absolute; top: 30px; left: 50%; transform: translateX(-50%); z-index: 10;">
          <span style="font-family: ${theme.font.display}; font-size: 28px; font-weight: 700; color: #8FD694; text-shadow: 2px 2px 0px rgba(0,0,0,0.2);">
            Endless Mode
          </span>
        </div>

        <!-- Custom Start Button Image (Absolute Positioned for total freedom) -->
        <img id="btn-start-endless" src="/images/endstart.png" alt="Start Endless" style="
          position: absolute; 
          top: 90%; /* CHANGE THIS to move UP/DOWN (e.g., 30% or 70%) */
          left: 50%; /* CHANGE THIS to move LEFT/RIGHT (e.g., 30% or 70%) */
          transform: translate(-50%, -50%); /* Keeps the center of the image exactly on the % mark */
          
          width: 100%; 
          max-width: 100px; /* CHANGE THIS for size */
          height: auto; 
          cursor: pointer; 
          z-index: 20; 
          filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));" 
        />

      </div>
    `;

    page.querySelector('#btn-start-endless')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('EndlessMode', { audio: this.audio, returnTab: this.activePage });
    });
  }

  // ── Page 4: Profile (Achievements & Friends) ──

  private renderProfilePage() {
    const c = theme.color;
    const page = this.containerEl.querySelector('#page-levels') as HTMLElement;
    if (!page) return;

    page.style.padding = '0';
    page.style.background = 'none';

    page.innerHTML = `
      <img src="/images/profileback.png" alt="Profile Background" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none;" />
      
      <div style="position: relative; z-index: 1; display: flex; flex: 1; min-height: 0; gap: 10px; padding: 10px;">
        
        <!-- Left Sidebar -->
        <div style="width: 80px; flex-shrink: 0; display: flex; flex-direction: column; gap: 10px;">
          <button id="btn-profile-ach" style="
            flex: 1; border-radius: 12px; 
            border: 1px solid ${this.activeProfileTab === 'achievements' ? c.accent : c.border}; 
            background: ${this.activeProfileTab === 'achievements' ? c.accentDim : 'transparent'}; 
            color: ${this.activeProfileTab === 'achievements' ? c.accentBright : c.textMuted}; 
            cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; 
            font-size: 10px; font-weight: 700; font-family: 'Nunito', sans-serif;">
            🏆<span>Achieve</span>
          </button>
          <button id="btn-profile-friends" style="
            flex: 1; border-radius: 12px; 
            border: 1px solid ${this.activeProfileTab === 'friends' ? c.accent : c.border}; 
            background: ${this.activeProfileTab === 'friends' ? c.accentDim : 'transparent'}; 
            color: ${this.activeProfileTab === 'friends' ? c.accentBright : c.textMuted}; 
            cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; 
            font-size: 10px; font-weight: 700; font-family: 'Nunito', sans-serif;">
            👥<span>Friends</span>
          </button>
        </div>

        <!-- Right Content Area -->
        <div id="profile-content" style="flex: 1; min-width: 0; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; background: transparent;">
          ${spinner()}
        </div>
      </div>
    `;

    // Bind Sidebar Buttons
    page.querySelector('#btn-profile-ach')?.addEventListener('click', () => {
      if (this.activeProfileTab !== 'achievements') {
        this.audio.playClick();
        this.activeProfileTab = 'achievements';
        this.renderProfilePage(); // Re-render to update styles and content
      }
    });

    page.querySelector('#btn-profile-friends')?.addEventListener('click', () => {
      if (this.activeProfileTab !== 'friends') {
        this.audio.playClick();
        this.activeProfileTab = 'friends';
        this.renderProfilePage(); // Re-render to update styles and content
      }
    });

    // Load the active content
    this.loadProfileContent();
  }

  private async loadProfileContent() {
    const contentEl = this.containerEl?.querySelector('#profile-content') as HTMLElement;
    if (!contentEl) return;

    const identity = getIdentity();

    if (this.activeProfileTab === 'achievements') {
      contentEl.innerHTML = spinner('Loading badges...');
      
      let unlocked = new Set<string>();
      
      // Only fetch from Supabase if the user is logged in
      if (identity && !identity.isGuest) {
        try {
          // Call the secure "Brain" function in Supabase
          const { data, error } = await supabase.rpc('sync_user_badges', { 
            p_user_id: identity.userId 
          });
          
          if (error) {
            console.error('[TypeType] sync_user_badges error:', error);
          } else if (data) {
            // data is an array of objects like [{ badge_id: 'ninja' }, ...]
            // convert it to a Set of strings for easy lookup
            unlocked = new Set(data.map((row: any) => row.badge_id));
          }
        } catch (err) {
          console.error('[TypeType] RPC call failed:', err);
        }
      }

      // Define your 9 badges and their unlock rules
      const badgeData = [
        { id: 'typemaster', rule: 'Clear all basic stages in all 4 tiers (Easy, Medium, Hard, Boss) in Friends Challenge.' },
        { id: 'limitbreaker', rule: 'Beat your previous personal best record in any game mode.' },
        { id: 'dailyking', rule: 'Play the Daily Challenge for 7 consecutive days.' },
        { id: 'hiddenhunter', rule: 'Unlock a hidden bonus stage in Friends Challenge for the first time.' },
        { id: 'bossbreaker', rule: 'Clear a full tier gauntlet: 5 basic, 5 hidden, and the Limit Break stage without failing.' },
        { id: 'ninja', rule: 'Unlock hidden bonus stages 3 times total in Friends Challenge.' },
        { id: 'onfire', rule: 'Reach Round 20 in Endless Mode.' },
        { id: 'perfect', rule: 'Get a 100% accuracy run in both Friends Challenge and Daily Challenge.' },
        { id: 'flash', rule: 'Reach Rank #1 on any tier leaderboard and have at least 1 accepted friend.' }
      ];

      // Build the 3x3 HTML Grid
      const html = `
        <style>
          .badge-grid-3x3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr); /* 3 columns */
            gap: 12px;
            padding: 16px;
            height: 100%;
            overflow-y: auto;
            box-sizing: border-box;
            align-content: center; /* Centers the grid vertically */
          }
          .badge-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
          }
          .badge-img {
            width: 100%;
            aspect-ratio: 1 / 1; /* Keeps perfect squares */
            object-fit: contain; 
          }
          .badge-locked {
            filter: grayscale(100%) brightness(0.4); /* Greyout effect */
            opacity: 0.6;
          }
          .badge-name {
            font-family: 'Nunito', sans-serif;
            font-size: 10px;
            font-weight: 700;
            color: #fff;
            text-align: center;
            text-transform: capitalize;
          }
        </style>
        <div class="badge-grid-3x3">
          ${badgeData.map(badge => {
            const isUnlocked = unlocked.has(badge.id);
            return `
              <div class="badge-item" data-badge-id="${badge.id}" data-badge-rule="${badge.rule}" data-badge-unlocked="${isUnlocked}" style="cursor: pointer;">
                <img src="/images/${badge.id}.png" class="badge-img ${isUnlocked ? '' : 'badge-locked'}" alt="${badge.id}" />
                <span class="badge-name" style="opacity: ${isUnlocked ? 1 : 0.5};">
                  ${badge.id}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // Double check user didn't switch tabs while loading
      if (this.activeProfileTab === 'achievements' && contentEl) {
        contentEl.innerHTML = html;
        
        // Bind click events to badges
        contentEl.querySelectorAll('.badge-item').forEach(item => {
          item.addEventListener('click', (e) => {
            const el = item as HTMLElement;
            const badgeId = el.dataset.badgeId;
            const rule = el.dataset.badgeRule;
            const isUnlocked = el.dataset.badgeUnlocked === 'true';
            if (badgeId && rule) {
              this.showBadgeInfoModal(badgeId, rule, isUnlocked);
            }
          });
        });
      }
    } else {
      this.renderFriendsUI(contentEl, identity);
    }
  }

  private showBadgeInfoModal(badgeId: string, rule: string, isUnlocked: boolean) {
    // Remove existing modal if any
    this.containerEl.querySelector('#badge-info-modal')?.remove();

    const c = theme.color;
    const modal = document.createElement('div');
    modal.id = 'badge-info-modal';
    modal.style.cssText = `
      position: absolute; 
      inset: 0; 
      background: rgba(0,0,0,0.7); 
      z-index: 100; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      padding: 20px;
      animation: fadeIn 0.15s;
    `;

    modal.innerHTML = `
      <div style="background: ${c.bgCard}; border-radius: 12px; padding: 20px; max-width: 280px; width: 100%; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: 'Nunito', sans-serif;">
        <img src="/images/${badgeId}.png" style="width: 60px; height: 60px; object-fit: contain; margin-bottom: 10px; ${isUnlocked ? '' : 'filter: grayscale(100%) brightness(0.4); opacity: 0.6;'}" alt="${badgeId}" />
        <h3 style="margin: 0 0 8px 0; color: ${c.textPrimary}; font-size: 16px; text-transform: capitalize;">${badgeId}</h3>
        <p style="margin: 0 0 16px 0; color: ${c.textSecondary}; font-size: 13px; line-height: 1.5;">${rule}</p>
        <div style="font-size: 11px; font-weight: 800; color: ${isUnlocked ? '#4ADE80' : '#FFD23F'}; margin-bottom: 16px; text-transform: uppercase;">
          ${isUnlocked ? '✓ Unlocked' : '🔒 Locked'}
        </div>
        <button id="btn-close-badge-info" style="background: ${theme.palette.coral}; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; font-weight: 700; cursor: pointer; width: 100%; font-family: 'Nunito', sans-serif;">Got it!</button>
      </div>
    `;

    const contentEl = this.containerEl.querySelector('#profile-content') as HTMLElement;
    if (contentEl) {
      contentEl.appendChild(modal);
    }

    // Bind close events
    modal.querySelector('#btn-close-badge-info')?.addEventListener('click', () => {
      modal.remove();
    });
    
    // Close if clicking outside the box
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  private renderFriendsUI(contentEl: HTMLElement, identity: ReturnType<typeof getIdentity>) {
    const c = theme.color;
    
    contentEl.innerHTML = `
      <div style="display: flex; flex-direction: column; height: 100%; color: #fff; font-family: 'Nunito', sans-serif;">
        <div style="padding: 12px; font-size: 16px; font-weight: 800; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1);">
          Friends List
        </div>
        <div id="friends-list" style="flex: 1; overflow-y: auto; padding: 8px;">
          ${spinner('Loading friends...')}
        </div>
      </div>
    `;

    this.refreshFriendsList(identity);
  }

  private async refreshFriendsList(identity: ReturnType<typeof getIdentity>) {
    const listEl = this.containerEl?.querySelector('#friends-list') as HTMLElement;
    if (!listEl || !identity) return;
    
    listEl.innerHTML = spinner('Loading friends...');
    const myUserId = identity.userId;

    // 1. Get accepted friends (invites + friendships)
    const friendIds = new Set<string>();
    const { data: invitees } = await supabase.from('profiles').select('user_id').eq('invited_by', myUserId);
    if (invitees) invitees.forEach(p => friendIds.add(p.user_id));
    if (identity.invitedBy) friendIds.add(identity.invitedBy);

    const { data: f1 } = await supabase.from('friendships').select('addressee_id, status').eq('requester_id', myUserId);
    const { data: f2 } = await supabase.from('friendships').select('requester_id, status').eq('addressee_id', myUserId);
    
    const pendingRequestIds = new Set<string>();

    if (f1) f1.forEach(f => { if (f.status === 'accepted') friendIds.add(f.addressee_id); });
    if (f2) {
      f2.forEach(f => {
        if (f.status === 'accepted') friendIds.add(f.requester_id);
        if (f.status === 'pending') pendingRequestIds.add(f.requester_id);
      });
    }

    // 2. Fetch profiles for both friends and pending requests
    const allIds = [...friendIds, ...pendingRequestIds];
    
    if (allIds.length === 0) {
      listEl.innerHTML = `<div style="color:${theme.color.textMuted}; text-align:center; padding:20px; font-size:13px;">No friends yet.<br>Add a player from the Daily Challenge leaderboard!</div>`;
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, username, is_guest')
      .in('user_id', allIds);

    if (!profiles) return;

    // 3. Separate into two lists
    const pendingProfiles = profiles.filter(p => pendingRequestIds.has(p.user_id));
    const acceptedProfiles = profiles.filter(p => friendIds.has(p.user_id));

    let html = '';

    // Render Pending Requests
    if (pendingProfiles.length > 0) {
      html += `
        <div style="padding: 10px 8px 4px; font-size: 12px; font-weight: 800; color: ${theme.palette.yellow}; font-family: 'Nunito', sans-serif;">
          Pending Requests (${pendingProfiles.length})
        </div>
      `;
      html += pendingProfiles.map(p => `
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: rgba(255, 210, 63, 0.1); border-radius: 8px; margin-bottom: 4px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: ${theme.palette.yellow}; display: flex; align-items: center; justify-content: center; color: #2D3436; font-weight: 700;">
            ${p.username ? p.username.charAt(0).toUpperCase() : '?'}
          </div>
          <div style="font-weight: 600; font-size: 14px; color: #fff; flex: 1;">${p.username}</div>
          <button class="btn-accept-request" data-userid="${p.user_id}" style="background: ${theme.palette.coral}; border: none; border-radius: 8px; color: #fff; padding: 6px 12px; font-weight: 700; cursor: pointer; font-size: 12px;">Accept</button>
        </div>
      `).join('');
    }

    // Render Accepted Friends
    html += `
      <div style="padding: ${pendingProfiles.length > 0 ? '16px' : '10px'} 8px 4px; font-size: 12px; font-weight: 800; color: ${theme.color.textMuted}; font-family: 'Nunito', sans-serif;">
        Your Friends (${acceptedProfiles.length})
      </div>
    `;
    
    if (acceptedProfiles.length === 0) {
      html += `<div style="color:${theme.color.textMuted}; text-align:center; padding:20px; font-size:13px;">You haven't added any friends yet.</div>`;
    } else {
      html += acceptedProfiles.map(p => `
        <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.05);">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: ${theme.palette.coral}; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700;">
            ${p.username ? p.username.charAt(0).toUpperCase() : '?'}
          </div>
          <div style="font-weight: 600; font-size: 14px; color: #fff;">${p.username}</div>
          ${p.is_guest ? '<span style="font-size: 10px; color: #888; margin-left: auto;">Guest</span>' : ''}
        </div>
      `).join('');
    }

    listEl.innerHTML = html;

    // 4. Bind Accept Buttons
    listEl.querySelectorAll('.btn-accept-request').forEach(btn => {
      btn.addEventListener('click', async () => {
        const targetId = (btn as HTMLElement).dataset.userid;
        if (!targetId) return;
        this.audio.playClick();
        (btn as HTMLButtonElement).textContent = '...';
        (btn as HTMLButtonElement).disabled = true;

        await supabase.from('friendships').update({ status: 'accepted' }).eq('requester_id', targetId).eq('addressee_id', myUserId);
        
        // Refresh list to move them to "Friends"
        this.refreshFriendsList(identity);
      });
    });
  }

  // ── Auth + unlocks ──

  private async refreshAuthAndUnlocks() {
    const identity = getIdentity();
    this.auth.isLoggedIn = !!identity && !identity.isGuest;

    const logoutBtn = this.containerEl.querySelector('#btn-logout') as HTMLElement;
    if (logoutBtn) logoutBtn.style.display = this.auth.isLoggedIn ? 'flex' : 'none';

    // Show Login button if Guest
    const loginBtn = this.containerEl.querySelector('#btn-google-login') as HTMLElement;
    if (loginBtn) loginBtn.style.display = this.auth.isLoggedIn ? 'none' : 'flex';

    if (this.auth.isLoggedIn && identity) {
      this.auth.unlocks = await fetchPlayerUnlocks(identity.userId);
    }

    const dailyAccess = canAccessMode('daily_challenge', this.auth);
    const endlessAccess = canAccessMode('endless', this.auth);
    this.renderDailyChallengePage(dailyAccess, this.auth);
    this.renderEndlessPage(endlessAccess, this.auth);
    this.renderProfilePage();
  }
}

const UNLOCK_LETTERS = ['U', 'N', 'L', 'O', 'C', 'K'];

function renderLockedPageHTML(title: string, teaserLine: string, auth: AuthState, daysRequired: number): string {
  const c = theme.color;
  return `
    <div style="position:relative;flex:1;display:flex;align-items:center;justify-content:center;">
      <div aria-hidden="true" style="filter:blur(6px);opacity:0.5;pointer-events:none;
        ${panel('padding:28px 22px;')}max-width:320px;width:100%;display:flex;flex-direction:column;gap:12px;align-items:center;">
        <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">${title}</span>
        <div style="width:100%;height:11px;border-radius:6px;background:${c.border};"></div>
        <div style="width:82%;height:11px;border-radius:6px;background:${c.border};"></div>
        <div style="width:62%;height:11px;border-radius:6px;background:${c.border};"></div>
      </div>
      <div style="position:absolute;${panel('padding:16px 18px;')}max-width:250px;display:flex;flex-direction:column;
        gap:8px;align-items:center;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,0.18);">
        <span style="font-size:22px;">🔒</span>
        <span style="font-size:12px;font-weight:700;color:${c.textPrimary};line-height:1.4;">${teaserLine}</span>
        ${renderUnlockProgress(auth, daysRequired)}
      </div>
    </div>`;
}

function tiersClearedCount(auth: AuthState): number {
  if (auth.unlocks.clearedAllTiers) return 4;
  const highest: Tier = phaserGame.registry.get('highestUnlockedTier') ?? 'easy';
  return TIER_ORDER.indexOf(highest);
}

function renderUnlockProgress(auth: AuthState, daysRequired: number): string {
  const c = theme.color;
  const tiers = tiersClearedCount(auth);
  const days = Math.min(auth.unlocks.distinctDaysPlayed, daysRequired);
  const fraction = !auth.isLoggedIn ? 0 : (tiers / 4 + days / daysRequired) / 2;
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * 6);

  const caption = !auth.isLoggedIn
    ? 'Log in to start unlocking'
    : tiers < 4
      ? `Clear all 4 tiers (${tiers}/4)`
      : days < daysRequired
        ? `${days}/${daysRequired} days played`
        : 'Unlocking…';

  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:6px;">
      <div style="display:flex;gap:5px;">
        ${UNLOCK_LETTERS.map((letter, i) => `
          <div style="width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;
            font-family:${theme.font.display};font-weight:800;font-size:12px;
            background:${i < lit ? theme.palette.coral : c.bgElevated};
            color:${i < lit ? '#fff' : c.textMuted};
            border:1px solid ${i < lit ? theme.palette.coral : c.border};">${letter}</div>
        `).join('')}
      </div>
      <span style="font-size:10.5px;color:${c.textMuted};font-weight:600;">${caption}</span>
    </div>`;
}

// ─── Style helpers (Invisible Buttons & Leaderboard Rows) ────────────────────

function invisibleLevelButton(t: Tier, highest: Tier, hasBadge: boolean, top: string, height: string) {
  const unlocked = TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(highest);
  const isCurrent = t === highest;
  
  return `
    <div class="dd-level-card" data-tier="${t}" data-locked="${unlocked ? '0' : '1'}" style="
      position: absolute;
      top: ${top};
      left: 0;
      width: 100%;
      height: ${height};
      cursor: ${unlocked ? 'pointer' : 'default'};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 2;
      background: ${!unlocked ? 'rgba(0,0,0,0.4)' : 'transparent'};
      border-radius: 8px;
    ">
      ${!unlocked ? '<div style="font-size: 20px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">🔒</div>' : ''}
      ${isCurrent && unlocked ? '<div style="font-size: 20px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">▶</div>' : ''}
      ${hasBadge && unlocked ? '<div style="font-size: 20px; text-shadow: 0 2px 4px rgba(0,0,0,0.5);">🏅</div>' : ''}
    </div>`;
}

function levelCard(t: Tier, highest: Tier, hasBadge: boolean, top: string, left: string) {
  const unlocked = TIER_ORDER.indexOf(t) <= TIER_ORDER.indexOf(highest);
  const isCurrent = t === highest;
  
  return `
    <!-- Outer Wrapper: Handles positioning (Blue Box) -->
    <div style="
      position: absolute;
      top: ${top};
      left: ${left};
      width: 100%;
      height: 25%;
      display: flex; 
      align-items: center; 
      justify-content: center;
      pointer-events: none; /* Lets you see the outer area */
    ">
      <!-- Inner Button: Fixed short height (Red Box) -->
      <div class="dd-level-card" data-tier="${t}" data-locked="${unlocked ? '0' : '1'}" style="
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 40px; /* Red box is now short, so it won't overlap! */
        cursor: ${unlocked ? 'pointer' : 'default'};
        pointer-events: auto;
      ">
        <img src="/images/${t}.png" alt="${TIER_LABELS[t]}" style="
          display: block;
          width: 80px;  /* Image stays big */
          height: 80px; /* Image stays big */
          object-fit: contain; 
          pointer-events: none;
          position: absolute; /* Image floats over the Red Box */
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%); /* Centers the image perfectly */
          filter: ${!unlocked ? 'grayscale(100%) brightness(0.5)' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))'};
        " />
        
        <!-- Status Icons overlaid on top of the image -->
        <div style="position: absolute; bottom: 4px; right: 4px; font-size: 16px; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
          ${!unlocked ? '🔒' : hasBadge ? '🏅' : isCurrent ? '▶' : ''}
        </div>
      </div>
    </div>`;
}


function spinner(msg = 'Loading...') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:60px;gap:8px;padding:10px;">
      <div style="width:18px;height:18px;border:2px solid #FFFFFF44;border-top:2px solid #FFFFFF;
                  border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span style="font-size:10px;color:#FFFFFFAA;">${msg}</span>
    </div>`;
}

function lbRow(e: LadderEntry, i: number, myUsername: string, overtookMeUserIds?: Set<string>) {
  const isMe = e.username.toLowerCase() === myUsername.toLowerCase();
  const justPassedMe = !!overtookMeUserIds?.has(e.userId);
  const rankColor = i === 1 ? theme.palette.yellow : i === 2 ? '#C0C0C0' : i === 3 ? '#CD7F32' : '#FFFFFF99';

  let badgeHtml = '';
  if (e.clearedHiddenBonusTiers?.length) {
    badgeHtml = `<span style="font-size:9px;font-weight:700;color:${theme.palette.yellow};margin-right:4px;">🏅</span>`;
  }

  return `
    <div style="display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-radius:8px;font-size:12px;
      background:${isMe ? 'rgba(255, 255, 255, 0.15)' : justPassedMe ? 'rgba(240, 68, 82, 0.2)' : 'transparent'}}>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">
          <span style="font-weight:800;color:${rankColor};width:20px;flex-shrink:0;font-size:13px;">#${i + 1}</span>
          <div style="display:flex;align-items:center;gap:3px;min-width:0;overflow:hidden;">
            ${badgeHtml}
            <span style="font-weight:600;color:${isMe ? theme.palette.yellow : '#FFFFFF'};
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.username}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <span style="color:#FFFFFF99;font-size:10px;font-weight:700;">${TIER_LABELS[e.highestTier]}</span>
          <span style="color:#FFFFFF;font-weight:800;font-family:${theme.font.mono};font-size:13px;">${(e.bestTotalTimeMs / 1000).toFixed(3)}s</span>
        </div>
      </div>
      ${justPassedMe ? `<span style="font-size:9px;font-weight:700;color:${theme.palette.coral};padding-left:28px;">🔥 passed you!</span>` : ''}
    </div>`;
}