# Digit Dash ⚡ — Web Edition

Standalone PWA port of the Digit Dash speed-decoding tournament (formerly a Reddit
Devvit app). No Devvit dependency, no forced subreddit — just the game.

## What's here

- **Continuous ladder**: Easy → Medium → Hard → Boss, one climb per run.
- **Hidden bonus stages (6–10)**: unlock per-tier if you beat that tier's dynamic
  community-median speed benchmark. Mandatory once unlocked — one mistake ends the run.
  Cosmetic badge only; doesn't affect ladder rank.
- **Limit Break (stage 11)**: only reachable after clearing Boss tier's hidden bonus stages.
- **Progress auto-resumes** at your highest unlocked tier; you can always choose to
  replay from Easy.
- **Identity**: Google login (Supabase Auth) or guest nickname — no forced signup.
- **Rankings**: one combined ladder leaderboard (climb progress, then speed) +
  a "My Squad" board for people who joined via your invite link.
- **Quit/retry**: first few quits per run are free; after that, a rewarded ad
  unlocks unlimited quit/retry permanently for your account.
- **Portal-ready**: all ads/leaderboard/save calls go through `PlatformAdapter`
  (`src/lib/platformAdapter.ts`). The standalone site uses `StandaloneAdapter`
  (Supabase + a rewarded-ad stub). To submit to Poki/CrazyGames later, write a new
  adapter implementing the same interface and swap it in `src/lib/standaloneAdapter.ts`'s
  export — no scene or game-logic changes needed.

## Setup

1. **Supabase project**: create one at supabase.com, then run `supabase/schema.sql`
   in the SQL editor.
2. **Google OAuth**: in Supabase Auth settings, enable the Google provider and add
   your OAuth client ID/secret (from Google Cloud Console). Add your domain
   (`https://digitdash67.com` and `http://localhost:5173` for dev) to the
   authorized redirect URIs.
3. **Env vars**: copy `.env.example` to `.env` and fill in your Supabase project URL
   and anon key.
4. **Install & run**:
   ```
   npm install
   npm run dev
   ```
5. **Build for production**:
   ```
   npm run build
   ```
   Output goes to `dist/` — deploy that folder to Vercel or Netlify.

## Still TODO before launch

- **PWA icons**: `vite.config.ts` references `public/icons/icon-192.png`,
  `icon-512.png`, `icon-512-maskable.png` — these don't exist yet, add real
  artwork or the install prompt will show a broken icon.
- **Rewarded ad network**: `StandaloneAdapter.showRewardedAd()` is currently a
  stub that auto-grants the reward after a short delay. Wire in your chosen
  network's SDK (e.g. AdinPlay, Google Ad Manager rewarded web ads) there.
- **RLS hardening**: the Supabase policies in `schema.sql` are permissive to keep
  guest-mode writes working without a service role. Before launch, consider
  tightening `profiles`/`player_progress` update policies (e.g. via a Postgres
  function that validates guest UUIDs) if abuse becomes a concern.
- **Domain**: point `digitdash67.com` at your Vercel/Netlify deployment once
  you've picked a registrar.

## Project structure

```
src/
  main.ts              — entry point, captures ?ref= invite codes
  game.ts               — Phaser game instance + identity accessors
  scenes/
    Boot.ts
    Preloader.ts        — resolves identity, loads ladder + benchmarks
    MainMenu.ts          — ladder progress, combined leaderboard, squad, invite
    Game.ts              — round loop driven by the ladder engine
    GameOver.ts           — submits run, saves progress, shows rankings
  lib/
    ladderEngine.ts       — pure state machine for tier/bonus/limit-break progression
    equation.ts            — arithmetic generator + time limits per tier
    audio.ts                — WebAudio synth sound effects (no asset files needed)
    identity.ts               — Google/guest auth, invite link capture
    supabaseClient.ts          — Supabase client singleton
    platformAdapter.ts          — interface for ads/leaderboard/save (portal-ready)
    standaloneAdapter.ts         — Supabase-backed implementation of the adapter
  shared/
    types.ts                     — Tier, LadderEntry, RoundResult, etc.
supabase/
  schema.sql                      — run this in the Supabase SQL editor
```
