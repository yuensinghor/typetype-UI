import { supabase } from './supabaseClient';
import { lsKey, type PlatformAdapter } from './platformAdapter';
import type { LadderEntry, SquadEntry, TierRunMeta, Tier, ChallengerSnapshot, RankOvertake } from '../shared/types';
import { requestRewardedAd } from './googleAds';

const FREE_QUITS_ALLOWANCE = 3;

export class StandaloneAdapter implements PlatformAdapter {
  readonly kind = 'standalone' as const;

  // ── Ads ──────────────────────────────────────────────────────────────
  async showRewardedAd(): Promise<boolean> {
    return requestRewardedAd();
  }

  async showInterstitialAd(): Promise<void> {}
  notifyGameplayStart(): void {}
  notifyGameplayStop(): void {}

  // ── Leaderboard ──────────────────────────────────────────────────────
  async fetchLadder(limit = 20): Promise<LadderEntry[]> {
    try {
      const { data, error } = await supabase
        .from('ladder_leaderboard_ranked')
        .select('*')
        .order('score', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[DigitDash] fetchLadder error', error);
        return [];
      }

      return (data ?? []).map(r => ({
        userId: r.user_id,
        username: r.username,
        highestTier: r.highest_tier as Tier,
        clearedHiddenBonusTiers: (r.cleared_hidden_bonus_tiers ?? []) as Tier[],
        hasLimitBreakAward: r.has_limit_break_award,
        bestTotalTimeMs: r.best_total_time_ms,
        score: r.score,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      console.error('[DigitDash] fetchLadder threw', err);
      return [];
    }
  }

  async fetchSquad(userId: string, invitedByUserId?: string | null, limit = 50): Promise<SquadEntry[]> {
    try {
      const ids = new Set<string>();

      const { data: invitees } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('invited_by', userId)
        .limit(limit);
      (invitees ?? []).forEach(i => ids.add(i.user_id));

      // Mutual: also include whoever invited this player, if anyone.
      if (invitedByUserId) ids.add(invitedByUserId);

      if (ids.size === 0) return [];

      const { data: ladderRows } = await supabase
        .from('ladder_leaderboard')
        .select('*')
        .in('user_id', Array.from(ids));

      // Ranked the same way as the main leaderboard — by score. A friend
      // who hasn't submitted a score yet (no ladder_leaderboard row) simply
      // doesn't appear yet, same as before.
      return (ladderRows ?? [])
        .map(r => {
          const entry: SquadEntry = {
            userId: r.user_id,
            username: r.username,
            highestTier: r.highest_tier as Tier,
            clearedHiddenBonusTiers: (r.cleared_hidden_bonus_tiers ?? []) as Tier[],
            hasLimitBreakAward: r.has_limit_break_award,
            bestTotalTimeMs: r.best_total_time_ms,
            score: r.score,
            updatedAt: r.updated_at,
          };
          return entry;
        })
        .sort((a, b) => b.score - a.score);
    } catch (err) {
      console.error('[DigitDash] fetchSquad threw', err);
      return [];
    }
  }

  async submitTierRun(meta: TierRunMeta): Promise<LadderEntry[]> {
    try {
      await supabase.from('tier_runs').insert({
        user_id: meta.userId,
        tier: meta.tier,
        score: meta.score,
        total_time_ms: meta.totalTimeMs,
        cleared_basic: meta.clearedBasic,
        beat_benchmark: meta.beatBenchmark,
        cleared_hidden_bonus: meta.clearedHiddenBonus,
        reached_limit_break: meta.reachedLimitBreak,
        cleared_limit_break: meta.clearedLimitBreak,
      });

      // Per-tier best score — kept separate from the single aggregate best
      // in ladder_leaderboard below. This is what the Challenge Flow landing
      // screen reads to show "[Name] scored X on Easy" cheaply.
      if (meta.score > 0) {
        const { data: existingBest } = await supabase
          .from('tier_best_scores')
          .select('best_score')
          .eq('user_id', meta.userId)
          .eq('tier', meta.tier)
          .maybeSingle();

        if (!existingBest || meta.score > existingBest.best_score) {
          await supabase.from('tier_best_scores').upsert(
            {
              user_id: meta.userId,
              tier: meta.tier,
              best_score: meta.score,
              best_time_ms: meta.totalTimeMs,
            },
            { onConflict: 'user_id,tier' }
          );
        }
      }

      // Any run with at least one correct round (score > 0) can rank —
      // a partial run naturally scores far less than a full clear, so it
      // sorts lower with no separate gate needed. clearedBasic still gates
      // tier unlocking (handled in GameOver.ts), just not leaderboard entry.
      if (meta.score <= 0) {
        return this.fetchLadder();
      }

      const { data: existing } = await supabase
        .from('ladder_leaderboard')
        .select('*')
        .eq('user_id', meta.userId)
        .maybeSingle();

      // A player's leaderboard row always reflects their personal best score,
      // whichever run — full clear or partial — actually earned it.
      const shouldUpdate = !existing || meta.score > existing.score;

      if (shouldUpdate) {
        const clearedHiddenBonusTiers = new Set<string>(existing?.cleared_hidden_bonus_tiers ?? []);
        if (meta.clearedHiddenBonus) clearedHiddenBonusTiers.add(meta.tier);

        await supabase.from('ladder_leaderboard').upsert(
          {
            user_id: meta.userId,
            username: meta.username,
            highest_tier: meta.tier,
            best_total_time_ms: meta.totalTimeMs,
            score: meta.score,
            cleared_hidden_bonus_tiers: Array.from(clearedHiddenBonusTiers),
            has_limit_break_award: meta.clearedLimitBreak || !!existing?.has_limit_break_award,
          },
          { onConflict: 'user_id' }
        );
      }

      return this.fetchLadder();
    } catch (err) {
      console.error('[DigitDash] submitTierRun threw', err);
      return this.fetchLadder();
    }
  }

async fetchChallengerByInviteCode(inviteCode: string): Promise<ChallengerSnapshot | null> {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('user_id, username')
        .eq('invite_code', inviteCode)
        .maybeSingle();

      if (error || !profile) return null;

      const { data: best } = await supabase
        .from('tier_best_scores')
        .select('best_score')
        .eq('user_id', profile.user_id)
        .eq('tier', 'easy')
        .maybeSingle();

      return {
        userId: profile.user_id,
        username: profile.username,
        bestEasyScore: best?.best_score ?? null,
      };
    } catch (err) {
      console.error('[DigitDash] fetchChallengerByInviteCode threw', err);
      return null;
    }
  }

  // ── Rank overtake notifications ────────────────────────────────────────
  async fetchUnseenOvertakes(userId: string): Promise<RankOvertake[]> {
    try {
      const { data, error } = await supabase
        .from('rank_overtakes')
        .select('*')
        .eq('overtaken_user_id', userId)
        .eq('seen', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[DigitDash] fetchUnseenOvertakes error', error);
        return [];
      }

      return (data ?? []).map(r => ({
        id: r.id,
        overtakenByUserId: r.overtaken_by_user_id,
        overtakenByUsername: r.overtaken_by_username,
        seen: r.seen,
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.error('[DigitDash] fetchUnseenOvertakes threw', err);
      return [];
    }
  }

  async markOvertakesSeen(userId: string): Promise<void> {
    try {
      await supabase
        .from('rank_overtakes')
        .update({ seen: true })
        .eq('overtaken_user_id', userId)
        .eq('seen', false);
    } catch (err) {
      console.error('[DigitDash] markOvertakesSeen threw', err);
    }
  }

  // ── Save data ────────────────────────────────────────────────────────
  async saveProgress(userId: string, key: string, value: unknown): Promise<void> {
    if (key === 'ladder_progress') {
      const v = value as {
        highestUnlockedTier: Tier;
        badges: Partial<Record<Tier, boolean>>;
        hasLimitBreakAward: boolean;
      };
      try {
        await supabase.from('player_progress').upsert(
          {
            user_id: userId,
            highest_unlocked_tier: v.highestUnlockedTier,
            badge_easy: !!v.badges.easy,
            badge_medium: !!v.badges.medium,
            badge_hard: !!v.badges.hard,
            badge_boss: !!v.badges.boss,
            has_limit_break_award: v.hasLimitBreakAward,
          },
          { onConflict: 'user_id' }
        );
      } catch (err) {
        console.error('[DigitDash] saveProgress threw', err);
      }
      return;
    }
    localStorage.setItem(lsKey(userId, key), JSON.stringify(value));
  }

  async loadProgress<T>(userId: string, key: string): Promise<T | null> {
    if (key === 'ladder_progress') {
      try {
        const { data, error } = await supabase
          .from('player_progress')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error || !data) return null;
        return {
          highestUnlockedTier: data.highest_unlocked_tier as Tier,
          badges: {
            easy: data.badge_easy,
            medium: data.badge_medium,
            hard: data.badge_hard,
            boss: data.badge_boss,
          },
          hasLimitBreakAward: data.has_limit_break_award,
        } as unknown as T;
      } catch (err) {
        console.error('[DigitDash] loadProgress threw', err);
        return null;
      }
    }
    const raw = localStorage.getItem(lsKey(userId, key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  // ── Quit/retry gating ───────────────────────────────────────────────
  getFreeQuitsRemaining(userId: string): number {
    const raw = localStorage.getItem(lsKey(userId, 'quits_used'));
    const used = raw ? parseInt(raw, 10) : 0;
    return Math.max(0, FREE_QUITS_ALLOWANCE - used);
  }

  consumeFreeQuit(userId: string): void {
    const raw = localStorage.getItem(lsKey(userId, 'quits_used'));
    const used = raw ? parseInt(raw, 10) : 0;
    localStorage.setItem(lsKey(userId, 'quits_used'), String(used + 1));
  }

  hasUnlimitedQuitRetry(userId: string): boolean {
    return localStorage.getItem(lsKey(userId, 'unlimited_quit_retry')) === '1';
  }

  grantUnlimitedQuitRetry(userId: string): void {
    localStorage.setItem(lsKey(userId, 'unlimited_quit_retry'), '1');
    supabase
      .from('player_progress')
      .upsert({ user_id: userId, unlimited_quit_retry: true }, { onConflict: 'user_id' })
      .then(() => {}, () => {});
  }

  async syncQuitRetryUnlock(userId: string): Promise<void> {
    try {
      const { data } = await supabase
        .from('player_progress')
        .select('unlimited_quit_retry')
        .eq('user_id', userId)
        .maybeSingle();
      if (data?.unlimited_quit_retry) {
        localStorage.setItem(lsKey(userId, 'unlimited_quit_retry'), '1');
      }
    } catch (err) {
      console.error('[DigitDash] syncQuitRetryUnlock threw', err);
    }
  }
}

export const platform = new StandaloneAdapter();
