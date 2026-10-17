import { describe, expect, it } from "vitest";
import { askWords, choiceLabel } from "../src/app/ask-copy.ts";

describe("Get help in both languages", () => {
  it("names every choice in Spanish, and keeps English in English", () => {
    for (const id of ["wait-with-someone", "check-in-person", "book-and-buy", "airport-pickup", "appointment", "reminder", "message", "research", "paperwork"]) {
      expect(choiceLabel(id, "English", "es")).not.toBe("English");
      expect(choiceLabel(id, "English", "en")).toBe("English");
    }
  });
  it("falls back to the English name for a choice it does not know yet", () => {
    expect(choiceLabel("something-new", "Something new", "es")).toBe("Something new");
  });
  it("has the screen's words in Spanish", () => {
    expect(askWords("es").send).toBe("Enviar");
    expect(askWords("es").tabs.concierge).toBe("Envía un asistente");
  });
});
