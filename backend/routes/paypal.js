import { Router } from "express";
import { connectPaypalAccount, syncAllPaypalConnections } from "../services/paypal.js";

export const paypalRouter = Router();

// POST /api/paypal/connect
// body: { clientId, clientSecret, label }
// See the long comment at the top of services/paypal.js — this is a
// bring-your-own-credentials connection, not a "Login with PayPal" flow.
paypalRouter.post("/connect", async (req, res) => {
  const { clientId, clientSecret, label } = req.body;
  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: "clientId and clientSecret are required" });
  }
  try {
    const result = await connectPaypalAccount({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), label, userId: req.userId });
    res.json(result);
  } catch (err) {
    if (err.credentialsRejected) {
      return res.status(400).json({
        error: "PayPal didn't accept that Client ID and Secret. Check both were copied in full from a Live app (not Sandbox) in the PayPal Developer Dashboard, then try again.",
      });
    }
    // Couldn't reach PayPal, or PayPal itself failed.
    if (err.status) return res.status(502).json({ error: "PayPal isn't responding properly right now. Please try again in a few minutes." });
    console.error("PayPal connect failed:", err.message);
    res.status(500).json({ error: "Couldn't connect PayPal because of a problem on our side. Please try again later." });
  }
});

// POST /api/paypal/sync — pull new transactions for this user's connected PayPal accounts
paypalRouter.post("/sync", async (req, res) => {
  try {
    const results = await syncAllPaypalConnections(req.userId);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
