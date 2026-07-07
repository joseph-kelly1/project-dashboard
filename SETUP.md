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

Open `https://api.github.com/users/<your-username>` and copy the `"id"`
number. That is `ALLOWED_GITHUB_ID`. Only this identity can ever sign in —
it matches the numeric ID, not the username.

## 5. Set the environment variables

In Vercel: **Project → Settings → Environment Variables** (Production +
Preview + Development as you like). Matching `.env.example`:

| Variable | Value | Source |
|---|---|---|
| `KV_REST_API_URL` | (auto) | step 2 — injected by the Upstash integration |
| `KV_REST_API_TOKEN` | (auto) | step 2 — injected by the Upstash integration |
| `AUTH_SECRET` | random string | run `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` | client ID | step 3 |
| `AUTH_GITHUB_SECRET` | client secret | step 3 |
| `ALLOWED_GITHUB_ID` | your numeric ID | step 4 |
| `ENCRYPTION_SECRET` | random string | run `openssl rand -base64 32` |

`AUTH_URL` is not needed on Vercel (inferred). For local dev, `.env.local`
needs all of the above; add `AUTH_URL=http://localhost:3000` only if sign-in
misbehaves locally.

**`ENCRYPTION_SECRET` warning:** it encrypts the Stripe keys you save in the
app. If you ever change it, every saved Stripe key becomes unreadable and
must be re-entered in the app. Store it somewhere safe; never rotate it
casually.

This is the complete, permanent set. Adding Stripe accounts later requires
**no** new env vars.

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
