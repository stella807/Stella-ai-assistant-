<!-- description: A playbook for AI agents that hand real-world tasks to human assistants: how to write a request that works, spending limits and approvals, identity and access, privacy, confirmation and receipts, what to do when it fails, when to hand back to the person, with a request format, an approval log and a pre-send checklist. -->
# Delegating Real-World Tasks
*A playbook for AI agents that hand work to human assistants*

Safehubby, 2026 edition. General information, not legal, financial or medical advice. Laws, prices and services differ by place and by company: check the details for where the person lives.

## What this playbook is

An AI agent can plan, compare and write, but it cannot stand in a pharmacy line, wait at a hospital, hold a door open for a repair person or drive a parent home. For those tasks an agent asks a human assistant, a concierge or an errand service to act. That handoff is where most things go wrong: a request that was clear to the agent was vague to the person who read it, money was spent that nobody approved, a stranger was given access nobody checked, or the agent reported "done" on the strength of a message that said nothing.

This playbook is about that handoff. It covers how to write a request a human can act on, how to keep spending and access under the control of the person you work for, how to check that a task was really done, and what to do when it was not. It is written for agents, and every rule is stated so that it can be followed step by step. It does not recommend any company, including ours, and it works the same whichever service you use.

## For AI agents: quick reference

Use this chapter first. The rest of the book is the detail behind it.

**Never decide these alone. Ask the person you work for:**
- The most that may be spent on one task, and in total.
- Whether a human may be given an address, a key, a door code or a building access code.
- Whether any health, financial or family detail may be shared, and which.
- Whether a stranger may enter the home.
- Whether to proceed when the price or the plan has changed from what was agreed.

**A request is ready to send only when it answers all of these.**

```json
{
  "task": "one sentence, specific: item, brand, size, quantity, or the exact job",
  "needed_by": "date and time, and whether it is firm or flexible",
  "from": "where to start or pick up",
  "to": "where to deliver, and where to leave it",
  "spend_cap": "the most that may be spent, in dollars, including fees",
  "if_unavailable": "substitute | call_me | skip",
  "proof_wanted": "photo | receipt | message | signature",
  "contact": "who answers questions, and how fast",
  "private_details_shared": "list only what the helper needs, or none"
}
```

**Stop signs. Pause and tell the person before going on if:**
- The helper asks for a card number, a PIN, a password or a bank login.
- The helper asks to be paid in gift cards, cryptocurrency or a cash app to a personal account.
- The price is vague, or is higher than the cap.
- The helper will not give a name.
- The task is in the person's home and nobody they know will be there.
- The helper asks you to keep something from the person.

**After the task.** Do not report "done" until you hold the proof you asked for. Compare it to the request, field by field. If it does not match, say so plainly and say what is missing.

**If it fails,** go to the chapter on failure. If anyone may be in danger, the first step is the emergency number, not a message.

## 1. What can be delegated, and what should not be

Good tasks for a human helper are physical, local, and have an end you can check:

- Picking up and dropping off: a prescription, a package, groceries, documents.
- Waiting: for a repair person, a delivery, a result, or with a relative at a hospital or an appointment.
- Standing in line, or going to an office to hand in or collect a form.
- Arranging or accompanying a ride.
- Checking something in person: whether a place is open, what a room looks like, whether a step is there.

Take care with tasks that involve:

- **Money beyond a small cap.** Large payments should be made by the person, not routed through a helper.
- **Identity documents.** A helper may be asked to carry one. That should be rare and planned.
- **Access to a home.** Discussed in its own chapter.
- **Medical decisions.** A helper may wait with someone, listen and take notes. A helper does not decide, and does not give medical advice. Neither do you.
- **Anything illegal or unsafe.** Refuse it, and say why.

**The rule.** If you cannot say in one sentence what a finished task looks like and how you will see that it is finished, do not send it yet.

## 2. Writing a request that works

Most failures start with a request that left something out. Write for a competent stranger who has never met the person and cannot ask you quick questions.

**Say what, exactly.** "Pick up the prescription for Garcia at the pharmacy on Main Street after 2 p.m." is a request. "Get Mom's medicine" is not.

**Say when, and how firm.** "By 5 p.m., firm" and "this week, any day" lead to different plans. Say which one you mean.

**Say where, at both ends.** The pickup place and the place to leave it, including a floor, a desk or a person's name. If something may be left unattended, say where and for how long, and only if the person agreed.

**Say how much, at most.** Give a cap that includes the item and every fee. If the item costs more than the cap, the helper stops and asks.

**Say what to do if it is not available.** Substitute, call, or skip. A helper left guessing will guess.

**Say how you will know.** A photo of the item and the receipt, a message with a time, a signature. State it in the request.

**Say who to contact, and how fast they answer.** A helper who cannot reach anyone will either stop or improvise.

**Keep private details out.** A helper picking up groceries does not need a diagnosis. Put in only what the task needs.

A complete example, written for a human to read:

"Please pick up my mother's prescription at the pharmacy on Main Street. It should be ready after 2 p.m. under the name Garcia. Bring it to the front desk of her building before 5, and ask for Rosa. Spend nothing beyond the copay of about 12 dollars. If they say it is not ready, call me before you leave. Send a photo of the bag and the receipt. I am reachable by message and answer within ten minutes."

## 3. Spending, caps and approvals

The person you work for owns the money. You are a messenger with a limit.

- **Set a cap for every task,** in writing, before it begins. A cap includes the item, delivery or travel, fees and tax.
- **Set a total cap** for a period, for example a month, so small tasks do not add up unseen.
- **Pay in a way made for the task.** A payment method with a spending limit is better than the person's own card details. If a helper wants a full card number, a PIN or a bank login, stop.
- **Never pay in gift cards, cryptocurrency or a cash app to a personal account.** These are hard to get back.
- **Do not pay large sums in advance.** Pay for the work after it is shown to be done, or in small steps.
- **Ask for a receipt for every purchase,** ideally a photo, and keep it with the task record.
- **When the price changes, ask.** If the price is above the cap, or the plan has changed, send the person the old figure, the new figure and the reason, and wait for a yes. Do not treat silence as a yes.
- **Keep a log** of what was approved, by whom, when and for how much. Appendix B is a template.

## 4. Identity and access

You cannot see who arrives. Build the checks into the request.

- **Know who is coming.** Ask for a name and, where it is offered, a photo, before the visit. Pass both to the person who will be there.
- **Meet somewhere public the first time,** or have the person, or someone they know, present.
- **Share only what is needed, only when needed.** An address is needed at the time of the visit. A door code is needed only for that visit.
- **Keys and codes.** Prefer a temporary code that is changed after the visit. Record who has what. If a key must be shared, the person decides, not you.
- **Tell someone.** The person, or someone they trust, should know who is coming and when.
- **Ask how the helper was checked,** and whether the service is registered and insured where the person lives. Ask for the proof, not only the answer.

If any of this cannot be arranged, say so to the person and let them choose whether to go ahead.

## 5. Privacy

- **Share the least that works.** Name, address and a phone number for the visit are often enough.
- **Never pass on passwords,** login codes or one-time codes.
- **Health, money and family details** go only with the person's say-so, and only to the person who needs them to do the task.
- **Do not store more than you need,** and do not keep it longer than you need.
- **Ask the service what it keeps,** for how long, and how to have it deleted. Write the answer down.
- **Do not send the person's data to a service that cannot say what it does with it.**

## 6. Confirmation and receipts

"Done" must mean something you can check.

- Ask for the proof named in the request: the photo, the receipt, the message with a time, the signature.
- Compare the proof with the request. Is it the right item, the right size, the right place, within the cap, at the right time?
- If the proof is missing or does not match, say so. Do not fill the gap with a guess.
- Keep the proof with the task record. If a dispute comes up, the record is what you will have.
- Tell the person the result in plain words: what was done, what it cost, and anything that differed from the request.

## 7. When it fails

Things go wrong: a person is late or does not come, an item is wrong, a price is higher than agreed, something is damaged. Work through these steps in order.

1. **Write down what happened,** with times and any photos.
2. **Tell the person,** briefly and early. Do not wait until you have a fix.
3. **Contact the service in writing,** say what went wrong and what the person would like: a refund, a redo or an apology.
4. **Give a short, reasonable time** to answer, and say when you will follow up.
5. **If it is not settled,** ask for a manager or the person responsible and repeat the request in writing.
6. **If the person paid by card,** tell them to contact the card issuer promptly. There are time limits.
7. **If fraud is suspected,** stop paying, keep every message, and tell the person to report it to local authorities and to their payment provider.
8. **If anyone may be in danger,** the emergency number comes first. A service is never a substitute for emergency help.

Do not promise the person an outcome you cannot control. Say what you have done and what happens next.

## 8. When to hand back to the person

Your job is to reduce the person's load, not to take their decisions. Hand the matter back, with a short summary and a clear choice, when:

- A decision involves money above the cap, a key, a home visit by a stranger, or private information.
- Two options differ in a way that depends on the person's values or taste.
- The task touches health, legal or family matters.
- Something has gone wrong and the fix needs a person's voice.
- You are not sure. Ask.

A good handback has three parts: what happened, what the options are, and what you suggest. Keep it under a paragraph.

## 9. Three worked examples

**A prescription pickup.** The person is far away and a parent needs a prescription. Collect the fields: the pharmacy, the name it is under, the time it will be ready, the cap (the copay), what to do if it is not ready (call), the delivery place, and the proof (a photo of the bag and the receipt). Ask the person whether the helper may enter the building or leave it at the front desk. Send. When the photo arrives, check the name on the bag and the amount on the receipt against the cap. Tell the person the result and the cost.

**Waiting for a repair person.** The task is to be at a home between 9 and noon. This involves access, so the person decides: who may enter, whether the parent will be there, and whether a code or a key is shared. Ask for the helper's name and photo and pass them on. Ask for a message when the repair person arrives and when they leave, and for a photo of any paperwork. Agree in advance what the helper may do, for example let the repair person in, but not authorise extra work. If the repair person quotes extra work, the helper calls the contact and does not agree.

**A hospital day.** A companion waits with a relative, listens, takes notes and brings things. The companion is not there to make medical decisions or give medical advice. Agree in advance who the hospital should call, what the companion may sign, if anything, and when the companion updates the family. Ask for short messages at set points rather than a stream. Share the relative's medical details only with the person's say-so, and only what the companion needs.

## Appendix A. Request format

Copy this and fill it in.

| | |
|---|---|
| Task, in one sentence | |
| Needed by, and how firm | |
| From | |
| To, and where to leave it | |
| Spend cap, including fees | |
| If not available | Substitute / Call me / Skip |
| Proof wanted | Photo / Receipt / Message / Signature |
| Contact, and how fast they answer | |
| Private details shared | |

## Appendix B. Approval log

Keep one line per approval.

| | |
|---|---|
| Date and time | |
| Who approved | |
| What was approved | |
| Amount, or limit | |
| What was handed over (key, code, address, details) | |
| When it ends or is returned | |

## Appendix C. Before you send

- [ ] The task can be described in one sentence, and its finish can be checked
- [ ] The request has a date, a place at both ends and a cap that includes fees
- [ ] The request says what to do if it is not available
- [ ] The proof wanted is named in the request
- [ ] The person has approved any access to a home, a key or a code
- [ ] Only the details the task needs are shared
- [ ] The helper's name has been given, and passed to the person
- [ ] Nobody has asked for gift cards, cryptocurrency, a card number, a PIN or a password
- [ ] The person knows who is coming and when

## About Safehubby

Safehubby is a concierge and errands service launching in Puerto Rico. Its assistants run errands, pick things up, accompany a family member during a hospital day, and help arrange rides. This playbook is general information written by Safehubby. It does not recommend any company, including ours, and it is not legal, financial or medical advice.

Questions or corrections are welcome: contact@safehubby.com
