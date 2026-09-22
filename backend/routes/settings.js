import { Router } from "express";
import { getHomeCurrency, setHomeCurrency, ensureFreshRates } from "../services/fx.js";

export const settingsRouter = Router();

settingsRouter.get("/", (req, res) => {
  res.json({ homeCurrency: getHomeCurrency(req.userId) });
});

settingsRouter.put("/", async (req, res) => {
  const { homeCurrency } = req.body;
  if (!homeCurrency || homeCurrency.length !== 3) {
    return res.status(400).json({ error: "homeCurrency must be a 3-letter ISO code, e.g. 'USD'" });
  }
  try {
    await ensureFreshRates(); // validates rates exist / are fetchable before committing to the new home currency
    setHomeCurrency(req.userId, homeCurrency.toUpperCase());
    res.json({ homeCurrency: homeCurrency.toUpperCase() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});
