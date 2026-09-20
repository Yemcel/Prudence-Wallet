import { db, upsertExternalTransaction } from "../db/init.js";
import { checkAndCreateNudge } from "./nudges.js";

// --- IMPORTANT: read this before building on top of it -------------------
// Unlike Plaid, PayPal does not offer a simple "Login with PayPal, we hand
// you a token for reading this arbitrary user's personal transaction
// history" flow the way a bank aggregator does. What PayPal actually offers:
//
//   - OAuth2 client-credentials against YOUR OWN app's client id/secret,
//     which authenticates as YOUR PayPal (business/developer) account.
//   - The Transaction Search API (/v1/reporting/transactions), which
//     returns transactions for the account tied to those credentials.
//
// For a consumer app where each user has their own PayPal, the realistic
// options are:
//   1. Each user generates their own PayPal REST API credentials (PayPal
//      developer dashboard → their own app) and enters them here. Clunky,
//      but works today with no approval process.
//   2. Apply to PayPal's Partner program for real per-user OAuth linking —
//      this is a business approval process, not just an API integration,
//      and can take real time.
//
// This file implements option 1 (bring-your-own-credentials), which is
// honest about being a stopgap, not a Plaid-equivalent experience.
// ---------------------------------------------------------------------

const PAYPAL_API_BASE =
  process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

async function getAccessToken(clientId, clientSecret) {
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) {
    throw new Error(`PayPal auth failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export async function connectPaypalAccount({ clientId, clientSecret, label }) {
  const { accessToken, expiresIn } = await getAccessToken(clientId, clientSecret);
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const accountId = "acc_paypal";
  db.prepare(
    "INSERT OR IGNORE INTO accounts (id, name, tier, connected, note) VALUES (?, ?, 'wallet_api', 1, ?)"
  ).run(accountId, label || "PayPal", "Wallet balance — separate from bank feed, requires its own connection");

  // NOTE: storing the secret so we can refresh later — in a real product,
  // encrypt this at rest, don't store it in plaintext like this prototype does.
  db.prepare(
    `INSERT INTO paypal_connections (paypal_account_email, access_token, token_expires_at, account_id)
     VALUES (?, ?, ?, ?)`
  ).run(label || null, accessToken, expiresAt, accountId);

  return { accountId, expiresAt };
}

async function fetchTransactions(accessToken, startDate, endDate) {
  const params = new URLSearchParams({
    start_date: startDate, // ISO 8601, e.g. 2026-08-01T00:00:00-0700
    end_date: endDate,
    fields: "transaction_info",
    page_size: "100",
    page: "1",
  });

  const response = await fetch(`${PAYPAL_API_BASE}/v1/reporting/transactions?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`PayPal transaction search failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return data.transaction_details || [];
}

// PayPal's Transaction Search only covers a 31-day window per call and caps
// how far back you can query (varies by account type) — for a real product,
// page through in chunks and store your own sync watermark rather than
// re-querying the same range repeatedly.
export async function syncPaypalConnection(connectionRow) {
  const startDate = connectionRow.last_synced_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = new Date().toISOString();

  const transactions = await fetchTransactions(connectionRow.access_token, startDate, endDate);

  let inserted = 0;
  for (const tx of transactions) {
    const info = tx.transaction_info;
    if (!info) continue;
    const amount = parseFloat(info.transaction_amount?.value || "0");
    if (amount >= 0) continue; // only track outflows as spending

    const result = upsertExternalTransaction({
      externalId: `paypal_${info.transaction_id}`,
      date: (info.transaction_initiation_date || "").slice(0, 10),
      merchant: info.transaction_subject || info.payer_info?.email_address || "PayPal transaction",
      amount: Math.abs(amount),
      currency: info.transaction_amount?.currency_code || "USD",
      tier: "wallet_api",
      accountId: connectionRow.account_id,
    });
    if (result.inserted) {
      inserted += 1;
      const fullTx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(result.id);
      checkAndCreateNudge(fullTx);
    }
  }

  db.prepare("UPDATE paypal_connections SET last_synced_at = ? WHERE id = ?").run(endDate, connectionRow.id);

  return { checked: transactions.length, inserted };
}

export async function syncAllPaypalConnections() {
  const connections = db.prepare("SELECT * FROM paypal_connections").all();
  const results = [];
  for (const conn of connections) {
    try {
      const result = await syncPaypalConnection(conn);
      results.push({ connectionId: conn.id, ...result });
    } catch (err) {
      results.push({ connectionId: conn.id, error: err.message });
    }
  }
  return results;
}
