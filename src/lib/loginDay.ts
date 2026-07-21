// src/lib/loginDay.ts
//
// Feeds the day-counter used by the new unlock chain (Daily Challenge at
// 3 distinct days played, Endless + Levels at 7 — see modeAccess.ts).
//
// The counter itself lives server-side: player_unlocks.distinct_days_played
// counts distinct calendar dates across a player's game_events rows (see
// migration 005_unlock_chain_v2.sql). This file's only job is to make sure
// at least one game_events row exists for "today" whenever a logged-in
// player opens the game — regardless of which mode they actually play —
// so the day-counter reflects "played anything today," not just Daily
// Challenge days.
//
// Guests are never called here: canAccessMode() already blocks every
// gated mode for guests, so guest day-counts would be meaningless (and
// guests have no durable user_id to attach them to anyway).

import { supabase } from './supabaseClient';

function todayUtc(): string {
  // YYYY-MM-DD, UTC — matches the (created_at at time zone 'utc')::date
  // grouping used server-side, so the two never disagree across a
  // midnight-UTC boundary.
  return new Date().toISOString().slice(0, 10);
}

function localStorageKey(userId: string): string {
  return `dd_last_login_day_${userId}`;
}

/**
 * Call once per boot for a logged-in (non-guest) player. No-ops if a
 * 'login' event has already been recorded for this user today, checked
 * via localStorage first to avoid a network round-trip on every single
 * boot — worst case (cleared storage, multiple devices) is a harmless
 * duplicate row for the same day, which the distinct-date count already
 * collapses down to 1.
 */
export async function recordLoginDayIfNeeded(userId: string): Promise<void> {
  const today = todayUtc();
  const key = localStorageKey(userId);

  if (localStorage.getItem(key) === today) return;

  try {
    const { error } = await supabase.from('game_events').insert({
      user_id: userId,
      mode: 'login',
      payload: {},
      verified_score: null,
    });

    if (error) {
      console.error('[TypeType] recordLoginDayIfNeeded failed:', error.message);
      return; // don't mark local storage — retry next boot
    }

    localStorage.setItem(key, today);
  } catch (err) {
    console.error('[TypeType] recordLoginDayIfNeeded threw:', err);
  }
}
