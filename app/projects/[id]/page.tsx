import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createService,
  removeProject,
  removeService,
  updateProject,
  updateService,
} from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";
import {
  ErrorBanner,
  ProjectFields,
  ServiceFields,
  StatusBadge,
} from "@/components/forms";
import { WindowSelector } from "@/components/window-selector";
import { loadAll } from "@/lib/data";
import {
  computeCosts,
  costNote,
  fmtDate,
  fmtUSD,
  monthlyCents,
  parseWindow,
  projectMonthlyCost,
  revenueNote,
} from "@/lib/money";
import { computeRevenue } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const win = parseWindow(sp.window);
  const now = new Date();

  const { projects, servicesByProject, subscriptions, stripeAccounts } =
    await loadAll();
  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  const services = servicesByProject.get(id) ?? [];
  const selected =
    services.find((s) => s.id === sp.service) ?? services[0] ?? null;

  // Splits and attribution depend on every project, so compute across all.
  const costs = computeCosts(projects, servicesByProject, subscriptions);
  const revenue = await computeRevenue(projects, stripeAccounts, win, now);

  const cost = projectMonthlyCost(
    costs.perProjectMonthly.get(id) ?? 0,
    win,
    now,
  );
  const rev = revenue.perProject.get(id) ?? { state: "untracked" as const };
  const profit = rev.state === "ok" ? rev.cents - cost : -cost;
  const subById = new Map(subscriptions.map((s) => [s.id, s]));
  const account = stripeAccounts.find((a) => a.id === project.stripeAccountId);

  const tabParams: Record<string, string> = { window: win };
  if (selected) tabParams.service = selected.id;

  return (
    <main className="page">
      <div className="row">
        <div className="grow">
          <p className="muted">
            <Link href="/">Dashboard</Link> / {project.name}
          </p>
          <h1>
            {project.name}
            {project.url && (
              <>
                {" "}
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 14, fontWeight: 500 }}
                >
                  {project.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
                </a>
              </>
            )}
          </h1>
          {project.notes && <p className="muted">{project.notes}</p>}
          <p className="muted">
            {account
              ? `Revenue from Stripe account “${account.label}”${project.revenueTag ? ` · tag “${project.revenueTag}”` : ""}`
              : "Revenue not tracked — link a Stripe account to see it here."}
          </p>
        </div>
        <WindowSelector current={win} basePath={`/projects/${id}`} params={selected ? { service: selected.id } : {}} />
      </div>

      <ErrorBanner message={sp.error} />
      {rev.state === "unavailable" && (
        <p className="banner-error">Stripe revenue unavailable: {rev.message}</p>
      )}

      <div className="card-grid">
        <div className="card">
          <span className="eyebrow">Cost</span>
          <div className="metric-value">{fmtUSD(cost)}</div>
          <div className="metric-note">{costNote(win)}</div>
        </div>
        <div className="card">
          <span className="eyebrow">Revenue</span>
          <div className="metric-value">
            {rev.state === "ok" ? fmtUSD(rev.cents) : "—"}
          </div>
          <div className="metric-note">
            {rev.state === "ok"
              ? revenueNote(win)
              : rev.state === "untracked"
                ? "not tracked"
                : "unavailable"}
          </div>
        </div>
        <div className="card">
          <span className="eyebrow">Profit</span>
          <div className={`metric-value ${profit < 0 ? "neg" : "pos"}`}>
            {rev.state === "unavailable" ? "—" : fmtUSD(profit)}
          </div>
          <div className="metric-note">revenue − cost for this window</div>
        </div>
      </div>

      <section className="card section">
        <h2>Services</h2>
        {services.length === 0 ? (
          <p className="empty">
            No services yet — add the tools this project runs on (hosting,
            database, domain…) and their costs.
          </p>
        ) : (
          <>
            <div className="tabs">
              {services.map((s) => (
                <Link
                  key={s.id}
                  href={`/projects/${id}?window=${win}&service=${s.id}`}
                  scroll={false}
                  aria-current={selected?.id === s.id ? "true" : undefined}
                >
                  {s.name}
                </Link>
              ))}
            </div>
            {selected && (
              <div className="section" key={selected.id}>
                <div className="row">
                  <h3 className="grow">
                    {selected.name} <StatusBadge status={selected.status} />{" "}
                    <span className="badge badge-category">
                      {cap(selected.category)}
                    </span>
                  </h3>
                  <form action={removeService}>
                    <input type="hidden" name="id" value={selected.id} />
                    <DeleteButton
                      confirmText={`Delete service "${selected.name}"?`}
                    />
                  </form>
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td className="muted">Link</td>
                      <td>
                        {selected.url ? (
                          <a href={selected.url} target="_blank" rel="noreferrer">
                            {selected.url}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Login</td>
                      <td>
                        {cap(selected.loginMethod)}
                        {selected.loginMethod === "other" && selected.loginOther
                          ? ` — ${selected.loginOther}`
                          : ""}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Cost</td>
                      <td>
                        {selected.cost.type === "specific"
                          ? `${fmtUSD(selected.cost.amountCents)} ${selected.cost.cycle} (${fmtUSD(monthlyCents(selected.cost.amountCents, selected.cost.cycle))}/mo)`
                          : `Shared slice of “${subById.get(selected.cost.subscriptionId)?.name ?? "unknown"}”`}
                      </td>
                    </tr>
                    <tr>
                      <td className="muted">Renewal</td>
                      <td>
                        {(() => {
                          // Shared costs inherit the subscription's renewal
                          // date live unless the service sets its own.
                          const inherited =
                            selected.cost.type === "shared" &&
                            !selected.renewalDate
                              ? (subById.get(selected.cost.subscriptionId)
                                  ?.renewalDate ?? null)
                              : null;
                          const date = selected.renewalDate ?? inherited;
                          if (!date) return "—";
                          return inherited
                            ? `${fmtDate(date)} (from subscription)`
                            : fmtDate(date);
                        })()}
                      </td>
                    </tr>
                    {selected.notes && (
                      <tr>
                        <td className="muted">Notes</td>
                        <td>{selected.notes}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <details>
                  <summary>Edit this service</summary>
                  <form action={updateService} className="stack details-body">
                    <input type="hidden" name="id" value={selected.id} />
                    <ServiceFields
                      service={selected}
                      subscriptions={subscriptions}
                    />
                    <div>
                      <button className="btn" type="submit">
                        Save service
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            )}
          </>
        )}
        <details>
          <summary>Add a service</summary>
          <form action={createService} className="stack details-body">
            <input type="hidden" name="projectId" value={id} />
            <ServiceFields subscriptions={subscriptions} />
            <div>
              <button className="btn" type="submit">
                Add service
              </button>
            </div>
          </form>
        </details>
      </section>

      <section className="card section">
        <h2>Project settings</h2>
        <form action={updateProject} className="stack">
          <input type="hidden" name="id" value={id} />
          <ProjectFields project={project} accounts={stripeAccounts} />
          <div className="row">
            <button className="btn" type="submit">
              Save project
            </button>
          </div>
        </form>
        <form action={removeProject}>
          <input type="hidden" name="id" value={id} />
          <DeleteButton
            label="Delete project"
            confirmText={`Delete "${project.name}" and all ${services.length} of its services? This can't be undone.`}
          />
        </form>
      </section>
    </main>
  );
}
