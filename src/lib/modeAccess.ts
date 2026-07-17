// src/lib/modeAccess.ts
//
// Single source of truth for "can this player enter this mode right now."
// Every screen/scene that gates entry to a mode should call canAccessMode()
// instead of writing its own guest/login/unlock check.

export type GameMode =
  | 'challenge_categories'  // existing 4-tier ladder, friends-only funnel
  | 'daily_challenge'       // Phase 1
  | 'endless'               // Phase 3
  | 'levels'                // Phase 4
  | 'battle_pass';          // Phase 5 (not a "mode" you enter, but gated the same way)

// Minimal shape for now — PlayerUnlocks gets filled in properly by the
// player_unlocks read model (next step). Fields default to false/0 until
// then, which just means every gated mode reports "locked" — correct
// behavior since none of those modes exist yet either.
export interface PlayerUnlocks {
  clearedEasyTier: boolean;      // gates daily_challenge
  distinctDaysPlayedDaily: number; // gates endless (needs >= 7)
  endlessRunsCompleted: number;    // gates levels (needs >= N, TBD in Phase 4)
}

export interface AuthState {
  isLoggedIn: boolean;
  unlocks: PlayerUnlocks;
}

export interface AccessResult {
  allowed: boolean;
  reason?: 'guest_not_allowed' | 'locked' | 'not_yet_available';
  // Optional context for teaser UI (Phase 0's "locked slots" + later phases'
  // progress pips) to render something concrete instead of a generic lock icon.
  progress?: { current: number; required: number };
}

// Modes not built yet. Update this as each phase ships so the gate
// automatically stops reporting "not_yet_available" once the mode is real.
// Phase 1 shipped Daily Challenge — removed from this list.
const NOT_YET_BUILT: GameMode[] = ['endless', 'levels', 'battle_pass'];

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

  switch (mode) {
    case 'daily_challenge':
      // Unlocks after clearing Easy tier (5 stages) in Challenge Categories.
      return auth.unlocks.clearedEasyTier
        ? { allowed: true }
        : { allowed: false, reason: 'locked' };

    case 'endless': {
      const required = 7;
      const current = auth.unlocks.distinctDaysPlayedDaily;
      return current >= required
        ? { allowed: true }
        : { allowed: false, reason: 'locked', progress: { current, required } };
    }

    case 'levels': {
      const required = 10; // placeholder, finalize in Phase 4
      const current = auth.unlocks.endlessRunsCompleted;
      return current >= required
        ? { allowed: true }
        : { allowed: false, reason: 'locked', progress: { current, required } };
    }

    case 'battle_pass':
      // No separate gate — starts accumulating the moment a player logs in.
      return { allowed: true };

    default:
      return { allowed: false, reason: 'not_yet_available' };
  }
}
