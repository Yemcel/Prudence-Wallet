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
    const result = await connectPaypalAccount({ clientId, clientSecret, label, userId: req.userId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
