import type { LadderEntry, SquadEntry, TierRunMeta, ChallengerSnapshot, RankOvertake } from '../shared/types';

/**
 * Everything that differs between "standalone site" and "portal build"
 * (Poki, CrazyGames, etc.) lives behind this interface. Scenes and game
 * logic only ever talk to `platform`, never to Supabase or an ad SDK
 * directly — swapping the adapter is the only change needed to retarget
 * a portal.
 */
export interface PlatformAdapter {
  readonly kind: 'standalone' | 'poki' | 'crazygames';

  // ── Ads ──────────────────────────────────────────────────────────────
  showRewardedAd(): Promise<boolean>;
  showInterstitialAd(): Promise<void>;
  notifyGameplayStart(): void;
  notifyGameplayStop(): void;

  // ── Leaderboard ──────────────────────────────────────────────────────
  fetchLadder(limit?: number): Promise<LadderEntry[]>;
  /** Mutual list: people this user invited, plus whoever invited this user. */
  fetchSquad(userId: string, invitedByUserId?: string | null, limit?: number): Promise<SquadEntry[]>;
  submitTierRun(meta: TierRunMeta): Promise<LadderEntry[]>;
  /** Look up a challenger by their invite code, for the Challenge Flow landing screen. */
  fetchChallengerByInviteCode(inviteCode: string): Promise<ChallengerSnapshot | null>;

  // ── Rank overtake notifications ────────────────────────────────────────
  fetchUnseenOvertakes(userId: string): Promise<RankOvertake[]>;
  markOvertakesSeen(userId: string): Promise<void>;

  // ── Save data ────────────────────────────────────────────────────────
  saveProgress(userId: string, key: string, value: unknown): Promise<void>;
  loadProgress<T>(userId: string, key: string): Promise<T | null>;

  // ── Quit/retry gating (free quits then rewarded-ad unlock) ────────────
  getFreeQuitsRemaining(userId: string): number;
  consumeFreeQuit(userId: string): void;
  hasUnlimitedQuitRetry(userId: string): boolean;
  grantUnlimitedQuitRetry(userId: string): void;
}

export function lsKey(userId: string, key: string): string {
  return `dd_${userId}_${key}`;
}
