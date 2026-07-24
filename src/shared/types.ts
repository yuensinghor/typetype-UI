// Difficulty is now a TIER in one continuous ladder: easy -> medium -> hard -> boss
export type Tier = 'easy' | 'medium' | 'hard' | 'boss';
export const TIER_ORDER: Tier[] = ['easy', 'medium', 'hard', 'boss'];

export interface RoundResult {
  roundIndex: number;
  equation: string;
  targetAnswer: string;
  playerInput: string;
  timeTaken: number;
  timeLimit: number;
  status: 'correct' | 'failed' | 'timeout';
  points: number;
}

// Persisted per-player progress on the ladder
export interface PlayerProgress {
  userId: string; // supabase auth uid OR guest local id
  highestUnlockedTier: Tier;
  tierBadges: Partial<Record<Tier, boolean>>; // cosmetic-only bonus-stage badge per tier
  updatedAt: string;
}

// A single tier attempt/run result, used to update the combined ladder leaderboard
export interface TierRunMeta {
  userId: string;
  username: string;
  tier: Tier;
  score: number;
  totalTimeMs: number; // time across the 5 basic stages of this tier
  averageSpeed: number;
  accuracy: number;
  clearedBasic: boolean; // cleared 5 basic stages @ 100% within time
  beatBenchmark: boolean; // qualified for hidden bonus stages
  clearedHiddenBonus: boolean; // cleared stages 6-10 (mandatory once unlocked)
  reachedLimitBreak: boolean; // reached stage 11 (only possible after boss hidden bonus)
  clearedLimitBreak: boolean;
  createdAt: string;
}

// Combined ladder leaderboard entry — ranked by climb progress first, speed second
export interface LadderEntry {
  userId: string;
  username: string;
  highestTier: Tier;
  clearedHiddenBonusTiers: Tier[]; // for badge display
  hasLimitBreakAward: boolean;
  bestTotalTimeMs: number; // best total time at their highest-tier clear
  score: number;
  invitedBy?: string | null; // for "My Squad" tagging
  updatedAt: string;
}

export interface SquadEntry extends LadderEntry {
  invitedByUsername?: string;
}

export interface ChallengerSnapshot {
  userId: string;
  username: string;
  bestEasyScore: number | null; // null = challenger has no Easy record yet
}

export interface Identity {
  userId: string;
  username: string;
  isGuest: boolean;
  inviteCode?: string; // this player's own shareable invite code
  invitedBy?: string | null; // userId of whoever invited this player
}

export interface RankOvertake {
  id: number;
  overtakenByUserId: string;
  overtakenByUsername: string;
  seen: boolean;
  createdAt: string;
}

// ── Phase 4: Discrete Levels + Stars ────────────────────────────────────

/** The trait combo a level's content was generated from (see levelGenerator.ts). */
export interface LevelTraits {
  digitLength: 1 | 2 | 3;
  termCount: 2 | 3 | 4;
  decimalPresent: boolean;
}

export interface LevelEquation {
  /** What's shown on screen, e.g. "12 + 34 - 5" (spaces included). */
  equation: string;
  /** What the player must type — equation with spaces stripped. Transcription target only. */
  targetAnswer: string;
  timeLimit: number; // seconds, derived from the level's budget
}

/** A fully generated level: deterministic for a given level number (seed = level number). */
export interface LevelDefinition {
  levelNumber: number;
  budget: number;
  traits: LevelTraits;
  equations: LevelEquation[];
}

/** 0 = not cleared. 1/2/3 per the locked star criteria (see levelGenerator.ts header). */
export type StarCount = 0 | 1 | 2 | 3;

export interface LevelRunResult {
  levelNumber: number;
  results: RoundResult[];
  stars: StarCount;
  totalTimeMs: number;
  accuracy: number; // 0..1, correct rounds / total rounds
  mistakes: number;
}

/**
 * Persisted per-player progress through Levels. starsByLevel gives O(1)
 * random access per level (needed for the level-select map) without an
 * event log — keyed by level number, storing this player's *best* star
 * result for that level. See level_progress migration for storage notes.
 */
export interface LevelProgress {
  userId: string;
  highestLevel: number; // highest level number ever cleared (>=1 star)
  starsByLevel: Record<number, StarCount>;
  updatedAt: string;
}