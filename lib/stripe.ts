import "server-only";
import Stripe from "stripe";
import { decrypt } from "./crypto";
import { windowStart } from "./money";
import type { Project, StripeAccount, TimeWindow } from "./types";

// Revenue = succeeded USD charges minus refunds; Stripe fees ignored (spec).
// Attribution tag: metadata.project on the Charge, falling back to its
// PaymentIntent's metadata.project.

interface AccountRevenue {
  totalCents: number;
  byTag: Record<string, number>;
  untaggedCents: number;
}

async function fetchAccountRevenue(
  secretKey: string,
  since: Date | null,
): Promise<AccountRevenue> {
  const stripe = new Stripe(secretKey);
  const params: Stripe.ChargeListParams = {
    limit: 100,
    expand: ["data.payment_intent"],
  };
  if (since) params.created = { gte: Math.floor(since.getTime() / 1000) };

  let totalCents = 0;
  let untaggedCents = 0;
  const byTag: Record<string, number> = {};
  for await (const charge of stripe.charges.list(params)) {
    if (charge.status !== "succeeded" || charge.currency !== "usd") continue;
    const net = charge.amount - charge.amount_refunded;
    totalCents += net;
    const pi =
      typeof charge.payment_intent === "object" ? charge.payment_intent : null;
    const tag = charge.metadata?.project || pi?.metadata?.project || "";
    if (tag) byTag[tag] = (byTag[tag] ?? 0) + net;
    else untaggedCents += net;
  }
  return { totalCents, byTag, untaggedCents };
}

export type ProjectRevenue =
  | { state: "untracked" } // no Stripe account linked — a normal, permanent state
  | { state: "unavailable"; message: string }
  | { state: "ok"; cents: number };

export interface RevenueReport {
  perProject: Map<string, ProjectRevenue>;
  unattributedCents: number; // shared-account payments matching no project's tag
  totalCents: number; // sum of per-project + unattributed, exactly
  errors: { accountLabel: string; message: string }[];
}

export async function computeRevenue(
  projects: Project[],
  accounts: StripeAccount[],
  win: TimeWindow,
  now = new Date(),
): Promise<RevenueReport> {
  const since = windowStart(win, now);
  const perProject = new Map<string, ProjectRevenue>();
  const errors: RevenueReport["errors"] = [];
  let unattributedCents = 0;
  let totalCents = 0;

  const byAccount = new Map<string, Project[]>();
  for (const p of projects) {
    if (!p.stripeAccountId) {
      perProject.set(p.id, { state: "untracked" });
      continue;
    }
    const list = byAccount.get(p.stripeAccountId) ?? [];
    list.push(p);
    byAccount.set(p.stripeAccountId, list);
  }

  await Promise.all(
    [...byAccount.entries()].map(async ([accountId, accountProjects]) => {
      const account = accounts.find((a) => a.id === accountId);
      const fail = (message: string) => {
        errors.push({ accountLabel: account?.label ?? accountId, message });
        for (const p of accountProjects)
          perProject.set(p.id, { state: "unavailable", message });
      };
      if (!account) return fail("Stripe account no longer exists");

      let revenue: AccountRevenue;
      try {
        revenue = await fetchAccountRevenue(decrypt(account.encryptedKey), since);
      } catch (e) {
        return fail(e instanceof Error ? e.message : "Stripe request failed");
      }

      if (accountProjects.length === 1) {
        // Sole project on the account owns all of its revenue.
        perProject.set(accountProjects[0].id, {
          state: "ok",
          cents: revenue.totalCents,
        });
        totalCents += revenue.totalCents;
      } else {
        // Shared account: each project gets only its tag's payments; the
        // rest of the account's revenue is surfaced as "unattributed".
        let matched = 0;
        for (const p of accountProjects) {
          const cents = p.revenueTag ? (revenue.byTag[p.revenueTag] ?? 0) : 0;
          perProject.set(p.id, { state: "ok", cents });
          matched += cents;
        }
        totalCents += revenue.totalCents;
        unattributedCents += revenue.totalCents - matched;
      }
    }),
  );

  return { perProject, unattributedCents, totalCents, errors };
}
