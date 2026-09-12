# Getting Safehubby onto the App Store

The runbook, in the order things actually block each other. `docs/mobile.md`
covers *why* there is a native shell at all; this is how to ship it.

## What is already done

- Capacitor iOS project committed at `apps/web/ios`, `appId` **`app.safehubby`**.
- `codemagic.yaml` has two workflows: an unsigned simulator build (proves it
  compiles, needs no Apple account) and a signed TestFlight build.
- `Info.plist` declares every permission the app actually uses.
- `PrivacyInfo.xcprivacy` is written and registered in the Xcode project.
- Account deletion is implemented in-app, which Apple requires
  (guideline 5.1.1(v)).

## The long pole: enrolment

Start this first; everything else waits on it.

1. **Apple Developer Program**, $99/yr. An individual enrolment can be same-day.
   A company enrolment needs a **D-U-N-S number** and can take a week or more.
2. Which one you pick matters beyond paperwork: an individual account lists
   *your own legal name* as the seller on the App Store. A company account
   lists the company. For a safety app people are trusting with where they
   are at 1am, the company name is worth the extra week — and it should be
   the same entity as the business bank account (see `docs/budget.md`).
3. **App Store Connect API key**: Users and Access → Integrations → App Store
   Connect API → generate a key with *App Manager* access. Add it to Codemagic
   under Teams → Integrations → Developer Portal, named **`safehubby-asc-key`**
   to match `codemagic.yaml`.
4. Register the bundle id `app.safehubby` and create the app record.

## Before the first upload

**Set `VITE_API_URL`** in the Codemagic variable group `safehubby`, pointing at
the deployed API. It is baked into the bundle at build time. The signed
workflow fails early if it is missing, because the alternative is a build that
compiles cleanly and then throws on launch — which a reviewer sees as a crash
on first open, and which costs a rejection cycle.

**App icons.** Apple requires a 1024×1024 marketing icon with no alpha channel
and no rounded corners. Drop the set into
`apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset`.

**Screenshots.** 6.7" (1290×2796) and 6.5" are the required sizes. The
walkthrough captures in this repo are 420pt wide — re-shoot at device size
rather than upscaling, or they will look soft next to everyone else's.

## Privacy labels must match the manifest

App Store Connect asks these separately from `PrivacyInfo.xcprivacy`, and a
disagreement between the two is a rejection. Declare, all **linked to the
user**, all **not used for tracking**, all for **App Functionality**:

| Data | Why |
|---|---|
| Precise location | The guardian needs the actual address, not a neighbourhood |
| Email address | Sign-in |
| Name | What a guardian sees |
| Health (drink logs, BAC estimate) | Apple classes this as health data, and it is |
| Photos | Assistant selfie, the item, the receipt |
| Audio | Voice messages |
| Purchase history | Subscription and task charges |

Answer **No** to tracking. There is no ad SDK and the account screen promises
this in writing.

## The two review questions this app will actually get

**1. "Why does it need Always location?"** Because the app's job is knowing
where someone is while their phone is in their pocket, and a missed check-in
has to reach their guardian whether or not the app is open. Include a demo
account in the review notes and say this plainly — reviewers reject
`Always` when the reason is not obvious, and here it is the product.

**2. "Is this a medical or emergency service?"** No, and the app says so
itself: it never tells anyone they are safe to drive, and the emergency
escalation hands off to the real emergency number. Point the reviewer at the
disclosure copy rather than arguing it.

Give them a **demo account with a subscription already active**, or they will
land on a paywall and cannot see the app. Put the credentials in App Review
Information.

## Payments: the rule that decides your margin

In-app subscriptions on iOS **must** use Apple's in-app purchase, and Apple
takes 15–30%. Card-on-file through Stripe is only allowed for goods and
services consumed outside the app.

Safehubby has both kinds and the code already knows the difference:
`platform` on the subscription picks the rail (`railFor` in `billing.ts`), and
the store rail records a charge as pending until its receipt confirms it.

- **Plan subscriptions bought in the iOS app** → Apple IAP. Not yet wired:
  `@capacitor/in-app-purchase` or RevenueCat, plus products created in App
  Store Connect. **This is the one remaining piece of real work before a
  paid submission.**
- **Rides, concierge tasks, deliveries** → real-world services delivered by a
  person, so Stripe is correct and Apple's cut does not apply.

Apple's 15% Small Business Program applies under $1M/yr — worth applying for
on day one.

## The sequence

```
1. Enrol in the Apple Developer Program          (days — start now)
2. Create the ASC API key, add to Codemagic      (minutes)
3. Register bundle id + create the app record    (minutes)
4. Set VITE_API_URL in the Codemagic group       (minutes)
5. Run `ios-simulator-build` — does it compile?  (~10 min)
6. Add app icons                                 (an afternoon)
7. Wire Apple IAP for subscriptions              (the real work)
8. Run `ios-testflight` → install on your phone  (~20 min)
9. Screenshots, privacy labels, review notes     (an afternoon)
10. Submit                                       (review: 1–3 days)
```

Steps 1–5 can all happen before a single line of IAP code is written, and
step 5 is worth doing now: it is free, needs no Apple account, and tells you
whether the committed Xcode project actually builds on a real Mac.
