# Website assistant ("Ask Safehubby")

A chat and voice assistant on the marketing site that answers questions about pricing and how Safehubby works.

- **Facts, not a script.** `packages/core/src/site-chat.ts` renders the answer sheet from the live prices (plans only when `SITE_CHAT_SHOW_PLANS=on`), allowances, errand fees, Wingman Club dues and the owner's free-each-month switch, so a price change shows in the assistant with no one editing a prompt. It can only answer from those facts, otherwise it points to the contact email.
- **Server.** `POST /api/site-chat` (public) sends the last 12 turns to an OpenAI-compatible chat endpoint and returns `{ reply }`. It holds no account data, takes no payment and can change nothing. Limits: 30 questions per visitor per hour and `SITE_CHAT_DAILY_LIMIT` (default 3000) for the whole site per day, so abuse cannot run up the bill. Replies are capped at 350 tokens.
- **In the app.** `apps/web/src/components/SiteChatBubble.tsx` puts the bubble on every customer screen, signed in or out. It talks to the app's own server, so there is no cross-origin setup and the marketing site does not need rebuilding for it to work.
- **On the marketing site (optional).** `apps/site/src/chat/chat.js` is the same bubble as a small deferred script for the static site. It only appears after that site is rebuilt and deployed.
- **Browser.** `apps/site/src/chat/chat.js` is a small deferred script. Voice uses the browser's own speech recognition and speech synthesis (no extra service); where a browser lacks them it is a plain text chat. English and Spanish follow the page's language.

## Turning it on

On the API (Railway), the one variable that matters is a Claude key. It also switches on the assistants' drafting helper, which uses the same model setup.

| Variable | Meaning |
| --- | --- |
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com. Claude is called directly through Anthropic's Messages API. |
| `SITE_CHAT_MODEL` / `AI_ASSIST_MODEL` | Optional model override per feature. Default `claude-haiku-5-5`. |
| `SITE_CHAT_SHOW_PLANS` | Leave unset and the assistant does not state or describe any membership plan, price, allowance or feature; it sends those questions to the contact email and still explains how Safehubby works, errands and the Wingman Club. Set to `on` to let it quote the plans. |
| `SITE_CHAT_DAILY_LIMIT` | Questions per day for the whole site (default 3000) |
| `SITE_CONTACT_EMAIL` | Where it sends what it cannot answer (default `contact@safehubby.com`) |

Another provider is still possible: set `SITE_CHAT_API_BASE` and `SITE_CHAT_API_KEY` (or `AI_ASSIST_API_BASE` and `AI_ASSIST_API_KEY` for the drafting helper) to any OpenAI-compatible endpoint and that feature uses it instead of Claude. An explicit endpoint always wins over `ANTHROPIC_API_KEY`; an earlier `AI_ASSIST_API_*` setup keeps working for the website. Environment is read on every request, so a change needs a redeploy only because Railway restarts on variable changes.

For the marketing-site version only, `ALLOWED_ORIGINS` must include that site's origin, or the browser will block the request.

For the marketing-site version, at its build time: `CHAT_API_URL` overrides the endpoint (default `${APP_URL}/api/site-chat`), and `SITE_CHAT=off` leaves the assistant out. The site's `_headers` then allows the script, the connection to that server and the microphone, and nothing else. With no key set, the assistant says it is unavailable and gives the email.
