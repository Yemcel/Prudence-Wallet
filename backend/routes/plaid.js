import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { createLinkToken, exchangePublicToken, syncAllPlaidItems, syncTransactionsForItem, getPlaidItemByItemId } from "../services/plaid.js";

export const plaidRouter = Router();

// GET /api/plaid/link-token — frontend calls this before opening Plaid Link
plaidRouter.get("/link-token", requireAuth, async (req, res) => {
  try {
    const linkToken = await createLinkToken(req.userId);
    res.json({ linkToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/exchange — frontend sends the public_token Plaid Link returned
plaidRouter.post("/exchange", requireAuth, async (req, res) => {
  const { publicToken } = req.body;
  if (!publicToken) return res.status(400).json({ error: "publicToken is required" });

  try {
    const result = await exchangePublicToken(publicToken, req.userId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/sync — pull new transactions for this user's connected items.
plaidRouter.post("/sync", requireAuth, async (req, res) => {
  try {
    const results = await syncAllPlaidItems(req.userId);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/webhook — Plaid calls this directly (not our frontend),
// which is why this route deliberately has no requireAuth: Plaid's servers
// have no way to send our bearer token. The item row already carries its
// own user_id, so the sync stays correctly scoped without one.
plaidRouter.post("/webhook", async (req, res) => {
  const { webhook_type: webhookType, webhook_code: webhookCode, item_id: itemId } = req.body;

  // Acknowledge immediately — Plaid expects a fast 200, do the sync work after
  res.status(200).json({ received: true });

  if (webhookType !== "TRANSACTIONS") return;
  if (!["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"].includes(webhookCode)) return;

  const item = getPlaidItemByItemId(itemId);
  if (!item) return;

  try {
    await syncTransactionsForItem(item);
  } catch (err) {
    console.error(`Plaid webhook sync failed for item ${itemId}:`, err.message);
  }
});
