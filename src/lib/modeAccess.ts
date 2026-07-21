// src/lib/modeAccess.ts
//
// Single source of truth for "can this player enter this mode right now."
// Every screen/scene that gates entry to a mode should call canAccessMode()
// instead of writing its own guest/login/unlock check.
//
// v2 (nav redesign): replaces the old sequential chain (clear Easy ->
// Daily Challenge -> 7 Daily Challenge days -> Endless -> 10 Endless runs
// -> Levels) with a day-counter that runs independently of skill progress:
//   - Daily Challenge: all 4 ladder tiers cleared AND >= 3 distinct days played
//   - Endless + Levels: all 4 ladder tiers cleared AND >= 7 distinct days played (together)
// See 005_unlock_chain_v2.sql and playerUnlocks.ts.

export type GameMode =
  | 'challenge_categories'  // existing 4-tier ladder, friends-only funnel
  | 'daily_challenge'       // Phase 1
  | 'endless'               // Phase 3
  | 'levels'                // Phase 4
  | 'battle_pass';          // Phase 5 (not a "mode" you enter, but gated the same way)

export interface PlayerUnlocks {
  clearedAllTiers: boolean;   // all 4 ladder tiers (Easy->Medium->Hard->Boss) cleared
  distinctDaysPlayed: number; // calendar days with any activity, non-consecutive OK
}

export interface AuthState {
  isLoggedIn: boolean;
  unlocks: PlayerUnlocks;
}

export interface AccessResult {
  allowed: boolean;
  reason?: 'guest_not_allowed' | 'locked' | 'not_yet_available';
  // Optional context for the carousel's U-N-L-O-C-K progress bar and the
  // locked-page teaser, so it can show real progress instead of a plain lock.
  progress?: { current: number; required: number };
}

export const DAILY_CHALLENGE_DAYS_REQUIRED = 3;
export const ENDLESS_LEVELS_DAYS_REQUIRED = 7;

// Modes not built yet. Update this as each phase ships so the gate
// automatically stops reporting "not_yet_available" once the mode is real.
// Phase 1 shipped Daily Challenge — removed from this list.
// Phase 3 shipped Endless Mode — removed from this list.
const NOT_YET_BUILT: GameMode[] = ['levels', 'battle_pass'];

export function canAccessMode(mode: GameMode, auth: AuthState): AccessResult {
  // Challenge Categories: always open, guest or logged in.
  if (mode === 'challenge_categories') {
    return { allowed: true };
  }

  // Everything else requires login — guest state can't persist rank/stats/progress.
  if (!auth.isLoggedIn) {
    return { allowed: false, reason: 'guest_not_allowed' };
  }

  // Mode doesn't exist yet — Phase 0 shows it as a locked "coming soon" slot.
  if (NOT_YET_BUILT.includes(mode)) {
    return { allowed: false, reason: 'not_yet_available' };
  }

  const { clearedAllTiers, distinctDaysPlayed } = auth.unlocks;

  switch (mode) {
    case 'daily_challenge': {
      if (!clearedAllTiers) {
        // Tiers-cleared is a prerequisite with no partial progress to show
        // (it's a different axis than the day counter), so no progress here.
        return { allowed: false, reason: 'locked' };
      }
      return distinctDaysPlayed >= DAILY_CHALLENGE_DAYS_REQUIRED
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'locked',
            progress: { current: distinctDaysPlayed, required: DAILY_CHALLENGE_DAYS_REQUIRED },
          };
    }

    case 'endless':
    case 'levels': {
      if (!clearedAllTiers) {
        return { allowed: false, reason: 'locked' };
      }
      return distinctDaysPlayed >= ENDLESS_LEVELS_DAYS_REQUIRED
        ? { allowed: true }
        : {
            allowed: false,
            reason: 'locked',
            progress: { current: distinctDaysPlayed, required: ENDLESS_LEVELS_DAYS_REQUIRED },
          };
    }

    case 'battle_pass':
      // No separate gate — starts accumulating the moment a player logs in.
      return { allowed: true };

    default:
      return { allowed: false, reason: 'not_yet_available' };
  }
}
