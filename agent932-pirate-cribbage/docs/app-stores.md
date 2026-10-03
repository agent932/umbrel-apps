# Putting Pirate Cribbage in the App Store and Google Play

Pirate Cribbage is a web app. The quickest route into the stores is to wrap the same code in a native
shell with [Capacitor](https://capacitorjs.com). This guide covers what that takes. Nothing here has
been set up yet; the steps that need your Apple and Google accounts are yours to do.

## What a store app adds

- **Landscape lock** (or portrait), which a web page can't do on iPhone.
- **Vibration on iPhone** through the native Haptics plugin (the web version only buzzes on Android).
- A listing people can find and install, with its own icon and splash screen.

## Before you start

| You need | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program membership | US$99 / year | Needed to publish to the App Store or TestFlight. |
| A Mac with Xcode | free | Builds and signs the iOS app. |
| Google Play Console account | US$25 once | Identity verification can take a few days. |
| Android Studio | free | Builds and signs the Android app. |
| A privacy policy page | free | Both stores require a URL. The game stores accounts, game history and an email address. |

## Choose how the app loads the game

**A. Load the live site (fastest).** The app opens `https://pc.atomicit.ca` inside the native shell
(`server.url` in the Capacitor config). Updates on your Umbrel reach the app immediately and no code
changes are needed. The catch: Apple can reject apps that are "just a website" (App Store Review
Guideline 4.2). Native haptics and orientation lock help, but approval isn't guaranteed. Google
Play is usually fine with this.

**B. Ship the game inside the app (most robust).** The built web files are bundled into the app and
talk to your server over the internet. This needs some code changes first:

1. An API base URL setting in the web app (today every request goes to the same site the page came from).
2. Session cookies sent across sites: `sameSite: "none"` and `secure: true` for requests from the app,
   or switch the app to token-based sign-in.
3. Allow the app's origin (`capacitor://localhost` on iOS, `https://localhost` on Android) in the
   server's CORS and WebSocket origin checks (`sameOrigin` in `apps/server/src/online/routes.ts`).
4. Update the Content Security Policy `connect-src` in `apps/server/src/app.ts`.

Recommendation: start with **A** for Google Play and TestFlight testing, and move to **B** if Apple
pushes back.

## Setting it up (option A)

From `agent932-pirate-cribbage/`:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android @capacitor/haptics @capacitor/screen-orientation
npx cap init "Pirate Cribbage" ca.atomicit.piratecribbage --web-dir apps/web/dist
```

Then edit the generated `capacitor.config.ts` to match `docs/capacitor.config.example.json`
(it points the app at the live site and sets the background colour). Add the platforms:

```bash
npm run build -w @pirate/web
npx cap add ios
npx cap add android
```

### Icons and splash screens

The painted app icon is in `art-kit/app-icon.png` (outside this repo). Generate every size with:

```bash
npx @capacitor/assets generate --iconBackgroundColor '#0e2034' --splashBackgroundColor '#04121c'
```

(put the icon at `assets/icon.png` and a splash image at `assets/splash.png` first).

### Small code changes worth making

- **Haptics:** in `apps/web/src/haptics.ts`, call `Haptics.impact({ style: ImpactStyle.Light })` from
  `@capacitor/haptics` when `Capacitor.isNativePlatform()`, and keep `navigator.vibrate` for the web.
- **Orientation:** call `ScreenOrientation.lock({ orientation: "landscape" })` at start-up in the
  native app if you want landscape only. The table works in both, so this is optional.

### Build and submit

- iOS: `npx cap open ios`, set your team under Signing & Capabilities, Product → Archive, then upload
  to App Store Connect and test through TestFlight before submitting for review.
- Android: `npx cap open android`, Build → Generate Signed Bundle (keep the keystore safe; you need it
  for every update), then upload the `.aab` to Play Console (internal testing first).

### Store listings need

- Screenshots: phone landscape and portrait (the painted table looks best), 6.7" and 5.5" iPhone sizes,
  plus Android phone. Optional tablet shots.
- Short and long descriptions, a category (Card games), and a content rating questionnaire (no
  gambling for money; it's fine).
- The privacy policy URL, and Apple's App Privacy answers (account, email, gameplay data; no tracking).
