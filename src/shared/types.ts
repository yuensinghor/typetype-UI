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
