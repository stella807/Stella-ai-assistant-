# LiteLLM gateway

One address for the website assistant and the drafting helper. Claude answers;
Gemini's official free tier takes over if Claude is down or rate-limited. If the
gateway itself is down, the API calls Claude directly (see `apps/api/src/adapters/llm.ts`).

## Railway

1. New service → this repo, root directory `deploy/litellm` (it builds the Dockerfile).
2. Variables on that service:
   - `ANTHROPIC_API_KEY`: your Claude key.
   - `GEMINI_API_KEY`: a free key from Google AI Studio (optional; without it there is no backup model).
   - `LITELLM_MASTER_KEY`: a long random string starting with `sk-`.
3. Do not give it a public domain. The API reaches it on Railway's private network.
4. Variables on the API service:
   - `LLM_GATEWAY_URL` = `http://<litellm-service-name>.railway.internal:4000`
   - `LLM_GATEWAY_KEY` = the same `LITELLM_MASTER_KEY`.
   - Keep `ANTHROPIC_API_KEY` there too: it is the fallback if the gateway is down.

Remove `LLM_GATEWAY_URL` to go back to calling Claude directly.

Set a monthly spending limit on each key in the Anthropic and Google consoles.
