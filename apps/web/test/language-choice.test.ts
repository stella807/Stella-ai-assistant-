import { describe, expect, it } from "vitest";
import { chooseLanguage } from "../src/app/language-choice.ts";

describe("which language the app opens in", () => {
  it("opens a Spanish address in Spanish, whatever was chosen before", () => {
    expect(chooseLanguage({ pathname: "/es", stored: "en", browser: "en-US" })).toBe("es");
    expect(chooseLanguage({ pathname: "/es/trabajo/nurse", stored: null, browser: "en-US" })).toBe("es");
    expect(chooseLanguage({ pathname: "/trabajo", stored: "en", browser: undefined })).toBe("es");
  });

  it("leaves a returning reader's choice alone on an English address", () => {
    expect(chooseLanguage({ pathname: "/", stored: "es", browser: "en-US" })).toBe("es");
    expect(chooseLanguage({ pathname: "/careers", stored: "en", browser: "es-PR" })).toBe("en");
  });

  it("falls back to the browser, then to English", () => {
    expect(chooseLanguage({ pathname: "/", stored: null, browser: "es-PR" })).toBe("es");
    expect(chooseLanguage({ pathname: "/", stored: "fr", browser: "en-US" })).toBe("en");
    expect(chooseLanguage({ pathname: "/employee", stored: null, browser: undefined })).toBe("en");
  });
});
