import { TIER_ORDER, type RoundResult, type Tier } from '../shared/types';
import { UNLOCK_TARGETS } from './equation';

export type LadderPhase =
  | 'basic'
  | 'hidden_bonus'
  | 'limit_break'
  | 'tier_cleared'
  | 'run_complete'
  | 'game_over';

export interface ClearedTierSnapshot {
  tier: Tier;
  totalTimeMs: number;
  score: number;
  clearedHiddenBonus: boolean;
}

export interface LadderState {
  tier: Tier;
  tierIndex: number;
  phase: LadderPhase;
  stageInTier: number;
  results: RoundResult[];
  clearedTierBadges: Set<Tier>;
  overallResults: RoundResult[];
  failed: boolean;
  reachedLimitBreak: boolean;
  clearedLimitBreak: boolean;
  lastCleared: ClearedTierSnapshot | null;
}

/**
 * Drives the continuous Easy -> Medium -> Hard -> Boss -> (Limit Break) ladder.
 * Pure state machine — no rendering, no Phaser.
 */
export class LadderEngine {
  private state: LadderState;

  constructor(startTier: Tier) {
    this.state = {
      tier: startTier,
      tierIndex: TIER_ORDER.indexOf(startTier),
      phase: 'basic',
      stageInTier: 1,
      results: [],
      clearedTierBadges: new Set(),
      overallResults: [],
      failed: false,
      reachedLimitBreak: false,
      clearedLimitBreak: false,
      lastCleared: null,
    };
  }

  getState(): Readonly<LadderState> {
    return this.state;
  }

  submitRoundResult(result: RoundResult): LadderState {
    this.state.overallResults.push(result);

    if (this.state.phase === 'basic') {
      this.state.results.push(result);

      // Mistakes no longer end the run early — the player always plays all 5
      // basic rounds. A mistake just means this attempt won't clear the tier
      // (no unlock, no leaderboard credit), decided once round 5 is in.
      if (this.state.stageInTier < 5) {
        this.state.stageInTier++;
        return this.state;
      }

      const allCorrect = this.state.results.every(r => r.status === 'correct');

      if (!allCorrect) {
        this.state.failed = true;
        this.state.phase = 'game_over';
        return this.state;
      }

      this.state.phase = 'tier_cleared';
      this.state.lastCleared = {
        tier: this.state.tier,
        totalTimeMs: Math.round(this.state.results.reduce((a, r) => a + r.timeTaken * 1000, 0)),
        score: this.state.results.reduce((a, r) => a + r.points, 0),
        clearedHiddenBonus: false,
      };
      return this.state;
    }

    if (this.state.phase === 'hidden_bonus') {
      if (result.status !== 'correct') {
        this.state.failed = true;
        this.state.phase = 'game_over';
        return this.state;
      }

      if (this.state.stageInTier < 10) {
        this.state.stageInTier++;
        return this.state;
      }

      this.state.clearedTierBadges.add(this.state.tier);
      if (this.state.lastCleared?.tier === this.state.tier) {
        this.state.lastCleared = { ...this.state.lastCleared, clearedHiddenBonus: true };
      }
      this.advanceAfterTierFullyResolved();
      return this.state;
    }

    if (this.state.phase === 'limit_break') {
      if (result.status !== 'correct') {
        this.state.failed = true;
      } else {
        this.state.clearedLimitBreak = true;
      }
      this.state.phase = 'run_complete';
      return this.state;
    }

    return this.state;
  }

  resolveTierClearedTransition(): LadderState {
    if (this.state.phase !== 'tier_cleared') return this.state;

    if (this.checkBenchmark()) {
      this.state.phase = 'hidden_bonus';
      this.state.stageInTier = 6;
      return this.state;
    }

    this.advanceAfterTierFullyResolved();
    return this.state;
  }

  /** Fixed benchmark check — average seconds/round vs. UNLOCK_TARGETS for this tier. */
  private checkBenchmark(): boolean {
    const target = UNLOCK_TARGETS[this.state.tier];
    const totalMs = this.state.results.reduce((a, r) => a + r.timeTaken * 1000, 0);
    const avgSec = totalMs / this.state.results.length / 1000;
    return avgSec <= target;
  }

  /**
   * A tier's session always ends here now — clearing Easy no longer silently
   * chains into Medium's countdown. The only exception is Boss: clearing its
   * hidden bonus stages chains into Limit Break, since that's still part of
   * the SAME tier's flow, not a jump to a different tier.
   */
  private advanceAfterTierFullyResolved(): void {
    if (this.state.tier === 'boss' && this.state.clearedTierBadges.has('boss')) {
      this.state.phase = 'limit_break';
      this.state.stageInTier = 11;
      this.state.reachedLimitBreak = true;
      return;
    }
    this.state.phase = 'run_complete';
  }

  getHighestTierReachedThisRun(): Tier {
    return this.state.tier;
  }

  hasLimitBreakAward(): boolean {
    return this.state.clearedLimitBreak;
  }

  getLastClearedSnapshot(): ClearedTierSnapshot | null {
    return this.state.lastCleared;
  }
}

export function mergeHighestUnlockedTier(saved: Tier, reachedThisRun: Tier): Tier {
  return TIER_ORDER.indexOf(reachedThisRun) > TIER_ORDER.indexOf(saved) ? reachedThisRun : saved;
}
