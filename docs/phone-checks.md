# Phone checks with Sofía (planned, not built yet)

Decided with the owner on 20 November 2026. Waiting on the owner's Twilio and Vapi accounts before any code is written.

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
- **Spending:** limits set by the owner in both Twilio and Vapi, suggested **$35 a month** (20 calls at 5 minutes, worst case).
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
