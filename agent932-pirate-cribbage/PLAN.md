# Pirate Cribbage — Project Plan

An online cribbage game with user accounts, play against the computer and other people, friends, ranked play, and detailed per-player stats.

---

## 1. What the stats sheet tells us

The sheet you pasted has four columns: **Medium**, **Hard**, **Online**, **Bronze**. Those are the modes the stats are split by:

| Column                   | Meaning (assumed)                                            |
| ------------------------ | ------------------------------------------------------------ |
| Medium / Hard (and Easy) | Games against the computer, by difficulty                    |
| Online                   | All games against people                                     |
| Bronze                   | Ranked games in your current tier (Bronze → Silver → Gold …) |
| Friends → CaroS          | Head-to-head record against one friend                       |

Almost every number on the sheet comes from a few facts we record **for each player in each round**:

- whether they were dealer or pone
- the 6 cards dealt, the 4 kept, the 2 thrown to the crib, and the cut card
- pegging points, hand points, crib points (dealer only)
- the **hand analyzer score** (how good their discard was compared with the best possible discard)

And for each match:

- who dealt first, the winner, the final scores, and whether it was a skunk

**The key design choice:** we store those raw facts and work the stats out from them, instead of storing each stat as its own counter. That way we can add new stats later and fill them in from old games.

Checks against your numbers:

- `0-7 Hand Percent` = (hands scoring 0–7) ÷ (all hands). Medium: 14/19 = 0.737 ✓
- `Total Card Occurrences 5514` = 919 rounds × 6 dealt cards ✓ (this counts all modes together)
- `Rounds Played` = `All Hand Count` (one hand per player per round) ✓

**One stat I couldn't work out:** `N Hand Percent` (e.g. "4 Hand Percent") doesn't equal count ÷ total. Medium "4 Hand" is 5/19 = 0.263 ✓, but "0 Hand" is 1/19 = 0.053, not the 0.143 shown. It might be "how often you scored N out of the times N was the best you could have kept", but that's a guess. See Open Questions.

---

## 2. Architecture

```
┌──────────────┐   WebSocket (game)    ┌────────────────────┐
│  Web client  │ ◀──────────────────▶ │  Game server        │
│  React + TS  │   HTTPS (REST/auth)   │  Node + TS          │
│  (PWA)       │ ◀──────────────────▶ │  - auth / accounts  │
└──────┬───────┘                       │  - matchmaking      │
       │ uses                          │  - game rooms       │
┌──────▼──────────────┐   uses         │  - stats API        │
│ @crib/engine (TS)   │ ◀───────────── └─────────┬──────────┘
│ rules, scoring, AI, │                          │
│ hand analyzer       │                ┌─────────▼──────────┐
└─────────────────────┘                │ PostgreSQL         │
                                       │ (+ Redis later)    │
                                       └────────────────────┘
```

**Recommended stack (TypeScript everywhere)**

- **Monorepo** (pnpm workspaces): `packages/engine`, `apps/web`, `apps/server`
- **Engine:** plain TypeScript with no dependencies. The client and server share it.
- **Web:** React + Vite, Tailwind, Framer Motion for card animations, installable as a PWA so it works well on phones
- **Server:** Node with Fastify, plus WebSockets (Socket.IO or Colyseus for game rooms)
- **Database:** PostgreSQL with the Drizzle ORM
- **Auth:** email + password and Google/Apple sign-in, using Better Auth or Lucia-style sessions with secure cookies
- **Hosting:** Docker Compose, which runs on Fly.io/Railway or self-hosted on your Umbrel

**Server is authoritative:** the server shuffles (with a cryptographic random number generator), deals, checks every move, and does all scoring. Clients only ever receive their own cards, so nobody can cheat by inspecting the page. Games against the computer can run on the server too, so they also count toward stats.

---

## 3. Game engine (`packages/engine`)

Pure functions that are easy to test: `(state, action) → newState`.

- **Deck / deal:** 6 cards each (2-player game), discard 2 each to the crib, cut. A Jack cut = "his heels", worth 2 to the dealer.
- **Pegging:** count up to 31, fifteen (2), pair / three of a kind / four of a kind (2/6/12), runs of 3–7, go (1), exactly 31 (2), last card (1)
- **Show:** fifteens, pairs, runs (including double and triple runs), flush (4 in hand, 5 with the cut; the crib needs all 5), nobs (1). Counted in order: pone's hand, then dealer's hand, then the crib.
- **Game end:** first to 121 wins, checked in the middle of pegging or the show. Skunk if the loser has under 91; double skunk under 61.
- **Options:** muggins (an opponent claims points you miss), manual vs automatic counting, 61-point short games
- **Hand analyzer:** for each of the 15 ways to discard 2 of 6 cards:
  `EV = average hand score over all 46 possible cuts ± expected crib value`
  The crib value comes from a precomputed table (+ for the dealer's crib, − for the opponent's).
  `analyzer score = 100 × EV(your choice) / EV(best choice)` (the formula can be tuned)
- **AI levels:**
  - _Easy:_ random reasonable discard, picks any legal pegging card
  - _Medium:_ best discard by hand value only, simple pegging rules (avoid leaving 5 or 21, take pairs and 15s)
  - _Hard:_ full EV discard including the crib, pegging lookahead (expectimax over the unseen cards), plays differently depending on board position near the end of the game

Testing goal: 100% test coverage of the scoring code, with known hands (29, 28, 0 hands, double runs, flush rules).

---

## 4. Data model (core tables)

```
users            id, username, email, password_hash, avatar, rating, tier, created_at
friendships      user_id, friend_id, status (pending/accepted), created_at

matches          id, mode (ai|online|ranked|private), ai_level, tier_at_start,
                 started_at, ended_at, first_dealer_seat, winner_seat,
                 skunk_level (0/1/2), abandoned_by, target_score (121/61)
match_players    match_id, seat, user_id (null = AI), final_score, rating_before/after

rounds           id, match_id, round_no, dealer_seat, cut_card
round_players    round_id, seat, is_dealer,
                 dealt (6 cards), kept (4), discarded (2),
                 peg_points, hand_points, crib_points (null if pone),
                 analyzer_score, best_possible_ev, chosen_ev
match_events     match_id, seq, type, payload (jsonb)   -- full replay log
```

**How stats are produced:**

- `user_stats` is a precomputed summary table per (user, bucket), where the bucket is ai-easy/medium/hard, online, ranked-tier, or vs-friend. It's updated in one transaction when each match ends. Streaks (current and max) have to be updated as games finish, because they depend on the order of games.
- Averages, maximums and percentage buckets are calculated with SQL over `round_players` (fast with indexes), or cached in `user_stats` if speed becomes a problem.
- Opponent columns (e.g. "Avg Hand Points (Opponent)") use the same query, run on the other seat in the same rounds.
- Card occurrences are counted from the `dealt` arrays across all of the user's rounds.

---

## 5. Features & screens

1. **Landing / sign in / sign up** (username, email, password, or Google/Apple)
2. **Lobby:** Play vs Computer (Easy/Med/Hard), Quick Match (online), Ranked, Invite a Friend
3. **Game table:** pirate-themed board with pegs, hand, crib, cut card, pegging pile, score popups, a "count your hand" step if muggins is on, emotes/quick chat, turn timer
4. **Post-game:** score summary, skunk banner, hand-analyzer review ("best discard was…"), rematch
5. **Stats page:** tabs by mode, using the same rows as your sheet, plus charts (hand-score histogram, card distribution, win rate over time)
6. **Friends:** search and add, pending requests, head-to-head stats, challenge
7. **Profile / settings:** avatar, counting mode, muggins on/off, animation speed, sound
8. **Ranks:** rating system (Glicko-2 or Elo) mapped to tiers (Bronze, Silver, Gold, Platinum, Diamond), with seasonal resets

**Online-play details:** reconnect within 60 s (the game is kept in memory, with a snapshot in Redis/Postgres), a turn timer that plays automatically when it runs out, an abandoned game counts as a loss, and a matchmaking queue sorted by rating.

---

## 6. Build phases

| Phase                          | Scope                                                         | Done when                                             |
| ------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------- |
| **0. Setup**                   | Monorepo, linting, tests, CI, Docker Compose with Postgres    | `pnpm dev` runs web + server                          |
| **1. Engine**                  | Rules, scoring, pegging, game state machine, full tests       | Can play a whole game in a CLI/test harness           |
| **2. Play vs AI (local)**      | Game table UI, Easy/Medium AI, animations                     | Playable and fun in the browser, no account           |
| **3. Accounts + stats**        | Auth, server-run AI games, round logging, stats page          | Your sheet's rows show up from real games             |
| **4. Hand analyzer + Hard AI** | Crib EV tables, analyzer score, post-game review              | Analyzer scores in stats, Hard AI is a real challenge |
| **5. Online multiplayer**      | Rooms, quick match, reconnect, timers, private invites        | Two browsers can play each other                      |
| **6. Friends + ranked**        | Friend system, head-to-head, rating/tiers, leaderboard        | Bronze/Silver… columns and the Friends section work   |
| **7. Polish & launch**         | Pirate art/sound, mobile layout, PWA, admin tools, monitoring | Public beta                                           |

Phases 1–3 are the minimum useful version: a polished single-player game with accounts and stats.

---

## 7. Decisions (2026-10-02)

- **Platform:** web only (works on phones in the browser); no native apps for now
- **Players:** 2-player only
- **Modes:** online play against people is the main focus; the computer opponent stays for practice and to fill the vs-AI stats
- **Hosting:** self-hosted on Umbrel using Docker Compose (`docker-compose.yml`)
- **Theme:** pirate look **and** pirate-flavoured rule twists. The twists will be a toggleable "Pirate Rules" mode, so classic games and stats stay pure. The twists still need to be designed.
- **Package manager:** npm workspaces instead of pnpm (nothing extra to install)

### Still open

- What "N Hand Percent" means
- Money: free, ads, or cosmetics
- Which pirate rule twists to include (proposals below)

## 8. Pirate Rules: proposed twists

Each twist is a separate switch inside a "Pirate Rules" game. Points from twists are recorded apart from classic points, so pegging/hand/crib averages stay comparable. Pirate-rules games get their own stats column.

| Twist                 | Rule                                                                                            | Engine hook                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Buried Treasure**   | Holes 30, 60 and 90 are marked with an X. Land exactly on one and dig up 3 bonus points.        | After any points are scored (board position) |
| **The Kraken**        | Holes 45, 75 and 105 are whirlpools. Land exactly on one and get dragged back 4.                | After any points are scored (board position) |
| **The Black Spot**    | If the cut card is the Ace of Spades, the crib is stolen: the pone counts it this round.        | Cut card                                     |
| **Shipwreck Salvage** | A zero ("nineteen") hand salvages 2 points from the wreck.                                      | Hand scoring                                 |
| **Broadside**         | Hitting exactly 31 while also making a pair or run fires a broadside for 2 extra points.        | Pegging scoring                              |
| **Parley**            | Once per game, before the cut, you may swap one card in your hand for the top card of the deck. | New once-per-game action                     |

Suggested first set: **Buried Treasure + Kraken** (the board becomes part of the game), **Black Spot** (a rare, dramatic swing) and **Parley** (a real decision to make).

## 9. Progress

- **Phase 0 (setup): done.** Monorepo, lint, typecheck, tests, CI, dev Postgres, production Docker image.
- **Umbrel packaging: done (local, not pushed).** `agent932-pirate-cribbage` in the agent932/umbrel-apps store; the image is built by `.github/workflows/release.yml` to `ghcr.io/agent932/pirate-cribbage`.
- **Phase 1 (engine): done.** Card utilities, hand and pegging scoring, a pure game state machine (deal → discard → cut → pegging with automatic go → show), win and skunk detection, per-round records for stats, a player view that hides the opponent's cards, a Medium-strength bot, a terminal game (`npm run play`), and 53 tests including 300 simulated bot games.
- **Pirate Powers: done.** Your proposed powers, each once per game, free or costing points ("Plunder"): Spyglass, Crow's Nest, Parley, Pickpocket, Rebury, Belay That! When either player still holds Pickpocket or Rebury, a short "ready?" step follows the cut.
- **Phase 2 (play vs AI in the browser): done.** Home screen (Easy/Medium, Classic/Pirate, Free/Plunder), game table (board with treasure and kraken holes, cut, pegging pile, crib, game log, powers bar), round-summary and game-over screens, games saved and resumable after a refresh. UI tests play a full game through the real interface.
- **Moved (2026-10-02):** the project now lives in the agent932/umbrel-apps store repo as `agent932-pirate-cribbage/`, next to its Umbrel manifest. `build-pirate-cribbage.yml` in the store tests it and publishes the image.
- **Phase 3 (accounts and stats): done.** Sign up and log in (scrypt password hashes, httpOnly session cookies, rate-limited). Signed-in games vs the bot run on the server, which deals, plays the bot, and records each finished match round by round. The Ship's Log shows every sheet row per opponent level (Easy / Medium / Hard / Online / All), filterable by Classic or Pirate, with hand-score and dealt-card charts. Guests can still play offline in the browser. An end-to-end test drives the real web app against the real server.
- **Phase 4 (hand analyzer + Hard bot): done.** Crib values precomputed for every thrown pair (`scripts/gen-crib-table.ts`; matches published tables, e.g. 5-5 ≈ 9). The analyzer ranks all 15 discards by hand EV over 46 cuts ± crib EV and scores your throw 0–100 between the worst and best choice. Hard bot: optimal discards plus pegging that subtracts the opponent's expected best reply. It wins about 56% against Medium over 400 games. The round summary shows your score and the best throw; analyzer averages fill the Ship's Log.
- **Phase 5 (online multiplayer): done.** One WebSocket per tab (`/api/ws`), signed in with the session cookie. The server runs each game in a room: every move goes through the engine, one move at a time per game, and each player gets only their own view. Games are saved after every move and reload after a restart. Quick Match pairs players asking for the same rules; invite codes work once and expire after an hour (or when the host leaves). If your 60-second move clock runs out, the server plays a sensible move for you. The next round starts when both players are ready, or after 30 seconds. Staying disconnected for 2 minutes, or pressing Forfeit, gives the game to your opponent. Online matches are recorded for both players (Online column), with forfeits marked.
- **Phase 6 (friends + ranked): done.** Friend requests by username (asking each other means you're friends at once), accept/decline/unfriend, live "friends changed" updates, online status. Challenge an online friend (classic or pirate); they get a pop-up anywhere in the app. Head-to-head records per friend use the sheet's Friends rows. Ranked play: Elo (K = 32, start 1000), tiers Bronze <1100 ≤ Silver <1250 ≤ Gold <1400 ≤ Platinum <1550 ≤ Diamond. Ranked games always use classic rules and their own queue. Ratings update inside the match-recording transaction with the user rows locked. Each ranked match records rating before/after and tier, and the Ship's Log adds a column per tier played (plus your current one). Leaderboard of the top 50.
