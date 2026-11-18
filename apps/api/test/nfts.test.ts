import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NFT_COLLECTION, NFT_PIECES } from "../src/nfts.ts";

describe("the NFT pieces shown to agents", () => {
  it("has a picture file for every piece, in the web app's public folder", () => {
    for (const p of NFT_PIECES) expect(existsSync(new URL(`../../web/public/nft/${p.file}`, import.meta.url)), p.file).toBe(true);
  });
  it("says every piece was made with AI, never promises value, and names nothing that is not ours", () => {
    expect(NFT_PIECES).toHaveLength(7);
    for (const p of NFT_PIECES) {
      expect(p.description).toMatch(/made with AI/i);
      expect(`${p.title} ${p.description}`).not.toMatch(/shark tank|smurf|rare|valuable|invest|profit|rise in value/i);
    }
    expect(NFT_COLLECTION.note).toMatch(/not an investment/i);
  });
  it("keeps the pieces that are on hold out", () => {
    const titles = NFT_PIECES.map((p) => p.title).join(" ");
    for (const held of ["Neon Jaws", "Shark and Unicorn", "Shark Storm", "Four Skylines", "Street Reclaimed", "Whale", "Cat on"]) expect(titles).not.toContain(held);
  });
});
