import Phaser from 'phaser';
import { phaserGame } from '../game';
import { platform } from '../lib/standaloneAdapter';
import { isSupabaseConfigured, supabaseConfigError } from '../lib/supabaseClient';
import { floatingBackgroundHTML } from '../lib/floatingNumbers';
import { recordLoginDayIfNeeded } from '../lib/loginDay';
import {
  resolveIdentity,
  signInWithGoogle,
  hasGuestNickname,
  getOrCreateGuestIdentity,
  consumePendingInviteCode,
  hasSeenChallenge,
  hasExistingSession,
} from '../lib/identity';
import { theme, primaryButton, secondaryButton, logoTitle } from '../lib/theme';
import { injectGlobalStyles } from '../lib/globalStyles';
import type { Tier } from '../shared/types';

interface ChallengeContext {
  headline: string;
  subline: string;
}

interface PreloaderData {
  challengeContext?: ChallengeContext;
}

// The three decorative "1 2 3" keys under the logo, echoing the reference
// hero — purely decorative, ties the landing screen to the game's core
// number-typing identity before any real UI shows up.
const HERO_KEY_NUMBERS = ['1', '2', '3'];

export class Preloader extends Phaser.Scene {
  private containerEl!: HTMLDivElement;
  private challengeContext?: ChallengeContext;

  constructor() {
    super('Preloader');
  }

  init(data?: PreloaderData) {
    this.challengeContext = data?.challengeContext;
  }

  create() {
    injectGlobalStyles();
    const el = document.createElement('div');
    el.id = 'preloader-ui';
    el.className = 'dd-shell';
    el.innerHTML = `<div class="dd-frame" id="preloader-frame" style="align-items:center;justify-content:center;
      display:flex;flex-direction:column;gap:16px;padding:24px;font-family:${theme.font.body};position:relative;"></div>`;
    document.getElementById('game-container')?.appendChild(el);
    this.containerEl = el.querySelector('#preloader-frame') as HTMLDivElement;

    this.showSpinner('Loading…');
    this.routeOrBoot();
  }

  /** Detours first-time anonymous visitors on a valid, not-yet-seen invite
   *  link into the Challenge Flow landing screen before normal boot runs. */
  private async routeOrBoot() {
    const pendingCode = consumePendingInviteCode();
    if (pendingCode && !hasSeenChallenge()) {
      const returning = await hasExistingSession();
      if (!returning) {
        this.containerEl?.closest('.dd-shell')?.remove();
        this.scene.start('ChallengeLanding');
        return;
      }
    }
    this.bootWithTimeout();
  }

  private bootWithTimeout() {
    const TIMEOUT_MS = 10000;
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.showError('This is taking longer than expected.', 'Timed out waiting for the server to respond.');
    }, TIMEOUT_MS);

    this.boot()
      .then(() => { settled = true; clearTimeout(timeoutId); })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        console.error('[DigitDash] Boot failed:', err);
        this.showError('Something went wrong loading the game.', err?.message ?? String(err));
      });
  }

  private showError(headline: string, detail: string) {
    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="width:100%;max-width:340px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;">
        ${logoTitle('TypeType', 22, false)}
        <div style="font-family:${theme.font.display};font-size:17px;font-weight:700;color:${c.textPrimary};">
          ${headline}
        </div>
        <div style="font-family:${theme.font.mono};font-size:11px;color:${c.textMuted};background:${c.bgElevated};
          border:1px solid ${c.border};border-radius:10px;padding:12px 14px;text-align:left;width:100%;
          word-break:break-word;">
          ${detail}
        </div>
        ${primaryButton('Retry', 'btn-retry')}
      </div>
    `;
    this.containerEl.querySelector('#btn-retry')?.addEventListener('click', () => {
      this.showSpinner('Loading…');
      this.bootWithTimeout();
    });
  }

  private showSpinner(msg: string) {
    const c = theme.color;
    this.containerEl.innerHTML = `
      <div style="width:28px;height:28px;border:3px solid ${c.border};
        border-top:3px solid ${c.accent};border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span style="font-family:${theme.font.body};font-size:13px;color:${c.textSecondary};">${msg}</span>
    `;
  }

  private async boot() {
    if (!isSupabaseConfigured) {
      throw new Error(supabaseConfigError ?? 'Server is not configured.');
    }

    const identity = await resolveIdentity();

    if (identity.isGuest && !hasGuestNickname()) {
      this.showLoginChoice();
      return;
    }

    await this.finishBoot(identity.userId);
  }

  private showLoginChoice() {
    const c = theme.color;
    const ctx = this.challengeContext;

    const introHtml = ctx
      ? `
        <div style="width:100%;background:${c.bgCard};border:1px solid ${c.border};border-radius:16px;
          padding:16px 16px;text-align:center;box-shadow:0 2px 16px rgba(139,126,116,0.1);
          animation:ddSpringIn 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.3s both;">
          <div style="font-family:${theme.font.display};font-size:15px;font-weight:800;color:${c.accent};margin-bottom:6px;line-height:1.4;">
            ${ctx.headline}
          </div>
          <div style="font-family:${theme.font.body};font-size:12.5px;color:${c.textSecondary};line-height:1.6;">
            ${ctx.subline}
          </div>
        </div>
      `
      : `
        <div style="width:100%;background:${c.bgCard};border:1px solid ${c.border};border-radius:16px;
          padding:16px 16px;text-align:left;box-shadow:0 2px 16px rgba(139,126,116,0.1);
          animation:ddSpringIn 0.45s cubic-bezier(0.34,1.56,0.64,1) 0.3s both;">
          <div style="font-family:${theme.font.display};font-size:12px;font-weight:700;color:${c.accent};
            letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">How to play</div>
          <ol style="margin:0;padding-left:18px;font-family:${theme.font.body};font-size:12.5px;color:${c.textSecondary};
            line-height:1.7;">
            <li>An equation like <b style="color:${c.textPrimary};">47 + 23</b> appears on screen.</li>
            <li>Type it back exactly, using the keypad — as fast as you can.</li>
            <li>Spaces don't count, so just focus on the digits and symbols.</li>
            <li>Clear all 5 rounds with no mistakes to beat the level.</li>
          </ol>
        </div>
      `;

    this.containerEl.innerHTML = `
      ${floatingBackgroundHTML(0)}

      <div style="position:relative;z-index:1;width:100%;max-width:340px;display:flex;flex-direction:column;
        align-items:center;gap:18px;text-align:center;">

        ${logoTitle('TypeType', 30)}

        <div style="display:flex;align-items:center;justify-content:center;gap:10px;">
          ${HERO_KEY_NUMBERS.map((n, i) => heroKey(n, i)).join('')}
        </div>

        ${introHtml}

        <div style="width:100%;display:flex;flex-direction:column;gap:14px;
          animation:ddSpringIn 0.4s ease-out 0.55s both;">
          ${primaryButton('Continue with Google', 'btn-google')}

          <div style="display:flex;align-items:center;gap:10px;width:100%;">
            <div style="flex:1;height:1px;background:${c.border};"></div>
            <span style="font-size:11px;color:${c.textMuted};">or</span>
            <div style="flex:1;height:1px;background:${c.border};"></div>
          </div>

          <input id="nickname-input" maxlength="16" placeholder="Pick a nickname" style="
            width:100%;padding:14px 16px;background:${c.bgCard};border:1px solid ${c.border};
            border-radius:12px;color:${c.textPrimary};font-family:${theme.font.body};font-size:14px;box-sizing:border-box;
            text-align:center;" />

          ${secondaryButton('Play as Guest', 'btn-guest')}
        </div>
      </div>
    `;

    this.containerEl.querySelector('#btn-google')?.addEventListener('click', async () => {
      try {
        await signInWithGoogle();
      } catch (err) {
        console.error('[DigitDash] Google sign-in failed', err);
      }
    });

    this.containerEl.querySelector('#btn-guest')?.addEventListener('click', async () => {
      const input = this.containerEl.querySelector('#nickname-input') as HTMLInputElement;
      const nickname = input?.value.trim();
      if (!nickname) {
        input?.focus();
        return;
      }
      const identity = getOrCreateGuestIdentity(nickname);
      this.showSpinner('Loading…');
      await this.finishBoot(identity.userId);
    });
  }

  private async finishBoot(userId: string) {
    this.showSpinner('Loading…');
    try {
      const identity = await resolveIdentity();
      phaserGame.registry.set('identity', identity);
      if (!identity.isGuest) {
        await platform.syncQuitRetryUnlock(identity.userId);
        await recordLoginDayIfNeeded(identity.userId);
      }

      const saved = await platform.loadProgress<{
        highestUnlockedTier: Tier;
        badges: Partial<Record<Tier, boolean>>;
        hasLimitBreakAward: boolean;
        clearedBossBasic: boolean;
      }>(identity.userId, 'ladder_progress');

      phaserGame.registry.set('highestUnlockedTier', saved?.highestUnlockedTier ?? 'easy');
      phaserGame.registry.set('tierBadges', saved?.badges ?? {});
      phaserGame.registry.set('hasLimitBreakAward', saved?.hasLimitBreakAward ?? false);
      phaserGame.registry.set('clearedBossBasic', saved?.clearedBossBasic ?? false);

      const ladder = await platform.fetchLadder();
      phaserGame.registry.set('ladder', ladder);

      this.containerEl.closest('.dd-shell')?.remove();
      this.scene.start('Home');
    } catch (err: any) {
      console.error('[DigitDash] finishBoot failed:', err);
      this.showError('Something went wrong loading the game.', err?.message ?? String(err));
    }
  }
}

// ─── Decorative hero number key (the "1 2 3" row under the logo) ─────────

function heroKey(n: string, index: number): string {
  const [bg, border] = theme.palette.keyGradients[index % theme.palette.keyGradients.length];
  const delay = (0.5 + index * 0.1).toFixed(2);
  return `
    <div style="
      width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;
      position:relative;overflow:hidden;
      background:linear-gradient(135deg, ${bg}, ${border});
      border:2.5px solid rgba(255,255,255,0.6);
      box-shadow:0 4px 16px ${border}33, 0 1px 4px rgba(139,126,116,0.06);
      animation:ddSpringIn 0.4s cubic-bezier(0.34,1.56,0.64,1) ${delay}s both;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.5) 0%, transparent 55%);"></div>
      <span style="position:relative;font-family:${theme.font.display};font-size:24px;font-weight:700;color:#fff;
        text-shadow:0 1px 4px rgba(0,0,0,0.08);">${n}</span>
    </div>`;
}
