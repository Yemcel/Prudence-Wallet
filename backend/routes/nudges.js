import { Router } from "express";
import { getActiveNudges, dismissNudge } from "../services/nudges.js";

export const nudgesRouter = Router();

// GET /api/nudges — active (not dismissed) nudges, most recent first.
// Frontend polls this on an interval to simulate "near real-time" without
// needing websockets for a prototype.
nudgesRouter.get("/", (req, res) => {
  res.json(getActiveNudges(req.userId));
});

nudgesRouter.patch("/:id/dismiss", (req, res) => {
  dismissNudge(req.params.id, req.userId);
  res.json({ ok: true });
});
