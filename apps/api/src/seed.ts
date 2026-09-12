import type { Db } from "./store.ts";

/**
 * An empty database.
 *
 * Demo accounts with known passwords are deliberately not seeded: this server
 * is meant to be deployed, and a shipped credential is a back door that
 * outlives whoever remembers it. Accounts are created through
 * `POST /api/auth/signup`.
 */
export const SEED: Db = {
  travelers: [],
  sessions: [],
  crews: [],
  carePackages: {},
  nights: [],
  grants: [],
  alerts: [],
  points: {},
  redemptions: {},
  rounds: [],
  pendingOrders: {},
  partyCarts: {},
  paymentMethods: {},
  charges: [],
  subscriptions: {},
  conciergeTasks: [],
  voiceMessages: [],
  holds: [],
  driverApplications: [], pushDevices: [],
};
