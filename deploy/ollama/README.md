# Safehubby's own AI (Ollama)

Our own AI model, running on our own Railway service. The API asks it first.
If it is down or slower than 60 seconds, the API asks the LiteLLM gateway or
Claude instead, when those are set up (see `apps/api/src/adapters/llm.ts`).

## The model

`qwen3:4b-instruct-2507-q4_K_M`: Qwen3 4B Instruct (July 2025 version), 4-bit.

- **License:** Apache-2.0, so commercial use is allowed. Qwen2.5 3B was
  rejected because its license does not allow commercial use.
- **Languages:** answers well in Spanish and English.
- **Tools:** it can fill in a form for the app, such as a service request.
  The app must still check every value before using it. In testing it once
  picked "hospital companion" where "wellness check" was right.
- **Speed:** measured with no GPU. On 4 CPU cores a short answer takes about
  6 to 10 seconds. Held to 2 cores, it takes about 7 to 20 seconds.
- **Size:** a 2.5 GB download and about 3.5 GB of memory while loaded.
- **Drafts tested:** four real assistant notes, in English and Spanish. Each
  came back accurate, with nothing invented, in 7 to 14 seconds on 2 cores.

Other models tested on the same 4 cores:

| Model | License | Reply | Filled in the form? |
|---|---|---|---|
| Qwen3 4B Instruct 2507 | Apache-2.0 | ~10 s, good Spanish | Yes |
| Qwen3 1.7B | Apache-2.0 | ~3 s, vague | No |
| Gemma 4 E2B | Apache-2.0 | ~10 s, good Spanish | No, asked for the date |
| Qwen3 4B (thinking) | Apache-2.0 | ~27 s, wrote its reasoning in English | No |

To try another model, change `OLLAMA_MODEL` on both services.

## Railway, step by step

Railway has no GPUs, so this runs on CPUs. That is enough for short answers.

1. In your Railway project, click **New**, then **GitHub Repo**, and pick
   this repo. Name the new service `ollama`.
2. Open the service's **Settings**:
   - **Root Directory:** `/deploy/ollama`
   - **Config file path:** `/deploy/ollama/railway.json`
   - **Networking:** do **not** generate a public domain. Ollama has no
     password, so it must only be reachable inside your project.
   - **Resources:** at least 4 vCPU and 6 GB memory.
   - **Serverless:** on, so it sleeps when nobody uses it (see the cost section).
3. Right-click the service, choose **Attach volume**, and mount it at
   `/root/.ollama`. The model is saved there, so it downloads only once.
4. Open the service's **Variables** and add `PORT` = `11434`.
5. Deploy. The first start downloads the model (2.5 GB), which takes a few
   minutes. The log says `[ollama] ready` when it is done.
6. Open the **API** service's Variables and add:
   - `OLLAMA_URL` = `http://${{ollama.RAILWAY_PRIVATE_DOMAIN}}:11434`
   - `OLLAMA_NUM_THREAD` = the number of vCPUs you gave the ollama service
     (for example `4`). Ollama otherwise counts all the cores of Railway's
     machine, not your share of them, and runs slower.
   - `GEMINI_API_KEY` = a free key from Google AI Studio, the free backup.
   - Optional: `OLLAMA_FEATURES` = `AI_ASSIST` to use it only for the
     assistants' drafting help and keep Claude for everything else.
7. Redeploy the API. In the owner portal, go to **Setup**, then **Our own
   AI**. It should show three checks. Ask it a test question and note how
   many seconds it took: Railway's CPUs may be faster or slower than the
   ones it was measured on.

To stop using it, delete `OLLAMA_URL` from the API service. Nothing else changes.

## What it costs: set up to be nearly free

Two settings keep it close to $0:

1. **The model unloads after 5 idle minutes** (`OLLAMA_KEEP_ALIVE=5m`, the
   default here). Memory is paid for only while it answers.
2. **Railway Serverless:** on the ollama service, open Settings and turn on
   **Serverless** (sometimes called "App Sleeping"). The whole service sleeps
   when nobody uses it and wakes up on the next question.

Railway charges for memory and CPU only while they are used ($10 per GB of
memory a month, $20 per vCPU a month, $0.15 per GB of volume a month; check
current prices). At a few hundred answers a month that is a few cents, plus
about $0.45 for the 3 GB volume. It should fit inside the $5 of usage the
Hobby plan already includes.

**The tradeoff:** after a quiet spell, the first answer waits while the service
wakes and loads the model, about 15 to 30 seconds more. The API waits up to 60
seconds. Answers right after that come at normal speed.

**Free backup:** add `GEMINI_API_KEY` to the API service, with a free key from
Google AI Studio (aistudio.google.com). If our model is asleep too long or
down, Gemini answers next, before anything paid. The free tier has daily
limits, and Google may use free-tier prompts to improve its products, so the
app should not send members' private details through it.

The order is: our model, then Gemini (free), then the LiteLLM gateway or
Claude (paid), whichever are set up.

If the site gets busy (thousands of answers a day), it answers one question
at a time and people may wait. Then the API can point at a GPU provider by
setting `SITE_CHAT_API_BASE` and `SITE_CHAT_API_KEY` (or the `AI_ASSIST_`
pair) to any OpenAI-compatible service, with no code changes.

## Safety

- No public domain. Only the API talks to it, over Railway's private network.
- `OLLAMA_NOHISTORY=1`: Ollama keeps no history of prompts.
- The image is pinned by digest in the `Dockerfile`. Update it on purpose,
  after testing a new release.
