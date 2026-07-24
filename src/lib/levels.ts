// src/lib/levels.ts
//
// Client-side helper for Phase 4's Discrete Levels. Unlike Endless/Daily
// Challenge, this does NOT write to the shared game_events table — level
// progress needs O(1) random access per level (for the level-select map's
// star display), which an append-only event log doesn't give cheaply.
// Instead it reads/writes a single dedicated row per player in
// level_progress (see 007_level_progress.sql).
//
// Star result is computed client-side by levelGenerator.ts's computeStars()
// before calling submitLevelResult() here. Same caveat as Endless/Daily
// Challenge applies: nothing here is server-validated yet (Phase 1.5 score
// integrity hasn't shipped), so treat this as self-only progress tracking,
// not a tamper-proof leaderboard input.

import { supabase } from './supabaseClient';
import type { LevelProgress, StarCount } from '../shared/types';

interface LevelProgressRow {
  user_id: string;
  highest_level: number;
  stars: Record<string, StarCount>; // JSONB keys are always strings
  updated_at: string;
}

function rowToProgress(row: LevelProgressRow): LevelProgress {
  const starsByLevel: Record<number, StarCount> = {};
  for (const [k, v] of Object.entries(row.stars ?? {})) {
    starsByLevel[Number(k)] = v;
  }
  return {
    userId: row.user_id,
    highestLevel: row.highest_level,
    starsByLevel,
    updatedAt: row.updated_at,
  };
}

/** Fetches this player's level progress, or null if they haven't played any level yet. */
export async function fetchLevelProgress(userId: string): Promise<LevelProgress | null> {
  const { data, error } = await supabase
    .from('level_progress')
    .select('user_id, highest_level, stars, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[TypeType] fetchLevelProgress failed:', error.message);
    return null;
  }
  if (!data) return null;

  return rowToProgress(data as LevelProgressRow);
}

/**
 * Submits a completed level's result. Only writes if the new star count is
 * better than what's stored (or the level hasn't been played before) —
 * a player replaying a cleared level for fun with a worse run shouldn't
 * knock their best stars back down.
 */
export async function submitLevelResult(
  userId: string,
  levelNumber: number,
  stars: StarCount,
): Promise<void> {
  const existing = await fetchLevelProgress(userId);

  const prevStars = existing?.starsByLevel[levelNumber] ?? 0;
  const newStars = Math.max(prevStars, stars) as StarCount;
  const newHighest = Math.max(existing?.highestLevel ?? 0, stars > 0 ? levelNumber : 0);

  const starsByLevel = { ...(existing?.starsByLevel ?? {}), [levelNumber]: newStars };
  // Convert numeric keys back to a plain object for JSONB storage.
  const starsPayload: Record<string, StarCount> = {};
  for (const [k, v] of Object.entries(starsByLevel)) starsPayload[k] = v;

  const { error } = await supabase.from('level_progress').upsert({
    user_id: userId,
    highest_level: newHighest,
    stars: starsPayload,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    // Non-fatal from the player's point of view — they already saw their
    // stars on screen. Log it so submission failures aren't silent.
    console.error('[TypeType] submitLevelResult failed:', error.message);
  }
}
