import { Router } from "express";
import { getHomeCurrency, setHomeCurrency, ensureFreshRates, isSupportedCurrency } from "../services/fx.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (req, res) => {
  try {
    res.json({ homeCurrency: await getHomeCurrency(req.userId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

settingsRouter.put("/", async (req, res) => {
  const { homeCurrency } = req.body;
  if (!homeCurrency || homeCurrency.length !== 3) {
    return res.status(400).json({ error: "homeCurrency must be a 3-letter ISO code, e.g. 'USD'" });
  }
  const code = homeCurrency.toUpperCase();
  try {
    await ensureFreshRates(); // validates rates exist / are fetchable before committing to the new home currency
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
  // Refuse a currency there are no rates for, rather than saving it and
  // breaking every total that has to be converted into it.
  if (!isSupportedCurrency(code)) {
    return res.status(400).json({ error: `Exchange rates for ${code} aren't available, so it can't be used as the home currency yet.` });
  }
  try {
    await setHomeCurrency(req.userId, code);
    res.json({ homeCurrency: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
