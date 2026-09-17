import { describe, expect, it } from "vitest";
import {
  DRIVER_INSURANCE_SURCHARGE_CENTS_PER_MONTH, GAS_STIPEND_CENTS_PER_WEEK, GAS_STIPEND_WEEKS,
  LIABILITY_INSURANCE_CENTS_PER_MONTH, PRELAUNCH_HEADCOUNT, PRELAUNCH_MONTHS, PRELAUNCH_WEEKS,
  STAFF_ROLES, findRole, gasStipendCentsPerDriver, insuranceCentsPerMonth, monthlyInsuranceCents,
  monthlyPayrollCents, monthlyRosterCents, prelaunchBudget,
} from "../src/staffing.ts";
import { LAUNCH_WINDOW_START, SERVICE_LIVE_AT } from "../src/promotions.ts";

describe("the roles being hired", () => {
  it("covers the seven roles the launch is staffing", () => {
    expect(STAFF_ROLES.map((r) => r.id).sort()).toEqual(
      ["driver", "errand-runner", "lawyer", "personal-assistant", "secretary", "social-media-manager", "web-developer"],
    );
  });

  it("marks exactly the driving role as driving, since that is what costs more to insure", () => {
    expect(STAFF_ROLES.filter((r) => r.drives).map((r) => r.id)).toEqual(["driver"]);
  });

  it("gives every role a real description, because these are job posts", () => {
    for (const role of STAFF_ROLES) {
      expect(role.label.length).toBeGreaterThan(2);
      expect(role.description.length).toBeGreaterThan(30);
    }
  });

  it("refuses an unknown role rather than costing it at zero", () => {
    expect(() => findRole("bouncer" as never)).toThrow(/unknown staff role/i);
  });
});

describe("insurance, which everyone hired gets", () => {
  it("covers every role — nobody is on the roster uninsured", () => {
    for (const role of STAFF_ROLES) {
      expect(insuranceCentsPerMonth(role.id)).toBeGreaterThan(0);
    }
  });

  it("costs more for a driver, because commercial auto is the expensive part", () => {
    expect(insuranceCentsPerMonth("driver")).toBe(
      LIABILITY_INSURANCE_CENTS_PER_MONTH + DRIVER_INSURANCE_SURCHARGE_CENTS_PER_MONTH,
    );
    expect(insuranceCentsPerMonth("driver")).toBeGreaterThan(insuranceCentsPerMonth("secretary"));
  });

  it("charges the same base for every non-driving role", () => {
    for (const role of STAFF_ROLES.filter((r) => !r.drives)) {
      expect(insuranceCentsPerMonth(role.id)).toBe(LIABILITY_INSURANCE_CENTS_PER_MONTH);
    }
  });
});

describe("the drivers' gas stipend", () => {
  it("runs for the pre-launch window, derived from the launch dates", () => {
    const weeks = (Date.parse(SERVICE_LIVE_AT) - Date.parse(LAUNCH_WINDOW_START)) / (7 * 86_400_000);
    expect(GAS_STIPEND_WEEKS).toBe(Math.round(weeks));
    // Two months, so roughly eight or nine weeks — not one, and not a year.
    expect(GAS_STIPEND_WEEKS).toBeGreaterThanOrEqual(8);
    expect(GAS_STIPEND_WEEKS).toBeLessThanOrEqual(9);
  });

  it("pays $10 a week, so it is $80-odd per driver rather than a token $10", () => {
    expect(GAS_STIPEND_CENTS_PER_WEEK).toBe(1000);
    expect(gasStipendCentsPerDriver()).toBe(1000 * GAS_STIPEND_WEEKS);
    expect(gasStipendCentsPerDriver()).toBeGreaterThanOrEqual(8000);
  });
});

describe("the pre-launch budget", () => {
  const budget = prelaunchBudget();

  it("is two months long, taken from the launch window rather than typed twice", () => {
    expect(PRELAUNCH_MONTHS).toBe(2);
    expect(budget.months).toBe(2);
  });

  it("adds up: every line is its own insurance, gas and wages", () => {
    for (const line of budget.lines) {
      expect(line.totalCents).toBe(line.insuranceCents + line.gasCents + line.wagesCents);
    }
    expect(budget.totalCents).toBe(budget.insuranceCents + budget.gasCents + budget.wagesCents);
    expect(budget.totalCents).toBe(budget.lines.reduce((s, l) => s + l.totalCents, 0));
  });

  it("pays the desk roles for the window, and nobody else — the field roles are paid per job", () => {
    // The omission this test exists to prevent: drivers and assistants earn
    // nothing during a window with no customers, which is exactly why they
    // get the stipend. The secretary, the social media manager, the lawyer
    // and the web developer all work those two months for real — there is
    // no app for anyone else's work to run through without the last one.
    const DESK = ["secretary", "social-media-manager", "lawyer", "web-developer"];
    for (const line of budget.lines) {
      if (DESK.includes(line.role)) expect(line.wagesCents, line.role).toBeGreaterThan(0);
      else expect(line.wagesCents, line.role).toBe(0);
    }
    const expected = STAFF_ROLES
      .filter((r) => DESK.includes(r.id))
      .reduce((sum, r) => sum + PRELAUNCH_HEADCOUNT[r.id] * r.prelaunchHoursPerWeek * r.hourlyCents * PRELAUNCH_WEEKS, 0);
    expect(budget.wagesCents).toBe(expected);
  });

  it("bills gas to the drivers only", () => {
    for (const line of budget.lines) {
      expect(line.gasCents).toBe(line.role === "driver" ? line.headcount * gasStipendCentsPerDriver() : 0);
    }
  });

  it("insures every hire for both months", () => {
    for (const line of budget.lines) {
      expect(line.insuranceCents).toBe(line.headcount * insuranceCentsPerMonth(line.role) * 2);
    }
  });

  it("costs nothing at zero headcount, rather than a floor nobody asked for", () => {
    const empty = prelaunchBudget({ driver: 0, "personal-assistant": 0, "errand-runner": 0, secretary: 0, "social-media-manager": 0 });
    expect(empty.totalCents).toBe(0);
  });

  it("scales with headcount", () => {
    const doubled = prelaunchBudget(
      Object.fromEntries(Object.entries(PRELAUNCH_HEADCOUNT).map(([k, v]) => [k, v * 2])) as typeof PRELAUNCH_HEADCOUNT,
    );
    expect(doubled.totalCents).toBe(budget.totalCents * 2);
  });

  it("refuses a fractional or negative headcount instead of budgeting for half a person", () => {
    expect(() => prelaunchBudget({ ...PRELAUNCH_HEADCOUNT, driver: 2.5 })).toThrow(/whole number/i);
    expect(() => prelaunchBudget({ ...PRELAUNCH_HEADCOUNT, secretary: -1 })).toThrow(/whole number/i);
  });

  it("is dominated by insurance and payroll, not by the gas stipend", () => {
    // Worth pinning: the stipend is the line that gets talked about and the
    // other two are the lines that cost money. If a future rate change flips
    // that, the budget doc's framing is wrong and this test says so.
    expect(budget.insuranceCents).toBeGreaterThan(budget.gasCents * 5);
    expect(budget.wagesCents).toBeGreaterThan(budget.gasCents * 2);
  });
});

describe("what the roster costs after launch", () => {
  it("insures the roster at exactly half the two-month line", () => {
    const monthly = monthlyInsuranceCents();
    expect(monthly).toBe(
      STAFF_ROLES.reduce((s, r) => s + PRELAUNCH_HEADCOUNT[r.id] * insuranceCentsPerMonth(r.id), 0),
    );
    expect(monthly * PRELAUNCH_MONTHS).toBe(prelaunchBudget().insuranceCents);
  });

  it("keeps paying the secretary, since the desk does not go away at launch", () => {
    expect(monthlyPayrollCents()).toBeGreaterThan(0);
  });

  it("is insurance plus payroll, and excludes per-job pay to avoid double-counting", () => {
    // Driver and assistant pay scales with work done and is already priced
    // into each job, against the same revenue — counting it here too would
    // charge it twice.
    expect(monthlyRosterCents()).toBe(monthlyInsuranceCents() + monthlyPayrollCents());
    expect(monthlyRosterCents({ driver: 0, "personal-assistant": 0, "errand-runner": 0, secretary: 0, "social-media-manager": 0 })).toBe(0);
  });
});
