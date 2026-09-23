import { Router } from "express";
import { db } from "../db/init.js";

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
