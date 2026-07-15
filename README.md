# TypeType ⚡ — typetype.fun

A fast-paced numeric equation-transcription game. Equations flash on screen —
type them back exactly, as fast as you can. Originally built as a Reddit
Devvit mini-game, now a standalone installable PWA with no Reddit dependency
and no forced signup.

## What's here

- **Continuous ladder**: Easy → Medium → Hard → Boss, one climb per run.
  5 basic stages per tier; 100% accuracy plus a time limit is required to
  advance.
- **Hidden bonus stages (6–10)**: unlock per-tier if you beat that tier's
  dynamic community-median speed benchmark. Mandatory once unlocked — one
  mistake ends the run. Earns a cosmetic badge only; doesn't affect ladder
  rank. No benchmark reached just means you skip ahead to the next tier, no
  penalty.
- **Limit Break (stage 11)**: only reachable after clearing Boss tier's
  hidden bonus stages.
- **Progress auto-resumes** at your highest unlocked tier, saved
  permanently; you can always choose to replay from Easy.
- **Identity**: Google login (Supabase Auth) or guest nickname — no forced
  signup.
- **Rankings**: one combined ladder leaderboard (climb progress, then speed)
  plus a "My Squad" board for people connected via invite link.
- **Challenge flow**: share an invite link and a new visitor can try a
  quick 5-round test version of the game and compare their score against
  yours before ever creating an account.
- **Quit/retry**: the first few quits per run are free; after that, a
  one-time rewarded ad unlocks unlimited quit/retry permanently, tied to
  your account (or to the browser via localStorage as a guest).
- **Installable PWA**: native install prompt on Android/Chrome; guided
  "Add to Home Screen" instructions on iOS.
- **Portal-ready**: all ads/leaderboard/save calls go through
  `PlatformAdapter` (`src/lib/platformAdapter.ts`). The standalone site uses
  `StandaloneAdapter` (Supabase + a rewarded-ad stub). To submit to
  Poki/CrazyGames later, write a new adapter implementing the same
  interface and swap it in — no scene or game-logic changes needed.

## Setup

1. **Supabase project**: create one at supabase.com, then run
   `supabase/schema.sql` in the SQL editor (and any additional migration
   files under `supabase/migrations/`, in order).
2. **Google OAuth**: in Supabase Auth settings, enable the Google provider
   and add your OAuth client ID/secret (from Google Cloud Console). Add your
   domain (`https://typetype.fun` and `http://localhost:5173` for dev) to
   the authorized redirect URIs.
3. **Env vars**: copy `.env.example` to `.env` and fill in your Supabase
   project URL and anon key.
4. **Install & run**:

   ```
   npm install
   npm run dev
   ```

5. **Build for production**:

   ```
   npm run build
   ```

   Output goes to `dist/` — deploy that folder to Vercel.

## Still TODO before launch

- **PWA icons**: `vite.config.ts` references `public/icons/icon-192.png`,
  `icon-512.png`, `icon-512-maskable.png` — confirm real artwork is in
  place, or the install prompt will show a broken icon.
- **Rewarded ad network**: `StandaloneAdapter.showRewardedAd()` is currently
  a stub that auto-grants the reward after a short delay. Wire in a real
  network's SDK (e.g. AdinPlay, Google Ad Manager rewarded web ads) before
  launch.
- **RLS hardening**: the Supabase policies in `schema.sql` are permissive to
  keep guest-mode writes working without a service role. Before launch,
  consider tightening `profiles`/`player_progress` update policies (e.g. via
  a Postgres function that validates guest UUIDs) if abuse becomes a
  concern.
- **Google OAuth + Challenge flow**: Google sign-in currently wipes the
  in-memory challenge context on redirect, so a challenged guest who signs
  in with Google lands on the generic menu instead of their challenge
  result. Fix planned: stash `challengeContext` in `sessionStorage` before
  redirect, restore on boot.

## Project structure

```
src/
  main.ts                — entry point, captures ?ref= invite codes
  game.ts                — Phaser game instance + identity accessors
  scenes/
    Boot.ts
    Preloader.ts          — resolves identity, loads ladder + benchmarks
    MainMenu.ts            — ladder progress, combined leaderboard, squad, invite
    Game.ts                — round loop driven by the ladder engine
    GameOver.ts             — submits run, saves progress, shows rankings
    ChallengeLanding.ts       — invite-link landing screen for guests
    ChallengeTestRound.ts      — standalone 5-round challenge test
    ChallengeResult.ts          — win/lose/no-record comparison screen
  lib/
    ladderEngine.ts         — pure state machine for tier/bonus/limit-break progression
    equation.ts              — arithmetic generator + time limits per tier
    audio.ts                  — WebAudio synth sound effects (no asset files needed)
    identity.ts                — Google/guest auth, invite link capture
    keypad.ts                   — shared numeric keypad UI
    supabaseClient.ts            — Supabase client singleton
    platformAdapter.ts            — interface for ads/leaderboard/save (portal-ready)
    standaloneAdapter.ts           — Supabase-backed implementation of the adapter
    installPrompt.ts                — PWA install-prompt capture (Android/iOS)
    installUI.ts                     — install button + iOS instructions modal
    theme.ts                          — colors, fonts, shared style tokens
    globalStyles.ts                    — font loading, background pattern, animations
    floatingNumbers.ts                  — decorative background digits/operators
  shared/
    types.ts                             — Tier, LadderEntry, RoundResult, RankOvertake, etc.
supabase/
  schema.sql                             — run this first in the Supabase SQL editor
  migrations/                             — run in order after schema.sql
```

## Notes for contributors

Internal identifiers (`dd_` localStorage keys, `dd-shell`/`dd-frame` CSS
classes, `[DigitDash]` console log prefixes) are intentionally left
unchanged from the project's original name to avoid breaking existing
testers' saved sessions. Only user-facing copy has been renamed to
TypeType.