import { describe, expect, it } from "vitest";
import { callBody, phoneCheckResult, usableCaller } from "../src/adapters/vapi.ts";

describe("what Sofía's call asks Vapi for", () => {
  const body: any = callBody({ phoneNumberId: "pn_1", to: "+17872922050", item: "insulina Lantus", place: "Walgreens Avenida La Sierra", lang: "es" });

  it("calls the given number from the given line, with an assistant made for this one call", () => {
    expect(body.phoneNumberId).toBe("pn_1");
    expect(body.customer).toEqual({ number: "+17872922050" });
    expect(body.assistant.name).toBe("Sofía");
  });

  it("says she is an automated assistant in her first sentence, and asks only about the item", () => {
    expect(body.assistant.firstMessage).toMatch(/^Buenas\. Le habla Sofía, la asistente automatizada de Safehubby\./);
    expect(body.assistant.firstMessage).toContain("insulina Lantus");
    expect(callBody({ phoneNumberId: "pn_1", to: "+17872922050", item: "Lantus insulin", place: "x", lang: "en" }).assistant.firstMessage).toMatch(/^Hello\. This is Sofia, Safehubby's automated assistant\./);
  });

  it("is capped at five minutes, keeps no recording, and lets her hang up", () => {
    expect(body.assistant.maxDurationSeconds).toBe(300);
    expect(body.assistant.artifactPlan).toEqual({ recordingEnabled: false });
    expect(body.assistant.model.tools).toEqual([{ type: "endCall" }]);
    expect(body.assistant.model.messages[0].content).toMatch(/phone menu|menú/i);
    expect(body.assistant.model.messages[0].content).toMatch(/hang up|end the call/i);
  });

  it("asks Vapi to write down, after the call, whether a person answered and whether the item is in stock", () => {
    const schema = body.assistant.analysisPlan.structuredDataSchema;
    expect(Object.keys(schema.properties)).toEqual(["reachedPerson", "inStock", "notes"]);
    expect(schema.properties.inStock.enum).toEqual(["yes", "no", "unknown"]);
  });
});

describe("which line can call out", () => {
  it("uses an imported number, never a free Vapi one, which cannot call out", () => {
    expect(usableCaller([{ id: "v", provider: "vapi", number: "+1555" }])).toBeNull();
    expect(usableCaller([{ id: "v", provider: "vapi" }, { id: "t", provider: "twilio", number: "+1787" }])).toEqual({ id: "t", number: "+1787", provider: "twilio" });
    expect(usableCaller([{ id: "v", provider: "vapi" }, { id: "t", provider: "twilio" }], "v")).toBeNull();
    expect(usableCaller([{ id: "t", provider: "telnyx" }], "t")).toMatchObject({ id: "t" });
  });
});

describe("reading the call afterwards", () => {
  it("turns a finished call into a check only when a person answered and gave a clear answer", () => {
    expect(phoneCheckResult({ status: "ended", analysis: { structuredData: { reachedPerson: true, inStock: "yes", notes: "Two boxes left" }, summary: "s" } })).toEqual({ done: true, answer: "yes", notes: "Two boxes left" });
    expect(phoneCheckResult({ status: "ended", analysis: { structuredData: { reachedPerson: false, inStock: "unknown" } } })).toEqual({ done: true, answer: null, notes: "No person answered." });
    expect(phoneCheckResult({ status: "in-progress" })).toEqual({ done: false });
    expect(phoneCheckResult({ status: "ended", endedReason: "customer-did-not-answer" })).toEqual({ done: true, answer: null, notes: "No answer (customer-did-not-answer)." });
  });
});
