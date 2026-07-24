// src/lib/levelGenerator.ts
//
// Phase 4 — Discrete Levels. Generates deterministic level content from a
// level number alone (seed = level number), so the same level always looks
// the same for every player and on replay.
//
// This is deliberately a SEPARATE generator from equation.ts's
// generateEquation(). That function is intentionally rigid — one fixed
// 2-term shape per tier, no trait mixing — and reused as-is by the ladder,
// Daily Challenge, and Endless. Levels needs trait mixing (variable term
// count, variable digit length, optional decimals), so it gets its own
// "difficulty budget" system instead of bending equation.ts to fit.
//
// ── Difficulty budget system ────────────────────────────────────────────
// Each level has a target budget that rises roughly (not strictly) with
// level number. Each trait has a point cost; the generator samples trait
// combos (seeded by level number) whose total cost lands near that level's
// budget. This lets different-looking levels share the same difficulty —
// e.g. a short number with a decimal can cost the same as a longer number
// without one — instead of every level at a given number looking identical.
//
// v1 trait pool is deliberately narrow (widen later, once the first ~20-30
// levels have been playtested):
//   digit-length   1 / 2 / 3 digits per operand   → cost 0 / 1 / 2
//   term-count     2 / 3 / 4 terms                → cost 0 / 2 / 4
//   decimal        absent / present (2dp)         → cost 0 / 3
// (negatives and time-limit-tightening are deferred to a later pass)
//
// Budget curve v1: budget(level) = floor(level/2), with an occasional
// "breather" dip (lower budget than the level before it) every ~5 levels
// to avoid constant-escalation fatigue.
//
// ── Star criteria (locked) ──────────────────────────────────────────────
//   1 star = cleared (accuracy above baseline, max 1 mistake)
//   2 stars = 100% accuracy
//   3 stars = 100% accuracy AND under the level's time target
// See computeStars() below.

import { mulberry32, randInt, pick, chance, type RandFn } from './prng';
import { RAMP } from './equation';
import type { LevelDefinition, LevelEquation, LevelTraits, StarCount, RoundResult } from '../shared/types';

const EQUATIONS_PER_LEVEL = 5; // matches the existing 5-basic-stage ladder pattern

// ── Trait cost table ─────────────────────────────────────────────────────

interface TraitOption<T> {
  value: T;
  cost: number;
}

const DIGIT_LENGTH_OPTIONS: TraitOption<1 | 2 | 3>[] = [
  { value: 1, cost: 0 },
  { value: 2, cost: 1 },
  { value: 3, cost: 2 },
];

const TERM_COUNT_OPTIONS: TraitOption<2 | 3 | 4>[] = [
  { value: 2, cost: 0 },
  { value: 3, cost: 2 },
  { value: 4, cost: 4 },
];

const DECIMAL_OPTIONS: TraitOption<boolean>[] = [
  { value: false, cost: 0 },
  { value: true, cost: 3 },
];

// Max possible combined cost (2 + 4 + 3), used to normalize budget → 0..1
// when scaling the time-limit ramp.
const MAX_TRAIT_COST =
  DIGIT_LENGTH_OPTIONS[DIGIT_LENGTH_OPTIONS.length - 1].cost +
  TERM_COUNT_OPTIONS[TERM_COUNT_OPTIONS.length - 1].cost +
  DECIMAL_OPTIONS[DECIMAL_OPTIONS.length - 1].cost;

interface TraitCombo {
  traits: LevelTraits;
  cost: number;
}

/** All combinations of the three trait dimensions, with their summed cost. */
function allCombos(): TraitCombo[] {
  const combos: TraitCombo[] = [];
  for (const d of DIGIT_LENGTH_OPTIONS) {
    for (const t of TERM_COUNT_OPTIONS) {
      for (const dec of DECIMAL_OPTIONS) {
        combos.push({
          traits: { digitLength: d.value, termCount: t.value, decimalPresent: dec.value },
          cost: d.cost + t.cost + dec.cost,
        });
      }
    }
  }
  return combos;
}

const ALL_COMBOS = allCombos();

/**
 * Picks a trait combo whose cost lands near (not necessarily exactly at)
 * the target budget. Ties/near-ties are broken by the seeded RNG so two
 * levels with the same budget don't always look identical.
 */
function pickComboForBudget(rand: RandFn, budget: number): TraitCombo {
  let bestDist = Infinity;
  for (const combo of ALL_COMBOS) {
    const dist = Math.abs(combo.cost - budget);
    if (dist < bestDist) bestDist = dist;
  }
  // Small tolerance band around the closest distance so there's usually a
  // handful of candidates to pick between, not always the exact same combo.
  const candidates = ALL_COMBOS.filter(c => Math.abs(c.cost - budget) <= bestDist + 1);
  return pick(rand, candidates);
}

// ── Budget curve ─────────────────────────────────────────────────────────

/**
 * budget(level) rises roughly with level number, with an occasional
 * breather dip every ~5 levels so difficulty doesn't feel like a constant
 * uphill grind. The dip amount and exact placement are seeded per level so
 * they don't fall on a predictable fixed cadence.
 */
export function getLevelBudget(levelNumber: number): number {
  const base = Math.floor(levelNumber / 2);
  const rand = mulberry32(levelNumber * 7919); // distinct seed stream from content generation below
  const isBreatherWindow = levelNumber % 5 === 0 && levelNumber > 1;
  if (isBreatherWindow && chance(rand, 0.6)) {
    const dip = randInt(rand, 1, 3);
    return Math.max(0, base - dip);
  }
  return base;
}

// ── Equation generation for a given trait combo ─────────────────────────

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

function padNum(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

function randomOperand(rand: RandFn, digitLength: number, decimalPresent: boolean): string {
  const min = digitLength === 1 ? 1 : Math.pow(10, digitLength - 1);
  const max = Math.pow(10, digitLength) - 1;
  const whole = randInt(rand, min, max);
  if (!decimalPresent) return String(whole);
  return `${whole}.${padNum(randInt(rand, 0, 99), 2)}`;
}

/** Generates one equation string matching the given traits. */
function generateLevelEquation(rand: RandFn, traits: LevelTraits, timeLimit: number): LevelEquation {
  const { digitLength, termCount, decimalPresent } = traits;
  const terms: string[] = [];
  const ops: ('+' | '−')[] = [];
  for (let i = 0; i < termCount; i++) {
    terms.push(randomOperand(rand, digitLength, decimalPresent));
    if (i < termCount - 1) ops.push(chance(rand, 0.5) ? '+' : '−');
  }

  let equation = terms[0];
  for (let i = 0; i < ops.length; i++) {
    equation += ` ${ops[i] === '−' ? '-' : '+'} ${terms[i + 1]}`;
  }

  return { equation, targetAnswer: stripSpaces(equation), timeLimit };
}

// ── Time limit scaling ───────────────────────────────────────────────────
// Mirrors equation.ts's per-round RAMP (start→end across rounds 1-5 within
// a tier), but interpolated by the level's normalized budget instead of a
// fixed tier — a budget of 0 tracks 'easy' pacing, a budget at/above
// MAX_TRAIT_COST tracks 'boss' pacing, everything else interpolates linearly.
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function getLevelRampBase(budget: number): { start: number; end: number } {
  const t = Math.min(1, Math.max(0, budget / MAX_TRAIT_COST));
  return {
    start: lerp(RAMP.easy.start, RAMP.boss.start, t),
    end: lerp(RAMP.easy.end, RAMP.boss.end, t),
  };
}

/** roundIndex is 1-based within the level (1..EQUATIONS_PER_LEVEL). */
export function getLevelTimeLimit(budget: number, roundIndex: number, totalRounds = EQUATIONS_PER_LEVEL): number {
  const { start, end } = getLevelRampBase(budget);
  const t = totalRounds <= 1 ? 0 : Math.min(totalRounds - 1, Math.max(0, roundIndex - 1)) / (totalRounds - 1);
  return start + (end - start) * t;
}

/**
 * The level's overall time target for 3-star pacing — sum of each round's
 * individual time limit gives a per-level budget that rewards consistent
 * speed across all rounds, not just one fast round.
 */
export function getLevelTimeTarget(levelNumber: number): number {
  const def = generateLevel(levelNumber);
  return def.equations.reduce((sum, eq) => sum + eq.timeLimit, 0);
}

// ── Level generation entry point ────────────────────────────────────────

/**
 * Generates a full level deterministically from its level number alone.
 * Same level number always produces the same budget, trait combo, and
 * equation set — safe to regenerate on demand rather than persisting
 * level content server-side.
 */
export function generateLevel(levelNumber: number): LevelDefinition {
  const budget = getLevelBudget(levelNumber);
  const rand = mulberry32(levelNumber); // primary content seed
  const { traits } = pickComboForBudget(rand, budget);

  const equations: LevelEquation[] = [];
  for (let i = 1; i <= EQUATIONS_PER_LEVEL; i++) {
    const timeLimit = getLevelTimeLimit(budget, i);
    equations.push(generateLevelEquation(rand, traits, timeLimit));
  }

  return { levelNumber, budget, traits, equations };
}

// ── Star criteria ────────────────────────────────────────────────────────
//   1 star = cleared: accuracy above baseline (max 1 mistake across the level)
//   2 stars = 100% accuracy (zero mistakes)
//   3 stars = 100% accuracy AND total time under the level's time target
export function computeStars(levelNumber: number, results: RoundResult[]): StarCount {
  const mistakes = results.filter(r => r.status !== 'correct').length;
  if (mistakes > 1) return 0;

  const totalTime = results.reduce((sum, r) => sum + r.timeTaken, 0);
  const timeTarget = getLevelTimeTarget(levelNumber);

  if (mistakes === 0 && totalTime <= timeTarget) return 3;
  if (mistakes === 0) return 2;
  return 1; // exactly 1 mistake — cleared, but capped below 100%-accuracy tiers
}
