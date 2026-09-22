import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "wallet.db");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

-- Original shape kept here so a fresh (pre-auth) database still creates it —
-- migrateLearnedRules() below rebuilds it with a per-user unique constraint.
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

-- Legacy singleton settings row — superseded by user_settings below now that
-- home currency is per-user. Left in place (unused) rather than dropped, so
-- this migration doesn't need to touch/delete anything.
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  home_currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
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

// --- Migrations -------------------------------------------------------
// SQLite has no "ADD COLUMN IF NOT EXISTS" and can't alter a constraint in
// place, so both helpers below check current shape before touching
// anything — this file runs on every server boot and must be safe to run
// repeatedly (idempotent), including against the already-deployed database.

function addColumnIfMissing(table, columnDef) {
  const columnName = columnDef.split(" ")[0];
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasColumn = existing.some((c) => c.name === columnName);
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

// learned_rules originally had a GLOBAL UNIQUE(rule_text) — fine for one
// user, but it would silently block (INSERT OR IGNORE) a second user from
// ever saving a rule another user's coach had already learned, or worse,
// leave their query looking at a row still tagged with someone else's
// user_id. Rebuilding with UNIQUE(user_id, rule_text) fixes both.
function migrateLearnedRules() {
  const info = db.prepare("PRAGMA table_info(learned_rules)").all();
  const hasUserId = info.some((c) => c.name === "user_id");
  if (hasUserId) return; // already migrated

  db.exec(`
    CREATE TABLE learned_rules_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id),
      rule_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, rule_text)
    );
    INSERT INTO learned_rules_new (id, rule_text, created_at)
      SELECT id, rule_text, created_at FROM learned_rules;
    DROP TABLE learned_rules;
    ALTER TABLE learned_rules_new RENAME TO learned_rules;
  `);
}

migrateLearnedRules();

for (const table of ["accounts", "transactions", "plaid_items", "paypal_connections", "nudges", "rank_overrides"]) {
  addColumnIfMissing(table, "user_id TEXT REFERENCES users(id)");
}

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
}

// Whoever creates the very first account inherits whatever demo/test data
// already existed before auth shipped — otherwise that data is orphaned
// (user_id IS NULL) forever, invisible to every query. Every signup after
// this one gets a genuinely empty wallet, which is the whole point.
export function claimOrphanedDataForFirstUser(userId) {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM users").get();
  if (count !== 1) return; // not the first user — leave orphaned rows alone

  // acc_manual/acc_paypal's id gets renamed below, but that id is also a
  // FOREIGN KEY held by transactions/plaid_items/paypal_connections. Node's
  // sqlite module enforces foreign keys immediately by default, so doing the
  // parent rename and the child repoints as separate auto-committed
  // statements is a chicken-and-egg problem: rename the parent first and the
  // still-pointing children instantly violate the constraint; repoint the
  // children first and they'd reference a parent id that doesn't exist yet
  // either way. Wrapping the whole thing in one transaction with
  // defer_foreign_keys ON postpones the integrity check until COMMIT, once
  // every row is consistent again — and SQLite resets the pragma to OFF the
  // moment the transaction ends, so it can't leak into unrelated queries.
  db.exec("BEGIN");
  try {
    db.exec("PRAGMA defer_foreign_keys = ON");

    for (const table of ["accounts", "transactions", "plaid_items", "paypal_connections", "nudges", "learned_rules", "rank_overrides"]) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
    }

    // acc_manual / acc_paypal used to be fixed, shared ids. Every new
    // connection from now on uses a per-user id (acc_manual_<userId> etc) to
    // avoid colliding with another user's row — rename this user's legacy
    // rows to match, cascading the id change to whatever referenced it.
    const renames = [
      ["acc_manual", `acc_manual_${userId}`],
      ["acc_paypal", `acc_paypal_${userId}`],
    ];
    for (const [oldId, newId] of renames) {
      const exists = db.prepare("SELECT id FROM accounts WHERE id = ?").get(oldId);
      if (!exists) continue;
      db.prepare("UPDATE accounts SET id = ? WHERE id = ?").run(newId, oldId);
      db.prepare("UPDATE transactions SET account_id = ? WHERE account_id = ?").run(newId, oldId);
      db.prepare("UPDATE plaid_items SET account_id = ? WHERE account_id = ?").run(newId, oldId);
      db.prepare("UPDATE paypal_connections SET account_id = ? WHERE account_id = ?").run(newId, oldId);
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
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
  userId,
}) {
  const id = `tx_${externalId}`;
  const exists = db.prepare("SELECT id FROM transactions WHERE id = ?").get(id);
  if (exists) return { inserted: false, id };

  db.prepare(
    `INSERT INTO transactions (id, date, time, merchant, amount, currency, category, tier, account_id, rank, rank_source, needs_receipt, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)`
  ).run(id, date, time, merchant, amount, currency, category, tier, accountId, userId);

  return { inserted: true, id };
}
