# Build brief — Project Ledger

A personal, single-user dashboard for tracking my coding projects: the services each one uses, what I pay for them, what I earn through Stripe, and the resulting profit — both per project and across everything.

**Read `DESIGN.md` for all visual/styling direction. This document is the functional spec only. Where the two overlap, `DESIGN.md` wins on look, this file wins on behavior.**

**`DESIGN.md` scope:** it is a design-token extraction from a marketing site. Use its tokens (colors, type scale, radii, spacing, elevation) and core components (cards, pill buttons, tabs, badges, inputs, tables); ignore the marketing-specific sections (hero bands, pricing tiers, course catalogs, promo banners, logo walls, footer mega-grid). This is a dashboard, not a landing page. Its display font (Euclid Circular A) is commercially licensed — substitute **Plus Jakarta Sans** loaded via `next/font` (Google Fonts), keeping the type scale as specified.

---

## Stack (already decided — do not substitute)

- **Framework:** Next.js (App Router), TypeScript.
- **Hosting:** Vercel (I'll deploy; you just build for it).
- **Storage:** Upstash Redis, accessed via the `@upstash/redis` client. Credentials come from `KV_REST_API_URL` and `KV_REST_API_TOKEN` (auto-injected by the Vercel Marketplace integration). Do not use any other DB.
- **Auth:** Auth.js **v5** (NextAuth) with the GitHub provider only, locked to a single allowed GitHub user (see Auth section).
- **Payments data:** Stripe, read-only and **optional** — this is primarily a spend/tool tracker; revenue appears only for projects I choose to link to a Stripe account. Secret keys are entered **in the app**, stored in Redis encrypted (AES-256-GCM) using a single `ENCRYPTION_SECRET` env var set once at setup. All Stripe calls happen server-side only — keys never reach the browser, and API responses never echo a stored key back (masked to last 4).

**One-time setup goal:** the env vars are a small fixed set configured once at deploy (KV, auth, `ALLOWED_GITHUB_ID`, `ENCRYPTION_SECRET`). Everything after that — projects, services, subscriptions, Stripe accounts and their keys — is managed entirely in-app. Never a per-account env var, never a code change to add data.

Do not add a heavier ORM, a relational DB, a state library, or a component kit unless `DESIGN.md` calls for it. Keep dependencies lean.

---

## Core concepts / data model

This app is relational data on a flat key-value store, so **you own all the relationship logic in code.** Redis will not enforce anything. Store each entity as a JSON value under a namespaced key, and keep index keys (sets or lists of IDs) so you can enumerate each entity type.

### Entities

**Project**
- `id`, `name`, `notes`
- `url` — optional link to where the project itself is hosted/deployed
- `stripeAccountId` — references a StripeAccount (many projects → one account). Optional (a project may have no revenue yet).
- `revenueTag` — optional string. When a project *shares* a Stripe account with other projects, this is the metadata tag used to attribute payments to it (see Revenue attribution). Null when the project owns its account outright. **Required (validated on write) whenever two or more projects point at the same Stripe account.**
- `createdAt`

**Service** (the tabs inside a project)
- `id`, `projectId`, `name`
- `url` — links to this project's own dashboard for that service. **Always project-specific, even when the cost comes from a shared subscription.** The link and the cost are fully decoupled.
- `loginMethod` — one of `google` | `github` | `other`
- `loginOther` — free text, used only when `loginMethod === 'other'`
- `category` — one of `hosting` | `database` | `auth` | `email` | `ai` | `analytics` | `domain` | `other`
- `status` — one of `active` | `paused` | `cancelled`. Paused/cancelled services are excluded from all cost totals but stay on record.
- `renewalDate` — optional ISO date. A service with a shared cost and no own renewal date inherits the subscription's renewal date, derived live at read time (never copied/stored).
- `cost` — a tagged union:
  - `{ type: 'specific', amount: number, cycle: 'monthly' | 'annual' }` — a cost this service alone bears
  - `{ type: 'shared', subscriptionId: string }` — this service draws its cost as a split slice of a SharedSubscription. Carries **no amount of its own**; the amount is derived.
- `notes`

**SharedSubscription** (the "general page" items — Vercel, Railway, etc.)
- `id`, `name`, `url`, `notes`
- `cost` — `{ amount: number, cycle: 'monthly' | 'annual' }`
- `renewalDate` — optional ISO date
- `status` — `active` | `paused` | `cancelled` (paused/cancelled excluded from totals)
- **Cost-only entity.** It does not link into any project; projects opt into its *price* via a service's `cost.type === 'shared'`.

**StripeAccount**
- `id`, `label` (e.g. "Business", "Freelance")
- `encryptedKey` — the account's secret key, pasted into the app and stored encrypted (AES-256-GCM, key derived from `ENCRYPTION_SECRET`). Write-only from the UI's perspective: forms accept a new/replacement key; reads return only `keyHint`. Decrypt server-side at Stripe call time only.
- `keyHint` — last 4 characters of the key, stored at write time for masked display (e.g. `sk_live_…4f2b`)
- `notes`

### Suggested key scheme
```
project:<id>            -> Project JSON
service:<id>            -> Service JSON
subscription:<id>       -> SharedSubscription JSON
stripeAccount:<id>      -> StripeAccount JSON
index:projects          -> set of project ids
index:subscriptions     -> set of subscription ids
index:stripeAccounts    -> set of stripe account ids
project:<id>:services   -> set of service ids for that project
```
Data volume is tiny (a few projects, dozens of services). Loading everything into memory in a server route and computing there is fine and preferred over clever Redis-side logic.

---

## The money math (get this exactly right)

All figures are USD. **Store and compute all money in integer cents; format to dollars only at render** — that is how "no floating-point artifacts" is enforced. **All calendar boundaries ("today", current month, Jan 1) are computed in `America/New_York`**, not server/UTC time.

Everything is driven by a **time-window selector** with options: `daily` | `monthly` | `yearly` | `ytd` | `all-time`. Cost and revenue behave differently under it:

### Costs — projected from a recurring rate
Stored costs are recurring rates. Normalize every cost to a monthly figure first, then project to the selected window:
- `daily` = monthly ÷ 30 (use 30; document the choice)
- `monthly` = monthly
- `yearly` = monthly × 12
- `ytd` = monthly × (number of months elapsed in the current calendar year, counting the current month)
- `all-time` = show the annualized (`yearly`) value with a small label noting it's annualized. Costs have no real "all-time" because they're rates, not history.

Annual-cycle costs convert to monthly by ÷ 12 before projecting.

**Shared subscription split — opt-in projects only.** A shared subscription's cost is divided **only among projects that have at least one active service referencing it.** A project that doesn't reference it bears $0 and is *not* in the divisor.
- Denominator = count of distinct projects with ≥1 `active` service whose `cost` is `{ type: 'shared', subscriptionId: <this sub> }`.
- Count each project **once**, even if it has multiple services pointing at the same subscription.
- If a subscription is `paused`/`cancelled`, or has zero opt-in projects, its allocated cost is $0 everywhere.
- Example: Railway $20/mo, referenced by 2 projects → $10 each. A 3rd project not referencing it → $0. Add a Railway service to the 3rd → rebalances to $6.67 each.

### Revenue — summed from real Stripe transactions, per project
**Revenue = succeeded charges minus refunds** in the window. Stripe processing fees are ignored (revenue is "what customers paid me", not bank deposits).

Revenue is never split. It's attributed per project:
- If a project is the **only** project pointing at its `stripeAccountId`, the whole account's revenue for the window maps to it (`revenueTag` not required).
- If a project **shares** a Stripe account (two or more projects point at the same `stripeAccountId`), **every project on that account must have a `revenueTag`** — enforce as write-time validation, including on the write that adds the second project to an account. A shared project's revenue is only the payments carrying its tag.
- **Tag matching field: `metadata.project`** — read it from the Charge, falling back to the parent PaymentIntent's `metadata.project` if the charge has none. This is the exact key I'll use when tagging payments.
- Payments on a shared account matching **no** project's tag surface as a single **"unattributed"** line on the home dashboard — included in total revenue, assigned to no project. This keeps totals reconciling exactly.
- The time window **filters** Stripe by transaction date: `daily` = today, `monthly` = current calendar month, `yearly` = current calendar year, `ytd` = Jan 1 → now (same as yearly for a calendar year; still implement both keys), `all-time` = no date bound.

**Cost is a projection, revenue is a fact.** "Daily cost" is a rate divided down; "daily revenue" is actual money received today. Make this distinction clear in the UI where it matters (a small label/tooltip is enough — see `DESIGN.md`).

### Profit
`profit = revenue − cost` at the selected window, computed per project and in aggregate.

### Home dashboard totals — must reconcile
- Total cost = sum of all **actual bills** (each active specific service once; each active shared subscription once at full price), projected to the window. This equals the sum of per-project cost slices by construction — verify they tie out.
- Total revenue = sum of per-project revenue **plus the unattributed line** (shared-account payments matching no tag). Per-project slices + unattributed must equal what Stripe reports per account.
- Total profit = total revenue − total cost.
Both levels must agree under every window. Write the aggregation so slices provably sum to bills (don't compute them by two independent paths that could drift).

All math is in integer cents (see above); format to dollars at render.

---

## Auth — single-user lock

- Auth.js with the **GitHub provider only**.
- In the `signIn` callback, compare the authenticated GitHub **numeric user ID** against a single hardcoded allowed ID (I'll provide it; put it in an env var `ALLOWED_GITHUB_ID` and read it there — do not hardcode a literal in source). Return `false` for any other identity so no session is created.
- Match on the **numeric ID**, not the username (usernames can change/be reclaimed).
- Every page and every API route must require a valid session. Add middleware or a server-side guard so there is no unauthenticated path to data. An unauthenticated request to any API route returns 401.
- Auth.js **v5** env naming: `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`. `AUTH_URL` is inferred on Vercel; set it only where needed (e.g. local dev). Include all in the env checklist.

---

## Stripe integration

- All Stripe access is **server-side, read-only** (fetching charges/payments for revenue). Never expose a key to the client; never write to Stripe.
- Resolve each account's key at call time by decrypting `stripeAccount.encryptedKey` server-side. If decryption fails or Stripe rejects the key, fail gracefully: return that account's revenue as unavailable with a clear message, don't crash the dashboard.
- **Stripe is optional at every level.** Zero configured accounts, or a project with no `stripeAccountId`, is a normal, permanent state — not an incomplete one. Display untracked revenue as "—" (not tracked) rather than $0; it contributes 0 to totals and profit math. No nagging prompts to connect Stripe.
- Provide a single server function like `fetchRevenue(project, window)` that: looks up the project's StripeAccount, resolves the key, pulls succeeded charges minus refunds in the window's date range, and if the project shares the account, filters to its `revenueTag` via `metadata.project` (charge first, then parent PaymentIntent).
- Handle the "project has no `stripeAccountId`" case as untracked (displayed "—", counted as 0), not an error.
- Cache/rate-limit sensibly — this is a personal tool checked occasionally, so simple per-request fetching is fine; don't build polling.

---

## Screens

Follow `DESIGN.md` for layout and styling. Functionally, three areas:

1. **Home dashboard** — the time-window selector (drives everything on the page); global metric cards for total cost, total revenue, total profit; a per-project profit list/table; a spend-by-category breakdown; and a section for shared subscriptions showing each one's current per-project split live. Surface anything renewing in the next 30 days.
2. **Project view** — project header with its own cost/revenue/profit for the selected window; service tabs, each showing the full service record (name, project-specific link, login method, category, status, billing cycle, renewal date, cost source, notes). CRUD for services here.
3. **Shared subscriptions / general page** — CRUD for shared subscriptions; each shows which projects currently opt into it and the resulting per-project slice.

Also need lightweight CRUD for **projects** and for **Stripe accounts** (accounts: label + secret key pasted directly into the form; afterwards the key shows only as its masked hint, replaceable but never re-displayed). Sentence case, plain-language labels per `DESIGN.md`.

---

## Data integrity (you must enforce — Redis won't)

- **Deleting a SharedSubscription** that services still reference: block the delete and tell me which projects/services still use it, OR provide an explicit "detach all and delete" that first switches those services to `{ type: 'specific', amount: 0 }` and flags them for me to fix. Do **not** leave services pointing at a dead subscription ID.
- **Deleting a StripeAccount** referenced by projects: same pattern — block with a list, or detach (`stripeAccountId = null`) explicitly.
- **Deleting a Project**: cascade-delete its services (and remove them from `project:<id>:services` and any indexes). Removing the project must also drop it from every shared subscription's effective split (recompute on read, so this is automatic if splits are always computed live — prefer computing splits live rather than storing them).
- Prefer **computing splits and totals live on every read** from current data, rather than persisting derived numbers that can go stale.
- Validate inputs on write in the API routes (positive amounts, valid enum values, valid dates); reject bad writes with a clear error rather than storing garbage.

---

## Quality bar

- TypeScript throughout; type the entities and the cost tagged-union properly.
- Server routes for all data access; client never talks to Redis or Stripe directly.
- Handle empty states (no projects yet, no services, no Stripe account) as inviting prompts, not errors — see `DESIGN.md` copy guidance.
- Responsive and keyboard-accessible to a reasonable floor.
- Produce a **`.env.example`** listing every environment variable the app expects, each with a one-line comment on what it is and where it comes from. This is my master checklist for populating Vercel.

---

## Final deliverable — SETUP CHECKLIST (do this last)

When the build is finished, **output a clear, ordered checklist** (in the terminal and as a `SETUP.md` file in the repo) telling me exactly what I need to do to get this running and deployed. It should cover, in the right order, at least:

1. Every environment variable to set (matching `.env.example`), what each is, and where to get its value:
   - `KV_REST_API_URL`, `KV_REST_API_TOKEN` — from provisioning Upstash Redis via the Vercel Marketplace
   - `AUTH_SECRET` — how to generate it
   - `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` — from registering the GitHub OAuth app
   - `ALLOWED_GITHUB_ID` — my numeric GitHub user ID (and how to find it)
   - `ENCRYPTION_SECRET` — how to generate it; encrypts Stripe keys stored in Redis. Set once and never rotate casually — rotating it invalidates stored keys (they'd need re-entering in-app).

   This is the complete, fixed set — no further env vars ever, regardless of how many Stripe accounts I add in-app.
2. Registering the GitHub OAuth app: where, the exact callback URL(s) to use (local + production), and where the client ID/secret go.
3. Provisioning Upstash Redis through the Vercel Marketplace (so the KV env vars auto-inject).
4. Creating the Vercel project / linking the repo, and where to paste each env var.
5. How to tag Stripe payments with metadata so shared-account revenue attributes correctly — the key is `metadata.project` (on the Charge, or its parent PaymentIntent); include a concrete example.
6. Anything else I must do by hand that the code can't do itself.

Make the checklist specific and actionable — real values/paths, not "configure your environment." Assume I'll follow it step by step after you're done.
