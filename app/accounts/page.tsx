import Link from "next/link";
import {
  createStripeAccount,
  removeStripeAccount,
  updateStripeAccount,
} from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";
import { ErrorBanner } from "@/components/forms";
import { listProjects, listStripeAccounts } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [accounts, projects] = await Promise.all([
    listStripeAccounts(),
    listProjects(),
  ]);

  return (
    <main className="page">
      <div>
        <Link href="/" className="back" aria-label="Back to dashboard">
          ←
        </Link>
        <h1>Stripe accounts</h1>
        <p className="muted">
          Read-only keys for pulling revenue. Keys are stored encrypted and
          never shown again after saving — only the masked hint below. Stripe
          is optional; projects without an account simply don’t track revenue.
        </p>
      </div>

      <ErrorBanner message={sp.error} />

      {accounts.length === 0 && (
        <p className="card empty">
          No Stripe accounts yet — add one here, then link projects to it to
          see revenue and profit.
        </p>
      )}

      {accounts.map((account) => {
        const linked = projects.filter(
          (p) => p.stripeAccountId === account.id,
        );
        return (
          <section className="card section" key={account.id}>
            <div className="row">
              <h2 className="grow">{account.label}</h2>
              <form action={removeStripeAccount} className="row">
                <input type="hidden" name="id" value={account.id} />
                <label className="checkbox">
                  <input type="checkbox" name="detach" /> detach projects
                </label>
                <DeleteButton
                  confirmText={`Delete Stripe account "${account.label}"? Linked projects block the delete unless "detach projects" is ticked.`}
                />
              </form>
            </div>
            <p className="muted">
              Key {account.keyHint}
              {account.url && (
                <>
                  {" · "}
                  <a href={account.url} target="_blank" rel="noreferrer">
                    {account.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
                  </a>
                </>
              )}
              {" · "}
              {linked.length === 0
                ? "no projects linked"
                : `linked: ${linked.map((p) => p.name).join(", ")}`}
              {linked.length > 1 &&
                " (shared — every linked project needs a revenue tag)"}
            </p>
            {account.notes && <p className="muted">{account.notes}</p>}
            <details>
              <summary>Edit</summary>
              <form
                action={updateStripeAccount}
                className="stack details-body"
              >
                <input type="hidden" name="id" value={account.id} />
                <div className="field-row">
                  <div className="field">
                    <label>Label</label>
                    <input name="label" defaultValue={account.label} required />
                  </div>
                  <div className="field">
                    <label>Link (this account’s Stripe dashboard)</label>
                    <input
                      name="url"
                      type="url"
                      defaultValue={account.url}
                      placeholder="https://dashboard.stripe.com/…"
                    />
                  </div>
                  <div className="field">
                    <label>
                      Replace secret key (leave blank to keep current)
                    </label>
                    <input
                      name="secretKey"
                      type="password"
                      autoComplete="off"
                      placeholder={account.keyHint}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Notes</label>
                  <textarea name="notes" defaultValue={account.notes} />
                </div>
                <div>
                  <button className="btn" type="submit">
                    Save account
                  </button>
                </div>
              </form>
            </details>
          </section>
        );
      })}

      <details>
        <summary>Add a Stripe account</summary>
        <form action={createStripeAccount} className="stack details-body">
          <div className="field-row">
            <div className="field">
              <label>Label</label>
              <input name="label" placeholder="Business" required />
            </div>
            <div className="field">
              <label>Link (this account’s Stripe dashboard, optional)</label>
              <input
                name="url"
                type="url"
                placeholder="https://dashboard.stripe.com/…"
              />
            </div>
            <div className="field">
              <label>Secret key (read-only/restricted key recommended)</label>
              <input
                name="secretKey"
                type="password"
                autoComplete="off"
                placeholder="rk_live_…"
                required
              />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea name="notes" />
          </div>
          <div>
            <button className="btn" type="submit">
              Add account
            </button>
          </div>
        </form>
      </details>
    </main>
  );
}
