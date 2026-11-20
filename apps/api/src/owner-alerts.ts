/**
 * Telling the owner when a real request comes in: an agent asks for something a person can go and do (a Checked today answer,
 * pharmacies near a place), or pays for anything. Email to OWNER_ALERT_EMAIL (else contact@safehubby.com), and a text to
 * OWNER_ALERT_PHONE when it is set. The same request is told once in six hours, and requests at most twenty times a day, so
 * nobody can flood the owner's phone by asking over and over; a sale is always told.
 */
import { isAutomatic, normalizePhone, type SmsMessage } from "@safehubby/core";
import { email, type OutboundEmail } from "./adapters/email.ts";
import { sms } from "./adapters/sms.ts";
import type { StoreLike } from "./store.ts";

export interface SentAlert { key: string; at: string }
const SAME_REQUEST_MS = 6 * 3_600_000;
const PER_DAY = 20;
const day = (d: Date) => d.toISOString().slice(0, 10);

export function alertDecision(sent: SentAlert[], key: string, now: Date): boolean {
  if (key.startsWith("sale:")) return true;
  if (sent.some((s) => s.key === key && now.getTime() - Date.parse(s.at) < SAME_REQUEST_MS)) return false;
  return sent.filter((s) => !s.key.startsWith("sale:") && day(new Date(s.at)) === day(now)).length < PER_DAY;
}

export type AlertEvent =
  | { kind: "request"; product: string; words: string; answered: boolean }
  | { kind: "sale"; product: string; amount: string; words?: string };

export function alertMessage(e: AlertEvent): { subject: string; body: string; text: string } {
  const words = e.words ? e.words.slice(0, 100) : "";
  if (e.kind === "sale") {
    return {
      subject: `Sale: ${e.product}, ${e.amount}`,
      body: [`An AI agent paid ${e.amount} for ${e.product}.`, ...(words ? [`What it asked: "${words}"`] : []), "", "See the owner portal, Money tab, Sales to AI agents."].join("\n"),
      text: `Safehubby: Sale! ${e.product} ${e.amount}${words ? ` - "${words.slice(0, 60)}"` : ""}`.slice(0, 160),
    };
  }
  const todo = e.answered ? "It was answered from what we have." : "Nothing fresh answers it: a Checked today entry would.";
  return {
    subject: `Agent request: ${e.product}`,
    body: [`An AI agent asked for ${e.product}: "${words}".`, todo, "", "If you can check it, record it in the owner portal, Money tab, Checked today (or Sofía: call to check)."].join("\n"),
    text: `Safehubby request (${e.product}): "${words.slice(0, 70)}". ${e.answered ? "Answered." : "No fresh answer - check it?"}`.slice(0, 160),
  };
}

/** Tell the owner, if the rules above allow it, and remember that it was told. Never throws; a missing mail or text setup sends nothing. */
export function alertOwner(store: StoreLike, now: Date, key: string, e: AlertEvent): void {
  const sent = store.data.ownerAlerts ?? [];
  if (!alertDecision(sent, key, now)) return;
  store.update((db) => { db.ownerAlerts = [...(db.ownerAlerts ?? []), { key, at: now.toISOString() }].slice(-200); });
  const m = alertMessage(e);
  const to = String(process.env.OWNER_ALERT_EMAIL ?? "contact@safehubby.com").trim();
  const mail: OutboundEmail[] = to ? [{ to, subject: m.subject, body: m.body }] : [];
  if (mail.length && isAutomatic(email.status)) void email.send(mail).catch(() => {});
  const phone = normalizePhone(process.env.OWNER_ALERT_PHONE ?? "");
  const texts: SmsMessage[] = phone ? [{ to: phone, body: m.text }] : [];
  if (texts.length) void sms.send(texts).catch(() => {});
}
