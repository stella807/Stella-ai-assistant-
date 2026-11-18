# Safehubby Business (stage 1)

Other companies get their own AI employee on their own website. Stage 1 is the
smallest thing that can be sold: an account, a set-up form, a chat box and the
conversations. Billing, plans, appointments and WhatsApp come in later stages.

## How it works

1. **You** (the owner) add a business in the portal: Setup, then Business
   customers. You get a sign-in key once; send it to the business privately.
   Only a scrambled copy is kept, so a lost key is replaced with **New key**.
2. **The business** signs in at `/business` with its key and fills in its
   assistant: name, tone, language, about, hours, services with prices, the
   questions people ask, and how to reach a person.
3. **The business** pastes one line on its website:
   `<script src="https://safehubby.com/widget.js" data-business="biz_..." async></script>`
4. **A visitor** chats. The assistant answers only from what the business wrote,
   says it is an AI, and sends the visitor to the business's contact details when
   it has no fact. When no fact matches, the model is not asked at all.

## Safety rules

- Each business's data is separate. The assistant never sees another business's
  facts, or Safehubby's own members or plans (tested).
- The visitor's words travel as the question, never as the rules. The chat box
  writes everything as text, never as markup.
- The business can list the websites allowed to show its chat box. Left empty,
  any website could use up its monthly answers.
- Limits: 20 questions an hour per visitor per business, a monthly answer limit
  per business (set by you), and a daily ceiling for all businesses together
  (`WIDGET_DAILY_LIMIT`, default 3,000 AI answers).
- Suspending a business signs it out and turns its chat box off at once.
- Conversations are saved for the business (its newest 1,000), because the
  business owns them. The chat box tells visitors that messages may be saved.
  The business's terms should say so. A lawyer should read them before you sell.

## What it costs

Answers come from the model set up for the site (Ollama first, then Gemini, then
Claude: see `deploy/ollama/README.md`). Our own model costs a fixed amount a month
and answers one question at a time, so many businesses chatting at once will
queue. Set each business's monthly limit so that a plan cannot lose money.

## Not built yet

Billing and self-sign-up (stage 2), the usage and revenue view (stages 3 and 4),
appointments and follow-ups (stage 5), WhatsApp and CRM links (stage 6, which need
accounts of your own). Nothing here pretends those exist.
