import { describe, expect, it } from "vitest";
import { askedAndPaid, productName, rows } from "../src/app/signals-view.ts";

describe("how the owner's numbers are written", () => {
  it("says it plainly when nobody has paid, and gives the share when someone has", () => {
    expect(askedAndPaid({ asked: 0, paid: 0 })).toBe("Nobody has asked yet");
    expect(askedAndPaid({ asked: 40, paid: 0 })).toBe("Asked 40 times, nobody paid");
    expect(askedAndPaid({ asked: 1, paid: 0 })).toBe("Asked once, nobody paid");
    expect(askedAndPaid({ asked: 40, paid: 3 })).toBe("Asked 40 times, 3 paid (8%)");
    expect(askedAndPaid({ asked: 3, paid: 3 })).toBe("Asked 3 times, 3 paid (100%)");
  });

  it("uses names the owner knows, and leaves an unknown product as it is", () => {
    expect(productName("site-pass")).toBe("Website visit pass");
    expect(productName("vendors")).toBe("Vendor lookup");
    expect(productName("facts")).toBe("Plans and prices facts");
    expect(productName("blog")).toBe("Blog article copy");
    expect(productName("new-thing")).toBe("new-thing");
  });

  it("lists the products that have been asked for, most asked first", () => {
    expect(rows({ facts: { asked: 2, paid: 0 }, "site-pass": { asked: 9, paid: 1 }, vendors: { asked: 0, paid: 0 } }).map((r) => r.name))
      .toEqual(["Website visit pass", "Plans and prices facts"]);
  });
});
