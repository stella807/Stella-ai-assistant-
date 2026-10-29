# Website assistant ("Ask Safehubby")

A chat and voice assistant on the marketing site that answers questions about pricing and how Safehubby works.

- **Facts, not a script.** `packages/core/src/site-chat.ts` renders the answer sheet from the live plans, allowances, errand fees, Wingman Club dues and the owner's free-each-month switch, so a price change shows in the assistant with no one editing a prompt. It can only answer from those facts, otherwise it points to the contact email.
- **Server.** `POST /api/site-chat` (public) sends the last 12 turns to an OpenAI-compatible chat endpoint and returns `{ reply }`. It holds no account data, takes no payment and can change nothing. Limits: 30 questions per visitor per hour and `SITE_CHAT_DAILY_LIMIT` (default 3000) for the whole site per day, so abuse cannot run up the bill. Replies are capped at 350 tokens.
- **Browser.** `apps/site/src/chat/chat.js` is a small deferred script. Voice uses the browser's own speech recognition and speech synthesis (no extra service); where a browser lacks them it is a plain text chat. English and Spanish follow the page's language.

## Turning it on

On the API (Railway), set the model endpoint. `AI_ASSIST_*` is shared with the assistants' drafting helper; `SITE_CHAT_*` overrides it for the website only:

| Variable | Meaning |
| --- | --- |
| `SITE_CHAT_API_BASE` / `AI_ASSIST_API_BASE` | OpenAI-compatible base URL, ending in `/v1` |
| `SITE_CHAT_API_KEY` / `AI_ASSIST_API_KEY` | The provider key |
| `SITE_CHAT_MODEL` / `AI_ASSIST_MODEL` | Model name (default `gpt-4o-mini`) |
| `SITE_CHAT_DAILY_LIMIT` | Questions per day for the whole site (default 3000) |
| `SITE_CONTACT_EMAIL` | Where it sends what it cannot answer (default `contact@safehubby.com`) |
| `ALLOWED_ORIGINS` | Must include the marketing site's origin, or the browser will block the request |

At site build time: `CHAT_API_URL` overrides the endpoint (default `${APP_URL}/api/site-chat`), and `SITE_CHAT=off` leaves the assistant out. The site's `_headers` then allows the script, the connection to that server and the microphone, and nothing else. With no key set, the assistant says it is unavailable and gives the email.
