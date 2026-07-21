import Phaser from 'phaser';
import { phaserGame, getIdentity } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { AudioManager } from '../lib/audio';
import { buildInviteLink, signOut } from '../lib/identity';
import { theme, panel, label, logoTitle, primaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { canAccessMode, type AuthState, type AccessResult, DAILY_CHALLENGE_DAYS_REQUIRED, ENDLESS_LEVELS_DAYS_REQUIRED } from '../lib/modeAccess';
import { fetchPlayerUnlocks } from '../lib/playerUnlocks';
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

let stylesInjected = false;
function injectHomeStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'home-carousel-styles';
  style.textContent = `
    .home-track {
      display:flex; height:100%; overflow-x:auto; overflow-y:hidden;
      scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch;
      scrollbar-width:none;
    }
    .home-track::-webkit-scrollbar { display:none; }
    .home-page {
      flex:0 0 100%; width:100%; height:100%; scroll-snap-align:start;
      overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch;
      padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));
      display:flex; flex-direction:column; gap:14px;
    }
    .home-page::-webkit-scrollbar { width:6px; }
    .home-page::-webkit-scrollbar-thumb { background:${theme.color.borderStrong}; border-radius:3px; }
    .home-dot {
      width:7px; height:7px; border-radius:50%; background:${theme.color.border};
      transition:background 0.2s, transform 0.2s;
    }
    .home-dot.active { background:${theme.palette.coral}; transform:scale(1.3); }
  `;
  document.head.appendChild(style);
}

/**
 * Home — the swipeable carousel shell that replaces MainMenu.ts as the
 * post-boot scene. 4 always-reachable pages (swipe is never gated, only
 * each page's Start/Challenge button is): Challenge Categories, Daily
 * Challenge, Endless, Levels. Achievements lives behind the header trophy
 * icon, not as a 5th page, per the locked nav-redesign spec.
 *
 * Challenge Categories' ladder grid + friends leaderboard + invite button
 * is ported in as-is (markup/logic unchanged) from the now-superseded
 * ChallengeCategories.ts. Daily Challenge/Endless/Levels get lightweight
 * landing content here — real gameplay stays in their own scenes, launched
 * when a page's Start button is tapped.
 */
export class Home extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private trackEl!: HTMLDivElement;
  private audio = new AudioManager();
  private auth: AuthState = { isLoggedIn: false, unlocks: { clearedAllTiers: false, distinctDaysPlayed: 0 } };
  private activePage = 0;

  constructor() {
    super('Home');
  }

  init(data: { audio?: AudioManager }) {
    if (data?.audio) this.audio = data.audio;
  }

  create() {
    injectGlobalStyles();
    injectHomeStyles();
    this.buildShell();
    this.refreshChallengeLeaderboard();
    this.refreshAuthAndUnlocks();
  }

  shutdown() {
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  // ── Shell: header + swipeable track + page dots ────────────────────────

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
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <button id="btn-logout" aria-label="Log out" style="
            display:none;background:${c.bgCard};border:1px solid ${c.border};border-radius:12px;width:38px;height:38px;
            align-items:center;justify-content:center;font-size:16px;cursor:pointer;flex-shrink:0;">
            🚪
          </button>
          <button id="btn-achievements" aria-label="Achievements" style="
            background:${c.bgCard};border:1px solid ${c.border};border-radius:12px;width:38px;height:38px;
            display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;flex-shrink:0;">
            🏆
          </button>
        </div>
      </div>

      <div class="home-track" id="home-track">
        <div class="home-page" id="page-challenge_categories"></div>
        <div class="home-page" id="page-daily_challenge"></div>
        <div class="home-page" id="page-endless"></div>
        <div class="home-page" id="page-levels"></div>
      </div>

      <div style="display:flex;justify-content:center;gap:6px;padding:8px 0 12px;flex-shrink:0;">
        ${[0, 1, 2, 3].map(i => `<div class="home-dot${i === 0 ? ' active' : ''}" data-dot="${i}"></div>`).join('')}
      </div>
    `;

    this.trackEl = this.containerEl.querySelector('#home-track') as HTMLDivElement;

    this.renderChallengeCategoriesPage();
    this.renderDailyChallengePage({ allowed: false, reason: 'locked' }, this.auth);
    this.renderEndlessPage({ allowed: false, reason: 'locked' }, this.auth);
    this.renderLevelsPage(this.auth);

    this.bindShellEvents();
  }

  private bindShellEvents() {
    this.containerEl.querySelector('#btn-achievements')?.addEventListener('click', () => {
      this.audio.playClick();
      this.showAchievementsComingSoon();
    });

    this.containerEl.querySelector('#btn-logout')?.addEventListener('click', async () => {
      this.audio.playClick();
      if (!confirm('Log out of this Google account?')) return;
      try {
        await signOut();
      } catch (err) {
        console.error('[TypeType] signOut failed:', err);
      }
      // Full reload rather than in-memory state juggling — Preloader's boot
      // flow re-resolves identity from scratch (falls back to guest) and
      // re-fetches ladder/unlock progress fresh, so there's no risk of
      // stale registry values (highestUnlockedTier, tierBadges, etc.)
      // leaking from the just-ended session into the next one.
      window.location.reload();
    });

    // Track which page is active (for the dot indicator) as the player swipes.
    this.trackEl.addEventListener('scroll', () => {
      const idx = Math.round(this.trackEl.scrollLeft / this.trackEl.clientWidth);
      if (idx !== this.activePage) {
        this.activePage = idx;
        this.containerEl.querySelectorAll('.home-dot').forEach((dot, i) => {
          dot.classList.toggle('active', i === idx);
        });
      }
    });
  }

  private showAchievementsComingSoon() {
    const c = theme.color;
    const toast = document.createElement('div');
    toast.style.cssText = `
      position:absolute;top:60px;left:50%;transform:translateX(-50%);z-index:1200;
      ${panel('padding:10px 16px;')}font-family:${theme.font.body};font-size:12.5px;
      font-weight:600;color:${c.textSecondary};white-space:nowrap;animation:popIn 0.15s;
    `;
    toast.textContent = '🏆 Achievements — coming soon';
    this.containerEl.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  }

  // ── Page 1: Challenge Categories (ported from ChallengeCategories.ts) ──

  private renderChallengeCategoriesPage() {
    const c = theme.color;
    const highestTier: Tier = phaserGame.registry.get('highestUnlockedTier') ?? 'easy';
    const badges: Partial<Record<Tier, boolean>> = phaserGame.registry.get('tierBadges') ?? {};
    const page = this.containerEl.querySelector('#page-challenge_categories') as HTMLElement;

    page.innerHTML = `
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
        const btn = page.querySelector('#btn-invite') as HTMLButtonElement;
        const original = btn.textContent;
        btn.textContent = 'Link copied!';
        btn.style.color = theme.color.success;
        setTimeout(() => { if (btn) { btn.textContent = original; btn.style.color = theme.color.textSecondary; } }, 2000);
      } catch {
        prompt('Copy your invite link:', link);
      }
    });
  }

  private async refreshChallengeLeaderboard() {
    const page = this.containerEl?.querySelector('#page-challenge_categories') as HTMLElement;
    const lbCard = page?.querySelector('#lb-card') as HTMLElement;
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
      console.error('[TypeType] leaderboard fetch failed', err);
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

  // ── Page 2: Daily Challenge (landing-only — real gameplay stays in DailyChallenge.ts) ──

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

  // ── Page 3: Endless (landing-only — real gameplay stays in EndlessMode.ts) ──

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

  // ── Page 4: Levels — not built yet, always blurred+teased ──

  private renderLevelsPage(auth: AuthState) {
    const page = this.containerEl.querySelector('#page-levels') as HTMLElement;
    page.innerHTML = renderLockedPageHTML(
      'Levels',
      '100+ bite-sized stages. Collect stars, unlock keypad skins.',
      auth,
      ENDLESS_LEVELS_DAYS_REQUIRED
    );
  }

  // ── Auth + unlocks (drives every gated page's progress bar) ────────────

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

// ─── U-N-L-O-C-K progress bar ───────────────────────────────────────────────
//
// Per-page, letters light up toward THAT page's own next unlock target.
// Each gated mode needs two things: all 4 ladder tiers cleared, and a
// number of distinct days played. Those are two different kinds of
// progress (a checklist vs a counter), so this combines them into one
// 0-6 scale by averaging each as a fraction of its own requirement, then
// lighting however many of the 6 letters that fraction covers — e.g.
// tiers half cleared + 0 days played lands around 1-2 letters lit, while
// tiers fully cleared + 5/7 days played lands around 5 letters lit.

const UNLOCK_LETTERS = ['U', 'N', 'L', 'O', 'C', 'K'];

// A whole locked page is blurred/dimmed EXCEPT one sharp teaser card poking
// through on top — the blurred layer is decorative (a few bars standing in
// for "hidden content" like a leaderboard), never real data, so it can't
// misrepresent something that doesn't exist yet (Endless/Levels) or isn't
// wired up yet (Daily Challenge's real leaderboard — see note in refresh
// step). Swipe is never blocked here; only the mode's own entry point is.
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
  // highestUnlockedTier is the tier currently unlocked/in-progress, so the
  // number of tiers already fully CLEARED is its index in TIER_ORDER
  // (0 while still on Easy, up to 3 once Boss is unlocked but not yet cleared).
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

// ─── Style helpers (ported from ChallengeCategories.ts) ────────────────────

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
