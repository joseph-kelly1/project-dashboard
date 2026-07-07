import type {
  Project,
  Service,
  SharedSubscription,
  Status,
  StripeAccount,
} from "@/lib/types";
import { CATEGORIES, CYCLES, LOGIN_METHODS, STATUSES } from "@/lib/types";

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="banner-error">{message}</p>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ProjectFields({
  project,
  accounts,
}: {
  project?: Project;
  accounts: StripeAccount[];
}) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label htmlFor={`p-name-${project?.id ?? "new"}`}>Name</label>
          <input
            id={`p-name-${project?.id ?? "new"}`}
            name="name"
            defaultValue={project?.name}
            required
          />
        </div>
        <div className="field">
          <label>Stripe account (optional)</label>
          <select name="stripeAccountId" defaultValue={project?.stripeAccountId ?? ""}>
            <option value="">None — revenue not tracked</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Revenue tag (required when the account is shared)</label>
          <input
            name="revenueTag"
            defaultValue={project?.revenueTag ?? ""}
            placeholder="matches metadata.project on payments"
          />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea name="notes" defaultValue={project?.notes} />
      </div>
    </>
  );
}

export function ServiceFields({
  service,
  subscriptions,
}: {
  service?: Service;
  subscriptions: SharedSubscription[];
}) {
  const cost = service?.cost;
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label>Name</label>
          <input name="name" defaultValue={service?.name} required />
        </div>
        <div className="field">
          <label>Link (this project’s dashboard on the service)</label>
          <input
            name="url"
            type="url"
            defaultValue={service?.url}
            placeholder="https://…"
          />
        </div>
        <div className="field">
          <label>Category</label>
          <select name="category" defaultValue={service?.category ?? "other"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {cap(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select name="status" defaultValue={service?.status ?? "active"}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {cap(s)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Login method</label>
          <select name="loginMethod" defaultValue={service?.loginMethod ?? "github"}>
            {LOGIN_METHODS.map((m) => (
              <option key={m} value={m}>
                {cap(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Login details (only if “Other”)</label>
          <input name="loginOther" defaultValue={service?.loginOther} />
        </div>
        <div className="field">
          <label>Renewal date (optional)</label>
          <input
            name="renewalDate"
            type="date"
            defaultValue={service?.renewalDate ?? ""}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Cost source</label>
          <select
            name="costType"
            defaultValue={cost?.type ?? "specific"}
          >
            <option value="specific">This service’s own cost</option>
            <option value="shared">Slice of a shared subscription</option>
          </select>
        </div>
        <div className="field">
          <label>Amount in $ (own cost only)</label>
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={
              cost?.type === "specific" ? (cost.amountCents / 100).toFixed(2) : ""
            }
            placeholder="12.50"
          />
        </div>
        <div className="field">
          <label>Billing cycle (own cost only)</label>
          <select
            name="cycle"
            defaultValue={cost?.type === "specific" ? cost.cycle : "monthly"}
          >
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {cap(c)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Shared subscription (shared slice only)</label>
          <select
            name="subscriptionId"
            defaultValue={cost?.type === "shared" ? cost.subscriptionId : ""}
          >
            <option value="">—</option>
            {subscriptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea name="notes" defaultValue={service?.notes} />
      </div>
    </>
  );
}

export function SubscriptionFields({ sub }: { sub?: SharedSubscription }) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label>Name</label>
          <input name="name" defaultValue={sub?.name} required />
        </div>
        <div className="field">
          <label>Link</label>
          <input name="url" type="url" defaultValue={sub?.url} placeholder="https://…" />
        </div>
        <div className="field">
          <label>Amount in $</label>
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={sub ? (sub.amountCents / 100).toFixed(2) : ""}
            placeholder="20.00"
            required
          />
        </div>
        <div className="field">
          <label>Billing cycle</label>
          <select name="cycle" defaultValue={sub?.cycle ?? "monthly"}>
            {CYCLES.map((c) => (
              <option key={c} value={c}>
                {cap(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label>Status</label>
          <select name="status" defaultValue={sub?.status ?? "active"}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {cap(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Renewal date (optional)</label>
          <input name="renewalDate" type="date" defaultValue={sub?.renewalDate ?? ""} />
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea name="notes" defaultValue={sub?.notes} />
      </div>
    </>
  );
}
