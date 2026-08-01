// src/lib/endless.ts
//
// Client-side helper for Phase 3's Endless Mode. Responsibilities:
//   1. submitEndlessRun() — sends a completed run's raw round-by-round data
//      (playerInput + timeTaken per round) plus the run's random seed to
//      the verify-endless-run Edge Function, which independently
//      regenerates the exact same equation sequence from that seed and
//      recomputes correctness/score server-side. The client's own
//      totalScore is never sent and never trusted — see that function's
//      header, and generateEquationSeeded() in lib/equation.ts for how the
//      seed makes server-side replay possible without a pre-locked set
//      like Daily Challenge uses.
//   2. fetchMyBestEndless() / fetchEndlessLeaderboard() — read-only queries
//      against the server-verified endless_best table / its leaderboard
//      view. Both are safe to expose publicly since nothing client-writable
//      feeds them (Phase 1.5, same model as Daily Challenge).

import { supabase } from './supabaseClient';
import type { RoundResult, Tier } from '../shared/types';

export interface EndlessRunPayload {
  seed: number; // this run's PRNG seed — lets the server regenerate the exact equation sequence
  results: RoundResult[]; // every round played, in order, up to and including the run-ending miss
  totalScore: number; // client-side value, kept for the local post-game summary only — NOT sent/trusted
  roundsCleared: number; // ditto
  highestTierReached: Tier; // ditto
}

export interface VerifiedEndlessResult {
  verifiedTotalScore: number;
  roundsCleared: number;
  highestTierReached: Tier;
}

/**
 * Sends the raw round-by-round run to the server for verification. Only
 * userId, seed, and results (playerInput + timeTaken per round) are sent —
 * the server re-derives correctness, points, roundsCleared, and
 * highestTierReached entirely on its own by replaying the same seeded
 * sequence, ignoring anything the client claims about its own score. See
 * supabase/functions/verify-endless-run for the full logic.
 */
export async function submitEndlessRun(
  userId: string,
  payload: EndlessRunPayload,
): Promise<VerifiedEndlessResult | null> {
  const { data, error } = await supabase.functions.invoke<VerifiedEndlessResult>(
    'verify-endless-run',
    {
      body: {
        userId,
        seed: payload.seed,
        results: payload.results,
      },
    },
  );

  if (error) {
    // Non-fatal from the player's point of view — they already saw their
    // (locally-computed, unverified) result on screen. Log it so we notice
    // submission failures without blocking the UI flow on a retry mechanism
    // (not built yet).
    console.error('[TypeType] submitEndlessRun failed:', error.message);
    return null;
  }

  return data ?? null;
}

export interface EndlessBest {
  totalScore: number;
  roundsCleared: number;
  highestTierReached: Tier;
}

/**
 * Self-only all-time best run, for the Endless landing page. Reads the
 * server-verified endless_best row for this user — no client-side score of
 * any kind is trusted here anymore.
 */
export async function fetchMyBestEndless(userId: string): Promise<EndlessBest | null> {
  const { data, error } = await supabase
    .from('endless_best')
    .select('total_score, rounds_cleared, highest_tier_reached')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[TypeType] fetchMyBestEndless failed:', error.message);
    return null;
  }
  if (!data) return null;

  return {
    totalScore: data.total_score,
    roundsCleared: data.rounds_cleared,
    highestTierReached: data.highest_tier_reached as Tier,
  };
}

export interface EndlessLeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalScore: number;
  roundsCleared: number;
  highestTierReached: Tier;
}

/**
 * Public top-N all-time Endless leaderboard, server-verified. Safe to
 * expose globally since endless_best is only ever written by the
 * verify-endless-run Edge Function's service-role key — see migration 008.
 */
export async function fetchEndlessLeaderboard(limit = 10): Promise<EndlessLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('endless_leaderboard')
    .select('*')
    .order('total_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[TypeType] fetchEndlessLeaderboard failed:', error.message);
    return [];
  }

  return (data ?? []).map(r => ({
    userId: r.user_id,
    username: r.username,
    avatarUrl: r.avatar_url,
    totalScore: r.total_score,
    roundsCleared: r.rounds_cleared,
    highestTierReached: r.highest_tier_reached as Tier,
  }));
}
