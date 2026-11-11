import { describe, expect, it } from "vitest";
import { readPartnerInquiry } from "../src/partners.ts";

const good = { company: "  Island  Yacht Charters ", name: "Ana  Rivera", email: "Ana@IslandYachts.com ", about: "We run day charters out of Fajardo and want to offer them to your members." };

describe("readPartnerInquiry", () => {
  it("tidies a good inquiry", () => {
    const r = readPartnerInquiry(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({ company: "Island Yacht Charters", name: "Ana Rivera", email: "ana@islandyachts.com", about: good.about });
  });

  it("asks for each thing it is missing, by name", () => {
    expect(readPartnerInquiry({ ...good, company: " " })).toEqual({ ok: false, field: "company" });
    expect(readPartnerInquiry({ ...good, name: "" })).toEqual({ ok: false, field: "name" });
    expect(readPartnerInquiry({ ...good, email: "not-an-email" })).toEqual({ ok: false, field: "email" });
    expect(readPartnerInquiry({ ...good, about: "hi" })).toEqual({ ok: false, field: "about" });
  });

  it("refuses text too long to be a real answer", () => {
    expect(readPartnerInquiry({ ...good, about: "x".repeat(2001) })).toEqual({ ok: false, field: "about" });
    expect(readPartnerInquiry({ ...good, company: "x".repeat(121) })).toEqual({ ok: false, field: "company" });
  });

  it("does not trip over missing or odd input", () => {
    expect(readPartnerInquiry(undefined).ok).toBe(false);
    expect(readPartnerInquiry({ company: 5, name: {}, email: [], about: null }).ok).toBe(false);
  });
});
