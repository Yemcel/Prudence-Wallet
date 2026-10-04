import { Router } from "express";
import { db } from "../db/init.js";
import { plaidClient } from "../services/plaid.js";
import { logEvent, clientIp } from "../services/security.js";

export const accountsRouter = Router();

// GET /api/accounts — the three-tier connection list shown in the "Connections" panel.
// In a real build: 'aggregator' rows come from your bank/card aggregator (Plaid, Salt
// Edge, Tink, etc — pick by target region), 'wallet_api' rows come from a dedicated
// integration per wallet platform (PayPal, Venmo, ...), and 'manual' has no API — it's
// always available as the fallback tier for cash and unsupported rails.
accountsRouter.get("/", async (req, res) => {
  try {
    const rows = await db.all("SELECT * FROM accounts WHERE user_id = ?", [req.userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/accounts/:id — disconnects a bank (Plaid) or PayPal connection
// and deletes everything that came in through it: its transactions, any
// nudges and rank changes on them, and the stored tokens. Manual entries
// live on the "Cash & unsupported rails" account, which can't be removed
// here, so a user's hand-logged spending is never touched.
accountsRouter.delete("/:id", async (req, res) => {
  try {
    const account = await db.get("SELECT * FROM accounts WHERE id = ? AND user_id = ?", [req.params.id, req.userId]);
    if (!account) return res.status(404).json({ error: "Connection not found" });
    if (account.tier === "manual") return res.status(400).json({ error: "Manual entries can't be disconnected" });

    // Tell Plaid to revoke our access too. Best effort: if Plaid is
    // unreachable the local data is still removed.
    if (account.tier === "aggregator") {
      const items = await db.all("SELECT access_token FROM plaid_items WHERE account_id = ? AND user_id = ?", [account.id, req.userId]);
      for (const item of items) {
        try {
          await plaidClient.itemRemove({ access_token: item.access_token });
        } catch (err) {
          console.error("Plaid itemRemove failed (continuing):", err.response?.data?.error_code || err.message);
        }
      }
    }

    const txIds = "SELECT id FROM transactions WHERE account_id = ? AND user_id = ?";
    const args = [account.id, req.userId];
    await db.batch([
      { sql: `DELETE FROM nudges WHERE transaction_id IN (${txIds})`, args },
      { sql: `DELETE FROM rank_overrides WHERE transaction_id IN (${txIds})`, args },
      { sql: "DELETE FROM transactions WHERE account_id = ? AND user_id = ?", args },
      { sql: "DELETE FROM plaid_items WHERE account_id = ? AND user_id = ?", args },
      { sql: "DELETE FROM paypal_connections WHERE account_id = ? AND user_id = ?", args },
      { sql: "DELETE FROM accounts WHERE id = ? AND user_id = ?", args },
    ]);

    await logEvent("connection_removed", { userId: req.userId, ip: clientIp(req), detail: `${account.tier}: ${account.name}` });
    res.json({ removed: account.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
