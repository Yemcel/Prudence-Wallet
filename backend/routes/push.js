import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import {
  getPublicKey,
  getPrefs,
  setPrefs,
  saveSubscription,
  removeSubscription,
  sendToUser,
  runScheduledJob,
} from "../services/push.js";

// --- Signed-in user's notification settings (mounted behind requireAuth) ---
export const pushRouter = Router();

// GET /api/push/config — what the settings card needs to draw itself.
pushRouter.get("/config", async (req, res) => {
  try {
    res.json({ publicKey: getPublicKey(), prefs: await getPrefs(req.userId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/subscribe — body: { subscription } from pushManager.subscribe()
pushRouter.post("/subscribe", async (req, res) => {
  try {
    await saveSubscription(req.userId, req.body.subscription);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/push/unsubscribe — body: { endpoint }
pushRouter.post("/unsubscribe", async (req, res) => {
  try {
    await removeSubscription(req.userId, req.body.endpoint);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/push/prefs — body: any of { nudges, weekly, daily } as booleans
pushRouter.put("/prefs", async (req, res) => {
  try {
    res.json({ prefs: await setPrefs(req.userId, req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/push/test — sends a test notification to this user's devices.
pushRouter.post("/test", async (req, res) => {
  try {
    const result = await sendToUser(req.userId, null, {
      title: "Prudence Wallet",
      body: "Notifications are working. You'll hear from us when something's worth your attention.",
      tag: "test",
    });
    if (result.skipped === "not-configured") {
      return res.status(503).json({ error: "Notifications aren't set up on the server yet (VAPID keys missing)" });
    }
    if (result.sent === 0) {
      return res.status(404).json({ error: "No device is subscribed yet — turn notifications on first" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Scheduled jobs (called by the GitHub Actions schedule, not by users) ---
// Protected by a shared secret in JOBS_SECRET, sent as "Authorization: Bearer <secret>".
export const jobsRouter = Router();

function secretMatches(given) {
  const expected = process.env.JOBS_SECRET?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/jobs/daily-reminder  |  POST /api/jobs/weekly-summary
jobsRouter.post("/:job", async (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!secretMatches(token)) return res.status(401).json({ error: "Not authorised" });

  try {
    const result = await runScheduledJob(req.params.job);
    console.log("Scheduled job:", JSON.stringify(result));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
