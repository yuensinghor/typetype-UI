// src/lib/playerUnlocks.ts
//
// Fetches the player_unlocks view (Supabase) for a given user and maps it
// into the PlayerUnlocks shape that canAccessMode() expects.

import { supabase } from './supabaseClient';
import type { PlayerUnlocks } from './modeAccess';

// Safe default: everything locked. Used for guests (who never call this —
// canAccessMode already blocks them before unlocks matter) and for brand
// new accounts that don't have a player_progress row yet.
const DEFAULT_UNLOCKS: PlayerUnlocks = {
  clearedEasyTier: false,
  distinctDaysPlayedDaily: 0,
  endlessRunsCompleted: 0,
};

export async function fetchPlayerUnlocks(userId: string): Promise<PlayerUnlocks> {
  const { data, error } = await supabase
    .from('player_unlocks')
    .select('cleared_easy_tier, distinct_days_played_daily, endless_runs_completed')
    .eq('user_id', userId)
    .maybeSingle(); // no row yet (new account) is a valid, non-error state

  if (error) {
    console.error('[TypeType] fetchPlayerUnlocks failed:', error.message);
    return DEFAULT_UNLOCKS;
  }

  if (!data) {
    return DEFAULT_UNLOCKS;
  }

  return {
    clearedEasyTier: data.cleared_easy_tier,
    distinctDaysPlayedDaily: data.distinct_days_played_daily,
    endlessRunsCompleted: data.endless_runs_completed,
  };
}
