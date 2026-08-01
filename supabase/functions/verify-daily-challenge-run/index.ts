// supabase/functions/verify-endless-run/index.ts
//
// Phase 1.5 — score integrity for Endless Mode.
//
// Unlike Daily Challenge, Endless has no pre-locked equation set to check
// against — every run is unique and equations generate on the fly. Instead,
// the client sends the random SEED it used to generate that run's sequence
// (see generateEquationSeeded in src/lib/equation.ts), and this function
// replays the identical seeded PRNG (mulberry32, ported inline below since
// Deno can't import from src/lib) to regenerate the exact same equations
// and independently check playerInput against them. Nothing the client
// reports about its own score, or what the target/equation even was, is
// trusted — only roundIndex, playerInput, and timeTaken feed the
// recomputation, exactly like verify-daily-challenge-run.
//
// One mistake ends an Endless run by design — this function enforces that
// server-side too: scoring stops at (and does not count) the first round
// that isn't a genuine correct answer, even if the client sent a longer
// results array claiming otherwise.
//
// What this catches: editing the submitted score in devtools/raw HTTP,
// claiming a wrong answer was correct, and claiming rounds continued past
// the run-ending miss.
//
// What this does NOT fully catch: someone picks their own seed (self-
// chosen, since Endless issues no server-side seed ahead of time) and thus
// already knows every "correct" answer in advance without playing, then
// submits fabricated-but-plausible timings. The MIN_SECONDS_PER_CHAR floor
// caps how much that's worth — the best that gets you is the same ceiling
// score a real human typing at the floor speed with zero mistakes would
// get, identical to Daily Challenge's existing worst case (its equation
// set is public too, via get-daily-challenge). Closing that gap needs a
// server-issued seed/timing model — intentionally out of scope here, same
// reasoning as verify-daily-challenge-run's own scoping note.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Tier = 'easy' | 'medium' | 'hard' | 'boss';

interface SubmittedRound {
  roundIndex: number;
  playerInput: string;
  timeTaken: number; // seconds, client-reported — re-clamped below, never trusted directly
}

interface VerifyRequestBody {
  userId: string;
  seed: number;
  results: SubmittedRound[];
}

const MAX_INPUT_LENGTH = 64; // sanity guard against absurd payloads
const MAX_ROUNDS = 500; // sanity cap — no legitimate run gets remotely close to this

// A very generous typing-speed floor (20 chars/sec) — anything faster than
// this for a given target length is not a real human input, regardless of
// what timeTaken the client reports. Purely a plausibility clamp, not a
// skill assessment. Matches verify-daily-challenge-run's floor exactly.
const MIN_SECONDS_PER_CHAR = 0.05;

// ── mulberry32 — ported from src/lib/prng.ts. Must stay byte-for-byte
// identical to the client's copy, or seeds stop reproducing the same
// sequence and every legitimate run would fail verification. ──────────────
type RandFn = () => number;

function mulberry32(seed: number): RandFn {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Equation generation — ported from src/lib/equation.ts's
// generateEquation/generateEquationSeeded. Must stay in lockstep with the
// client's version (same rand() call order and count per tier) or replayed
// sequences diverge. ─────────────────────────────────────────────────────
function rnd(rand: RandFn, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function padNum(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

function stripSpaces(s: string): string {
  return String(s ?? '').replace(/\s+/g, '');
}

function generateEquationTarget(rand: RandFn, tier: Tier): string {
  const op = rand() < 0.5 ? '+' : '-';
  switch (tier) {
    case 'easy': {
      const a = rnd(rand, 1, 9);
      const b = rnd(rand, 1, 9);
      return `${a}${op}${b}`;
    }
    case 'medium': {
      const a = rnd(rand, 10, 99);
      const b = rnd(rand, 10, 99);
      return `${a}${op}${b}`;
    }
    case 'hard': {
      const a = `${rnd(rand, 10, 99)}.${padNum(rnd(rand, 0, 99), 2)}`;
      const b = `${rnd(rand, 10, 99)}.${padNum(rnd(rand, 0, 99), 2)}`;
      return `${a}${op}${b}`;
    }
    case 'boss': {
      const a = `${rnd(rand, 1000, 9999)}.${padNum(rnd(rand, 0, 9999), 4)}`;
      const b = `${rnd(rand, 1000, 9999)}.${padNum(rnd(rand, 0, 9999), 4)}`;
      return `${a}${op}${b}`;
    }
  }
}

// ── Round -> tier / time-limit — ported from EndlessMode.ts's
// tierForRound/timeLimitForRound and equation.ts's RAMP/getTimeLimit. ──────
function tierForRound(round: number): Tier {
  if (round <= 5) return 'easy';
  if (round <= 10) return 'medium';
  if (round <= 15) return 'hard';
  return 'boss';
}

const RAMP: Record<Tier, { start: number; end: number }> = {
  easy: { start: 2.0, end: 1.4 },
  medium: { start: 4.0, end: 2.6 },
  hard: { start: 6.0, end: 4.0 },
  boss: { start: 8.0, end: 6.5 },
};

function getTimeLimit(tier: Tier, roundIndexInTier: number): number {
  const { start, end } = RAMP[tier];
  const t = Math.min(4, Math.max(0, roundIndexInTier - 1)) / 4;
  return start + (end - start) * t;
}

function timeLimitForRound(round: number): number {
  const tier = tierForRound(round);
  const roundInTier = round <= 20 ? ((round - 1) % 5) + 1 : 5;
  return getTimeLimit(tier, roundInTier);
}

function pointsForRound(isCorrect: boolean, clampedTimeTaken: number, timeLimit: number): number {
  if (!isCorrect) return 0;
  const speedBonus = Math.max(0, (timeLimit - clampedTimeTaken) * 8);
  return Math.round(100 + speedBonus);
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const body = (await req.json()) as VerifyRequestBody;
    const { userId, seed, results } = body;

    if (!userId || !Number.isFinite(seed) || !Array.isArray(results)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid fields' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service-role: bypasses RLS, server-only
    );

    // Replay the exact same seeded sequence the client used.
    const rand = mulberry32(seed);
    const cappedResults = results.slice(0, MAX_ROUNDS);

    let totalScore = 0;
    let roundsCleared = 0;
    let lastRound = 0;

    for (let i = 0; i < cappedResults.length; i++) {
      const round = i + 1;
      const tier = tierForRound(round);
      const target = generateEquationTarget(rand, tier);
      const timeLimit = timeLimitForRound(round);

      const submitted = cappedResults[i];
      const playerInput = stripSpaces(String(submitted?.playerInput ?? '')).slice(0, MAX_INPUT_LENGTH);

      const minPlausible = target.length * MIN_SECONDS_PER_CHAR;
      const rawTimeTaken = Number.isFinite(submitted?.timeTaken) ? Number(submitted.timeTaken) : timeLimit;
      const clampedTimeTaken = Math.min(timeLimit, Math.max(minPlausible, rawTimeTaken));

      const isCorrect = playerInput === target;
      const points = pointsForRound(isCorrect, clampedTimeTaken, timeLimit);

      lastRound = round;

      if (!isCorrect) break; // one mistake ends the run — anything after this round is discarded

      totalScore += points;
      roundsCleared++;
    }

    const highestTierReached = tierForRound(Math.max(1, lastRound));

    // Write the verified log row (raw submission kept in payload for
    // history/debugging; verified_score is the only trusted number).
    const { error: insertError } = await supabase.from('game_events').insert({
      user_id: userId,
      mode: 'endless',
      payload: { seed, results, roundsCleared, highestTierReached },
      verified_score: totalScore,
    });
    if (insertError) throw insertError;

    // Upsert the all-time best — only if this run beats the existing one.
    const { data: existingBest } = await supabase
      .from('endless_best')
      .select('total_score')
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingBest || totalScore > existingBest.total_score) {
      const { error: upsertError } = await supabase.from('endless_best').upsert(
        {
          user_id: userId,
          total_score: totalScore,
          rounds_cleared: roundsCleared,
          highest_tier_reached: highestTierReached,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (upsertError) throw upsertError;
    }

    return new Response(
      JSON.stringify({ verifiedTotalScore: totalScore, roundsCleared, highestTierReached }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[verify-endless-run] error:', err);
    return new Response(JSON.stringify({ error: 'Failed to verify run' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
