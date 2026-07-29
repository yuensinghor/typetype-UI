// src/lib/dailyChallenge.ts
//
// Client-side helper for Daily Challenge mode. Responsibilities:
//   1. fetchDailyChallenge() — calls the get-daily-challenge Edge Function to
//      retrieve (or trigger first-generation of) today's locked equation set.
//   2. submitDailyChallengeRun() — sends a completed run's raw per-round data
//      to the verify-daily-challenge-run Edge Function, which independently
//      recomputes the score server-side and writes both game_events
//      (verified_score) and daily_challenge_best. The client's own totalScore
//      is never sent and never trusted — see that function's header.
//   3. fetchMyBestToday() / fetchDailyLeaderboard() — read-only queries
//      against the server-verified daily_challenge_best table / its
//      leaderboard view. Both are safe to expose publicly since nothing
//      client-writable feeds them anymore (Phase 1.5).

import { supabase } from './supabaseClient';
import type { RoundResult } from '../shared/types';

export interface DailyEquation {
  stage: number; // 1-10
  kind: 'basic' | 'bonus';
  display: string; // transcription target exactly as shown — NOT an answer
}

export interface DailyChallengeSet {
  challengeDate: string; // YYYY-MM-DD, UTC
  equationSet: DailyEquation[];
  speedBenchmarkMs: number;
}

interface RawDailyChallengeRow {
  challenge_date: string;
  equation_set: DailyEquation[];
  speed_benchmark_ms: number;
}

export async function fetchDailyChallenge(): Promise<DailyChallengeSet> {
  const { data, error } = await supabase.functions.invoke<RawDailyChallengeRow>(
    'get-daily-challenge',
  );

  if (error) {
    throw new Error(`Failed to load today's Daily Challenge: ${error.message}`);
  }
  if (!data) {
    throw new Error("Daily Challenge returned no data.");
  }

  return {
    challengeDate: data.challenge_date,
    equationSet: data.equation_set,
    speedBenchmarkMs: data.speed_benchmark_ms,
  };
}

export interface DailyChallengeRunPayload {
  challengeDate: string;
  results: RoundResult[]; // basic + any bonus stages reached, in order — the
  // only thing that's actually sent server-side (playerInput + timeTaken per
  // round); totalScore/reachedBonus/bonusStagesCleared below are kept on
  // this type for the local post-game summary screen only, and are NOT
  // transmitted to the verification function.
  totalScore: number;
  reachedBonus: boolean;
  bonusStagesCleared: number;
}

export interface VerifiedRunResult {
  verifiedTotalScore: number;
  reachedBonus: boolean;
  bonusStagesCleared: number;
}

/**
 * Sends the raw round-by-round run to the server for verification. Only
 * userId, challengeDate, and results (playerInput + timeTaken per round) are
 * sent — the server re-derives correctness, points, reachedBonus, and
 * bonusStagesCleared entirely on its own from the real stored equation set,
 * ignoring anything the client claims about its own score. See
 * supabase/functions/verify-daily-challenge-run for the full logic.
 */
export async function submitDailyChallengeRun(
  userId: string,
  payload: DailyChallengeRunPayload,
): Promise<VerifiedRunResult | null> {
  const { data, error } = await supabase.functions.invoke<VerifiedRunResult>(
    'verify-daily-challenge-run',
    {
      body: {
        userId,
        challengeDate: payload.challengeDate,
        results: payload.results,
      },
    },
  );

  if (error) {
    // Non-fatal from the player's point of view — they already saw their
    // (locally-computed, unverified) result on screen. Log it so we notice
    // submission failures without blocking the UI flow on a retry mechanism
    // (not built yet).
    console.error('[TypeType] submitDailyChallengeRun failed:', error.message);
    return null;
  }

  return data ?? null;
}

export interface DailyChallengeBest {
  totalScore: number;
  reachedBonus: boolean;
  bonusStagesCleared: number;
}

/**
 * Self-only best score for today, for the Daily Challenge landing page.
 * Reads the server-verified daily_challenge_best row for this user/date —
 * no client-side score of any kind is trusted here anymore.
 */
export async function fetchMyBestToday(
  userId: string,
  challengeDate: string,
): Promise<DailyChallengeBest | null> {
  const { data, error } = await supabase
    .from('daily_challenge_best')
    .select('total_score, reached_bonus, bonus_stages_cleared')
    .eq('user_id', userId)
    .eq('challenge_date', challengeDate)
    .maybeSingle();

  if (error) {
    console.error('[TypeType] fetchMyBestToday failed:', error.message);
    return null;
  }
  if (!data) return null;

  return {
    totalScore: data.total_score,
    reachedBonus: data.reached_bonus,
    bonusStagesCleared: data.bonus_stages_cleared,
  };
}

export interface DailyLeaderboardEntry {
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalScore: number;
  reachedBonus: boolean;
  bonusStagesCleared: number;
}

/**
 * Public top-N for today's Daily Challenge, server-verified. Safe to expose
 * globally (not just friends) since daily_challenge_best is only ever
 * written by the verify-daily-challenge-run Edge Function's service-role
 * key — see migration 007.
 */
export async function fetchDailyLeaderboard(
  challengeDate: string,
  limit = 10,
): Promise<DailyLeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('daily_challenge_leaderboard')
    .select('*')
    .eq('challenge_date', challengeDate)
    .order('total_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[TypeType] fetchDailyLeaderboard failed:', error.message);
    return [];
  }

  return (data ?? []).map(r => ({
    userId: r.user_id,
    username: r.username,
    avatarUrl: r.avatar_url,
    totalScore: r.total_score,
    reachedBonus: r.reached_bonus,
    bonusStagesCleared: r.bonus_stages_cleared,
  }));
}
