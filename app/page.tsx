import Link from "next/link";
import { createProject } from "./actions";
import { ErrorBanner, ProjectFields } from "@/components/forms";
import { WindowSelector } from "@/components/window-selector";
import { loadAll } from "@/lib/data";
import {
  categoryCostForWindow,
  computeCosts,
  costNote,
  fmtDate,
  fmtUSD,
  isRenewingSoon,
  nextRenewal,
  parseWindow,
  projectCostForWindow,
  revenueNote,
} from "@/lib/money";
import { computeRevenue } from "@/lib/stripe";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const win = parseWindow(sp.window);
  const now = new Date();

  const { projects, servicesByProject, subscriptions, stripeAccounts } =
    await loadAll();
  const costs = computeCosts(projects, servicesByProject, subscriptions, now);
  const revenue = await computeRevenue(projects, stripeAccounts, win, now);

  // Single computation path: the total is the sum of the per-project window
  // figures, so the table always reconciles with the cards to the cent.
  const projectCost = new Map(
    projects.map((p) => [p.id, projectCostForWindow(costs, p.id, win, now)]),
  );
  let totalCost = 0;
  for (const cents of projectCost.values()) totalCost += cents;

  const anyTracked =
    projects.some((p) => p.stripeAccountId) || revenue.unattributedCents > 0;
  const totalProfit = revenue.totalCents - totalCost;

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const subById = new Map(subscriptions.map((s) => [s.id, s]));
  // Renewal anchors roll forward by billing cycle; shared-cost services take
  // their subscription's cycle.
  const serviceCycle = (s: Service) =>
    s.cost.type === "specific"
      ? s.cost.cycle
      : (subById.get(s.cost.subscriptionId)?.cycle ?? "monthly");
  const renewals = [
    ...subscriptions
      .filter(
        (s) =>
          s.status === "active" &&
          isRenewingSoon(s.renewalDate, s.cycle, now),
      )
      .map((s) => ({
        name: s.name,
        context: "Shared subscription",
        date: nextRenewal(s.renewalDate!, s.cycle, now),
      })),
    ...projects.flatMap((p) =>
      (servicesByProject.get(p.id) ?? [])
        .filter(
          (s) =>
            s.status === "active" &&
            isRenewingSoon(s.renewalDate, serviceCycle(s), now),
        )
        .map((s) => ({
          name: s.name,
          context: p.name,
          date: nextRenewal(s.renewalDate!, serviceCycle(s), now),
        })),
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const activeSplits = costs.subSplits.filter(
    (s) => s.sub.status === "active" && s.slices.length > 0,
  );

  return (
    <main className="page">
      <div className="row">
        <div className="grow">
          <h1>Dashboard</h1>
          <p className="muted">
            Costs are projected from recurring rates; revenue is actual Stripe
            payments in the window.
          </p>
        </div>
        <WindowSelector current={win} basePath="/" />
      </div>

      <ErrorBanner message={sp.error} />
      {revenue.errors.map((e) => (
        <p className="banner-error" key={e.accountLabel}>
          Stripe account “{e.accountLabel}” unavailable: {e.message}
        </p>
      ))}

      <div className="card-grid">
        <div className="card">
          <span className="eyebrow">Total cost</span>
          <div className="metric-value">{fmtUSD(totalCost)}</div>
          <div className="metric-note">{costNote(win)}</div>
        </div>
        <div className="card">
          <span className="eyebrow">Total revenue</span>
          <div className="metric-value">
            {anyTracked ? fmtUSD(revenue.totalCents) : "—"}
          </div>
          <div className="metric-note">
            {anyTracked ? revenueNote(win) : "no Stripe accounts linked"}
          </div>
        </div>
        <div className="card">
          <span className="eyebrow">Profit</span>
          <div className={`metric-value ${totalProfit < 0 ? "neg" : "pos"}`}>
            {fmtUSD(totalProfit)}
          </div>
          <div className="metric-note">revenue − cost for this window</div>
        </div>
      </div>

      <section className="card section">
        <h2>Projects</h2>
        {projects.length === 0 ? (
          <p className="empty">
            No projects yet — add your first one below and start attaching the
            services it uses.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Cost</th>
                <th className="num">Revenue</th>
                <th className="num">Profit</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const cost = projectCost.get(p.id) ?? 0;
                const rev = revenue.perProject.get(p.id) ?? {
                  state: "untracked" as const,
                };
                const profit =
                  rev.state === "ok" ? rev.cents - cost : -cost;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projects/${p.id}`}>{p.name}</Link>
                      {p.url && (
                        <>
                          {" "}
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            title={p.url}
                          >
                            ↗
                          </a>
                        </>
                      )}
                    </td>
                    <td className="num">{fmtUSD(cost)}</td>
                    <td className="num">
                      {rev.state === "ok" && fmtUSD(rev.cents)}
                      {rev.state === "untracked" && (
                        <span className="muted" title="No Stripe account linked">
                          —
                        </span>
                      )}
                      {rev.state === "unavailable" && (
                        <span className="muted">unavailable</span>
                      )}
                    </td>
                    <td className={`num ${profit < 0 ? "neg" : ""}`}>
                      {rev.state === "unavailable" ? "—" : fmtUSD(profit)}
                    </td>
                  </tr>
                );
              })}
              {revenue.unattributedCents > 0 && (
                <tr>
                  <td className="muted">
                    Unattributed — shared-account payments matching no revenue
                    tag
                  </td>
                  <td className="num" />
                  <td className="num">{fmtUSD(revenue.unattributedCents)}</td>
                  <td className="num">{fmtUSD(revenue.unattributedCents)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <details>
          <summary>Add a project</summary>
          <form action={createProject} className="stack details-body">
            <ProjectFields accounts={stripeAccounts} />
            <div>
              <button className="btn" type="submit">
                Add project
              </button>
            </div>
          </form>
        </details>
      </section>

      <section className="card section">
        <h2>Spend by category</h2>
        {costs.categoryMonthly.size === 0 ? (
          <p className="empty">
            Nothing here yet — categories appear once projects have active
            services with costs.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...costs.categoryMonthly.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([category]) => (
                  <tr key={category}>
                    <td>
                      <span className="badge badge-category">
                        {cap(category)}
                      </span>
                    </td>
                    <td className="num">
                      {fmtUSD(categoryCostForWindow(costs, category, win, now))}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card section">
        <div className="row">
          <h2 className="grow">Shared subscriptions</h2>
          <Link href="/subscriptions">Manage</Link>
        </div>
        {activeSplits.length === 0 ? (
          <p className="empty">
            No shared subscriptions are being split right now. A subscription
            splits its cost once a project’s service opts into it.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Subscription</th>
                <th className="num">Monthly</th>
                <th>Current split</th>
              </tr>
            </thead>
            <tbody>
              {activeSplits.map(({ sub, monthly, slices }) => (
                <tr key={sub.id}>
                  <td>{sub.name}</td>
                  <td className="num">{fmtUSD(monthly)}</td>
                  <td>
                    {slices
                      .map(
                        (s) =>
                          `${projectName.get(s.projectId) ?? "?"} ${fmtUSD(s.cents)}/mo`,
                      )
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {renewals.length > 0 && (
        <section className="card section">
          <h2>Renewing in the next 30 days</h2>
          <table>
            <thead>
              <tr>
                <th>What</th>
                <th>Where</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="muted">{r.context}</td>
                  <td>{fmtDate(r.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
