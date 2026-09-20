import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "wallet.db");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('aggregator', 'wallet_api', 'manual')),
  connected INTEGER NOT NULL DEFAULT 1,
  note TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  time TEXT,
  merchant TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('aggregator', 'wallet_api', 'manual')),
  account_id TEXT REFERENCES accounts(id),
  rank TEXT,
  rank_source TEXT CHECK (rank_source IN ('default', 'coach', 'user_override')),
  needs_receipt INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS learned_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_text TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plaid_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  account_id TEXT REFERENCES accounts(id),
  cursor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paypal_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paypal_account_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TEXT,
  account_id TEXT REFERENCES accounts(id),
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  message TEXT NOT NULL,
  dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT PRIMARY KEY,
  rate REAL NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  home_currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS rank_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  old_rank TEXT,
  new_rank TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function seedIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM accounts").get();
  if (count === 0) {
    const insertAccount = db.prepare(
      "INSERT INTO accounts (id, name, tier, connected, note) VALUES (?, ?, ?, 1, ?)"
    );
    insertAccount.run("acc_chase", "Chase •••4471", "aggregator", "Bank feed — also covers Apple Pay & Google Pay taps on this card");
    insertAccount.run("acc_paypal", "PayPal", "wallet_api", "Wallet balance — separate connection, not seen by the bank feed");
    insertAccount.run("acc_manual", "Cash & unsupported rails", "manual", "No API exists for this — logged by hand");

    const insertTx = db.prepare(`
      INSERT INTO transactions (id, date, time, merchant, amount, currency, category, tier, account_id, rank, rank_source, needs_receipt)
      VALUES (@id, @date, @time, @merchant, @amount, @currency, @category, @tier, @account_id, @rank, @rank_source, @needs_receipt)
    `);

    const seedTx = [
      { id: "tx_1", date: "2026-08-12", time: null, merchant: "Whole Foods Market", amount: 84.21, currency: "USD", category: "Groceries", tier: "aggregator", account_id: "acc_chase", rank: "necessary", rank_source: "default", needs_receipt: 0 },
      { id: "tx_2", date: "2026-08-11", time: null, merchant: "Rent — Meridian Apts", amount: 1450.0, currency: "USD", category: "Housing", tier: "aggregator", account_id: "acc_chase", rank: "important", rank_source: "default", needs_receipt: 0 },
      { id: "tx_3", date: "2026-08-06", time: null, merchant: "Steam — Game Purchase", amount: 59.99, currency: "USD", category: "Entertainment", tier: "aggregator", account_id: "acc_chase", rank: "wasteful", rank_source: "default", needs_receipt: 0 },
      { id: "tx_101", date: "2026-08-13", time: "23:40", merchant: "Uber", amount: 22.3, currency: "USD", category: "Transport", tier: "aggregator", account_id: "acc_chase", rank: null, rank_source: null, needs_receipt: 0 },
      { id: "tx_102", date: "2026-08-12", time: "19:05", merchant: "Send to Jordan", amount: 32.0, currency: "USD", category: null, tier: "wallet_api", account_id: "acc_paypal", rank: null, rank_source: null, needs_receipt: 0 },
      { id: "tx_103", date: "2026-08-14", time: null, merchant: "Café de Flore, Paris", amount: 6.5, currency: "EUR", category: "Dining", tier: "manual", account_id: "acc_manual", rank: "treat", rank_source: "default", needs_receipt: 0 },
    ];

    for (const tx of seedTx) insertTx.run(tx);
  }

  db.prepare("INSERT OR IGNORE INTO settings (id, home_currency) VALUES (1, 'USD')").run();
}

// Used by both the Plaid and PayPal sync jobs — inserts a transaction if its
// external id hasn't been seen before, does nothing if it has (idempotent sync).
export function upsertExternalTransaction({
  externalId,
  date,
  time = null,
  merchant,
  amount,
  currency = "USD",
  category = null,
  tier,
  accountId,
}) {
  const id = `tx_${externalId}`;
  const exists = db.prepare("SELECT id FROM transactions WHERE id = ?").get(id);
  if (exists) return { inserted: false, id };

  db.prepare(
    `INSERT INTO transactions (id, date, time, merchant, amount, currency, category, tier, account_id, rank, rank_source, needs_receipt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0)`
  ).run(id, date, time, merchant, amount, currency, category, tier, accountId);

  return { inserted: true, id };
}
