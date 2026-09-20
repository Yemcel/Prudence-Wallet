import { Router } from "express";
import { createLinkToken, exchangePublicToken, syncAllPlaidItems, syncTransactionsForItem, getPlaidItemByItemId } from "../services/plaid.js";

export const plaidRouter = Router();

// GET /api/plaid/link-token — frontend calls this before opening Plaid Link
plaidRouter.get("/link-token", async (req, res) => {
  try {
    // Single-user prototype — swap "demo-user" for a real user id once you have auth
    const linkToken = await createLinkToken("demo-user");
    res.json({ linkToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/exchange — frontend sends the public_token Plaid Link returned
plaidRouter.post("/exchange", async (req, res) => {
  const { publicToken } = req.body;
  if (!publicToken) return res.status(400).json({ error: "publicToken is required" });

  try {
    const result = await exchangePublicToken(publicToken);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/sync — pull new transactions for every connected item.
// In production, call this from a scheduled job (or a Plaid webhook handler
// that fires on new transaction availability) rather than only on demand.
plaidRouter.post("/sync", async (req, res) => {
  try {
    const results = await syncAllPlaidItems();
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/plaid/webhook — Plaid calls this when new transactions are
// ready, which is what makes the nudges "near real-time" instead of
// depending on the user opening the app and hitting sync. Requires
// PLAID_WEBHOOK_URL to be set to a public HTTPS URL (see README).
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
