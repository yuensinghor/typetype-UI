import Phaser from 'phaser';
import { platform } from '../lib/standaloneAdapter';
import { getIdentity } from '../game';
import { buildInviteLink } from '../lib/identity';
import { AudioManager } from '../lib/audio';
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
    this.audio = data.audio ?? new AudioManager();
  }

  create() {
    injectGlobalStyles();
    const shell = document.createElement('div');
    shell.id = 'gameover-ui';
    shell.className = 'dd-shell';
    shell.innerHTML = `<div class="dd-frame dd-scroll" id="gameover-frame"></div>`;
    document.getElementById('game-container')?.appendChild(shell);
    this.containerEl = shell.querySelector('#gameover-frame') as HTMLDivElement;

    if (this.sceneData.snapshot) {
      this.buildClearedUI(this.sceneData.snapshot);
      this.audio.playVictory();
      this.submitAndRefresh(this.sceneData.snapshot);
    } else {
      this.buildNoClearUI();
      this.submitPartialAndRefresh();
    }

    this.persistUnlockProgress();
    this.maybeOfferInstallOnFirstPlay();
  }

  shutdown() {
    this.containerEl?.closest('.dd-shell')?.remove();
  }

  private persistUnlockProgress() {
    const identity = getIdentity();
    if (!identity) return;

    const { snapshot, unlockedTierReached, badgesEarned, hasLimitBreakAward } = this.sceneData;

    // Clearing a tier unlocks the NEXT one. A failed/incomplete run only
    // ever re-confirms the tier already unlocked (mergeHighestUnlockedTier
    // is a no-op in that case since it never regresses).
    const unlockTarget: Tier = snapshot ? (nextTierOf(snapshot.tier) ?? snapshot.tier) : unlockedTierReached;

    const savedTier: Tier = this.game.registry.get('highestUnlockedTier') ?? 'easy';
    const newHighest = mergeHighestUnlockedTier(savedTier, unlockTarget);
    const savedBadges = this.game.registry.get('tierBadges') ?? {};
    const mergedBadges = { ...savedBadges };
    badgesEarned.forEach(t => { mergedBadges[t] = true; });
    const savedAward = this.game.registry.get('hasLimitBreakAward') ?? false;
    const mergedAward = savedAward || hasLimitBreakAward;

    // "All 4 tiers cleared" signal for the day-counter unlock chain
    // (Daily Challenge / Endless / Levels). snapshot only exists when a
    // tier's basic 5 stages were just cleared with 100% accuracy, so a
    // snapshot for 'boss' specifically means Boss's basic stages are
    // cleared — and since Boss can't be reached without clearing Easy,
    // Medium, and Hard first, that's the exact moment all 4 are done.
    // Never regresses: once true, stays true.
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

  // ── Install prompt: first-ever completed run only ──────────────────────

  /**
   * Shown at most once per player, ever — win or lose, whichever run
   * happens to be their first. Not tied to clearing a tier: the moment
   * someone finishes their very first full run (5 rounds) is when they've
   * seen enough of the game to judge whether they want it installed, and
   * we don't want to nag them again on every future GameOver screen.
   */
  private maybeOfferInstallOnFirstPlay() {
    if (hasSeenInstallPrompt()) return;
    markInstallPromptSeen();
    if (!canOfferInstall()) return;

    // Small delay so it doesn't collide with the victory sound/entrance
    // animation — let the player register their result first.
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

  // ── UI: genuine level clear ───────────────────────────────────────────

  private buildClearedUI(snapshot: ClearedTierSnapshot) {
    const c = theme.color;
    const { badgesEarned, hasLimitBreakAward } = this.sceneData;
    const avgTime = snapshot.totalTimeMs / 5 / 1000;

    this.containerEl.style.cssText += `padding:20px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:14px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <h1 style="font-family:${theme.font.display};font-size:20px;font-weight:800;margin:0;">TypeType</h1>
        ${label(hasLimitBreakAward ? 'Limit Break Cleared' : `Level ${TIER_NUMBER[snapshot.tier]} Cleared`, hasLimitBreakAward ? c.success : c.accentBright)}
      </div>

      <div style="${panel('padding:20px 18px;')}display:flex;flex-direction:column;gap:14px;text-align:center;">
        <div style="font-family:${theme.font.display};font-size:15px;font-weight:700;color:${c.textSecondary};">
          Nice work!
        </div>
        <div style="font-family:${theme.font.display};font-size:30px;font-weight:800;color:${c.textPrimary};">
          ${TIER_LABELS[snapshot.tier]}${badgesEarned.size ? ' · 🏅' : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
          ${statCard('Score', String(snapshot.score), c.textPrimary)}
          ${statCard('Avg Time', `${avgTime.toFixed(2)}s`, c.accentBright)}
          ${statCard('Accuracy', '100%', c.success)}
        </div>
      </div>

      ${hasLimitBreakAward ? `
        <div style="text-align:center;padding:12px 16px;${panel('')}color:${c.success};font-size:12px;font-weight:700;">
          ⚡ Special name styling unlocked on the leaderboard
        </div>` : ''}

      <div>
        <div style="margin-bottom:8px;">${label('Leaderboard', c.textSecondary)}</div>
        <div id="lb-card" style="${panel('padding:14px;min-height:100px;')}">
          ${spinner('Submitting your score…')}
        </div>
      </div>

      ${secondaryButton('📤 Share This Result', 'btn-share')}

      ${nextTierOf(snapshot.tier) ? primaryButton(`Next Level: ${TIER_LABELS[nextTierOf(snapshot.tier)!]}`, 'btn-next-level') : ''}

      ${this.footerHTML()}
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

  // ── UI: run ended before clearing anything ───────────────────────────

  private buildNoClearUI() {
    const c = theme.color;
    const { roundsCorrect, roundsTotal, attemptScore } = this.sceneData;
    const missed = roundsTotal - roundsCorrect;

    this.containerEl.style.cssText += `padding:20px 16px calc(16px + env(safe-area-inset-bottom,0px));
      display:flex;flex-direction:column;gap:14px;font-family:${theme.font.body};color:${c.textPrimary};`;

    this.containerEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <h1 style="font-family:${theme.font.display};font-size:20px;font-weight:800;margin:0;">TypeType</h1>
        ${label('No Clear This Time', c.danger)}
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
  }

  private footerHTML(showInvite = true): string {
    const c = theme.color;
    return `
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

    this.containerEl.querySelector('#btn-lobby')?.addEventListener('click', () => {
      this.audio.playClick();
      this.scene.start('Home');
    });

    this.containerEl.querySelector('#btn-replay')?.addEventListener('click', () => {
      this.audio.playClick();
      // Replay the exact level this run started with — not the player's
      // permanent highest unlock. This was the bug: Easy attempts bouncing
      // to Medium on retry because this read the wrong source.
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

  // ── Submission ─────────────────────────────────────────────────────

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

    this.refreshLeaderboard(entries);
  }

  /** Imperfect-but-completed runs still submit — score alone (0 for missed
   *  rounds) keeps them ranked below any genuine clear, no hard gate needed. */
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

    card.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;">
        ${entries.map((e, i) => lbRow(e, i, username)).join('')}
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
  const rankColor = i === 0 ? c.warning : i === 1 ? c.textSecondary : i === 2 ? '#B5824A' : c.textMuted;

  let badgeHtml = '';
  if (e.clearedHiddenBonusTiers?.length) {
    badgeHtml = `<span style="font-size:10px;font-weight:700;color:${c.warning};margin-right:5px;">🏅×${e.clearedHiddenBonusTiers.length}</span>`;
  }
  if (e.hasLimitBreakAward) {
    badgeHtml += `<span style="font-size:10px;font-weight:700;color:${c.success};margin-right:5px;">⚡</span>`;
  }

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:10px;font-size:12px;
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
        <span style="color:${c.textPrimary};font-weight:700;font-family:${theme.font.mono};">${(e.bestTotalTimeMs / 1000).toFixed(3)}s</span>
        <span style="color:${c.textMuted};font-size:10px;">(${e.score}pts)</span>
      </div>
    </div>`;
}
