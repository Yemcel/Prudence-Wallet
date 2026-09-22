import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from "plaid";
import { db, upsertExternalTransaction } from "../db/init.js";
import { checkAndCreateNudge } from "./nudges.js";

// --- Client setup -----------------------------------------------------
// PLAID_ENV should be 'sandbox' while developing (fake institutions, fake
// transactions, no real bank needed to test the flow end to end), then
// 'development' or 'production' once you have real approval from Plaid.
const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

function assertConfigured() {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error("PLAID_CLIENT_ID / PLAID_SECRET not set — add them to backend/.env (get sandbox keys at https://dashboard.plaid.com)");
  }
}

// --- Link flow ----------------------------------------------------------
// 1. Frontend asks us for a link_token
// 2. Frontend opens Plaid Link (their hosted UI) with that token
// 3. User logs into their bank inside Plaid's UI — we never see their bank
//    credentials, Plaid handles that entirely
// 4. Plaid Link returns a public_token to the frontend
// 5. Frontend sends us the public_token, we exchange it for a permanent
//    access_token and store that server-side (never send it to the frontend)

export async function createLinkToken(userId) {
  assertConfigured();
  const config = {
    user: { client_user_id: userId },
    client_name: "Prudence Wallet",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us], // widen this array for multi-country launch
    language: "en",
  };
  // Enables near-real-time syncing: Plaid calls this URL when new
  // transactions are ready, instead of us only finding out on a manual
  // sync. Requires a public HTTPS URL — use ngrok or similar for local dev,
  // since Plaid cannot reach localhost directly.
  if (process.env.PLAID_WEBHOOK_URL) {
    config.webhook = process.env.PLAID_WEBHOOK_URL;
  }
  const response = await plaidClient.linkTokenCreate(config);
  return response.data.link_token;
}

export async function exchangePublicToken(publicToken, userId) {
  assertConfigured();
  const response = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
  const { access_token: accessToken, item_id: itemId } = response.data;

  // Fetch institution name for a friendly display label
  const itemResp = await plaidClient.itemGet({ access_token: accessToken });
  const institutionId = itemResp.data.item.institution_id;
  let institutionName = "Connected bank";
  if (institutionId) {
    const instResp = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: [CountryCode.Us],
    });
    institutionName = instResp.data.institution.name;
  }

  // acc_plaid_<itemId> is already globally unique (Plaid item ids are
  // unique per connection), so no per-user collision risk here.
  const accountId = `acc_plaid_${itemId}`;
  db.prepare(
    "INSERT OR IGNORE INTO accounts (id, name, tier, connected, note, user_id) VALUES (?, ?, 'aggregator', 1, ?, ?)"
  ).run(accountId, institutionName, "Bank feed via Plaid — also covers Apple Pay & Google Pay taps on linked cards", userId);

  db.prepare(
    "INSERT INTO plaid_items (item_id, access_token, institution_name, account_id, user_id) VALUES (?, ?, ?, ?, ?)"
  ).run(itemId, accessToken, institutionName, accountId, userId);

  return { itemId, institutionName, accountId };
}

// --- Transaction sync -----------------------------------------------------
// Plaid's /transactions/sync is cursor-based: each call returns everything
// new since the last cursor, so this is safe to call on a schedule (e.g. a
// cron job every few minutes) without re-processing old transactions.
export async function syncTransactionsForItem(itemRow) {
  assertConfigured();
  let cursor = itemRow.cursor || undefined;
  let added = [];
  let hasMore = true;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: itemRow.access_token,
      cursor,
    });
    added = added.concat(response.data.added);
    hasMore = response.data.has_more;
    cursor = response.data.next_cursor;
  }

  for (const tx of added) {
    const result = upsertExternalTransaction({
      externalId: `plaid_${tx.transaction_id}`,
      date: tx.date,
      merchant: tx.merchant_name || tx.name,
      amount: Math.abs(tx.amount), // Plaid uses positive = outflow for most account types
      currency: tx.iso_currency_code || "USD",
      category: tx.personal_finance_category?.primary || null,
      tier: "aggregator",
      accountId: itemRow.account_id,
      userId: itemRow.user_id,
    });
    if (result.inserted) {
      const fullTx = db.prepare("SELECT * FROM transactions WHERE id = ?").get(result.id);
      checkAndCreateNudge(fullTx); // near-real-time — fires right after this transaction lands, not at month end
    }
  }

  db.prepare("UPDATE plaid_items SET cursor = ? WHERE item_id = ?").run(cursor, itemRow.item_id);

  return { newTransactions: added.length };
}

// userId: pass req.userId from the /sync route to only sync that user's
// items. Called with no argument from anywhere that genuinely needs every
// item across every user (there's no such caller today — the webhook path
// calls syncTransactionsForItem directly for a single already-known item).
export async function syncAllPlaidItems(userId) {
  const items = userId
    ? db.prepare("SELECT * FROM plaid_items WHERE user_id = ?").all(userId)
    : db.prepare("SELECT * FROM plaid_items").all();
  const results = [];
  for (const item of items) {
    try {
      const result = await syncTransactionsForItem(item);
      results.push({ itemId: item.item_id, ...result });
    } catch (err) {
      results.push({ itemId: item.item_id, error: err.message });
    }
  }
  return results;
}

export function getPlaidItemByItemId(itemId) {
  return db.prepare("SELECT * FROM plaid_items WHERE item_id = ?").get(itemId);
}
