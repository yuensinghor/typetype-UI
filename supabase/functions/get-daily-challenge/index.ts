// supabase/functions/get-daily-challenge/index.ts
//
// Returns today's Daily Challenge equation set, generating and locking it
// on the FIRST request of the day, and simply returning the stored row for
// every request after that. This is the only path that ever creates rows in
// `daily_challenges` — clients never write to that table directly.
//
// Security model:
//   - SERVER_SECRET is a Supabase Edge Function secret, never shipped to any
//     client (not a VITE_ prefixed var). It salts the daily seed so nobody
//     outside this function can predict tomorrow's equation set.
//   - `daily_challenges.challenge_date` is the primary key, and RLS on the
//     table has no insert/update/delete policy for anon/authenticated roles.
//     Only this function's service-role key can write, and it can only ever
//     write once per date (see the upsert-on-conflict-do-nothing below).

import { createClient } from 'jsr:@supabase/supabase-js@2';

// ── Types (mirrors src/shared/types.ts Tier, kept in sync manually since
//    Edge Functions run in Deno and don't share the Vite build graph) ──────
type Tier = 'easy' | 'medium' | 'hard' | 'boss';

interface DailyEquation {
  stage: number; // 1-10
  kind: 'basic' | 'bonus';
  display: string; // transcription target, e.g. "47 + 23" — NOT an answer field
}

// ── Stage -> tier mapping (locked spec, confirmed with hor) ────────────────
// Stages 1-2: easy, 3: medium, 4: hard, 5: boss, 6-10 (bonus): boss format.
const STAGE_TIER: Record<number, Tier> = {
  1: 'easy',
  2: 'easy',
  3: 'medium',
  4: 'hard',
  5: 'boss',
  6: 'boss',
  7: 'boss',
  8: 'boss',
  9: 'boss',
  10: 'boss',
};

// Fixed benchmark (Phase 1: constant, not dynamic community-median — matches
// how the ladder itself already works via UNLOCK_TARGETS in equation.ts).
// Mirrors UNLOCK_TARGETS.boss since stage 5 (the basic-tier gate) is boss format.
const SPEED_BENCHMARK_MS = 5500; // == UNLOCK_TARGETS.boss (5.5s) * 1000

// ── Seeded PRNG (mulberry32) — deterministic, NOT Math.random() ────────────
// The client-side ladder keeps using real Math.random(); this seeded version
// exists ONLY here, so the same date always produces the same equation set.
function mulberry32(seed: number): () => number {
  let t = seed;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a 32-bit int seed (simple FNV-1a — fine for this purpose;
// this is not cryptographic, the SECRET is what provides the security).
function hashToSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function rnd(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function padNum(n: number, digits: number): string {
  return String(n).padStart(digits, '0');
}

// Deterministic equivalent of generateEquation() in src/lib/equation.ts —
// same tier formats, but driven by the seeded `rand` instead of Math.random.
function generateSeededEquation(tier: Tier, rand: () => number): string {
  const op = rand() < 0.5 ? '+' : '-';

  switch (tier) {
    case 'easy': {
      const a = rnd(rand, 1, 9);
      const b = rnd(rand, 1, 9);
      return `${a} ${op} ${b}`;
    }
    case 'medium': {
      const a = rnd(rand, 10, 99);
      const b = rnd(rand, 10, 99);
      return `${a} ${op} ${b}`;
    }
    case 'hard': {
      const a = `${rnd(rand, 10, 99)}.${padNum(rnd(rand, 0, 99), 2)}`;
      const b = `${rnd(rand, 10, 99)}.${padNum(rnd(rand, 0, 99), 2)}`;
      return `${a} ${op} ${b}`;
    }
    case 'boss': {
      const a = `${rnd(rand, 1000, 9999)}.${padNum(rnd(rand, 0, 9999), 4)}`;
      const b = `${rnd(rand, 1000, 9999)}.${padNum(rnd(rand, 0, 9999), 4)}`;
      return `${a} ${op} ${b}`;
    }
  }
}

function generateDailyEquationSet(seed: number): DailyEquation[] {
  const rand = mulberry32(seed);
  const equations: DailyEquation[] = [];
  for (let stage = 1; stage <= 10; stage++) {
    const tier = STAGE_TIER[stage];
    equations.push({
      stage,
      kind: stage <= 5 ? 'basic' : 'bonus',
      display: generateSeededEquation(tier, rand),
    });
  }
  return equations;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // service-role: bypasses RLS, server-only
    );

    const challengeDate = todayUtc();

    // 1. Check if today's row already exists.
    const { data: existing, error: selectError } = await supabase
      .from('daily_challenges')
      .select('challenge_date, equation_set, speed_benchmark_ms')
      .eq('challenge_date', challengeDate)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      return new Response(JSON.stringify(existing), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. First request of the day — generate and attempt to lock it in.
    const serverSecret = Deno.env.get('SERVER_SECRET');
    if (!serverSecret) {
      throw new Error('SERVER_SECRET is not configured on this Edge Function');
    }

    const seed = hashToSeed(challengeDate + serverSecret);
    const equationSet = generateDailyEquationSet(seed);

    const { error: insertError } = await supabase
      .from('daily_challenges')
      .upsert(
        {
          challenge_date: challengeDate,
          equation_set: equationSet,
          speed_benchmark_ms: SPEED_BENCHMARK_MS,
        },
        { onConflict: 'challenge_date', ignoreDuplicates: true },
      );

    if (insertError) throw insertError;

    // 3. Re-select regardless of whether WE won the race or another
    //    concurrent request did — this guarantees every caller converges
    //    on the exact same stored row.
    const { data: finalRow, error: finalError } = await supabase
      .from('daily_challenges')
      .select('challenge_date, equation_set, speed_benchmark_ms')
      .eq('challenge_date', challengeDate)
      .single();

    if (finalError) throw finalError;

    return new Response(JSON.stringify(finalRow), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[get-daily-challenge] error:', err);
    return new Response(JSON.stringify({ error: 'Failed to load daily challenge' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
