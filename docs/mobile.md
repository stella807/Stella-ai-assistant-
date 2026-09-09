# Shipping to the App Store and Play Store

The web app is wrapped with [Capacitor](https://capacitorjs.com): the built
bundle ships inside a native shell and talks to the Railway API over HTTPS. A
server deploy reaches every installed app immediately; only UI changes need a
store review.

## Why a native shell at all

iOS gives web apps **no background location**. A browser build can only report
where someone was when the tab was last open, which is useless for an app whose
job is knowing where someone is while the phone is in their pocket. That single
limitation is what makes the App Store path mandatory rather than optional.

## Building it

```bash
cd apps/web
export VITE_API_URL="https://<your-app>.up.railway.app"   # required for native builds

pnpm cap:ios       # builds, syncs, opens Xcode
pnpm cap:android   # builds, syncs, opens Android Studio
```

First time only, add the platforms:

```bash
npx cap add ios
npx cap add android
```

`VITE_API_URL` is required for a native build and the app throws on boot without
it — a shell pointing at nothing looks like a server outage and gets diagnosed
as one for hours.

**You need a Mac for iOS**, or a cloud build (Expo EAS, Codemagic, MacStadium).
Android builds anywhere.

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

Android, in `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Play requires a **video demonstrating the background location use case** and a
written justification. Budget real time for that review; it is slower than iOS.

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
- **Push notifications** for the guardian side. Local notifications cover the
  traveler's own check-ins; alerting a *watcher* whose app is closed needs APNs
  and a push service.
- **Retention policy.** Still the largest gap — see `SECURITY.md`.
