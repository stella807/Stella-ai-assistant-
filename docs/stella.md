# Stella

Stella is the in-app assistant: a chat on her own tab in the bottom nav,
powered by Claude through the official Anthropic SDK.

## Turning her on

Set `ANTHROPIC_API_KEY` on the API server. Optional:

| Variable | Default | Notes |
|---|---|---|
| `STELLA_MODEL` | `claude-opus-5` | Any Claude model id. |
| `STELLA_EFFORT` | `medium` | `low`, `medium`, `high`, `xhigh`, `max`. Lower is faster and cheaper; these are short chat replies. |

Without a key, `GET /api/stella/status` reports `handoff`, the tab says Stella
isn't set up, and ordinary messages get a 503. Emergency replies still work
(see below).

On Opus 5 / Fable 5 models the adapter opts into server-side refusal fallbacks
(`fallbacks: "default"`), so a message the primary model declines is retried on
a fallback model instead of failing.

## What she can and can't do

- **She talks; she never acts.** She can't book a ride, send an SOS, share a
  location or answer a check-in, and is instructed never to say she has. She
  points to the button on the Tonight tab that does it.
- **She never tells anyone they're OK to drive**, at any estimate, the same
  rule as the rest of the app (`neverAdviseDriving` in `bac.ts`).
- **She sees tonight's numbers, not location.** The system prompt gets the
  traveler's first name, home label, drinks, the estimate range, check-ins
  and a *count* of people watching. It never gets pings, coordinates or the
  watchers' names. See `stellaFactsFor` in `packages/core/src/stella.ts`.

## Emergencies bypass the model

`detectStellaSafety` matches the latest message against medical, danger and
self-harm phrases (English and Spanish). A match is answered from a fixed
script (`stellaSafetyReply`): call 911 or the local emergency number, hold SOS,
and 988 for a crisis. The model is never called, the rate limit doesn't apply,
and it works with no API key. The client styles these replies as a red safety
card.

The patterns are deliberately broad: a false positive costs one scripted reply,
and a false negative costs a paragraph of chat in front of someone in trouble.

## API

| Route | |
|---|---|
| `GET /api/stella/status` | `{ mode, requires }`. Signed-in only. |
| `POST /api/stella/messages` | Body `{ messages: [{ role, text }] }`, oldest first, starting and ending on `user`, at most 20 turns. Returns `{ text, source: "stella" \| "safety", safety? }`. |

Nothing is stored server-side. The client keeps the conversation in
`sessionStorage` (so it survives switching tabs, not the next week) and sends
the recent history each turn (`recentStellaTurns`). Model calls are limited to
60 per traveler per hour. Provider errors reach the traveler as a plain 502,
never the provider's own message.
