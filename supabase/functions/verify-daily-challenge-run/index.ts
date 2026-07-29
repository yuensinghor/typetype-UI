// supabase/functions/verify-daily-challenge-run/index.ts
//
// Phase 1.5 — score integrity for Daily Challenge.
//
// The client still sends its full run (per-round playerInput + timeTaken),
// but nothing it computes itself (points, status, totalScore) is trusted.
// This function independently re-derives every round's correctness and
// score from the row this same date's get-daily-challenge function already
// locked into `daily_challenges`, then writes the verified result. Clients
// no longer write to game_events or daily_challenge_best directly for this
// mode — both tables' insert/update policies are service-role-only for
// daily_challenge_best (see migration 007), so this function is the only
// path that can create a leaderboard row.
//
// What this catches: editing the submitted score/points in devtools or a
// raw HTTP request (now completely ignored — recomputed server-side from
// scratch), and claiming a wrong answer was correct (checked against the
// real stored equation, not whatever the client says the target was).
//
// What this does NOT fully catch: a sufficiently patient attacker who
// submits plausible-looking per-round timings for answers they didn't
// actually type in real time. Closing that gap needs full server-driven
// round timing (server issues each equation and starts its own clock),
// which is a bigger change — this is intentionally scoped to eliminate the
// trivial "edit one number" exploit and add a typing-speed plausibility
// floor, not to build a fully server-authoritative game loop.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Tier = 'easy' | 'medium' | 'hard' | 'boss';

interface DailyEquation {
  stage: number;
  kind: 'basic' | 'bonus';
  display: string;
}

interface SubmittedRound {
  roundIndex: number;
  playerInput: string;
  timeTaken: number; // seconds, client-reported — re-clamped below, never trusted directly
}

interface VerifyRequestBody {
  userId: string;
  challengeDate: string;
  results: SubmittedRound[];
}

const TOTAL_BASIC = 5;
const TOTAL_STAGES = 10;
const MAX_INPUT_LENGTH = 64; // sanity guard against absurd payloads

const STAGE_TIER: Record<number, Tier> = {
  1: 'easy', 2: 'easy', 3: 'medium', 4: 'hard', 5: 'boss',
  6: 'boss', 7: 'boss', 8: 'boss', 9: 'boss', 10: 'boss',
};

// Mirrors RAMP.start values in src/lib/equation.ts (stages 1-5 always use
// roundIndex=1 within Daily Challenge, i.e. the ramp's start value).
const RAMP_START: Record<Tier, number> = {
  easy: 2.0,
  medium: 4.0,
  hard: 6.0,
  boss: 8.0,
};

const UNLOCK_TARGET_BOSS = 5.5; // mirrors UNLOCK_TARGETS.boss in equation.ts

// A very generous typing-speed floor (20 chars/sec) — anything faster than
// this for a given target length is not a real human input, regardless of
// what timeTaken the client reports. Purely a plausibility clamp, not a
// skill assessment.
const MIN_SECONDS_PER_CHAR = 0.05;

function stripSpaces(s: string): string {
  return String(s ?? '').replace(/\s+/g, '');
}

function timeLimitForStage(stage: number): number {
  if (stage <= TOTAL_BASIC) {
    return RAMP_START[STAGE_TIER[stage]];
  }
  const factor = Math.pow(0.95, stage - 6);
  return parseFloat((UNLOCK_TARGET_BOSS * factor).toFixed(3));
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
    const { userId, challengeDate, results } = body;

    if (!userId || !challengeDate || !Array.isArray(results)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid fields' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service-role: bypasses RLS, server-only
    );

    // 1. Fetch the real, already-locked equation set for this date. This is
    // the single source of truth for both the target text and the
    // benchmark — never trust anything the client says about either.
    const { data: daily, error: dailyError } = await supabase
      .from('daily_challenges')
      .select('equation_set, speed_benchmark_ms')
      .eq('challenge_date', challengeDate)
      .maybeSingle();

    if (dailyError) throw dailyError;
    if (!daily) {
      return new Response(JSON.stringify({ error: 'Unknown challenge date' }), { status: 400 });
    }

    const equationSet = daily.equation_set as DailyEquation[];
    const speedBenchmarkMs = daily.speed_benchmark_ms as number;

    // 2. Re-derive each round's correctness/points from scratch. Rounds are
    // keyed by array position, not by any index the client sends.
    const basicPoints: number[] = [];
    const basicTimesMs: number[] = [];
    let basicAllCorrect = true;

    const bonusPoints: number[] = [];
    let bonusCorrectCount = 0;

    const cappedResults = results.slice(0, TOTAL_STAGES);

    for (let i = 0; i < cappedResults.length; i++) {
      const stage = i + 1;
      const eq = equationSet[i];
      if (!eq) break;

      const submitted = cappedResults[i];
      const target = stripSpaces(eq.display);
      const playerInput = stripSpaces(String(submitted?.playerInput ?? '')).slice(0, MAX_INPUT_LENGTH);
      const timeLimit = timeLimitForStage(stage);

      const minPlausible = target.length * MIN_SECONDS_PER_CHAR;
      const rawTimeTaken = Number.isFinite(submitted?.timeTaken) ? Number(submitted.timeTaken) : timeLimit;
      const clampedTimeTaken = Math.min(timeLimit, Math.max(minPlausible, rawTimeTaken));

      const isCorrect = playerInput === target;
      const points = pointsForRound(isCorrect, clampedTimeTaken, timeLimit);

      if (stage <= TOTAL_BASIC) {
        basicPoints.push(points);
        basicTimesMs.push(clampedTimeTaken * 1000);
        if (!isCorrect) basicAllCorrect = false;
      } else {
        bonusPoints.push(points);
        if (isCorrect) bonusCorrectCount++;
      }
    }

    // Bonus stages only ever count if the basic 5 genuinely earned them —
    // padding fake bonus-stage results without a qualifying basic run
    // doesn't help; they're discarded entirely below.
    const avgBasicMs = basicTimesMs.length
      ? basicTimesMs.reduce((a, b) => a + b, 0) / basicTimesMs.length
      : Infinity;
    const reachedBonus = basicAllCorrect && basicTimesMs.length === TOTAL_BASIC && avgBasicMs <= speedBenchmarkMs;

    const verifiedTotalScore =
      basicPoints.reduce((a, b) => a + b, 0) + (reachedBonus ? bonusPoints.reduce((a, b) => a + b, 0) : 0);
    const bonusStagesCleared = reachedBonus ? bonusCorrectCount : 0;

    // 3. Write the verified log row (raw submission kept in payload for
    // history/debugging; verified_score is the only trusted number).
    const { error: insertError } = await supabase.from('game_events').insert({
      user_id: userId,
      mode: 'daily_challenge',
      payload: { challengeDate, results, reachedBonus, bonusStagesCleared },
      verified_score: verifiedTotalScore,
    });
    if (insertError) throw insertError;

    // 4. Upsert the per-day best — only if this run beats the existing one.
    const { data: existingBest } = await supabase
      .from('daily_challenge_best')
      .select('total_score')
      .eq('user_id', userId)
      .eq('challenge_date', challengeDate)
      .maybeSingle();

    if (!existingBest || verifiedTotalScore > existingBest.total_score) {
      const { error: upsertError } = await supabase.from('daily_challenge_best').upsert(
        {
          user_id: userId,
          challenge_date: challengeDate,
          total_score: verifiedTotalScore,
          reached_bonus: reachedBonus,
          bonus_stages_cleared: bonusStagesCleared,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,challenge_date' },
      );
      if (upsertError) throw upsertError;
    }

    return new Response(
      JSON.stringify({ verifiedTotalScore, reachedBonus, bonusStagesCleared }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[verify-daily-challenge-run] error:', err);
    return new Response(JSON.stringify({ error: 'Failed to verify run' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});