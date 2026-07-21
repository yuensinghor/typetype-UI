// src/lib/endless.ts
//
// Client-side helper for Phase 3's Endless Mode. Unlike Daily Challenge,
// there's no server-locked equation set or challenge date — every run is
// unique and self-contained, so this file only has two jobs:
//   1. submitEndlessRun() — writes a completed (i.e. ended) run to the
//      shared game_events table (mode: 'endless'), per the Phase 0 decision
//      to use one unified events table instead of a bespoke per-mode table.
//   2. fetchMyBestEndless() — reads back the player's all-time best run for
//      the Endless landing page.
//
// IMPORTANT: verified_score is deliberately left null here, same as Daily
// Challenge. Phase 1.5 (score integrity) hasn't shipped yet, so nothing
// client-submitted should be trusted as a final leaderboard score. There is
// no public Endless leaderboard yet for the same reason.

import { supabase } from './supabaseClient';
import type { RoundResult, Tier } from '../shared/types';

export interface EndlessRunPayload {
  results: RoundResult[]; // every round played, in order, up to and including the run-ending miss
  totalScore: number; // sum of points across all correct rounds
  roundsCleared: number; // correct rounds before the run ended
  highestTierReached: Tier;
}

export async function submitEndlessRun(
  userId: string,
  payload: EndlessRunPayload,
): Promise<void> {
  const { error } = await supabase.from('game_events').insert({
    user_id: userId,
    mode: 'endless',
    payload,
    verified_score: null, // see file header — filled in by Phase 1.5, not here
  });

  if (error) {
    // Non-fatal from the player's point of view — they already saw their
    // result on screen. Log it so we notice submission failures without
    // blocking the UI flow on a retry mechanism (not built yet).
    console.error('[TypeType] submitEndlessRun failed:', error.message);
  }
}

export interface EndlessBest {
  totalScore: number;
  roundsCleared: number;
  highestTierReached: Tier;
}

/**
 * Self-only all-time best run, for the Endless landing page. No date
 * filter (unlike Daily Challenge) — every game_events row with
 * mode='endless' for this user is a candidate.
 */
export async function fetchMyBestEndless(userId: string): Promise<EndlessBest | null> {
  const { data, error } = await supabase
    .from('game_events')
    .select('payload')
    .eq('user_id', userId)
    .eq('mode', 'endless');

  if (error) {
    console.error('[TypeType] fetchMyBestEndless failed:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const runs = data.map(row => row.payload as EndlessRunPayload);
  const best = runs.reduce((a, b) => (b.totalScore > a.totalScore ? b : a));

  return {
    totalScore: best.totalScore,
    roundsCleared: best.roundsCleared,
    highestTierReached: best.highestTierReached,
  };
}
