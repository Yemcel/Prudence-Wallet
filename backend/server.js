import "dotenv/config";
import express from "express";
import cors from "cors";
import { seedIfEmpty } from "./db/init.js";
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

app.use("/api/transactions", transactionsRouter);
app.use("/api/coach", coachRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/plaid", plaidRouter);
app.use("/api/paypal", paypalRouter);
app.use("/api/nudges", nudgesRouter);
app.use("/api/settings", settingsRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Prudence Wallet API running on http://localhost:${PORT}`);
});
