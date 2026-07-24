# TypeType

**typetype.fun** — a browser-based numeric equation *transcription* game. Players type displayed equations back character-for-character, as fast and accurately as possible. There is no "answer" to solve — the displayed string **is** the target input.

Originally prototyped as a Reddit Devvit mini-game called **Digit Dash** (r/DigitDash67), now a fully independent, live-service PWA.

---

## Core mechanic (never violate)

- Equations are **transcription targets only** — players type what they see, they do not solve or compute anything.
- Only `+` and `-` operators are ever used. No `*` or `/`, anywhere — including the shared keypad.
- There is no answer field distinct from the display string.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Phaser 3 + TypeScript + Vite |
| Backend | Supabase (Postgres + Auth) |
| Hosting | Vercel (PWA via `vite-plugin-pwa`, `generateSW` mode) |
| Auth | Google OAuth (via Supabase), guest nickname mode |
| Ads | Google AdSense + H5 Games Ads (Ad Placement API) |

**Build command:** `npx vite build` (not `npm run build` / `tsc -b && vite build`) — bypasses pre-existing `flapBoard.ts` type errors.

**Repo:** [`github.com/yuensinghor/typetype-UI`](https://github.com/yuensinghor/typetype-UI) — primary source of truth.

**Supabase project:** `https://irtelqnpxkkwyfadraqz.supabase.co`

---

## Visual identity

Warm cream / coral / orange / yellow / mint palette. **Fredoka** (headlines) + **DM Sans** (body). Background decoration uses digits and operators (`0–9 + - .`), never QWERTY letters — the game is about numbers, not text.

---

## Internal naming (deliberately unchanged)

The game was renamed from **Digit Dash** to **TypeType**, user-facing only. These internal identifiers stay as-is since they're invisible to players and renaming risks breaking existing sessions:
- `localStorage` keys prefixed `dd_`
- CSS classes `dd-shell` / `dd-frame`
- Console log prefix `[DigitDash]`

---

## Game structure

TypeType is built around **one continuous carousel** (`Home.ts`) with the core modes below as swipeable pages, plus Levels' own map and social layer as deeper destinations reached from the Levels page. Swipe between pages is always allowed — only each page's action button is gated by unlock status.

### 1. Challenge Categories — ✅ Live

The core ladder: **Easy → Medium → Hard → Boss**, 5 basic stages per tier. Clearing all 5 at 100% accuracy within the time limit advances to the next tier. Beating a tier's speed benchmark unlocks mandatory hidden bonus stages (6–10) with a cosmetic-only badge; missing the benchmark skips ahead with no penalty. Limit Break (stage 11) is the final bonus after Boss's hidden stages. Always open to everyone, guest or logged in.

Equation shape per tier (`src/lib/equation.ts`):
- **Easy** — single digit (`7 + 3`)
- **Medium** — two digits (`47 + 23`)
- **Hard** — two decimals, `XX.XX` (`47.23 + 88.91`)
- **Boss** — two decimals, `XXXX.YYYY`, exactly 19 typed characters

Round time limits ramp linearly per tier (`RAMP` table) from a start to end value across stages 1–5.

Includes the **Challenge Flow** invite-link guest funnel (4 screens): `ChallengeLanding` (challenger's Easy score, Start/Give up) → `ChallengeTestRound` (5 rounds, 2.0s/round, standalone, score not saved) → `ChallengeResult` (win/lose/no-record comparison) → `Preloader`'s login-choice screen, re-skinned via `challengeContext`.

**Unlock:** none — open to guests.

---

### 2. Daily Challenge — ✅ Live

Same equation set for every player each day. Own landing page (challenge date + player's own best score today via `fetchMyBestToday`, self-only — no public leaderboard yet, pending score-integrity work). Fixed bugs: benchmark check now requires all 5 basic stages correct before checking speed; Quit modal now shares the same global free-quit counter as the rest of the game.

**Unlock:** all 4 ladder tiers cleared **and** ≥ 3 distinct days played.

**Not yet built:** Seasonal Rank Reset (monthly reset + rank badges), Rotating Weekly Modifiers (decimals/negatives/speed-focus days).

---

### 3. Endless Mode — ✅ Live

Infinite survival run, one mistake ends it. Instant "GO" flash (250ms delay) instead of a 3-2-1 countdown. Tier climbs through rounds 1–20, then holds at Boss difficulty. Writes to `game_events` (`mode: 'endless'`), no public leaderboard yet.

**Unlock:** all 4 ladder tiers cleared **and** ≥ 7 distinct days played (together with Levels, below).

**Not yet built:** Personal Mastery Stats (accuracy trend, avg reaction time, focus streak, PBs vs. your own past runs).

---

### 4. Levels — Island Archipelago — 🎯 In design, not yet built

Candy-Crush-style permanent numbered levels, procedurally generated so Supabase storage stays cheap. This is the highest design-risk mode, sequenced after Endless so it can reuse Endless's difficulty-curve logic.

**Unlock:** same gate as Endless — all 4 ladder tiers cleared **and** ≥ 7 distinct days played. No new gate code needed; `canAccessMode('levels')` already exists, just currently listed in `modeAccess.ts`'s `NOT_YET_BUILT` array.

**Level generator (new file — cannot extend `equation.ts`'s rigid `generateEquation()`, which is one fixed 2-term shape per tier with no trait mixing):** a **difficulty-budget system**. Each level has a target budget rising roughly with level number. Each trait has a point cost; the generator samples trait combinations (seeded RNG, `seed = level number` — `Math.random()` isn't reproducible, so a small seeded PRNG like mulberry32 is needed) that sum near the budget. This is what lets a short number with a decimal and a long number with no decimal land at the same difficulty.

v1 trait pool (deliberately narrow, widen after ~20-30 levels are playtested):

| Trait | Values | Cost |
|---|---|---|
| Digit length | 1 / 2 / 3-digit | 0 / 1 / 2 |
| Term count | 2 / 3 / 4 terms | 0 / 2 / 4 |
| Decimal present | no / yes (2dp) | 0 / 3 |

Budget curve v1: `budget(level) = floor(level / 2)`, with occasional lower-budget "breather" levels every ~5 levels to avoid constant-escalation fatigue. 5 equations per level by default. Per-level time limit derived the same way `equation.ts`'s `RAMP` table does it, scaled by the level's budget instead of a fixed tier.

**Star criteria:**
- ⭐ 1 star — cleared (accuracy above baseline, max 1 mistake)
- ⭐⭐ 2 stars — 100% accuracy
- ⭐⭐⭐ 3 stars — 100% accuracy **and** under a per-level time target

**Storage:** new table `level_progress (user_id, highest_level, stars_bitmap, updated_at)` — bitmap for random per-level access, not an event log.

**Map — Island Archipelago:** 5 themed islands on one vertically scrollable page, connected by a dotted trail:

| Island | Levels | Theme |
|---|---|---|
| Meadow Shore | 1–12 | bright, beginner-friendly |
| Whisper Jungle | 13–24 | terms creep up |
| Amber Canyon | 25–36 | decimals bite |
| Ember Volcano | 37–48 | boss intensity |
| Limit Break Isle | bonus | unlocked only after conquering all 4 |

Star-threshold gate between islands (e.g. 24/36 stars) drives replay. Low-risk v1 fallback if the full 2-layer map is too much for a first pass: a single continuous path re-skinned with different background art per chapter — same code, upgradeable to full islands later without touching the level generator.

---

### 5. Social Layer (Levels) — 🎯 In design, not yet built

Sits on top of Levels once solo progress exists. Async only — real-time/live PvP was explicitly rejected as too much infra for this phase and flagged as a possible distinct future phase instead.

- **Island Conqueror** — top-score holder per island shown as a crown; dethroned by beating their score. Implemented as a small write-triggered champion table (`island_id, user_id, score`), not recomputed by scanning all events on load.
- **Friend Conquest** — unlocks only after a player conquers all islands solo, as the reward for finishing the base game. Race a friend's recorded best run on an island, reusing the existing async Challenge Flow ghost-comparison pattern. Scales fine regardless of player count — always bounded by one player's friend list, never global matchmaking.
- **Private Worlds** *(later milestone, sequenced after Friend Conquest)* — invite-only groups of 4–5, named by the owner, competing on a leaderboard filtered to just that roster (`worlds`, `world_members` tables — a filter on existing scores, no new scoring logic needed).

**Unlock:** Island Conqueror is visible as soon as Levels is played; Friend Conquest unlocks after conquering all islands solo; Private Worlds unlocks after Friend Conquest.

---


## Unlock system

A single day-counter starts at first login, counting distinct UTC calendar days played (non-consecutive is fine), tracked independently from skill progress:

- **Daily Challenge** unlocks at: all 4 ladder tiers cleared **and** ≥ 3 days played
- **Endless + Levels** unlock together at: all 4 ladder tiers cleared **and** ≥ 7 days played

Constants (`DAILY_CHALLENGE_DAYS_REQUIRED`, `ENDLESS_LEVELS_DAYS_REQUIRED`) live in `modeAccess.ts` — **never hardcode these numbers elsewhere.**

Guests can only play Challenge Categories. Everything else requires a Google account, since guest state only lives in `localStorage` and doesn't persist across devices.

**Home carousel UI:** locked pages show a blurred/dimmed backdrop with one sharp, unblurred teaser element poking through (static copy for now — live leaderboard teasers wait on score integrity). A U-N-L-O-C-K progress bar (6 letters) lights up per page based on an averaged fraction of tiers-cleared and days-played progress.

---

## Data model

**`game_events`** is the unified spine — every mode writes here instead of bespoke per-mode tables:
```
user_id | mode | payload (jsonb) | verified_score | created_at
```
Leaderboards, unlock states, derived stats, and battle pass points are all computed from this table rather than stored redundantly per mode. Exceptions that get their own table: `level_progress` (needs random per-level access, not an event log) and the Island Conqueror champion table (write-triggered, not recomputed each load).

**`verified_score` is deliberately always `null` right now.** A PWA has no binary protection, so client-submitted scores are tamperable via devtools/network interception. No leaderboard goes public until score integrity ships.

---

## Monetization — status: parked

Deliberately **not decided** pre-launch. Explored and rejected:
- Full "unlock everything" bypass — undercuts the D3/D7 retention gates the unlock chain was built for
- Per-level micropayments — too much payment friction, undercuts the trait-budget mixing design (payers could just skip past the interesting levels)

Current placeholder direction (not final): a single membership bundling a modest day-gate speed-up (not a full skip), Private World cosmetics/modifiers, and Battle Pass access — to be tuned post-launch against real player behavior rather than guessed now.

**Hard constraint for all future code:** monetization must never be hardcoded into gate/unlock logic. Day-counts, world caps, etc. stay as named exported constants (same pattern as `DAILY_CHALLENGE_DAYS_REQUIRED`) so a paid tier can be layered on later without retrofitting core unlock code.

---

## Known open issues

- `flapBoard.ts` references 4 missing theme tokens (`signalAmber`, `flapIvory`, `casing`, `theme.font.flap`) — pre-existing, unresolved
- `shareCard.ts` hardcodes an old pre-redesign font (Space Grotesk) — pre-existing, unresolved
- OAuth redirect wipes `challengeContext` when a player picks Google login on Challenge Flow Screen 4 (full page reload clears in-memory state) — proposed fix (stash in `sessionStorage` before redirect, restore on boot) not yet built
- Home.ts's Daily Challenge carousel card leads to a second landing screen (`DailyChallenge.ts`) — two screens in a row; not yet confirmed whether to simplify
- Achievements screen is a "coming soon" toast — blocked on badge earn-criteria being defined (examples floated: "Flash," "Daily King," nothing concrete decided)
- Dead code, safe to delete but not yet removed: `MainMenu.ts`, `ChallengeCategories.ts`, old placeholder `EndlessMode.ts`/`Levels.ts` — nothing navigates to them anymore

---

## Key principles

- **`game_events` is the single source of truth** for all mode data — no bespoke per-mode tables except where random access (not event-log) is genuinely needed.
- **Score integrity before public leaderboards.** Non-negotiable — a tampered client score reaching a public leaderboard is worse than no leaderboard.
- **Monetization never touches gate logic directly** — always named exported constants.
- **Swipe is never gated** — only the action button is.
- **Supabase views bypass RLS by default** — always set `security_invoker=true`.
- **`npx vite build`**, never `npm run build` — the vite binary bypasses the known `flapBoard.ts` type-check blocker.

---

## Local dev

```bash
git clone https://github.com/yuensinghor/typetype-UI.git
cd typetype-UI
npm install
npx vite build   # not npm run build — see note above
```

Env vars needed (Vercel: Production + Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.