# Shipping to the App Store and Play Store

## First: what the delivery and ride APIs actually allow

This shapes the product more than any store rule, and neither Apple nor Google
is the constraint — **the providers are**.

| Provider | Public API for a third-party consumer app? | What you can actually do |
|---|---|---|
| **Uber** rides | **No.** The Ride Request API was retired for third-party developers. | Deep link into the Uber app with the destination filled in. |
| **Lyft** rides | **No.** Closed to new consumer apps. | Same: deep link. |
| **Uber Eats** | **No** consumer ordering API. The API is merchant-facing, for restaurants receiving orders. | Deep link to a search. |
| **DoorDash** | **No** consumer ordering API. DoorDash Drive delivers *your own* goods if you are a merchant. | Deep link to a search. |
| **Walgreens** | No public consumer ordering API. | Deep link to a search. |
| **Yelp / Google Places** | **Yes.** Both are open with a key. | Venue lookup — already wired. |

So in-app booking, live fares, and automatic ordering all require a commercial
partnership, not an API key. Until one exists, `ride-booking-api`,
`food-ordering-api` and `pharmacy-ordering-api` are off in
`packages/core/src/features.ts`, and the app hands off to the provider's own app
instead of inventing a fare.

**This also removes the ride-commission line from the revenue plan.** Uber has
no open affiliate programme for consumer ride referrals. Subscriptions and venue
partnerships are the realistic revenue, and both work fine through the stores.

Deep links need no approval from anyone and are what most apps in this category
actually do.


The web app is wrapped with [Capacitor](https://capacitorjs.com): the built
bundle ships inside a native shell and talks to the Railway API over HTTPS. A
server deploy reaches every installed app immediately; only UI changes need a
store review.

## Why a native shell at all

iOS gives web apps **no background location**. A browser build can only report
where someone was when the tab was last open, which is useless for an app whose
job is knowing where someone is while the phone is in their pocket. That single
limitation is what makes the App Store path mandatory rather than optional.

**Why not Expo/React Native.** This came up directly: Expo builds and ships a
React Native app, and React Native has no HTML/CSS/DOM — every screen in
`apps/web/src` is built with regular React-DOM components and this app's own
CSS. Moving to Expo isn't a build-tool swap; it's a from-scratch rewrite of
every screen against a different component model, on top of an already-working
committed iOS project and Codemagic CI pipeline (`codemagic.yaml`, and the
rest of this doc). Capacitor was chosen specifically because it wraps the
existing web app instead of requiring that rewrite. Decided to stay on
Capacitor for that reason — worth re-reading this note before reopening the
question later.

## Building it

Both native projects are committed at `apps/web/ios/` and `apps/web/android/` —
checked in rather than generated on demand, same reasoning as Android's own
section below: the Xcode project, its Info.plist location strings, and the
signing config are real source, not something to regenerate and lose on every
clone.

```bash
cd apps/web
export VITE_API_URL="https://<your-app>.up.railway.app"   # required for native builds

pnpm cap:ios       # builds, syncs, opens Xcode
pnpm cap:android   # builds, syncs, opens Android Studio
```

`VITE_API_URL` is required for a native build and the app throws on boot without
it — a shell pointing at nothing looks like a server outage and gets diagnosed
as one for hours.

**You need a Mac to open Xcode and actually run `pnpm cap:ios`.** Android
builds anywhere, no Mac required.

### Building iOS without owning a Mac: Codemagic

`codemagic.yaml` at the repo root defines a free-tier workflow,
`ios-simulator-build`, that compiles the committed Xcode project on
Codemagic's own Mac runners — 500 free macOS-minutes/month, no card required.
It builds for the iOS Simulator, which needs no Apple signing identity, so it
works before an Apple Developer Program account exists. It proves the app
*compiles*; it is not a TestFlight or App Store build, which need real
certificates once that account exists.

Steps only doable from your own Codemagic account (this is not something a
CI config file can do on its own):

1. Sign up at [codemagic.io](https://codemagic.io) and connect this GitHub repo.
2. Codemagic detects `codemagic.yaml` automatically — no project setup UI needed.
3. Under the workflow's **Environment variables**, add `VITE_API_URL` pointing
   at your Railway deployment. It is baked into the JS bundle at build time
   (`apps/web/src/native/platform.ts`), so this has to be set before the build
   runs, not after.
4. Start the `ios-simulator-build` workflow from the dashboard. Nothing here
   is on an automatic trigger, so it only spends free minutes when you run it.

If the Xcode project ever needs regenerating (a Capacitor major upgrade, a
corrupted project file), `rm -rf apps/web/ios && npx cap add ios` rebuilds it
from the same template — but re-add the two `NSLocation*` strings in
`Info.plist` and the shared scheme under
`ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` afterward; neither
survives a fresh `cap add`.

## Native capabilities in use

| Capability | Plugin | Why |
|---|---|---|
| Location, foreground and background | `@capacitor/geolocation` | The product. |
| Check-in reminders | `@capacitor/local-notifications` | Local, not push — fires with no signal, which is exactly where a missed check-in matters. |
| Lifecycle | `@capacitor/app` | Resume the night when the app comes back. |

`src/native/` holds the adapters. Each falls back to a browser API, so the web
build still runs and the same code paths are exercised in development.

### Permission strings

iOS rejects a build with missing purpose strings. In `ios/App/App/Info.plist`:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Safehubby shares your location with the person you chose, so they know you got home.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Safehubby keeps sharing your location while your phone is in your pocket, so the person watching tonight can find you if you stop answering.</string>
```

Write them as the *user's* reason, not the system's. "Required for app
functionality" is a common rejection.

Android's manifest is already configured — see the Android section below.

## App Review: the risks specific to this app

**Age rating 17+.** Alcohol references. Apple rejects apps that *encourage*
consumption — this one does not, and it is worth saying so in the review notes:
no game scores on volume, points pay out for getting home, and the largest
single award is for booking a ride instead of driving.

**The intoxication estimate is the biggest risk.** Guideline 1.4.1 scrutinises
apps that "could provide inaccurate data." Point the reviewer at the two
invariants and the tests that hold them: the estimate is always shown as a
range, never a single number, and no code path emits a fit-to-drive verdict at
any reading, including 0.00.

**Partner location tracking is the second.** Apple has rejected
stalkerware-adjacent apps. The consent model is the defence, and it is
structural rather than a setting: only the traveler can create a grant, every
grant expires, the watcher list is always visible, sharing ends automatically
when they get home, and either party can revoke. Say this explicitly.

**Emergency features.** Guideline 1.4.1 again. The app states plainly that it
cannot dispatch an ambulance and routes to the local emergency number instead.
Do not describe the app as an emergency service in the store listing.

**Subscriptions must use In-App Purchase.** This changes the economics:

| Plan | Listed | Net at 15% (Small Business) | Net at 30% |
|---|---|---|---|
| Premium Basic | $5.99 | $5.09 | $4.19 |
| Premium Plus | $10.99 | $9.34 | $7.69 |
| Family | $17.99 | $15.29 | $12.59 |

The Small Business Program is 15% for developers under $1M/year — apply for it.
Physical goods bought through the app (the pharmacy run, party rentals) are
**exempt** and must *not* use IAP; Apple rejects apps that route physical goods
through it.

**Account deletion is mandatory.** Guideline 5.1.1(v). Built: Account →
Delete my account, with re-authentication and a typed confirmation. It is real
erasure, not deactivation.

**App Privacy labels.** Declare precise location, health-adjacent data, and
contact info, all "linked to identity." Under-declaring is a rejection and,
worse, a truthfulness problem.

## Submission checklist

- [ ] Apple Developer Program, $99/year
- [ ] Privacy policy at a public URL (App Store Connect requires it)
- [ ] Age rating set to 17+
- [ ] App Privacy labels completed
- [ ] Location purpose strings written from the user's side
- [ ] Subscriptions configured as auto-renewable IAP; Small Business Program applied for
- [ ] Review notes covering: the estimate is a range and never clears anyone to drive; sharing is traveler-initiated, expiring and revocable; the app is not an emergency service
- [ ] Demo account credentials for the reviewer (they will not sign up)
- [ ] Screenshots for every required device size

## What is still missing before submission

- **Background location** is wired through `watchLocation`, but iOS needs
  `UIBackgroundModes: location` in the plist and Apple scrutinises it. Enable it
  only when you can demonstrate the use case on video.
- **Push notifications** for the guardian side are built — the decision logic,
  the fan-out, device registration and the sender all exist, and the server
  states whether delivery is configured rather than failing silently (see
  `docs/push.md`). What is still outstanding is the accounts: real tokens need
  APNs, so this has not been run against a live device.
- **Retention policy.** Still the largest gap — see `SECURITY.md`.


---

# Android in detail

Android is the cheaper and faster of the two: **$25 once** (versus $99/year for
Apple), no Mac required, and you can install a test build on a phone in minutes
without any store involvement at all.

The native project is committed at `apps/web/android/`, already configured. It
is checked in rather than generated because the manifest, permissions, signing
config and ProGuard rules are real source — regenerating them from scratch on
every clone would lose all of it.

## Build it

```bash
cd apps/web
export VITE_API_URL="https://<your-app>.up.railway.app"
pnpm build && npx cap sync android

cd android
./gradlew assembleDebug          # APK you can sideload today
./gradlew bundleRelease          # AAB for the Play Store
```

Outputs land at `app/build/outputs/apk/debug/app-debug.apk` and
`app/build/outputs/bundle/release/app-release.aab`.

To put the debug build on a phone: enable Developer Options → USB debugging,
plug it in, and `adb install app-debug.apk`. That is the fastest way to feel
the real thing — background location behaves nothing like it does in a browser.

Or open it in Android Studio with `pnpm cap:android`.

## What is already configured

| Concern | Where | Why it is set that way |
|---|---|---|
| Permissions | `AndroidManifest.xml` | Fine **and** coarse location: Android 12+ lets users grant approximate only, and the app must still work — a check-in that names a neighbourhood beats none. |
| Foreground service | `AndroidManifest.xml` | Location while a night runs. Android forces an ongoing notification, which is the right behaviour here anyway: nobody should be located without a visible, permanent reminder. |
| Notification channel | `SafehubbyApplication.java` | HIGH importance. The default channel delivers silently, and a check-in nobody notices is one nobody answers. |
| No cleartext | `network_security_config.xml` | The session is an HttpOnly cookie and payloads carry live location. There is no plaintext fallback. |
| No cloud backup | `data_extraction_rules.xml` | Backup would copy the session and cached location into Google's backup, outside the encryption the server applies. |
| ProGuard keeps | `proguard-rules.pro` | Capacitor bridges to native by reflection. Without these, a release build starts fine and then fails the first time the page asks for location — a bug debug builds never show. |
| `minSdk 24` | `variables.gradle` | Android 7.0 and up, roughly 99% of active devices. |
| `targetSdk 36` | `variables.gradle` | Above Play's current floor for new submissions. |

## Signing

Create an upload key once, and do not lose it:

```bash
keytool -genkey -v -keystore safehubby-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias safehubby
```

Then `cp android/keystore.properties.example android/keystore.properties` and
fill it in. That file and `*.jks` are gitignored — a committed keystore is a key
anyone can publish updates to your app with.

CI can sign without a file by setting `ANDROID_KEYSTORE_FILE`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`.

**Enrol in Play App Signing.** Google then holds the real signing key, and a
lost upload key can be reset by support. Without it, losing the key means you
can never update the app — you would have to publish a new listing and abandon
your users.

## Play Console

1. **$25 one-off** at [play.google.com/console](https://play.google.com/console).
2. **Identity verification.** Individual accounts created after late 2023 need
   a verified address and phone; organisations need a D-U-N-S number. This takes
   days, so start it before you need it.
3. **Closed testing before production.** New personal accounts must run a closed
   test with **12 testers for 14 continuous days** before applying for
   production access. This is the single biggest scheduling surprise in shipping
   to Play — plan for it early, and line up twelve people.

## The two things that will hold up review

**Background location.** Play requires a written justification *and a video*
showing the feature working, and reviews it by hand. Safehubby's case is a
strong one — someone shares their location with one named person for one night
so that person knows they got home — but you have to make it on camera. Show
the permission prompt, the sharing screen, the watcher's view, and revocation.

Do not request background location until foreground is already granted;
requesting both at once is a documented rejection.

**Data safety form.** Declare precise location, and that it is shared with
another user. Under-declaring is a rejection and, worse, a truthfulness
problem. The honest answers here are good ones: data is encrypted in transit,
location is encrypted at rest, users can request deletion in-app, and it is not
sold or shared with third parties for advertising.

## Content rating

Fill in the IARC questionnaire. Alcohol references put this at **Mature 17+**
in North America and **PEGI 18** in Europe. Answer honestly that the app
references alcohol but does not simulate or encourage its consumption — which
is true, and is worth stating in the review notes: no game scores on volume,
points pay out for getting home, and the largest single award in the app is for
booking a ride instead of driving.

## Play billing

Subscriptions must use **Google Play Billing**, at the same 15% under $1M /
30% above split as Apple. Physical goods — the pharmacy run, party rentals —
are **exempt** and must not go through it.

## Android checklist

- [ ] Play Console account, $25, identity verified
- [ ] Upload keystore created and backed up; Play App Signing enrolled
- [ ] `VITE_API_URL` pointing at the Railway deployment
- [ ] `./gradlew bundleRelease` produces a signed AAB
- [ ] Data safety form completed, precise location declared
- [ ] Background location justification written and video recorded
- [ ] Content rating questionnaire done (expect 17+/PEGI 18)
- [ ] Closed test: 12 testers, 14 days
- [ ] Privacy policy URL live
- [ ] Feature graphic (1024×500) and screenshots for phone and 7"/10" tablet
