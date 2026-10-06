# Deckhand Games on the iPhone App Store

The iPhone app is a [Capacitor](https://capacitorjs.com) shell in `ios/`. The game's pages ship
inside the app and talk to `https://deckhand.games`: the app signs in with a token rather than a
cookie (see `apps/web/src/native.ts`), and the server allows the app's origin
(`capacitor://localhost`). Because the game is bundled, playing the computer crew as a guest works
with no connection.

| Setting          | Value                                                                     |
| ---------------- | ------------------------------------------------------------------------- |
| Bundle ID        | `games.deckhand.app` (permanent once the App Store Connect record exists) |
| Display name     | Deckhand Games                                                            |
| Orientations     | Portrait and landscape (iPhone), all four (iPad)                          |
| Privacy policy   | https://deckhand.games/privacy                                            |
| Account deletion | Account → Delete account (required by App Review)                         |

## One-time Mac setup

```bash
sudo xcodebuild -runFirstLaunch
```

Then in Xcode → Settings → Components, install the iOS platform (Simulator runtime) if it's missing.

## Build

From `agent932-pirate-cribbage/`:

```bash
npm run app:ios
```

This builds the web app and copies it into `ios/App/App/public`. Run it after every change you want
in the app, then open the project:

```bash
npx cap open ios
```

## First run on the Simulator or your iPhone

1. In Xcode, select the **App** target → **Signing & Capabilities** → tick _Automatically manage
   signing_ and pick your **Team**.
2. Choose an iPhone Simulator (or your plugged-in iPhone) at the top and press **Run** (⌘R).

## TestFlight

1. In [App Store Connect](https://appstoreconnect.apple.com) → Apps → **+** → New App: platform iOS,
   name _Deckhand Games_, bundle ID `games.deckhand.app`, SKU e.g. `deckhand-games`.
2. In Xcode set the version (General → Version, e.g. `1.0`) and bump **Build** for every upload.
3. Choose _Any iOS Device (arm64)_ → **Product → Archive** → **Distribute App** → _App Store
   Connect_ → Upload.
4. After processing (10–30 min) the build appears under TestFlight. Add yourself as an internal
   tester and install with the TestFlight app.

## App Store listing

- **Category:** Games → Card (secondary: Board).
- **Name:** Deckhand Games
- **Subtitle:** Pirate Cribbage: Crib & Peg
- **Keywords:**
  card,pegging,multiplayer,online,friends,two player,classic,puzzle,daily,board,offline,family,learn
  (no word repeats the name or subtitle, which already cover deckhand, games, pirate, cribbage, crib
  and peg)
- **Promotional text** (can change any time without a new version): Pirate Cribbage is free, with
  no ads. Peg against the computer crew or sail online with friends. Add Pirate Rules for buried
  treasure, the Kraken and six sneaky powers.
- **Description** (three paragraphs; drop the "free, no ads and no purchases" wording if a build
  ever ships with purchases):

  > Deckhand Games is a home for classic card games with a pirate twist. The first game aboard is
  > Pirate Cribbage, free to play with no ads and no purchases.
  >
  > Play the computer crew at three difficulties, or play friends online. Switch on Pirate Rules
  > for buried treasure, the Kraken and six sneaky powers, or keep it classic. Track every match in
  > the Ship's Log with detailed stats, ranks and achievements. Learn to play with Peggy the parrot,
  > and test your discards with the daily puzzle.
  >
  > Playing the computer as a guest works with no connection and needs no account. An account is
  > only needed for online play with friends, the Ship's Log and the leaderboard.

- **Support URL:** https://deckhand.games/support
- **Privacy policy URL:** https://deckhand.games/privacy
- **Age rating:** answer _None_ to everything (no gambling for money; the only player-written text
  is usernames, which are filtered for swear words and can be reported or blocked; emotes are
  fixed). Expect 4+.
- **Screenshots:** 6.9" iPhone (1320 × 2868, or 2868 × 1320 landscape) is required; take them in
  the Simulator with ⌘S (iPhone 17 Pro Max). The painted table in landscape looks best.
- **Review notes:** give App Review a test account (username and password) so they can try online
  play, and mention that guest play against the computer needs no account.

## App Privacy answers

Data linked to the user, used for **App Functionality** only, **not** used for tracking:

- Contact Info → Email Address
- Identifiers → User ID
- User Content → Gameplay Content (match history)
- User Content → Customer Support (the contact form, and reports about other players)

No usage data or diagnostics are collected by the app, and there's no third-party advertising or
analytics in it.

## Notes

- **Why bundled, not a web wrapper:** App Review Guideline 4.2 rejects apps that only show a
  website. The bundled game, native haptics and offline play against the computer answer that.
- **Live-site mode for quick testing:** add `server: { url: "https://deckhand.games" }` to
  `capacitor.config.ts` temporarily to load the live site instead of the bundle (don't ship it).
- **Android** later: `npm i @capacitor/android && npx cap add android`, then add
  `https://localhost` to `APP_ORIGINS` in `apps/server/src/online/routes.ts`.
