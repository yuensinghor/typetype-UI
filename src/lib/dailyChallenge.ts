// src/lib/dailyChallenge.ts
//
// Client-side helper for Phase 1's Daily Challenge mode. Two responsibilities:
//   1. fetchDailyChallenge() — calls the get-daily-challenge Edge Function to
//      retrieve (or trigger first-generation of) today's locked equation set.
//   2. submitDailyChallengeRun() — writes a completed run to the shared
//      game_events table (mode: 'daily_challenge'), per the Phase 0 decision
//      to use one unified events table instead of a bespoke per-mode table.
//
// IMPORTANT: verified_score is deliberately left null here. Phase 1.5 (score
// integrity) hasn't shipped yet, so nothing client-submitted should be
// trusted as a final leaderboard score. The Daily Challenge leaderboard UI
// stays self-only / unranked until an Edge Function re-validates submissions
// server-side and backfills verified_score. See build plan Phase 1.5.

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
  results: RoundResult[]; // basic + any bonus stages reached, in order
  totalScore: number; // sum of points across all stages played
  reachedBonus: boolean; // did the player beat the benchmark on the basic 5?
  bonusStagesCleared: number; // 0-5
}

export async function submitDailyChallengeRun(
  userId: string,
  payload: DailyChallengeRunPayload,
): Promise<void> {
  const { error } = await supabase.from('game_events').insert({
    user_id: userId,
    mode: 'daily_challenge',
    payload,
    verified_score: null, // see file header — filled in by Phase 1.5, not here
  });

  if (error) {
    // Non-fatal from the player's point of view — they already saw their
    // result on screen. Log it so we notice submission failures without
    // blocking the UI flow on a retry mechanism (not built yet).
    console.error('[TypeType] submitDailyChallengeRun failed:', error.message);
  }
}

export interface DailyChallengeBest {
  totalScore: number;
  reachedBonus: boolean;
  bonusStagesCleared: number;
}

/**
 * Self-only best score for today, for the Daily Challenge landing page.
 * Deliberately NOT a public/global leaderboard — see file header. Reads the
 * player's own game_events rows for this exact challenge date (matched via
 * payload.challengeDate, not created_at, so a submission made close to
 * UTC midnight can't land on the wrong day) and returns the highest score
 * among their attempts, or null if they haven't played yet today.
 */
export async function fetchMyBestToday(
  userId: string,
  challengeDate: string,
): Promise<DailyChallengeBest | null> {
  const { data, error } = await supabase
    .from('game_events')
    .select('payload')
    .eq('user_id', userId)
    .eq('mode', 'daily_challenge')
    .eq('payload->>challengeDate', challengeDate);

  if (error) {
    console.error('[TypeType] fetchMyBestToday failed:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const runs = data.map(row => row.payload as DailyChallengeRunPayload);
  const best = runs.reduce((a, b) => (b.totalScore > a.totalScore ? b : a));

  return {
    totalScore: best.totalScore,
    reachedBonus: best.reachedBonus,
    bonusStagesCleared: best.bonusStagesCleared,
  };
}
