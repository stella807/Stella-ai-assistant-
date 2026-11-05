# Terms of Service and Privacy Policy: drafts

Both are live in the app as **drafts under legal review**, linked from the
footer (signed out and signed in), in English and Spanish. The text is in
`apps/web/src/app/legal-copy.ts` and is written from what the app actually
does. They are not legal advice and are not final until a lawyer has read them.
The page says so at the top of each.

**When the app's behaviour changes (prices, cancellation, retention, who we
share with), change the text in the same commit.**

## Questions only a lawyer can settle

These are deliberately left open in the text rather than guessed:

- **Who the contracting entity is**, its registered name and address.
- **Governing law and how disputes are decided.** The Terms say only that this
  "will be stated here once confirmed". Arbitration and class-action waivers
  need careful drafting to hold up and are not included.
- **The limit of liability** (currently twelve months of fees) and the
  disclaimer of warranties: standard wording, but its enforceability varies by
  state and by Puerto Rico law.
- **Whether workers are contractors or employees**, per state. The Terms call
  assistants independent professionals; that has to match the answer.
- **Armed protection.** The consent that clients accept armed personnel for an
  armed booking, and licensing under Puerto Rico's Ley 108.
- **Automatic renewal and cancellation** rules (California and others) against
  what the Terms say: renewal until cancelled, one-tap cancellation, no refund
  of a paid period.
- **Privacy rights** by state (California CCPA/CPRA and others), data-deletion
  and access procedures, and whether a data-processing agreement is needed
  with each service provider (Stripe, the text and email providers, maps,
  push, flight tracking, hosting).
- **Age:** the signup form asks for a date of birth and refuses under 18; only that the check was done is stored, not the date. It is self-declared, so ask whether more is needed (for example for armed bookings).
- **Minimum retention** for payment and task records.

## What the drafts claim, and where it comes from

- Location history deleted after 7 days: `LOCATION_RETENTION_DAYS`.
- Card numbers handled by Stripe, not stored here: `adapters/stripe.ts`.
- Task cards limited to the cap: `docs/billing.md`, `adapters/stripe-cards.ts`.
- Included hours, planned versus on-demand, $45 an hour: `included-grabs.ts`.
- Cancellation in one tap, paid features to the end of the period:
  `docs/billing.md`.

## The box a client checks to agree

- **At sign-up** the form has a required checkbox: agree to the Terms of
  Service, Privacy Policy and Client Disclosures, and allow armed personnel
  (licensed bodyguards) to be with them when they book armed protection. The
  server refuses an account without `acceptedTerms: true`, and records the
  version (`CONSENT_VERSION`) and the date on the account.
- **Before a first armed booking**, a member who signed up earlier (or under an
  older version) sees the same box and must check it. The server refuses armed
  quotes and bookings until the agreement is recorded.
- It says "when I book armed protection", not "at all times": assistants are
  unarmed, hospital stays never have firearms, and armed protection is
  regulated guard work. A wider consent is a question for counsel.
- To ask everyone again after the wording changes, bump `CONSENT_VERSION`.
