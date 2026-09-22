import { db } from "../db/init.js";

// --- Honesty check before you build on this -------------------------------
// This is "near-real-time," not literal pre-purchase interception. It fires
// as soon as a transaction reaches the database — which, via a Plaid
// webhook, is typically within minutes of the purchase posting, and
// immediately for manual entries. True point-of-sale interception (stopping
// a charge before it completes) would require the app to *be* the payment
// method — issuing its own card via a program like Marqeta or Unit — which
// is a much larger, regulated undertaking. This is the realistic version.
// ---------------------------------------------------------------------

const DISCRETIONARY_HINTS = [
  "entertainment", "dining", "food and drink", "restaurant", "bar",
  "shopping", "travel", "game", "gaming", "subscription", "alcohol",
  "coffee", "delivery", "ride share", "rideshare",
];

const NUDGE_THRESHOLD = 3; // fires starting on the 3rd similar purchase within the trailing window
const WINDOW_DAYS = 7;

function looksDiscretionary(tx) {
  const haystack = `${tx.category || ""} ${tx.merchant || ""}`.toLowerCase();
  return DISCRETIONARY_HINTS.some((hint) => haystack.includes(hint));
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function money(amount, currency) {
  try {
    return amount.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
  } catch {
    return `${amount.toFixed(2)} ${currency || ""}`;
  }
}

// Call this right after ANY new transaction is inserted — from a Plaid sync,
// a PayPal sync, or a manual add. Cheap, deterministic, no API call needed
// (unlike the coach, which does call the model) — this only needs to be
// fast and reliable, not nuanced.
export function checkAndCreateNudge(tx) {
  if (!tx || !looksDiscretionary(tx)) return null;

  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const merchantKeyword = (tx.merchant || "").toLowerCase().split(" ")[0];

  const { count, total } = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM transactions
       WHERE date >= ? AND id != ? AND user_id = ?
         AND (
           (category IS NOT NULL AND LOWER(category) = LOWER(?))
           OR LOWER(merchant) LIKE ?
         )`
    )
    .get(windowStart, tx.id, tx.user_id, tx.category || "___none___", `%${merchantKeyword}%`);

  const occurrence = count + 1; // including this transaction
  if (occurrence < NUDGE_THRESHOLD) return null;

  const runningTotal = total + tx.amount;
  const message = `This is your ${ordinal(occurrence)} ${tx.category || "similar"} purchase this week — about ${money(
    runningTotal,
    tx.currency
  )} total. Still feel worth it, or is this one worth reconsidering?`;

  db.prepare("INSERT INTO nudges (transaction_id, message, user_id) VALUES (?, ?, ?)").run(tx.id, message, tx.user_id);
  return message;
}

export function getActiveNudges(userId) {
  return db
    .prepare(
      `SELECT n.*, t.merchant, t.amount, t.currency, t.date
       FROM nudges n
       JOIN transactions t ON t.id = n.transaction_id
       WHERE n.dismissed = 0 AND n.user_id = ?
       ORDER BY n.created_at DESC`
    )
    .all(userId);
}

export function dismissNudge(id, userId) {
  db.prepare("UPDATE nudges SET dismissed = 1 WHERE id = ? AND user_id = ?").run(id, userId);
}
