export type TimeWindow = "daily" | "monthly" | "yearly" | "ytd" | "all-time";
export type Cycle = "monthly" | "annual";
export type Status = "active" | "paused" | "cancelled";
export type Category =
  | "hosting"
  | "database"
  | "auth"
  | "email"
  | "ai"
  | "analytics"
  | "domain"
  | "other";
export type LoginMethod = "google" | "github" | "other";

export const TIME_WINDOWS: readonly TimeWindow[] = [
  "daily",
  "monthly",
  "yearly",
  "ytd",
  "all-time",
];
export const CYCLES: readonly Cycle[] = ["monthly", "annual"];
export const STATUSES: readonly Status[] = ["active", "paused", "cancelled"];
export const CATEGORIES: readonly Category[] = [
  "hosting",
  "database",
  "auth",
  "email",
  "ai",
  "analytics",
  "domain",
  "other",
];
export const LOGIN_METHODS: readonly LoginMethod[] = [
  "google",
  "github",
  "other",
];

// All money is integer cents everywhere; dollars exist only at render.
export type Cost =
  | { type: "specific"; amountCents: number; cycle: Cycle }
  | { type: "shared"; subscriptionId: string };

export interface Project {
  id: string;
  name: string;
  url: string; // where the project itself is hosted, "" if nowhere yet
  notes: string;
  stripeAccountId: string | null;
  revenueTag: string | null;
  createdAt: string;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  url: string;
  loginMethod: LoginMethod;
  loginOther: string;
  category: Category;
  status: Status;
  renewalDate: string | null; // yyyy-mm-dd
  cost: Cost;
  notes: string;
}

export interface SharedSubscription {
  id: string;
  name: string;
  url: string;
  notes: string;
  amountCents: number;
  cycle: Cycle;
  renewalDate: string | null;
  status: Status;
}

export interface StripeAccount {
  id: string;
  label: string;
  encryptedKey: string; // AES-256-GCM payload, never sent to the client
  keyHint: string; // e.g. "sk_live_…4f2b"
  notes: string;
}
