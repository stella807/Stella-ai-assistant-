import type { Db } from "./store.ts";

/** A demo couple so the UI has something to show on first run. */
export const SEED: Db = {
  travelers: [
    {
      id: "t-sam",
      displayName: "Sam",
      planId: "premium-plus",
      homeLabel: "142 Rowan St",
      emergencyContacts: [{ name: "Alex (partner)", phone: "+1-555-0100" }],
    },
    {
      id: "t-jordan",
      displayName: "Jordan",
      planId: "free",
      homeLabel: "9 Corbin Ave",
      emergencyContacts: [{ name: "Riley", phone: "+1-555-0111" }],
    },
  ],
  nights: [], grants: [], alerts: [], points: {}, redemptions: {}, rounds: [],
};
