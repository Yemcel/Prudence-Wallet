import { Router } from "express";
import { db } from "../db/init.js";
import { classifyTransaction } from "../services/classify.js";
import { rankKeyFromLabel } from "../services/ranks.js";

export const coachRouter = Router();

// POST /api/coach/classify
// body: { transactionId, answer }
// Runs the transaction + user's explanation through the model, saves the
// resulting rank on the transaction, and persists any newly learned rule.
coachRouter.post("/classify", async (req, res) => {
  const { transactionId, answer } = req.body;
  if (!transactionId || !answer) {
    return res.status(400).json({ error: "transactionId and answer are required" });
  }

  const transaction = db.prepare("SELECT * FROM transactions WHERE id = ? AND user_id = ?").get(transactionId, req.userId);
  if (!transaction) return res.status(404).json({ error: "transaction not found" });

  const learnedRules = db
    .prepare("SELECT rule_text FROM learned_rules WHERE user_id = ? ORDER BY created_at DESC LIMIT 30")
    .all(req.userId)
    .map((r) => r.rule_text);

  let result;
  try {
    result = await classifyTransaction({ transaction, userAnswer: answer, learnedRules });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }

  const rankKey = rankKeyFromLabel(result.rank) || "needed";
  db.prepare("UPDATE transactions SET rank = ?, rank_source = 'coach' WHERE id = ?").run(rankKey, transactionId);

  if (result.learned_rule && result.learned_rule !== "null") {
    db.prepare("INSERT OR IGNORE INTO learned_rules (rule_text, user_id) VALUES (?, ?)").run(result.learned_rule, req.userId);
  }

  const updatedTransaction = db.prepare("SELECT * FROM transactions WHERE id = ?").get(transactionId);
  res.json({
    transaction: updatedTransaction,
    reasoning: result.reasoning,
    learnedRule: result.learned_rule !== "null" ? result.learned_rule : null,
  });
});

// GET /api/coach/rules — what the coach has learned so far
coachRouter.get("/rules", (req, res) => {
  const rows = db.prepare("SELECT rule_text, created_at FROM learned_rules WHERE user_id = ? ORDER BY created_at DESC").all(req.userId);
  res.json(rows);
});
