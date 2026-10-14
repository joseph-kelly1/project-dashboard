# Project Ledger

Personal single-user dashboard: tracks coding projects, the services/tools they use, spend, Stripe revenue, and profit. Spend/tool tracking is the primary job; Stripe is optional per project.

`docs/BUILD_BRIEF.md` is the functional spec (kept current - update it when behavior changes). `docs/DESIGN.md` supplies design tokens only (colors/type/radii/spacing + core components). `docs/SETUP.md` is the owner's deploy checklist.

## Stack

Next.js App Router + TypeScript. Upstash Redis (`@upstash/redis`) for storage, Auth.js v5 GitHub-only auth, `stripe` read-only. Plain CSS in `src/app/globals.css` (tokens as custom properties, font Plus Jakarta Sans). **No ORM, no state library, no component kit, no CSS framework - keep it that way.**

## Commands

- `npm run dev` / `npm run build`
- `npm test` - assert-based money-math checks (`src/lib/money.test.ts`, runs via tsx). Extend it when touching `src/lib/money.ts`.

## Architecture

- Reads: server components call `src/lib/data.ts` (`loadAll()` - data is tiny, load everything, compute in memory).
- Writes: server actions in `src/app/actions.ts` only. Every action session-guards; `ValidationError` surfaces as `?error=` redirect, rendered by `ErrorBanner`.
- Client never touches Redis/Stripe. Client components handle delete confirmation, service reordering, and the notes board. Keep data access server-side.
- Auth: `src/auth.ts` + `src/middleware.ts` gate everything except `/signin`, `/api/auth`, `icon.svg`, `logo.svg`. Sign-in locked to `ALLOWED_GITHUB_ID` (numeric ID, fails closed).
- Redis is a dumb KV store - **all relationship integrity lives in `src/app/actions.ts`** (cascade project delete, block-or-detach for subscriptions/accounts, shared-account revenue-tag rule). Key scheme documented in `src/lib/data.ts`.

## Money math invariants (src/lib/money.ts - don't break these)

- All money is **integer cents**; dollars only at render (`fmtUSD`).
- All calendar boundaries in **America/New_York** (`nyParts`, `windowStart`).
- Cost is a projection of recurring rates; revenue is actual Stripe charges (succeeded, USD, minus refunds). Never conflate.
- Shared-subscription splits: floor + remainder distribution - slices always sum exactly to the bill. Project counted once per sub regardless of service count; paused/cancelled excluded.
- Totals reconcile by construction: single computation path (totals = sum of per-project figures), never two independent calculations.
- `renewalDate` is an **anchor** (first payment date), not a one-shot: renewals roll forward by cycle (`nextRenewal`), and it drives per-item YTD (`ytdMonths`) and all-time (`allTimeMonths`) cost aggregation. No anchor → fallback: elapsed months this year (ytd) / annualized (all-time).
- Revenue attribution: sole project on an account owns all its revenue; shared account requires `revenueTag` on every project (matches `metadata.project` on Charge, falling back to PaymentIntent); non-matching payments = "unattributed" line.

## Security

- Stripe secret keys: pasted in-app, stored AES-256-GCM encrypted (`src/lib/crypto.ts`, `ENCRYPTION_SECRET`), write-only - never returned to the client, only `keyHint`. Keep it that way in any new endpoint/action.
- Env vars are a fixed one-time set (see `.env.example`) - adding data of any kind must never require a new env var or code change.

## Conventions

- Sentence case labels, inviting empty states (not errors).
- Forms are native `<form action={serverAction}>` with `<details>` for add/edit; no client form state.
- In-page tab links (window selector, service tabs) use `scroll={false}`.
- New window/entity display: check `projectCostForWindow`/`categoryCostForWindow` - ytd and all-time come from per-item report fields, other windows are uniform factors on monthly.
