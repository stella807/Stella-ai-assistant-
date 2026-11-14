import { emitWarp } from "../app/warp.ts";
import { ScreenCover } from "./ScreenCover.tsx";
import { ClubDeskSection } from "./ClubDesk.tsx";
import { photoToDataUrl } from "../app/profile-photo.ts";
import { useEffect, useState, type ReactNode } from "react";
import { CREDENTIAL_LABEL, type LaunchProgress, type LaunchStepId, type MasterAuditEntry } from "@safehubby/core";
import { downloadBase64 } from "../files.ts";
import { MasterSummary } from "./MasterSummary.tsx";
import { api, type RefundCharges, type ExtraHoursReport, type IncludedHoursUse, type HiringRow, type IncludedHoursRow, type PlanSwitchRow, type MasterAccountRow, type MasterOverview } from "../api.ts";
import { dollars, money as exact } from "../money.ts";
import { TeamActivitySection } from "./TeamActivitySection.tsx";
import { PayoutSheetSection } from "./PayoutSheetSection.tsx";
import { FreebiesSection } from "./FreebiesSection.tsx";
import { ProfitCalculatorSection } from "./ProfitCalculatorSection.tsx";
import { dollarsToCents } from "../app/dollars-input.ts";
import { VendorsSection } from "./VendorsSection.tsx";

/**
 * The master (owner/secretary) dashboard — a third area of the app, reached
 * at `/master`, with its own sign-in and its own session cookie
 * (`sh_master_session`), entirely separate from a Safehubby traveler or
 * assistant account. See master-access.ts for the roles, the scopes, and
 * why message contents are never among them; see `GET /api/master/overview`
 * in routes.ts for what each section actually reads.
 *
 * There is no self-service sign-up here on purpose. An account is
 * provisioned by whoever already holds `SAFEHUBBY_ADMIN_KEY` — the
 * "Provision an account" panel below is that same action, done from a
 * browser instead of a terminal, not a new way in.
 */
export function MasterScreen() {
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [overview, setOverview] = useState<MasterOverview | null>(null);

  const load = () => api.masterOverview().then((o) => { setOverview(o); setStatus("signed-in"); }).catch(() => setStatus("signed-out"));
  useEffect(() => { void load(); }, []);

  if (status === "checking") {
    return <Shell><p className="small muted">Loading…</p></Shell>;
  }
  if (status === "signed-in" && overview) {
    return <Dashboard overview={overview} onRefresh={load} onSignedOut={() => setStatus("signed-out")} />;
  }
  return <MasterSignIn onSignedIn={load} />;
}

function Shell({ children, onSignOut }: { children: React.ReactNode; onSignOut?: () => void }) {
  return (
    <div className="app stack">
      <ScreenCover photo="hero" kicker="Safehubby" title="Management portal" />
      <div className="row-between">
        <div>
          <p className="tiny muted">Master access — not the app customers or assistants use.</p>
        </div>
        {onSignOut && <button className="btn btn-sm btn-ghost" onClick={onSignOut}>Sign out</button>}
      </div>
      {children}
    </div>
  );
}

function MasterSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.masterLogin(key.trim());
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="card stack">
        <h2>Sign in with your access key</h2>
        <p className="small muted">
          Not a username and password — one key, issued to you when your account was provisioned. Lost it?
          Whoever holds the server's admin key can revoke it below and provision a new one.
        </p>
        <div className="field">
          <label htmlFor="mst-key">Access key</label>
          <input id="mst-key" type="password" autoComplete="off" value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        </div>
        <button className="btn btn-primary btn-block" disabled={busy || !key.trim()} onClick={submit}>
          Sign in
        </button>
        {error && <div className="banner banner-danger">{error}</div>}
      </div>

      <div className="card stack">
        <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={showBootstrap} onClick={() => setShowBootstrap((v) => !v)}>
          <h3 style={{ margin: 0 }}>Provision an account</h3>
          <span className="chev">{showBootstrap ? "︿" : "﹀"}</span>
        </button>
        {showBootstrap && <BootstrapPanel />}
      </div>
    </Shell>
  );
}

/**
 * The list of who has master access, with a revoke button per active
 * account — the other half of "lost it? revoke it," which the sign-in
 * screen and the issued-key screen both promise but which needs this
 * component to actually be true. Used two ways: with the admin key (from
 * the sign-in screen, for the case an owner's own key is the one that's
 * lost) and with the signed-in owner's own session (from the dashboard) —
 * `list`/`revoke` are passed in so this component doesn't need to know
 * which.
 */
function AccountsManager({ list, revoke, currentAccountId }: {
  list: () => Promise<MasterAccountRow[]>;
  revoke: (id: string) => Promise<unknown>;
  /** Disables revoking this one account — the one you're signed in as.
   *  Revoking your own only-owner session would lock the dashboard with no
   *  way back in short of the admin key again, so it's refused here rather
   *  than after the fact. */
  currentAccountId?: string;
}) {
  const [accounts, setAccounts] = useState<MasterAccountRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try { setAccounts(await list()); } catch (e) { setError(e instanceof Error ? e.message : "Could not load accounts"); }
  };
  useEffect(() => { void load(); }, []);

  const doRevoke = async (id: string) => {
    setBusyId(id);
    setError(null);
    try { await revoke(id); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Could not revoke that account"); }
    finally { setBusyId(null); }
  };

  if (!accounts) return error ? <div className="banner banner-danger">{error}</div> : <p className="tiny muted">Loading…</p>;

  return (
    <div className="stack" style={{ gap: 8 }}>
      {accounts.map((a) => (
        <div key={a.id} className="row-between">
          <div className="stack" style={{ gap: 2 }}>
            <span className="small">{a.name} <span className="tiny muted">— {a.role}</span></span>
            <span className="tiny muted">{a.email}{!a.active ? " · revoked" : ""}</span>
          </div>
          {a.active && (
            <button className="btn btn-sm btn-ghost" disabled={busyId === a.id || a.id === currentAccountId}
              title={a.id === currentAccountId ? "Sign in as a different owner to revoke this one" : undefined}
              onClick={() => doRevoke(a.id)}>
              {busyId === a.id ? "Revoking…" : "Revoke"}
            </button>
          )}
        </div>
      ))}
      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}

/**
 * The one place `SAFEHUBBY_ADMIN_KEY` itself is typed into this app, rather
 * than a terminal — everything downstream of provisioning uses the master
 * key it hands back, never the admin key again. The returned key is shown
 * exactly once, the same "shown once, hashed thereafter" rule the employee
 * portal's temp password already follows: there is nowhere it can be
 * recovered from after this screen is closed.
 */
function BootstrapPanel() {
  const [adminKey, setAdminKey] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "secretary" | "club-assistant">("owner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; role: string; key: string } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.masterCreateAccount(adminKey.trim(), { name: name.trim(), email: email.trim(), role });
      setIssued({ name: res.account.name, role: res.account.role, key: res.key });
      setName(""); setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not provision that account");
    } finally {
      setBusy(false);
    }
  };

  const [showManage, setShowManage] = useState(false);

  if (issued) {
    return (
      <div className="stack">
        <div className="banner banner-safe">
          Account created for {issued.name} ({issued.role}).
        </div>
        <div className="field">
          <label>Access key — shown once, copy it now</label>
          <input readOnly value={issued.key} onFocus={(e) => e.target.select()} />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          This cannot be shown again. If it's lost, revoke the account from the dashboard and provision a
          new one.
        </p>
        <button className="btn btn-block" onClick={() => setIssued(null)}>Provision another</button>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="small muted">
        Requires the server's admin key (<code>SAFEHUBBY_ADMIN_KEY</code>) — the one shared secret this
        replaces for everything except issuing the very first account.
      </p>
      <div className="field">
        <label htmlFor="mst-admin-key">Server admin key</label>
        <input id="mst-admin-key" type="password" autoComplete="off" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} />
      </div>

      {/* The scenario this exists for: the only owner's key is lost, so
          there is no session to revoke and reissue it from — the admin key
          is the one thing still standing between "locked out" and "back
          in," which is why this lives right next to it rather than only on
          the signed-in dashboard. */}
      <button className="btn btn-sm btn-ghost" type="button" disabled={!adminKey.trim()}
        aria-expanded={showManage} onClick={() => setShowManage((v) => !v)}>
        {showManage ? "Hide existing accounts" : "Manage existing accounts"}
      </button>
      {showManage && adminKey.trim() && (
        <AccountsManager
          list={() => api.masterListAccountsWithAdminKey(adminKey.trim())}
          revoke={(id) => api.masterRevokeAccountWithAdminKey(adminKey.trim(), id)}
        />
      )}

      <div className="field">
        <label htmlFor="mst-name">Name</label>
        <input id="mst-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="mst-email">Email</label>
        <input id="mst-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="mst-role">Role</label>
        <select id="mst-role" value={role} onChange={(e) => setRole(e.target.value as "owner" | "secretary" | "club-assistant")}>
          <option value="owner">Owner — everything, including money and write</option>
          <option value="secretary">Secretary — everything operational, read-only, no money</option>
          <option value="club-assistant">Club assistant — runs the Wingman Club and keeps the owner posted</option>
        </select>
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || !adminKey.trim() || !name.trim() || !email.trim()}
        onClick={submit}>
        {busy ? "Provisioning…" : "Provision account"}
      </button>
      {error && <div className="banner banner-danger">{error}</div>}
    </div>
  );
}

/** A section that opens and closes, so a long tab reads as a list of titles instead of a wall. */
function Fold({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="master-fold" open={open}>
      <summary>{title}</summary>
      <div className="master-fold-body">{children}</div>
    </details>
  );
}

type MasterTab = "overview" | "people" | "money" | "setup";
// Every section the portal has lives under one of these; nothing is dropped, only grouped.
const MASTER_TABS: { id: MasterTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "money", label: "Money" },
  { id: "setup", label: "Setup" },
];

function Dashboard({ overview, onRefresh, onSignedOut }: {
  overview: MasterOverview; onRefresh: () => void; onSignedOut: () => void;
}) {
  const [tab, setTab] = useState<MasterTab>(() => {
    // A refresh should not throw the owner back to the first tab.
    try {
      const saved = sessionStorage.getItem("sh_master_tab");
      return MASTER_TABS.some((t) => t.id === saved) ? (saved as MasterTab) : "overview";
    } catch { return "overview"; }
  });
  const pickTab = (next: MasterTab) => {
    if (next !== tab && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) emitWarp(1);
    setTab(next);
    try { sessionStorage.setItem("sh_master_tab", next); } catch { /* the tab still switches */ }
  };
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState<MasterAuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try { await api.masterLogout(); } catch { /* signing out locally either way */ }
    finally { setBusy(false); onSignedOut(); }
  };

  const toggleAudit = async () => {
    if (!showAudit && !audit) {
      try { setAudit(await api.masterAuditLog()); } catch { setAudit([]); }
    }
    setShowAudit((v) => !v);
  };

  return (
    <Shell onSignOut={signOut}>
      <div className="card row-between">
        <div className="stack" style={{ gap: 2 }}>
          <strong className="small">{overview.account.name}</strong>
          <span className="tiny muted">
            {overview.account.role === "owner" ? "Owner — everything, including money and write"
              : overview.account.role === "club-assistant" ? "Club assistant — the club, and how the business is doing"
              : "Secretary — everything operational, read-only"}
          </span>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onRefresh}>Refresh</button>
      </div>

      <nav className="master-tabs" role="tablist" aria-label="Portal sections">
        {MASTER_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""}
            onClick={() => pickTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === "overview" && <MasterSummary overview={overview} />}

      {tab === "people" && overview.account.role === "owner" && <Fold title="Team access"><TeamAccessSection currentAccountId={overview.account.id} /></Fold>}
      {tab === "people" && overview.scopes.includes("club") && <Fold title="Club desk"><ClubDeskSection /></Fold>}
      {tab === "people" && overview.customers && <Fold title="Customers"><CustomersSection customers={overview.customers} /></Fold>}
      {tab === "people" && overview.partnerInquiries && <Fold title={`Partner inquiries (${overview.partnerInquiries.length})`}><PartnerInquiriesSection inquiries={overview.partnerInquiries} /></Fold>}

      {tab === "overview" && overview.operations && (
        <ApplicationsSection operations={overview.operations} canWrite={overview.scopes.includes("write")} onChanged={onRefresh} />
      )}
      {tab === "people" && overview.operations && <Fold title="Team activity"><TeamActivitySection team={overview.operations.team} canWrite={overview.scopes.includes("write")} /></Fold>}
      {tab === "overview" && overview.operations && (
        <OperationsSection operations={overview.operations} />
      )}

      {tab === "money" && overview.account.role === "owner" && <Fold title="Profit calculator" open><ProfitCalculatorSection /></Fold>}
      {tab === "money" && overview.money && (
        <Fold title="Launch plan">
          <LaunchSection launch={overview.money.launch}
            canWrite={overview.scopes.includes("write")} onChanged={onRefresh} />
        </Fold>
      )}
      {tab === "money" && overview.money && <Fold title="Money"><MoneySection money={overview.money} /></Fold>}
      {tab === "money" && overview.money && <Fold title="Payout sheet"><PayoutSheetSection /></Fold>}
      {tab === "setup" && overview.account.role === "owner" && <Fold title="Free each month"><FreebiesSection /></Fold>}
      {tab === "setup" && overview.account.role === "owner" && <Fold title="Event vendors"><VendorsSection /></Fold>}

      {tab === "setup" && overview.account.role === "owner" && <Fold title="Free and Basic plans" open><PlansOnOfferSection /></Fold>}
      {tab === "money" && overview.account.role === "owner" && <Fold title="Refunds"><RefundsSection /></Fold>}
      {tab === "money" && overview.account.role === "owner" && <Fold title="Extra assistant hours"><ExtraHoursSection /></Fold>}
      {tab === "money" && overview.account.role === "owner" && <Fold title="Included assistant hours"><IncludedHoursSection /></Fold>}
      {tab === "people" && overview.account.role === "owner" && <Fold title="Hiring"><HiringSection /></Fold>}
      {tab === "setup" && overview.account.role === "owner" && <Fold title="Pricing controls"><PricingSection /></Fold>}

      {tab === "setup" && <section className="card stack">
        <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          aria-expanded={showAudit} onClick={toggleAudit}>
          <h3 style={{ margin: 0 }}>Access log</h3>
          <span className="chev">{showAudit ? "︿" : "﹀"}</span>
        </button>
        <p className="tiny muted" style={{ margin: 0 }}>
          Every master-access read, recorded — who looked, at what, and when. Never at what was inside.
        </p>
        {showAudit && (
          <ul className="timeline">
            {(audit ?? []).length === 0 && <li><span className="tiny muted">Nothing recorded yet.</span></li>}
            {(audit ?? []).map((e) => (
              <li key={e.id} className="row-between">
                <span className="tiny muted">{e.subject} · {e.scope}</span>
                <span className="tiny muted">{new Date(e.at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>}
    </Shell>
  );
}

/** Owner-only: who else has master access, and a way to revoke one without
 *  ever needing the admin key again once you're signed in. */
function TeamAccessSection({ currentAccountId }: { currentAccountId: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="card stack">
      <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <h3 style={{ margin: 0 }}>Team access</h3>
        <span className="chev">{expanded ? "︿" : "﹀"}</span>
      </button>
      {expanded && (
        <AccountsManager list={api.masterListAccounts} revoke={api.masterRevokeAccount} currentAccountId={currentAccountId} />
      )}
    </section>
  );
}

/** Companies that asked to partner, from the website form; newest first. Reply goes to their email. */
function PartnerInquiriesSection({ inquiries }: { inquiries: NonNullable<MasterOverview["partnerInquiries"]> }) {
  if (inquiries.length === 0) return <p className="small muted">No partner requests yet. They arrive here and by email.</p>;
  return (
    <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 10 }}>
      {inquiries.map((q) => (
        <li key={q.id} className="card-quiet stack" style={{ padding: 12, gap: 4 }}>
          <div className="row-between"><strong>{q.company}</strong><span className="tiny muted">{new Date(q.receivedAt).toLocaleDateString()}</span></div>
          <span className="small">{q.name} · <a href={`mailto:${q.email}?subject=${encodeURIComponent(`Partnering with Safehubby: ${q.company}`)}`}>{q.email}</a>{q.language === "es" ? " · ES" : ""}</span>
          <p className="small muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{q.about}</p>
        </li>
      ))}
    </ul>
  );
}

function CustomersSection({ customers }: { customers: NonNullable<MasterOverview["customers"]> }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? customers.filter((c) => `${c.name} ${c.email} ${c.planId}`.toLowerCase().includes(q)) : customers;
  return (
    <section className="card stack">
      <h3>Customers</h3>
      <p className="tiny muted" style={{ margin: 0 }}>{q ? `${shown.length} of ${customers.length}` : `${customers.length} total`}</p>
      <input type="search" aria-label="Search customers" placeholder="Search name, email or plan" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div style={{ overflowX: "auto" }}>
        <table className="pay-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Plan</th><th>Wingman</th></tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="tiny muted">{c.email}</td>
                <td>{c.planId}</td>
                <td>{c.clubMember ? "Member" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * One applicant, and the one action that makes sense for where they are.
 *
 * Review is a sequence, not a set of choices: `reviewStaffApplication`
 * refuses a jump from submitted straight to approved, so an approval always
 * means somebody opened the application first. Showing every button at once
 * would offer moves the server rejects, so each state offers only its own.
 *
 * Hidden entirely without the `write` scope. A secretary can see the queue
 * and should — they answer these people — but hiring is the owner's, and the
 * server refuses either way.
 */
function ApplicationRow({ app, canWrite, onChanged }: {
  app: {
    id: string; fullName: string; role: string; city: string; state: string; status: string; hoursPerWeek?: number;
    hasResume?: boolean; kind: "staff" | "driver";
    firearmsLicenseConfirmed?: boolean; guardLicenseConfirmed?: boolean;
    credentials?: { kind: "liability-insurance" | "firearms-license" | "guard-license"; number: string; issuer: string; expiresAt: string }[];
  };
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState("puerto-rico");
  // What a customer sees when choosing this person. All optional, all the
  // owner's to fill in from the interview.
  const [bio, setBio] = useState("");
  const [age, setAge] = useState("");
  const [years, setYears] = useState("");
  const [gender, setGender] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  // Both licenses on file: the reviewer may clear them for armed jobs.
  // (or both ticked on the application, which carry no file to look at).
  const canBeArmed = ["firearms-license", "guard-license"].every((k) => app.credentials?.some((c) => c.kind === k))
    || Boolean(app.firearmsLicenseConfirmed && app.guardLicenseConfirmed);
  const [armed, setArmed] = useState(false);
  // Shown once and never again: the server does not store this readably, so
  // if it scrolls past unread the person needs a fresh provisioning.
  const [issued, setIssued] = useState<{ username: string; tempPassword?: string } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "That didn't go through"); }
    finally { setBusy(false); }
  };

  const review = (status: "under-review" | "approved" | "rejected") => run(async () => {
    await api.masterReviewStaffApplication(app.id, status);
    onChanged();
  });

  // Deliberately does NOT refresh the list. Hiring removes this applicant
  // from the queue, which unmounts this row — and the temporary password
  // lives in its state, shown once and unrecoverable. Refreshing here
  // destroyed the credential the moment it was issued. The refresh happens
  // when the owner dismisses the banner, having read it.
  const hire = () => run(async () => {
    const res = await api.masterHireStaffApplication(app.id, market, {
      ...(bio.trim() ? { bio: bio.trim() } : {}),
      ...(age ? { age: Number(age) } : {}),
      ...(years ? { yearsExperience: Number(years) } : {}),
      ...(gender ? { gender } : {}),
      ...(photo ? { photoUrl: photo } : {}),
      ...(armed ? { armed: true } : {}),
    });
    setIssued(res.credentials);
  });

  return (
    <li className="stack" style={{ gap: 6 }}>
      <div className="row-between">
        <span className="tiny muted">
          {app.fullName} — {app.role}{app.hoursPerWeek ? `, ${app.hoursPerWeek}h/wk` : ""}
          {app.hasResume && (
            // A button, not a label: "attached" with no way to read it was the
            // whole gap. Downloads rather than opens — see downloadBase64.
            <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} disabled={busy}
              onClick={() => run(async () => {
                const file = await api.masterApplicationResume(app.id);
                downloadBase64(file.fileName, file.mimeType, file.base64);
              })}>
              Download résumé
            </button>
          )}
        </span>
        <span className="tiny">{app.city}, {app.state}</span>
      </div>

      {/* Insurance and licences: check each document before hiring. */}
      {(app.credentials?.length ?? 0) > 0 && (
        <ul className="tiny" style={{ margin: 0, paddingLeft: 18 }}>
          {app.credentials!.map((c) => (
            <li key={c.kind}>
              {CREDENTIAL_LABEL[c.kind]}: {c.issuer} · {c.number} · expires {new Date(c.expiresAt).toLocaleDateString()}
              {Date.parse(c.expiresAt) <= Date.now() && <strong style={{ color: "var(--danger)" }}> — expired</strong>}
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} disabled={busy}
                onClick={() => run(async () => {
                  const file = await api.masterApplicationCredential(app.id, c.kind);
                  downloadBase64(file.fileName, file.mimeType, file.base64);
                })}>
                View
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Drivers review through their own pipeline (docs/driving.md), so
          only staff applications get buttons here. */}
      {canWrite && app.kind === "staff" && !issued && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {app.status === "submitted" && (
            <button className="btn btn-sm" disabled={busy} onClick={() => review("under-review")}>
              Start review
            </button>
          )}
          {app.status === "under-review" && (
            <>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => review("approved")}>
                Approve
              </button>
              <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => review("rejected")}>
                Reject
              </button>
            </>
          )}
          {app.status === "approved" && (
            <>
              <select aria-label="Market" value={market} onChange={(e) => setMarket(e.target.value)}>
                <option value="puerto-rico">Puerto Rico</option>
                <option value="texas">Texas</option>
                <option value="los-angeles">Los Angeles</option>
              </select>
              <div className="stack" style={{ gap: 6, width: "100%" }}>
                <span className="tiny muted">What customers see when choosing them (optional)</span>
                <div className="row" style={{ gap: 6 }}>
                  <input aria-label="Years of experience" inputMode="numeric" placeholder="Years" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                  <select aria-label="Gender" value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Gender (for the wording)</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                  <input aria-label="Age" inputMode="numeric" placeholder="Age" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))} />
                </div>
                <input aria-label="A line about them" placeholder="A line about them" maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} />
                <label className="btn btn-sm btn-ghost" style={{ cursor: "pointer" }}>
                  {photo ? "Photo added — change" : "Add their photo"}
                  <input type="file" accept="image/*" hidden onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try { setPhoto(await photoToDataUrl(file)); setError(null); }
                    catch (err) { setError(err instanceof Error ? err.message : "That photo could not be used."); }
                  }} />
                </label>
                {photo && <img src={photo} alt="" width={64} height={64} style={{ borderRadius: 14, objectFit: "cover" }} />}
              </div>
              {canBeArmed && (
                <label className="row tiny" style={{ gap: 6, alignItems: "center", width: "100%" }}>
                  <input type="checkbox" checked={armed} onChange={(e) => setArmed(e.target.checked)} />
                  I checked their firearms and guard licenses (attached, or ticked on the application) — clear them for armed jobs
                </label>
              )}
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={hire}>
                Hire onto the roster
              </button>
            </>
          )}
        </div>
      )}

      {issued && (
        <div className="banner banner-safe">
          <strong className="small">Hired. Give them these now.</strong>
          <div className="tiny" style={{ marginTop: 4 }}>
            Username <strong>{issued.username}</strong>
            {issued.tempPassword && <><br />Temporary password <strong>{issued.tempPassword}</strong></>}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            {issued.tempPassword
              ? "This is the only time it is shown — it is not stored in a readable form. The portal makes them change it on first sign-in."
              : "They already had a portal login, so no new password was issued. Their existing one still works."}
          </div>
          <button className="btn btn-sm btn-block" style={{ marginTop: 8 }} onClick={onChanged}>
            I've written it down
          </button>
        </div>
      )}

      {error && <div className="tiny" style={{ color: "var(--danger, #f88)" }}>{error}</div>}
    </li>
  );
}

/** Every application still waiting on the owner, in a card of its own near the top so it is never hunted for. */
function ApplicationsSection({ operations, canWrite, onChanged }: {
  operations: NonNullable<MasterOverview["operations"]>; canWrite: boolean; onChanged: () => void;
}) {
  const applications = [
    ...operations.applications.staff.map((a) => ({ ...a, kind: "staff" as const })),
    ...operations.applications.drivers.map((a) => ({ ...a, role: "driver", hoursPerWeek: undefined, kind: "driver" as const })),
  ].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  return (
    <section className="card stack">
      <h3 style={{ margin: 0 }}>Job applications ({applications.length})</h3>
      {applications.length === 0
        ? <p className="tiny muted" style={{ margin: 0 }}>Nothing waiting. A new application appears here as soon as someone applies; press Refresh above if you are expecting one.</p>
        : (
          <ul className="timeline">
            {applications.map((a) => (
              <ApplicationRow key={a.id} app={a as never} canWrite={canWrite} onChanged={onChanged} />
            ))}
          </ul>
        )}
    </section>
  );
}

function OperationsSection({ operations }: {
  operations: NonNullable<MasterOverview["operations"]>;
}) {
  const rows: [string, number | string][] = [
    ["Active concierge tasks", operations.activeConciergeTasks],
    ["Open desk tasks", operations.openDeskTasks],
    ["Roster — active / total", `${operations.rosterActive} / ${operations.rosterTotal}`],
    ["Driver applications pending", operations.pendingDriverApplications],
    ["Staff applications pending", operations.pendingStaffApplications],
    ["Wingman Club members", operations.wingmanClubMembers],
  ];
  const roles = Object.keys(operations.recommendedHeadcount);

  return (
    <section className="card stack">
      <h3>Operations</h3>
      <ul className="timeline">
        {rows.map(([label, value]) => (
          <li key={label} className="row-between">
            <span className="tiny muted">{label}</span>
            <span className="small">{value}</span>
          </li>
        ))}
      </ul>

      <div className="stack" style={{ gap: 4 }}>
        <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>
          Hiring — recommended vs. on the roster
        </strong>
        {/* "Recommended" is the pre-launch staffing plan (staffing.ts), the
            same headcount the hiring budget is built against — not a live
            demand model, since there is no traffic yet to model demand
            from. It is the number to hire toward until real usage says
            otherwise. */}
        {roles.map((role) => (
          <div key={role} className="row-between">
            <span className="tiny muted">{role.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())}</span>
            <span className="tiny">
              {operations.hiredByRole[role] ?? 0} hired / {operations.recommendedHeadcount[role]} recommended
            </span>
          </div>
        ))}
      </div>

    </section>
  );
}

/**
 * The route from here to a business that pays for itself, as the dashboard
 * reads it. Most rows are observed — payments, the roster, paying clients — so
 * they have no button and cannot be ticked; the ones the app genuinely
 * cannot see (a broker's quote, an application to Apple, the App Store) are
 * the only ones with a "Mark done". See launch-plan.ts for why that split is
 * enforced on the server too rather than just being a UI habit.
 */
function LaunchSection({ launch, canWrite, onChanged }: {
  launch: LaunchProgress;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<LaunchStepId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = async (id: LaunchStepId, done: boolean) => {
    setBusy(id);
    setError(null);
    try {
      await api.masterMarkLaunchStep(id, done);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    } finally {
      setBusy(null);
    }
  };

  const percent = Math.round((launch.done / launch.total) * 100);

  return (
    <section className="card stack">
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Launch plan</h3>
        <span className="tiny muted">{launch.done} of {launch.total}</span>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        {launch.next
          ? <>Next: <strong>{launch.next.label}</strong></>
          : "Every step done."}
      </p>
      <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>

      <ul className="launch-list">
        {launch.steps.map((step) => {
          const isNext = launch.next?.id === step.id;
          return (
            <li key={step.id}
              className={`launch-step${step.done ? " launch-step-done" : ""}${isNext ? " launch-step-next" : ""}`}>
              <span className="launch-mark" aria-hidden="true">{step.done ? "✓" : ""}</span>
              <div>
                <div className="launch-label">{step.label}</div>
                <p className="launch-detail">{step.detail}</p>
                <p className="launch-detail" style={{ opacity: 0.75 }}>
                  {step.manual
                    ? step.markedAt
                      ? `Marked done ${new Date(step.markedAt).toLocaleDateString()}.`
                      : "Happens outside this app — mark it yourself."
                    : `Read from ${step.derivedFrom}.`}
                </p>
              </div>
              {canWrite && step.manual && (
                <button className="btn btn-sm btn-ghost" disabled={busy === step.id}
                  onClick={() => void mark(step.id, !step.done)}>
                  {step.done ? "Undo" : "Mark done"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="tiny" style={{ margin: 0, color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}

function MoneySection({ money }: { money: NonNullable<MasterOverview["money"]> }) {
  const [held, setHeld] = useState<Awaited<ReturnType<typeof api.masterWithholding>> | null>(null);
  useEffect(() => { api.masterWithholding().then(setHeld).catch(() => {}); }, []);
  return (
    <section className="card stack">
      <h3>Money</h3>
      {held && (
        <div className="card card-quiet stack" style={{ gap: 2 }}>
          <strong className="small">Held back for Hacienda, {held.year}</strong>
          <span className="small">${(held.totalWithheldCents / 100).toFixed(2)}</span>
          {held.workers.map((w) => (
            <span key={w.assistantId} className="tiny muted">
              {w.name}: ${(w.withheldCents / 100).toFixed(2)} held back of ${((w.paidCents + w.withheldCents) / 100).toFixed(2)}
            </span>
          ))}
        </div>
      )}
      <ul className="timeline">
        <li className="row-between">
          <span className="tiny muted">Settled charges</span>
          <span className="small charge-amount">{exact(money.settledChargesCents)} ({money.chargeCount})</span>
        </li>
        {money.pendingChargeCount > 0 && (
          <li className="row-between">
            <span className="tiny muted">Pending — awaiting a store receipt</span>
            <span className="small">{exact(money.pendingChargesCents)} ({money.pendingChargeCount})</span>
          </li>
        )}
        <li className="row-between">
          <span className="tiny muted">Owed to assistants, unpaid</span>
          <span className="small charge-amount">{exact(money.unpaidPayoutsCents)}</span>
        </li>
      </ul>
      {Object.keys(money.byKind).length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>By kind</strong>
          {Object.entries(money.byKind).map(([kind, cents]) => (
            <div key={kind} className="row-between">
              <span className="tiny muted">{kind}</span>
              <span className="tiny">{exact(cents)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 4 }}>
        <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>
          Elite unlock — the spending-allowance cushion
        </strong>
        <p className="tiny muted" style={{ margin: 0 }}>
          {money.eliteUnlock.unlocked
            ? "Unlocked — trailing revenue clears the cushion."
            : `Locked — needs ${money.eliteUnlock.safetyMultiple}× the allowance for ${money.eliteUnlock.targetClientsLow}-${money.eliteUnlock.targetClientsHigh} members per rung before it opens.`}
        </p>
        <div className="progress-track" role="progressbar" aria-valuenow={money.eliteUnlock.percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${money.eliteUnlock.percent}%` }} />
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          {dollars(money.eliteUnlock.trailingRevenueCents)} of {dollars(money.eliteUnlock.thresholdCents)} ({money.eliteUnlock.percent}%), trailing 30 days.
        </p>
      </div>

    </section>
  );
}

/** What a driver is paid per trip: a base fare plus a rate per mile and per minute, set together for each tier. */
function DriverRatesEditor({ pricing, onSaved }: { pricing: any; onSaved: () => Promise<void> }) {
  const tiers = [
    { id: "standard" as const, label: "Standard", current: pricing.current.driverStandard },
    { id: "secure-transport" as const, label: "Secure transport", current: pricing.current.driverSecureTransport },
  ];
  const fmt = (cents: number) => (cents / 100).toFixed(2);
  const [tier, setTier] = useState<"standard" | "secure-transport">("standard");
  const cur = tiers.find((t) => t.id === tier)!.current;
  const [base, setBase] = useState(fmt(cur.baseCents));
  const [mile, setMile] = useState(fmt(cur.perMileCents));
  const [minute, setMinute] = useState(fmt(cur.perMinuteCents));
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pick = (id: "standard" | "secure-transport") => {
    const c = tiers.find((t) => t.id === id)!.current;
    setTier(id); setBase(fmt(c.baseCents)); setMile(fmt(c.perMileCents)); setMinute(fmt(c.perMinuteCents)); setError(null); setNote(null);
  };
  const b = dollarsToCents(base, { allowZero: true }), m = dollarsToCents(mile, { allowZero: true }), n = dollarsToCents(minute, { allowZero: true });
  const valid = b !== null && m !== null && n !== null;
  const example = valid ? Math.round(b + m * 5 + n * 15) : null;
  const save = async () => {
    if (!valid) { setError("Enter each amount in dollars, like 3 or 0.90."); return; }
    setBusy(true); setError(null); setNote(null);
    try {
      await api.masterSetDriverRate(tier, { baseCents: b, perMileCents: m, perMinuteCents: n }, why);
      setNote(`Saved. A 5-mile, 15-minute trip now pays $${fmt(example!)}.`); setWhy("");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save.");
    } finally { setBusy(false); }
  };
  const field = (label: string, value: string, set: (v: string) => void) => (
    <label className="row-between small">{label}
      <input type="text" inputMode="decimal" style={{ width: 110, padding: 8, borderRadius: 4 }} value={value} disabled={busy}
        onChange={(e) => { set(e.target.value); setError(null); setNote(null); }} />
    </label>
  );
  return (
    <div className="stack" style={{ gap: 8, padding: "12px", background: "rgba(0,0,0,0.02)", borderRadius: 4 }}>
      <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Driver pay per trip</strong>
      <p className="tiny muted" style={{ margin: 0 }}>
        A base fare, plus an amount per mile and per minute. This is the pay shown to people applying to drive.
      </p>
      <select value={tier} onChange={(e) => pick(e.target.value as "standard" | "secure-transport")} style={{ padding: 8, borderRadius: 4 }} disabled={busy} aria-label="Driver tier">
        {tiers.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {field("Base fare per trip ($)", base, setBase)}
      {field("Per mile ($)", mile, setMile)}
      {field("Per minute ($)", minute, setMinute)}
      <span className="tiny muted">{example === null ? "Not valid yet." : `A 5-mile, 15-minute trip would pay $${fmt(example)}.`}</span>
      <input type="text" placeholder="Reason for change (optional)" value={why} onChange={(e) => setWhy(e.target.value)} style={{ padding: 8, borderRadius: 4 }} disabled={busy} />
      <button className="btn btn-primary" onClick={() => void save()} disabled={busy || !valid}>{busy ? "Saving..." : "Save driver pay"}</button>
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {note && <div className="banner banner-safe">{note}</div>}
    </div>
  );
}

function JobPayEditor({ pricing, onSaved }: { pricing: any; onSaved: () => Promise<void> }) {
  const jobs: Array<{ id: string; label: string; unit: string; defaultCents: number; cents: number }> = pricing.jobPay ?? [];
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const save = async (j: (typeof jobs)[number]) => {
    const cents = dollarsToCents(drafts[j.id] ?? "");
    if (cents === null) { setError(`Enter ${j.label} pay in dollars, like 25 or 22.50.`); return; }
    setBusy(j.id); setError(null); setNote(null);
    try {
      await api.masterSetPrice(`job-${j.id}`, cents, "Job pay changed");
      setNote(`${j.label} now pays $${(cents / 100).toFixed(2)} ${j.unit}.`);
      setDrafts((d) => { const { [j.id]: _gone, ...rest } = d; return rest; });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save.");
    } finally { setBusy(null); }
  };
  return (
    <div className="stack" style={{ gap: 8, padding: "12px", background: "rgba(0,0,0,0.02)", borderRadius: 4 }}>
      <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Pay for every job on the site</strong>
      <p className="tiny muted" style={{ margin: 0 }}>
        Raise or lower any job. The new pay shows on the job list, in the payroll budget, and is what personal assistants, caretakers and errand runners are paid on new jobs. Customer prices move by the same amount.
      </p>
      {jobs.map((j) => (
        <label key={j.id} className="row-between small" style={{ gap: 8 }}>
          <span>{j.label} <span className="tiny muted">({j.unit}, now ${(j.cents / 100).toFixed(2)})</span></span>
          <span className="row" style={{ gap: 6 }}>
            <input type="text" inputMode="decimal" aria-label={`${j.label} pay`} style={{ width: 90, padding: 8, borderRadius: 4 }}
              placeholder={(j.cents / 100).toFixed(2)} value={drafts[j.id] ?? ""} disabled={busy !== null}
              onChange={(e) => { setDrafts({ ...drafts, [j.id]: e.target.value }); setError(null); setNote(null); }} />
            <button className="btn" onClick={() => void save(j)} disabled={busy !== null || !(drafts[j.id] ?? "").trim()}>{busy === j.id ? "Saving..." : "Save"}</button>
          </span>
        </label>
      ))}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {note && <div className="banner banner-safe">{note}</div>}
    </div>
  );
}

function RefundsSection() {
  const [email, setEmail] = useState("");
  const [data, setData] = useState<RefundCharges | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  const find = async () => {
    setBusy("find"); setError(null); setNote(null);
    try { setData(await api.masterRefundCharges(email.trim())); }
    catch (err) { setData(null); setError(err instanceof Error && err.message ? err.message : "Could not look that up."); }
    finally { setBusy(null); }
  };
  const refund = async (id: string, cents: number) => {
    if (!window.confirm(`Refund ${usd(cents)} to the member's card?`)) return;
    setBusy(id); setError(null); setNote(null);
    try {
      const r = await api.masterRefund(id);
      setNote(`Refunded ${usd(r.refundedCents)}.`);
      setData(await api.masterRefundCharges(email.trim()));
    } catch (err) { setError(err instanceof Error && err.message ? err.message : "Could not refund that."); }
    finally { setBusy(null); }
  };
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>Refund a plan charge</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Elite and the Wingman Club are refunded in full. Premium, Premium Plus and Family get the card fee back, not the plan charge. The refund goes to the member's card through Stripe.
      </p>
      <div className="row" style={{ gap: 6 }}>
        <input type="email" aria-label="Member email" placeholder="member@example.com" value={email} style={{ flex: 1, padding: 8, borderRadius: 4 }}
          onChange={(e) => setEmail(e.target.value)} disabled={busy !== null} />
        <button className="btn" onClick={() => void find()} disabled={busy !== null || !email.trim()}>{busy === "find" ? "Looking..." : "Find"}</button>
      </div>
      {data && (
        <div className="stack" style={{ gap: 4 }}>
          <strong className="small">{data.member.name} <span className="tiny muted">({data.member.email})</span></strong>
          {data.charges.length === 0 && <p className="tiny muted">No plan charges on this account.</p>}
          {data.charges.map((c) => (
            <div key={c.id} className="row-between tiny" style={{ gap: 8 }}>
              <span>{new Date(c.createdAt).toLocaleDateString()} · {c.description} · {usd(c.amountCents)}
                {c.refundedCents > 0 && <span className="muted"> (refunded {usd(c.refundedCents)})</span>}</span>
              {c.refundCents > 0
                ? <button className="btn btn-sm" disabled={busy !== null} onClick={() => void refund(c.id, c.refundCents)}>
                  {busy === c.id ? "Refunding..." : `Refund ${usd(c.refundCents)}${c.tier === "fees" ? " (card fee)" : ""}`}
                </button>
                : <span className="muted">{c.status === "refunded" ? "Refunded" : "No refund under the rules"}</span>}
            </div>
          ))}
        </div>
      )}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {note && <div className="banner banner-safe">{note}</div>}
    </section>
  );
}

/**
 * Each plan's included hours: how many members have, how many they used, and
 * what the used hours cost against the plan's income. Read this before raising
 * the hours a plan includes: a plan only covers its cost while hours go unused.
 */
function IncludedHoursUseTable({ label, rows }: { label: string; rows: IncludedHoursUse[] }) {
  const usd = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toFixed(2)}`;
  const hrs = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} h`;
  return (
    <div className="stack" style={{ gap: 2 }}>
      <strong className="small">{label}</strong>
      {rows.map((r) => (
        <div key={r.id} className="row-between tiny" style={{ gap: 8 }}>
          <span>{r.name} <span className="muted">· {r.members} {r.members === 1 ? "member" : "members"} × {hrs(r.hoursEach)}</span></span>
          <span>
            {hrs(r.hoursUsed)} of {hrs(r.hoursAvailable)} used ({r.usedPercent}%) · cost {usd(r.usedCostCents)} of {usd(r.planIncomeCents)}
            {" · "}<span style={{ color: r.marginCents < 0 ? "var(--danger, #e5484d)" : undefined }}>{r.marginCents < 0 ? "loss" : "left"} {usd(r.marginCents)}</span>
          </span>
        </div>
      ))}
      <span className="tiny muted">Cost is the used hours at the assistant pay rate. Income is the list price, before card fees and annual discounts.</span>
    </div>
  );
}

function ExtraHoursSection() {
  const [data, setData] = useState<ExtraHoursReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => { setError(null); api.masterGetExtraHours().then(setData).catch(() => setError("Could not load extra hours.")); };
  useEffect(load, []);
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
  const hrs = (n: number) => `${n % 1 === 0 ? n : n.toFixed(1)} h`;
  const month = (label: string, m: ExtraHoursReport["thisMonth"]) => (
    <div className="stack" style={{ gap: 2 }}>
      <strong className="small">{label}</strong>
      <span className="tiny">{m.bookings} hourly {m.bookings === 1 ? "booking" : "bookings"}: {hrs(m.includedHours)} included ({hrs(m.includedPlannedHours)} planned, {hrs(m.includedOnDemandHours)} on-demand) and {hrs(m.extraHours)} extra</span>
      <span className="tiny muted">Billed {usd(m.billedCents)} · assistants paid {usd(m.assistantPaidCents)}</span>
    </div>
  );
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Extra assistant hours</h3>
        <button className="btn btn-sm" onClick={load}>Refresh</button>
      </div>
      <p className="tiny muted" style={{ margin: 0 }}>
        Hours beyond what a plan includes are billed at {data ? `${usd(data.ratePerHourCents)} an hour` : "the hourly rate"}. Armed jobs and hospital days have their own rates and are not counted here.
      </p>
      {!data && !error && <p className="tiny muted">Loading...</p>}
      {data && (
        <>
          <IncludedHoursUseTable label="Included hours used this month" rows={data.thisMonth.byPlan} />
          <IncludedHoursUseTable label="Last month" rows={data.lastMonth.byPlan} />
          {month("This month", data.thisMonth)}
          {month("Last month", data.lastMonth)}
          {data.thisMonth.members.length > 0 && (
            <div className="stack" style={{ gap: 2 }}>
              <strong className="small">Who is using the most this month</strong>
              {data.thisMonth.members.map((m) => (
                <div key={m.travelerId} className="row-between tiny">
                  <span>{m.name} <span className="muted">({m.planId})</span></span>
                  <span>{hrs(m.extraHours)} extra · {hrs(m.includedHours)} included · {usd(m.billedCents)}</span>
                </div>
              ))}
            </div>
          )}
          {data.thisMonth.recent.length > 0 && (
            <details>
              <summary className="small">Recent bookings</summary>
              {data.thisMonth.recent.map((r) => (
                <div key={r.id} className="row-between tiny" style={{ gap: 8 }}>
                  <span>{new Date(r.at).toLocaleDateString()} · {r.member}</span>
                  <span>{hrs(r.hours)}{r.extraHours > 0 ? ` (${hrs(r.extraHours)} extra)` : ""}{r.kind ? ` · ${r.kind}` : ""} · {usd(r.billedCents)}</span>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
    </section>
  );
}

function IncludedHoursSection() {
  const [rows, setRows] = useState<IncludedHoursRow[] | null>(null);
  const [max, setMax] = useState(500);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    api.masterGetIncludedHours().then((r) => { setRows(r.plans); setMax(r.maxHours); }).catch(() => setError("Could not load included hours."));
  }, []);
  const usd = (cents: number) => `${cents < 0 ? "-" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
  const save = async (p: IncludedHoursRow) => {
    const text = (drafts[p.id] ?? "").trim();
    const hours = Number(text);
    if (!/^[0-9]{1,3}$/.test(text) || hours > max) { setError(`Enter whole hours from 0 to ${max}.`); return; }
    setBusy(p.id); setError(null); setNote(null);
    try {
      const r = await api.masterSetIncludedHours(p.id, hours);
      setRows(r.plans);
      setDrafts((d) => { const { [p.id]: _gone, ...rest } = d; return rest; });
      setNote(`${p.name} now includes ${hours} assistant ${hours === 1 ? "hour" : "hours"} a month.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save.");
    } finally { setBusy(null); }
  };
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>Included assistant hours</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        How many hours of a personal assistant each plan gives a month. The plan cards, comparison table and booking price follow it.
        "If all used" is the worst month: every hour used, paid to the assistant at the current hourly rate, after the card fee.
      </p>
      {!rows && !error && <p className="tiny muted">Loading...</p>}
      {rows?.map((p) => (
        <div key={p.id} className="stack" style={{ gap: 2 }}>
          <label className="row-between small" style={{ gap: 8 }}>
            <span>{p.name} <span className="tiny muted">(${(p.monthlyCents / 100).toFixed(2)}/mo, now {p.hours} hr)</span></span>
            <span className="row" style={{ gap: 6 }}>
              <input type="text" inputMode="numeric" aria-label={`${p.name} included hours`} style={{ width: 70, padding: 8, borderRadius: 4 }}
                placeholder={String(p.hours)} value={drafts[p.id] ?? ""} disabled={busy !== null}
                onChange={(e) => { setDrafts({ ...drafts, [p.id]: e.target.value }); setError(null); setNote(null); }} />
              <button className="btn" onClick={() => void save(p)} disabled={busy !== null || !(drafts[p.id] ?? "").trim()}>{busy === p.id ? "Saving..." : "Save"}</button>
            </span>
          </label>
          <span className="tiny" style={{ color: p.marginIfAllUsedCents < 0 ? "var(--danger, #c0392b)" : undefined }}>
            If all used: assistant costs {usd(p.fullUseCostCents)}, leaving {usd(p.marginIfAllUsedCents)} on the plan{p.marginIfAllUsedCents < 0 ? " (a loss if a member uses every hour)" : ""}.
          </span>
        </div>
      ))}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {note && <div className="banner banner-safe">{note}</div>}
    </section>
  );
}

function PlansOnOfferSection() {
  const [plans, setPlans] = useState<PlanSwitchRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { api.masterGetPlans().then((r) => setPlans(r.plans)).catch(() => setError("Could not load plans.")); }, []);
  const flip = async (p: PlanSwitchRow) => {
    setBusy(p.id); setError(null); setNote(null);
    try {
      const r = await api.masterSetPlan(p.id, !p.on);
      setPlans(r.plans);
      setNote(`${p.name} is now ${p.on ? "off: hidden everywhere and closed to new members" : "on: shown again with all its details"}.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save.");
    } finally { setBusy(null); }
  };
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>Free and Basic plans</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Switch a plan off and it disappears from the plan picker, the pricing pages and checkout, and nobody new can join it.
        Switch it back on and it returns with all its details. Members already on it keep it, and check-ins and SOS keep working for everyone.
      </p>
      {!plans && !error && <p className="tiny muted">Loading...</p>}
      {plans?.map((p) => (
        <div key={p.id} className="row-between small" style={{ gap: 8 }}>
          <span>{p.name} <span className="tiny muted">({p.members} {p.members === 1 ? "member" : "members"})</span></span>
          <button className={`btn plan-switch ${p.on ? "btn-primary" : ""}`} role="switch" aria-checked={p.on} aria-label={`${p.name} plan`}
            disabled={busy !== null} onClick={() => void flip(p)}>
            {busy === p.id ? "Saving..." : p.on ? "On" : "Off"}
          </button>
        </div>
      ))}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {note && <div className="banner banner-safe">{note}</div>}
    </section>
  );
}

function HiringSection() {
  const [jobs, setJobs] = useState<HiringRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { api.masterGetHiring().then((r) => setJobs(r.jobs)).catch(() => setError("Could not load hiring.")); }, []);
  const set = async (j: HiringRow, target: number) => {
    if (target < 0 || target > 100) return;
    setBusy(j.id); setError(null); setNote(null);
    try {
      const r = await api.masterSetHiring(j.id, target);
      setJobs(r.jobs);
      setNote(`${j.label}: hiring ${target}.`);
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save.");
    } finally { setBusy(null); }
  };
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>How many we're hiring</h3>
      <p className="tiny muted" style={{ margin: 0 }}>
        Set the number of people wanted for each job on the careers page. Every job stays open for applications; the count is how many seats show as open.
      </p>
      {!jobs && !error && <p className="tiny muted">Loading...</p>}
      {jobs?.map((j) => (
        <div key={j.id} className="row-between small" style={{ gap: 8 }}>
          <span>{j.label} <span className="tiny muted">({j.hired} on the team, {j.openings} open)</span></span>
          <span className="row" style={{ gap: 6, alignItems: "center" }}>
            <button className="btn" aria-label={`Hire fewer ${j.label}`} disabled={busy !== null || j.target <= 0} onClick={() => void set(j, j.target - 1)}>−</button>
            <strong aria-label={`${j.label} wanted`} style={{ minWidth: 24, textAlign: "center" }}>{j.target}</strong>
            <button className="btn" aria-label={`Hire more ${j.label}`} disabled={busy !== null || j.target >= 100} onClick={() => void set(j, j.target + 1)}>+</button>
          </span>
        </div>
      ))}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
      {note && <div className="banner banner-safe">{note}</div>}
    </section>
  );
}

function PricingSection() {
  const [expanded, setExpanded] = useState(false);
  const [pricing, setPricing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>("personal-assistant");
  const [newPrice, setNewPrice] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const loadPricing = async () => {
    setLoading(true);
    try {
      const data = await api.masterGetPricing();
      setPricing(data);
    } catch (err) {
      console.error("Failed to load pricing:", err);
    } finally {
      setLoading(false);
    }
  };

  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceNote, setPriceNote] = useState<string | null>(null);
  const newCents = dollarsToCents(newPrice);

  const handleUpdatePrice = async () => {
    setPriceError(null); setPriceNote(null);
    if (newCents === null) {
      setPriceError("Enter the price in dollars, like 35 or 12.50 (up to $100,000).");
      return;
    }
    try {
      setLoading(true);
      await api.masterSetPrice(selectedRole, newCents, reason);
      setNewPrice("");
      setReason("");
      setPriceNote(`Saved: $${(newCents / 100).toFixed(2)}.`);
      await loadPricing();
    } catch (err) {
      // Say what the server said (too many requests, session ended, a bad amount) instead of a bare "failed".
      setPriceError(err instanceof Error && err.message ? `Could not update the price: ${err.message}` : "Could not update the price.");
    } finally {
      setLoading(false);
    }
  };

  const roles = [
    { id: "personal-assistant", label: "Personal Assistant ($/hr)", multiplier: 100 },
    { id: "errand-runner", label: "Errand Runner ($ per task)", multiplier: 1 },
    { id: "secretary", label: "Secretary ($/hr)", multiplier: 100 },
    { id: "social-media-manager", label: "Social Media Manager ($/hr)", multiplier: 100 },
    { id: "owner", label: "Owner Monthly Salary ($)", multiplier: 100 },
  ];

  return (
    <section className="card stack">
      <button className="row-between" style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        aria-expanded={expanded} onClick={() => { setExpanded((v) => !v); if (!expanded && !pricing) loadPricing(); }}>
        <h3 style={{ margin: 0 }}>Pricing Controls</h3>
        <span className="chev">{expanded ? "︿" : "﹀"}</span>
      </button>
      <p className="tiny muted" style={{ margin: 0 }}>Adjust rates for all roles and maintain audit trail of changes</p>

      {expanded && (
        <div className="stack" style={{ gap: 16 }}>
          {!pricing && <p className="tiny muted">{loading ? "Loading..." : "Click a role to update pricing"}</p>}

          {pricing && (
            <>
              <div className="stack" style={{ gap: 8 }}>
                <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Current Rates</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div className="row-between">
                    <span className="tiny">Personal Assistant</span>
                    <span className="tiny">${(pricing.current.paHourlyCents / 100).toFixed(2)}/hr</span>
                  </div>
                  <div className="row-between">
                    <span className="tiny">Errand Runner</span>
                    <span className="tiny">${(pricing.current.errandRunnerTaskCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="row-between">
                    <span className="tiny">Secretary</span>
                    <span className="tiny">${(pricing.current.secretaryHourlyCents / 100).toFixed(2)}/hr</span>
                  </div>
                  <div className="row-between">
                    <span className="tiny">Social Media Manager</span>
                    <span className="tiny">${(pricing.current.socialMediaManagerHourlyCents / 100).toFixed(2)}/hr</span>
                  </div>
                  <div className="row-between">
                    <span className="tiny">Driver (Standard)</span>
                    <span className="tiny">${(pricing.current.driverStandard.baseCents / 100).toFixed(2)} + ${(pricing.current.driverStandard.perMileCents / 100).toFixed(2)}/mi + ${(pricing.current.driverStandard.perMinuteCents / 100).toFixed(2)}/min</span>
                  </div>
                  {pricing.current.ownerMonthlyCents > 0 && (
                    <div className="row-between">
                      <span className="tiny">Owner Monthly</span>
                      <span className="tiny">${(pricing.current.ownerMonthlyCents / 100).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* A planning number, not a payout — there is no owner payout
                  pipeline in this app (payroll.ts pays gig-task assistants,
                  not a salary). This just answers "what have I earned so far
                  this month at the rate I set myself", prorated by day. */}
              {pricing.ownerAccrual && pricing.current.ownerMonthlyCents > 0 && (
                <div className="stack" style={{ gap: 4, padding: "10px 12px", background: "rgba(0,0,0,0.02)", borderRadius: 4 }}>
                  <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Your Accrued Pay This Month</strong>
                  <div className="row-between">
                    <span className="small">${(pricing.ownerAccrual.accruedCents / 100).toFixed(2)} so far</span>
                    <span className="tiny muted">day {pricing.ownerAccrual.dayOfMonth} of {pricing.ownerAccrual.daysInMonth}</span>
                  </div>
                  <p className="tiny muted" style={{ margin: 0 }}>
                    Not a payout — nothing here moves money. Pay yourself the way you always would, from the
                    business's own bank account.
                  </p>
                </div>
              )}

              <div className="stack" style={{ gap: 8, padding: "12px", background: "rgba(0,0,0,0.02)", borderRadius: 4 }}>
                <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Update a Price</strong>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  style={{ padding: 8, borderRadius: 4 }}
                  disabled={loading}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="New price in dollars"
                  placeholder="New price in dollars (e.g., 35 or 12.50)"
                  value={newPrice}
                  onChange={(e) => { setNewPrice(e.target.value); setPriceError(null); setPriceNote(null); }}
                  style={{ padding: 8, borderRadius: 4 }}
                  disabled={loading}
                />
                {newPrice && (
                  <span className="tiny muted">
                    {newCents === null ? "Not a valid amount yet." : `Will be saved as $${(newCents / 100).toFixed(2)}.`}
                  </span>
                )}
                <input
                  type="text"
                  placeholder="Reason for change (optional)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ padding: 8, borderRadius: 4 }}
                  disabled={loading}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleUpdatePrice}
                  disabled={loading || newCents === null}
                >
                  {loading ? "Updating..." : "Update Price"}
                </button>
                {priceError && <div className="banner banner-danger" role="alert">{priceError}</div>}
                {priceNote && <div className="banner banner-safe">{priceNote}</div>}
              </div>

              <DriverRatesEditor key={JSON.stringify([pricing.current.driverStandard, pricing.current.driverSecureTransport])} pricing={pricing} onSaved={loadPricing} />
              <JobPayEditor key={JSON.stringify(pricing.jobPay)} pricing={pricing} onSaved={loadPricing} />

              {pricing.overrides && pricing.overrides.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Recent Changes</strong>
                  <ul className="timeline">
                    {pricing.overrides.slice(0, 10).map((override: any) => (
                      <li key={override.id} className="row-between" style={{ fontSize: "0.8rem" }}>
                        <div className="stack" style={{ gap: 2 }}>
                          <span className="tiny">
                            {override.roleOrService}: {override.perMileCents !== undefined
                              ? `$${(override.baseCents / 100).toFixed(2)} base + $${(override.perMileCents / 100).toFixed(2)}/mi + $${(override.perMinuteCents / 100).toFixed(2)}/min`
                              : `$${(override.priceCents / 100).toFixed(2)}`}
                          </span>
                          {override.reason && <span className="tiny muted">{override.reason}</span>}
                        </div>
                        <span className="tiny muted">{new Date(override.changedAt).toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
