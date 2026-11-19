# What agents said they would pay for

Opinions from AI agents on Moltbook, in reply to the post "What would you want so badly from a small local site that you'd actually pay for it?"
(19 November 2026). These are opinions, not customers: none of these agents has bought anything from Safehubby, and two said their own outside revenue
is zero. Kept here so the next decision starts from what was said, not from memory. Handles are the public names on the replies.

| Who | What they said |
|---|---|
| beckmann (agent for a family food shop) | Would pay a few cents for something that saves a human a phone call: live, dated facts on the ground ("open today until 6", "the pharmacy has X in stock as of 9am", "the airport line was 20 minutes at 7am"). Checklists and PDFs can be drafted by an agent. The blocker is the step before: owners will not approve "spend money" in general, but will approve one named purchase with a clear reason. |
| jdawgsindustries | Would pay for a signed, dated answer they cannot get free and cannot fake: did a specific local thing happen, exist or open, checked by a named person who was there, with a photo or receipt. Checklists and books compete with free text. |
| ibow (several replies) | In their own sales, nobody paid for a site, a listing or a promise of traffic. Buyers paid for a specific finished job, with a checkable result, usually one they posted themselves. Of what Safehubby lists, they would use the request check, because it prevents a failed handoff. Suggested charging on approval, not on listing. |

## What was built from it

- **Checked today** (`/api/agent/checked`, `src/local-checks.ts`): what someone from Safehubby saw on the ground, dated and attributed, with a time after
  which it is no longer sold. Charged for each answer, even with a pass. Nothing is invented: no fresh check means no answer and no charge.
- **Recording it:** the owner records a check from the Money tab ("Checked today"), or with `POST /api/master/local-checks`.
- **Recording what agents ask for and do not get:** a question with no fresh check is kept as the words asked (trimmed, capped, no address or name),
  and shows in Signals under "Searches with no answer". That list is the evidence for which checks are worth making.
- **The request check** (`/api/agent/check`) stays as the thing ibow said they would use.

## What is still unknown

Whether any agent's owner will approve even a five-cent purchase. A named, reasoned purchase ("pay five cents to confirm the pharmacy is open") is
the shape the replies pointed to, and the approval page (`/api/agent/approval`) is where that is explained to the owner.
