import { describe, expect, it } from "vitest";
import { firstAssistantHeading } from "../src/components/FirstAssistantCard.tsx";

describe("the first assistant's heading", () => {
  it("follows their gender in Spanish, and stays neutral when it is unknown", () => {
    expect(firstAssistantHeading("male", true)).toBe("Conoce a nuestro primer asistente personal");
    expect(firstAssistantHeading("female", true)).toBe("Conoce a nuestra primera asistente personal");
    expect(firstAssistantHeading(undefined, true)).toMatch(/primera persona/);
  });
  it("is the same in English whoever it is", () => {
    for (const g of ["male", "female", undefined] as const) expect(firstAssistantHeading(g, false)).toBe("Meet our first personal assistant");
  });
});
