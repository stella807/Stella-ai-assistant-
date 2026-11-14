# LiteLLM gateway

One address for the assistants' AI drafting help. Claude answers; Gemini's
official free tier takes over if Claude is down, rate-limited or slower than
5 seconds. If the gateway itself is down, the API calls Claude directly and
logs `LLM gateway failed` (see `apps/api/src/adapters/llm.ts`).

## Railway

1. New service from this repo, named `litellm`.
2. Its Settings:
   - Root Directory: `/deploy/litellm`
   - Config file path: `/deploy/litellm/railway.json`. Railway reads the
     config file from the repo root unless told otherwise, and the root one
     health-checks `/api/health`, which LiteLLM does not have.
   - No public domain. The API reaches it on Railway's private network.
3. Its Variables:
   - `ANTHROPIC_API_KEY`: your Claude key.
   - `GEMINI_API_KEY`: a free key from Google AI Studio. Optional; without it
     there is no backup model.
   - `LITELLM_MASTER_KEY`: a long random string starting with `sk-`.
   - `PORT`: `4000`.
4. The API service's Variables:
   - `LLM_GATEWAY_URL` = `http://${{litellm.RAILWAY_PRIVATE_DOMAIN}}:4000`
   - `LLM_GATEWAY_KEY` = `${{litellm.LITELLM_MASTER_KEY}}`
   - Keep `ANTHROPIC_API_KEY` there too: it is the fallback if the gateway is down.

Remove `LLM_GATEWAY_URL` to go back to calling Claude directly.

Set a monthly spending limit on each key in the Anthropic and Google consoles.
