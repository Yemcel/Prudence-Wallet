# Prudence Wallet — Prototype Source

A spending tracker that ranks purchases on a 7-tier prudence scale (Important →
Wasteful), projects potential savings, and uses an AI coaching conversation to
classify ambiguous purchases in the user's own words instead of a fixed
dropdown.

This is a **working prototype**, not a production app. It has real
persistence (SQLite) and a real API, but the "bank feed" and "wallet"
connections are seeded mock data — wiring in an actual aggregator (Plaid,
Salt Edge, Tink, ...) and the PayPal/Venmo APIs is the next real step, not
included here. See "What's mocked vs real" below.

## Structure

```
prudence-wallet/
  backend/     Express API + SQLite database + Claude API coaching calls
  frontend/    React (Vite) UI that talks to the backend
```

## Running it

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY (https://console.anthropic.com)
npm run dev
```

Runs on `http://localhost:4000`. On first run it creates `wallet.db`
(SQLite) and seeds it with a few example accounts and transactions,
including two left unranked so you have something to test the coaching
flow on immediately.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # defaults to http://localhost:4000, edit if needed
npm run dev
```

Runs on `http://localhost:5173`. Open it with the backend already running.

## What's mocked vs real

| Piece | Status |
|---|---|
| Database, API, rank storage, learned-rule storage | Real — SQLite, persists between restarts |
| AI coaching classification | Real — calls the Claude API with your key |
| Donut chart, spectrum bar, savings projection | Real — computed live from the database, in your home currency |
| Bank/card feed | **Real integration** — Plaid Link, sandbox-ready |
| PayPal wallet connection | **Real integration, with a real constraint** — see below |
| Point-of-decision nudges | **Real** — near-real-time via Plaid webhooks, simple pattern detection |
| Multi-currency FX conversion | **Real** — live rates via Frankfurter, cached 24h |

## Setting up the Plaid connection (bank/card feed)

1. Sign up at https://dashboard.plaid.com and grab your **sandbox**
   `client_id` and `secret` (no approval needed for sandbox — it's instant
   and uses fake test institutions/transactions).
2. Add them to `backend/.env`:
   ```
   PLAID_CLIENT_ID=...
   PLAID_SECRET=...
   PLAID_ENV=sandbox
   ```
3. In the app, click **"+ Connect account"** → **"Connect a bank via
   Plaid"**. This opens Plaid's own hosted UI (Plaid Link) — in sandbox
   mode, use username `user_good` / password `pass_good` against any test
   institution to simulate a real login without a real bank.
4. On success, the backend exchanges the token, stores it, and calls
   `/api/plaid/sync` automatically — real (sandbox) transactions should
   appear in the pending list within a few seconds.
5. Moving to production requires Plaid's standard approval process
   (`PLAID_ENV=development` then `production`) — sandbox is enough to prove
   the flow works end to end first.

Only US institutions are requested by default (`country_codes: [CountryCode.Us]`
in `backend/services/plaid.js`) — widen that array for other regions, and
remember Plaid's own coverage varies significantly outside the US, so a
global launch likely needs a second provider (Salt Edge, Tink) for regions
Plaid doesn't reach well.

## Setting up the PayPal connection (read this — it's more limited than Plaid)

PayPal does not have a Plaid-equivalent "click to log in and link your
personal account" flow available to arbitrary third-party apps. What's
implemented here is the realistic stopgap:

1. Each user creates their own app at
   https://developer.paypal.com/dashboard/ and gets a `client_id` /
   `client_secret` for their own PayPal account (sandbox credentials work
   for testing).
2. In the app, click **"+ Connect account"** and enter those credentials
   directly.
3. The backend authenticates as that PayPal account and pulls transactions
   via PayPal's Transaction Search API.

This works, but it's clunky compared to Plaid's flow, and it means a user
has to go generate their own API credentials rather than just logging in —
not something to present as equivalent to the bank connection in your UI
copy. For a real product with many users, PayPal's Partner program is the
path to a genuine one-click connection — that's a business approval
process with PayPal, not just more code.

## Everything else

- **Venmo, Cash App**: not implemented — each would need its own
  integration research; neither has a straightforward public API for this
  use case at the time of writing, worth re-checking their current
  developer docs before assuming either is feasible.
- **Cash / unsupported rails**: already handled — the `manual` tier and
  "Add manual spend" flow are real and don't need any external API.

## Point-of-decision nudges — what's real about this

This is the honest, achievable version of "catch a purchase before it
becomes a pattern," not literal pre-swipe interception (that would require
the app to *be* the payment method — issuing its own card via a program
like Marqeta or Unit, a much larger regulated undertaking).

What's actually implemented: every time a new transaction lands — via a
Plaid sync, a Plaid **webhook** (near-real-time, not waiting for the user
to open the app), a PayPal sync, or a manual add — `backend/services/nudges.js`
checks whether it's the 3rd+ similar discretionary purchase (by category or
merchant keyword) in the trailing 7 days, and if so creates a nudge. The
frontend polls `/api/nudges` every 15 seconds and shows an amber banner at
the top of the page.

**To get real near-real-time delivery (not just on next sync):**
1. Run a tunnel to your local backend, e.g. `ngrok http 4000`
2. Set `PLAID_WEBHOOK_URL=https://your-ngrok-url.ngrok.app/api/plaid/webhook`
   in `backend/.env`
3. Re-connect a Plaid account (the webhook URL is set at Link-token
   creation) — new sandbox transactions will now trigger the webhook, which
   syncs and checks for nudges automatically, typically within seconds.

Without a webhook configured, nudges still work correctly — they just only
get checked when something calls `/api/plaid/sync`, `/api/paypal/sync`, or
a manual entry is added, rather than the moment a transaction posts.

The detection logic itself is deliberately simple (category/keyword
matching, not AI) — it needs to be fast and predictable, not nuanced. It's
a reasonable v1, not a finished pattern-detection system; a real product
would likely want it to also learn from the coach's `learned_rules` over
time instead of using a fixed keyword list.

## Real FX conversion — what's real about this

`backend/services/fx.js` fetches live exchange rates from
[Frankfurter](https://frankfurter.dev) (free, no API key, ECB-based,
updated daily on bank days) and caches them for 24 hours. Every summary
total, chart, and projection is now computed in the user's **home
currency** — set via the selector in the top-right of the app — rather than
summed at face value across mismatched currencies.

- Individual transaction rows still show their original currency, with a
  small converted amount underneath when it differs from the home currency
- A demo EUR transaction is seeded (`Café de Flore, Paris`) so you can see
  the conversion working without connecting a real foreign account
- Frankfurter covers major world currencies but not every one that exists —
  check their docs if you need a currency it doesn't support
- This is daily-rate accuracy, appropriate for a personal budgeting app —
  not suitable for anything requiring real-time trading-grade FX rates

## Notes on the coaching model

`backend/services/classify.js` calls the Claude API directly. Before
shipping, double check the current recommended model string and pricing at
https://docs.claude.com — model names change over time and the one in this
file may not be current when you read this.
