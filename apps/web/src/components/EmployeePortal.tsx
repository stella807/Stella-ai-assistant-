import { IssuingCardView } from "./IssuingCardView.tsx";
import { ScreenCover } from "./ScreenCover.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONCIERGE_CATEGORIES, MAX_SPEND_REQUEST_NOTE, MAX_TASKS_PER_WEEK_ESTIMATE, MAX_VOICE_MESSAGE_SECONDS,
  REFERENCE_MARKET, LAUNCH_MARKETS, describePayAgainstMarket, minutesFor, type LaunchMarketId,
  annualEstimateCentsFor, assistantPayoutFor, canRevealCard, conciergeCategoryLabel, defaultHoursFor,
  hourlyRateCentsFor, isHourlyCategory,
  isQuickTaskEligible, remainingSpendCents, unaccountedSpendCents,
} from "@safehubby/core";
import type { ConciergeTask, VoiceMessage } from "@safehubby/core";
import { api } from "../api.ts";
import { startRecording, type ActiveRecording } from "../native/audio.ts";
import { permissionCopy, settingsPath } from "../native/permissions.ts";
import { isNative, platform } from "../native/platform.ts";
import { readFileAsBase64 } from "../native/camera.ts";
import { TaskCardVisual } from "./TaskCardVisual.tsx";
import { PushArmPanel } from "./PushArmPanel.tsx";
import { TextAlertsCard } from "./TextAlertsCard.tsx";
import { EmailAlertsCard } from "./EmailAlertsCard.tsx";
import { LanguageToggle } from "./LanguageToggle.tsx";
import { useLanguage } from "../i18n.tsx";
import { portalWords } from "../app/portal-copy.ts";
import { localized } from "../app/server-es.ts";
import { dayOf } from "../app/dates.ts";

import { dollars as moneyRound, money } from "../money.ts";

type PortalTask = ConciergeTask & { requesterName: string; role?: "runner" | "assistant"; handedOverBy?: string };

/**
 * The employee portal — a distinct area of the app from the customer-facing
 * side. Reached at `/employee`, with its own sign-in and its own session
 * cookie (`sh_assistant_session`), entirely separate from a Safehubby
 * traveler account. See docs/concierge.md, "The employee portal."
 *
 * Checks for an existing session first (a returning assistant with a valid
 * cookie skips straight to their tasks); otherwise shows the sign-in screen.
 */
export function EmployeePortal() {
  const w = portalWords(useLanguage().language);
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");

  useEffect(() => {
    api.assistantPortal().then(() => setStatus("signed-in")).catch(() => setStatus("signed-out"));
  }, []);

  if (status === "checking") {
    return <Shell><p className="small muted">{w.loading}</p></Shell>;
  }
  if (status === "signed-in") {
    return <PortalHome onSignedOut={() => setStatus("signed-out")} />;
  }
  return <EmployeeSignIn onSignedIn={() => setStatus("signed-in")} />;
}

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  const w = portalWords(useLanguage().language);
  return (
    <div className="app stack">
      <ScreenCover photo="suv" kicker="Safehubby" title={w.title} />
      <div className="row-between">
        <div>
          <p className="tiny muted">{w.notCustomers}</p>
        </div>
        <div className="row" style={{ gap: 6, alignItems: "center" }}>
          {onSignOut && <button className="btn btn-sm btn-ghost" onClick={onSignOut}>{w.signOut}</button>}
          <LanguageToggle />
        </div>
      </div>
      {children}
    </div>
  );
}

function EmployeeSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const w = portalWords(useLanguage().language).signIn;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantLogin(username.trim(), password);
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="card stack">
        <h2>{w.heading}</h2>
        <p className="small muted">{w.body}</p>
        <div className="field">
          <label htmlFor="emp-username">{w.username}</label>
          <input id="emp-username" autoComplete="username" value={username}
            onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="emp-password">{w.password}</label>
          <input id="emp-password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !username.trim() || !password} onClick={submit}>
          {w.submit}
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </div>
    </Shell>
  );
}

function ForcedPasswordChange({ onChanged }: { onChanged: () => void }) {
  const w = portalWords(useLanguage().language).password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantChangePassword(current, next);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h3>{w.heading}</h3>
      <p className="small muted">{w.body}</p>
      <div className="field">
        <label htmlFor="cur-pw">{w.temporary}</label>
        <input id="cur-pw" type="password" autoComplete="current-password" value={current}
          onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="new-pw">{w.next}</label>
        <input id="new-pw" type="password" autoComplete="new-password" value={next}
          onChange={(e) => setNext(e.target.value)} />
        <span className="tiny muted">{w.rule}</span>
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || !current || next.length < 10} onClick={submit}>
        {w.submit}
      </button>
      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}

/**
 * What this category could add up to over a year of steady bookings — a
 * calculator built from the real published per-task fee, not an invented
 * salary figure. Nothing here is a commitment: Safehubby is a booking layer,
 * not an employer, and no customer is required to send any set number of
 * tasks — see concierge.ts's own doc comment on why this module stays that
 * shape.
 */
function PayRates({ onBack }: { onBack: () => void }) {
  const { language } = useLanguage();
  const p = portalWords(language);
  const w = p.rates;
  const [tasksPerWeek, setTasksPerWeek] = useState(3);
  // The rate is the same everywhere, so this does not change the numbers —
  // it says what they are worth where you work. An assistant in San Juan
  // being paid a Los Angeles rate should be able to see that plainly.
  const [market, setMarket] = useState<LaunchMarketId>(REFERENCE_MARKET);

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>{p.allTasks}</button>
      <section className="card stack">
        <h3>{w.heading}</h3>
        <p className="tiny muted">{w.intro}</p>
        {/* Pay is indexed to the market a task happens in (see market-pay.ts),
            so one national column would overstate what most assistants
            actually take home. Pick your market and see your own numbers. */}
        <div className="tabs" role="tablist" aria-label={w.market}>
          {LAUNCH_MARKETS.map((m) => (
            <button key={m.id} role="tab" aria-selected={market === m.id} onClick={() => setMarket(m.id)}>
              {m.label}
            </button>
          ))}
        </div>

        <table className="pay-table">
          <thead>
            <tr><th>{w.task}</th><th>{w.pays}</th><th>{w.rate}</th></tr>
          </thead>
          <tbody>
            {CONCIERGE_CATEGORIES.map((c) => (
              <tr key={c.id}>
                <td>{localized(c.label, language)}</td>
                <td>
                  {isHourlyCategory(c.id) ? (
                    <>
                      {money(assistantPayoutFor(c.id))}
                      <span className="tiny muted">{w.typical(defaultHoursFor(c.id))}</span>
                    </>
                  ) : (
                    <>
                      {money(assistantPayoutFor(c.id))}
                      {isQuickTaskEligible(c.id) && (
                        <span className="tiny muted">{w.quick(assistantPayoutFor(c.id, true))}</span>
                      )}
                    </>
                  )}
                </td>
                <td>{isHourlyCategory(c.id) ? "" : "≈ "}{money(hourlyRateCentsFor(c.id))}{w.perHour}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="tiny muted">
          {localized(describePayAgainstMarket(
            assistantPayoutFor("wait-with-someone"), minutesFor("wait-with-someone"), market,
          ), language)}{" "}
          {w.sameRate}
        </p>
      </section>

      <section className="card stack">
        <h3>{w.repeat}</h3>
        <div className="field">
          <label htmlFor="tasks-per-week">{w.perWeek}</label>
          <input id="tasks-per-week" type="range" min={1} max={MAX_TASKS_PER_WEEK_ESTIMATE} value={tasksPerWeek}
            onChange={(e) => setTasksPerWeek(Number(e.target.value))} />
          <span className="small">{w.weekly(tasksPerWeek)}</span>
        </div>
        <ul className="timeline">
          {CONCIERGE_CATEGORIES.map((c) => (
            <li key={c.id}>
              <div className="row-between">
                <span className="small">{localized(c.label, language)}</span>
                <strong className="charge-amount">≈ {moneyRound(annualEstimateCentsFor(c.id, tasksPerWeek))}{w.perYear}</strong>
              </div>
            </li>
          ))}
        </ul>
        <p className="tiny muted">{w.notPromise}</p>
      </section>
    </div>
  );
}

/**
 * Where a biweekly payout is actually sent, plus the record of every one
 * already paid. The bank account is entered here, by the assistant, never
 * by Safehubby staff — see docs/concierge.md. An outstanding clawback (see
 * `AssistantAdjustment` in payroll.ts) is shown plainly, since it directly
 * reduces the next payout rather than being a silent deduction.
 */
function PayoutSettings({ onBack }: { onBack: () => void }) {
  const { language } = useLanguage();
  const words = portalWords(language);
  const w = words.payouts;
  const [destination, setDestination] = useState<{ accountHolderName: string; accountNumberLast4: string } | null | undefined>(undefined);
  const [payouts, setPayouts] = useState<{
    id: string; periodStart: string; periodEnd: string; totalCents: number; withheldCents?: number;
    status: "pending" | "paid" | "failed"; paidAt?: string; failureReason?: string;
  }[]>([]);
  const [withheldYear, setWithheldYear] = useState(0);
  const [unpaid, setUnpaid] = useState(0);
  const [owed, setOwed] = useState(0);
  const [editing, setEditing] = useState(false);
  const [accountHolderName, setAccountHolderName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.assistantPayoutDestination().then((r) => setDestination(r.destination)).catch(() => setDestination(null));
    api.assistantPayouts().then((r) => {
      setPayouts(r.payouts);
      setUnpaid(r.unpaidEarningsCents);
      setOwed(r.outstandingClawbackCents);
      setWithheldYear(r.withheldThisYearCents);
    }).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.assistantSetPayoutDestination(accountHolderName.trim(), routingNumber.trim(), accountNumber.trim());
      setDestination(res);
      setEditing(false);
      setAccountHolderName(""); setRoutingNumber(""); setAccountNumber("");
    } catch (e) {
      setError(e instanceof Error ? e.message : w.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>{words.allTasks}</button>

      <section className="card stack">
        <h3>{w.heading}</h3>
        <p className="tiny muted">{w.intro}</p>
        <div className="row-between tiny muted">
          <span>{w.unpaid}</span>
          <span className="charge-amount">{money(unpaid)}</span>
        </div>
        {owed > 0 && (
          <div className="row-between tiny muted">
            <span>{w.owed}</span>
            <span className="charge-amount">−{money(owed)}</span>
          </div>
        )}
        {owed > 0 && (
          <p className="tiny muted">{w.owedBody}</p>
        )}

        {!editing && destination && (
          <div className="row-between">
            <span className="small">{w.endingIn(destination.accountHolderName, destination.accountNumberLast4)}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>{w.change}</button>
          </div>
        )}
        {!editing && destination === null && (
          <button className="btn btn-block" onClick={() => setEditing(true)}>{w.add}</button>
        )}
        {editing && (
          <>
            <div className="field">
              <label htmlFor="pd-name">{w.holder}</label>
              <input id="pd-name" value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pd-routing">{w.routing}</label>
              <input id="pd-routing" inputMode="numeric" maxLength={9} value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="field">
              <label htmlFor="pd-account">{w.account}</label>
              <input id="pd-account" inputMode="numeric" value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="row">
              <button className="btn grow" disabled={busy} onClick={() => setEditing(false)}>{words.cancel}</button>
              <button className="btn btn-primary grow"
                disabled={busy || !accountHolderName.trim() || routingNumber.length !== 9 || accountNumber.length < 4}
                onClick={save}>
                {w.save}
              </button>
            </div>
          </>
        )}
        {error && <div className="banner banner-danger">{error}</div>}
      </section>

      <section className="card stack">
        <h3>{w.history}</h3>
        {withheldYear > 0 && <p className="tiny muted">{w.withheldYear(withheldYear)}</p>}
        {payouts.length === 0 && <p className="tiny muted">{w.none}</p>}
        {payouts.length > 0 && (
          <ul className="timeline">
            {payouts.map((p) => (
              <li key={p.id}>
                <div className="row-between">
                  <span className="small">
                    {dayOf(p.periodStart, language)} – {dayOf(p.periodEnd, language)}
                  </span>
                  <strong className="charge-amount">{money(p.totalCents)}</strong>
                </div>
                <span className={`pill${p.status === "paid" ? " pill-safe" : ""}`}>{w.status[p.status] ?? p.status}</span>
                {(p.withheldCents ?? 0) > 0 && (
                  <p className="tiny muted">{w.withheld(p.withheldCents!)}</p>
                )}
                {p.status === "failed" && p.failureReason && <p className="tiny muted">{p.failureReason}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PortalHome({ onSignedOut }: { onSignedOut: () => void }) {
  const { language } = useLanguage();
  const p = portalWords(language);
  const w = p.home;
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tasks, setTasks] = useState<PortalTask[] | null>(null);
  const [aiAssist, setAiAssist] = useState<{ mode: "automatic" | "handoff" | "unavailable"; requires: string }>(
    { mode: "handoff", requires: "" },
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [showPayouts, setShowPayouts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.assistantPortal()
      .then((r) => {
        setAssistantId(r.assistantId); setMustChangePassword(r.mustChangePassword); setTasks(r.tasks);
        setAiAssist(r.aiAssist); setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : w.loadFailed));
  };

  useEffect(load, []);

  const signOut = () => { api.assistantLogout().finally(onSignedOut); };

  if (error) {
    return (
      <Shell onSignOut={signOut}>
        <div className="banner banner-danger">{error}</div>
      </Shell>
    );
  }

  if (!tasks) return <Shell><p className="small muted">{p.loading}</p></Shell>;

  if (mustChangePassword) {
    return <Shell onSignOut={signOut}><ForcedPasswordChange onChanged={() => setMustChangePassword(false)} /></Shell>;
  }

  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const active = tasks.filter((t) => t.status === "in-progress");
  const past = tasks.filter((t) => t.status !== "in-progress");

  return (
    <Shell onSignOut={signOut}>
      {selected ? (
        <TaskDetail task={selected} onBack={() => setSelectedId(null)} onChanged={load} aiAssist={aiAssist} />
      ) : showPay ? (
        <PayRates onBack={() => setShowPay(false)} />
      ) : showPayouts ? (
        <PayoutSettings onBack={() => setShowPayouts(false)} />
      ) : (
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setShowPay(true)}>{w.seeRates}</button>
            <button className="btn btn-sm" onClick={() => setShowPayouts(true)}>{w.getPaid}</button>
          </div>

          <PushArmPanel
            statusApi={api.assistantPushStatus}
            registerApi={api.assistantRegisterPushDevice}
            title={w.pushTitle}
            armedCopy={w.pushArmed}
          />

          <TextAlertsCard scope="assistant" language={language} />
          <EmailAlertsCard scope="assistant" language={language} />

          {active.length === 0 && past.length === 0 && (
            <p className="small muted">{w.nothing}</p>
          )}

          {active.length > 0 && (
            <section className="stack">
              <span className="section-label">{w.active}</span>
              {active.map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelectedId(t.id)} />)}
            </section>
          )}

          {past.length > 0 && (
            <section className="stack">
              <span className="section-label">{w.past}</span>
              {past.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} onOpen={() => setSelectedId(t.id)} />)}
            </section>
          )}
        </div>
      )}

      {assistantId && <p className="tiny muted">{w.signedInAs(assistantId)}</p>}
    </Shell>
  );
}

function TaskRow({ task, onOpen }: { task: PortalTask; onOpen: () => void }) {
  const { language } = useLanguage();
  const p = portalWords(language);
  const w = p.row;
  return (
    <button className="card card-quiet" style={{ boxShadow: "inset 0 0 0 1px var(--line)" }} onClick={onOpen}>
      <div className="row-between">
        <div>
          <strong className="small">
            {localized(conciergeCategoryLabel(task.category), language)}
            {task.priority && <span className="pill pill-safe" style={{ marginLeft: 6 }}>{w.priority}</span>}
          </strong>
          <div className="tiny muted">
            {w.for(task.requesterName)} · {task.note.slice(0, 60)}
            {task.role === "runner" && task.handedOverBy ? w.sentBy(task.handedOverBy) : ""}
            {task.runnerName ? w.with(task.runnerName) : ""}
          </div>
        </div>
        <span className={`pill${task.status === "in-progress" ? " pill-safe" : ""}`}>{p.status[task.status] ?? task.status}</span>
      </div>
    </button>
  );
}

/**
 * The task's spend-capped card, so the assistant can actually pay for what
 * was asked for.
 *
 * Shown masked here; the full number lives behind a one-time, provider-hosted
 * link fetched on demand (`assistantRevealCard`), so the card number never
 * passes through Safehubby's own servers or this bundle. The link is only
 * issued while the task is in progress — once it's marked done the card is
 * cancelled, which is the whole point of a single-use card.
 *
 * Apple Pay is offered as **manual** Wallet entry rather than a one-tap
 * "Add to Apple Pay" button, and that is a constraint rather than a
 * shortcut. One-tap provisioning is `PKAddPaymentPassViewController`, a
 * native iOS API that (a) cannot be called from a webview at all, and (b)
 * requires Apple's `com.apple.developer.payment-pass-provisioning`
 * entitlement, which Apple grants by application to card issuers and their
 * partners — it is not something this codebase can switch on. Typing the
 * card into Wallet needs none of that and gets the assistant to the same
 * place: tapping a phone at the till instead of reading a virtual card
 * number off a screen in a checkout queue. See docs/mobile.md for what the
 * one-tap path would actually take.
 */
function TaskCardPopup({ task, onClose, onChanged }: {
  task: PortalTask; onClose: () => void; onChanged: () => void;
}) {
  const w = portalWords(useLanguage().language).card;
  const [busy, setBusy] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // An Apple device, whether that's the native shell or Safari on an iPhone —
  // either way Wallet is present. Checked rather than assumed, so an Android
  // assistant is pointed at Google Wallet instead of instructions they can't
  // follow.
  const onApple = isNative()
    ? platform() === "ios"
    : /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent);
  // The card only unlocks once a purchase is on the record with a photo.
  const unlocked = canRevealCard(task);
  const remaining = remainingSpendCents(task);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ base64: string; mimeType: string } | null>(null);
  const purchaseInput = useRef<HTMLInputElement>(null);

  const capturePurchase = async (file?: File) => {
    if (!file) return;
    setError(null);
    try {
      setPhoto(await readFileAsBase64(file));
    } catch {
      setError(w.photoFailed);
    }
  };

  const submitRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!photo) throw new Error(w.photoFirst);
      await api.assistantSubmitSpendRequest(task.id, {
        amountCents: Math.round(Number(amount) * 100), note, photo,
      });
      setAmount("");
      setNote("");
      setPhoto(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.sendFailed);
    } finally {
      setBusy(false);
    }
  };

  const [showCard, setShowCard] = useState(false);
  const getKey = useCallback((nonce?: string) => api.assistantCardKey(task.id, nonce), [task.id]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={w.heading}>
      <div className="modal-sheet card stack">
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{w.heading}</h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose} aria-label={w.close}>✕</button>
        </div>

        <TaskCardVisual
          card={task.card}
          capCents={task.spendCapCents}
          caption={w.caption}
          holderLabel={w.holder}
          holderValue={task.requesterName}
          footnote={w.footnote}
        />

        {/* The other number on this screen, and the one that is actually
            yours. Two amounts sit side by side here — the client's money and
            your pay — and the whole rule of the card is that they never mix,
            so the screen says both rather than leaving the second one to be
            looked up somewhere else. */}
        <div className="row-between small pay-callout">
          <strong>{w.youEarn}</strong>
          <strong className="charge-amount">{money(task.assistantPayoutCents)}</strong>
        </div>
        <p className="tiny muted">{w.yours}</p>

        {unlocked ? (
          <>
            {showCard
              ? <IssuingCardView getKey={getKey} />
              : <button className="btn btn-primary btn-block" onClick={() => setShowCard(true)}>{w.showNumber}</button>}
          </>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            <p className="small">{w.unlock(task.requesterName)}</p>

            {photo ? (
              <img className="selfie-thumb" alt={w.photoAlt}
                src={`data:${photo.mimeType};base64,${photo.base64}`} />
            ) : (
              <button className="btn btn-block" disabled={busy} onClick={() => purchaseInput.current?.click()}>
                {w.takePhoto}
              </button>
            )}
            <input ref={purchaseInput} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => capturePurchase(e.target.files?.[0])} />

            <div className="field">
              <label htmlFor="spend-amount">{w.cost}</label>
              <input id="spend-amount" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
              <span className="tiny muted">{w.left(remaining)}</span>
            </div>

            <div className="field">
              <label htmlFor="spend-note">{w.what}</label>
              <input id="spend-note" maxLength={MAX_SPEND_REQUEST_NOTE} value={note}
                placeholder={w.whatPlaceholder}
                onChange={(e) => setNote(e.target.value)} />
            </div>

            <button className="btn btn-primary btn-block"
              disabled={busy || !photo || !note.trim() || !amount}
              onClick={submitRequest}>
              {w.send}
            </button>
            <p className="tiny muted">{w.voiceToo}</p>
          </div>
        )}

        <div className="stack" style={{ gap: 6 }}>
          <button className="btn btn-block btn-ghost" aria-expanded={showWallet}
            onClick={() => setShowWallet(!showWallet)}>
            {showWallet ? "− " : "+ "}{w.applePay}
          </button>

          {showWallet && (
            <>
              {onApple ? (
                <>
                  <p className="tiny muted">{w.easier}</p>
                  <ol className="timeline">
                    {w.steps(`${String(task.card?.expMonth ?? 0).padStart(2, "0")}/${task.card?.expYear}`).map((step) => (
                      <li key={step}><span className="tiny muted">{step}</span></li>
                    ))}
                  </ol>
                  <p className="tiny muted">{w.stops(task.spendCapCents)}</p>
                </>
              ) : (
                <p className="tiny muted">{w.notApple}</p>
              )}
              <p className="tiny muted">{w.noOneTap}</p>
            </>
          )}
        </div>

        {error && <div className="banner banner-danger">{error}</div>}
      </div>
    </div>
  );
}

/** An assistant hands the legwork to a runner; the client never sees this. */
function RunnerPanel({ task, onChanged }: { task: PortalTask; onChanged: () => void }) {
  const w = portalWords(useLanguage().language).runner;
  const [runners, setRunners] = useState<{ id: string; name: string; busy: number; capacity: number; available: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.assistantRunners().then((r) => setRunners(r.runners)).catch(() => setRunners([]));
  }, [task.id, task.runnerId]);
  const assign = async (runnerId: string | null) => {
    setError(null);
    try { await api.assistantDelegate(task.id, runnerId); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : w.failed); }
  };
  if (task.role === "runner" || !runners) return null;
  if (task.runnerId) {
    return (
      <section className="card card-quiet stack">
        <strong className="small">{w.with(task.runnerName)}</strong>
        <button className="btn btn-sm btn-ghost" onClick={() => assign(null)}>{w.takeBack}</button>
        {error && <p className="tiny" role="alert">{error}</p>}
      </section>
    );
  }
  if (runners.length === 0) return null;
  return (
    <section className="card card-quiet stack">
      <strong className="small">{w.send}</strong>
      {runners.map((r) => (
        <div key={r.id} className="row-between">
          <span className="small">{r.name} <span className="tiny muted">{r.busy}/{r.capacity}</span></span>
          <button className="btn btn-sm" disabled={!r.available} onClick={() => assign(r.id)}>{w.assign}</button>
        </div>
      ))}
      {error && <p className="tiny" role="alert">{error}</p>}
    </section>
  );
}

function TaskDetail({ task, onBack, onChanged, aiAssist }: {
  task: PortalTask; onBack: () => void; onChanged: () => void;
  aiAssist: { mode: "automatic" | "handoff" | "unavailable"; requires: string };
}) {
  const { language } = useLanguage();
  const p = portalWords(language);
  const w = p.task;
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [billed, setBilled] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRecording = useRef<ActiveRecording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selfieInput = useRef<HTMLInputElement>(null);
  const completionInput = useRef<HTMLInputElement>(null);

  const loadMessages = () => api.assistantVoiceMessages(task.id).then((r) => setMessages(r.messages)).catch(() => {});
  useEffect(() => { loadMessages(); }, [task.id]);
  useEffect(() => () => {
    activeRecording.current?.cancel();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const record = async () => {
    if (activeRecording.current) {
      const rec = activeRecording.current;
      activeRecording.current = null;
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setBusy(true);
      try {
        const clip = await rec.stop();
        await api.assistantSendVoiceMessage(task.id, clip);
        loadMessages();
      } catch (e) {
        setError(e instanceof Error ? e.message : w.sendFailed);
      } finally {
        setBusy(false);
      }
      return;
    }
    setError(null);
    const started = await startRecording(MAX_VOICE_MESSAGE_SECONDS);
    if (started === "denied") {
      // Not a bare "denied": on iOS the prompt does not come back, so the
      // only useful thing to say is where the switch is.
      setError(`${permissionCopy("microphone").recovery} ${settingsPath("microphone")}`);
      return;
    }
    if (started === "unavailable") { setError(w.noVoice); return; }
    activeRecording.current = started;
    setIsRecording(true);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const captureSelfie = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await readFileAsBase64(file);
      await api.assistantSendSelfie(task.id, photo);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.photoFailed);
    } finally {
      setBusy(false);
      if (selfieInput.current) selfieInput.current.value = "";
    }
  };

  const captureCompletionPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const photo = await readFileAsBase64(file);
      await api.assistantSendCompletionPhoto(task.id, photo);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.photoFailed);
    } finally {
      setBusy(false);
      if (completionInput.current) completionInput.current.value = "";
    }
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      const cents = billed.trim() ? Math.round(Number(billed) * 100) : undefined;
      await api.assistantComplete(task.id, cents);
      onChanged();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.doneFailed);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantDecline(task.id);
      onChanged();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.declineFailed);
    } finally {
      setBusy(false);
    }
  };

  const [showCard, setShowCard] = useState(false);
  // Which purchase a receipt or change note is being filed against. The file
  // input is shared across rows, so the target id has to be held separately.
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [changeFor, setChangeFor] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState("");
  const receiptInput = useRef<HTMLInputElement>(null);
  const ended = task.status !== "in-progress";
  const unaccounted = unaccountedSpendCents(task);

  const captureReceipt = async (file?: File) => {
    if (!file || !receiptFor) return;
    setBusy(true);
    setError(null);
    try {
      await api.assistantSendReceipt(task.id, receiptFor, await readFileAsBase64(file));
      setReceiptFor(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.receiptFailed);
    } finally {
      setBusy(false);
    }
  };

  /**
   * A faster first draft of the note itself, not a message the customer
   * ever sees on its own. It expands whatever's already typed — the rough
   * words the assistant knows are true — into the two or three sentences
   * they'd otherwise have to write by hand, and lands back in the same
   * field for them to edit or send as-is.
   */
  const draftChangeNote = async () => {
    setDrafting(true);
    setError(null);
    try {
      const { text } = await api.assistantAiDraft(task.id, {
        purpose: "explaining a change to a purchase to the customer", instruction: changeNote,
      });
      setChangeNote(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : w.draftFailed);
    } finally {
      setDrafting(false);
    }
  };

  const reportChange = async (requestId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.assistantReportChange(task.id, requestId, { note: changeNote });
      setChangeFor(null);
      setChangeNote("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : w.reportFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <button className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={onBack}>{p.allTasks}</button>

      {showCard && task.card && (
        <TaskCardPopup task={task} onClose={() => setShowCard(false)} onChanged={onChanged} />
      )}

      {task.status === "in-progress" && <RunnerPanel task={task} onChanged={onChanged} />}

      <section className="card stack">
        <div className="row-between">
          <h3>{localized(conciergeCategoryLabel(task.category), language)}</h3>
          <span className={`pill${!ended ? " pill-safe" : ""}`}>{p.status[task.status] ?? task.status}</span>
        </div>
        <p className="small">{task.note}</p>
        {task.onBehalfOf ? (
          // The destination is the words, not a pin: the coordinates are only the
          // middle of the area.
          <div className="card card-quiet stack" style={{ gap: 2 }}>
            <span className="tiny muted">{w.deliverTo}</span>
            <strong className="small">{task.onBehalfOf.recipientName}</strong>
            <span className="small">{task.onBehalfOf.place}{task.onBehalfOf.room ? w.room(task.onBehalfOf.room) : ""}</span>
            {task.onBehalfOf.phone && <span className="tiny muted">{w.phone(task.onBehalfOf.phone)}</span>}
            <span className="tiny muted">{w.nurse}</span>
          </div>
        ) : (
          task.location.label && <p className="tiny muted">{w.near(task.location.label)}</p>
        )}

        <div className="row-between tiny muted">
          <span>
            {w.paid}
            {task.peopleCount > 1 && w.covers(task.peopleCount)}
          </span>
          <span className="charge-amount">{money(task.assistantPayoutCents)}</span>
        </div>
        <div className="row-between tiny muted">
          <span>{w.cap}</span>
          <span className="charge-amount">{money(task.spendCapCents)}</span>
        </div>

        {!ended && task.card && (
          <button className="btn btn-block" onClick={() => setShowCard(true)}>
            {w.payWithCard(task.card.network, task.card.last4)}
          </button>
        )}
        {!ended && !task.card && (
          <p className="tiny muted">{w.noCard}</p>
        )}

        <div className="row-between">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            {task.identityPhotos?.traveler ? (
              <img className="selfie-thumb" alt={task.requesterName}
                src={`data:${task.identityPhotos.traveler.mimeType};base64,${task.identityPhotos.traveler.base64}`} />
            ) : (
              <span className="tiny muted">{w.noSelfie(task.requesterName)}</span>
            )}
          </div>
          {!ended && (
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {task.identityPhotos?.assistant ? (
                <img className="selfie-thumb" alt={w.you} src={`data:${task.identityPhotos.assistant.mimeType};base64,${task.identityPhotos.assistant.base64}`} />
              ) : (
                <button className="btn btn-sm" disabled={busy} onClick={() => selfieInput.current?.click()}>
                  {w.selfie}
                </button>
              )}
              <input ref={selfieInput} type="file" accept="image/*" capture="user" hidden
                onChange={(e) => captureSelfie(e.target.files?.[0])} />
            </div>
          )}
        </div>
        <p className="tiny muted">{w.selfieShown(task.requesterName)}</p>
      </section>

      <section className="card stack">
        <h3>{w.messages}</h3>
        <div className="voice-thread" aria-live="polite">
          {messages.length === 0 && <p className="tiny muted">{w.noMessages}</p>}
          {messages.map((m) => (
            <div key={m.id} className={`voice-bubble${m.sender === "assistant" ? " voice-bubble-mine" : ""}`}>
              <div className="tiny muted">{m.sender === "assistant" ? w.you : task.requesterName} · {m.durationSeconds}s</div>
              <audio controls src={`data:${m.mimeType};base64,${m.audioBase64}`} />
            </div>
          ))}
        </div>
        {!ended && (
          <>
            <button className={`record-button${isRecording ? " recording" : ""}`} disabled={busy && !isRecording} onClick={record}
              aria-label={isRecording ? w.stopSend : w.record}>
              {isRecording ? `${elapsed}s` : "●"}
            </button>
            <p className="tiny muted" style={{ textAlign: "center" }}>
              {isRecording ? w.recording : w.tapRecord(MAX_VOICE_MESSAGE_SECONDS)}
            </p>
          </>
        )}
      </section>

      {(task.spendRequests ?? []).filter((r) => r.status !== "declined").length > 0 && (
        <section className="card stack">
          <h3>{w.receipts}</h3>
          <p className="tiny muted">{w.receiptsBody}</p>
          {(task.spendRequests ?? []).filter((r) => r.status !== "declined").map((r) => (
            <div key={r.id} className="card card-quiet stack" style={{ gap: 6 }}>
              <div className="row-between">
                <span className="small">{r.note}</span>
                <strong className="charge-amount">{money(r.amountCents)}</strong>
              </div>

              {r.receipt && <span className="tiny muted">{w.receiptSent}</span>}
              {r.change && <span className="tiny muted">{w.reported(r.change.note)}</span>}

              {!ended && !r.receipt && (
                <>
                  <button className="btn btn-sm btn-block" disabled={busy}
                    onClick={() => { setReceiptFor(r.id); receiptInput.current?.click(); }}>
                    {w.addReceipt}
                  </button>
                  {!r.change && (
                    changeFor === r.id ? (
                      <div className="stack" style={{ gap: 6 }}>
                        <input value={changeNote} placeholder={w.changePlaceholder}
                          maxLength={280} onChange={(e) => setChangeNote(e.target.value)} />
                        {aiAssist.mode === "automatic" && (
                          <button className="btn btn-sm btn-ghost" disabled={busy || drafting || !changeNote.trim()}
                            onClick={draftChangeNote}>
                            {drafting ? w.drafting : w.draft}
                          </button>
                        )}
                        <div className="row">
                          <button className="btn btn-sm grow" disabled={busy}
                            onClick={() => { setChangeFor(null); setChangeNote(""); }}>
                            {p.cancel}
                          </button>
                          <button className="btn btn-sm btn-primary grow"
                            disabled={busy || !changeNote.trim()} onClick={() => reportChange(r.id)}>
                            {w.tell}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-ghost btn-block" disabled={busy}
                        onClick={() => setChangeFor(r.id)}>
                        {w.changed}
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          ))}
          <input ref={receiptInput} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => captureReceipt(e.target.files?.[0])} />
        </section>
      )}

      {!ended && (
        <section className="card stack">
          <h3>{w.wrapUp}</h3>
          <div className="field">
            <label htmlFor="billed">{w.spent}</label>
            <input id="billed" type="number" inputMode="decimal" placeholder={(task.spendCapCents / 100).toFixed(2)}
              value={billed} onChange={(e) => setBilled(e.target.value)} />
          </div>
          <div className="row-between" style={{ alignItems: "center" }}>
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              {task.completionPhoto ? (
                <img className="selfie-thumb" alt={w.deliveredAlt}
                  src={`data:${task.completionPhoto.mimeType};base64,${task.completionPhoto.base64}`} />
              ) : (
                <span className="tiny muted">{w.noProof}</span>
              )}
              <button className="btn btn-sm" disabled={busy} onClick={() => completionInput.current?.click()}>
                {task.completionPhoto ? w.retake : w.addPhoto}
              </button>
              <input ref={completionInput} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => captureCompletionPhoto(e.target.files?.[0])} />
            </div>
          </div>
          <p className="tiny muted">{w.proof(task.requesterName)}</p>
          {unaccounted > 0 && (
            <div className="banner banner-danger">
              <strong>{w.unaccounted(unaccounted)}</strong>{w.unaccountedBody}
            </div>
          )}
          <button className="btn btn-primary btn-block" disabled={busy} onClick={complete}>{w.done}</button>
          <button className="btn btn-ghost btn-block" disabled={busy} onClick={decline}>
            {w.decline}
          </button>
        </section>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}
