import "dotenv/config";
import express from "express";
import cors from "cors";
import { seedIfEmpty } from "./db/init.js";
import { authRouter } from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";
import { transactionsRouter } from "./routes/transactions.js";
import { coachRouter } from "./routes/coach.js";
import { accountsRouter } from "./routes/accounts.js";
import { plaidRouter } from "./routes/plaid.js";
import { paypalRouter } from "./routes/paypal.js";
import { nudgesRouter } from "./routes/nudges.js";
import { settingsRouter } from "./routes/settings.js";

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);

app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/coach", requireAuth, coachRouter);
app.use("/api/accounts", requireAuth, accountsRouter);
// No router-level requireAuth here — /api/plaid/webhook is called directly
// by Plaid's servers, which can't send our bearer token. Auth is applied
// per-route inside routes/plaid.js instead.
app.use("/api/plaid", plaidRouter);
app.use("/api/paypal", requireAuth, paypalRouter);
app.use("/api/nudges", requireAuth, nudgesRouter);
app.use("/api/settings", requireAuth, settingsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Prudence Wallet API running on http://localhost:${PORT}`);
});
