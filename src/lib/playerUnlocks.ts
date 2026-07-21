// src/lib/playerUnlocks.ts
//
// Fetches the player_unlocks view (Supabase) for a given user and maps it
// into the PlayerUnlocks shape that canAccessMode() expects.
//
// v2 (nav redesign): the old sequential gates (clearedEasyTier,
// endlessRunsCompleted) are gone. Everything now derives from two signals:
// clearedAllTiers (all 4 ladder tiers cleared) and distinctDaysPlayed
// (calendar days with any activity) — see 005_unlock_chain_v2.sql.

import { supabase } from './supabaseClient';
import type { PlayerUnlocks } from './modeAccess';

// Safe default: everything locked. Used for guests (who never call this —
// canAccessMode already blocks them before unlocks matter) and for brand
// new accounts that don't have a player_progress row yet.
const DEFAULT_UNLOCKS: PlayerUnlocks = {
  clearedAllTiers: false,
  distinctDaysPlayed: 0,
};

export async function fetchPlayerUnlocks(userId: string): Promise<PlayerUnlocks> {
  const { data, error } = await supabase
    .from('player_unlocks')
    .select('cleared_all_tiers, distinct_days_played')
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
    clearedAllTiers: data.cleared_all_tiers,
    distinctDaysPlayed: data.distinct_days_played,
  };
}
