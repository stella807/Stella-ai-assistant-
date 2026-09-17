import { useEffect, useState } from "react";
import type { MasterAuditEntry } from "@safehubby/core";
import { api, type MasterAccountRow, type MasterOverview } from "../api.ts";
import { dollars } from "../money.ts";

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
      <div className="row-between">
        <div>
          <h1>Safehubby</h1>
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
  const [role, setRole] = useState<"owner" | "secretary">("owner");
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
        <select id="mst-role" value={role} onChange={(e) => setRole(e.target.value as "owner" | "secretary")}>
          <option value="owner">Owner — everything, including money and write</option>
          <option value="secretary">Secretary — everything operational, read-only, no money</option>
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

function Dashboard({ overview, onRefresh, onSignedOut }: {
  overview: MasterOverview; onRefresh: () => void; onSignedOut: () => void;
}) {
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
            {overview.account.role === "owner" ? "Owner — everything, including money and write" : "Secretary — everything operational, read-only"}
          </span>
        </div>
        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={onRefresh}>Refresh</button>
      </div>

      {overview.account.role === "owner" && <TeamAccessSection currentAccountId={overview.account.id} />}

      {overview.customers && <CustomersSection customers={overview.customers} />}
      {overview.operations && <OperationsSection operations={overview.operations} />}
      {overview.money && <MoneySection money={overview.money} />}

      {overview.account.role === "owner" && <PricingSection />}

      <section className="card stack">
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
      </section>
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

function CustomersSection({ customers }: { customers: NonNullable<MasterOverview["customers"]> }) {
  return (
    <section className="card stack">
      <h3>Customers</h3>
      <p className="tiny muted" style={{ margin: 0 }}>{customers.length} total</p>
      <div style={{ overflowX: "auto" }}>
        <table className="pay-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Plan</th><th>Wingman</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
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

function OperationsSection({ operations }: { operations: NonNullable<MasterOverview["operations"]> }) {
  const rows: [string, number | string][] = [
    ["Active concierge tasks", operations.activeConciergeTasks],
    ["Open desk tasks", operations.openDeskTasks],
    ["Roster — active / total", `${operations.rosterActive} / ${operations.rosterTotal}`],
    ["Driver applications pending", operations.pendingDriverApplications],
    ["Staff applications pending", operations.pendingStaffApplications],
    ["Wingman Club members", operations.wingmanClubMembers],
  ];
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
    </section>
  );
}

function MoneySection({ money }: { money: NonNullable<MasterOverview["money"]> }) {
  return (
    <section className="card stack">
      <h3>Money</h3>
      <ul className="timeline">
        <li className="row-between">
          <span className="tiny muted">Settled charges</span>
          <span className="small charge-amount">{dollars(money.settledChargesCents)} ({money.chargeCount})</span>
        </li>
        {money.pendingChargeCount > 0 && (
          <li className="row-between">
            <span className="tiny muted">Pending — awaiting a store receipt</span>
            <span className="small">{dollars(money.pendingChargesCents)} ({money.pendingChargeCount})</span>
          </li>
        )}
        <li className="row-between">
          <span className="tiny muted">Owed to assistants, unpaid</span>
          <span className="small charge-amount">{dollars(money.unpaidPayoutsCents)}</span>
        </li>
      </ul>
      {Object.keys(money.byKind).length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <strong className="tiny muted" style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>By kind</strong>
          {Object.entries(money.byKind).map(([kind, cents]) => (
            <div key={kind} className="row-between">
              <span className="tiny muted">{kind}</span>
              <span className="tiny">{dollars(cents)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="tiny muted" style={{ margin: 0 }}>
        The hiring-budget breakdown (headcount, plan vs. actual) lives at its own resolution — see
        GET /api/admin/budget, reachable with this same key.
      </p>
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

  const handleUpdatePrice = async () => {
    if (!newPrice || isNaN(Number(newPrice))) {
      alert("Enter a valid price in cents");
      return;
    }
    try {
      setLoading(true);
      await api.masterSetPrice(selectedRole, Number(newPrice), reason);
      setNewPrice("");
      setReason("");
      await loadPricing();
    } catch (err) {
      console.error("Failed to update price:", err);
      alert("Failed to update price");
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
                    <span className="tiny">${(pricing.current.driverStandard.baseCents / 100).toFixed(2)} base</span>
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
                  type="number"
                  placeholder="Price in cents (e.g., 3500 for $35)"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  style={{ padding: 8, borderRadius: 4 }}
                  disabled={loading}
                />
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
                  disabled={loading || !newPrice}
                >
                  {loading ? "Updating..." : "Update Price"}
                </button>
              </div>

              {pricing.overrides && pricing.overrides.length > 0 && (
                <div className="stack" style={{ gap: 8 }}>
                  <strong className="tiny muted" style={{ textTransform: "uppercase" }}>Recent Changes</strong>
                  <ul className="timeline">
                    {pricing.overrides.slice(0, 10).map((override: any) => (
                      <li key={override.id} className="row-between" style={{ fontSize: "0.8rem" }}>
                        <div className="stack" style={{ gap: 2 }}>
                          <span className="tiny">{override.roleOrService}: ${(override.priceCents / 100).toFixed(2)}</span>
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
