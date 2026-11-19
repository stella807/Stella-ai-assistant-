import { describe, expect, it } from "vitest";
import { requirementsFor, type StaffRole } from "@safehubby/core";
import { careersWords } from "../src/app/careers-copy.ts";

describe("what an applicant needs, on the application screen", () => {
  it("has a heading in both languages", () => {
    expect(careersWords("en").needs).toBe("What you need for this role");
    expect(careersWords("es").needs).toBe("Lo que necesitas para este puesto");
  });

  it("lists the same number of lines in both languages for every role, so neither language is missing something", () => {
    for (const role of ["personal-assistant", "caretaker", "errand-runner", "bodyguard", "secretary", "lawyer"] as StaffRole[]) {
      expect(requirementsFor(role, "es").length, role).toBe(requirementsFor(role, "en").length);
    }
  });
});
