// src/lib/achievements.ts
//
// Badge definitions for the Achievements screen, plus real unlock-checking
// against whatever's already tracked in the database. Design brief: badges
// should feel like "legends, myths, and secrets" — not generic "Fast
// Typist"/"Level Master" filler. See the design mockup this was built from
// for the full rationale on tiering and the visual system.
//
// SCOPE NOTE: 6 of 15 badges below are wired to real, already-tracked data
// (Limit Break, hidden-bonus-stage, speed-benchmark, and 3-star-level
// columns all already exist for other features). The remaining 9 need new
// tracking that doesn't exist yet (WPM computation, backspace-free streak,
// login-streak/time-of-day tracking) — those are marked `trackable: false`
// and always render locked with a "not yet tracked" note instead of a real
// unlock check, so the screen is honest about what's live vs. planned
// rather than silently always-locked or fake-random.

import { supabase } from './supabaseClient';
import { platform } from './standaloneAdapter';
import { fetchLevelProgress } from './levels';

export type BadgeTier = 'explorer' | 'skilled' | 'master' | 'elite' | 'legendary' | 'mythical';
export type BadgeIcon =
  | 'bolt' | 'tornado' | 'target' | 'ghost' | 'key' | 'door' | 'rocket'
  | 'mountain' | 'crown' | 'galaxy' | 'mask' | 'owl' | 'flame' | 'dice' | 'rabbit';

export interface BadgeDef {
  id: string;
  tier: BadgeTier;
  icon: BadgeIcon;
  emoji: string;
  name: string;
  quote: string;
  unlockLabel: string; // short, always-visible description of the unlock condition
  stars: number;
  secret?: boolean; // shows a "?" silhouette instead of name/quote until unlocked
  trackable: boolean; // false = no live data source yet, always renders locked
}

export const BADGES: BadgeDef[] = [
  { id: 'zero_miss', tier: 'explorer', icon: 'target', emoji: '🎯', name: 'ZERO MISS',
    quote: 'Perfection leaves no typo behind.', unlockLabel: 'Complete a stage with 100% accuracy',
    stars: 3, trackable: true },

  { id: 'flash', tier: 'skilled', icon: 'bolt', emoji: '⚡', name: 'FLASH',
    quote: 'You saw it. Then it was already typed.', unlockLabel: 'Reach 120+ WPM',
    stars: 3, trackable: false },
  { id: 'rabbit_hole', tier: 'skilled', icon: 'rabbit', emoji: '🐇', name: 'RABBIT HOLE',
    quote: 'Curiosity has its own reward.', unlockLabel: 'Enter the Hidden Stage 10 times',
    stars: 3, secret: true, trackable: false },

  { id: 'stormfinger', tier: 'master', icon: 'tornado', emoji: '🌪', name: 'STORMFINGER',
    quote: "The keyboard couldn\u2019t keep up.", unlockLabel: 'Reach 150+ WPM',
    stars: 4, trackable: false },
  { id: 'keymaster', tier: 'master', icon: 'key', emoji: '🔑', name: 'KEYMASTER',
    quote: 'Every stage, conquered.', unlockLabel: 'Clear all normal stages (Easy → Boss)',
    stars: 4, trackable: true },
  { id: 'ninja', tier: 'master', icon: 'mask', emoji: '🕶', name: 'NINJA',
    quote: 'No hesitation. No correction.', unlockLabel: 'Type 500 characters with zero backspaces',
    stars: 4, secret: true, trackable: false },
  { id: 'night_owl', tier: 'master', icon: 'owl', emoji: '☕', name: 'NIGHT OWL',
    quote: 'The stage never sleeps. Neither do you.', unlockLabel: 'Play after midnight, 7 days',
    stars: 4, secret: true, trackable: false },

  { id: 'ghost_run', tier: 'elite', icon: 'ghost', emoji: '👻', name: 'GHOST RUN',
    quote: 'Most players never knew this stage existed.', unlockLabel: 'Clear the Hidden Stage',
    stars: 5, trackable: true },
  { id: 'beyond_the_door', tier: 'elite', icon: 'door', emoji: '🚪', name: 'BEYOND THE DOOR',
    quote: 'Some doors only appear for the worthy.', unlockLabel: 'Discover the Hidden Stage',
    stars: 5, secret: true, trackable: false },
  { id: 'warp_speed', tier: 'elite', icon: 'rocket', emoji: '🚀', name: 'WARP SPEED',
    quote: 'This player is FAST.', unlockLabel: 'Reach the speed that unlocks the Hidden Stage',
    stars: 5, secret: true, trackable: true },
  { id: 'unstoppable', tier: 'elite', icon: 'flame', emoji: '🔥', name: 'UNSTOPPABLE',
    quote: 'Every single day. No exceptions.', unlockLabel: '30-day play streak',
    stars: 5, secret: true, trackable: false },
  { id: 'lucky_777', tier: 'elite', icon: 'dice', emoji: '🎲', name: 'LUCKY 777',
    quote: "Some things you can\u2019t practice for.", unlockLabel: 'Score exactly 77.7 WPM',
    stars: 5, secret: true, trackable: false },

  { id: 'last_human', tier: 'legendary', icon: 'mountain', emoji: '🏔', name: 'LAST HUMAN',
    quote: 'Few have seen this place.', unlockLabel: 'Reach the Limit Break tier',
    stars: 6, trackable: true },

  { id: 'type_titan', tier: 'mythical', icon: 'crown', emoji: '👑', name: 'TYPE TITAN',
    quote: 'The impossible was typed.', unlockLabel: 'Beat the Limit Break tier',
    stars: 7, trackable: true },
  { id: 'transcendence', tier: 'mythical', icon: 'galaxy', emoji: '🌌', name: 'TRANSCENDENCE',
    quote: 'Beyond speed. Beyond perfection.', unlockLabel: 'Beat Limit Break with 100% accuracy',
    stars: 10, trackable: false },
];

export const TIER_ORDER: BadgeTier[] = ['explorer', 'skilled', 'master', 'elite', 'legendary', 'mythical'];
export const TIER_LABELS: Record<BadgeTier, string> = {
  explorer: 'Explorer 🥉', skilled: 'Skilled 🥈', master: 'Master 🥇',
  elite: 'Elite 💎', legendary: 'Legendary 👑', mythical: 'Mythical 🌌',
};

/**
 * Checks every `trackable: true` badge against its real data source and
 * returns the set of unlocked badge ids. Badges with `trackable: false`
 * are never included here — the UI treats them as permanently locked with
 * a "not yet tracked" note until their underlying stat gets built.
 */
export async function fetchUnlockedAchievements(userId: string): Promise<Set<string>> {
  const unlocked = new Set<string>();
  if (!userId) return unlocked;

  try {
    const [ladderProgress, levelProgress, ladderRow, tierRunRows] = await Promise.all([
      platform.loadProgress<{
        badges: { easy: boolean; medium: boolean; hard: boolean; boss: boolean };
        hasLimitBreakAward: boolean;
      }>(userId, 'ladder_progress'),
      fetchLevelProgress(userId),
      supabase.from('ladder_leaderboard')
        .select('cleared_hidden_bonus_tiers, has_limit_break_award')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase.from('tier_runs')
        .select('reached_limit_break, beat_benchmark')
        .eq('user_id', userId),
    ]);

    // ZERO MISS — any 3-star level (3★ = perfect + fast, i.e. zero mistakes)
    if (levelProgress && Object.values(levelProgress.starsByLevel).some(s => s === 3)) {
      unlocked.add('zero_miss');
    }

    // KEYMASTER — cleared Easy through Boss
    if (ladderProgress?.badges.easy && ladderProgress.badges.medium
      && ladderProgress.badges.hard && ladderProgress.badges.boss) {
      unlocked.add('keymaster');
    }

    // GHOST RUN — cleared at least one hidden bonus tier
    const clearedHidden = ladderRow.data?.cleared_hidden_bonus_tiers as string[] | null;
    if (clearedHidden && clearedHidden.length > 0) {
      unlocked.add('ghost_run');
    }

    // WARP SPEED — beat the speed benchmark that unlocks a hidden tier, at least once
    if (tierRunRows.data?.some(r => r.beat_benchmark)) {
      unlocked.add('warp_speed');
    }

    // LAST HUMAN — reached Limit Break at least once (doesn't require clearing it)
    if (tierRunRows.data?.some(r => r.reached_limit_break)) {
      unlocked.add('last_human');
    }

    // TYPE TITAN — cleared Limit Break at least once
    if (ladderProgress?.hasLimitBreakAward || ladderRow.data?.has_limit_break_award) {
      unlocked.add('type_titan');
    }
  } catch (err) {
    console.error('[TypeType] fetchUnlockedAchievements failed:', err);
  }

  return unlocked;
}
