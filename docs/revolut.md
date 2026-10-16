# Connecting Revolut Business

Revolut Business pays for what assistants buy on a task (a single-use card capped at the task's limit) and sends assistants their pay every 14 days. Revolut does not use a simple API key; it uses a key pair and a one-time approval.

## One-time setup

1. **Make a key pair** on your computer:
   ```
   openssl genrsa -out revolut-private.pem 2048
   openssl req -new -x509 -key revolut-private.pem -out revolut-public.cer -days 1825
   ```
2. In **Revolut Business → Settings → APIs → Business API**, add an API certificate. Upload `revolut-public.cer` and set the OAuth redirect URI to `https://safehubby.com/master`. Revolut gives you a **Client ID**.
3. On Railway, set:
   | Variable | Value |
   |---|---|
   | `REVOLUT_CLIENT_ID` | the Client ID from step 2 |
   | `REVOLUT_PRIVATE_KEY` | the contents of `revolut-private.pem` (paste it whole) |
   | `REVOLUT_ISSUER` | `safehubby.com` (the domain in your redirect URI, no `https://`) |
   | `REVOLUT_ENV` | `sandbox` while testing, `production` when live |
   | `SAFEHUBBY_ENCRYPTION_KEY` | must be set, so the Revolut sign-in is stored encrypted |
4. Sign in to your **Owner portal** and press **Connect Revolut Business**. Approve it on Revolut's page; it sends you back and the portal says **Connected**.

From then on the server signs in to Revolut by itself and renews its access every ~40 minutes. Keep `revolut-private.pem` somewhere safe and never share it.

## What is still to confirm against a live sandbox

The sign-in (key-signed JWT, consent, code exchange, token refresh) is built and tested. The card and payout calls follow Revolut's published Business API but have not been run against a real sandbox yet — try one card and one small payout in `sandbox` before switching to `production`. Revolut issues cards to members of your own Business team, so assistants have to be added as team members to hold a card.
