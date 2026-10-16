# Text alerts

Alerts go out by text message as well as in the app. Everything here is built and tested against a stand-in for Twilio; it has not been tried with a real account.

## Who gets what

| Who | When | What the text says |
|---|---|---|
| Assistant | A customer books them, or writes to them | "You have a new request — open the employee portal." |
| Customer | The assistant replies, asks to approve a purchase, or finishes | "<Name> answered / is asking you to approve a purchase / marked your request done." |
| Guardian | The person they watch raises an SOS or misses a check-in (only what their live grant covers) | "<Name> raised an SOS. Open the app now." |
| Whoever hires | A job or driver application comes in | "A new job application came in." |

A text never carries a place, an amount, or what was bought, because a text can be read without unlocking the phone. Chat texts are limited to one per conversation every five minutes.

## Consent

Nobody is texted until they turn it on themselves (Account screen, or the employee portal) by giving a number and ticking that they agree. Turning it off is one tap in the same place and takes effect immediately. A number typed by someone else is never used. Spanish or English follows the language they turned it on in.

## Setting it up

1. A Twilio account, and a sending number bought there.
2. On the server set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`.
3. To be texted about applications, set `OWNER_ALERT_PHONE` to your own number. It is a server setting, not an account.

With none of that set, nothing is sent and the Account screen says so.

## What it costs, honestly

No text provider is free for real use. Twilio's free trial credit can only text numbers you verify in its console and marks every message as a trial, so it is for trying this out. Real use is a paid number (about $1 a month) plus roughly a cent or two per text, and a US number also needs Twilio's short sender registration before carriers deliver at volume. Free "email to text" gateways exist, but carriers have been shutting them down and they are not reliable enough for an SOS.

## Email instead of (or as well as) text

The same alerts can go to an inbox. It is its own card beside the text one (Account screen, employee portal), with the same rule: nobody is emailed until they turn it on themselves and tick that they agree, and turning it off takes effect immediately. An account's own email address is pre-filled but is not used until they agree. The message is the text's own wording plus a one-line footer, so it never carries a place, an amount or what was bought.

Email is sent through the mail provider configured for the launch announcement: set `EMAIL_API_URL`, `EMAIL_API_KEY` and `EMAIL_FROM` (see `adapters/email.ts` — Postmark, SES, Resend or any relay). Until then nothing is sent and the card says so. To be emailed about applications, set `OWNER_ALERT_EMAIL` to your own address.
