/**
 * Checks a request an agent is about to hand to a human helper, using the rules in the book "Delegating Real-World Tasks".
 * Pure and deterministic: the same request always gives the same answer. It only reads the request; nothing is kept.
 */
export interface RequestCheck {
  readyToSend: boolean;
  /** Fields the request does not have. */
  missing: string[];
  /** Reasons to stop and tell the person before going on. */
  stopSigns: string[];
  /** Things only the person may decide. */
  askPersonFirst: string[];
  warnings: string[];
  fields: Record<string, string>;
  /** The request as plain text a helper can act on. */
  forPerson: string;
}

const MAX_FIELD = 500;
/** The names the books use, and the shorter ones people write. */
const ALIASES: Record<string, string[]> = {
  task: ["task", "what"], needed_by: ["needed_by"], from: ["from", "where_from"], to: ["to", "where_to"],
  spend_cap: ["spend_cap"], if_unavailable: ["if_unavailable"], proof_wanted: ["proof_wanted", "confirm_with"], contact: ["contact"],
};
const REQUIRED = Object.keys(ALIASES);

const STOP: [RegExp, string][] = [
  [/gift ?cards?/i, "Payment by gift card cannot be undone. Use a payment method with a spending limit."],
  [/crypto|bitcoin|ethereum|usdt|usdc|stablecoin/i, "Payment in cryptocurrency to a helper cannot be undone. The person should pay another way."],
  [/zelle|venmo|cash ?app|western union|wire transfer/i, "Payment to a personal account is hard to recover. Use a payment method made for the task."],
  [/card number|credit card|cvv|\bpin\b|passcode|password|bank login|bank account number|routing number|social security|\bssn\b/i, "Do not send card numbers, PINs, passwords or bank details to a helper."],
  [/(do not|don't|dont|never) tell|keep (this|it|that) (a )?(secret|quiet|between us)/i, "A request to keep something from the person is a reason to stop and tell them."],
];
const APPROVAL: [RegExp, string][] = [
  [/door code|alarm code|lock ?box|\bkeys?\b|building access|gate code|enter the home|into (the|her|his|their) (home|house|apartment)/i, "Access to a home (a key, a code, or entry) is the person's decision."],
  [/diagnos|medical record|medical history|insurance (id|number)|illness/i, "A health detail may be shared only with the person's say-so."],
];
/** What is listed as shared with the helper is where a health detail matters; a pharmacy errand names a prescription without sharing one. */
const SHARED_HEALTH = /prescription|medicine|medication|condition|health|allerg/i;

const text = (v: unknown): string | undefined => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : undefined);

export function checkRequest(input: unknown): RequestCheck | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Send a JSON object with the fields task, needed_by, from, to, spend_cap, if_unavailable, proof_wanted and contact." };
  const raw = input as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [name, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const v = text(raw[n]);
      if (v === undefined) continue;
      if (v.length > MAX_FIELD) return { error: `The field ${n} is longer than ${MAX_FIELD} characters. Say it in a sentence or two.` };
      if (v) { fields[name] = v; break; }
    }
  }
  const shared = text(raw.private_details_shared);
  if (shared !== undefined && shared.length > MAX_FIELD) return { error: `The field private_details_shared is longer than ${MAX_FIELD} characters.` };
  if (shared) fields.private_details_shared = shared;

  const missing = REQUIRED.filter((f) => !fields[f]);
  const all = Object.values(fields).join("\n");
  const stopSigns = STOP.filter(([re]) => re.test(all)).map(([, msg]) => msg);
  const askPersonFirst = APPROVAL.filter(([re]) => re.test(all)).map(([, msg]) => msg);
  if (shared && SHARED_HEALTH.test(shared) && !askPersonFirst.some((m) => /health/.test(m))) askPersonFirst.push("A health detail may be shared only with the person's say-so.");
  const warnings: string[] = [];

  const cap = fields.spend_cap;
  if (cap && /unlimited|no (limit|cap|max)|whatever|any ?price|as much as/i.test(cap)) stopSigns.push("The spending cap has no limit. Give the most that may be spent, in dollars, including fees.");
  else if (cap && !/\d/.test(cap)) warnings.push("The spending cap has no number. Give the most that may be spent, in dollars, including fees.");
  const task = fields.task;
  if (task && (task.split(/\s+/).length < 4 || /\b(stuff|things|something|whatever|it)\b/i.test(task) && task.split(/\s+/).length < 8)) warnings.push("The task is vague. Say the item or job, brand, size and quantity.");
  const fallback = fields.if_unavailable;
  if (fallback && !/substitut|call|skip|ask|wait|cancel/i.test(fallback)) warnings.push("if_unavailable should say substitute, call me, or skip.");
  const proof = fields.proof_wanted;
  if (proof && !/photo|picture|receipt|message|signature|video|call|text/i.test(proof)) warnings.push("proof_wanted should name something you can check: a photo, a receipt, a message or a signature.");
  const when = fields.needed_by;
  if (when && !/\d|today|tomorrow|tonight|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(when)) warnings.push("needed_by should give a date or a time, and say whether it is firm.");
  if (shared === undefined) warnings.push('private_details_shared is empty. Say "none" if nothing is shared.');

  const line = (label: string, v: string | undefined) => (v ? `${label}${v}` : "");
  const forPerson = [
    line("Task: ", fields.task), line("Needed by: ", fields.needed_by), line("From: ", fields.from), line("Deliver to: ", fields.to),
    cap ? `Spend no more than ${cap}. If the price will be higher, stop and ask before buying.` : "",
    line("If it is not available: ", fields.if_unavailable), line("Please send: ", fields.proof_wanted), line("Questions go to: ", fields.contact),
  ].filter(Boolean).join("\n");

  return { readyToSend: !missing.length && !stopSigns.length && !askPersonFirst.length, missing, stopSigns, askPersonFirst, warnings, fields, forPerson };
}
