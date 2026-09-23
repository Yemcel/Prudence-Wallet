import { createClient } from "@libsql/client";

// --- Connection ---------------------------------------------------------
// Turso (hosted, SQLite-compatible) instead of a local file — Render's free
// tier wipes local disk on every redeploy AND every 15-minute idle spin-down,
// which silently erased user accounts and data. Turso persists properly and
// has a genuinely free tier.
function assertConfigured() {
  // .trim() matters here: a stray trailing newline or space picked up when
  // pasting a long token through a browser env-var field is invisible but
  // makes the Authorization header invalid, which crashes deep inside
  // hrana-client's HTTP layer with a confusing WebIDL error instead of a
  // readable one — trimming both values up front avoids that entirely.
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set — add them to backend/.env locally and to the backend service's environment variables on Render (get both from your database's page at app.turso.tech)"
    );
  }
  return { url, authToken };
}

const client = createClient(assertConfigured());

// Thin async wrapper matching the shape call sites already used
// (db.get/.all/.run) so route and service files read the same way they did
// with node:sqlite — just with `await` in front now, since every real
// network-backed database call is necessarily asynchronous.
export const db = {
  async get(sql, args = []) {
    const { rows } = await client.execute({ sql, args });
    return rows[0];
  },
  async all(sql, args = []) {
    const { rows } = await client.execute({ sql, args });
    return rows;
  },
  async run(sql, args = []) {
    return client.execute({ sql, args });
  },
  // For a handful of writes that should commit atomically (e.g. refreshing
  // every currency rate together) — statements is an array of
  // { sql, args } objects, same shape client.batch() already accepts.
  async batch(statements) {
    return client.batch(statements, "write");
  },
};

// --- Schema ---------------------------------------------------------------
const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('aggregator', 'wallet_api', 'manual')),
    connected INTEGER NOT NULL DEFAULT 1,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
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
  )`,
  // Original shape kept here so a fresh database still creates it —
  // migrateLearnedRules() below rebuilds it with a per-user unique constraint.
  `CREATE TABLE IF NOT EXISTS learned_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_text TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS plaid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    institution_name TEXT,
    account_id TEXT REFERENCES accounts(id),
    cursor TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS paypal_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paypal_account_email TEXT,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TEXT,
    account_id TEXT REFERENCES accounts(id),
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS nudges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    message TEXT NOT NULL,
    dismissed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS fx_rates (
    currency TEXT PRIMARY KEY,
    rate REAL NOT NULL,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    home_currency TEXT NOT NULL DEFAULT 'USD'
  )`,
  `CREATE TABLE IF NOT EXISTS rank_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    old_rank TEXT,
    new_rank TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

await client.batch(CREATE_TABLES, "write");

// --- Migrations -------------------------------------------------------
// SQLite (and libSQL) has no "ADD COLUMN IF NOT EXISTS" and can't alter a
// constraint in place, so both helpers below check current shape before
// touching anything — this file runs on every server boot and must be safe
// to run repeatedly (idempotent), including against the already-deployed database.

async function addColumnIfMissing(table, columnDef) {
  const columnName = columnDef.split(" ")[0];
  const { rows: existing } = await client.execute(`PRAGMA table_info(${table})`);
  const hasColumn = existing.some((c) => c.name === columnName);
  if (!hasColumn) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

// learned_rules originally had a GLOBAL UNIQUE(rule_text) — fine for one
// user, but it would silently block (INSERT OR IGNORE) a second user from
// ever saving a rule another user's coach had already learned, or worse,
// leave their query looking at a row still tagged with someone else's
// user_id. Rebuilding with UNIQUE(user_id, rule_text) fixes both.
async function migrateLearnedRules() {
  const { rows: info } = await client.execute("PRAGMA table_info(learned_rules)");
  const hasUserId = info.some((c) => c.name === "user_id");
  if (hasUserId) return; // already migrated

  await client.batch(
    [
      `CREATE TABLE learned_rules_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT REFERENCES users(id),
        rule_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, rule_text)
      )`,
      "INSERT INTO learned_rules_new (id, rule_text, created_at) SELECT id, rule_text, created_at FROM learned_rules",
      "DROP TABLE learned_rules",
      "ALTER TABLE learned_rules_new RENAME TO learned_rules",
    ],
    "write"
  );
}

await migrateLearnedRules();

for (const table of ["accounts", "transactions", "plaid_items", "paypal_connections", "nudges", "rank_overrides"]) {
  await addColumnIfMissing(table, "user_id TEXT REFERENCES users(id)");
}

// --- Seed data --------------------------------------------------------
export async function seedIfEmpty() {
  const { rows } = await client.execute("SELECT COUNT(*) as count FROM accounts");
  if (Number(rows[0].count) !== 0) return;

  const insertAccount = "INSERT INTO accounts (id, name, tier, connected, note) VALUES (?, ?, ?, 1, ?)";
  const insertTx = `
    INSERT INTO transactions (id, date, time, merchant, amount, currency, category, tier, account_id, rank, rank_source, needs_receipt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await client.batch(
    [
      { sql: insertAccount, args: ["acc_chase", "Chase •••4471", "aggregator", "Bank feed — also covers Apple Pay & Google Pay taps on this card"] },
      { sql: insertAccount, args: ["acc_paypal", "PayPal", "wallet_api", "Wallet balance — separate connection, not seen by the bank feed"] },
      { sql: insertAccount, args: ["acc_manual", "Cash & unsupported rails", "manual", "No API exists for this — logged by hand"] },
      { sql: insertTx, args: ["tx_1", "2026-08-12", null, "Whole Foods Market", 84.21, "USD", "Groceries", "aggregator", "acc_chase", "necessary", "default", 0] },
      { sql: insertTx, args: ["tx_2", "2026-08-11", null, "Rent — Meridian Apts", 1450.0, "USD", "Housing", "aggregator", "acc_chase", "important", "default", 0] },
      { sql: insertTx, args: ["tx_3", "2026-08-06", null, "Steam — Game Purchase", 59.99, "USD", "Entertainment", "aggregator", "acc_chase", "wasteful", "default", 0] },
      { sql: insertTx, args: ["tx_101", "2026-08-13", "23:40", "Uber", 22.3, "USD", "Transport", "aggregator", "acc_chase", null, null, 0] },
      { sql: insertTx, args: ["tx_102", "2026-08-12", "19:05", "Send to Jordan", 32.0, "USD", null, "wallet_api", "acc_paypal", null, null, 0] },
      { sql: insertTx, args: ["tx_103", "2026-08-14", null, "Café de Flore, Paris", 6.5, "EUR", "Dining", "manual", "acc_manual", "treat", "default", 0] },
    ],
    "write"
  );
}

// Whoever creates the very first account inherits whatever demo/test data
// already existed before auth shipped — otherwise that data is orphaned
// (user_id IS NULL) forever, invisible to every query. Every signup after
// this one gets a genuinely empty wallet, which is the whole point.
export async function claimOrphanedDataForFirstUser(userId) {
  const { rows } = await client.execute("SELECT COUNT(*) as count FROM users");
  if (Number(rows[0].count) !== 1) return; // not the first user — leave orphaned rows alone

  const claimStmts = ["accounts", "transactions", "plaid_items", "paypal_connections", "nudges", "learned_rules", "rank_overrides"].map(
    (table) => ({ sql: `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`, args: [userId] })
  );

  // acc_manual / acc_paypal used to be fixed, shared ids. Every new
  // connection from now on uses a per-user id (acc_manual_<userId> etc) to
  // avoid colliding with another user's row — rename this user's legacy
  // rows to match, cascading the id change to whatever referenced it.
  //
  // Renaming a row's primary key while other tables hold it as a foreign key
  // is a chicken-and-egg problem under immediate FK checking: change the
  // parent first and the still-pointing children instantly violate the
  // constraint; repoint the children first and they'd reference a parent
  // that doesn't exist yet either way. Rather than lean on SQLite's
  // defer_foreign_keys pragma (unverified over Turso's remote batch
  // protocol), this inserts a fresh row under the new id, repoints every
  // child to it, then deletes the old row — every intermediate step keeps
  // all foreign keys pointing at a row that actually exists.
  const renameStmts = [];
  for (const [oldId, newId] of [["acc_manual", `acc_manual_${userId}`], ["acc_paypal", `acc_paypal_${userId}`]]) {
    const { rows: existing } = await client.execute({ sql: "SELECT id FROM accounts WHERE id = ?", args: [oldId] });
    if (existing.length === 0) continue;
    renameStmts.push(
      { sql: "INSERT INTO accounts (id, name, tier, connected, note, user_id) SELECT ?, name, tier, connected, note, user_id FROM accounts WHERE id = ?", args: [newId, oldId] },
      { sql: "UPDATE transactions SET account_id = ? WHERE account_id = ?", args: [newId, oldId] },
      { sql: "UPDATE plaid_items SET account_id = ? WHERE account_id = ?", args: [newId, oldId] },
      { sql: "UPDATE paypal_connections SET account_id = ? WHERE account_id = ?", args: [newId, oldId] },
      { sql: "DELETE FROM accounts WHERE id = ?", args: [oldId] }
    );
  }

  await client.batch([...claimStmts, ...renameStmts], "write");
}

// Called when a signed-in user asks to delete their account. Google Play
// requires an in-app path for this from any app that supports account
// creation — doubly so for one handling financial data via Plaid/PayPal.
// Plain sequential deletes in dependency order (children before parents)
// rather than relying on deferred FK checking — same reasoning as the
// rename above.
export async function deleteAllUserData(userId) {
  await client.batch(
    [
      { sql: "DELETE FROM nudges WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM rank_overrides WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM transactions WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM plaid_items WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM paypal_connections WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM accounts WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM learned_rules WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM user_settings WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM users WHERE id = ?", args: [userId] },
    ],
    "write"
  );
}

// Used by both the Plaid and PayPal sync jobs — inserts a transaction if its
// external id hasn't been seen before, does nothing if it has (idempotent sync).
export async function upsertExternalTransaction({
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
  const { rows } = await client.execute({ sql: "SELECT id FROM transactions WHERE id = ?", args: [id] });
  if (rows.length > 0) return { inserted: false, id };

  await client.execute({
    sql: `INSERT INTO transactions (id, date, time, merchant, amount, currency, category, tier, account_id, rank, rank_source, needs_receipt, user_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, ?)`,
    args: [id, date, time, merchant, amount, currency, category, tier, accountId, userId],
  });

  return { inserted: true, id };
}
