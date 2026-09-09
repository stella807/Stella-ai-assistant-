import { describe, expect, it } from "vitest";
import {
  reviewApplication, submitApplication, withdrawApplication,
  type SubmitApplicationInput,
} from "../src/driver-applications.ts";

const T0 = new Date("2026-06-15T12:00:00Z");

const base: SubmitApplicationInput = {
  id: "app1",
  tier: "standard",
  fullName: "Jordan Rivera",
  email: "jordan@example.com",
  phone: "(404) 555-0182",
  city: "Atlanta",
  state: "ga",
  licenseNumber: "GA123456",
  licenseExpiry: "2028-01-01T00:00:00Z",
  yearsDriving: 6,
  vehicle: { make: "Toyota", model: "Camry", year: 2021, licensePlate: "abc1234" },
  backgroundCheckConsent: true,
  now: T0,
};

describe("submitting a standard application", () => {
  it("accepts a well-formed application and normalizes fields", () => {
    const app = submitApplication(base);
    expect(app.status).toBe("submitted");
    expect(app.state).toBe("GA");
    expect(app.email).toBe("jordan@example.com");
    expect(app.vehicle.licensePlate).toBe("ABC1234");
  });

  it("rejects a missing or malformed name", () => {
    expect(() => submitApplication({ ...base, fullName: "J" })).toThrow(/full name/i);
  });

  it("rejects a bad email", () => {
    expect(() => submitApplication({ ...base, email: "not-an-email" })).toThrow(/valid email/i);
  });

  it("rejects a short phone number", () => {
    expect(() => submitApplication({ ...base, phone: "12345" })).toThrow(/phone/i);
  });

  it("rejects a missing city or state", () => {
    expect(() => submitApplication({ ...base, city: "" })).toThrow(/city/i);
    expect(() => submitApplication({ ...base, state: "" })).toThrow(/state/i);
  });

  it("rejects an already-expired driver's licence", () => {
    expect(() => submitApplication({ ...base, licenseExpiry: "2020-01-01T00:00:00Z" })).toThrow(/expired/i);
  });

  it("rejects a nonsense licence expiry", () => {
    expect(() => submitApplication({ ...base, licenseExpiry: "not-a-date" })).toThrow(/valid licence expiry/i);
  });

  it("rejects negative or missing driving experience", () => {
    expect(() => submitApplication({ ...base, yearsDriving: -1 })).toThrow(/experience/i);
    // @ts-expect-error exercising the runtime guard
    expect(() => submitApplication({ ...base, yearsDriving: "many" })).toThrow();
  });

  it("rejects an implausible vehicle year", () => {
    expect(() => submitApplication({ ...base, vehicle: { ...base.vehicle, year: 1950 } })).toThrow(/vehicle year/i);
    expect(() => submitApplication({ ...base, vehicle: { ...base.vehicle, year: 2099 } })).toThrow(/vehicle year/i);
  });

  it("rejects a missing licence plate or make/model", () => {
    expect(() => submitApplication({ ...base, vehicle: { ...base.vehicle, licensePlate: "" } })).toThrow(/plate/i);
    expect(() => submitApplication({ ...base, vehicle: { ...base.vehicle, make: "" } })).toThrow(/make and model/i);
  });

  it("requires background-check consent", () => {
    expect(() => submitApplication({ ...base, backgroundCheckConsent: false })).toThrow(/consent/i);
  });

  it("does not require protective-service fields for the standard tier", () => {
    expect(submitApplication(base).protectiveLicenseNumber).toBeUndefined();
  });
});

describe("submitting a secure-transport application", () => {
  const secure: SubmitApplicationInput = {
    ...base,
    id: "app2",
    tier: "secure-transport",
    protectiveLicenseNumber: "PSA-9981",
    protectiveLicenseState: "ga",
    yearsProtectiveExperience: 8,
  };

  it("accepts a complete secure-transport application", () => {
    const app = submitApplication(secure);
    expect(app.protectiveLicenseNumber).toBe("PSA-9981");
    expect(app.protectiveLicenseState).toBe("GA");
    expect(app.yearsProtectiveExperience).toBe(8);
  });

  it("rejects a secure-transport application with no protective licence", () => {
    expect(() => submitApplication({ ...secure, protectiveLicenseNumber: undefined })).toThrow(/protective-services or law-enforcement licence/i);
  });

  it("rejects a secure-transport application with no issuing state", () => {
    expect(() => submitApplication({ ...secure, protectiveLicenseState: undefined })).toThrow(/issued your protective/i);
  });

  it("rejects a secure-transport application with no protective experience", () => {
    expect(() => submitApplication({ ...secure, yearsProtectiveExperience: undefined })).toThrow(/protective, military, or law-enforcement/i);
  });

  it("does not let a standard applicant skip the protective fields by mistake going the other way", () => {
    // Sanity: a standard-tier submission with no protective fields at all still succeeds.
    expect(submitApplication(base).tier).toBe("standard");
  });
});

describe("review workflow", () => {
  const app = () => submitApplication(base);

  it("moves submitted to under-review", () => {
    const reviewed = reviewApplication(app(), "under-review", T0, "Looks solid, checking references.");
    expect(reviewed.status).toBe("under-review");
    expect(reviewed.reviewerNote).toContain("references");
  });

  it("refuses to approve sight-unseen, straight from submitted", () => {
    expect(() => reviewApplication(app(), "approved", T0)).toThrow(/under-review before approving/i);
  });

  it("approves once under review", () => {
    const underReview = reviewApplication(app(), "under-review", T0);
    expect(reviewApplication(underReview, "approved", T0).status).toBe("approved");
  });

  it("rejects once under review", () => {
    const underReview = reviewApplication(app(), "under-review", T0);
    expect(reviewApplication(underReview, "rejected", T0, "Licence could not be verified.").status).toBe("rejected");
  });

  it("lets an admin deliberately reopen a decided application", () => {
    const rejected = reviewApplication(reviewApplication(app(), "under-review", T0), "rejected", T0);
    expect(reviewApplication(rejected, "under-review", T0, "New documents received.").status).toBe("under-review");
  });

  it("refuses to touch a withdrawn application", () => {
    const withdrawn = withdrawApplication(app(), T0);
    expect(() => reviewApplication(withdrawn, "under-review", T0)).toThrow(/withdrawn/i);
  });

  it("keeps an existing note when none is given", () => {
    const noted = reviewApplication(app(), "under-review", T0, "Initial note");
    const later = reviewApplication(noted, "approved", T0);
    expect(later.reviewerNote).toBe("Initial note");
  });
});

describe("withdrawal", () => {
  it("lets an applicant withdraw before a decision", () => {
    const withdrawn = withdrawApplication(submitApplication(base), T0);
    expect(withdrawn.status).toBe("withdrawn");
  });

  it("lets an applicant withdraw while under review", () => {
    const underReview = reviewApplication(submitApplication(base), "under-review", T0);
    expect(withdrawApplication(underReview, T0).status).toBe("withdrawn");
  });

  it("cannot withdraw a decided application", () => {
    const approved = reviewApplication(reviewApplication(submitApplication(base), "under-review", T0), "approved", T0);
    expect(() => withdrawApplication(approved, T0)).toThrow(/already approved/i);
  });

  it("cannot withdraw twice", () => {
    const withdrawn = withdrawApplication(submitApplication(base), T0);
    expect(() => withdrawApplication(withdrawn, T0)).toThrow(/already withdrawn/i);
  });
});
