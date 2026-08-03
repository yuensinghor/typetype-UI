import { supabase } from '../lib/supabaseClient';
import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { audioManager, type AudioManager } from '../lib/audio';
import { soundToggleHTML, bindSoundToggle } from '../lib/soundToggle';
import { buildInviteLink, signOut } from '../lib/identity';
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

  constructor() {
    super('Home');
  }

  init(data: { audio?: AudioManager }) {
    if (data?.audio) this.audio = data.audio;
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
        <div class="home-page active" id="page-challenge_categories"></div>
        <div class="home-page" id="page-daily_challenge"></div>
        <div class="home-page" id="page-endless"></div>
        <div class="home-page" id="page-levels"></div>
      </div>

      <div class="home-tabbar" id="home-tabbar">
        <button class="home-tab active" data-tab="0" aria-label="Friends">${ICON_TAB_FRIENDS}<span>Friends</span></button>
        <button class="home-tab" data-tab="1" aria-label="Daily">${ICON_TAB_DAILY}<span>Daily</span></button>
        <button class="home-tab" data-tab="2" aria-label="Endless">${ICON_TAB_ENDLESS}<span>Endless</span></button>
        <button class="home-tab" data-tab="3" aria-label="Levels">${ICON_TAB_LEVELS}<span>Levels</span></button>
      </div>
    `;

    bindSoundToggle(this.containerEl);
    audioManager.startMenuMusic();

    this.renderChallengeCategoriesPage();
    this.renderDailyChallengePage({ allowed: false, reason: 'locked' }, this.auth);
    this.renderEndlessPage({ allowed: false, reason: 'locked' }, this.auth);
    this.renderLevelsPage(this.auth);

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
        this.scene.start('Game', { startTier: el.dataset.tier as Tier, audio: this.audio });
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
    const locked = access.reason === 'guest_not_allowed' || access.reason === 'locked';

    if (locked) {
      const teaser = access.reason === 'guest_not_allowed'
        ? 'Log in to start today\u2019s puzzle'
        : 'A fresh puzzle drops every midnight \u2014 climb today\u2019s leaderboard';
      page.innerHTML = renderLockedPageHTML('Daily Challenge', teaser, auth, DAILY_CHALLENGE_DAYS_REQUIRED);
      return;
    }

    page.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
        <div style="${panel('padding:28px 22px;')}max-width:320px;display:flex;flex-direction:column;gap:10px;align-items:center;">
          <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">
            Daily Challenge
          </span>
          <span style="font-size:12.5px;color:${c.textMuted};">A new puzzle every day. Global leaderboard.</span>
        </div>
        ${primaryButton('Start', 'btn-start-daily', 'max-width:320px;')}
      </div>
    `;

    page.querySelector('#btn-start-daily')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('DailyChallenge', { audio: this.audio });
    });
  }

  // ── Page 3: Endless ──

  private renderEndlessPage(access: AccessResult, auth: AuthState) {
    const c = theme.color;
    const page = this.containerEl.querySelector('#page-endless') as HTMLElement;
    const locked = access.reason === 'guest_not_allowed' || access.reason === 'locked';

    if (locked) {
      const teaser = access.reason === 'guest_not_allowed'
        ? 'Log in to start a run'
        : 'One mistake ends it \u2014 how far can you get?';
      page.innerHTML = renderLockedPageHTML('Endless Mode', teaser, auth, ENDLESS_LEVELS_DAYS_REQUIRED);
      return;
    }

    page.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
        <div style="${panel('padding:28px 22px;')}max-width:320px;display:flex;flex-direction:column;gap:10px;align-items:center;">
          <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">
            Endless Mode
          </span>
          <span style="font-size:12.5px;color:${c.textMuted};">Climb Easy → Boss, then hold on as long as you can.</span>
        </div>
        ${primaryButton('Start', 'btn-start-endless', 'max-width:320px;')}
      </div>
    `;

    page.querySelector('#btn-start-endless')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('EndlessMode', { audio: this.audio });
    });
  }

  // ── Page 4: Levels ──

  private renderLevelsPage(auth: AuthState) {
    const c = theme.color;
    const page = this.containerEl.querySelector('#page-levels') as HTMLElement;
    if (!page) return;
    const access = canAccessMode('levels', auth);
    const locked = access.reason === 'guest_not_allowed' || access.reason === 'locked';

    if (locked) {
      const teaser = access.reason === 'guest_not_allowed'
        ? 'Log in to start your first stage'
        : '100+ bite-sized stages \u2014 collect stars, unlock keypad skins';
      page.innerHTML = renderLockedPageHTML('Levels', teaser, auth, ENDLESS_LEVELS_DAYS_REQUIRED);
      return;
    }

    page.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;">
        <div style="${panel('padding:28px 22px;')}max-width:320px;display:flex;flex-direction:column;gap:10px;align-items:center;">
          <span style="font-family:${theme.font.display};font-size:20px;font-weight:800;color:${c.textPrimary};">
            Levels
          </span>
          <span style="font-size:12.5px;color:${c.textMuted};">100+ bite-sized stages. Collect stars, unlock keypad skins.</span>
        </div>
        ${primaryButton('Start', 'btn-start-levels', 'max-width:320px;')}
      </div>
    `;

    page.querySelector('#btn-start-levels')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('Levels', { audio: this.audio });
    });
  }

  // ── Auth + unlocks ──

  private async refreshAuthAndUnlocks() {
    const identity = getIdentity();
    this.auth.isLoggedIn = !!identity && !identity.isGuest;

    const logoutBtn = this.containerEl.querySelector('#btn-logout') as HTMLElement;
    if (logoutBtn) logoutBtn.style.display = this.auth.isLoggedIn ? 'flex' : 'none';

    if (this.auth.isLoggedIn && identity) {
      this.auth.unlocks = await fetchPlayerUnlocks(identity.userId);
    }

    const dailyAccess = canAccessMode('daily_challenge', this.auth);
    const endlessAccess = canAccessMode('endless', this.auth);
    this.renderDailyChallengePage(dailyAccess, this.auth);
    this.renderEndlessPage(endlessAccess, this.auth);
    this.renderLevelsPage(this.auth);
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