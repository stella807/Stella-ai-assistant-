# Phone checks with Sofía

Decided with the owner on 20 November 2026. Built: `apps/api/src/adapters/vapi.ts`, the owner routes `/api/master/phone-checks` in
`routes.ts`, and `SofiaCallsSection` in the owner portal (Money tab). It does nothing until the variables below are set in Railway.

## To turn it on (owner)
1. In Railway, Variables: add `VAPI_API_KEY` = the **private** key from the Vapi dashboard (API Keys). Optional: `VAPI_PHONE_NUMBER_ID`
   to choose which Vapi number calls; otherwise the first imported number is used.
2. In Vapi: Phone Numbers, Import, Twilio, with a Twilio number. **Free Vapi numbers cannot call out** (Vapi's docs).
3. Set spending limits in Twilio and Vapi (about $20 a month covers 20 calls).
4. In the owner portal, Money tab, "Sofía: call to check": first call your own phone to hear her.

Optional: `VAPI_VOICE_ES` / `VAPI_VOICE_EN` (Azure voice names; defaults `es-PR-KarinaNeural`, `en-US-JennyNeural`, to be confirmed on the
first test call), `VAPI_MODEL` (default `gpt-4.1-mini`).

## What it is
An automated assistant named **Sofía** calls a pharmacy (or another business) to ask one question, usually whether an item is in stock
today, and saves the answer as a **Checked today** entry marked "automated phone call" (never "seen in person"). It starts only when the
owner presses **Call to check** in the owner portal.

## Choices
- **Calls:** Vapi (voice, listening and AI) with a Twilio number imported into Vapi. Vapi's free numbers only receive calls (outbound
  is not supported, and users report a 10-call daily cap), so the number comes from Twilio, ideally a Puerto Rico 787 or 939 number.
- **Voice:** a female voice, Spanish first (for Puerto Rico) and English. A sample was made with the open Kokoro voices `ef_dora`
  (Spanish) and `af_heart` (English); Vapi's own voices can be used instead.
- **Length:** every call is capped at **5 minutes**.
- **Spending:** limits set by the owner in both Twilio and Vapi, about **$20 a month** (Vapi's page: $0.05/min hosting plus models at cost; Twilio outbound $0.014/min).
- **Limits in the code:** one call to a number per Puerto Rico day, ten calls a day in all, US and Puerto Rico numbers only, owner only.
- **Keys:** the Vapi API key goes in through the environment's secure credential form, never in chat or in the repository. The Twilio
  token stays between Twilio and Vapi.

## Rules
- Sofía says in her first sentence that she is Safehubby's automated assistant, and offers to hang up if the person would rather not
  talk to one.
- Business numbers from the map only; one call per business per day; only when the owner presses the button.
- One question, then thanks and goodbye. Hang up on a phone menu (for example "press 1 for pharmacy") rather than wait in it.
- A short text summary is kept, not a recording.
- Before turning it on, the owner asks a lawyer about automated calls (US rules treat AI voices like artificial voice calls; the risk is
  mostly with cell numbers).

## Opening line (sample)
"Buenas tardes. Le habla Sofía, la asistente automatizada de Safehubby. Llamo de parte de un cliente para una pregunta rápida: ¿tienen
[artículo] en existencia hoy? Si prefiere no contestar a una asistente automatizada, no hay problema, cuelgo ahora mismo. Muchas gracias."
