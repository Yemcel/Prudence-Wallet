import { Router } from "express";
import { getActiveNudges, dismissNudge } from "../services/nudges.js";

export const nudgesRouter = Router();

// GET /api/nudges — active (not dismissed) nudges, most recent first.
// Frontend polls this on an interval to simulate "near real-time" without
// needing websockets for a prototype.
nudgesRouter.get("/", async (req, res) => {
  try {
    res.json(await getActiveNudges(req.userId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

nudgesRouter.patch("/:id/dismiss", async (req, res) => {
  try {
    await dismissNudge(req.params.id, req.userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
