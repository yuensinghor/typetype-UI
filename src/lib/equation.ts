import type { Tier } from '../shared/types';

interface Equation {
  /** What's shown on screen, e.g. "47 + 23" (spaces included, for readability). */
  equation: string;
  /**
   * What the player must actually type to clear the round — the equation
   * with spaces stripped out. Spaces never count toward accuracy or length.
   * NOTE: this is a transcription target, NOT the solved/computed result.
   * Digit Dash is a typing-speed game, not a math game.
   */
  targetAnswer: string;
}

type RandFn = () => number;

function rnd(rand: RandFn, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

function padNum(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

/**
 * Generates the digit/operator string the player must transcribe.
 * Each tier is LOCKED to one exact structural format — no randomized
 * shape-switching within a tier, so difficulty stays consistent round
 * to round. The player never has to compute anything; this only ever
 * produces the string to be typed back.
 *
 *   easy:   single digit          e.g. "7 + 3"              → "7+3"
 *   medium: two digits            e.g. "47 + 23"            → "47+23"
 *   hard:   two decimals (X.XX)   e.g. "47.23 + 88.91"      → "47.23+88.91"
 *   boss:   two decimals (XXXX.YYYY), exactly 19 chars typed
 *           e.g. "1234.5678 + 8765.4321" → "1234.5678+8765.4321"
 *
 * Takes a `rand` source (defaults to Math.random) so callers that need a
 * server-reproducible sequence — e.g. Endless Mode's seeded verification —
 * can pass a seeded PRNG instead. See generateEquationSeeded below.
 */
export function generateEquation(tier: Tier, rand: RandFn = Math.random): Equation {
  const op = rand() < 0.5 ? '+' : '-';

  switch (tier) {
    case 'easy': {
      const a = rnd(rand, 1, 9);
      const b = rnd(rand, 1, 9);
      const equation = `${a} ${op} ${b}`;
      return { equation, targetAnswer: stripSpaces(equation) };
    }
    case 'medium': {
      const a = rnd(rand, 10, 99);
      const b = rnd(rand, 10, 99);
      const equation = `${a} ${op} ${b}`;
      return { equation, targetAnswer: stripSpaces(equation) };
    }
    case 'hard': {
      const a = `${rnd(rand, 10, 99)}.${padNum(rnd(rand, 0, 99), 2)}`;
      const b = `${rnd(rand, 10, 99)}.${padNum(rnd(rand, 0, 99), 2)}`;
      const equation = `${a} ${op} ${b}`;
      return { equation, targetAnswer: stripSpaces(equation) };
    }
    case 'boss': {
      const a = `${rnd(rand, 1000, 9999)}.${padNum(rnd(rand, 0, 9999), 4)}`;
      const b = `${rnd(rand, 1000, 9999)}.${padNum(rnd(rand, 0, 9999), 4)}`;
      const equation = `${a} ${op} ${b}`; // targetAnswer is always exactly 19 chars
      return { equation, targetAnswer: stripSpaces(equation) };
    }
  }
}

/**
 * Same generator, explicit-seed entry point for Endless Mode. A run's seed
 * is generated client-side at start and sent along with the final
 * submission — the verify-endless-run Edge Function replays this exact
 * function (ported inline, since Deno can't import from src/lib) against
 * the same seed to independently regenerate every equation shown and check
 * playerInput against it, instead of trusting anything the client reports
 * about what the target was. See that function's header for the full
 * threat-model note (this mirrors Daily Challenge's Phase 1.5 approach).
 */
export function generateEquationSeeded(rand: RandFn, tier: Tier): Equation {
  return generateEquation(tier, rand);
}

// ── Timing (locked spec) ────────────────────────────────────────────────
// TEMPORARY CHEAT MODE (10x TIME) FOR BADGE TESTING
export const RAMP: Record<Tier, { start: number; end: number }> = {
  easy: { start: 2.0 * 10, end: 1.4 * 10 },
  medium: { start: 4.0 * 10, end: 2.6 * 10 },
  hard: { start: 6.0 * 10, end: 4.0 * 10 },
  boss: { start: 8.0 * 10, end: 6.5 * 10 },
};

export function getTimeLimit(tier: Tier, roundIndex: number): number {
  const { start, end } = RAMP[tier];
  const t = Math.min(4, Math.max(0, roundIndex - 1)) / 4; // 0..1 across rounds 1-5
  return start + (end - start) * t;
}

/**
 * Fixed benchmark (average seconds per round) a player must beat across a
 * tier's basic 5 rounds to unlock hidden stages 6-10. Replaces the old
 * dynamic community-median lookup entirely — no network call needed.
 */
export const UNLOCK_TARGETS: Record<Tier, number> = {
  easy: 1.1 * 10,
  medium: 1.6 * 10,
  hard: 3.3 * 10,
  boss: 5.5 * 10,
};

// Hidden stages 6-10: each stage tightens the previous limit by 5%.
export function getEndlessTimeLimit(tier: Tier, stageIndex: number): number {
  const base = UNLOCK_TARGETS[tier];
  const factor = Math.pow(0.95, stageIndex - 6);
  return parseFloat((base * factor).toFixed(3));
}

// Stage 11 (Limit Break): base * 0.95^5, precomputed.
export const LIMIT_BREAK_LIMITS: Record<Tier, number> = {
  easy: 0.851 * 10,
  medium: 1.238 * 10,
  hard: 2.553 * 10,
  boss: 4.256 * 10,
};