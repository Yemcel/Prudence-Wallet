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
  try {
    const { transactionId, answer } = req.body;
    if (!transactionId || !answer) {
      return res.status(400).json({ error: "transactionId and answer are required" });
    }

    const transaction = await db.get("SELECT * FROM transactions WHERE id = ? AND user_id = ?", [transactionId, req.userId]);
    if (!transaction) return res.status(404).json({ error: "transaction not found" });

    const learnedRuleRows = await db.all(
      "SELECT rule_text FROM learned_rules WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
      [req.userId]
    );
    const learnedRules = learnedRuleRows.map((r) => r.rule_text);

    let result;
    try {
      result = await classifyTransaction({ transaction, userAnswer: answer, learnedRules });
    } catch (err) {
      console.error("Coach classification failed:", err.message);
      return res.status(502).json({ error: err.message });
    }

    const rankKey = rankKeyFromLabel(result.rank) || "needed";
    await db.run("UPDATE transactions SET rank = ?, rank_source = 'coach' WHERE id = ?", [rankKey, transactionId]);

    if (result.learned_rule && result.learned_rule !== "null") {
      await db.run("INSERT OR IGNORE INTO learned_rules (rule_text, user_id) VALUES (?, ?)", [result.learned_rule, req.userId]);
    }

    const updatedTransaction = await db.get("SELECT * FROM transactions WHERE id = ?", [transactionId]);
    res.json({
      transaction: updatedTransaction,
      reasoning: result.reasoning,
      learnedRule: result.learned_rule !== "null" ? result.learned_rule : null,
    });
  } catch (err) {
    console.error("Coach classify route failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/coach/rules — what the coach has learned so far
coachRouter.get("/rules", async (req, res) => {
  try {
    const rows = await db.all("SELECT rule_text, created_at FROM learned_rules WHERE user_id = ? ORDER BY created_at DESC", [req.userId]);
    res.json(rows);
  } catch (err) {
    console.error("Fetching learned rules failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});
