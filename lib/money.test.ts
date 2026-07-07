// Runnable check for the money math: npm test
import assert from "node:assert/strict";
process.env.ENCRYPTION_SECRET = "test-secret";

import { decrypt, encrypt, keyHint } from "./crypto";
import {
  computeCosts,
  isRenewingSoon,
  monthlyCents,
  nextRenewal,
  projectMonthlyCost,
  windowStart,
} from "./money";
import type { Project, Service, SharedSubscription } from "./types";
import { centsFromDollars, ValidationError } from "./validate";

const project = (id: string): Project => ({
  id,
  name: id,
  url: "",
  notes: "",
  stripeAccountId: null,
  revenueTag: null,
  createdAt: "2026-01-01",
});

const service = (
  id: string,
  projectId: string,
  cost: Service["cost"],
  status: Service["status"] = "active",
): Service => ({
  id,
  projectId,
  name: id,
  sortOrder: 0,
  url: "",
  loginMethod: "github",
  loginOther: "",
  category: "hosting",
  status,
  renewalDate: null,
  cost,
  notes: "",
});

const sub = (
  id: string,
  amountCents: number,
  cycle: SharedSubscription["cycle"] = "monthly",
  status: SharedSubscription["status"] = "active",
): SharedSubscription => ({
  id,
  name: id,
  url: "",
  notes: "",
  amountCents,
  cycle,
  renewalDate: null,
  status,
});

// --- normalization ---
assert.equal(monthlyCents(1200, "annual"), 100);
assert.equal(monthlyCents(1500, "monthly"), 1500);

// --- window projection ---
const midYear = new Date("2026-07-06T12:00:00-04:00"); // July, NY
assert.equal(projectMonthlyCost(3000, "daily", midYear), 100);
assert.equal(projectMonthlyCost(3000, "monthly", midYear), 3000);
assert.equal(projectMonthlyCost(3000, "yearly", midYear), 36000);
assert.equal(projectMonthlyCost(3000, "all-time", midYear), 36000);
assert.equal(projectMonthlyCost(3000, "ytd", midYear), 3000 * 7); // Jan–Jul

// --- brief's Railway example: $20/mo shared ---
const p1 = project("a"), p2 = project("b"), p3 = project("c");
const railway = sub("railway", 2000);
const shared = (id: string, pid: string) =>
  service(id, pid, { type: "shared", subscriptionId: "railway" });

// two opt-in projects → $10 each; third bears $0 and is not in the divisor
let report = computeCosts(
  [p1, p2, p3],
  new Map([
    ["a", [shared("s1", "a")]],
    ["b", [shared("s2", "b")]],
    ["c", []],
  ]),
  [railway],
);
assert.equal(report.perProjectMonthly.get("a"), 1000);
assert.equal(report.perProjectMonthly.get("b"), 1000);
assert.equal(report.perProjectMonthly.get("c"), 0);
assert.equal(report.totalMonthly, 2000);

// third opts in → rebalances to 3-way split that still sums to the bill
report = computeCosts(
  [p1, p2, p3],
  new Map([
    ["a", [shared("s1", "a")]],
    ["b", [shared("s2", "b")]],
    ["c", [shared("s3", "c")]],
  ]),
  [railway],
);
const slices = [
  report.perProjectMonthly.get("a")!,
  report.perProjectMonthly.get("b")!,
  report.perProjectMonthly.get("c")!,
];
assert.equal(slices.reduce((x, y) => x + y, 0), 2000); // exact, no lost cents
assert.ok(slices.every((s) => s === 666 || s === 667));
assert.equal(report.totalMonthly, 2000);

// project with TWO services on the same sub counts once in the divisor
report = computeCosts(
  [p1, p2],
  new Map([
    ["a", [shared("s1", "a"), shared("s1b", "a")]],
    ["b", [shared("s2", "b")]],
  ]),
  [railway],
);
assert.equal(report.perProjectMonthly.get("a"), 1000);
assert.equal(report.perProjectMonthly.get("b"), 1000);

// paused service doesn't opt in; paused sub allocates $0 everywhere
report = computeCosts(
  [p1, p2],
  new Map([
    ["a", [shared("s1", "a")]],
    ["b", [service("s2", "b", { type: "shared", subscriptionId: "railway" }, "paused")]],
  ]),
  [railway],
);
assert.equal(report.perProjectMonthly.get("a"), 2000); // sole opt-in bears it all
assert.equal(report.perProjectMonthly.get("b"), 0);
report = computeCosts(
  [p1],
  new Map([["a", [shared("s1", "a")]]]),
  [sub("railway", 2000, "monthly", "paused")],
);
assert.equal(report.totalMonthly, 0);

// specific costs + annual normalization + category rollup + reconciliation
report = computeCosts(
  [p1, p2],
  new Map([
    [
      "a",
      [
        service("s1", "a", { type: "specific", amountCents: 1500, cycle: "monthly" }),
        service("s2", "a", { type: "specific", amountCents: 12000, cycle: "annual" }),
        shared("s3", "a"),
      ],
    ],
    ["b", [shared("s4", "b")]],
  ]),
  [railway],
);
assert.equal(report.perProjectMonthly.get("a"), 1500 + 1000 + 1000);
assert.equal(report.perProjectMonthly.get("b"), 1000);
// total ties out against the actual bills: 1500 + 1000 + 2000
assert.equal(report.totalMonthly, 4500);
assert.equal(report.categoryMonthly.get("hosting"), 4500);

// --- revenue window boundaries (NY calendar) ---
const start = windowStart("monthly", midYear)!;
assert.equal(start.toISOString(), "2026-07-01T04:00:00.000Z"); // EDT midnight
assert.equal(windowStart("all-time", midYear), null);
assert.equal(
  windowStart("yearly", midYear)!.toISOString(),
  windowStart("ytd", midYear)!.toISOString(),
);

// --- renewal anchors roll forward by cycle ---
// now = 2026-07-06 (NY)
assert.equal(nextRenewal("2026-05-15", "monthly", midYear), "2026-07-15");
assert.equal(nextRenewal("2026-07-01", "monthly", midYear), "2026-08-01");
assert.equal(nextRenewal("2026-07-06", "monthly", midYear), "2026-07-06"); // today counts
assert.equal(nextRenewal("2025-03-10", "annual", midYear), "2027-03-10");
assert.equal(nextRenewal("2026-12-25", "annual", midYear), "2026-12-25"); // future anchor unchanged
// day-of-month clamps in short months without drifting
const endOfJan = new Date("2026-02-05T12:00:00-05:00");
assert.equal(nextRenewal("2026-01-31", "monthly", endOfJan), "2026-02-28");
assert.equal(isRenewingSoon("2026-05-15", "monthly", midYear), true); // past anchor rolls forward
assert.equal(isRenewingSoon("2025-09-01", "annual", midYear), false); // next is ~2 months out
assert.equal(isRenewingSoon(null, "monthly", midYear), false);

// --- dollars → cents parsing ---
assert.equal(centsFromDollars("12.5", "x"), 1250);
assert.equal(centsFromDollars("$12.50", "x"), 1250);
assert.equal(centsFromDollars("0", "x"), 0);
for (const bad of ["abc", "-5", "1.234", ""]) {
  assert.throws(() => centsFromDollars(bad, "x"), ValidationError);
}

// --- crypto roundtrip ---
const secret = "sk_live_abc123def456";
assert.equal(decrypt(encrypt(secret)), secret);
assert.notEqual(encrypt(secret), encrypt(secret)); // fresh iv each time
assert.equal(keyHint(secret), "sk_live_…f456");

console.log("money.test.ts: all checks passed");
