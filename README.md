<img src="public/logo.svg" alt="" width="56" height="56">

# Project Ledger

A personal dashboard for tracking the tools, recurring costs, and optional Stripe revenue behind your coding projects.

Building a project usually means managing more than its code. Hosting, databases, AI tools, domains, and shared subscriptions all contribute to its cost. Project Ledger brings those details together so you can see what each project uses, what it costs to run, and how revenue compares with spend.

Built with **Next.js, TypeScript, Upstash Redis, and Auth.js**, with a small dependency footprint and a server-first architecture.

## Features

- **Project dashboard:** Compare cost, revenue, and profit across daily, monthly, yearly, year-to-date, and all-time views. See spend broken down by category.
- **Service tracking:** Keep each project's service links, login methods, billing cycles, renewal dates, status, and notes in one place. Reorder service tabs with drag and drop.
- **Shared subscriptions:** Allocate one subscription across the projects that use it. Splits update automatically as projects opt in or out, without counting a project twice.
- **Optional Stripe revenue:** Connect multiple Stripe accounts and attribute payments to projects. Spend tracking works independently of Stripe.
- **Renewals and reminders:** Surface upcoming renewals and dated project reminders in a shared dashboard view. Overdue reminders stay visible until removed.
- **Notes board:** Organize tagged notes with filtering, drag reordering, keyboard move controls, expandable cards, a full-screen editor, and clipboard copying.

## How the numbers work

**Costs are projections from recurring rates. Revenue comes from actual Stripe transactions.** The dashboard keeps that distinction visible when comparing the two.

| Measure | Calculation |
| --- | --- |
| Monthly cost | Monthly rates plus annual rates normalized to a rounded monthly amount |
| Daily cost | Monthly cost divided by 30 |
| Yearly cost | Monthly cost multiplied by 12 |
| Year-to-date cost | Each item's monthly rate multiplied by its billed months this year, using its billing anchor when available |
| All-time cost | Each item's monthly rate multiplied by its months since billing began; annualized when no anchor is set |
| Revenue | Succeeded USD Stripe charges minus refunds in the selected window |
| Profit | Revenue minus projected cost |

All money is stored and calculated in **integer cents**. Shared subscription splits distribute remainder cents so their allocations add up exactly to the normalized monthly bill. A $20 monthly subscription shared by three projects becomes $6.67, $6.67, and $6.66.

Paused and cancelled services and subscriptions are excluded from cost totals. Shared subscriptions are allocated only to projects with an active service referencing them. Dashboard cost totals are built from the same per-project figures shown in the project breakdown.

Stripe processing fees are excluded. A project with its own Stripe account receives that account's revenue. Projects sharing an account use `metadata.project` on the Charge, falling back to the PaymentIntent. Unmatched payments appear as unattributed revenue and remain included in dashboard totals.

Calendar boundaries use `America/New_York`.

## Architecture

| Layer | Implementation |
| --- | --- |
| Application | Next.js App Router, React, and TypeScript |
| Reads | Server components load records from Redis and compute reports in memory |
| Writes | Session-guarded server actions validate inputs and maintain relationships |
| Storage | Upstash Redis with JSON records and sets of entity IDs |
| Authentication | Auth.js v5 with GitHub OAuth and a single allowed GitHub user ID |
| Revenue | Server-side, read-only Stripe API calls |
| Interface | Plain CSS, custom properties, and Plus Jakarta Sans |

The data set is intentionally small, so derived totals and subscription splits are computed on reads rather than stored. Relationship rules live in the server actions: deleting a project removes its services, and deleting a referenced subscription or Stripe account requires an explicit detach or is blocked.

Forms use native server actions. Client components handle interactions such as confirmation, reordering, and the notes editor. Redis credentials and Stripe API calls stay on the server. The interface uses plain CSS without a component kit, CSS framework, ORM, or external state library.

## Run locally

You will need Node.js and npm, an Upstash Redis database, and a GitHub OAuth app. Stripe is optional.

```bash
git clone https://github.com/joseph-kelly1/project-dashboard.git
cd project-dashboard
npm ci
cp .env.example .env.local
```

Fill in `.env.local` with your own credentials:

| Variable | Purpose |
| --- | --- |
| `KV_REST_API_URL` | Upstash Redis REST endpoint |
| `KV_REST_API_TOKEN` | Upstash Redis REST token |
| `AUTH_SECRET` | Auth.js session secret |
| `AUTH_GITHUB_ID` | GitHub OAuth app client ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth app client secret |
| `ALLOWED_GITHUB_ID` | Numeric GitHub user ID allowed to sign in |
| `ENCRYPTION_SECRET` | Secret used to encrypt stored Stripe keys |

Set the local OAuth callback URL to `http://localhost:3000/api/auth/callback/github`. Generate `AUTH_SECRET` and `ENCRYPTION_SECRET` independently with `openssl rand -base64 32`. Find your numeric GitHub ID in the `id` field at `https://api.github.com/users/<your-username>`.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign in with the GitHub account configured in `ALLOWED_GITHUB_ID`. Add projects, services, and subscriptions through the app. Add Stripe accounts later if you want revenue tracking; their keys are entered in the app rather than environment variables.

If local development uses your production Redis credentials, local edits affect production data. Use a separate Redis database for an isolated development environment.

See [SETUP.md](SETUP.md) for the complete OAuth, Upstash, Vercel, and Stripe setup checklist. Production OAuth uses `https://<your-domain>/api/auth/callback/github`; register a separate OAuth app for local development.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production build |
| `npm test` | Run assert-based checks for money calculations, renewal dates, amount parsing, and encryption |

## Authentication and secrets

Each deployment is designed for **one owner**. The allowed GitHub identity is configured through `ALLOWED_GITHUB_ID`, with no owner ID hardcoded in source. Sign-in fails closed when the value is missing or does not match.

Stripe keys are encrypted with AES-256-GCM before storage and decrypted on the server when fetching revenue. Saved keys are never redisplayed; the UI shows a masked hint. Use restricted Stripe keys with read access to Charges and PaymentIntents.

Keep `.env.local` out of version control and preserve `ENCRYPTION_SECRET`. Changing that secret requires re-entering stored Stripe keys.

## Project structure

```text
app/                  Pages, auth route, server actions, and CSS
components/           Forms, selectors, service tabs, and notes board
lib/                  Data access, money calculations, Stripe, and encryption
auth.ts               GitHub provider and single-user sign-in rule
middleware.ts         Session gate for protected routes
```

- [BUILD_BRIEF.md](BUILD_BRIEF.md): Functional specification and calculation rules.
- [SETUP.md](SETUP.md): Deployment and configuration walkthrough.
- [DESIGN.md](DESIGN.md): Design tokens and core component guidance.
