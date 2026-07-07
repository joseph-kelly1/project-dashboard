import {
  createSubscription,
  removeSubscription,
  updateSubscription,
} from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";
import {
  ErrorBanner,
  StatusBadge,
  SubscriptionFields,
} from "@/components/forms";
import { loadAll } from "@/lib/data";
import { computeCosts, fmtDate, fmtUSD } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { projects, servicesByProject, subscriptions } = await loadAll();
  const costs = computeCosts(projects, servicesByProject, subscriptions);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const splitBySub = new Map(costs.subSplits.map((s) => [s.sub.id, s]));

  return (
    <main className="page">
      <div>
        <h1>Shared subscriptions</h1>
        <p className="muted">
          Subscriptions whose price is split across the projects that opt in
          via a service. A project not referencing one pays $0 and isn’t in
          the divisor.
        </p>
      </div>

      <ErrorBanner message={sp.error} />

      {subscriptions.length === 0 && (
        <p className="card empty">
          Nothing shared yet — add subscriptions like Vercel or Railway here,
          then point project services at them to split the cost.
        </p>
      )}

      {subscriptions.map((sub) => {
        const split = splitBySub.get(sub.id);
        const slices = split?.slices ?? [];
        return (
          <section className="card section" key={sub.id}>
            <div className="row">
              <h2 className="grow">
                {sub.name} <StatusBadge status={sub.status} />
              </h2>
              <form action={removeSubscription} className="row">
                <input type="hidden" name="id" value={sub.id} />
                <label className="checkbox">
                  <input type="checkbox" name="detach" /> detach services
                </label>
                <DeleteButton
                  confirmText={`Delete subscription "${sub.name}"? Services still referencing it block the delete unless "detach services" is ticked.`}
                />
              </form>
            </div>
            <p className="muted">
              {fmtUSD(sub.amountCents)} {sub.cycle}
              {split ? ` · ${fmtUSD(split.monthly)}/mo normalized` : ""}
              {sub.renewalDate ? ` · renews ${fmtDate(sub.renewalDate)}` : ""}
              {sub.url && (
                <>
                  {" · "}
                  <a href={sub.url} target="_blank" rel="noreferrer">
                    {sub.url}
                  </a>
                </>
              )}
            </p>
            {slices.length === 0 ? (
              <p className="empty">
                {sub.status === "active"
                  ? "No projects opt in yet, so its allocated cost is $0 everywhere."
                  : "Paused/cancelled — excluded from all totals."}
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="num">Slice</th>
                  </tr>
                </thead>
                <tbody>
                  {slices.map((s) => (
                    <tr key={s.projectId}>
                      <td>{projectName.get(s.projectId) ?? "?"}</td>
                      <td className="num">{fmtUSD(s.cents)}/mo</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <details>
              <summary>Edit</summary>
              <form action={updateSubscription} className="stack details-body">
                <input type="hidden" name="id" value={sub.id} />
                <SubscriptionFields sub={sub} />
                <div>
                  <button className="btn" type="submit">
                    Save subscription
                  </button>
                </div>
              </form>
            </details>
          </section>
        );
      })}

      <details>
        <summary>Add a shared subscription</summary>
        <form action={createSubscription} className="stack details-body">
          <SubscriptionFields />
          <div>
            <button className="btn" type="submit">
              Add subscription
            </button>
          </div>
        </form>
      </details>
    </main>
  );
}
