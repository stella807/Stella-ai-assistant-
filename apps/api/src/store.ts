import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Alert, CarePackageAuth, CarePackageOrder, Crew, NightOut, ShareGrant, WorriedTextRound } from "@safehubby/core";
import type { PointEntry, Redemption } from "@safehubby/core";

export interface Traveler {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  planId: "free" | "premium-basic" | "premium-plus" | "family";
  homeLabel: string;
  emergencyContacts: { name: string; phone: string }[];
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

/** Care-package state hangs off the night rather than off core's NightOut,
 *  which keeps the domain types free of a circular import. */
export interface CarePackageState {
  auth: CarePackageAuth | null;
  orders: CarePackageOrder[];
}

export interface Db {
  travelers: Traveler[];
  sessions: Session[];
  crews: Crew[];
  carePackages: Record<string, CarePackageState>;
  nights: NightOut[];
  grants: ShareGrant[];
  alerts: Alert[];
  points: Record<string, PointEntry[]>;
  redemptions: Record<string, Redemption[]>;
  rounds: WorriedTextRound[];
}

const EMPTY: Db = {
  travelers: [], sessions: [], crews: [], carePackages: {}, nights: [], grants: [], alerts: [], points: {}, redemptions: {}, rounds: [],
};

/**
 * Flat-file JSON persistence. Deliberately boring: this is a prototype backend,
 * and the interesting logic lives in @safehubby/core, so swapping this for
 * Postgres later touches only this file.
 *
 * A real deployment must encrypt location history at rest and set an actual
 * retention window — see SECURITY.md. Location traces are the most sensitive
 * data this product touches.
 */
export class Store {
  #path: string;
  #db: Db;

  constructor(path = join(process.cwd(), ".safehubby", "db.json")) {
    this.#path = path;
    this.#db = this.#load();
  }

  #load(): Db {
    if (!existsSync(this.#path)) return structuredClone(EMPTY);
    try {
      return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(this.#path, "utf8")) };
    } catch {
      // A corrupt dev database should not wedge the server on boot.
      return structuredClone(EMPTY);
    }
  }

  get data(): Db {
    return this.#db;
  }

  save(): void {
    mkdirSync(dirname(this.#path), { recursive: true });
    writeFileSync(this.#path, JSON.stringify(this.#db, null, 2));
  }

  update(fn: (db: Db) => void): void {
    fn(this.#db);
    this.save();
  }

  reset(seed: Db): void {
    this.#db = seed;
    this.save();
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
