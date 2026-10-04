import "dotenv/config";
import express from "express";
import cors from "cors";
import "./db/init.js"; // runs schema setup and migrations on boot
import { pruneOldEvents } from "./services/security.js";
import { captureConsoleErrors, trackServerErrors, pruneOpsEvents } from "./services/ops.js";

// From here on, anything logged with console.error is also emailed to the
// admin (batched and de-duplicated) — see services/ops.js.
captureConsoleErrors();
import { authRouter } from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";
import { transactionsRouter } from "./routes/transactions.js";
import { coachRouter } from "./routes/coach.js";
import { accountsRouter } from "./routes/accounts.js";
import { plaidRouter } from "./routes/plaid.js";
import { paypalRouter } from "./routes/paypal.js";
import { nudgesRouter } from "./routes/nudges.js";
import { settingsRouter } from "./routes/settings.js";
import { pushRouter, jobsRouter } from "./routes/push.js";

// Safety net: with no listener here, an unhandled promise rejection
// anywhere in the app (a route that forgot a try/catch, say) crashes the
// entire Node process by default — taking down every other in-flight
// request with it. Logging and continuing is far better for an API server.
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const app = express();
// Behind Render's proxy: lets req.ip be the visitor's address, not the proxy's.
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
// Any 5xx response becomes an admin alert.
app.use(trackServerErrors);

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
app.use("/api/push", requireAuth, pushRouter);
// Called by the notification schedule (.github/workflows/notifications.yml),
// authorised with JOBS_SECRET rather than a user token.
app.use("/api/jobs", jobsRouter);

// Drop security log entries older than 90 days, now and once a day.
const prune = () => Promise.all([pruneOldEvents(), pruneOpsEvents()]).catch((err) => console.error("Log prune failed:", err.message));
prune();
setInterval(prune, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Prudence Wallet API running on http://localhost:${PORT}`);
});
