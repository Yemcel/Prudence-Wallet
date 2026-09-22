import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db/init.js";
import { RANKS, REDUCIBLE_KEYS } from "../services/ranks.js";
import { convert, ensureFreshRates, getHomeCurrency } from "../services/fx.js";
import { checkAndCreateNudge } from "../services/nudges.js";

export const transactionsRouter = Router();

// Attaches amount_home / home_currency to each row so the frontend never
// has to do currency math itself — everything it renders is already
// comparable, regardless of what currency the original transaction was in.
function withHomeAmounts(rows, homeCurrency) {
  return rows.map((t) => ({
    ...t,
    home_currency: homeCurrency,
    amount_home: Math.round(convert(t.amount, t.currency, homeCurrency) * 100) / 100,
  }));
}

transactionsRouter.get("/", async (req, res) => {
  try {
    await ensureFreshRates();
    const homeCurrency = getHomeCurrency(req.userId);
    const rows = db
      .prepare(
        `SELECT t.*, a.name as account_name
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         WHERE t.rank IS NOT NULL AND t.user_id = ?
         ORDER BY t.date DESC, t.created_at DESC`
      )
      .all(req.userId);
    res.json(withHomeAmounts(rows, homeCurrency));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

transactionsRouter.get("/pending", async (req, res) => {
  try {
    await ensureFreshRates();
    const homeCurrency = getHomeCurrency(req.userId);
    const rows = db
      .prepare(
        `SELECT t.*, a.name as account_name
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         WHERE t.rank IS NULL AND t.user_id = ?
         ORDER BY t.date DESC, t.created_at DESC`
      )
      .all(req.userId);
    res.json(withHomeAmounts(rows, homeCurrency));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/transactions/summary — every total here is now computed in the
// user's home currency, not face-value-summed across mismatched currencies.
transactionsRouter.get("/summary", async (req, res) => {
  try {
    await ensureFreshRates();
    const homeCurrency = getHomeCurrency(req.userId);
    const all = db.prepare("SELECT tier, amount, currency, rank FROM transactions WHERE user_id = ?").all(req.userId);

    const byTier = { aggregator: 0, wallet_api: 0, manual: 0 };
    const byRank = Object.fromEntries(RANKS.map((r) => [r.key, 0]));
    let total = 0;
    let reducibleMonthly = 0;

    for (const t of all) {
      const amountHome = convert(t.amount, t.currency, homeCurrency);
      total += amountHome;
      byTier[t.tier] = (byTier[t.tier] || 0) + amountHome;
      if (t.rank) {
        byRank[t.rank] = (byRank[t.rank] || 0) + amountHome;
        if (REDUCIBLE_KEYS.has(t.rank)) reducibleMonthly += amountHome;
      }
    }

    const round = (n) => Math.round(n * 100) / 100;
    const trackedPct = total ? Math.round(((byTier.aggregator + byTier.wallet_api) / total) * 100) : 0;

    res.json({
      homeCurrency,
      total: round(total),
      byTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, round(v)])),
      byRank: Object.fromEntries(Object.entries(byRank).map(([k, v]) => [k, round(v)])),
      trackedPct,
      projections: {
        "1m": round(reducibleMonthly),
        "3m": round(reducibleMonthly * 3),
        "6m": round(reducibleMonthly * 6),
        "12m": round(reducibleMonthly * 12),
      },
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

transactionsRouter.post("/manual", (req, res) => {
  const { merchant, amount, currency = "USD", date, needsReceipt = true } = req.body;
  if (!merchant || !amount) {
    return res.status(400).json({ error: "merchant and amount are required" });
  }

  // Per-user manual account id — a shared fixed id like the old 'acc_manual'
  // would collide across different users' manual entries.
  const accountId = `acc_manual_${req.userId}`;
  db.prepare(
    `INSERT OR IGNORE INTO accounts (id, name, tier, connected, note, user_id)
     VALUES (?, 'Cash & unsupported rails', 'manual', 1, 'No API exists for this — logged by hand', ?)`
  ).run(accountId, req.userId);

  const id = `tx_${randomUUID()}`;
  db.prepare(
    `INSERT INTO transactions (id, date, merchant, amount, currency, tier, account_id, rank, rank_source, needs_receipt, user_id)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, NULL, NULL, ?, ?)`
  ).run(id, date || new Date().toISOString().slice(0, 10), merchant, amount, currency, accountId, needsReceipt ? 1 : 0, req.userId);

  const created = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
  checkAndCreateNudge(created); // near-real-time — fires as soon as the entry is added, not at month end
  res.status(201).json(created);
});

transactionsRouter.patch("/:id/rank", (req, res) => {
  const { rank, rankSource = "coach" } = req.body;
  const valid = RANKS.some((r) => r.key === rank);
  if (!valid) return res.status(400).json({ error: `rank must be one of: ${RANKS.map((r) => r.key).join(", ")}` });

  const existing = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: "transaction not found" });

  db.prepare("UPDATE transactions SET rank = ?, rank_source = ? WHERE id = ?").run(rank, rankSource, req.params.id);

  if (existing.rank !== rank) {
    db.prepare(
      "INSERT INTO rank_overrides (transaction_id, old_rank, new_rank, user_id) VALUES (?, ?, ?, ?)"
    ).run(req.params.id, existing.rank, rank, req.userId);
  }

  const updated = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
  res.json(updated);
});
