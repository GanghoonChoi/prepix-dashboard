# Dashboard deployment checklist

The dashboard is a static Next.js app that talks to `prepix-backend` over HTTP
with Bearer tokens. The code wiring is complete; the items below are
environment/data configuration that must be set per environment before real
users hit it. **Boxes 1–3 are hard blockers — the dashboard does not work
without them.**

## 1. Dashboard env vars (host: Vercel / etc.)

Set these in the deploy platform (they are baked in at **build** time, so
redeploy after changing). See `.env.example` for the full list.

| Var | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | Deployed backend origin, e.g. `https://api.prepix.ai` (client adds `/v2`). **Not** localhost. |
| `NEXT_PUBLIC_SITE_URL` | This dashboard's own origin, e.g. `https://app.prepix.ai` (OG images). |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle client token. Optional — enables the in-page checkout overlay; without it checkout falls back to the backend hosted-checkout redirect. |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | `sandbox` or `production` — must match the token and the backend. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google **Web** OAuth client id for "Sign in with Google". Optional — button is hidden if unset. Must equal backend `GOOGLE_OAUTH_WEB_CLIENT_ID`. |

## 2. Backend CORS must allow the dashboard origin

The browser blocks every dashboard→backend call whose origin isn't on the
backend allowlist. In the **backend** (Railway) env set:

```
CORS_ALLOWED_ORIGINS=https://prepix.ai,https://www.prepix.ai,https://app.prepix.ai
```

(add whatever domain the dashboard is actually served from). Local dev origins
`http://localhost:3001` / `http://127.0.0.1:3001` are already allowed
automatically when `NODE_ENV !== production`.

## 3. Paddle price id for Pro (enables checkout)

`/subscriptions/checkout` returns 400 for `pro` until `plan_definitions.paddle_price_id`
is populated. In the **backend** env set `PADDLE_PRO_PRICE_ID=pri_xxx`, then run
`pnpm db:seed`. Also confirm the backend has `PADDLE_API_KEY`,
`PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN`, `CHECKOUT_SESSION_SECRET`,
`BACKEND_PUBLIC_URL`, and the Paddle webhook pointed at `/webhooks/paddle`.

## 4. Google Sign-In (optional — button hidden until configured)

The dashboard uses Google Identity Services (browser-issued ID token), which
needs a **Web** OAuth client — the desktop app's Desktop-type client can't be
reused for a hosted https origin.

1. Google Cloud Console → Credentials → Create OAuth client → **Web application**.
2. Under **Authorized JavaScript origins** add every dashboard origin:
   `https://app.prepix.ai` (prod) and `http://localhost:3001` (dev). No redirect
   URI is needed for GIS.
3. Set the resulting client id in **both**:
   - dashboard: `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
   - backend: `GOOGLE_OAUTH_WEB_CLIENT_ID`
   They must be identical — the backend verifies the token's audience against it.

Existing email/password login is unaffected, and the desktop app's separate
Desktop OAuth client (`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`) keeps working.

## 5. Confirm before launch (not blockers)

- **Pro price is `$1/mo`** in `lib/constants/data.ts` — looks like a launch/test
  price. Confirm it's intended, and that it matches the amount on the Paddle
  price behind `PADDLE_PRO_PRICE_ID`.
- **Plan quotas** (`data.ts`: Free 1h, Pro 5h) are display copy and must stay in
  sync with the backend seed (`inferenceSecondsPerMonth`: 3600 / 18000). They
  match today.
- **Backend prod env** also needs: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`
  (password-reset email), `DASHBOARD_URL` (base for the reset link — must be the
  deployed dashboard origin, not localhost), `REDIS_URL` (shared rate-limit
  store across instances), and optionally `SENTRY_DSN`.

## Notes on current behaviour

- **Auth is client-side only** (localStorage tokens, no SSR guard) — pages are
  statically served and redirect to `/login` on the client when unauthenticated.
- **Account deletion** is handled manually via `support@prepix.ai` (Settings →
  Danger zone opens a prefilled email). There is no self-service delete endpoint.
- **No Google sign-in in the dashboard** — email/password only. The backend
  supports Google OAuth (used by the desktop app).
