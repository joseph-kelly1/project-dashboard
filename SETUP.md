# Setup checklist — Project Ledger

Follow in order. After step 6 you never touch env vars or code again —
projects, services, subscriptions, and Stripe accounts (including their keys)
are all managed inside the app.

## 1. Create the Vercel project

1. Push this repo to GitHub.
2. In Vercel: **Add New → Project**, import the repo. Framework preset:
   Next.js (auto-detected). Deploy once — it will build but the app won't
   work until the env vars below exist. Note your production URL
   (e.g. `https://project-ledger.vercel.app`).

## 2. Provision Upstash Redis (KV vars auto-inject)

1. In the Vercel project: **Storage → Create Database → Upstash (Marketplace)
   → Redis**, any region near you, free tier is plenty.
2. Connect it to the project. This auto-injects `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` — you never paste these by hand.
3. For local dev: copy both values from the Upstash console (REST API
   section) into `.env.local`.

## 3. Register the GitHub OAuth app

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name:** Project Ledger (anything)
   - **Homepage URL:** your production URL
   - **Authorization callback URL:**
     `https://<your-domain>/api/auth/callback/github`
3. Create it, then **Generate a new client secret**.
4. You now have the client ID → `AUTH_GITHUB_ID` and secret →
   `AUTH_GITHUB_SECRET`.
5. For local dev, register a **second** OAuth app with callback
   `http://localhost:3000/api/auth/callback/github` (GitHub OAuth apps allow
   one callback URL each) and put its ID/secret in `.env.local`.

## 4. Find your numeric GitHub ID

Sign-in is locked to one GitHub account, matched by **numeric user ID** —
not username, because usernames can be changed or released and reclaimed by
someone else. The numeric ID is permanent for the life of the account.

Any of these gets you the number:

- **API (easiest):** open
  `https://api.github.com/users/<your-username>` in a browser. The JSON
  response has an `"id"` field near the top, e.g.

  ```json
  {
    "login": "your-username",
    "id": 4830382,
    ...
  }
  ```

  `4830382` is the value you want.

- **gh CLI:** `gh api user --jq .id` (prints the number for the logged-in
  account).

- **Avatar URL:** on any GitHub page while signed in, your avatar image URL
  looks like `https://avatars.githubusercontent.com/u/4830382?v=4` — the
  number after `/u/` is your ID.

Set `ALLOWED_GITHUB_ID` to exactly that number (digits only, no quotes).
The `signIn` callback compares it to the ID GitHub returns during OAuth and
refuses to create a session for anything else — other users see a failed
sign-in, never the app.

Double-check the value: if it's wrong (or empty), **nobody** can sign in,
including you. The lock fails closed by design.

## 5. Set the environment variables

### 5a. Generate the two secrets

On your Mac, run each of these once in a terminal and save both outputs in
your password manager before pasting them anywhere:

```bash
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → ENCRYPTION_SECRET  (run it a second time — do NOT reuse the same value)
```

Each prints a 44-character random string like
`Xk3jP9mQ2vL8nR5tYw7zA1bC4dE6fG0hI2jK4lM6nO8=`. They have different jobs:

- **`AUTH_SECRET`** — signs/encrypts your session cookie (Auth.js). If it
  leaks, someone could forge a session; if you rotate it, you just get
  signed out and sign back in. Low-stakes to rotate.
- **`ENCRYPTION_SECRET`** — encrypts the Stripe secret keys you save in the
  app (AES-256-GCM) before they're written to Redis. If you rotate or lose
  it, every stored Stripe key becomes permanently undecryptable and the app
  will show each account's revenue as "unavailable" until you re-paste the
  keys in **Stripe accounts → Edit**. Data isn't lost — only the keys need
  re-entering — but treat this one as precious.

(No `openssl`? Equivalent: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.)

### 5b. Enter them in Vercel

Vercel dashboard → your project → **Settings** (top tab) → **Environment
Variables** (left sidebar). For each variable below: paste the **Key** and
**Value**, tick **Production** (also tick Preview/Development only if you'll
use Vercel preview deploys — local dev uses `.env.local` instead), then
**Save**.

| Key | Value | Where it came from |
|---|---|---|
| `AUTH_SECRET` | first generated string | step 5a |
| `AUTH_GITHUB_ID` | OAuth app Client ID (e.g. `Ov23liAbCdEf...`) | step 3 |
| `AUTH_GITHUB_SECRET` | OAuth app client secret (shown once when generated) | step 3 |
| `ALLOWED_GITHUB_ID` | your numeric ID, digits only (e.g. `4830382`) | step 4 |
| `ENCRYPTION_SECRET` | second generated string | step 5a |

Do **not** add `KV_REST_API_URL` / `KV_REST_API_TOKEN` by hand — the Upstash
Marketplace integration from step 2 injects them automatically (you'll see
them already listed on this same page, managed by the integration).

`AUTH_URL` is deliberately absent: on Vercel, Auth.js infers the deployment
URL by itself.

Pitfalls:

- Env vars only apply to deployments made **after** saving them — step 6
  (redeploy) is mandatory, not optional.
- No quotes around values; Vercel stores the raw string. A trailing space
  or newline pasted by accident will break auth in confusing ways.
- If the GitHub client secret is lost, generate a new one in the OAuth app
  and update `AUTH_GITHUB_SECRET` — the old one stops working immediately.

### 5c. Local development (`.env.local`)

For running `npm run dev` locally, create `.env.local` in the repo root
(never committed — it's gitignored):

```bash
cp .env.example .env.local
```

Then fill in every value:

- `KV_REST_API_URL` / `KV_REST_API_TOKEN` — Upstash console → your database
  → **REST API** section → copy `UPSTASH_REDIS_REST_URL` and
  `UPSTASH_REDIS_REST_TOKEN` values. Note: local dev talks to the **same
  Redis** as production — there is no separate staging store. Fine for a
  personal tool; just remember edits made locally are real.
- `AUTH_SECRET` / `ENCRYPTION_SECRET` — reuse the same values as production
  (required for `ENCRYPTION_SECRET`, or locally-saved Stripe keys and
  production-saved ones can't decrypt each other's data).
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — from the **second** OAuth app
  (the localhost one, step 3.5), not the production app.
- `ALLOWED_GITHUB_ID` — same number as production.
- `AUTH_URL=http://localhost:3000` — add this line only if local sign-in
  redirects misbehave; usually unnecessary.

This is the complete, permanent set. Adding Stripe accounts later requires
**no** new env vars — keys go in through the app UI.

## 6. Redeploy

Trigger a redeploy so the env vars take effect. Sign in with GitHub — any
other GitHub identity is rejected with no session.

## 7. (Optional, in-app) Add Stripe accounts

1. In Stripe: **Developers → API keys → Create restricted key** — read
   access to Charges and PaymentIntents is enough. A restricted (`rk_…`)
   key is safer than the full secret key; either works.
2. In the app: **Stripe accounts → Add a Stripe account** — label + paste
   the key. It is encrypted before storage and never displayed again (only
   a masked hint like `rk_live_…4f2b`).
3. Link projects to the account on the dashboard or the project's settings.

## 8. Tagging shared-account payments

Only needed when **two or more projects share one Stripe account**:

- Give each such project a **revenue tag** in its settings (the app enforces
  this once a second project joins an account).
- When creating payments, set metadata key **`project`** to that tag. The
  code matches `metadata.project` on the **Charge**, falling back to the
  parent **PaymentIntent**'s `metadata.project`.
- Example (Checkout Session, ends up on the PaymentIntent):

  ```js
  await stripe.checkout.sessions.create({
    // …
    payment_intent_data: { metadata: { project: "my-saas" } },
  });
  ```

- Payments matching no project's tag appear on the dashboard as one
  "unattributed" line — in total revenue, assigned to no project.
- A project that is the **only** one on its account needs no tag; the whole
  account's revenue is its.

## 9. Things only you can do by hand

- Keep `ENCRYPTION_SECRET` and `AUTH_SECRET` backed up (password manager).
- Tag payments going forward (step 8) — the app cannot retro-tag old
  payments; untagged history shows as unattributed.
- If you add a custom domain later, update the GitHub OAuth app's homepage
  and callback URLs to match.

## Local development

```bash
cp .env.example .env.local   # fill in every value (see steps above)
npm install
npm run dev                  # http://localhost:3000
npm test                     # money-math self-checks
```
