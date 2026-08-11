import { supabase } from '../lib/supabaseClient';
import Phaser from 'phaser';
import { platform } from '../lib/standaloneAdapter';
import { getIdentity } from '../game';
import { buildInviteLink, signInWithGoogle } from '../lib/identity';
import { AudioManager, audioManager } from '../lib/audio';
import { soundToggleHTML, bindSoundToggle } from '../lib/soundToggle';
import { mergeHighestUnlockedTier } from '../lib/ladderEngine';
import type { ClearedTierSnapshot } from '../lib/ladderEngine';
import { theme, panel, label, primaryButton, secondaryButton } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import { renderShareCard, shareOrDownload, type ShareCardData } from '../lib/shareCard';
import { renderInstallButton } from '../lib/installUI';
import { canOfferInstall, hasSeenInstallPrompt, markInstallPromptSeen } from '../lib/installPrompt';
import type { LadderEntry, Tier } from '../shared/types';
import { TIER_ORDER } from '../shared/types';

function nextTierOf(tier: Tier): Tier | null {
  const idx = TIER_ORDER.indexOf(tier);
  return idx >= 0 && idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null;
}

interface SceneData {
  snapshot: ClearedTierSnapshot | null;
  unlockedTierReached: Tier;
  startTier: Tier;
  username: string;
  audio: AudioManager;
  attemptAccuracy: number;
  roundsCorrect: number;
  roundsTotal: number;
  attemptScore: number;
  attemptTotalTimeMs: number;
  badgesEarned: Set<Tier>;
  hasLimitBreakAward: boolean;
}

const TIER_LABELS: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', boss: 'Boss' };
const TIER_NUMBER: Record<Tier, number> = { easy: 1, medium: 2, hard: 3, boss: 4 };

export class GameOver extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private audio!: AudioManager;
  private sceneData!: SceneData;

  constructor() {
    super('GameOver');
  }

  init(data: SceneData) {
    this.sceneData = data;
    this.audio = data.audio ?? audioManager;
  }

  create() {
    this.events.once('shutdown', this.shutdown, this);
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'gameover-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame dd-scroll" id="gameover-frame"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#gameover-frame') as HTMLDivElement;
    audioManager.startMenuMusic();

    if (this.sceneData.snapshot) {
      this.buildClearedUI(this.sceneData.snapshot);
      this.audio.playVictory();
      this.submitAndRefresh(this.sceneData.snapshot);
    } else {
      this.buildNoClearUI();
      this.submitPartialAndRefresh();
    }

    this.persistUnlockProgress();
  }

  shutdown() {
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private async checkAndShowAchievements() {
    const identity = getIdentity();
    if (!identity || identity.isGuest) return;

    try {
      const { data } = await supabase.rpc('sync_user_badges', { p_user_id: identity.userId });
      if (!data) return;

      const earned = data.map((b: any) => b.badge_id);
      const oldBadgesStr = localStorage.getItem('dd_earned_badges') || '[]';
      const oldBadges: string[] = JSON.parse(oldBadgesStr);
      
      const newOnes = earned.filter((b: string) => !oldBadges.includes(b));
      localStorage.setItem('dd_earned_badges', JSON.stringify(earned));

      if (newOnes.length > 0) {
        this.showAchievementPopup(newOnes[0]);
      }
    } catch (err) {
      console.error('[TypeType] Ach check failed', err);
    }
  }

  private showAchievementPopup(badgeId: string) {
    const c = theme.color;
    const popup = document.createElement('div');
    popup.id = 'ach-popup';
    popup.style.cssText = `
      position: fixed; top: 20%; left: 50%; transform: translateX(-50%); 
      background: ${c.bgCard}; padding: 20px 30px; border-radius: 12px; 
      box-shadow: 0 4px 20px rgba(0,0,0,0.5); z-index: 2000; text-align: center; 
      animation: popIn 0.3s; border: 2px solid ${c.accent}; width: 220px; box-sizing: border-box;
    `;
    
    popup.innerHTML = `
      <div style="font-size: 11px; font-weight: 800; color: ${c.accentBright}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Achievement Unlocked!</div>
      <img src="/images/${badgeId}.png" style="width: 60px; height: 60px; object-fit: contain; margin-bottom: 8px;" alt="${badgeId}" />
      <div style="font-family: ${theme.font.display}; font-size: 16px; font-weight: 800; color: ${c.textPrimary}; text-transform: capitalize;">${badgeId}</div>
    `;
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
      popup.style.transition = 'opacity 0.5s, transform 0.5s';
      popup.style.opacity = '0';
      popup.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => popup.remove(), 500);
    }, 3500);
  }

  private persistUnlockProgress() {
    const identity = getIdentity();
    if (!identity) return;

    const { snapshot, unlockedTierReached, badgesEarned, hasLimitBreakAward } = this.sceneData;

    const unlockTarget: Tier = snapshot ? (nextTierOf(snapshot.tier) ?? snapshot.tier) : unlockedTierReached;

    const savedTier: Tier = this.game.registry.get('highestUnlockedTier') ?? 'easy';
    const newHighest = mergeHighestUnlockedTier(savedTier, unlockTarget);
    const savedBadges = this.game.registry.get('tierBadges') ?? {};
    const mergedBadges = { ...savedBadges };
    badgesEarned.forEach(t => { mergedBadges[t] = true; });
    const savedAward = this.game.registry.get('hasLimitBreakAward') ?? false;
    const mergedAward = savedAward || hasLimitBreakAward;

    const savedClearedBossBasic = this.game.registry.get('clearedBossBasic') ?? false;
    const mergedClearedBossBasic = savedClearedBossBasic || snapshot?.tier === 'boss';

    this.game.registry.set('highestUnlockedTier', newHighest);
    this.game.registry.set('tierBadges', mergedBadges);
    this.game.registry.set('hasLimitBreakAward', mergedAward);
    this.game.registry.set('clearedBossBasic', mergedClearedBossBasic);

    platform.saveProgress(identity.userId, 'ladder_progress', {
      highestUnlockedTier: newHighest,
      badges: mergedBadges,
      hasLimitBreakAward: mergedAward,
      clearedBossBasic: mergedClearedBossBasic,
    });
  }

  private maybeOfferInstallOnFirstPlay() {
    if (hasSeenInstallPrompt()) return;
    markInstallPromptSeen();
    if (!canOfferInstall()) return;

    this.time.delayedCall(700, () => this.showFirstPlayInstallModal());
  }

  private showFirstPlayInstallModal() {
    const c = theme.color;
    const overlay = document.createElement('div');
    overlay.id = 'first-play-install-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:1500;background:rgba(45,52,54,0.55);backdrop-filter:blur(4px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;
      font-family:${theme.font.body};animation:fadeIn 0.15s;
    `;

    overlay.innerHTML = `
      <div style="width:100%;max-width:320px;${panel('padding:24px 20px;')}display:flex;flex-direction:column;
        align-items:center;gap:14px;text-align:center;animation:popIn 0.18s;">
        <div style="font-family:${theme.font.display};font-size:17px;font-weight:800;color:${c.textPrimary};">
          Enjoying TypeType?
        </div>
        <p style="font-size:12.5px;color:${c.textSecondary};line-height:1.8;margin:0;">
          Install it on your home screen for one-tap access next time — no app store, no download size.
        </p>
        <div id="install-btn-slot" style="width:100%;"></div>
        <button id="btn-install-later" style="background:none;border:none;color:${c.textMuted};
          font-family:${theme.font.body};font-size:12px;font-weight:600;cursor:pointer;padding:4px;">
          Maybe later
        </button>
      </div>
    `;

    this.containerEl.appendChild(overlay);

    const slot = overlay.querySelector('#install-btn-slot') as HTMLElement;
    renderInstallButton(slot, {
      id: 'btn-first-play-install',
      label: '📲 Install App',
      variant: 'primary',
      onHandled: () => overlay.remove(),
    });

    overlay.querySelector('#btn-install-later')?.addEventListener('click', () => {
      this.audio.playClick();
      overlay.remove();
    });
  }

  private buildClearedUI(snapshot: ClearedTierSnapshot) {
    const c = theme.color;
    const { badgesEarned, hasLimitBreakAward } = this.sceneData;
    const avgTime = snapshot.totalTimeMs / 5 / 1000;
    const isGuest = !getIdentity() || getIdentity()?.isGuest;

    this.containerEl.style.cssText += `position: relative; overflow: hidden; padding: 20px 16px calc(16px + env(safe-area-inset-bottom,0px)); display:flex; flex-direction:column; gap:12px; font-family:${theme.font.body}; color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <!-- Mascot Character (Top Left) -->
      <img src="/images/mascot.png" style="position: absolute; top: 0; left: 50px; width: 90px; height: auto; z-index: 20; pointer-events: none;" />

      <!-- Header -->
      <div style="text-align: center; flex-shrink: 0; margin-top: 20px; padding-left: 60px;">
        <div style="font-family: ${theme.font.display}; font-size: 26px; font-weight: 800; color: ${theme.palette.coral}; text-shadow: 2px 2px 0px rgba(0,0,0,0.1); line-height: 1.1;">
          Level ${TIER_LABELS[snapshot.tier]} Cleared!
        </div>
      </div>

      <!-- Stats Row (CSS 3D Style) -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; flex-shrink: 0; margin-top: 4px;">
        ${statBlock('icon_score.png', 'SCORE', String(snapshot.score))}
        ${statBlock('icon_time.png', 'AVG TIME', `${avgTime.toFixed(2)}s`)}
        ${statBlock('icon_accuracy.png', 'ACCURACY', '100%')}
      </div>

      <!-- Leaderboard Panel (CSS Background Image) -->
      <div style="flex: 1; min-height: 200px; margin-bottom: 1px; border-radius: 12px; background-image: url('/images/panel_leaderboard.png'); background-size: 100% 100%; background-repeat: no-repeat; background-position: center; display: flex; flex-direction: column;">
        <div style="padding: 140px 16px 24px 16px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
            <div id="lb-card" style="flex: 1; overflow-y: hidden; display: flex; flex-direction: column; justify-content: center; gap: 0px;">
            ${spinner('Submitting your score…')}
          </div>
        </div>
      </div>

      <!-- Buttons -->
      <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;">
        ${isGuest ? `
          <button id="btn-guest-google-signin" style="background: none; border: none; padding: 0; cursor: pointer; display: block;">
            <img src="/images/btn_google_signin.png" style="width: 100%; height: auto; display: block;" />
          </button>
        ` : ''}
        
        <!-- Share & Invite Side-by-Side -->
        <div style="display: flex; gap: 8px;">
          <button id="btn-share" style="background: none; border: none; padding: 0; cursor: pointer; display: block; flex: 1;">
            <img src="/images/btn_share.png" style="width: 100%; height: auto; display: block;" />
          </button>
          <button id="btn-invite" style="background: none; border: none; padding: 0; cursor: pointer; display: block; flex: 1;">
            <img src="/images/btn_invite1.png" style="width: 100%; height: auto; display: block;" />
          </button>
        </div>

        <!-- Menu & Play Again Side-by-Side (Moved Up) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button id="btn-lobby" style="background: none; border: none; padding: 0; cursor: pointer; display: block;">
            <img src="/images/btn_menu.png" style="width: 100%; height: auto; display: block;" />
          </button>
          <button id="btn-replay" style="background: none; border: none; padding: 0; cursor: pointer; display: block;">
            <img src="/images/btn_play_again.png" style="width: 100%; height: auto; display: block;" />
          </button>
        </div>

        ${nextTierOf(snapshot.tier) ? `
        <!-- Next Level (Moved to Bottom & Made Slimmer) -->
        <button id="btn-next-level" style="background: none; border: none; padding: 0; cursor: pointer; position: relative; display: block; width: 100%; height: 44px;">
          <img src="/images/btn_next_level_bg.png" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: fill; border-radius: 8px;" />
          <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 2; font-family: ${theme.font.display}; font-size: 20px; font-weight: 800; color: #fff; text-shadow: 1px 1px 2px rgba(0,0,0,0.5); white-space: nowrap;">
            NEXT LEVEL: ${TIER_LABELS[nextTierOf(snapshot.tier)!].toUpperCase()}
          </span>
        </button>
        ` : ''}
      </div>
    `;

    this.bindFooterEvents(this.sceneData.unlockedTierReached);

    this.containerEl.querySelector('#btn-share')?.addEventListener('click', () => {
      this.audio.playClick();
      this.openSharePreview(snapshot);
    });

    const next = nextTierOf(snapshot.tier);
    if (next) {
      this.containerEl.querySelector('#btn-next-level')?.addEventListener('click', () => {
        this.audio.playClick();
        this.scene.start('Game', { startTier: next, audio: this.audio });
      });
    }
  }

  private async openSharePreview(snapshot: ClearedTierSnapshot) {
    const c = theme.color;
    const identity = getIdentity();
    const data: ShareCardData = {
      tier: snapshot.tier,
      username: identity?.username ?? this.sceneData.username,
      score: snapshot.score,
      avgTime: snapshot.totalTimeMs / 5 / 1000,
      clearedHiddenBonus: snapshot.clearedHiddenBonus,
      hasLimitBreakAward: this.sceneData.hasLimitBreakAward,
    };

    const overlay = document.createElement('div');
    overlay.id = 'share-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:1000;background:rgba(11,14,20,0.94);backdrop-filter:blur(4px);
      display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;
      font-family:${theme.font.body};
    `;
    overlay.innerHTML = `
      <div style="width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:14px;">
        <div id="share-preview-wrap" style="width:100%;aspect-ratio:1080/1350;border-radius:16px;overflow:hidden;
          border:1px solid ${c.border};display:flex;align-items:center;justify-content:center;background:${c.bgCard};">
          <div style="width:22px;height:22px;border:2px solid ${c.border};border-top:2px solid ${c.accent};
            border-radius:50%;animation:spin 0.9s linear infinite;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;">
          <button id="btn-share-close" style="padding:13px 0;background:transparent;border:1px solid ${c.borderStrong};
            border-radius:10px;color:${c.textPrimary};font-family:${theme.font.display};font-weight:700;font-size:13px;cursor:pointer;">Close</button>
          <button id="btn-share-go" style="padding:13px 0;background:${c.accent};border:none;border-radius:10px;
            color:#fff;font-family:${theme.font.display};font-weight:700;font-size:13px;cursor:pointer;" disabled>Preparing…</button>
        </div>
      </div>
    `;
    this.containerEl.appendChild(overlay);

    overlay.querySelector('#btn-share-close')?.addEventListener('click', () => overlay.remove());

    try {
      const canvas = await renderShareCard(data);
      const wrap = overlay.querySelector('#share-preview-wrap') as HTMLElement;
      const img = new Image();
      img.src = canvas.toDataURL('image/png');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      wrap.innerHTML = '';
      wrap.appendChild(img);

      const goBtn = overlay.querySelector('#btn-share-go') as HTMLButtonElement;
      goBtn.disabled = false;
      goBtn.textContent = typeof navigator.share === 'function' ? 'Share' : 'Download';
      goBtn.addEventListener('click', async () => {
        this.audio.playClick();
        goBtn.disabled = true;
        goBtn.textContent = 'Working…';
        const result = await shareOrDownload(canvas, data);
        if (result === 'failed') {
          goBtn.textContent = 'Failed — Try Again';
          goBtn.disabled = false;
        } else {
          overlay.remove();
        }
      });
    } catch (err) {
      console.error('[DigitDash] Share card render failed:', err);
      const wrap = overlay.querySelector('#share-preview-wrap') as HTMLElement;
      wrap.innerHTML = `<div style="color:${c.textMuted};font-size:12px;text-align:center;padding:20px;">
        Couldn't create the share image. Try again in a moment.</div>`;
    }
  }

  private buildNoClearUI() {
    const c = theme.color;
    const { roundsCorrect, roundsTotal, attemptScore } = this.sceneData;
    const missed = roundsTotal - roundsCorrect;

    this.containerEl.style.cssText += `padding:20px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:14px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <h1 style="font-family:${theme.font.display};font-size:20px;font-weight:800;margin:0;">TypeType</h1>
        <div style="display:flex;align-items:center;gap:10px;">
          ${label('No Clear This Time', c.danger)}
          ${soundToggleHTML('btn-sound-toggle', true)}
        </div>
      </div>

      <div style="${panel('padding:24px 20px;')}display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;">
        <div style="font-family:${theme.font.display};font-size:18px;font-weight:800;color:${c.textPrimary};">
          You played all ${roundsTotal} rounds, but missed ${missed}
        </div>
        <p style="font-size:12.5px;color:${c.textSecondary};line-height:1.8;margin:0;max-width:300px;">
          Only a clean, 100% clear unlocks the next level — but your score still counts!
          It's on the board now, just ranked below full clears.
        </p>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;width:100%;max-width:260px;">
          ${statCard('Correct', `${roundsCorrect}/${roundsTotal}`, c.textPrimary)}
          ${statCard('Score', String(attemptScore), c.accentBright)}
        </div>
      </div>

      <div>
        <div style="margin-bottom:8px;">${label('Leaderboard', c.textSecondary)}</div>
        <div id="lb-card" style="${panel('padding:14px;min-height:100px;')}">
          ${spinner('Submitting your score…')}
        </div>
      </div>

      ${this.footerHTML(false)}
    `;

    this.bindFooterEvents(this.sceneData.unlockedTierReached);
    bindSoundToggle(this.containerEl);
  }

  private footerHTML(showInvite = true): string {
    const c = theme.color;
    const identity = getIdentity();
    const isGuest = !identity || identity.isGuest;

    return `
      ${isGuest ? `
      <div style="${panel('padding:14px 16px;')}display:flex;flex-direction:column;gap:10px;text-align:center;">
        <div style="font-size:12px;color:${c.textSecondary};line-height:1.6;">
          Playing as Guest — sign in to save your progress and appear on the leaderboard for good.
        </div>
        <button id="btn-guest-google-signin" style="
          width:100%;padding:11px 0;background:${c.bgCard};border:1px solid ${c.borderStrong};
          border-radius:10px;color:${c.textPrimary};font-family:${theme.font.display};font-weight:700;
          font-size:13px;cursor:pointer;">
          Sign in with Google
        </button>
      </div>` : ''}

      ${showInvite ? `
      <button id="btn-invite" style="
        width:100%;padding:11px 0;background:transparent;border:1px dashed ${c.borderStrong};
        border-radius:12px;color:${c.textMuted};font-family:${theme.font.body};font-weight:600;font-size:12px;cursor:pointer;">
        Invite friends
      </button>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:2px;">
        ${secondaryButton('Menu', 'btn-lobby')}
        ${primaryButton('Play Again', 'btn-replay')}
      </div>

      <div style="height:8px;"></div>
    `;
  }

  private bindFooterEvents(_unlockedTierReached: Tier) {
    const identity = getIdentity();

    this.containerEl.querySelector('#btn-guest-google-signin')?.addEventListener('click', async (e) => {
      this.audio.playClick();
      const btn = e.currentTarget as HTMLButtonElement;
      btn.disabled = true;
      btn.textContent = 'Opening Google sign-in…';
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error('[DigitDash] Google sign-in failed', err);
        btn.disabled = false;
        btn.textContent = 'Sign in with Google';
      }
    });

    this.containerEl.querySelector('#btn-lobby')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('Home');
    });

    this.containerEl.querySelector('#btn-replay')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('Game', { startTier: this.sceneData.startTier, audio: this.audio });
    });

    this.containerEl.querySelector('#btn-invite')?.addEventListener('click', async () => {
      this.audio.playClick();
      if (!identity?.inviteCode) return;
      const link = buildInviteLink(identity.inviteCode);
      try {
        await navigator.clipboard.writeText(link);
        const btn = this.containerEl.querySelector('#btn-invite') as HTMLButtonElement;
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.color = theme.color.success;
        setTimeout(() => { if (btn) { btn.textContent = original; btn.style.color = theme.color.textMuted; } }, 2000);
      } catch {
        prompt('Copy your invite link:', link);
      }
    });
  }

  private async submitAndRefresh(snapshot: ClearedTierSnapshot) {
    const identity = getIdentity();
    if (!identity) return;

    const { badgesEarned } = this.sceneData;

    const entries = await platform.submitTierRun({
      userId: identity.userId,
      username: identity.username,
      tier: snapshot.tier,
      score: snapshot.score,
      totalTimeMs: snapshot.totalTimeMs,
      averageSpeed: snapshot.totalTimeMs / 5 / 1000,
      accuracy: 1,
      clearedBasic: true,
      beatBenchmark: badgesEarned.has(snapshot.tier),
      clearedHiddenBonus: snapshot.clearedHiddenBonus,
      reachedLimitBreak: this.sceneData.hasLimitBreakAward,
      clearedLimitBreak: this.sceneData.hasLimitBreakAward,
      createdAt: new Date().toISOString(),
    });

    await this.checkAndShowAchievements();

    this.refreshLeaderboard(entries);
  }

  private async submitPartialAndRefresh() {
    const identity = getIdentity();
    if (!identity) return;

    const { startTier, roundsCorrect, roundsTotal, attemptScore, attemptTotalTimeMs } = this.sceneData;

    const entries = await platform.submitTierRun({
      userId: identity.userId,
      username: identity.username,
      tier: startTier,
      score: attemptScore,
      totalTimeMs: attemptTotalTimeMs,
      averageSpeed: roundsTotal > 0 ? attemptTotalTimeMs / roundsTotal / 1000 : 0,
      accuracy: roundsTotal > 0 ? roundsCorrect / roundsTotal : 0,
      clearedBasic: false,
      beatBenchmark: false,
      clearedHiddenBonus: false,
      reachedLimitBreak: false,
      clearedLimitBreak: false,
      createdAt: new Date().toISOString(),
    });

    await this.checkAndShowAchievements();

    this.refreshLeaderboard(entries);
  }

  private refreshLeaderboard(entries: LadderEntry[]) {
    const card = this.containerEl?.querySelector('#lb-card') as HTMLElement;
    if (!card) return;
    const username = this.sceneData.username;

    if (entries.length === 0) {
      card.innerHTML = `<div style="color:${theme.color.textMuted};font-size:12px;text-align:center;padding:16px;">You're the first score on the board!</div>`;
      return;
    }

    const top6 = entries.slice(0, 10);

    card.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:6px;justify-content: flex-start; height: 100%;">
        ${top6.map((e, i) => lbRow(e, i, username)).join('')}
      </div>`;
  }
}

function statCard(labelText: string, value: string, color: string) {
  return `
    <div style="text-align:center;">
      <div style="font-size:10px;color:${theme.color.textMuted};font-weight:600;margin-bottom:5px;">${labelText}</div>
      <div style="font-family:${theme.font.display};font-size:19px;font-weight:800;color:${color};">${value}</div>
    </div>`;
}

function spinner(msg = 'Loading…') {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:80px;gap:8px;">
      <div style="width:18px;height:18px;border:2px solid ${theme.color.border};border-top:2px solid ${theme.color.accent};
        border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span style="font-size:11px;color:${theme.color.textMuted};">${msg}</span>
    </div>`;
}

function lbRow(e: LadderEntry, i: number, myUsername: string) {
  const c = theme.color;
  const isMe = e.username.toLowerCase() === myUsername.toLowerCase();
  const rankColor = i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#FFFFFF99';

  let badgeHtml = '';
  if (e.clearedHiddenBonusTiers?.length) {
    badgeHtml = `<span style="font-size:11px;font-weight:700;color:${c.warning};">🏅</span>`;
  }
  if (e.hasLimitBreakAward) {
    badgeHtml += `<span style="font-size:11px;font-weight:700;color:${c.success};">⚡</span>`;
  }

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;
                background: ${isMe ? 'rgba(255, 255, 255, 0.2)' : 'transparent'};
                border: none;
                border-radius: 14px;
                padding: 6px 14px;
                font-size: 14px;">
      
      <div style="display:flex;align-items:center;min-width:0;flex:1;gap:8px;">
        <span style="font-weight:800;color:${rankColor};width:24px;flex-shrink:0;text-align:left;">#${i + 1}</span>
        
        <div style="width: 24px; flex-shrink: 0; display: flex; align-items: center; gap: 3px;">
          ${badgeHtml}
        </div>
        
        <span style="font-weight:700;color:${e.hasLimitBreakAward ? c.success : '#FFFFFF'};
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.username}</span>
      </div>

      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;padding-left:10px;">
        <span style="color:#FFFFFF;font-weight:700;font-family:${theme.font.mono};">${(e.bestTotalTimeMs / 1000).toFixed(3)}s</span>
        <span style="color:#FFFFFF99;font-size:11px;">(${e.score}pts)</span>
      </div>
    </div>`;
}

function statBlock(icon: string, label: string, value: string) {
  return `
    <div style="display: flex; flex-direction: row; align-items: center; justify-content: center; gap: 20px; 
                background: linear-gradient(180deg, #6B4FBB 0%, #4A3485 100%); 
                padding: 10px 8px; border-radius: 12px; 
                border: 2px solid #3D2B6B; 
                box-shadow: 0 4px 0 rgba(0,0,0,0.2);">
      <img src="/images/${icon}" style="width: 28px; height: 28px; object-fit: contain; flex-shrink: 0;" />
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="font-size: 10px; font-weight: 700; color: #D1C5FF; letter-spacing: 1px;">${label}</div>
        <div style="font-family: ${theme.font.display}; font-size: 24px; font-weight: 800; color: #FFFFFF; line-height: 1;">${value}</div>
      </div>
    </div>`;
}